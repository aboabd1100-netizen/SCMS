from functools import wraps
from datetime import date
from sqlalchemy import select,func
from sqlalchemy.exc import IntegrityError
from flask import Blueprint,request,jsonify,g
from app.extensions import db,limiter
from app.models import *
from app.utils.security import authorize,APIError,audit,PERMISSIONS
from app.utils import validation as v
from app.services.serialization import RESOURCES,serialize,iso,pair
from app.services.catalog import save,record,allowed
from app.services import workflows as flow
from app.services.notifications import refresh_notifications

api=Blueprint('api',__name__,url_prefix='/api')


def ok(data=None,status=200):return jsonify(success=True,data=data),status


def mutation(fn):
    @wraps(fn)
    def wrapped(*args,**kwargs):
        # A database transaction serializes stock-dependent writes across workers/browsers.
        state=db.session.scalar(select(AppState).where(AppState.id==1).with_for_update())
        if not state:raise APIError('Database initialization is required.','يلزم تهيئة قاعدة البيانات.',503)
        try:
            result=fn(*args,**kwargs);db.session.flush();refresh_notifications();state.revision+=1
            total=db.session.scalar(select(func.coalesce(func.sum(Inventory.current_stock),0)))
            last=db.session.scalar(select(InventorySnapshot).order_by(InventorySnapshot.id.desc()).limit(1))
            if not last or last.quantity!=total:db.session.add(InventorySnapshot(quantity=total))
            db.session.commit();return result
        except IntegrityError:
            db.session.rollback();raise APIError('A duplicate code or related record prevents this change.','يوجد رمز مكرر أو سجل مرتبط يمنع التغيير.',409)
    return wrapped


def scoped(module):
    model=RESOURCES[module];q=select(model)
    role=g.user.role.name
    if role=='Customer':
        if module=='users':q=q.where(User.id==g.user.id)
        elif module=='orders':q=q.where(CustomerOrder.customer_id==g.user.id)
        elif module=='shipments':q=q.join(CustomerOrder).where(CustomerOrder.customer_id==g.user.id)
        elif module=='notifications':q=q.where(Notification.user_id==g.user.id)
        elif module=='products':q=q.where(Product.active.is_(True))
        elif module not in ('warehouses','inventory','offers','suppliers'):raise APIError('Access denied.','الوصول غير مسموح.',403)
    elif module=='notifications':q=q.where(Notification.user_id==g.user.id)
    elif role=='Supplier':
        if module=='suppliers':q=q.where(Supplier.email==g.user.email)
        elif module in ('products','purchase-orders'):q=q.join(Supplier).where(Supplier.email==g.user.email)
        elif module=='inventory':q=q.join(Product).join(Supplier).where(Supplier.email==g.user.email)
        elif module=='users':q=q.where(User.id==g.user.id)
        elif module!='warehouses':raise APIError('Access denied.',status=403)
    return list(db.session.scalars(q))


def public_state():
    offers=list(db.session.scalars(select(Offer).where(Offer.enabled.is_(True),Offer.start_date<=date.today(),Offer.end_date>=date.today()).order_by(Offer.created_at)))
    products=[{'id':p.id,'name':pair(p.name_en,p.name_ar)} for p in db.session.scalars(select(Product).where(Product.active.is_(True)))]
    state=db.session.get(AppState,1)
    return {'version':3,'revision':state.revision if state else 0,'settings':{'company':'SCMS','currency':'SAR'},'users':[],'warehouses':[],'suppliers':[],'products':products,'stock':[],'orders':[],'purchaseOrders':[],'shipments':[],'offers':[serialize(o) for o in offers],'notifications':[],'events':[],'read':{},'transfers':[],'snapshots':[]}


@api.get('/state')
def state():
    if not g.user:return ok(public_state())
    row=db.session.get(AppState,1);result={'version':3,'revision':row.revision,'settings':row.settings,'read':{},'transfers':[],'snapshots':[],'events':[]}
    for module,key in [('users','users'),('warehouses','warehouses'),('suppliers','suppliers'),('products','products'),('inventory','stock'),('purchase-orders','purchaseOrders'),('orders','orders'),('shipments','shipments'),('offers','offers'),('notifications','notifications')]:
        if g.user.role.name=='Customer' and module=='purchase-orders':result[key]=[];continue
        if g.user.role.name not in ('Admin','Manager','Customer') and module not in ('users','warehouses','inventory','products','notifications') and g.user.role.name not in PERMISSIONS.get(module,set()):result[key]=[];continue
        rows=scoped(module)
        if module=='users' and g.user.role.name not in ('Admin','Manager'):
            rows=[g.user];result[key]=[serialize(g.user)];continue
        if module=='offers':rows.sort(key=lambda o:o.created_at)
        if module in ('orders','purchase-orders','shipments','notifications'):rows.sort(key=lambda o:o.created_at,reverse=True)
        result[key]=[serialize(x) for x in rows]
    if g.user.role.name=='Customer':
        for p in result['products']:p.pop('cost',None)
        result['suppliers']=[{'id':s.id,'name':s.name,'status':s.status} for s in db.session.scalars(select(Supplier))]
    elif g.user.role.name not in ('Admin','Manager'):
        if g.user.role.name != 'Supplier':
            result['suppliers']=[{'id':s.id,'name':s.name,'status':s.status} for s in db.session.scalars(select(Supplier))]
        ids={o['userId'] for o in result['orders']}
        result['users'] += [{'id':u.id,'name':u.full_name,'role':'Customer','status':u.status} for u in db.session.scalars(select(User).where(User.id.in_(ids),User.id!=g.user.id))]
    if g.user.role.name in ('Admin','Manager'):
        logs=db.session.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(100))
        result['events']=[{'id':str(e.id),'at':iso(e.timestamp),'type':e.action,'message':pair(e.description,e.description),'admin':True,'userId':e.user_id} for e in logs]
        result['snapshots']=[{'at':iso(s.timestamp),'qty':s.quantity} for s in db.session.scalars(select(InventorySnapshot).order_by(InventorySnapshot.id).limit(500))]
        result['transfers']=[{'id':s.id,'productId':s.product_id,'from':s.from_id,'to':s.to_id,'qty':s.quantity,'at':iso(s.timestamp)} for s in db.session.scalars(select(StockTransfer))]
    return ok(result)


@api.get('/shipments/track/<tracking>')
@limiter.limit('30 per minute')
def track(tracking):
    import re
    if not re.fullmatch(r'[A-Za-z0-9_-]{3,50}',tracking):raise APIError('Tracking number not found. Please check the number and try again.','رقم التتبع غير موجود. يرجى التحقق من الرقم والمحاولة مرة أخرى.',404)
    row=db.session.scalar(select(Shipment).where(Shipment.tracking_number==tracking.upper()))
    if not row:raise APIError('Tracking number not found. Please check the number and try again.','رقم التتبع غير موجود. يرجى التحقق من الرقم والمحاولة مرة أخرى.',404)
    result=serialize(row)
    # Only city-level public endpoints, never addresses, customer/order IDs or admin notes.
    from app.services.public_tracking import public_location
    return ok({'id':row.tracking_number,'trackingNumber':row.tracking_number,'status':row.status,'origin':public_location(row.origin),'destination':public_location(row.destination),'carrier':row.carrier,'eta':iso(row.estimated_delivery),'lastUpdate':iso(row.last_update),'history':[{'status':e.status,'at':iso(e.timestamp)} for e in row.events]})


@api.route('/<module>',methods=['GET','POST'])
@api.route('/<module>/<id>',methods=['GET','PUT','DELETE'])
@authorize()
def resource(module,id=None):
    if module not in RESOURCES:raise APIError('Route not found.',status=404)
    if request.method=='GET':
        if module not in ('orders','shipments','offers','products','warehouses','inventory','notifications') or g.user.role.name!='Customer':allowed(module) if module!='notifications' else None
        rows=scoped(module)
        if id:
            rows=[x for x in rows if str(x.id)==id]
            if not rows:raise APIError('Record not found.',status=404)
            return ok(serialize(rows[0]))
        return ok([serialize(x) for x in rows])
    return mutate_resource(module,id)


@mutation
def mutate_resource(module,id):
    data=request.get_json(silent=True) or {}
    if g.user.role.name=='Supplier':raise APIError('Access denied.','الوصول غير مسموح.',403)
    if request.method=='DELETE':
        allowed(module)
        if module not in ('users','warehouses','suppliers','products','offers'):raise APIError('Workflow records cannot be deleted; cancel or disable them.')
        row=record(RESOURCES[module],id)
        if module=='users':
            data=serialize(row);data['status']='Inactive';save('users',data,id);return ok()
        db.session.delete(row);audit('Deleted',module,id,'Record deleted');db.session.flush();return ok()
    if module in ('users','warehouses','suppliers','products','offers'):row=save(module,data,id)
    elif module=='orders':row=flow.update_order(id,data.get('status')) if id else flow.create_order(data)
    elif module=='purchase-orders':row=flow.update_po(id,data.get('status')) if id else flow.create_po(data)
    elif module=='shipments':row=flow.update_shipment(id,data.get('status'),data.get('eta')) if id else flow.create_shipment(data)
    elif module=='inventory':
        allowed('inventory')
        if id:
            try:inv=record(Inventory,int(id))
            except ValueError:raise APIError('Inventory record not found.',status=404)
            pid,wid=inv.product_id,inv.warehouse_id
        else:pid=v.text(data,'productId',50);wid=v.text(data,'warehouseId',50)
        qty=v.number(data,'qty',0,100000000,True);v.text(data,'reason',500);flow.set_stock(pid,wid,qty);audit('Inventory updated','inventory',pid,'Stock quantity adjusted');row=flow.stock(pid,wid)
    else:raise APIError('Unsupported action.')
    return ok(serialize(row),200 if id else 201)


@api.post('/editor/<kind>')
@authorize()
@mutation
def editor(kind):
    data=request.get_json(silent=True) or {};id=data.pop('id',None) or None
    if kind=='stock':
        allowed('inventory');flow.set_stock(id,data.get('warehouseId'),v.number(data,'qty',0,100000000,True));v.text(data,'reason',500);audit('Inventory updated','inventory',id,'Stock quantity adjusted');return ok()
    if kind=='po':return ok(serialize(flow.create_po(data)),201)
    module={'product':'products','supplier':'suppliers','warehouse':'warehouses','offer':'offers','user':'users'}.get(kind)
    if not module:raise APIError('Unsupported editor.')
    if kind in ('product','offer'):
        data['name']={'en':data.get('en'),'ar':data.get('ar')};data['description']={'en':data.get('descriptionEn'),'ar':data.get('descriptionAr')}
    if kind=='product':data['active']=data.get('active')=='true'
    if kind=='offer':data['enabled']=data.get('enabled')=='true'
    row=save(module,data,id)
    if kind=='product' and not id:flow.set_stock(row.id,data.get('warehouseId'),v.number(data,'qty',0,100000000,True))
    return ok(serialize(row),200 if id else 201)


@api.post('/inventory/transfer')
@authorize('inventory')
@mutation
def transfer():flow.transfer(request.get_json(silent=True) or {});return ok()


@api.put('/profile')
@authorize()
@mutation
def profile():
    data=request.get_json(silent=True) or {};u=g.user
    address = v.email(data)
    # Supplier ownership is assigned by an administrator using the account email.
    if u.role.name == 'Supplier' and address != u.email:
        raise APIError('Contact an administrator to change your supplier account email.',status=403)
    u.full_name=v.text(data,'name',100);u.email=address;u.phone=v.phone(data);u.address=v.text(data,'address',400);u.language=v.choice(data,'language',('en','ar'))
    u.preferences={k:bool(data.get(k)) for k in ('orders','shipments','offers','inventory')};audit('Profile updated','user',u.id,'Account profile updated');return ok(serialize(u))


@api.put('/settings')
@authorize('settings')
@mutation
def settings():
    data=request.get_json(silent=True) or {};row=db.session.get(AppState,1);row.settings={'company':v.text(data,'company',100),'currency':'SAR','capacityWarning':v.number(data,'capacityWarning',50,100,True),'stockWarningPercent':v.number(data,'stockWarningPercent',100,200,True)};audit('Settings updated','settings','1','System settings updated');return ok(row.settings)


@api.post('/notifications/read')
@authorize()
@mutation
def read():
    data=request.get_json(silent=True) or {};ids=data.get('ids',[])
    if not isinstance(ids,list) or len(ids)>5000 or any(not isinstance(id,str) or not 1 <= len(id) <= 80 for id in ids):raise APIError('Invalid notification selection.')
    for n in db.session.scalars(select(Notification).where(Notification.user_id==g.user.id,Notification.id.in_(ids))):n.is_read=True
    return ok()


@api.get('/reports')
@authorize('reports')
def reports():
    return ok({'totalInventory':db.session.scalar(select(func.coalesce(func.sum(Inventory.current_stock),0))),'activeShipments':db.session.scalar(select(func.count(Shipment.id)).where(Shipment.status!='Delivered')),'delayedShipments':db.session.scalar(select(func.count(Shipment.id)).where(Shipment.status=='Delayed')),'pendingOrders':db.session.scalar(select(func.count(CustomerOrder.id)).where(CustomerOrder.status=='Pending'))})


@api.get('/public/summary')
def public_summary():
    total=db.session.scalar(select(func.coalesce(func.sum(Inventory.current_stock),0)))
    delivered=db.session.scalar(select(func.count(Shipment.id)).where(Shipment.status=='Delivered'))
    on_time=db.session.scalar(select(func.count(Shipment.id)).where(Shipment.status=='Delivered',func.date(Shipment.last_update)<=Shipment.estimated_delivery))
    used=db.session.scalar(select(func.coalesce(func.sum(Warehouse.capacity),0)))
    return ok({'warehouses':db.session.scalar(select(func.count(Warehouse.id))),'activeShipments':db.session.scalar(select(func.count(Shipment.id)).where(Shipment.status!='Delivered')),'totalInventory':total,'suppliers':db.session.scalar(select(func.count(Supplier.id))),'onTime':round(on_time/max(1,delivered)*100,1),'warehouseUtilization':round(total/max(1,used)*100,1),'supplierPerformance':float(db.session.scalar(select(func.coalesce(func.avg(Supplier.on_time_delivery_score),0)))),'network':[{'name':w.name,'city':w.city,'capacity':w.capacity,'status':w.status} for w in db.session.scalars(select(Warehouse).order_by(Warehouse.name))],'snapshots':[{'at':iso(s.timestamp),'qty':s.quantity} for s in db.session.scalars(select(InventorySnapshot).order_by(InventorySnapshot.id.desc()).limit(100))][::-1]})


@api.get('/audit')
@authorize(roles=('Admin',))
def audit_logs():return ok([{'id':x.id,'action':x.action,'entityType':x.entity_type,'entityId':x.entity_id,'description':x.description,'timestamp':iso(x.timestamp)} for x in db.session.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(500))])
