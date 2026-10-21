import hashlib
import hmac
import secrets
from datetime import timedelta
from functools import wraps
from flask import g, request, current_app, abort
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError
from app.extensions import db
from app.models import AuthSession, AuditLog, utcnow

passwords = PasswordHasher()
DUMMY_HASH = passwords.hash(secrets.token_urlsafe(32))
ROLES = ('Admin','Manager','Warehouse Staff','Delivery Staff','Supplier','Customer')
PERMISSIONS = {
    'users': {'Admin'}, 'settings': {'Admin'},
    'warehouses': {'Admin','Manager','Warehouse Staff'},
    'suppliers': {'Admin','Manager','Supplier'},
    'products': {'Admin','Manager','Warehouse Staff'},
    'inventory': {'Admin','Manager','Warehouse Staff'},
    'purchase-orders': {'Admin','Manager','Supplier'},
    'orders': {'Admin','Manager','Warehouse Staff','Customer'},
    'shipments': {'Admin','Manager','Warehouse Staff','Delivery Staff'},
    'offers': {'Admin','Manager'}, 'reports': {'Admin','Manager'},
}


class APIError(Exception):
    def __init__(self, en, ar='تعذر إتمام الطلب.', status=400):
        super().__init__(en)
        self.ar, self.status = ar, status


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def csrf_for(token_hash):
    return hmac.new(current_app.config['SECRET_KEY'].encode(), token_hash.encode(), hashlib.sha256).hexdigest()


def new_session(user=None, remember=False):
    token=secrets.token_urlsafe(48)
    hashed=digest(token)
    entry=AuthSession(token_hash=hashed, user_id=user.id if user else None, csrf_hash=digest(csrf_for(hashed)), expires_at=utcnow()+timedelta(days=14 if remember else 1))
    db.session.add(entry)
    g.auth_session=entry
    g.user=user
    g.session_cookie=token
    g.cookie_max_age=14*86400 if remember else None
    return entry


def load_identity():
    g.user=None;g.auth_session=None
    if not request.path.startswith('/api/') and not (request.path.endswith('.html') or request.path=='/'):
        return
    token=request.cookies.get(current_app.config['SESSION_COOKIE_NAME'],'')
    if token:
        entry=db.session.get(AuthSession,digest(token))
        if entry and entry.expires_at>utcnow():
            g.auth_session=entry
            if entry.user and entry.user.status=='Active':g.user=entry.user
    if request.path.startswith('/api/') and request.method not in ('GET','HEAD','OPTIONS'):
        csrf=request.headers.get('X-CSRF-Token','')
        if not g.auth_session or not hmac.compare_digest(digest(csrf),g.auth_session.csrf_hash):
            raise APIError('Your session expired. Reload and try again.','انتهت الجلسة. أعد التحميل وحاول مجددًا.',403)
        if not isinstance(request.get_json(silent=True),dict):raise APIError('A JSON object is required.','يلزم إرسال بيانات صحيحة.')


def authorize(module=None, roles=None):
    def decorator(fn):
        @wraps(fn)
        def wrapped(*args,**kwargs):
            if not g.user:raise APIError('Please sign in.','يرجى تسجيل الدخول.',401)
            allowed=set(roles) if roles is not None else PERMISSIONS.get(module,set(ROLES))
            if g.user.role.name not in allowed:raise APIError('You do not have permission for this action.','ليست لديك صلاحية لهذا الإجراء.',403)
            return fn(*args,**kwargs)
        return wrapped
    return decorator


def audit(action,entity_type='',entity_id=None,description=''):
    db.session.add(AuditLog(user_id=g.user.id if g.get('user') else None,action=action,entity_type=entity_type,entity_id=entity_id,description=description[:500],ip_address=request.remote_addr))


def password(value):
    if not isinstance(value,str) or not 10<=len(value)<=128:
        raise APIError('Use a password of 10–128 characters.','استخدم كلمة مرور من ١٠ إلى ١٢٨ حرفًا.')
    if not current_app.config['DEVELOPMENT_SEED'] and value in ('Admin@12345', 'Customer@12345'):
        raise APIError('Choose a unique password; development passwords are not allowed.')
    return passwords.hash(value)


def verify_password(hashed,value):
    try:return passwords.verify(hashed,value)
    except (VerifyMismatchError,InvalidHashError):return False
