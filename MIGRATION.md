# SCMS incremental migration

## Existing project inventory

The `SC/` directory contains 24 HTML routes: public home, login, signup and forgot-password; admin/dashboard aliases; inventory, suppliers, warehouses, purchase orders, customer orders, shipments, offers, notifications, users, reports, settings; customer dashboard, catalog, orders, tracking, offers, notifications and profile.

`scms-ui.js` renders existing forms, navigation, KPI cards, charts and dialogs. `app.js` supplies translations. `scms-store.js` currently owns a versioned `scms-state-v2` localStorage database and `scms-session-v2` simulated sessions. Business transactions already connect stock reservations, PO receipts, orders, shipments, offers, alerts and snapshots. Customer notifications derive from events plus live warnings and per-user read flags. Home offers share that store; guest tracking reads the same shipments. `scms-maps.js` uses saved Saudi geography/road routes and optional OSM tiles.

Shared CSS includes styles/scms/layout, home enhancements, logo, footer, theme, refinements, display, color-system, form-feedback and header-layout. Theme, language and font-size preferences are browser-local; numbers/dates use explicit Arabic/English formatting. The current Navy/Cyan theme, header, footer, localization and A−/A+ controls must stay intact.

## Recovery

`backups/SC-before-fullstack.zip` preserves the complete working frontend before backend migration. Existing browser business records are not automatically erased or imported. Seed records are explicit development fixtures, never a production fallback.

## Gates (in requested order)

1. Analysis and recovery backup.
2. Flask application factory, configuration, Blueprints and consistent API/errors.
3. Local PostgreSQL connection.
4. Alembic migration applied and verified on PostgreSQL.
5. Authentication: Argon2 passwords, opaque database sessions, CSRF and rate limits.
6. Server-side roles and route ownership.
7. Users.
8. Warehouses.
9. Suppliers.
10. Products/inventory.
11. Purchase orders and transactional receipts.
12. Customer orders and atomic reservations.
13. Shipments and transactional dispatch/delivery.
14. Safe public tracking.
15. Database offers, connected admin/home pages.
16. Database notifications and deduplicated stock alerts.
17. Reports and real aggregate data.
18. Audit logs.
19. Security review.
20. Remove obsolete browser business storage only after gates pass.
21. Final independent-session and browser integration checks.

For each gate: build API/model → connect the existing UI → test PostgreSQL writes/reads and related views → remove that module's obsolete local-store path. No business mutation may rely on a client-supplied role, stock total, order price or calculated discount. Database transactions must protect reservations, receipts and dispatch from races.

## Status

All migration gates are implemented. PostgreSQL is installed locally, all Alembic migrations are applied, and the API-only frontend is the active implementation. The prior store remains recoverable in the backup archive, not as a served fallback.

Verified: 11 PostgreSQL integration tests; six-role authorization; atomic receipt/dispatch, rollback and concurrent reservations; hashed single-use password recovery; CSRF/rate limits/cookie flags; all 24 routes in both languages and themes; existing UI forms through customer delivery; offers synchronized with an independent anonymous Chrome profile; public tracking with private fields excluded. The database schema check reports no pending model changes. Browser storage is now used only for display/language preferences.

SMTP and production hosting are configuration prerequisites, not simulated services. The old static-server origin's existing browser records are preserved for manual review, not silently imported or erased. The new app does not read them.

## Production preparation — 2026-10-21

Existing Flask/PostgreSQL modules were reused and hardened. Gunicorn, an explicit
runtime container, Railway configuration and a release preflight are now present.
Local validation passes 25 integration/security tests and 192 browser checks,
plus the existing end-to-end business workflow. No schema changes were needed.

Public deployment remains pending Railway's confirmed secure authorization and
live HTTPS/security checks. See `SECURITY_REVIEW.md` for the complete status and
`DEPLOYMENT.md` for deployment and custom-domain instructions.
