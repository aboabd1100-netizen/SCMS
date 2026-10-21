# SCMS verification report — 2026-10-21

## Existing project and preservation

The project already contained the connected Flask/PostgreSQL implementation.
It was reused rather than rebuilt: 24 HTML routes, shared CSS/JavaScript,
22 related database tables and four Alembic migrations. Existing auth/API
Blueprints cover users, products, inventory, suppliers, warehouses, purchase
orders, customer orders, shipments, offers, notifications, reports and settings.
Inventory reservations are calculated from related order items; capacity and
other totals are derived from database records rather than duplicated fields.

The frontend API client keeps business records in memory and fetches PostgreSQL
data. Browser storage is limited to theme, language and display preferences.
Geographic data and the explicitly illustrative shipment animation remain
presentation assets. The homepage warehouse names/capacities now use the real
public database summary instead of a second sample warehouse dataset.

A private source ZIP and PostgreSQL dump were created under ignored
`backups/pre-production-20261021-192345/` before changes. Existing business data
was not reset. Tests rebuilt only `scms_test`. Hash comparisons confirmed that
all 24 HTML pages, CSS files and visual assets are unchanged (60 files total).
The official emerald/sand logo/theme logic is preserved.

## Requested status report

| Area | Verified status |
| --- | --- |
| 1. Backend | Existing modular Flask API reused; production guards and release commands added. |
| 2. PostgreSQL | Existing local setup reused; restricted role has no superuser/createdb/createrole privileges. Alembic is at `f507ceb23c33`, with no model/schema drift. |
| 3. Authentication | Argon2id passwords, registration, login, logout, opaque database sessions, CSRF tokens and single-use hashed password recovery retained and tested. |
| 4. Permissions | Six backend roles retained. Added supplier data isolation, blocked self-service supplier identity changes, and removed customer-visible internal product costs from every product read path. Cross-customer access is tested. |
| 5. Security controls | Server validation, SQLAlchemy queries, CSP/output escaping, CSRF, rate limits, private tracking, sanitized errors, hashed sessions, expiry/revocation and safe audit records. Production requires secure cookies, HTTPS origin, trusted hosts and Redis. |
| 6. Tests | 25 PostgreSQL integration/security tests passed; 192 Chrome page/language/theme/viewport checks passed; existing browser business workflow passed. Both dependency lock audits reported no known vulnerabilities. |
| 7. Remaining risks | Linux container/Gunicorn execution, hosted Redis and worker behavior, real HTTPS/TLS, SMTP delivery, provider backups/restore and production behavior have not been verified live. No Git repository/history was available to establish whether secrets were ever committed; current exclusions and deployment files were reviewed. |
| 8. Deployment | Docker/Gunicorn/Railway configuration prepared. Railway still reports uninstalled/unconnected; no external service was created or deployed. |
| 9. Public URL | None created. The running local app is `http://127.0.0.1:5000/`. |
| 10. Custom domain | Configuration and DNS/TLS instructions provided; no domain supplied or mapped. |
| 11. User action | Complete Railway's secure installation/authorization. A secure provider terminal is required for the first real administrator password; SMTP/domain providers may also require authorization. No credentials should be pasted into chat. |

This is **not yet a verified production release**. Local tests and an advisory
scan do not substitute for live hosting checks or an independent penetration
test. The deployment cannot be called production-ready until the outstanding
major controls are verified in its real environment.

## Added release protections

- Linux Gunicorn runs as an unprivileged container user, binds the hosting PORT,
  and omits paths/query strings from access logs to avoid recording reset tokens.
- Only runtime source/dependencies enter the container. Secrets, local database
  files, backups, development fixtures and test servers are excluded.
- Public static serving rejects documentation and alternate HTML path aliases.
  Private HTML and all API responses use `Cache-Control: no-store`.
- Production rejects debug/testing settings, insecure cookies, fixture seeding,
  placeholder secrets, invalid public origins and non-Redis rate-limit storage.
- Proxy protocol/client-IP trust has an explicit hop count; forwarded hosts
  are not trusted. HTTP redirects use the configured public HTTPS origin.
- `production-check` rejects privileged database roles, stale migrations,
  uninitialized settings, fixture accounts/known fixture passwords and failed
  Redis checks. Default development passwords are also rejected on production
  account creation/password changes.
- A scheduler command updates date-dependent offer alerts; supplier update
  notifications are database-backed, and supplier notifications no longer
  disclose unrelated customer-order or shipment information.

## Test evidence and limits

Python tests cover real PostgreSQL CRUD and foreign keys, transactional purchase
receipt/dispatch, rollback on capacity failures, concurrent stock reservation,
server-calculated prices, offer synchronization/visibility, six roles, customer
ownership, supplier scoping, CSRF, invalid values, session expiry/revocation,
registration/recovery, rate limits, production cookie flags, HTTPS/proxy guards,
secret-safe errors/audits, persistence across app restart and release preflight.

Chrome tests exercised all 24 pages at desktop/mobile widths, English/Arabic,
RTL/LTR and both themes; A-/A+ controls, official logo palette, database-backed
home warehouses, stored-XSS output escaping, confirmation cancellation,
confirmed logout, tracking and preference-only browser storage. The browser
workflow exercised warehouse/supplier/product creation, initial stock, PO
receipt, customer ordering, admin processing, shipment dispatch/delivery and
customer tracking. Browser writes were confined to `scms_test`.

Dependency audits used pip-audit against `requirements.lock` and
`requirements-production.lock`. Results are in ignored `.runtime/` files.
The production preflight's Redis failure/success branches were simulated in
tests; an actual hosted Redis connection remains a release requirement.

See [DEPLOYMENT.md](DEPLOYMENT.md) for exact setup, deployment, administrator,
SMTP, scheduler, live verification and custom-domain steps. Deployment details
were checked against [Railway Flask deployment](https://docs.railway.com/guides/flask),
[Railway config](https://docs.railway.com/config-as-code/reference) and
[Flask's proxy guidance](https://flask.palletsprojects.com/en/stable/deploying/proxy_fix/).
