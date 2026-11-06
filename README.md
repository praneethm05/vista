# Vista: leave, simplified

> *"Hasta la vista, baby."* (Terminator 2): what everyone says on their way out on leave.

Vista is an employee leave management portal:
- **Employees** apply for leave and track every request.
- **Managers and HODs** approve, reject or ask for more information.
- **Leave longer than 3 consecutive days** needs a supporting document and two approvals: **Manager → HOD**.

Every action is recorded in an append-only audit log.

| | |
|---|---|
| **Stack** | React + Vite + TypeScript · Node + Express 5 + TypeScript · MongoDB Atlas (Mongoose) · Clerk auth (Google + email) · Tailwind CSS 4 · Vitest + Supertest |
| **Repo layout** | `server/` REST API · `client/` React SPA · `docs/` problem statement, API reference, plan |
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

**First-time demo users (2 minutes):**
1. Open http://localhost:5173 and sign in once with each demo account. Gmail aliases work, e.g. `you+hod@gmail.com`.
2. Assign roles and the reporting line, in the order HOD, manager, then employees:
   ```bash
   npm run roles -- you+hod@gmail.com you+mgr@gmail.com you+emp1@gmail.com you+emp2@gmail.com
   ```
3. Sign in again: each user now sees screens for their role.

| Command | What it does |
|---|---|
| `npm run dev` | API (`tsx watch`) + web (Vite) together |
| `npm test` | 18 tests: workflow unit tests + API integration tests on an in-memory MongoDB, no setup needed |
| `npm run build` | Production build of the client |
| `npm run roles -- …` | Set Clerk roles (HOD, manager, employees) |

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
| **Roles in Clerk `publicMetadata`** | Can only be set server-side, so users can't promote themselves. Approvers are copied onto the request at submit, so a later team change doesn't silently reroute requests already in progress. |
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

---

## Deployment (Vercel)

`server/` is set up as **one Vercel project**:
- Express runs as a serverless function (`server/index.ts` exports the app).
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
- **Admin UI** for roles and the org chart, instead of the CLI script.

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
