CITIES={'riyadh':'Riyadh, Saudi Arabia','jeddah':'Jeddah, Saudi Arabia','dammam':'Dammam, Saudi Arabia','khobar':'Khobar, Saudi Arabia','medina':'Medina, Saudi Arabia','yanbu':'Yanbu, Saudi Arabia','jubail':'Jubail, Saudi Arabia','tabuk':'Tabuk, Saudi Arabia','الرياض':'Riyadh, Saudi Arabia','جدة':'Jeddah, Saudi Arabia','الدمام':'Dammam, Saudi Arabia','الخبر':'Khobar, Saudi Arabia','المدينة':'Medina, Saudi Arabia','ينبع':'Yanbu, Saudi Arabia','الجبيل':'Jubail, Saudi Arabia','تبوك':'Tabuk, Saudi Arabia'}


def public_location(value):
    lower=value.lower()
    return ' / '.join(dict.fromkeys(label for city,label in CITIES.items() if city in lower)) or 'Saudi Arabia'
