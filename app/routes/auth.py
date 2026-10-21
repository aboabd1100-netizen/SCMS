from flask import Blueprint, jsonify, request, g
from sqlalchemy import select
from app.extensions import db, limiter
from app.models import User, Role, AuthSession, AppState, utcnow
from app.utils.security import authorize, new_session, csrf_for, password, passwords, verify_password, APIError, audit, DUMMY_HASH
from app.utils import validation as v
from uuid import uuid4
import secrets
from datetime import timedelta
from flask import current_app
from app.models import PasswordReset
from app.utils.security import digest

auth=Blueprint('auth',__name__,url_prefix='/api/auth')


def user_json(u):
    return {'id':u.id,'name':u.full_name,'email':u.email,'phone':u.phone,'address':u.address,'role':u.role.name,'status':u.status,'language':u.language,'preferences':u.preferences,'accountType':u.account_type,'lastLogin':u.last_login.isoformat() if u.last_login else None}


@auth.get('/session')
def session_info():
    if not g.auth_session:new_session();db.session.commit()
    return jsonify(success=True,data={'user':user_json(g.user) if g.user else None,'csrf':csrf_for(g.auth_session.token_hash)})


@auth.post('/login')
@limiter.limit('10 per minute')
def login():
    data=request.get_json(silent=True) or {}
    address=v.email(data)
    candidate=data.get('password','')
    if not isinstance(candidate,str) or len(candidate)>128:raise APIError('Invalid login details.','بيانات الدخول غير صحيحة.',401)
    u=db.session.scalar(select(User).where(User.email==address))
    # Hash verification is performed for unknown accounts too, preventing a cheap timing oracle.
    hashed=u.password_hash if u else DUMMY_HASH
    valid=verify_password(hashed,candidate)
    if not u or not valid or u.status!='Active':
        audit('Login failed','authentication',None,'Invalid sign-in attempt')
        db.session.commit()
        raise APIError('Email or password is incorrect.','البريد الإلكتروني أو كلمة المرور غير صحيحة.',401)
    if passwords.check_needs_rehash(u.password_hash):u.password_hash=password(candidate)
    if g.auth_session:db.session.delete(g.auth_session)
    new_session(u,bool(data.get('remember')))
    u.last_login=utcnow();audit('Login','user',u.id,'Successful sign-in')
    db.session.execute(db.update(AppState).where(AppState.id==1).values(revision=AppState.revision+1))
    db.session.commit()
    return jsonify(success=True,data={'user':user_json(u),'csrf':csrf_for(g.auth_session.token_hash)})


@auth.post('/register')
@limiter.limit('5 per hour')
def register():
    data=request.get_json(silent=True) or {}
    address=v.email(data)
    state=db.session.scalar(select(AppState).where(AppState.id==1).with_for_update())
    if not state:raise APIError('Database initialization is required.',status=503)
    if db.session.scalar(select(User.id).where(User.email==address)):raise APIError('Email already exists.','البريد الإلكتروني موجود بالفعل.',409)
    role=db.session.scalar(select(Role).where(Role.name=='Customer'))
    phone=v.phone(data)
    if not phone:raise APIError('Enter a phone number.','أدخل رقم الهاتف.')
    u=User(id='USR-'+uuid4().hex[:16].upper(),full_name=v.text(data,'name',100),email=address,phone=phone,password_hash=password(data.get('password')),role=role,language=v.choice(data,'language',('en','ar')),preferences={'orders':True,'shipments':True,'offers':True,'inventory':True},account_type='Business Customer')
    db.session.add(u);db.session.flush();audit('User registered','user',u.id,'Customer account registered')
    from app.services.notifications import refresh_notifications
    refresh_notifications();state.revision+=1;db.session.commit()
    return jsonify(success=True,data=user_json(u)),201


@auth.post('/logout')
def logout():
    if g.user:audit('Logout','user',g.user.id,'Session invalidated')
    if g.auth_session:db.session.delete(g.auth_session)
    g.clear_cookie=True;db.session.commit()
    return jsonify(success=True,data=None)


@auth.post('/password')
@authorize()
@limiter.limit('5 per hour')
def change_password():
    data=request.get_json(silent=True) or {}
    if not verify_password(g.user.password_hash,str(data.get('current',''))):raise APIError('Current password is incorrect.','كلمة المرور الحالية غير صحيحة.')
    g.user.password_hash=password(data.get('password'))
    db.session.execute(db.delete(AuthSession).where(AuthSession.user_id==g.user.id,AuthSession.token_hash!=g.auth_session.token_hash))
    audit('Password changed','user',g.user.id,'Password updated; other sessions revoked');db.session.commit()
    return jsonify(success=True,data=None)


@auth.post('/recovery')
@limiter.limit('3 per hour')
def recovery():
    data=request.get_json(silent=True) or {};address=v.email(data)
    if not current_app.config.get('SMTP_HOST') or not current_app.config.get('MAIL_FROM'):
        raise APIError('Email recovery is not configured. Please contact your administrator.','خدمة استعادة كلمة المرور بالبريد غير مهيأة. يرجى التواصل مع مسؤول النظام.',503)
    u=db.session.scalar(select(User).where(User.email==address,User.status=='Active'))
    if u:
        from app.services.mail import send_reset
        token=secrets.token_urlsafe(48)
        reset=PasswordReset(token_hash=digest(token),user_id=u.id,expires_at=utcnow()+timedelta(minutes=30))
        db.session.add(reset)
        try:send_reset(address,token)
        except Exception:db.session.rollback();raise APIError('Email recovery is temporarily unavailable.','خدمة الاستعادة غير متاحة مؤقتًا.',503)
        db.session.commit()
    return jsonify(success=True,data={'message':'If the account exists, a recovery link will be emailed.','message_ar':'إذا كان الحساب موجودًا، فسيتم إرسال رابط الاستعادة بالبريد.'})


@auth.post('/reset')
@limiter.limit('10 per hour')
def reset_password():
    data=request.get_json(silent=True) or {};token=v.text(data,'token',128)
    reset=db.session.scalar(select(PasswordReset).where(PasswordReset.token_hash==digest(token)).with_for_update())
    if not reset or reset.used or reset.expires_at<=utcnow():raise APIError('Recovery link is invalid or expired.','رابط الاستعادة غير صالح أو منتهي الصلاحية.')
    u=db.session.get(User,reset.user_id)
    if not u or u.status!='Active':raise APIError('Recovery link is invalid or expired.')
    u.password_hash=password(data.get('password'));reset.used=True
    db.session.execute(db.delete(AuthSession).where(AuthSession.user_id==u.id))
    audit('Password reset','user',u.id,'Password reset completed; sessions revoked');db.session.commit()
    return jsonify(success=True,data={'message':'Password updated. You can sign in now.','message_ar':'تم تحديث كلمة المرور. يمكنك تسجيل الدخول الآن.'})
