import copy
import pytest
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy.engine import make_url
from flask_migrate import upgrade
from app import create_app
from app.extensions import db
from app.models import *
from seed import seed


@pytest.fixture
def app():
    base=create_app()
    url=make_url(base.config['SQLALCHEMY_DATABASE_URI']).set(database='scms_test')
    application=create_app({'TESTING':True,'RATELIMIT_ENABLED':False,'FULLSTACK_ENABLED':True,'SQLALCHEMY_DATABASE_URI':url.render_as_string(hide_password=False)})
    with application.app_context():
        assert db.engine.url.database=='scms_test'
        db.drop_all()
        # Rebuild via the real migration, never via a substitute database.
        db.session.execute(db.text('DROP TABLE IF EXISTS alembic_version'));db.session.commit()
        upgrade(directory='migrations');seed()
    yield application
    with application.app_context():db.session.remove();db.engine.dispose()


def login(app,role='admin'):
    c=app.test_client();token=c.get('/api/auth/session').json['data']['csrf']
    r=c.post('/api/auth/login',json={'email':f'{role}@scms.io','password':'Admin@12345' if role=='admin' else 'Customer@12345'},headers={'X-CSRF-Token':token})
    assert r.status_code==200,r.json
    return c,r.json['data']['csrf']


def write(c,token,url,data,method='post',expected=200):
    r=getattr(c,method)(url,json=data,headers={'X-CSRF-Token':token});assert r.status_code==expected,(url,r.json);return r.json.get('data')


def test_auth_roles_and_safe_public_tracking(app):
    guest=app.test_client();assert guest.get('/dashboard.html').status_code==302
    c,token=login(app,'customer');assert c.get('/users.html').status_code==403;assert c.get('/api/users').status_code==403
    assert c.get('/api/auth/session').json['data']['user']['role']=='Customer'
    assert c.post('/api/orders',json={}).status_code==403
    own=c.get('/api/orders').json['data'];assert all(o['userId']=='u-customer' for o in own)
    r=guest.get('/api/shipments/track/SHP-1087');assert r.status_code==200
    result=r.json['data'];assert not {'userId','orderId','poId','password','address'}&result.keys();assert result['destination']=='Khobar, Saudi Arabia'
    assert guest.get('/api/shipments/track/NOT-FOUND').status_code==404
    assert guest.get('/api/shipments/track/SHP-1087%27%20OR%201=1').status_code==404
    with app.app_context():assert db.session.get(User,'u-admin').password_hash.startswith('$argon2id$')


def test_catalog_users_offers_crud(app):
    c,t=login(app)
    user=write(c,t,'/api/users',{'name':'New Staff','email':'staff@example.com','phone':'+966500000000','address':'Riyadh','role':'Warehouse Staff','status':'Active','accountType':'Internal','password':'StaffPassword123'},expected=201)
    user['status']='Inactive';write(c,t,'/api/users/'+user['id'],user,'put');assert c.get('/api/users/'+user['id']).json['data']['status']=='Inactive'
    w=write(c,t,'/api/warehouses',{'name':'Test Riyadh','location':'Riyadh, Saudi Arabia','capacity':1000,'staff':2,'status':'Operational'},expected=201)
    s=write(c,t,'/api/suppliers',{'name':'Supplier Test','contact':'Procurement','phone':'+966500000000','email':'supplier@example.com','category':'Packaging','region':'Riyadh','status':'Active','onTime':95,'quality':98},expected=201)
    p=write(c,t,'/api/products',{'name':{'en':'Product Test','ar':'منتج اختبار'},'description':{'en':'Stock test','ar':'اختبار المخزون'},'sku':'TEST-100','category':'Packaging','cost':10,'price':15,'min':5,'supplierId':s['id'],'active':True},expected=201)
    write(c,t,'/api/inventory',{'productId':p['id'],'warehouseId':w['id'],'qty':20,'reason':'Initial stock'},expected=201)
    o=write(c,t,'/api/offers',{'name':{'en':'Test Offer','ar':'عرض اختبار'},'description':{'en':'Offer test','ar':'اختبار العرض'},'type':'Percent','discount':15,'start':'2020-01-01','end':'2099-12-31','minQty':1,'code':'TEST15','productIds':[p['id']],'enabled':True},expected=201)
    public=app.test_client();assert any(x['id']==o['id'] for x in public.get('/api/state').json['data']['offers'])
    o['discount']=20;write(c,t,'/api/offers/'+o['id'],o,'put');assert next(x for x in public.get('/api/state').json['data']['offers'] if x['id']==o['id'])['discount']==20
    o['enabled']=False;write(c,t,'/api/offers/'+o['id'],o,'put');assert all(x['id']!=o['id'] for x in public.get('/api/state').json['data']['offers'])
    write(c,t,'/api/offers/'+o['id'],{},'delete');assert c.get('/api/offers/'+o['id']).status_code==404
    # Referential integrity prevents deleting products that still have inventory.
    write(c,t,'/api/products/'+p['id'],{},'delete',409)


def test_po_order_shipment_atomic_workflow(app):
    c,t=login(app);state=c.get('/api/state').json['data'];p=state['products'][0];w=next(w for w in state['warehouses'] if w['status']=='Operational')
    before=sum(x['qty'] for x in state['stock'] if x['productId']==p['id'] and x['warehouseId']==w['id'])
    po=write(c,t,'/api/purchase-orders',{'supplierId':p['supplierId'],'warehouseId':w['id'],'productId':p['id'],'qty':5,'expected':'2099-12-31','status':'Pending Approval'},expected=201)
    for status in ['Approved','Ordered','Received']:write(c,t,'/api/purchase-orders/'+po['id'],{'status':status},'put')
    write(c,t,'/api/purchase-orders/'+po['id'],{'status':'Received'},'put',400)
    state=c.get('/api/state').json['data'];after=next(x['qty'] for x in state['stock'] if x['productId']==p['id'] and x['warehouseId']==w['id']);assert after==before+5
    customer,ct=login(app,'customer');order=write(customer,ct,'/api/orders',{'address':'Riyadh, Saudi Arabia','items':[{'productId':p['id'],'warehouseId':w['id'],'qty':1,'price':0}],'code':''},expected=201)
    assert order['items'][0]['price']==p['price'];assert any(x['id']==order['id'] for x in c.get('/api/orders').json['data'])
    for status in ['Confirmed','Processing','Ready for Shipment']:write(c,t,'/api/orders/'+order['id'],{'status':status},'put')
    shipment=write(c,t,'/api/shipments',{'orderId':order['id'],'carrier':'Saudi Freight','departure':'2026-01-01','eta':'2099-12-31'},expected=201)
    for status in ['Picked Up','In Transit','Delivered']:write(c,t,'/api/shipments/'+shipment['id'],{'status':status},'put')
    assert customer.get('/api/orders/'+order['id']).json['data']['status']=='Delivered'
    state=c.get('/api/state').json['data'];assert next(x['qty'] for x in state['stock'] if x['productId']==p['id'] and x['warehouseId']==w['id'])==after-1
    assert app.test_client().get('/api/shipments/track/'+shipment['id']).status_code==200
    write(customer,ct,'/api/orders',{'address':'Riyadh','items':[{'productId':p['id'],'warehouseId':w['id'],'qty':1000000}]},expected=400)
    write(c,t,'/api/inventory',{'productId':p['id'],'warehouseId':w['id'],'qty':0,'reason':'Stock depletion'},expected=201)
    alerts=c.get('/api/notifications').json['data'];assert any(x['type']=='Out of Stock' for x in alerts)
    assert c.get('/api/reports').status_code==200;assert c.get('/api/audit').status_code==200


def test_concurrent_orders_cannot_oversell(app):
    admin,t=login(app);state=admin.get('/api/state').json['data'];p=state['products'][0];w=state['warehouses'][0]
    # Use a new inventory pair with no reservations.
    warehouse=write(admin,t,'/api/warehouses',{'name':'Concurrency Hub','location':'Riyadh','capacity':10,'staff':0,'status':'Operational'},expected=201)
    write(admin,t,'/api/inventory',{'productId':p['id'],'warehouseId':warehouse['id'],'qty':5,'reason':'Concurrency fixture'},expected=201)
    second=app.test_client();token=second.get('/api/auth/session').json['data']['csrf']
    write(second,token,'/api/auth/register',{'name':'Second Customer','email':'second@example.com','phone':'+966500000002','password':'CustomerPassword123','language':'en'},expected=201)
    second_session=write(second,token,'/api/auth/login',{'email':'second@example.com','password':'CustomerPassword123'})
    clients=[login(app,'customer'),(second,second_session['csrf'])]
    def order(item):
        client,token=item
        return client.post('/api/orders',json={'address':'Riyadh','items':[{'productId':p['id'],'warehouseId':warehouse['id'],'qty':4}]},headers={'X-CSRF-Token':token}).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(order,clients))
    assert sorted(results)==[201,400]
    for client,_ in clients:
        view=client.get('/api/state').json['data']
        assert next(x for x in view['stock'] if x['warehouseId']==warehouse['id'])['reservedQty']==4
    with app.app_context():
        from app.services.workflows import reserved
        assert reserved(p['id'],warehouse['id'])==4
        assert db.session.scalar(db.select(Inventory.current_stock).where(Inventory.warehouse_id==warehouse['id']))==5


def test_receipt_rolls_back_on_capacity_error_and_alerts_deduplicate(app):
    admin,t=login(app);state=admin.get('/api/state').json['data'];p=state['products'][0]
    warehouse=write(admin,t,'/api/warehouses',{'name':'Capacity Hub','location':'Jeddah','capacity':1,'staff':0,'status':'Operational'},expected=201)
    po=write(admin,t,'/api/purchase-orders',{'supplierId':p['supplierId'],'warehouseId':warehouse['id'],'productId':p['id'],'qty':2,'expected':'2099-12-31','status':'Pending Approval'},expected=201)
    for status in ['Approved','Ordered']:write(admin,t,'/api/purchase-orders/'+po['id'],{'status':status},'put')
    write(admin,t,'/api/purchase-orders/'+po['id'],{'status':'Received'},'put',400)
    assert admin.get('/api/purchase-orders/'+po['id']).json['data']['status']=='Ordered'
    with app.app_context():assert db.session.scalar(db.select(Inventory).where(Inventory.warehouse_id==warehouse['id'])) is None
    notes=admin.get('/api/notifications').json['data'];ids=[n['id'] for n in notes if n['type'] in ('Low Stock','Out of Stock')]
    write(admin,t,'/api/settings',state['settings'],'put')
    notes2=admin.get('/api/notifications').json['data'];assert ids==[n['id'] for n in notes2 if n['type'] in ('Low Stock','Out of Stock')]


@pytest.mark.parametrize('role,allowed_page,denied_page',[
    ('Warehouse Staff','inventory.html','users.html'),('Manager','reports.html','users.html'),('Delivery Staff','shipments.html','inventory.html'),('Supplier','suppliers.html','users.html')])
def test_role_enforcement_on_direct_page_urls(app,role,allowed_page,denied_page):
    admin,t=login(app);email=role.lower().replace(' ','')+'@example.com'
    write(admin,t,'/api/users',{'name':role,'email':email,'phone':'+966500000000','address':'Riyadh','role':role,'status':'Active','accountType':'Internal','password':'TestPassword123'},expected=201)
    c=app.test_client();token=c.get('/api/auth/session').json['data']['csrf'];session=write(c,token,'/api/auth/login',{'email':email,'password':'TestPassword123'})
    assert c.get('/'+allowed_page).status_code==200;assert c.get('/'+denied_page).status_code==403
    assert c.get('/api/audit').status_code==403
    if role=='Supplier':
        supplier=admin.get('/api/suppliers').json['data'][0]
        write(c,session['csrf'],'/api/suppliers/'+supplier['id'],supplier,'put',403)


def test_registration_and_single_use_recovery(app,monkeypatch):
    guest=app.test_client();csrf=guest.get('/api/auth/session').json['data']['csrf']
    registered=write(guest,csrf,'/api/auth/register',{'name':'New Customer','email':'new@example.com','phone':'+966500000001','password':'CustomerPassword123','language':'ar','role':'Admin'},expected=201)
    assert registered['role']=='Customer'
    write(guest,csrf,'/api/auth/register',{'name':'Duplicate','email':'new@example.com','password':'CustomerPassword123','language':'en'},expected=409)
    app.config.update(SMTP_HOST='test.invalid',MAIL_FROM='support@example.com')
    captured=[]
    monkeypatch.setattr('app.services.mail.send_reset',lambda address,token:captured.append((address,token)))
    reply=write(guest,csrf,'/api/auth/recovery',{'email':'new@example.com'})
    token=captured[0][1];assert token not in str(reply)
    write(guest,csrf,'/api/auth/reset',{'token':token,'password':'ChangedPassword123'})
    write(guest,csrf,'/api/auth/reset',{'token':token,'password':'AnotherPassword123'},expected=400)
    session=write(guest,csrf,'/api/auth/login',{'email':'new@example.com','password':'ChangedPassword123'})
    assert session['user']['role']=='Customer'
    with app.app_context():
        from app.utils.security import digest
        assert db.session.get(PasswordReset,digest(token)).used


def test_sensitive_route_rate_limit_and_cookie_flags(app):
    app.config.update(RATELIMIT_ENABLED=True)
    limited=create_app({'TESTING':True,'SQLALCHEMY_DATABASE_URI':app.config['SQLALCHEMY_DATABASE_URI'],'RATELIMIT_ENABLED':True,'SESSION_COOKIE_SECURE':True})
    c=limited.test_client();r=c.get('/api/auth/session');assert 'HttpOnly' in r.headers['Set-Cookie'] and 'Secure' in r.headers['Set-Cookie'] and 'SameSite=Lax' in r.headers['Set-Cookie']
    csrf=r.json['data']['csrf'];codes=[]
    for _ in range(11):codes.append(c.post('/api/auth/login',json={'email':'missing@example.com','password':'WrongPassword123'},headers={'X-CSRF-Token':csrf}).status_code)
    assert codes[-1]==429


def test_customer_product_costs_are_private_on_every_read_path(app):
    client, _ = login(app, 'customer')
    rows = client.get('/api/products').json['data']
    assert rows and all('cost' not in row for row in rows)
    assert 'cost' not in client.get('/api/products/' + rows[0]['id']).json['data']
    assert all('cost' not in row for row in client.get('/api/state').json['data']['products'])


def test_supplier_scope_cannot_be_changed_through_profile(app):
    admin, token = login(app)
    supplier = admin.get('/api/suppliers').json['data'][0]
    other = admin.get('/api/suppliers').json['data'][1]
    write(admin, token, '/api/users', {'name':'Supplier Account','email':supplier['email'],'phone':'+966500000000','role':'Supplier','status':'Active','accountType':'Internal','password':'SupplierPassword123'}, expected=201)
    client = app.test_client()
    csrf = client.get('/api/auth/session').json['data']['csrf']
    session = write(client, csrf, '/api/auth/login', {'email':supplier['email'],'password':'SupplierPassword123'})
    state = client.get('/api/state').json['data']
    assert [s['id'] for s in state['suppliers']] == [supplier['id']]
    assert all(p['supplierId'] == supplier['id'] for p in state['products'])
    assert not state['orders'] and not state['shipments']
    assert all(p['supplierId'] == supplier['id'] for p in state['purchaseOrders'])
    products = {p['id'] for p in state['products']}
    assert all(i['productId'] in products for i in state['stock'])
    assert not any(n['type'] in ('New Customer Order','Shipment Delayed') for n in state['notifications'])
    write(client, session['csrf'], '/api/profile', {'name':'Supplier Account','email':other['email'],'phone':'+966500000000','address':'Riyadh','language':'en'}, 'put', 403)
    assert client.get('/api/auth/session').json['data']['user']['email'] == supplier['email']


def test_logout_expiry_rotation_and_password_session_revocation(app):
    from app.utils.security import digest
    from datetime import timedelta
    client, token = login(app)
    cookie = client.get_cookie(app.config['SESSION_COOKIE_NAME']).value
    write(client, token, '/api/auth/logout', {})
    assert client.get('/api/users').status_code == 401
    replay = app.test_client()
    replay.set_cookie(app.config['SESSION_COOKIE_NAME'], cookie)
    assert replay.get('/api/users').status_code == 401
    first, first_csrf = login(app, 'customer')
    second, _ = login(app, 'customer')
    write(first, first_csrf, '/api/auth/password', {'current':'Customer@12345','password':'ChangedPassword123'})
    assert second.get('/api/orders').status_code == 401
    with app.app_context():
        hashed = digest(first.get_cookie(app.config['SESSION_COOKIE_NAME']).value)
        db.session.get(AuthSession, hashed).expires_at = utcnow() - timedelta(seconds=1)
        db.session.commit()
    assert first.get('/api/orders').status_code == 401


def test_public_static_boundary_and_private_html_caching(app):
    guest = app.test_client()
    for url in ('/.env','/README.md','/USERS.HTML','/assets/../users.html','/run.py','/backups/SC-before-fullstack.zip'):
        assert guest.get(url).status_code in (302, 404)
    client, _ = login(app, 'customer')
    assert client.get('/users.html').status_code == 403
    assert client.get('/assets/../users.html').status_code == 404
    assert client.get('/orders.html').headers['Cache-Control'] == 'no-store'
    assert guest.get('/logo.js').status_code == 200
    assert guest.get('/scms-logo.png').status_code == 200


def test_input_validation_csrf_and_safe_error_responses(app):
    admin, csrf = login(app)
    assert admin.put('/api/settings',json={}).status_code == 403
    assert admin.put('/api/settings',json={},headers={'X-CSRF-Token':'invalid'}).status_code == 403
    assert admin.put('/api/settings',json=[],headers={'X-CSRF-Token':csrf}).status_code == 400
    state = admin.get('/api/state').json['data']
    product = state['products'][0]; warehouse = state['warehouses'][0]
    for qty in (-1, True, 'NaN', 'Infinity', 1.5):
        write(admin,csrf,'/api/inventory',{'productId':product['id'],'warehouseId':warehouse['id'],'qty':qty,'reason':'Invalid test'},expected=400)
    write(admin,csrf,'/api/inventory',{'productId':{},'warehouseId':warehouse['id'],'qty':1,'reason':'Invalid ID'},expected=400)
    write(admin,csrf,'/api/notifications/read',{'ids':[{}]},expected=400)
    for path in ('/api/state','/api/auth/session','/api/products','/api/health'):
        result = admin.get(path)
        assert result.headers['Cache-Control'] == 'no-store'
        assert not any(secret in result.get_data(as_text=True) for secret in ('password_hash','DATABASE_URL','SECRET_KEY','$argon2id$','Traceback'))


def test_guest_tracking_rate_limit_and_failure_audit(app):
    limited = create_app({'TESTING':True,'SQLALCHEMY_DATABASE_URI':app.config['SQLALCHEMY_DATABASE_URI'],'RATELIMIT_ENABLED':True})
    guest = limited.test_client()
    assert [guest.get('/api/shipments/track/NOT-FOUND').status_code for _ in range(31)][-1] == 429
    client = app.test_client(); csrf = client.get('/api/auth/session').json['data']['csrf']
    write(client,csrf,'/api/auth/login',{'email':'unknown@example.com','password':'DoNotLogThisPassword'},expected=401)
    with app.app_context():
        logs = list(db.session.scalars(db.select(AuditLog).where(AuditLog.action=='Login failed')))
        assert logs and all('DoNotLogThisPassword' not in log.description for log in logs)


def test_notifications_scheduler_and_data_survive_application_restart(app):
    admin, _ = login(app)
    before = admin.get('/api/state').json['data']
    result = app.test_cli_runner().invoke(args=['refresh-notifications'])
    assert result.exit_code == 0, result.output
    restarted = create_app({'TESTING':True,'RATELIMIT_ENABLED':False,'SQLALCHEMY_DATABASE_URI':app.config['SQLALCHEMY_DATABASE_URI']})
    client, _ = login(restarted)
    after = client.get('/api/state').json['data']
    assert [p['id'] for p in before['products']] == [p['id'] for p in after['products']]
    assert [o['id'] for o in before['orders']] == [o['id'] for o in after['orders']]
    assert after['revision'] > before['revision']


def production_settings(app):
    return {'SQLALCHEMY_DATABASE_URI':app.config['SQLALCHEMY_DATABASE_URI'], 'SECRET_KEY':'a-valid-randomized-production-key-for-tests-only', 'TRUSTED_HOSTS':['scms.example.com','healthcheck.railway.app'], 'PUBLIC_BASE_URL':'https://scms.example.com', 'RATELIMIT_STORAGE_URI':'redis://127.0.0.1:6379/0', 'RATELIMIT_ENABLED':False, 'PROXY_HOPS':1}


def test_production_proxy_https_cookies_hosts_and_seed_guard(app, monkeypatch):
    monkeypatch.setenv('SCMS_ENV','production')
    production = create_app(production_settings(app))
    client = production.test_client()
    redirect = client.get('/login.html',base_url='http://scms.example.com')
    assert redirect.status_code == 308 and redirect.location == 'https://scms.example.com/login.html'
    response = client.get('/api/auth/session',base_url='http://scms.example.com',headers={'X-Forwarded-Proto':'https','X-Forwarded-For':'203.0.113.7'})
    assert response.status_code == 200
    assert all(flag in response.headers['Set-Cookie'] for flag in ('Secure','HttpOnly','SameSite=Lax'))
    assert response.headers['Strict-Transport-Security'].startswith('max-age=')
    assert client.get('/login.html',base_url='https://attacker.example.com').status_code == 400
    with production.app_context(), pytest.raises(RuntimeError,match='disabled'):
        seed()


def test_production_rejects_unsafe_settings(app, monkeypatch):
    monkeypatch.setenv('SCMS_ENV','production')
    for override in ({'DEBUG':True},{'DEVELOPMENT_SEED':True},{'SESSION_COOKIE_SECURE':False},{'RATELIMIT_STORAGE_URI':'memory://'},{'SECRET_KEY':'replace-with-a-random-secret-at-least-32'},{'PUBLIC_BASE_URL':'http://scms.example.com'},{'TRUSTED_HOSTS':[]},{'PROXY_HOPS':4}):
        with pytest.raises(RuntimeError):create_app({**production_settings(app), **override})


def test_provider_database_uri_normalization():
    from app.config import database_url
    for scheme in ('postgres://','postgresql://','postgresql+psycopg://'):
        assert database_url(scheme+'user:password@db.internal/scms') == 'postgresql+psycopg://user:password@db.internal/scms'


def test_production_preflight_and_password_guards(app, monkeypatch):
    from app.extensions import limiter
    from app.utils.security import password, APIError
    monkeypatch.setenv('SCMS_ENV','production')
    production = create_app(production_settings(app))
    runner = production.test_cli_runner()
    result = runner.invoke(args=['production-check'])
    assert result.exit_code != 0 and 'fixture accounts' in result.output
    with production.app_context():
        with pytest.raises(APIError):password('Admin@12345')
        for user in db.session.scalars(db.select(User)):
            user.email = user.id + '@example.com'
        db.session.commit()
    # Renaming fixtures does not bypass the known-development-password check.
    result = runner.invoke(args=['production-check'])
    assert result.exit_code != 0 and 'development password' in result.output
    with production.app_context():
        for user in db.session.scalars(db.select(User)):
            user.password_hash = password('UniqueReleasePassword123')
        db.session.commit()
        monkeypatch.setattr(limiter.storage,'check',lambda:False)
    result = runner.invoke(args=['production-check'])
    assert result.exit_code != 0 and 'storage is unavailable' in result.output
    with production.app_context():monkeypatch.setattr(limiter.storage,'check',lambda:True)
    result = runner.invoke(args=['production-check'])
    assert result.exit_code == 0, result.output


def test_public_network_uses_database_records(app):
    client, csrf = login(app)
    warehouse = write(client,csrf,'/api/warehouses',{'name':'New Real Saudi Hub','location':'Riyadh','capacity':1234,'staff':2,'status':'Maintenance'},expected=201)
    summary = app.test_client().get('/api/public/summary').json['data']
    record = next(row for row in summary['network'] if row['name']==warehouse['name'])
    assert record == {'name':'New Real Saudi Hub','city':'Riyadh','capacity':1234,'status':'Maintenance'}
    assert not any(key in record for key in ('id','staff','userId','password'))


def test_customer_cannot_read_or_change_another_customers_records(app):
    admin, csrf = login(app)
    write(admin,csrf,'/api/users',{'name':'Separate Customer','email':'separate@example.com','phone':'+966500000002','role':'Customer','status':'Active','accountType':'Business Customer','password':'SeparatePassword123'},expected=201)
    client = app.test_client(); token = client.get('/api/auth/session').json['data']['csrf']
    session = write(client,token,'/api/auth/login',{'email':'separate@example.com','password':'SeparatePassword123'})
    foreign_order = admin.get('/api/orders').json['data'][0]
    foreign_shipment = next(s for s in admin.get('/api/shipments').json['data'] if s['orderId'])
    assert client.get('/api/orders/'+foreign_order['id']).status_code == 404
    assert client.get('/api/shipments/'+foreign_shipment['id']).status_code == 404
    write(client,session['csrf'],'/api/orders/'+foreign_order['id'],{'status':'Cancelled'},'put',403)
    assert client.get('/api/state').json['data']['orders'] == []


def test_internal_exceptions_do_not_expose_secrets(app, caplog):
    from sqlalchemy.exc import SQLAlchemyError
    @app.get('/api/test-internal-error')
    def internal_error():raise RuntimeError('private-credential-must-not-leak')
    @app.get('/api/test-database-error')
    def db_error():raise SQLAlchemyError('private-database-url-must-not-leak')
    client = app.test_client()
    for path, code in (('/api/test-internal-error',500),('/api/test-database-error',503)):
        response = client.get(path)
        assert response.status_code == code
        assert 'must-not-leak' not in response.get_data(as_text=True)
    assert 'must-not-leak' not in caplog.text
