from datetime import date, datetime
from decimal import Decimal
from app.models import *
from app.routes.auth import user_json
from flask import g

RESOURCES={'users':User,'warehouses':Warehouse,'suppliers':Supplier,'products':Product,'inventory':Inventory,'purchase-orders':PurchaseOrder,'orders':CustomerOrder,'shipments':Shipment,'offers':Offer,'notifications':Notification}


def iso(value):return value.isoformat() if value else None
def pair(en,ar):return {'en':en,'ar':ar}


def serialize(x):
    if isinstance(x,User):return user_json(x)
    if isinstance(x,Warehouse):return {'id':x.id,'name':x.name,'location':x.city,'capacity':x.capacity,'status':x.status,'staff':x.staff}
    if isinstance(x,Supplier):return {'id':x.id,'name':x.name,'contact':x.contact_name,'phone':x.phone,'email':x.email,'category':x.category,'region':x.region,'status':x.status,'onTime':float(x.on_time_delivery_score),'quality':float(x.quality_score)}
    if isinstance(x,Product):
        result = {'id':x.id,'name':pair(x.name_en,x.name_ar),'description':pair(x.description_en,x.description_ar),'sku':x.sku,'category':x.category,'price':float(x.price),'min':x.minimum_stock_level,'supplierId':x.supplier_id,'active':x.active,'icon':x.icon}
        if g.get('user') and g.user.role.name != 'Customer':
            result['cost'] = float(x.unit_cost)
        return result
    if isinstance(x,Inventory):
        from .workflows import reserved
        held=reserved(x.product_id,x.warehouse_id)
        return {'id':x.id,'productId':x.product_id,'warehouseId':x.warehouse_id,'qty':x.current_stock,'minimumStockLevel':x.minimum_stock_level,'status':x.status,'reservedQty':held,'availableQty':x.current_stock-held}
    if isinstance(x,PurchaseOrder):return {'id':x.id,'supplierId':x.supplier_id,'warehouseId':x.warehouse_id,'date':iso(x.order_date),'expected':iso(x.expected_date),'status':x.status,'history':x.history,'items':[{'productId':i.product_id,'qty':i.quantity,'cost':float(i.unit_cost)} for i in x.items]}
    if isinstance(x,CustomerOrder):return {'id':x.id,'userId':x.customer_id,'date':iso(x.order_date),'status':x.status,'history':x.history,'address':x.address,'code':x.promo_code,'offerId':x.offer_id,'subtotal':float(x.subtotal),'discount':float(x.discount),'shipping':float(x.shipping),'total':float(x.total_amount),'items':[{'productId':i.product_id,'warehouseId':i.warehouse_id,'qty':i.quantity,'price':float(i.price)} for i in x.items]}
    if isinstance(x,Shipment):return {'id':x.tracking_number,'orderId':x.customer_order_id,'poId':x.purchase_order_id,'carrier':x.carrier,'origin':x.origin,'destination':x.destination,'status':x.status,'departure':iso(x.departure_date),'eta':iso(x.estimated_delivery),'lastUpdate':iso(x.last_update),'history':[{'status':e.status,'at':iso(e.timestamp)} for e in x.events]}
    if isinstance(x,Offer):return {'id':x.id,'name':pair(x.name_en,x.name_ar),'description':pair(x.description_en,x.description_ar),'type':x.discount_type,'discount':float(x.discount_value),'start':iso(x.start_date),'end':iso(x.end_date),'minQty':x.minimum_quantity,'code':x.promo_code,'supplierId':x.supplier_id,'enabled':x.enabled,'productIds':[p.id for p in x.products]}
    if isinstance(x,Notification):return {'id':x.id,'type':x.type,'message':pair(x.message_en,x.message_ar),'read':x.is_read,'severity':x.severity,'href':x.href,'at':iso(x.created_at)}
    raise TypeError('Unsupported record')
