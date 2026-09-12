# VAM Backend — Voucher Approval API

Production-grade **Express.js REST API** for the voucher approval workflow of the General Accounting & ERP system. The backend owns every business rule: authentication, company isolation, role/access permission checks, validations, status transitions, transactions and the audit trail. The mobile app stays a thin client.

---

## Table of contents

1. [Stack](#stack)
2. [Architecture](#architecture)
3. [Key design decisions](#key-design-decisions)
4. [Database (migrations)](#database-migrations)
5. [Setup](#setup)
6. [Deployment](#deployment)
7. [API overview](#api-overview)
8. [Authorization model](#authorization-model)
9. [Voucher state machine](#voucher-state-machine)
10. [Timezone rules](#timezone-rules)
11. [Error format](#error-format)
12. [Security](#security)
13. [Testing](#testing)
14. [Project layout](#project-layout)

---

## Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js >= 18 |
| Framework | Express 4 |
| Database driver | `pg` (connection pool) |
| Validation | Zod |
| Auth | `jsonwebtoken` (JWT bearer) |
| Password hashing | `bcryptjs` |
| Timezones | `luxon` |
| API docs | `swagger-jsdoc` + `swagger-ui-express` |
| Security | `helmet`, `cors`, `express-rate-limit` |
| Tests | Jest + Supertest (real PostgreSQL) |

---

## Architecture

The request pipeline is strictly layered:

```
Client
  └─ Routes (routing + swagger docs)
        └─ Middleware (JWT → authorization → validation)
              └─ Controllers (thin HTTP adapters)
                    └─ Services (business rules, transactions)
                          └─ Repositories (parameterized SQL)
                                └─ PostgreSQL
                                    (error middleware converts all failures to one JSON shape)
```

Why this shape:

- **Routes** never touch SQL or business logic; each route only wires validators, middleware and a controller.
- **Middleware** guarantees authentication and authorization are enforced *before* a controller can run. `authenticateJWT` loads the user **from the database** on every request, so deactivated accounts and role/access changes take effect immediately and cannot be bypassed by token contents.
- **Services** contain all business rules (company access checks, status transitions, audit writes, timezone-bound "today"). This is where accept/reject transactions live.
- **Repositories** are the only layer that talks SQL. Every query is parameterized; no string concatenation with user input.
- The **error middleware** is centralized — no controller decides error formatting.

Every company-scoped endpoint verifies the user's company access **server-side**. The client can never select a `companyId` it is not allowed to use.

---

## Key design decisions

### Company isolation, future-proofed
`users.company_id` is the primary company (unchanged). A new `user_companies` mapping table lets a user access multiple companies later. The server resolves access as *primary company + mapping* (`UNION`), so the API and authorization code already support multi-company without restructuring.

### Audit trail over denormalized columns
A `voucher_status_history` table records `old_status`, `new_status`, `remark`, `changed_by`, `changed_at` for every transition. This is better than `approved_by / approved_at / rejected_by / rejected_at` on `vouchers` because a voucher can pass through multiple workflow states (Pending → Accepted → Re-opened → Re-approved) without schema changes.

### Race-safe accept/reject
Each transition runs inside a single PostgreSQL transaction:

```
BEGIN
  SELECT voucher ... FOR UPDATE        -- serialize concurrent transitions
  verify voucher exists                -- 404
  verify company access                -- 403
  verify status == 'PENDING'           -- 409
  UPDATE vouchers SET status=?, remark=?
    WHERE voucher_id=? AND status='PENDING'
  if rowCount != 1 -> 409              -- belt-and-braces optimistic guard
  INSERT voucher_status_history
COMMIT
```

If any step fails the transaction **rolls back**, so a voucher update can never exist without its audit row. If two users approve the same voucher at once, exactly one receives `200`, the other `409 VOUCHER_ALREADY_PROCESSED`.

### Statuses are backend-controlled
The API only exposes `POST /vouchers/:id/accept` and `…/reject`. The client can never post an arbitrary status string. Valid statuses are `PENDING`, `ACCEPTED`, `REJECTED`, enforced both by a DB `CHECK` constraint and by Zod enums.

### "Today" is deterministic
The application declares `APP_TIMEZONE` (e.g. `Asia/Kolkata`). Date bounds are computed in that zone with Luxon and compared against `created_at` timestamptz as absolute instants. `2026-09-12 00:30 IST` is Day `2026-09-12`, never Day `2026-09-11`, regardless of the server's timezone.

---

## Database (migrations)

Migrations are additive; **existing data is preserved**.

- `supabase/migrations/20260912000000_base_schema.sql` — the original ERP schema from `Mdb.sql` made idempotent (`IF NOT EXISTS` indexes, `ON CONFLICT DO NOTHING` lookups).
- `supabase/migrations/20260912000001_voucher_approval_workflow.sql` — approval workflow:

| Change | What & why |
|---|---|
| `vouchers.status VARCHAR(20) NOT NULL DEFAULT 'PENDING'` + `CHECK (status IN ('PENDING','ACCEPTED','REJECTED'))` | The base schema has **no workflow status**. Existing rows backfill to `PENDING`. |
| `voucher_status_history` | Full audit trail: `old_status`, `new_status`, `remark`, `changed_by`, `changed_at` with FK + indexes. |
| `user_companies` | Future multi-company access; seeded from existing `users.company_id`. |
| `idx_vouchers_company_created (company_id, created_at)` | Serves the summary `GROUP BY status` over a day range. |
| `idx_vouchers_company_status_created (company_id, status, created_at)` | Serves list filtering by company + status + day range. Its left prefix covers `(company_id, status)`, so no separate `(company_id, status)` index is added. |

Existing indexes on `inventory_entries(voucher_id)` and `ledger_entries(voucher_id)` already cover the detail queries.

---

## Setup

```bash
npm install

# 1. Configure environment
cp .env.example .env
#   edit .env: DATABASE_*, JWT_SECRET, APP_TIMEZONE, ALLOWED_ORIGINS

# 2. Create the database and apply migrations
npm run migrate

# 3. Run the API
npm run dev          # development (nodemon)
npm start            # production-style start: applies migrations, then boots
```

- API: `http://localhost:10000`
- Swagger UI: `http://localhost:10000/api-docs`
- Health: `GET /health` (lightweight, no auth; `/api/health` also works)

### Environment variables

```env
PORT=10000
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=erp
DATABASE_USER=postgres
DATABASE_PASSWORD=
JWT_SECRET=change-me-to-a-long-random-string
JWT_EXPIRES_IN=1d
APP_TIMEZONE=Asia/Kolkata
ALLOWED_ORIGINS=*
LOGIN_RATE_WINDOW_MS=900000
LOGIN_RATE_MAX=20
API_RATE_WINDOW_MS=900000
API_RATE_MAX=500
```

`DATABASE_URL` may be supplied instead of the individual `DATABASE_*` values. Never commit real secrets; `.env` is gitignored.

---

## Deployment

The full production walkthrough lives in **[DEPLOYMENT.md](./DEPLOYMENT.md)**: schema import into Supabase PostgreSQL (SQL Editor / `npm run migrate` / `psql`), hosting recommendation, transaction-pooler connection string, credentials, Supabase Auth vs. our custom JWT, and step-by-step deploy to Render with exact PowerShell commands.

Recommended architecture: **Supabase for PostgreSQL** (transaction pooler on port 6543), **Render** (Docker web service) for Express, and **the repository's own JWT auth** (users + bcrypt + HS256 in Express).

The repo ships production artifacts: `Dockerfile`, `dockerignore` (`.dockerignore`), `render.yaml` (Render Blueprint), `Procfile` (Railway/Fly), `scripts/start.js` (migrate-then-boot) and a `DATABASE_URL`/`DATABASE_SSL`/`PGPOOL_MAX`-aware pool in `src/config/database.js`.

---

## API overview

All endpoints except `login` and the `/health` probe require `Authorization: Bearer <JWT>`.

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/auth/login` | Authenticate, returns JWT + user + companies | — |
| GET | `/health` */ `/api/health` | Liveness probe (no auth, no DB) | — |
| GET | `/api/companies` | Companies accessible to the user | ✅ |
| GET | `/api/companies/:companyId/vouchers/summary?date=` | Daily counts by status | ✅ + company |
| GET | `/api/companies/:companyId/vouchers?status=&date=&search=&page=&limit=` | Lightweight paginated list | ✅ + company |
| GET | `/api/vouchers/:voucherId` | Full voucher (header + inventory + ledgers) | ✅ + company |
| POST | `/api/vouchers/:voucherId/accept` | `{ "remark": "..." }` → ACCEPTED | ✅ + permission |
| POST | `/api/vouchers/:voucherId/reject` | `{ "remark": "..." }` → REJECTED | ✅ + permission |

### Login (`POST /api/auth/login`)

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "JWT_TOKEN",
    "user": {
      "userId": 1,
      "name": "John",
      "email": "user@example.com",
      "role": "Accountant",
      "level": "Level 1",
      "accessType": "Read-Write"
    },
    "companies": [{ "companyId": 1, "companyName": "ABC Enterprises" }]
  }
}
```

`password_hash` is never returned. Failures return a generic `401 INVALID_CREDENTIALS`; inactive accounts return `401 ACCOUNT_INACTIVE`.

### Summary (`GET /api/companies/:companyId/vouchers/summary`)

```json
{
  "success": true,
  "data": {
    "date": "2026-09-12",
    "companyId": 1,
    "counts": { "PENDING": 25, "ACCEPTED": 40, "REJECTED": 5 }
  }
}
```

Counts come from a single `COUNT(*) … GROUP BY status` query — rows are never counted in JavaScript.

### List (`GET /api/companies/:companyId/vouchers`)

Query params: `status` (enum), `date` (YYYY-MM-DD), `search` (voucher number / party ledger name, `ILIKE`), `page` (≥1), `limit` (1–100).

```json
{
  "success": true,
  "data": [
    {
      "voucherId": 101,
      "voucherNumber": "INV-1001",
      "partyLedgerName": "ABC Traders",
      "amount": 12500.0,
      "status": "PENDING"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 25, "totalPages": 2, "hasNextPage": true, "hasPreviousPage": false }
}
```

Ordered by `voucher_id DESC` for stable pagination. Lightweight by design — no inventory/ledger rows. The pagination object also reports `hasNextPage` / `hasPreviousPage` for simple clients (e.g. `hasNextPage: page * limit < total`).

### Detail (`GET /api/vouchers/:voucherId`)

Returns the header (voucher number, type, party ledger, bill/ship-to, place of supply, cost center, total amount, narration, remark, status, created-by name, created-at), `inventoryEntries` (stock item name, qty, rate, inclusive rate, discount %, amount) and `ledgerEntries` (ledger name, amount, DR/CR). Uses SQL joins, three queries total.

### Accept / Reject

```bash
curl -X POST http://localhost:10000/api/vouchers/101/accept \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"remark":"Verified and approved."}'
```

- `remark` is mandatory, trimmed, 1–2000 chars; empty/whitespace-only → `400 VALIDATION_ERROR`.
- Already processed (not `PENDING`) → `409 VOUCHER_ALREADY_PROCESSED`.
- Non-existent voucher → `404 VOUCHER_NOT_FOUND`.
- No permission / wrong company → `403 FORBIDDEN`.

Response:

```json
{
  "success": true,
  "message": "Voucher accepted successfully",
  "data": {
    "voucherId": 101,
    "voucherNumber": "INV-1001",
    "status": "ACCEPTED",
    "remark": "Verified and approved."
  }
}
```

---

## Authorization model

Middleware order: `authenticateJWT` → `authorizeCompanyAccess` / `authorizeVoucherAction` → validator → controller.

1. **Valid JWT** — token must verify with `JWT_SECRET` and reference an existing **active** user (fetched fresh from DB).
2. **Company access** — `:companyId` must be in the user's server-resolved company set; otherwise `403`.
3. **Voucher action permission** — accept/reject requires:

| Role | Read-Write / Full-Control | Read-Only |
|---|---|---|
| Admin | ✅ | ✅ |
| Accountant | ✅ | ❌ |
| Viewer | ❌ | ❌ |

4. **Voucher ownership** — for voucher-scoped endpoints, the voucher's `company_id` must be accessible to the user.

Role, `access_type`, and `companyId` are never trusted from the client.

---

## Voucher state machine

```
PENDING ──accept──► ACCEPTED
   │                 
   └──reject──► REJECTED
```

The `voucher_status_history` table already supports future transitions (e.g. PENDING → ACCEPTED → REOPENED → ACCEPTED). Adding a state is an additive migration (`CHECK` list update) plus extending `constants` — no redesign.

---

## Timezone rules

- `APP_TIMEZONE` (default `Asia/Kolkata`) defines the business day for the app.
- Reference date bounds are converted to absolute instants and compared with `created_at` (`timestamptz`). The server/database machine clock never leaks into date boundaries.
- Omitted `date` = *today* in `APP_TIMEZONE`.
- Explicit `date` must be a valid calendar date (`YYYY-MM-DD`), otherwise `400 VALIDATION_ERROR`.

---

## Error format

```json
{
  "success": false,
  "message": "Remark is mandatory.",
  "errorCode": "VALIDATION_ERROR",
  "details": { "fieldErrors": { "remark": ["Remark is mandatory."] } }
}
```

| HTTP | Meaning | Example errorCode |
|---|---|---|
| 200 | Success | — |
| 201 | Created | — |
| 400 | Validation | `VALIDATION_ERROR`, `INVALID_DATE` |
| 401 | Unauthenticated | `UNAUTHORIZED`, `INVALID_TOKEN`, `INVALID_CREDENTIALS`, `ACCOUNT_INACTIVE` |
| 403 | Forbidden | `FORBIDDEN` |
| 404 | Not found | `VOUCHER_NOT_FOUND`, `NOT_FOUND` |
| 409 | Conflict | `VOUCHER_ALREADY_PROCESSED`, `CONFLICT` |
| 422 | Business validation | — |
| 429 | Rate limited | `RATE_LIMITED` |
| 500 | Internal | `INTERNAL_SERVER_ERROR` |

PostgreSQL errors, stack traces and SQL text are never exposed to the client.

---

## Security

- Passwords hashed with bcrypt; plaintext never compared or logged.
- `helmet`, CORS origin allow-list, login rate limit (default 20 / 15 min) and API-wide rate limit.
- All SQL parameterized; LIKE wildcards escaped in search.
- JWT secret via environment only, with configurable expiry (`JWT_EXPIRES_IN`).
- `express.json({ limit: '1mb' })` body cap.
- No secrets in the repository (`.env`/`.env.test` are gitignored).

---

## Testing

40 integration tests run against a real PostgreSQL database (`vam_backend_test`, created & migrated automatically, then reset each run).

```bash
npm test
```

Covers: successful login, wrong password, inactive user, missing/existing validation, invalid/missing JWT, cross-company isolation (403), approval permission (403), summary counts, status + date + search + pagination filtering, invalid dates, full voucher detail, accept/reject with valid, missing, empty and whitespace remarks, accepting already-processed vouchers, non-existent voucher IDs, **and concurrent double-approval** (one `200`, one `409`, exactly one audit row).

---

## Project layout

```
src/
├── config/          environment.js, database.js (pool + withTransaction), swagger.js
├── constants/       statuses, roles, access types, permission helper
├── controllers/     auth, company, voucher (thin HTTP adapters)
├── routes/          auth, company, voucher (+ Swagger @swagger annotations)
├── services/        auth, company, voucher (business rules + transactions)
├── repositories/    user, company, voucher (parameterized SQL only)
├── middleware/      auth (JWT), authorization, validation, error handling
├── validators/      Zod schemas for every input
├── utils/           AppError, asyncHandler, apiResponse, timezone
├── app.js           express assembly
└── server.js        bootstrap + graceful shutdown

supabase/migrations/  20260912000000_base_schema.sql, 20260912000001_voucher_approval_workflow.sql
test/                jest globalSetup + helpers + 40 API tests
scripts/             runMigrations.js, start.js (migrate-then-boot)
```

### Deployment files

```
Dockerfile           node:20-alpine multi-stage image, non-root user, /health probe
.dockerignore        excludes node_modules, .env, tests, docs
render.yaml          Render Blueprint (Docker web service, health check, secrets)
Procfile             web: node scripts/start.js  (Railway / Fly)
DEPLOYMENT.md        full Supabase + Render deployment guide
```