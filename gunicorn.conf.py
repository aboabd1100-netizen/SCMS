"""Linux production entry point; HTTPS terminates at the hosting ingress."""
import os

bind = '0.0.0.0:' + os.environ.get('PORT', '8000')
workers = int(os.environ.get('WEB_CONCURRENCY', '2'))
worker_class = 'gthread'
threads = int(os.environ.get('GUNICORN_THREADS', '4'))
timeout = 60
graceful_timeout = 30
max_requests = 1000
max_requests_jitter = 100
# ProxyFix has an explicit hop count. Gunicorn must not independently trust headers.
forwarded_allow_ips = ''
secure_scheme_headers = {}
# Do not log paths/query strings: recovery links can contain secrets.
accesslog = '-'
access_log_format = '%(t)s %(m)s %(s)s %(L)s'
errorlog = '-'
capture_output = False
