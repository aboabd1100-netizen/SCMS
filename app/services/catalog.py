import re
from uuid import uuid4
from sqlalchemy import select, func
from flask import g
from app.models import *
from app.extensions import db
from app.utils import validation as v
from app.utils.security import APIError, PERMISSIONS, ROLES, password, audit


def uid(prefix):return prefix+'-'+uuid4().hex[:16].upper()


def allowed(module):
    if not g.user:raise APIError('Please sign in.','يرجى تسجيل الدخول.',401)
    if g.user.role.name not in PERMISSIONS.get(module,{'Admin'}):raise APIError('Access denied.','الوصول غير مسموح.',403)


def record(model,id):
    if not isinstance(id, (str, int)) or isinstance(id, bool) or (isinstance(id, str) and (not id or len(id) > 80)):
        raise APIError('Invalid record identifier.')
    row=db.session.get(model,id)
    if not row:raise APIError('Record not found.','السجل غير موجود.',404)
    return row


def bilingual(data,key,maximum):
    value=data.get(key)
    if not isinstance(value,dict):raise APIError('Complete both languages.','أكمل اللغتين.')
    return v.text(value,'en',maximum),v.text(value,'ar',maximum)


def save(module,data,id=None):
    allowed(module)
    if g.user.role.name=='Supplier':raise APIError('Supplier records are read-only for this role.','سجلات الموردين متاحة للقراءة فقط لهذا الدور.',403)
    model={'users':User,'warehouses':Warehouse,'suppliers':Supplier,'products':Product,'offers':Offer}.get(module)
    if not model:raise APIError('Unsupported editor.')
    row=record(model,id) if id else model(id=uid({'users':'USR','warehouses':'WH','suppliers':'SUP','products':'PROD','offers':'OFFER'}[module]))
    if module=='users':
        row.full_name=v.text(data,'name',100);row.email=v.email(data);row.phone=v.phone(data);row.address=v.text(data,'address',400,False)
        role=v.choice(data,'role',ROLES);status=v.choice(data,'status',('Active','Inactive'))
        if row.id==g.user.id and (role!='Admin' or status!='Active'):raise APIError('You cannot remove your own administrator access.','لا يمكنك إزالة صلاحياتك الإدارية.')
        if id and row.role.name=='Admin' and (role!='Admin' or status!='Active'):
            count=db.session.scalar(select(func.count(User.id)).join(Role).where(Role.name=='Admin',User.status=='Active'))
            if count<=1:raise APIError('Keep at least one active administrator.','يجب الاحتفاظ بمدير نشط واحد على الأقل.')
        row.role= db.session.scalar(select(Role).where(Role.name==role));row.status=status
        row.account_type=v.text(data,'accountType',40,False) or 'Internal';row.language=data.get('language','en') if data.get('language','en') in ('en','ar') else 'en'
        if not id:row.password_hash=password(data.get('password'));row.preferences={'orders':True,'shipments':True,'offers':True,'inventory':True}
    if module=='warehouses':
        row.name=v.text(data,'name');row.city=v.text(data,'location',160);row.capacity=v.number(data,'capacity',1,100000000,True);row.staff=v.number(data,'staff',0,1000000,True);row.status=v.choice(data,'status',('Operational','Maintenance'))
        used=db.session.scalar(select(func.coalesce(func.sum(Inventory.current_stock),0)).where(Inventory.warehouse_id==row.id))
        if used>row.capacity:raise APIError('Capacity cannot be below current inventory.','لا يمكن أن تقل السعة عن المخزون الحالي.')
    if module=='suppliers':
        row.name=v.text(data,'name');row.contact_name=v.text(data,'contact');row.phone=v.phone(data);row.email=v.email(data);row.category=v.text(data,'category',60);row.region=v.text(data,'region',100);row.status=v.choice(data,'status',('Active','Review','Inactive'));row.on_time_delivery_score=v.number(data,'onTime',0,100);row.quality_score=v.number(data,'quality',0,100)
    if module=='products':
        row.name_en,row.name_ar=bilingual(data,'name',150);row.description_en,row.description_ar=bilingual(data,'description',500)
        row.sku=v.text(data,'sku',60).upper()
        if not re.fullmatch(r'[A-Z0-9_-]+',row.sku):raise APIError('Invalid SKU.')
        row.category=v.text(data,'category',60);row.unit_cost=v.number(data,'cost');row.price=v.number(data,'price');row.minimum_stock_level=v.number(data,'min',0,1000000,True);row.supplier_id=record(Supplier,data.get('supplierId')).id
        if not isinstance(data.get('active'),bool):raise APIError('Invalid product visibility.')
        row.active=data['active'];row.icon=v.text({'icon':data.get('icon') or row.icon or 'box'},'icon',30)
        if id:
            for inv in db.session.scalars(select(Inventory).where(Inventory.product_id==id)):inv.minimum_stock_level=row.minimum_stock_level
    if module=='offers':
        row.name_en,row.name_ar=bilingual(data,'name',120);row.description_en,row.description_ar=bilingual(data,'description',500)
        row.discount_type=v.choice(data,'type',('Percent','Free Shipping'));row.discount_value=v.number(data,'discount',0 if row.discount_type=='Free Shipping' else .01,100)
        if row.discount_type=='Free Shipping':row.discount_value=0
        row.start_date=v.day(data,'start');row.end_date=v.day(data,'end')
        if row.end_date<row.start_date:raise APIError('End date must follow start date.','يجب ألا يسبق تاريخ النهاية تاريخ البداية.')
        row.minimum_quantity=v.number(data,'minQty',1,1000000,True);row.promo_code=v.text(data,'code',24).upper()
        if not re.fullmatch(r'[A-Z0-9_-]{3,24}',row.promo_code):raise APIError('Invalid promotion code.')
        row.supplier_id=record(Supplier,data['supplierId']).id if data.get('supplierId') else None
        if not isinstance(data.get('enabled'),bool):raise APIError('Invalid offer status.')
        row.enabled=data['enabled']
        ids=data.get('productIds')
        if not isinstance(ids,list) or not ids or len(ids)>1000 or any(not isinstance(pid,str) or not 1 <= len(pid) <= 50 for pid in ids):raise APIError('Select applicable products.','اختر المنتجات المشمولة.')
        row.products=[record(Product,pid) for pid in set(ids)]
        if not id:row.created_by=g.user.id
    db.session.add(row);db.session.flush();audit('Created' if not id else 'Updated',module,row.id,f'{module} record saved')
    return row
