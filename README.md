# Vista: leave, simplified

> *"Hasta la vista, baby."* (Terminator 2): what everyone says on their way out on leave.

Vista is an employee leave management system:
- **Employees** apply for leave and track every request.
- **Managers and the HOD** approve, reject or ask for more information.
- **Leave longer than 3 consecutive days** needs a supporting document and **two approvals (Manager → HOD)**.
- **Every action** is recorded in an audit log, and **email notifications** go out at each step.

## 🌐 Live

| | URL |
|---|---|
| **Custom domain** | **https://vista.praneethm.dev** |
| **Campus fallback** (if a network filter, e.g. CHRIST Wi-Fi, blocks `praneethm.dev`) | **https://vista-btyc.vercel.app**, the same deployment |
| **Recruiter walkthrough** | [`WALKTHROUGH.md`](WALKTHROUGH.md): a guided 10-minute tour of every feature |

Hosted on **Vercel**: Express runs as a serverless function and the React app is served from the CDN. The data is in **MongoDB Atlas**.

### 👋 Demo logins

The password for all of them is **`Vista#Leave-2026!`**. If Clerk asks for a verification code, enter **`424242`**.

| Role | Email | What you can do |
|---|---|---|
| **System admin** | `sysadmin+clerk_test@vista-demo.com` | Company-wide dashboard, **organisation** (teams, roles, add people), **leave policy settings**, audit log |
| **Admin · HOD** | `admin+clerk_test@vista-demo.com` | Final approval for long leave, company-wide dashboard with **approver analytics**, people, audit log |
| **Manager** | `manager+clerk_test@vista-demo.com` | Team approvals, team dashboard, join requests, own leave |
| **Employee** | `employee+clerk_test@vista-demo.com` | Apply, track, reply to questions, take back leave |

You can also **sign up with any email**. You'll get the new-joiner flow: profile, then join a team.

The demo database holds a realistic company: **22 people in 4 departments, about 60 leave requests over 10 months**, people on leave today, and queues waiting for the demo manager and admin.

---

## ✨ Features

### Employee
- **Apply for leave:**
  - 7 leave types: Earned, Sick, Casual, Wellness, Parental (gender-neutral), Bereavement, Pet adoption.
  - **While you fill the form** you see the working-day count, weekends not counted, your **balance after this request**, and the **approval route**.
  - **The form explains why it can't be submitted yet**: weekend-only dates, past dates, over balance, missing document.
- **Documents** (PDF/PNG/JPG, up to 4 MB) are requested **only when the rules need them**: more than 3 days, or Wellness/Parental leave.
- **Track** every request:
  - colour-coded status
  - a progress stepper (Applied → Manager → HOD → Decision)
  - a full activity timeline with role tags
- **Reply** to "more information" requests, with extra documents if needed.
- **Cancel** a pending request, or **take back approved leave** up to *N* days before it starts (set by the sysadmin). The balance is restored automatically and the manager is emailed.

### Manager
- **Approvals queue:** only the requests waiting on *you*. Each card shows the document count and a ⚠ flag when teammates are already off.
- **"Before you decide" panel:**
  - the employee's balance after approval
  - which teammates are already off on those dates
  - the documents, opened securely
- **Approve, Reject or Ask for more info.** A comment is required for the last two.
- **My team:** accept or decline join requests and see the team members.
- **Team dashboard:** who's out today, the next 7 days, leave by type, status breakdown.

### Admin · HOD
- **Final (second-level) approval** for leave longer than 3 days.
- **Company-wide dashboard**, including **approver activity**: for each approver, approved, rejected and asked-info counts, approval rate and **average response time**.
- **Audit log** of everything that happened.

### System admin
- **Organisation:** a searchable **team-card view** of the whole company.
  - Click anyone to change their **role**, **manager** or **department**.
  - **Guards:** no reporting loops, nobody reports to an employee, and a manager can't be demoted while they still have reports.
  - Pending requests **follow** someone when they change manager.
- **+ Add person:** pre-register a new joiner. On their first sign-in with that email, they land directly in their team, and real addresses get a welcome email.
- **Leave policy settings, no code change needed:**
  - long-leave threshold (default 3 days)
  - take-back notice period
  - yearly quota per leave type
  - Every change is audited with before and after values.

### New joiners (self sign-up)
1. **Profile:** full name, job title, mobile (a validated Indian number, optional), work location.
2. **Join a team:** search for a manager by name or ID, add a note, and send the request. The manager accepts or declines.

### Everywhere
- **Role tags** (Employee / Manager / Admin · HOD / System admin) next to every name.
- **Friendly errors:** every error has the shape `{ error: { code, message, fields } }`, with messages shown under the relevant field.
- **Responsive:** mobile-first layout with a bottom navigation bar on phones.
- **Colour coding:**
  - amber: with manager
  - violet: with HOD
  - blue: info needed
  - green: approved
  - red: rejected
  - grey: cancelled

---

## ✉️ Email notifications (Resend), working

Emails are sent through **Resend** from **`vista@praneethm.dev`**, a verified custom domain, using a branded HTML template that renders in Gmail and Outlook.

| Event | Recipient |
|---|---|
| Leave submitted | Manager |
| Manager approves long leave | Employee ("one step left") **and** Admin/HOD ("final approval") |
| Approved / rejected / more info needed | Employee, with the approver's comment |
| Employee replies with more info | The approver who asked |
| Approved leave taken back | Manager |
| Join request / accepted / declined | Manager / employee |
| Pre-registered by the sysadmin | The new joiner ("Welcome to Vista") |

- **Demo and seeded accounts** (`+clerk_test@` and `@vista-demo.com`) can't receive mail, so they are **skipped and logged**. **Real accounts receive real email.**
- **Email never blocks the workflow:** a failure is logged and the action still succeeds.

---

## 🧱 Tech stack

| Layer | Technology |
|---|---|
| Frontend | **React 19**, **Vite 8**, **TypeScript**, **Tailwind CSS 4**, React Router 7 |
| Design | Akasa-inspired palette (violet `#5c0fd9`, sunrise orange `#ff6300`) · **Big Shoulders** (headings), **Inter** (body), **Geist Mono** (dates, IDs) · DiceBear "notionists" avatars |
| Backend | **Node.js**, **Express 5**, **TypeScript**, **Zod** validation, Multer (uploads), Helmet |
| Database | **MongoDB Atlas** + **Mongoose** |
| Auth | **Clerk** (Google + email/password). Identity comes from Clerk; roles and teams are stored in MongoDB |
| Email | **Resend** (custom domain `praneethm.dev`) |
| Hosting | **Vercel** (Express as a serverless function, bundled with **esbuild**; React on the CDN) · custom domain **vista.praneethm.dev** |
| Testing | **Vitest**, **Supertest**, **mongodb-memory-server**, **fast-check** (property-based tests), a 20-person corporate simulation |

---

## 🚀 Run it locally

**Requirements:**
- Node 20+
- A MongoDB Atlas connection string
- A Clerk application (enable **Email + Password**; Google is optional)
- Optional: a Resend API key

```bash
git clone https://github.com/praneethm05/vista && cd vista
cp .env.example .env          # fill MONGODB_URI, Clerk keys (and RESEND_API_KEY / EMAIL_FROM / APP_URL for email)
npm run setup                 # installs root, server and client
npm run seed                  # creates the 4 demo logins (Clerk + MongoDB)
npm --prefix server run seed:org   # optional: realistic company with leave history
npm run dev                   # API → http://localhost:4000 · Web → http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Runs the API and the web app together |
| `npm test` | **29 tests**: workflow, API, invariants, plus **property-based tests over 3,000 random cases** |
| `npm --prefix server run simulate` | A 20-person company running **103 scenarios** (everyday use, edge cases, races) → [`docs/SIMULATION.md`](docs/SIMULATION.md) |
| `npm run seed` / `npm --prefix server run seed:org` | Demo logins / realistic company data. Both can be re-run; real accounts are never touched |

---

## 🏗 Architecture

```
 React SPA (Vite)                    Express API (TypeScript)                         MongoDB Atlas
 ───────────────                     ─────────────────────────────────────────        ──────────────
 Clerk <SignIn/> ─ Bearer JWT ─────► clerkMiddleware → requireAuth                     users · teamrequests
 pages/ by role                      (identity: Clerk · role/team: users collection)   invites · settings
 lib/api.ts (friendly errors)        routes/    → parse input with Zod                 leaverequests
                                     services/  → business rules, queries, locks       auditlogs (append-only)
                                     domain/    → pure state machine, policy, dates    documents
                                     mail/      → Resend notifications                 locks (TTL)
                                     errorHandler → { error: { code, message, fields } }
```

### Approval workflow (`server/src/domain/workflow.ts`, a pure state machine)
```
PENDING_MANAGER ─approve─► APPROVED                                  (≤ threshold days)
PENDING_MANAGER ─approve─► PENDING_HOD ─approve─► APPROVED           (> threshold: Manager + HOD)
PENDING_*  ─reject (comment)─► REJECTED
PENDING_*  ─ask for info (comment)─► INFO_REQUESTED ─employee replies─► same stage
PENDING_* / INFO_REQUESTED ─employee cancels─► CANCELLED
APPROVED ─employee takes back (≥ N days before start)─► CANCELLED
```

### Key decisions
| Decision | Why |
|---|---|
| Workflow as a pure state machine | One place decides what can happen next. Unit- and property-tested without a database |
| **Optimistic locking** (`version`) + a per-employee **MongoDB lock** | Two approvers at the same moment → exactly one wins (409). A triple-clicked Submit creates one request |
| Balances **calculated from requests**, not stored | Can't drift. Pending days are reserved at submit, and the balance is re-checked at final approval |
| Leave policy as data + sysadmin settings | Change the rules without deploying code (Open/Closed) |
| **404, not 403**, for other people's data | Doesn't reveal that something exists (protects against IDOR) |
| Clerk for identity, MongoDB for roles | Nobody can promote themselves. Roles change only through the sysadmin or an accepted join request |
| "Today" = **India time**, not UTC | 01:30 IST is already the next day. Configurable with `ORG_TIME_ZONE` |
| Uploads checked by their **first bytes** | The browser's file type is only a claim |
| Every document **view** is audited | Medical documents are sensitive personal data (India's DPDP Act) |

Full engineering review: [`docs/REVIEW.md`](docs/REVIEW.md) covers the requirements traceability matrix, the invariants fixed test-first, a STRIDE threat model, decision records, and what's still open.

---

## 📚 Docs
- [`WALKTHROUGH.md`](WALKTHROUGH.md): a guided tour for recruiters
- [`docs/API.md`](docs/API.md): every endpoint with curl examples (paste them into Postman)
- [`docs/SIMULATION.md`](docs/SIMULATION.md): the 20-person corporate simulation report
- [`docs/REVIEW.md`](docs/REVIEW.md): senior engineering review
- [`docs/PLAN.md`](docs/PLAN.md): the original plan · [`docs/problem-statement.docx`](docs/problem-statement.docx): the brief

## 🔭 What I'd do next
- **Transactions:** a Mongo transaction for status + audit, and an email outbox with retries.
- **Leave calendar:** public holidays per location, half days, accrual and carry-forward, leave that crosses the year end split by year.
- **Delegation:** an approver on leave hands their queue to a deputy.
- **Testing:** Playwright end-to-end with `@clerk/testing`, axe accessibility checks, Stryker mutation testing, an OWASP ZAP scan in CI.
- **Scale:** pre-signed S3 uploads, pagination, rate limiting, a tamper-evident (hash-chained) audit log.

## 🤖 How AI was used
I used Claude Code as a pair programmer, while I owned the scope, the design and every decision.

**Process:**
1. **Spec first:** I wrote [`docs/PLAN.md`](docs/PLAN.md) before any code.
2. **Small steps,** in this order: domain → models → services → routes → tests → UI.
3. **I reviewed every diff** and ran the type-checks and tests after each step.
4. **I verified** with a simulation, property tests and the live deployment's logs.

**My decisions included:**
- Clerk plus database roles
- Akasa-inspired design
- Meesho-style leave types
- the take-back rule
- sysadmin policy and organisation tools
- Vercel deployment fixes based on runtime logs
