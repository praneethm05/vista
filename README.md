# Vista: leave, simplified

> *"Hasta la vista, baby."* (Terminator 2): what everyone says on their way out on leave.

Vista is an employee leave management portal:
- **Employees** apply for leave and track every request.
- **Managers and HODs** approve, reject or ask for more information.
- **Leave longer than 3 consecutive days** needs a supporting document and two approvals: **Manager → HOD**.

Every action is recorded in an append-only audit log.

| | |
|---|---|
| **Live demo** | **https://vista.praneethm.dev** · if that domain is blocked on your network (e.g. campus Wi-Fi), use **https://vista-btyc.vercel.app**, the same deployment. Demo logins are below; verification code `424242`. |
| **Stack** | React + Vite + TypeScript · Node + Express 5 + TypeScript · MongoDB Atlas (Mongoose) · Clerk auth (Google + email) · Tailwind CSS 4 · Vitest + Supertest |
| **Repo layout** | `server/` REST API · `client/` React SPA · `docs/` problem statement, API reference, plan |
| **Engineering review** | [`docs/REVIEW.md`](docs/REVIEW.md): requirement → code → test traceability, invariants (test-first fixes), STRIDE threat model, decision records |
| **API reference** | [`docs/API.md`](docs/API.md): every endpoint with curl examples (paste them into Postman) |

---

## Run it locally

**Requirements:**
- Node 20+ (tested on Node 26)
- A MongoDB Atlas connection string
- A Clerk application with **Google** and **Email** sign-in enabled

```bash
git clone https://github.com/praneethm05/vista && cd vista
cp .env.example .env          # fill in MONGODB_URI and the Clerk keys
npm run setup                 # installs root, server and client
npm run dev                   # API → http://localhost:4000 · Web → http://localhost:5173
```

**Demo accounts for evaluators** (created by `npm run seed`, safe to re-run):

| Role | Email | Password |
|---|---|---|
| **System admin** (Dashboard for the whole org, **Settings**: long-leave threshold, take-back notice, quotas; People, Audit) | `sysadmin+clerk_test@vista-demo.com` | `Vista#Leave-2026!` |
| Admin (acts as HOD: 2nd-level approver, People, Audit log) | `admin+clerk_test@vista-demo.com` | `Vista#Leave-2026!` |
| Manager (approves their team, accepts join requests) | `manager+clerk_test@vista-demo.com` | `Vista#Leave-2026!` |
| Employee (already in the manager's team) | `employee+clerk_test@vista-demo.com` | `Vista#Leave-2026!` |

If Clerk asks for a verification code (new-device check), enter **`424242`**. These are Clerk test addresses (`+clerk_test`), so no email is sent.

**Any new sign-up** becomes an **Employee without a team**:
1. On the **Join your team** screen, find a manager by name or ID (e.g. `VST-0002`) and send a request.
2. The manager accepts or declines it under **My team**.
3. Once accepted, the employee can apply for leave, and the Admin is automatically their second-level approver.

The sign-in page asks for an **organisation email**; personal domains are accepted during the pilot.

> Clerk setup: enable **Email + Password** (and optionally Google) under *User & Authentication*. The demo users are created through the Clerk Backend API.

| Command | What it does |
|---|---|
| `npm run dev` | API (`tsx watch`) + web (Vite) together |
| `npm test` | 25 tests + 3 property-based tests (3,000 random cases): workflow unit tests + API integration tests on an in-memory MongoDB, no setup needed |
| `npm run build` | Production build of the client |
| `cd server && npm run simulate` | 20-person company, 103 scenarios (everyday use + edge cases + races) → [`docs/SIMULATION.md`](docs/SIMULATION.md) |
| `npm run seed` | Create or refresh the 3 demo accounts (Admin, Manager, Employee) |

---

## What it does

### Employee
- **Apply for leave:**
  - 7 leave types (Earned, Sick, Casual, Wellness, Parental, Bereavement, Pet adoption), inspired by Meesho's people-first policies.
  - While you fill the form you see the working-day count, your **balance after this request**, and the **approval route** (Manager, or Manager → HOD).
- **Attach documents** (PDF/PNG/JPG, up to 4 MB). The upload box only appears when the rules need it (more than 3 days, or Wellness/Parental leave).
- **Track status:**
  - The history list has colour-coded statuses.
  - Each request has a progress stepper and a full activity timeline.
- **Reply to "more info" requests** with a comment and extra documents, or **cancel** a request while it's still open.

### Dashboards (manager: their team · admin and sysadmin: the whole organisation)
- KPI tiles: headcount, **on leave today**, waiting for a decision, approved this month.
- Bar chart of leave taken this year by type, plus a status breakdown bar.
- **Out today** (with return date), **next 7 days**, and a status card for every person (Working / On leave), each with a role tag.
- **Approver activity (admin and sysadmin):**
  - for each approver: approved, rejected and asked-for-info counts, approval rate, and **average response time**
  - response time is calculated from the audit log, from the request (or the employee's reply) to the decision
  - the most active approver is flagged
- **Role tags** (Employee / Manager / Admin · HOD / System admin) next to names in timelines, the audit log, the dashboard, teams and the org tree.

### Taking back leave
- Employees can **take back approved leave** up to *N* days before it starts. *N* is set by the sysadmin; the default is 2.
- The balance is restored automatically, the manager is emailed, and the audit log records `WITHDRAWN`.

### Organisation (system admin)
- A **full reporting tree**: Admin (HOD) → managers → employees, plus a "Not in a team yet" group.
- Click anyone to change their **role** (employee, manager or admin), **who they report to** and their **department**.
- **Guards:**
  - managers report to an admin
  - nobody reports to an employee or to themselves
  - no reporting loops
  - a manager can't be demoted while people still report to them
- The second-level approver is recalculated automatically, and reports follow when their manager moves.
- Every change is audited (`ORG_CHANGED`). Requests already in progress keep their approvers.

### System admin settings (no code change needed)
- Long-leave threshold (default 3 days).
- Take-back notice period.
- Yearly quota per leave type.

Saved policy is cached for 15 s, applies to new requests immediately, and every change is audited with before and after values.

### Manager / HOD
- **Approvals queue:** only requests waiting on *you* (manager stage for your reports, HOD stage for your department). Each card shows a document count and a ⚠ flag when teammates are off on the same days.
- **Decision page:** **Approve**, **Reject** or **Ask for more info**; a comment is required for the last two.
- **"Before you decide" panel:**
  - the employee's balance after approval
  - which teammates are already off on those dates
  - the documents, opened securely
- **HOD:** an audit log of every action in the system.

### Colour coding

| Status | Colour | Status | Colour |
|---|---|---|---|
| With manager | amber | Approved | green |
| With HOD | violet | Rejected | red |
| Info needed | blue | Cancelled | grey |

---

## Email notifications (Resend)

| Event | Who gets an email |
|---|---|
| Leave submitted | Manager ("needs your decision") |
| Manager approves long leave | Employee ("one step left") + Admin/HOD ("final approval") |
| Approved / rejected / more info needed | Employee, with the approver's comment |
| Employee replies with more info | The approver who asked |
| Join-team request / accepted / declined | Manager / employee |

- **Design:** a branded HTML template (`server/src/mail/template.ts`): violet header, status pill, details table, quoted comment, one call-to-action button. It uses tables and inline styles so it renders in Gmail and Outlook.
- **Demo accounts don't receive email:** `+clerk_test@` and `@vista-demo.com` addresses can't receive mail, so they are skipped and logged. **Real addresses (any new sign-up) get real email.**
- **Email never blocks the workflow:** a sending failure is logged, and the approval still succeeds.
- **Setup:** set `RESEND_API_KEY`, `EMAIL_FROM` (a verified Resend domain) and `APP_URL` (used for links). With no key set, email is skipped.

## Architecture

```
 React SPA (Vite)                         Express API (TypeScript)                     MongoDB Atlas
 ───────────────                          ───────────────────────────────────────      ─────────────
 Clerk <SignIn/>  ── Bearer session JWT ─► clerkMiddleware → requireAuth             ┌─ leaverequests
 pages/ (role-based)                      (role + reporting line from Clerk           ├─ auditlogs (append-only)
 lib/api.ts (fetch + friendly errors)      publicMetadata, cached 30 s)               └─ documents
                                          routes/   → parse input with Zod
                                          services/ → business rules, Mongo queries
                                          domain/   → pure workflow state machine,
                                                      leave policy table, date maths
                                          errorHandler → { error: { code, message, fields } }
```

**Layers:**
- **routes** only parse and respond.
- **services** hold the business logic.
- **domain** is pure: no database or HTTP, so it's unit-testable.

### Approval workflow (state machine: `server/src/domain/workflow.ts`)
```
PENDING_MANAGER ─approve─► APPROVED                                   (≤ 3 consecutive days)
PENDING_MANAGER ─approve─► PENDING_HOD ─approve─► APPROVED            (> 3 days: Manager + HOD)
PENDING_*  ─reject (comment required)─► REJECTED
PENDING_*  ─ask for info (comment required)─► INFO_REQUESTED ─employee replies─► back to the same stage
PENDING_* / INFO_REQUESTED ─employee cancels─► CANCELLED
```
**Guards:**
- Only the approver for the **current stage** can act.
- Nobody can approve their own leave.
- Decided requests are final.

### Data model
| Collection | Key fields |
|---|---|
| `leaverequests` | employeeId, **employeeName**, managerId, hodId, leaveType, **fromDate**, **toDate**, **reason**, calendarDays, workingDays, documentIds, requiresHod, status, stage, lastComment, **version** |
| `users` | clerkId, name, email, role (EMPLOYEE/MANAGER/ADMIN), employeeCode, department, managerId, hodId |
| `teamrequests` | employeeId, employeeName, managerId, message, status (PENDING/ACCEPTED/REJECTED/WITHDRAWN). A partial unique index allows one pending request per employee |
| `auditlogs` | requestId, actorId, actorName, actorRole, action, fromStatus, toStatus, comment, at |
| `documents` | ownerId, requestId, filename, mimeType, size, data (binary) |

**Indexes:**
- `{employeeId, fromDate}`: history and overlap checks
- `{managerId, status}` and `{hodId, status}`: approver queues
- `{requestId, at}`: timelines

---

## Key decisions & trade-offs

| Decision | Why |
|---|---|
| **Workflow as a pure state machine** | One place decides what can happen next. Unit-tested without a database, and easy to extend (e.g. a third approval level). |
| **Optimistic locking** (`version` field) | Two approvers clicking at the same time: the update only succeeds if the request is still in the state and version we read, so exactly one wins and the other gets **409**. Covered by a test. |
| **Balances calculated from requests, not stored** | Balances come from approved and pending requests, so they can never drift out of sync. Re-checked at final approval, because the balance may have changed since submission. |
| **Leave policy as data** (`domain/leaveTypes.ts`) | Adding a leave type means adding a row, with no code changes (Open/Closed). |
| **Clerk for identity, MongoDB `users` for roles and teams** | Roles only change server-side (seed, or a manager accepting a join request), so users can't promote themselves. New sign-ups default to Employee with no team. Approvers are copied onto the request at submit, so a later team change doesn't silently reroute requests already in progress. |
| **404 instead of 403** for other people's requests and documents | Doesn't reveal that the item exists (protects against IDOR, where someone changes an ID in the URL). |
| **"> 3 consecutive days"** = calendar days `toDate − fromDate + 1` | Matches the wording of the brief. **Balances deduct working days** (Mon–Fri). Public holidays are out of scope. |
| **Documents stored in MongoDB** (≤ 4 MB) | Zero extra infrastructure and works on serverless. At scale: S3/Blob with pre-signed uploads, keeping only the file details in Mongo. |
| **Friendly errors everywhere** | One error shape, `{ error: { code, message, fields } }`. Zod validation maps to per-field messages that the form shows inline. |

### Security
- Every API route needs a valid Clerk session.
- Role checks on the server; data access checks on every read.
- Zod validation on all input.
- Upload type and size limits; `helmet` headers; JSON body limit.
- Secrets live only in `.env`, which is git-ignored.

---

## Testing

```bash
npm test
```
- **Workflow unit tests:**
  - Manager → HOD path
  - only the current approver can act
  - no self-approval
  - comment required
  - info request returns to the same stage
  - decided requests are final
- **Date maths:** inclusive day counts and weekends.
- **API integration** (Supertest + in-memory MongoDB):
  - validation errors
  - `DOCUMENT_REQUIRED`
  - full long-leave flow with audit trail
  - `OVERLAP` 409
  - **concurrent decisions → one 200, one 409**
  - 404 for other people's data
  - 403 for employees on approver routes
  - balance limit
  - join-team request: blocked until accepted, manager accepts once, a second click gets 409

---

## Deployment (Vercel)

`server/` is set up as **one Vercel project**:
- Express runs as a serverless function (`server/index.js` exports the app, bundled from TypeScript by esbuild into `dist/app.js`).
- The React build is served from the CDN (`server/public`).
- `vercel.json` sends every non-API route to the SPA.

**Steps:**
1. Import the repo and set **Root Directory = `server`**.
2. Add the four env vars from `.env.example`.
3. Atlas Network Access must allow `0.0.0.0/0`, because Vercel's IPs change.

**Serverless notes:**
- The Mongo connection is cached across warm calls (`src/db.ts`).
- Uploads are capped at 4 MB because Vercel limits request bodies to 4.5 MB.

---

## What I'd do next
- **Notifications:** email or Slack when a request needs you or gets decided (Resend + a queue).
- **Team calendar** view, **half-day** leave, **public holiday** calendar per location.
- **Delegation:** an approver on leave hands their queue to a deputy.
- **Transactions:** wrap the status update and audit insert in one Mongo transaction.
- **Scale:**
  - pre-signed S3 uploads
  - cache balances
  - pagination on the queue
  - rate limiting
  - move the audit log to a write-once store
- **Org email enforcement:** turn on Clerk's allowed email domains, or sync from the HR system / SSO.
- **Admin UI** to promote employees to managers.

## How AI was used
I used Claude Code as a pair programmer, while I owned the design and the decisions:
1. **Spec first:** I read the brief, decided the scope, stack and design language, and wrote the plan ([`docs/PLAN.md`](docs/PLAN.md)) before any code.
2. **Small steps:**
   - domain (state machine, policy, dates) → models → services → routes → tests → UI
   - after each step I reviewed the diff and ran `tsc` and the tests
3. **Review:** I checked every rule against the brief: Manager + HOD for more than 3 days, documents, ask-for-info, and audit.
4. **I changed and decided:**
   - Clerk instead of hand-rolled auth
   - Akasa-inspired palette and type
   - Meesho-style leave types
   - Vercel-compatible upload limits
   - the repo name
