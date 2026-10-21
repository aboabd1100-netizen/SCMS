from datetime import date
from decimal import Decimal
from sqlalchemy import select,func
from flask import g
from app.extensions import db
from app.models import *
from app.services.catalog import allowed,record,uid
from app.utils import validation as v
from app.utils.security import APIError,audit

RESERVED=('Pending','Confirmed','Processing','Ready for Shipment')


def reserved(pid,wid):
    return db.session.scalar(select(func.coalesce(func.sum(CustomerOrderItem.quantity),0)).join(CustomerOrder).where(CustomerOrder.status.in_(RESERVED),CustomerOrderItem.product_id==pid,CustomerOrderItem.warehouse_id==wid))


def stock(pid,wid):
    return db.session.scalar(select(Inventory).where(Inventory.product_id==pid,Inventory.warehouse_id==wid))


def available(pid,wid):
    row=stock(pid,wid)
    return (row.current_stock if row else 0)-reserved(pid,wid)


def set_stock(pid,wid,quantity):
    p=record(Product,pid);w=record(Warehouse,wid)
    if quantity<0 or quantity<reserved(pid,wid):raise APIError('Stock cannot be below reserved quantities.','لا يمكن أن يقل المخزون عن الكميات المحجوزة.')
    row=stock(pid,wid)
    if not row:row=Inventory(product_id=pid,warehouse_id=wid,current_stock=0,minimum_stock_level=p.minimum_stock_level);db.session.add(row)
    used=db.session.scalar(select(func.coalesce(func.sum(Inventory.current_stock),0)).where(Inventory.warehouse_id==wid))
    if used-row.current_stock+quantity>w.capacity:raise APIError('Warehouse capacity exceeded.','تم تجاوز سعة المستودع.')
    before=row.current_stock
    total_before=db.session.scalar(select(func.coalesce(func.sum(Inventory.current_stock),0)).where(Inventory.product_id==pid))
    row.current_stock=quantity
    if before!=quantity:db.session.add(InventoryMovement(product_id=pid,warehouse_id=wid,user_id=g.user.id,quantity_before=before,quantity_after=quantity))
    db.session.flush()
    if total_before==0 and quantity>before:
        from .notifications import notify
        for u in db.session.scalars(select(User).join(Role).where(Role.name=='Customer',User.status=='Active')):
            if u.preferences.get('inventory',True):notify(u,'restock:'+pid+':'+utcnow().isoformat(),'Product back in stock',f'{p.name_en} is back in stock.',f'{p.name_ar} متوفر مجددًا.','good','catalog.html')


def status(row,value):
    row.status=value
    row.history=[*row.history,{'status':value,'at':utcnow().isoformat()}]


def offer_active(o):return o.enabled and o.start_date<=date.today()<=o.end_date


def quote(items,code=''):
    subtotal=sum(i['price']*i['qty'] for i in items);discount=Decimal(0);shipping=Decimal(25);offer=None
    if code:
        offer=db.session.scalar(select(Offer).where(Offer.promo_code==code.strip().upper()))
        if not offer or not offer_active(offer):raise APIError('This promotion is not active.','هذا العرض غير نشط.')
        ids={p.id for p in offer.products};eligible=[i for i in items if i['productId'] in ids]
        if sum(i['qty'] for i in eligible)<offer.minimum_quantity:raise APIError('The minimum eligible quantity has not been reached.','لم يتم بلوغ الحد الأدنى للكمية المؤهلة.')
        if offer.discount_type=='Free Shipping':shipping=Decimal(0)
        else:discount=sum(i['price']*i['qty'] for i in eligible)*offer.discount_value/100
    discount=discount.quantize(Decimal('.01'));subtotal=subtotal.quantize(Decimal('.01'))
    return dict(subtotal=subtotal,discount=discount,shipping=shipping,total_amount=subtotal-discount+shipping,offer_id=offer.id if offer else None)


def create_order(data):
    allowed('orders')
    customer=g.user if g.user.role.name=='Customer' else record(User,data.get('userId'))
    if customer.role.name!='Customer' or customer.status!='Active':raise APIError('Select an active customer.','اختر عميلًا نشطًا.')
    address=v.text(data,'address',400);code=v.text(data,'code',24,False)
    lines=data.get('items');items=[];sums={}
    if not isinstance(lines,list) or not 1<=len(lines)<=100:raise APIError('Add order items.','أضف أصناف الطلب.')
    for line in lines:
        if not isinstance(line,dict):raise APIError('Invalid order item.')
        p=record(Product,line.get('productId'));w=record(Warehouse,line.get('warehouseId'));qty=v.number(line,'qty',1,1000000,True)
        if not p.active or w.status!='Operational':raise APIError('Product or warehouse unavailable.','المنتج أو المستودع غير متاح.')
        items.append({'productId':p.id,'warehouseId':w.id,'qty':qty,'price':p.price});key=(p.id,w.id);sums[key]=sums.get(key,0)+qty
    for (pid,wid),qty in sums.items():
        if qty>available(pid,wid):raise APIError('Requested quantity exceeds available stock.','الكمية المطلوبة تتجاوز المخزون المتاح.')
    id=uid('CO');row=CustomerOrder(id=id,order_number=id,customer_id=customer.id,address=address,promo_code=code.upper(),order_date=date.today(),status='Pending',history=[{'status':'Pending','at':utcnow().isoformat()}],**quote(items,code))
    row.items=[CustomerOrderItem(product_id=i['productId'],warehouse_id=i['warehouseId'],quantity=i['qty'],price=i['price']) for i in items];db.session.add(row);db.session.flush();audit('New Customer Order','orders',id,'Customer order submitted');return row


def update_order(id,value):
    allowed('orders');row=record(CustomerOrder,id)
    if g.user.role.name=='Customer' and (row.customer_id!=g.user.id or row.status!='Pending' or value!='Cancelled'):raise APIError('Only your pending orders can be cancelled.','يمكن إلغاء طلباتك المعلقة فقط.',403)
    flow={'Pending':['Confirmed','Cancelled'],'Confirmed':['Processing','Cancelled'],'Processing':['Ready for Shipment','Cancelled'],'Ready for Shipment':['Cancelled']}
    if value not in flow.get(row.status,[]) or db.session.scalar(select(Shipment.id).where(Shipment.customer_order_id==id)):raise APIError('Invalid order transition.','انتقال حالة الطلب غير صالح.')
    status(row,value);audit('Order '+value,'orders',id,'Order status updated');return row


def create_po(data):
    allowed('purchase-orders')
    if g.user.role.name=='Supplier':raise APIError('Access denied.','الوصول غير مسموح.',403)
    supplier=record(Supplier,data.get('supplierId'));w=record(Warehouse,data.get('warehouseId'));p=record(Product,data.get('productId'));qty=v.number(data,'qty',1,1000000,True);expected=v.day(data,'expected')
    if supplier.status!='Active' or p.supplier_id!=supplier.id or w.status!='Operational' or expected<date.today():raise APIError('Invalid procurement details.','بيانات الشراء غير صالحة.')
    value=v.choice(data,'status',('Draft','Pending Approval'));id=uid('PO');row=PurchaseOrder(id=id,po_number=id,supplier_id=supplier.id,warehouse_id=w.id,order_date=date.today(),expected_date=expected,total_amount=p.unit_cost*qty,status=value,created_by=g.user.id,history=[{'status':value,'at':utcnow().isoformat()}]);row.items=[PurchaseOrderItem(product_id=p.id,quantity=qty,unit_cost=p.unit_cost)];db.session.add(row);db.session.flush();audit('Purchase Order created','purchase-orders',id,'Purchase order created');return row


def receive_po(row):
    if row.status not in ('Approved','Ordered','Shipped'):raise APIError('This purchase order cannot be received.','لا يمكن استلام أمر الشراء.')
    for i in row.items:
        inv=stock(i.product_id,row.warehouse_id);set_stock(i.product_id,row.warehouse_id,(inv.current_stock if inv else 0)+i.quantity)
    status(row,'Received');audit('Purchase Order Received','purchase-orders',row.id,'Inventory receipt posted')


def update_po(id,value):
    allowed('purchase-orders');row=record(PurchaseOrder,id);role=g.user.role.name
    if role=='Supplier':raise APIError('Access denied.','الوصول غير مسموح.',403)
    flow={'Draft':['Pending Approval','Cancelled'],'Pending Approval':['Approved','Cancelled'],'Approved':['Ordered','Cancelled'],'Ordered':['Shipped','Received','Cancelled'],'Shipped':['Received']}
    if value not in flow.get(row.status,[]):raise APIError('Invalid purchase order transition.','انتقال حالة أمر الشراء غير صالح.')
    if value=='Approved' and role not in ('Admin','Manager'):raise APIError('Manager approval required.','يلزم اعتماد المدير.',403)
    shipment=db.session.scalar(select(Shipment).where(Shipment.purchase_order_id==id))
    if shipment and value!='Received':raise APIError('Update the linked shipment.','حدّث الشحنة المرتبطة.')
    if value=='Received':
        receive_po(row)
        if shipment and shipment.status!='Delivered':shipment.status='Delivered';shipment.last_update=utcnow();shipment.events.append(ShipmentTrackingEvent(status='Delivered'))
    else:status(row,value);audit('Purchase Order '+value,'purchase-orders',id,'Purchase order status updated')
    return row


def create_shipment(data):
    allowed('shipments');order=record(CustomerOrder,data['orderId']) if data.get('orderId') else None;po=record(PurchaseOrder,data['poId']) if data.get('poId') else None
    if bool(order)==bool(po) or (order and order.status!='Ready for Shipment') or (po and po.status!='Ordered'):raise APIError('Select a ready order or ordered purchase order.','اختر طلبًا جاهزًا للشحن أو أمر شراء بحالة تم الطلب.')
    departure=v.day(data,'departure');eta=v.day(data,'eta')
    if eta<departure:raise APIError('ETA cannot be before departure.','لا يمكن أن يسبق الوصول تاريخ المغادرة.')
    id=uid('SHP');origin=' / '.join(dict.fromkeys(record(Warehouse,i.warehouse_id).name for i in order.items)) if order else record(Supplier,po.supplier_id).name
    row=Shipment(id=id,tracking_number=id,customer_order_id=order.id if order else None,purchase_order_id=po.id if po else None,carrier=v.text(data,'carrier',120),origin=origin,destination=order.address if order else record(Warehouse,po.warehouse_id).name,departure_date=departure,estimated_delivery=eta,status='Preparing');row.events=[ShipmentTrackingEvent(status='Preparing')];db.session.add(row);db.session.flush();audit('Shipment created','shipments',id,'Shipment prepared');return row


def update_shipment(id,value,eta=None):
    allowed('shipments');row=db.session.scalar(select(Shipment).where(Shipment.tracking_number==id))
    if not row:raise APIError('Shipment not found.','الشحنة غير موجودة.',404)
    flow={'Preparing':['Picked Up','In Transit'],'Picked Up':['In Transit','Delayed'],'In Transit':['At Destination','Delayed','Delivered'],'At Destination':['Delivered','Delayed'],'Delayed':['In Transit','At Destination','Delivered']}
    if value not in flow.get(row.status,[]):raise APIError('Invalid shipment transition.','انتقال حالة الشحنة غير صالح.')
    if eta:
        eta=v.day({'eta':eta},'eta')
        if eta<row.departure_date:raise APIError('ETA cannot be before departure.')
        row.estimated_delivery=eta
    order=db.session.get(CustomerOrder,row.customer_order_id) if row.customer_order_id else None;po=db.session.get(PurchaseOrder,row.purchase_order_id) if row.purchase_order_id else None
    if row.status=='Preparing':
        if order:
            # Release this order's reservation and decrement physical stock atomically.
            status(order,'Shipped');db.session.flush()
            for i in order.items:set_stock(i.product_id,i.warehouse_id,stock(i.product_id,i.warehouse_id).current_stock-i.quantity)
        if po:status(po,'Shipped')
    row.status=value;row.last_update=utcnow();row.events.append(ShipmentTrackingEvent(status=value))
    if value=='Delivered':
        if order:status(order,'Delivered')
        if po:receive_po(po)
    audit('Shipment '+value,'shipments',id,'Shipment status updated');return row


def transfer(data):
    allowed('inventory');p=record(Product,data.get('productId'));source=record(Warehouse,data.get('from'));target=record(Warehouse,data.get('to'));qty=v.number(data,'qty',1,1000000,True)
    if source.id==target.id or source.status!='Operational' or target.status!='Operational' or qty>available(p.id,source.id):raise APIError('Invalid stock transfer.','تحويل المخزون غير صالح.')
    set_stock(p.id,source.id,stock(p.id,source.id).current_stock-qty);inv=stock(p.id,target.id);set_stock(p.id,target.id,(inv.current_stock if inv else 0)+qty)
    row=StockTransfer(id=uid('TRF'),product_id=p.id,from_id=source.id,to_id=target.id,quantity=qty);db.session.add(row);audit('Stock transfer','inventory',p.id,'Stock moved between warehouses');return row
