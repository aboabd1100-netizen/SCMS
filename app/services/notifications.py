from datetime import date,timedelta
from sqlalchemy import select,func
from app.extensions import db
from app.models import *
from .catalog import uid
from .workflows import offer_active


def notify(user,key,type,en,ar,severity='gray',href='notifications.html'):
    n=db.session.scalar(select(Notification).where(Notification.user_id==user.id,Notification.dedup_key==key))
    if not n:n=Notification(id=uid('NTF'),user_id=user.id,dedup_key=key,type=type,message_en=en,message_ar=ar,severity=severity,href=href);db.session.add(n)
    elif n.message_en!=en or n.type!=type:n.message_en=en;n.message_ar=ar;n.type=type;n.is_read=False;n.severity=severity;n.created_at=utcnow()


def refresh_notifications():
    users=list(db.session.scalars(select(User).where(User.status=='Active')))
    products=list(db.session.scalars(select(Product)));warehouses=list(db.session.scalars(select(Warehouse)));shipments=list(db.session.scalars(select(Shipment)));offers=list(db.session.scalars(select(Offer)))
    settings=db.session.get(AppState,1).settings
    for u in users:
        active=set();ops=u.role.name!='Customer'
        if u.role.name in ('Admin','Manager','Warehouse Staff'):
            for p in products:
                qty=db.session.scalar(select(func.coalesce(func.sum(Inventory.current_stock),0)).where(Inventory.product_id==p.id));state='Out of Stock' if qty<=0 else 'Low Stock' if qty<=p.minimum_stock_level else None
                if state:
                    key='stock:'+p.id;active.add(key);notify(u,key,state,f'{p.name_en}: {qty} units. Minimum: {p.minimum_stock_level}.',f'{p.name_ar}: {qty} وحدة. الحد الأدنى: {p.minimum_stock_level}.','bad' if qty<=0 else 'warn','inventory.html')
            for w in warehouses:
                qty=db.session.scalar(select(func.coalesce(func.sum(Inventory.current_stock),0)).where(Inventory.warehouse_id==w.id));percent=round(qty/max(1,w.capacity)*100)
                if percent>=settings['capacityWarning']:
                    key='capacity:'+w.id;active.add(key);notify(u,key,'Warehouse Capacity Warning',f'{w.name}: {percent}% full.',f'{w.name}: نسبة الاستخدام {percent}%.','warn','warehouses.html')
        for s in shipments:
            order=db.session.get(CustomerOrder,s.customer_order_id) if s.customer_order_id else None
            if u.role.name == 'Supplier':continue
            if not ops and (not order or order.customer_id!=u.id):continue
            if s.status=='Delayed':
                key='delay:'+s.id;active.add(key);notify(u,key,'Shipment Delayed',f'{s.tracking_number}: delayed. ETA {s.estimated_delivery}.',f'{s.tracking_number}: متأخرة. الوصول المتوقع {s.estimated_delivery}.','warn','shipments.html' if ops else 'tracking.html')
            elif not ops and u.preferences.get('shipments',True):notify(u,'shipment:'+s.id+':'+s.status,'Shipment updated',f'{s.tracking_number}: {s.status}.',f'{s.tracking_number}: تم تحديث حالة الشحنة.','good','tracking.html')
        if not ops:
            for o in offers:
                if offer_active(o) and u.preferences.get('offers',True):
                    type='Offer Expiring' if o.end_date<=date.today()+timedelta(days=3) else 'New promotion available';key='offer:'+o.id;active.add(key);notify(u,key,type,f'{o.name_en} · {o.promo_code}',f'{o.name_ar} · {o.promo_code}','good','offers.html')
            for o in db.session.scalars(select(CustomerOrder).where(CustomerOrder.customer_id==u.id)):
                if u.preferences.get('orders',True):notify(u,'order:'+o.id+':'+o.status,'Order updated',f'{o.order_number}: {o.status}.',f'{o.order_number}: تم تحديث حالة الطلب.','good','orders.html')
        elif u.role.name in ('Admin','Manager','Warehouse Staff'):
            for o in db.session.scalars(select(CustomerOrder).where(CustomerOrder.status=='Pending')):notify(u,'new-order:'+o.id,'New Customer Order',f'{o.order_number}: new customer order.',f'{o.order_number}: طلب عميل جديد.','good','customer-orders.html')
            if u.role.name in ('Admin','Manager'):
                for po in db.session.scalars(select(PurchaseOrder).where(PurchaseOrder.status.in_(('Pending Approval','Received')))):
                    type='Purchase Order Approval' if po.status=='Pending Approval' else 'Purchase Order Received'
                    notify(u,'po:'+po.id+':'+po.status,type,f'{po.po_number}: {po.status}.',f'{po.po_number}: تم تحديث حالة أمر الشراء.','good','purchase-orders.html')
        if u.role.name in ('Admin', 'Manager', 'Supplier'):
            suppliers = db.session.scalars(select(Supplier))
            for supplier in suppliers:
                if u.role.name == 'Supplier' and supplier.email != u.email:continue
                notify(u,'supplier:'+supplier.id,'Supplier Update',f'{supplier.name}: {supplier.status}.',f'{supplier.name}: {supplier.status}.','gray','suppliers.html')
        for n in db.session.scalars(select(Notification).where(Notification.user_id==u.id)):
            if n.dedup_key.startswith(('stock:','capacity:','delay:','offer:')) and n.dedup_key not in active:db.session.delete(n)
