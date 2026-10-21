# SCMS — Smart Supply Chain Management System

The existing 24-page Navy/Cyan interface now uses Flask and PostgreSQL. English/Arabic, RTL/LTR, Light/Dark, inline validation, maps, footer and A−/A+ controls retain their existing presentation. Business records and sessions live in PostgreSQL, not browser storage.

## Run this workspace

The isolated environment, local PostgreSQL cluster, migrations and development fixtures have been prepared:

```powershell
.venv\Scripts\python scripts\setup_database.py
.venv\Scripts\python -m flask --app run db upgrade
.venv\Scripts\python run.py
```

Open **http://127.0.0.1:5000/**. A plain static server cannot provide the backend APIs.

Local development seed accounts only:

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@scms.io | Admin@12345 |
| Customer | customer@scms.io | Customer@12345 |

These are development fixtures, never production defaults. Credentials are not displayed on the Login page. Seeding is explicit and disabled in production.

## New installation

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Set a randomly generated `SECRET_KEY` and a PostgreSQL `DATABASE_URL` with a non-superuser account. Create the database using your PostgreSQL administrator. The workspace-local instance is bound only to `127.0.0.1:54329`; its files are under `.runtime/pgdata`, runtime binaries under `tools/postgres`, and generated credentials in ignored `.env`/`.runtime` files. Do not commit or share those directories.

For a standard PostgreSQL installation, open `psql -U postgres` and run (replace the placeholder password):

```sql
CREATE ROLE scms LOGIN PASSWORD 'choose-a-strong-local-password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE scms OWNER scms;
CREATE DATABASE scms_test OWNER scms;
```

Set `.env` to `postgresql+psycopg://scms:<URL-encoded-password>@127.0.0.1:5432/scms` for that installation. `scripts/setup_database.py` is specifically for the already-extracted workspace runtime; it does not install a system service. For remote production PostgreSQL, configure TLS according to the database provider, such as `?sslmode=require` in the connection URL.

```powershell
.venv\Scripts\python -m flask --app run db upgrade
.venv\Scripts\python -m flask --app run init-system
.venv\Scripts\python -m flask --app run create-admin
# Development only, optional:
.venv\Scripts\python seed.py
.venv\Scripts\python run.py
```

`seed.py` is idempotent: it creates missing development records without overwriting existing records. It includes Saudi suppliers, eight warehouses, stock, orders, shipments and promotions.

To stop the workspace-local database:

```powershell
& tools\postgres\pgsql\bin\pg_ctl.exe -D .runtime\pgdata -m fast stop
```

## Architecture and APIs

- `app/`: Flask factory/config, SQLAlchemy models, resource/auth Blueprints, domain services, validation and security.
- `migrations/`: versioned Alembic migrations. No runtime `create_all` or silent schema replacement.
- `SC/`: preserved UI; `scms-store.js` is now an in-memory API client.
- `fixtures/development.json`: explicit seed fixtures; never served publicly.
- `tests/`: PostgreSQL integration/security/concurrency checks against `scms_test` only.
- `backups/SC-before-fullstack.zip`: recoverable pre-migration UI; not served.

Responses use `{success:true,data:...}` or `{success:false,message:...,message_ar:...}`. Mutations require the session's CSRF header. Sessions use opaque HttpOnly cookies with hashed database tokens; JavaScript receives only the CSRF token and safe account fields.

Major endpoints:

| Purpose | Endpoint |
| --- | --- |
| Authentication | `/api/auth/session`, `/login`, `/register`, `/logout`, `/password` under `/api/auth` |
| Recovery | `/api/auth/recovery`, `/api/auth/reset` |
| Current authorized UI data | `GET /api/state` |
| CRUD | `/api/users`, `/warehouses`, `/suppliers`, `/products`, `/inventory`, `/purchase-orders`, `/orders`, `/shipments`, `/offers` under `/api` |
| Existing form adapter | `POST /api/editor/<kind>` |
| Public tracking | `GET /api/shipments/track/<tracking-number>` |
| Stock transfer | `POST /api/inventory/transfer` |
| Notifications | `GET /api/notifications`, `POST /api/notifications/read` |
| Profile/settings | `PUT /api/profile`, `PUT /api/settings` |
| Reports/audit | `GET /api/reports`, `GET /api/audit` |
| Public aggregates | `GET /api/public/summary` |

Public tracking exposes city-level origin/destination, carrier, status, ETA and status timestamps. Customer addresses, order/customer IDs, internal tracking descriptions and credentials are excluded. Public Home Page offers and admin offers use the same tables. Open pages poll the database every five seconds for updates across users/browsers.

Prices, discounts, stock availability, roles and status transitions are recalculated/validated server-side. A locked database transaction coordinates business writes, stock reservations, dispatch, receipts, inventory movements, snapshots, alerts and audit entries. Repeat receipt/dispatch transitions are rejected. Referentially linked records cannot be hard-deleted; users are disabled instead of deleting their audit history.

## Tests

Create a dedicated database named `scms_test`, owned by the application account. Tests refuse to recreate any other database. They apply the real migrations and rebuild only that test schema:

```powershell
.venv\Scripts\python -m pytest tests -q
node verify-fullstack-pages.cjs
node verify-fullstack-browser.cjs
```

Browser verification requires locally installed Chrome and a running Flask server on port 5000. Older `verify-*.cjs` files describe the original prototype and may assume browser-local APIs that have deliberately been retired.

## Production preparation

The Linux/Gunicorn container and Railway configuration are provided. Follow
[DEPLOYMENT.md](DEPLOYMENT.md) for private PostgreSQL/Redis configuration, secure
administrator creation, release preflight, browser tests and custom domains.
Public deployment is pending Railway authorization and live release verification.

Use a production PostgreSQL database and a fresh random secret. Set `SCMS_ENV=production`, HTTPS `PUBLIC_BASE_URL`, `TRUSTED_HOSTS`, and a shared Redis `RATELIMIT_STORAGE_URI`. Production startup rejects missing hosts or in-memory rate-limit storage. Cookies become Secure, HttpOnly, SameSite=Lax; HSTS is enabled. Run migrations and `init-system`, then create a real administrator interactively; do **not** seed development accounts.

For Linux production, the container starts Gunicorn using the platform's `PORT`.
For a Windows server, Waitress remains available behind a trusted HTTPS reverse proxy:

```powershell
.venv\Scripts\waitress-serve --host=127.0.0.1 --port=5000 run:app
```

Configure the proxy to preserve the intended host; forwarded headers are not blindly trusted. Database backups, certificate/domain setup, Redis, SMTP credentials, monitoring and operational deployment remain environment-specific configuration. No public deployment is performed by the local setup.

Password recovery uses hashed, expiring, single-use database tokens, encrypted SMTP transport and session revocation. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `MAIL_FROM`, and HTTPS `PUBLIC_BASE_URL`. Without SMTP, the recovery page explicitly reports that email recovery is unavailable rather than claiming an email was sent. Passwords/reset tokens are not logged.

## Previous browser records

The app never automatically imports untrusted prototype records or client password hashes into the real database. Existing data on the former static-server origin is left untouched for recovery; new application sessions never read or write it. Review/export any important prototype records before clearing that old origin. Only theme, language and font/display preferences remain browser-local in the new app.
