import re
from datetime import date
from decimal import Decimal, InvalidOperation
from .security import APIError


def text(data,key,maximum=150,required=True):
    value=data.get(key,'')
    if not isinstance(value,str) or len(value.strip())>maximum or (required and not value.strip()):
        raise APIError(f'Invalid {key}.','يرجى التحقق من الحقول المطلوبة.')
    return value.strip()


def email(data,key='email'):
    value=text(data,key,150).lower()
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',value):raise APIError('Enter a valid email address.','أدخل بريدًا إلكترونيًا صحيحًا.')
    return value


def phone(data):
    value=text(data,'phone',40,False)
    if value and not re.fullmatch(r'[+0-9 ()-]{7,40}',value):raise APIError('Enter a valid phone number.','أدخل رقم هاتف صحيحًا.')
    return value


def number(data,key,minimum=0,maximum=100000000,integer=False):
    raw=data.get(key)
    if isinstance(raw,bool):raise APIError(f'Invalid {key}.')
    try:value=Decimal(str(raw))
    except (InvalidOperation,ValueError,TypeError):raise APIError(f'Invalid {key}.')
    if not value.is_finite() or value<minimum or value>maximum or (integer and value!=int(value)):raise APIError(f'Invalid {key}.','أدخل أرقامًا ضمن النطاق المسموح.')
    return int(value) if integer else value.quantize(Decimal('.01'))


def choice(data,key,values):
    value=data.get(key)
    if value not in values:raise APIError(f'Invalid {key}.','قيمة الحقل غير صالحة.')
    return value


def day(data,key):
    try:return date.fromisoformat(data[key])
    except (ValueError,KeyError,TypeError):raise APIError(f'Invalid {key}.','أدخل تاريخًا صحيحًا.')
