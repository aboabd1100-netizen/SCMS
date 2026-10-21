# SCMS production deployment

The existing Flask API, PostgreSQL migrations and `SC/` frontend are reused.
Local development continues using `.env` and the existing PostgreSQL instance.
Public deployment and live HTTPS checks are pending provider authorization.

## Runtime

`Dockerfile` uses Python 3.13, `requirements-production.lock`, an unprivileged
user and explicit source copies. Secrets, fixtures and local database files are
excluded by `.dockerignore` and `.railwayignore`. Gunicorn binds `0.0.0.0:$PORT`
with two workers and four threads by default. Its logs exclude paths and query
strings so password reset tokens are not logged.

Gunicorn requires Linux. Local Windows development continues using `run.py` or
Waitress. The container build and Gunicorn startup still need verification on
the hosting platform; this Windows workspace has no configured Linux runtime.

## Railway configuration

Authorize Railway through its secure connection flow. Create/link an application
service and private PostgreSQL/Redis services. Reuse a suitable hosted database
when one exists. Preserve the local database; do not expose it publicly or copy
development accounts into production.

Configure these in Railway Variables, never in chat or source:

| Variable | Value |
| --- | --- |
| `SCMS_ENV` | `production` |
| `SECRET_KEY` | Fresh random secret of at least 32 characters |
| `DATABASE_URL` | Private PostgreSQL URL for a restricted application role |
| `RATELIMIT_STORAGE_URI` | Private Redis URL shared by all workers |
| `PUBLIC_BASE_URL` | Exact generated HTTPS origin |
| `TRUSTED_HOSTS` | Public hostname and `healthcheck.railway.app`, comma-separated |
| `PROXY_HOPS` | `1` only behind Railway's single trusted ingress |
| `PORT` | Supplied by Railway |

Standard `postgres://` and `postgresql://` URLs use the existing psycopg driver.
Disable public TCP proxies for PostgreSQL and Redis. Create an application role
with `NOSUPERUSER NOCREATEDB NOCREATEROLE` using the provider's secure database
console; do not configure the app with the unrestricted provider owner account.
Grant migration rights only in SCMS's database/schema. Separating migration
ownership from runtime DML grants is an additional hardening option.

Forwarded client IP/protocol headers are trusted only for `PROXY_HOPS`. Do not
expose Gunicorn around the trusted ingress. Local direct access uses zero hops.

`railway.json` runs these pre-deploy commands in order:

```sh
python -m flask --app run db upgrade
python -m flask --app run init-system
python -m flask --app run production-check
```

The preflight rejects globally privileged database roles, stale migrations,
missing initialization, development accounts/passwords and unavailable Redis.
It does not verify external HTTPS, SMTP, DNS or backups. Never run `seed.py` in
production. Create the first real administrator in a secure provider terminal:

```sh
python -m flask --app run create-admin
```

The password prompt does not echo. Do not put passwords in command arguments or
chat. Configure a separate scheduled service with the same private variables and
no public domain, running every five minutes:

```sh
python -m flask --app run refresh-notifications
```

This refreshes date-dependent offer alerts without requiring a business write.
Stock/order/shipment alerts already update transactionally.

## Recovery email

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, and `MAIL_FROM`
in provider variables. SMTP uses verified STARTTLS. Verify delivery and the
single-use reset flow with a mailbox you control. Until configured, recovery
explicitly reports that the service is unavailable.

## Local verification

```powershell
.venv\Scripts\python scripts\setup_database.py
.venv\Scripts\python -m flask --app run db upgrade
.venv\Scripts\python -m flask --app run db check
.venv\Scripts\python -m pytest tests -q -p no:cacheprovider
```

Python tests rebuild only `scms_test`. After they finish, start the isolated
browser server, then run browser checks sequentially from another terminal:

```powershell
.venv\Scripts\python scripts\browser_test_server.py --reset-test-database
# Another terminal:
node verify-production-browser.cjs
node verify-fullstack-workflow.cjs
```

This server binds only `127.0.0.1:5002`; never expose it publicly. The working
database served at port 5000 remains untouched. Audit both lock files with
`pip-audit`; a clean advisory scan does not guarantee application security.

## Live release and domain checks

Verify the container build, deployment logs, `/api/health`, TLS certificate, HTTP
redirect, Secure/HttpOnly/SameSite cookies, rate limits across workers, role
denials, CSRF, and public tracking privacy. Use separate browsers for CRUD,
orders, receipt, dispatch/delivery, offers and notifications. Restart the service
and confirm persistence. Test Arabic/English, RTL/LTR, both themes/logo, A-/A+
controls, responsive layouts and mixed-content absence.

Enable provider backups and verify restoration into a separate database. Set
spending limits and monitoring. Configure SMTP and a real administrator before
operational use. These external checks remain outstanding until deployment.

For a custom domain: add it in Railway, apply its generated DNS records, wait
for certificate issuance, add its hostname to `TRUSTED_HOSTS`, and set its HTTPS
origin as `PUBLIC_BASE_URL`. Recheck certificate and redirects. No custom domain
has been provided or connected yet.

References: [Railway Flask](https://docs.railway.com/guides/flask),
[deployment configuration](https://docs.railway.com/config-as-code/reference),
[health checks](https://docs.railway.com/deployments/healthchecks), and
[Flask proxy trust](https://flask.palletsprojects.com/en/stable/deploying/proxy_fix/).
