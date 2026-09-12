# Deployment — Supabase + Express.js + Render

Production deployment guide for the Voucher Approval API built in this repo.

**Final recommendation (tl;dr):**

> For this project use **Supabase PostgreSQL** for the database, **Render** (Docker web service) for the Express.js API, and **our own custom JWT authentication** running inside Express.

Everything below explains *why* and gives the exact commands to get from this local project to a public HTTPS API consumed by the mobile app.

---

## 1. Supabase PostgreSQL

### Create the project

1. Sign up at https://supabase.com → **New project**.
2. Choose a name, region, and a **strong database password** (store it in a password manager — you will not see it again).
3. Save the **Project Ref** (the short id in the project URL, e.g. `https://<ref>.supabase.co`).

### Import this schema

This repo ships versioned, idempotent migrations:

- `supabase/migrations/20260912000000_base_schema.sql` — core ERP tables (`companies`, `users`, `roles`, `user_levels`, `access_types`, `ledgers`, `stock_items`, `vouchers`, `inventory_entries`, `ledger_entries`) + lookup seeds.
- `supabase/migrations/20260912000001_voucher_approval_workflow.sql` — the approval workflow changes:
  - `vouchers.status` column + `CHECK (status IN ('PENDING','ACCEPTED','REJECTED'))`
  - `voucher_status_history` audit table (FK to vouchers/users + per-row `CHECK`s + indexes)
  - `user_companies` mapping table for future multi-company access
  - query-pattern indexes `(company_id, created_at)` and `(company_id, status, created_at)`

Run them **in order** using any of these three options:

**Option A — Supabase SQL Editor (easiest for one person):**
1. Dashboard → **SQL Editor** → New query.
2. Paste the entire contents of `000_base_schema.sql`, click **Run**.
3. Repeat for `001_voucher_approval_workflow.sql`.

**Option B — this repo's runner (recommended; runs both in order automatically):**

```powershell
# Windows PowerShell — set the connection once for the session
$env:DATABASE_URL = "postgresql://postgres.<ref>:<db-password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"
npm run migrate
```

**Option C — psql (if installed):**

```powershell
$env:DATABASE_URL = "postgresql://postgres.<ref>:<db-password>@db.<ref>.supabase.co:5432/postgres"
psql $env:DATABASE_URL -f migrations\000_base_schema.sql
psql $env:DATABASE_URL -f migrations\001_voucher_approval_workflow.sql
```

> The migrations are additive and idempotent: re-running them is safe and never destroys existing data.

### Foreign keys, indexes, constraints — how they end up there

They are defined *inside* the migration files, so importing the files brings everything across:

| Concern | Where it is defined |
|---|---|
| FKs (`vouchers.company_id → companies`, `users.role_id → roles`, detail rows → `vouchers` …) | `000_base_schema.sql` + `001` |
| `voucher_status_history` FKs + `CHECK`s | `001_voucher_approval_workflow.sql` |
| Lookup values (`Admin/Accountant/Viewer`, levels, access types) | seeded in `000` / `001` with `ON CONFLICT DO NOTHING` |
| Standard indexes | `000` (users.email, company/type/entry indexes) |
| Approval/workflow indexes | `001` (`(company_id, created_at)`, `(company_id, status, created_at)`, history indexes) |

Verify after import:

```sql
SELECT conname, conrelid::regclass FROM pg_constraint WHERE conname LIKE 'chk_vouchers_status%' OR conname LIKE 'fk_vsh%';
SELECT indexname FROM pg_indexes WHERE tablename = 'vouchers';
```

> Supabase note: our schema lives in the `public` schema and the app connects with the database owner role, so Row Level Security is not involved. Do **not** create these tables via the Supabase Table Editor "starter" templates — use the migrations above.

---

## 2. Express.js — inside Supabase or separately?

**Separately.** Supabase hosts *PostgreSQL* (managed) and *Edge Functions*, but:

- Edge Functions run **Deno**, not Node — this CommonJS Express codebase would have to be rewritten and cannot use `pg` connection pooling the same way. Not a fit for a transactional long-running API.
- Supabase has no general Node/Express runtime.

Run Express as a long-running container/server. Recommended hosting:

| Option | Verdict |
|---|---|
| **Render (Docker web service)** | ✅ **Recommended.** Free tier, zero-config HTTPS, GitHub auto-deploy, health checks, secrets management, global regions. Excellent fit for a stateful Express + PostgreSQL pool API. |
| Railway | ✅ Great alternative (Procfile-based, very simple). Slightly more cost. |
| Fly.io | ✅ Strong for global/high-availability needs — more configuration (fly.toml, volumes, scale). |
| Vercel | ❌ Serverless-first; unbounded long-lived pools and constant-background processes are anti-patterns there. Use only if the API were rewritten as serverless functions. |
| Supabase Edge Functions | ❌ Wrong runtime (Deno) for this codebase. |

**Why Render for this ERP/mobile API:** the approval flow needs persistent connections, server-side sessions, transactions and low latency — a classic long-running web service. Render gives HTTPS and auto-deploys from GitHub with the least operational overhead, which matters for an internal accounting tool.

---

## 3. Database connection

### Which connection string?

| Type | Host / port | Use for |
|---|---|---|
| **Transaction pooler (Supavisor)** | `aws-0-<region>.pooler.supabase.com:**6543**/?pgbouncer=true` | ✅ **The running API.** Thousands of short queries over few physical connections. |
| Session pooler | `aws-0-<region>.pooler.supabase.com:5432` | Migrations / admin tasks / row locks that must pin a session. |
| Direct | `db.<ref>.supabase.co:5432` | Manual psql/DBeaver, one-off checks. Direct connections are limited (≈60, less on free) — don't point the API at it. |

**Recommendation: point the Express `pg` pool at the Transaction Pooler URI.**

Why it works with this codebase:

- Short-lived queries and small transactions (our accept/reject use `BEGIN … FOR UPDATE … UPDATE … COMMIT`) are exactly what transaction-mode Supavisor is built for.
- `node-postgres` v8 uses unnamed (non-prepared) statements by default, which is required in transaction-pooling mode.
- Include `sslmode=require` in the string — node-postgres parses it automatically and enables TLS (verified below):

```javascript
// verified: pg parses the Supabase pooler URL correctly
// host: aws-0-eu-central-1.pooler.supabase.com  port: 6543  ssl: {}
```

### Pool configuration (this repo)

```javascript
// src/config/database.js — already implemented
new Pool({
  connectionString: database.url,          // your pooler/npg URI
  ssl: database.ssl ? { rejectUnauthorized: false } : undefined,
  max: database.pool.max,                  // default 10 — modest for pooler budgets
  min: 0,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  application_name: 'vam-backend',
});
```

Pool size is controlled via `PGPOOL_MAX` (default 10). Keep it low-ish (5–15) so you stay inside Supabase's pooler connection budget and Direct Protect rules.

Migrations run on the same connection string (transaction pooler works for DDL too).

---

## 4. Environment variables

| Variable | Value | Where to get it |
|---|---|---|
| `PORT` | `10000` | Your choice (Render injects its own `PORT` automatically). |
| `NODE_ENV` | `production` | Your choice. |
| `DATABASE_URL` | `postgresql://postgres.<ref>:<db-password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require` | Supabase → **Project Settings → Database → Connection strings → "Transaction" (pooler)**; replace the placeholder password with your database password. |
| `DATABASE_SSL` | `true` | Your choice (alternative to `sslmode=require`). |
| `PGPOOL_MAX` | `10` | Your choice. |
| `JWT_SECRET` | 96-hex random string | Generate (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`). **Yours, not Supabase's.** |
| `JWT_EXPIRES_IN` | `1d` | Your choice. |
| `APP_TIMEZONE` | `Asia/Kolkata` | Business timezone for voucher "today". |
| `ALLOWED_ORIGINS` | your web URL(s), or `*` | Your web dashboard only (native apps send no Origin). |
| `LOGIN_RATE_MAX` | `20` | Your choice. |
| `API_RATE_MAX` | `500` | Your choice. |

Where to find the pieces in Supabase:

1. **Project Ref** — appears in the browser URL `https://<ref>.supabase.co`, and under **Project Settings → General → Reference**.
2. **Pooler string** — **Project Settings → Database → Connection strings → Transaction** tab.
3. **Database password** — the one you set at project creation; reset under **Project Settings → Database → Reset database password** if lost.
4. **Region** — shown in the pooler host (`aws-0-<region>.pooler.supabase.com`).

Never commit these — `.env` is gitignored; on Render you set secrets in the dashboard or in `render.yaml` with `sync: false`.

---

## 5. Security — which credentials are safe where

| Credential | Backend (Render) | Mobile app |
|---|---|---|
| `DATABASE_URL` (postgres + pooler password) | ✅ safe (secret) | ❌ **Never** |
| `JWT_SECRET` (our sign/verify key) | ✅ safe (secret) | ❌ **Never** — leakage lets attackers forge tokens |
| Supabase `anon` key | ⚠️ only if you call Supabase client APIs server-side | ✅ safe (designed for clients) *but unused here* |
| Supabase `service_role` key | ✅ safe (secret) | ❌ **Never** — bypasses RLS entirely |
| Supabase `JWT_SECRET` (auth) | not needed | ❌ not needed |

**Rule for this architecture:** the mobile app only ever talks to our public HTTPS API over `Authorization: Bearer <our accessToken>`. It should contain **no database credentials and no Supabase keys at all**. If you later add Supabase client-side calls, use the `anon` key only, never `service_role`.

---

## 6. Supabase Auth vs our custom JWT

**Recommendation: keep the existing custom JWT authentication inside Express.**

Reasons:

- The business identity already lives in the ERP `users` table joined to `roles`, `user_levels`, `access_types`, and scoped to a `company_id`. Supabase Auth creates a *separate* `auth.users` table and its own password store, forcing a parallel sync of user records and mangling our role/company authorization model.
- Our authorization (company isolation + role/access-type permission matrix) needs custom claims that Supabase Auth's stock roles cannot express without custom JWT hooks — more moving parts for zero gain on an internal approval flow.
- Email+password against `users.password_hash` (bcrypt) already exists and is tested.

Migration implications *if you changed your mind later*:

- Existing bcrypt hashes are **not importable** into Supabase Auth (it uses its own hash format); users would have to reset passwords (use `supabase project api-keys` + the `set_password`/recovery flow).
- A `user_id` mapping between `auth.users` and `users` would be required.
- The API would switch from verifying our HS256 token to verifying Supabase's `JWT_SECRET` (dashboard → Settings → API → JWT Secret) or using the GoTrue admin API.
- Practical outcome: **not worth it**. Keep Express JWT.

---

## 7. Deployment, step by step (local → GitHub → Supabase → Render → mobile)

```text
Local Express.js project
   ↓ git init/commit (step 7.1)
GitHub repository
   ↓ connect to Render (7.2), secrets (7.3)
Supabase PostgreSQL (migrated in §1)
   ↓ backend connects via transaction pooler (7.4)
Render web service (Docker/npm start)
   ↓
Public HTTPS API  https://vam-backend.onrender.com/health
   ↓
Mobile app points baseUrl at that API (7.6)
```

### 7.1 Push to GitHub

```powershell
git init -b main
git add .
git commit -m "feat: voucher approval backend"
gh repo create vam-backend --private --source=. --push
```
(or create the repo in the GitHub UI, then `git remote add origin https://github.com/<you>/vam-backend.git && git push -u origin main`)

### 7.2 Deploy on Render

**Option A — Blueprint (this repo ships `render.yaml`):**
1. dashboard.render.com → **New → Blueprint** → connect the GitHub repo. Render reads `render.yaml`.
2. Under the created service, set the two `sync: false` secrets: `DATABASE_URL` and `JWT_SECRET`.

**Option B — Web Service manually:**
1. **New → Web Service** → connect GitHub repo.
2. Settings: **Docker** (uses the shipped `Dockerfile`), or Node with
   - Build command: `npm ci`
   - Start command: `npm start` (auto-applies migrations before boot)
   - Health check path: `/health`
3. Add environment variables (§4). Render's own `PORT` is injected.
4. **Create Web Service** → deploys → HTTPS at `https://vam-backend-<hash>.onrender.com`.

### 7.3 Set secrets
`DATABASE_URL`, `JWT_SECRET` → Render **Environment** tab → mark as *secret*.

### 7.4 Verify database (backend ↔ Supabase)
```powershell
$env:DATABASE_URL = "<your pooler URI>"
npm run migrate      # no-op on rerun (idempotent)
```

### 7.5 Verify the deployed API
```powershell
Invoke-RestMethod "https://vam-backend.onrender.com/health"
# {"success":true,"data":{"status":"ok","timezone":"Asia/Kolkata",...}}
Invoke-RestMethod "https://vam-backend.onrender.com/api-docs/" -UseBasicParsing | Out-Null
```

### 7.6 Point the mobile app
- Base URL: `https://vam-backend.onrender.com`
- `POST /api/auth/login` with email+password → `data.accessToken`
- Send `Authorization: Bearer <accessToken>` on all other endpoints.

---

## 8. Production checklist

- [ ] Migrations applied to Supabase **and** re-runnable (`npm run migrate`)
- [ ] `DATABASE_URL`, `JWT_SECRET` set as secrets; `.env` not committed
- [ ] `JWT_SECRET` is a 96-hex random value; `JWT_EXPIRES_IN` fits the security policy
- [ ] `DATABASE_SSL=true` or `sslmode=require` present; `PGPOOL_MAX` ≤ 15
- [ ] CORS: `ALLOWED_ORIGINS` restricted to real web origins (native mobile unaffected)
- [ ] HTTPS enforced (Render provides it) — no cleartext client traffic
- [ ] Health check configured on `/health`
- [ ] Request logging enabled (morgan is on outside `test`)
- [ ] Centralized error handler active (no stack traces/SQL leaked — implemented in `src/middleware/error.middleware.js`)
- [ ] Rate limiting on: login (`LOGIN_RATE_MAX`) and API-wide (`API_RATE_MAX`)
- [ ] Supabase automated backup configured (Pro $25/mo, or pg_dump cron job)
- [ ] Node 20 runtime (Dockerfile), `NODE_ENV=production`, non-root user in container
- [ ] Rollout check: run one accept + one 409 conflict against the deployed URL

---

## 9. Exact PowerShell commands

### Install & run locally
```powershell
Set-Location "D:\Santhosh\Mobile app\VAMBackend"
npm install            # install dependencies (creates package-lock.json)
npm run dev            # development with nodemon
npm start              # plain start
```

### Build
```powershell
# The app is CommonJS Node.js — "build" = dependency install + optional Docker image
docker build -t vam-backend .
docker run -d -p 10000:10000 --env-file .env vam-backend
```

### Test
```powershell
npm test               # 40 integration tests against PostgreSQL (vam_backend_test)
```

### Git init / commit / push
```powershell
git init -b main
git add .
git commit -m "feat: voucher approval backend"
git remote add origin https://github.com/<you>/vam-backend.git
git push -u origin main
```

### Database migration (Supabase)
```powershell
# one-time or CI step
$env:DATABASE_URL = "postgresql://postgres.<ref>:<db-password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"
npm run migrate
```

### Production deployment
```powershell
# Render — via GitHub (auto-deploy on push) using render.yaml or Web Service UI.
# The repo's container image is built automatically; secrets come from the dashboard.

# Alternatives:
# Railway
npm i -g @railway/cli
railway login
railway init
railway up                       # reads Procfile (web: node scripts/start.js)
railway variables --set "DATABASE_URL=..." "JWT_SECRET=..." "NODE_ENV=production"

# Fly.io
flyctl auth login
flyctl launch --build-only        # uses Dockerfile; deploy when ready
flyctl secrets set DATABASE_URL=... JWT_SECRET=...
flyctl deploy
```

---

## 10. Final recommendation

> **For this project, use Supabase for PostgreSQL, Render for Express.js hosting, and our own custom JWT for authentication.**

- **Database:** Supabase PostgreSQL (+ its transaction pooler on port 6543).
- **API hosting:** Render web service (free → starter), HTTPS + auto-deploy from GitHub, health checked on `/health`.
- **Authentication:** the repository's existing email+password flow with bcrypt and HS256 JWT, enforced server-side (`authenticateJWT`). Do not migrate to Supabase Auth.

The repo already contains everything needed: `Dockerfile`, `render.yaml`, `Procfile`, `scripts/start.js` (migrate-then-boot), `src/config/database.js` pool wiring, and `.env.example` with the exact Supabase variables.