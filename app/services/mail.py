import smtplib
import ssl
from email.message import EmailMessage
from flask import current_app


def send_reset(address,token):
    config=current_app.config
    mail=EmailMessage();mail['Subject']='SCMS password reset / إعادة تعيين كلمة المرور';mail['From']=config['MAIL_FROM'];mail['To']=address
    link=config['PUBLIC_BASE_URL'].rstrip('/')+'/forgot-password.html?token='+token
    mail.set_content('Reset your SCMS password within 30 minutes:\n'+link+'\n\nأعد تعيين كلمة المرور خلال ٣٠ دقيقة. إذا لم تطلب ذلك، تجاهل هذه الرسالة.')
    with smtplib.SMTP(config['SMTP_HOST'],config['SMTP_PORT'],timeout=10) as connection:
        connection.starttls(context=ssl.create_default_context())
        if config['SMTP_USERNAME']:connection.login(config['SMTP_USERNAME'],config['SMTP_PASSWORD'])
        connection.send_message(mail)
