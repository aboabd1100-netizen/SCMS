import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / '.env')


def database_url(value):
    # Hosting providers commonly supply PostgreSQL's standard URI scheme.
    for prefix in ('postgres://', 'postgresql://'):
        if value and value.startswith(prefix):
            return 'postgresql+psycopg://' + value[len(prefix):]
    return value


class DevelopmentConfig:
    SECRET_KEY = os.environ.get('SECRET_KEY')
    SQLALCHEMY_DATABASE_URI = database_url(os.environ.get('DATABASE_URL'))
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {'pool_pre_ping': True}
    SESSION_COOKIE_NAME = 'scms_session'
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SECURE = False
    SESSION_COOKIE_SAMESITE = 'Lax'
    MAX_CONTENT_LENGTH = 1024 * 1024
    RATELIMIT_STORAGE_URI = os.environ.get('RATELIMIT_STORAGE_URI', 'memory://')
    DEVELOPMENT_SEED = True
    TESTING = False
    PROXY_HOPS = int(os.environ.get('PROXY_HOPS', '0'))
    SMTP_HOST = os.environ.get('SMTP_HOST')
    SMTP_PORT = int(os.environ.get('SMTP_PORT','587'))
    SMTP_USERNAME = os.environ.get('SMTP_USERNAME')
    SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD')
    MAIL_FROM = os.environ.get('MAIL_FROM')
    PUBLIC_BASE_URL = os.environ.get('PUBLIC_BASE_URL','http://127.0.0.1:5000')


class ProductionConfig(DevelopmentConfig):
    DEBUG = False
    SESSION_COOKIE_SECURE = True
    DEVELOPMENT_SEED = False
    FULLSTACK_ENABLED = True
    TRUSTED_HOSTS = [h.strip() for h in os.environ.get('TRUSTED_HOSTS', '').split(',') if h.strip()]
