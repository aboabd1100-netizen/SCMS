"""Idempotent, development-only fixtures. Never seeds production implicitly."""
import json
import argparse
from datetime import date, datetime
from app import create_app
from app.config import ROOT
from app.extensions import db
from app.models import *
from app.utils.security import password, ROLES

STAGES=['users','warehouses','suppliers','products','purchase-orders','orders','shipments','offers','notifications']


def seed(through='notifications'):
    from flask import current_app
    if not current_app.config['DEVELOPMENT_SEED']:raise RuntimeError('Development seed is disabled in production.')
    data=json.loads((ROOT/'fixtures/development.json').read_text(encoding='utf8'))
    stages=STAGES[:STAGES.index(through)+1]
    if not db.session.get(AppState,1):db.session.add(AppState(id=1,revision=0,settings=data['settings']))
    roles={}
    for name in ROLES:
        role=db.session.scalar(db.select(Role).where(Role.name==name))
        if not role:role=Role(name=name);db.session.add(role);db.session.flush()
        roles[name]=role
    for u in data['users']:
        if not db.session.get(User,u['id']):db.session.add(User(id=u['id'],full_name=u['name'],email=u['email'],phone=u['phone'],address=u['address'],role=roles[u['role']],status=u['status'],language=u['language'],account_type=u['accountType'],preferences=u['preferences'],password_hash=password('Admin@12345' if u['role']=='Admin' else 'Customer@12345')))
    db.session.flush()
    if 'warehouses' in stages:
        for w in data['warehouses']:
            if not db.session.get(Warehouse,w['id']):db.session.add(Warehouse(id=w['id'],name=w['name'],city=w['location'],capacity=w['capacity'],status=w['status'],staff=w['staff']))
    if 'suppliers' in stages:
        for s in data['suppliers']:
            if not db.session.get(Supplier,s['id']):db.session.add(Supplier(id=s['id'],name=s['name'],contact_name=s['contact'],email=s['email'],category=s['category'],region=s['region'],status=s['status'],on_time_delivery_score=s['onTime'],quality_score=s['quality']))
    db.session.flush()
    if 'products' in stages:
        for p in data['products']:
            if not db.session.get(Product,p['id']):db.session.add(Product(id=p['id'],name_en=p['name']['en'],name_ar=p['name']['ar'],description_en=p['description']['en'],description_ar=p['description']['ar'],sku=p['sku'],category=p['category'],unit_cost=p['cost'],price=p['price'],supplier_id=p['supplierId'],minimum_stock_level=p['min'],active=p['active'],icon=p['icon']))
        db.session.flush()
        for s in data['stock']:
            if not db.session.scalar(db.select(Inventory).where(Inventory.product_id==s['productId'],Inventory.warehouse_id==s['warehouseId'])):db.session.add(Inventory(product_id=s['productId'],warehouse_id=s['warehouseId'],current_stock=s['qty'],minimum_stock_level=db.session.get(Product,s['productId']).minimum_stock_level))
    if 'purchase-orders' in stages:
        for p in data['purchaseOrders']:
            if not db.session.get(PurchaseOrder,p['id']):
                row=PurchaseOrder(id=p['id'],po_number=p['id'],supplier_id=p['supplierId'],warehouse_id=p['warehouseId'],order_date=date.fromisoformat(p['date']),expected_date=date.fromisoformat(p['expected']),status=p['status'],created_by='u-admin',history=p['history'],total_amount=sum(i['qty']*i['cost'] for i in p['items']))
                row.items=[PurchaseOrderItem(product_id=i['productId'],quantity=i['qty'],unit_cost=i['cost']) for i in p['items']];db.session.add(row)
    # Offers precede orders physically because an order may refer to an offer.
    if 'orders' in stages:
        for o in data['offers']:
            if not db.session.get(Offer,o['id']):db.session.add(Offer(id=o['id'],name_en=o['name']['en'],name_ar=o['name']['ar'],description_en=o['description']['en'],description_ar=o['description']['ar'],discount_type=o['type'],discount_value=o['discount'],start_date=date.fromisoformat(o['start']),end_date=date.fromisoformat(o['end']),minimum_quantity=o['minQty'],promo_code=o['code'],supplier_id=o['supplierId'] or None,enabled=o['enabled'],created_by='u-admin',products=[db.session.get(Product,id) for id in o['productIds']]))
        db.session.flush()
        for o in data['orders']:
            if not db.session.get(CustomerOrder,o['id']):
                row=CustomerOrder(id=o['id'],order_number=o['id'],customer_id=o['userId'],total_amount=o['total'],subtotal=o['subtotal'],discount=o['discount'],shipping=o['shipping'],address=o['address'],status=o['status'],order_date=date.fromisoformat(o['date']),promo_code=o.get('code',''),offer_id=o.get('offerId'),history=o['history'])
                row.items=[CustomerOrderItem(product_id=i['productId'],warehouse_id=i['warehouseId'],quantity=i['qty'],price=i['price']) for i in o['items']];db.session.add(row)
    db.session.flush()
    if 'shipments' in stages:
        for s in data['shipments']:
            if not db.session.get(Shipment,s['id']):
                row=Shipment(id=s['id'],tracking_number=s['id'],customer_order_id=s['orderId'],purchase_order_id=s['poId'],carrier=s['carrier'],origin=s['origin'],destination=s['destination'],departure_date=date.fromisoformat(s['departure']),estimated_delivery=date.fromisoformat(s['eta']),status=s['status'])
                row.events=[ShipmentTrackingEvent(status=e['status'],timestamp=datetime.fromisoformat(e['at'].replace('Z','+00:00'))) for e in s['history']];db.session.add(row)
    if not db.session.scalar(db.select(InventorySnapshot.id)) and 'products' in stages:db.session.add(InventorySnapshot(quantity=sum(s['qty'] for s in data['stock'])))
    if 'notifications' in stages:
        from app.services.notifications import refresh_notifications
        refresh_notifications()
    db.session.commit()


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--through',choices=STAGES,default='notifications');args=parser.parse_args()
    with create_app().app_context():seed(args.through)
    print('Development seed applied idempotently through '+args.through+'.')
