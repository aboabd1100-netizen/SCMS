import logging
from flask import Flask, jsonify, request, send_from_directory, abort, redirect
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.exceptions import HTTPException
from .config import ROOT, DevelopmentConfig, ProductionConfig
from .extensions import db, migrate, limiter


def create_app(config=None):
    import os
    from urllib.parse import urlsplit
    environment = os.environ.get('SCMS_ENV', 'development')
    if environment not in ('development', 'production'):
        raise RuntimeError('SCMS_ENV must be development or production.')
    app = Flask(__name__, static_folder=None)
    production = environment == 'production'
    app.config.from_object(ProductionConfig if production else DevelopmentConfig)
    if config:
        app.config.update(config)
    if not app.config.get('SECRET_KEY') or len(app.config['SECRET_KEY']) < 32:
        raise RuntimeError('Set a random SECRET_KEY of at least 32 characters in .env.')
    if not str(app.config.get('SQLALCHEMY_DATABASE_URI', '')).startswith('postgresql+psycopg://'):
        raise RuntimeError('DATABASE_URL must use postgresql+psycopg://; no substitute database is configured.')
    if production:
        base = urlsplit(app.config['PUBLIC_BASE_URL'])
        if not app.config.get('TRUSTED_HOSTS') or not app.config['RATELIMIT_STORAGE_URI'].startswith(('redis://', 'rediss://')) or base.scheme != 'https' or not base.hostname or base.username or base.password or base.query or base.fragment or base.path not in ('', '/'):
            raise RuntimeError('Production requires TRUSTED_HOSTS, an HTTPS PUBLIC_BASE_URL and shared rate-limit storage.')
        if app.config.get('DEBUG') or app.config.get('TESTING') or not app.config['SESSION_COOKIE_SECURE'] or app.config['DEVELOPMENT_SEED'] or app.config['SECRET_KEY'].lower().startswith(('replace', 'change', 'example')):
            raise RuntimeError('Unsafe production configuration: debug, seeds, insecure cookies and placeholder secrets are forbidden.')
        if not any(base.hostname == h or (h.startswith('.') and (base.hostname == h[1:] or base.hostname.endswith(h))) for h in app.config['TRUSTED_HOSTS']):
            raise RuntimeError('PUBLIC_BASE_URL must be included in TRUSTED_HOSTS.')
    hops = app.config['PROXY_HOPS']
    if not isinstance(hops, int) or not 0 <= hops <= 3:
        raise RuntimeError('PROXY_HOPS must be between 0 and 3.')
    if hops:
        from werkzeug.middleware.proxy_fix import ProxyFix
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=hops, x_proto=hops, x_host=0, x_port=0, x_prefix=0)

    @app.before_request
    def require_https():
        # Health probes stay private HTTP; public traffic uses the configured origin.
        if production and not request.is_secure and request.path != '/api/health':
            return redirect(app.config['PUBLIC_BASE_URL'].rstrip('/') + request.full_path.rstrip('?'), code=308)
    db.init_app(app)
    migrate.init_app(app, db)
    limiter.init_app(app)
    from . import models  # register metadata for Alembic
    from .routes.auth import auth
    from .utils.security import load_identity, APIError, PERMISSIONS, ROLES
    from .routes.api import api
    app.register_blueprint(auth)
    app.register_blueprint(api)
    app.before_request(load_identity)
    from .commands import register_commands
    register_commands(app)

    @app.errorhandler(APIError)
    def api_error(error):
        db.session.rollback()
        if not request.path.startswith('/api/'):
            from flask import render_template
            return render_template('error.html',code=error.status,message=str(error),message_ar=error.ar),error.status
        return jsonify(success=False,message=str(error),message_ar=error.ar),error.status

    @app.get('/api/health')
    @limiter.exempt
    def health():
        db.session.execute(text('SELECT 1'))
        if production:
            if not limiter.storage.check():
                return jsonify(success=False, message='Service temporarily unavailable.'), 503
            if not db.session.get(models.AppState, 1):
                return jsonify(success=False, message='Service initialization required.'), 503
        return jsonify(success=True, data={'database': 'postgresql', 'status': 'ok'})

    @app.get('/')
    @app.get('/<path:filename>')
    @limiter.exempt
    def website(filename='index.html'):
        from flask import g, redirect, make_response
        # Reject aliases and documentation before serving files, including on Windows.
        from pathlib import PurePosixPath
        relative = PurePosixPath(filename)
        extensions = {'.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.svg', '.webp', '.json', '.ico', '.woff', '.woff2'}
        if '\\' in filename or any(p.startswith('.') for p in relative.parts) or relative.suffix not in extensions:
            abort(404)
        if filename.endswith('.html'):
            if len(relative.parts) != 1:
                abort(404)
            public={'index.html','login.html','signup.html','forgot-password.html'}
            customer={'customer.html','catalog.html','orders.html','tracking.html','offers.html','customer-notifications.html','profile.html'}
            modules={'admin':'dashboard','customer-orders':'orders','admin-offers':'offers','notifications':'notifications'}
            if filename not in public:
                if not g.user:return redirect('/login.html')
                page=filename[:-5]
                if filename not in customer:
                    module=modules.get(page,page)
                    roles=set(ROLES)-{'Customer'} if module in ('dashboard','notifications') else PERMISSIONS.get(module,{'Admin'})
                    if g.user.role.name not in roles:raise APIError('Access denied.','الوصول غير مسموح.',403)
            path=ROOT/'SC'/filename
            if path.is_file() and path.parent==ROOT/'SC':
                content=path.read_text(encoding='utf8')
                response=make_response(content);response.headers['Content-Type']='text/html; charset=utf-8';return response
        # Only the preserved frontend is public; source, secrets and backups are outside SC/.
        return send_from_directory(ROOT / 'SC', filename)

    @app.after_request
    def headers(response):
        from flask import g
        if g.get('session_cookie'):
            response.set_cookie(app.config['SESSION_COOKIE_NAME'],g.session_cookie,httponly=True,secure=app.config['SESSION_COOKIE_SECURE'],samesite='Lax',max_age=g.get('cookie_max_age'))
        if g.get('clear_cookie'):
            response.delete_cookie(app.config['SESSION_COOKIE_NAME'],httponly=True,secure=app.config['SESSION_COOKIE_SECURE'],samesite='Lax')
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['Referrer-Policy'] = 'same-origin'
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://tile.openstreetmap.org; connect-src 'self' https://router.project-osrm.org; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        if request.path.startswith('/api/') or response.mimetype == 'text/html':
            response.headers['Cache-Control'] = 'no-store'
        if app.config['SESSION_COOKIE_SECURE']:
            response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        return response

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify(success=False, message=error.description, message_ar='تعذر إتمام الطلب.'), error.code

    @app.errorhandler(SQLAlchemyError)
    def database_error(error):
        db.session.rollback()
        app.logger.error('Database request failed (%s)', type(error).__name__)
        return jsonify(success=False, message='Service temporarily unavailable.', message_ar='الخدمة غير متاحة مؤقتًا.'), 503

    @app.errorhandler(Exception)
    def unexpected_error(error):
        db.session.rollback()
        app.logger.error('Request failed (%s)', type(error).__name__)
        return jsonify(success=False, message='The request could not be completed.', message_ar='تعذر إتمام الطلب.'), 500

    return app
