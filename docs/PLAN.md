# Vista: leave management portal (Akasa build round, 6 Nov)

## Context
Akasa's 3-hour coding round: **Employee Leave Management System** (full brief in `~/Downloads/Christ-Coding/Christ-FS-Coding-LeaveTracker.docx`).
- **Graded on:**
  - workflow implementation
  - form validation
  - CRUD
  - how AI tools were used
  - code and system knowledge
- **Must ship** an executable they can run, plus a README with run instructions.
- **Plus points:**
  - audit logs
  - friendly error messages
  - colour coding
  - responsive layout
- **Goal:** an impressive product that Praneeth can defend in the 3 PM technical round.
- **Order:** Express service first, then React UI.
- **Name:** "vista", from *"Hasta la vista, baby"* (Terminator 2): what you say when you go on leave.

### Requirements (from the docx)
- **Employee:**
  - apply for leave
  - view leave history and status
  - attach documents
- **Manager:**
  - see pending requests
  - approve or reject, with a comment
  - view documents
  - **ask for more information**
- **Strict rule:** more than 3 consecutive days needs documents and **two approvals: Manager, then HOD**.
- **Leave fields** (keep these names): `employeeName`, `fromDate`, `toDate`, `reason`.

## Stack (locked)
- **Client:** React + Vite + TypeScript.
- **Server:** Express + TypeScript (`tsx`).
- **Data:** MongoDB Atlas via Mongoose (`MONGODB_URI` required).
- **Auth:** Clerk (Google + email) using `@clerk/clerk-react` and `@clerk/express`.
- **Avatars:** DiceBear notionists, built as a URL with no npm package.
  - `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${bg}` (pattern from `~/projects/personal/nora/src/components/AvatarPicker.tsx`).
- **Server libraries:**
  - runtime: `express`, `@clerk/express`, `mongoose`, `zod`, `multer` (memory storage, 5 MB), `helmet`, `cors`
  - dev: `tsx`, `typescript`, `vitest`, `supertest`

## Repo setup (first action after approval)
1. Run `mkdir ~/Desktop/vista`, then `git init`.
2. **Move** the docx to `vista/docs/problem-statement.docx`.
3. Copy in `build-kit/CLAUDE.md` (filled with this spec) and `build-kit/design/`.
4. Add `.gitignore` covering `node_modules`, `.env` and `dist`.
5. Create the repo with `gh repo create vista --public --source . --push`.
6. **Never commit `.env`:** it holds the Clerk secret and the Atlas URI. Commit `.env.example` instead.

Layout: `server/` (the Express API), `client/` (Vite, React), `docs/`, and a root `package.json` whose `npm run dev` starts both.

## Roles and identity (Clerk `publicMetadata`)
- Each user's publicMetadata is `{ role: "EMPLOYEE"|"MANAGER"|"HOD", managerId?, hodId?, department }`, set in the Clerk dashboard for the demo users:
  - 2 employees
  - 1 manager
  - 1 HOD
- Users can't edit publicMetadata from the browser.
- When an employee submits, the server copies `employeeName`, `managerId` and `hodId` onto the request. Approver queues are then a plain Mongo query; no user directory is needed.

## Domain design (server: what you'll talk about at 3 PM)

### Leave types
Defined in one config table in `domain/leaveTypes.ts`, using the Strategy / Open-Closed idea: adding a type means adding a row, not changing code. Inspired by Meesho's policy set.

| code | label | quota/yr | doc always? |
|---|---|---|---|
| ANNUAL | Earned leave | 18 | no |
| SICK | Sick leave | 12 | no (yes if >3 days) |
| CASUAL | Casual leave | 6 | no |
| WELLNESS | Wellness (critical illness) | unlimited | yes |
| PARENTAL | Parental (gender-neutral) | 150 | yes |
| BEREAVEMENT | Bereavement | 5 | no |
| PET | Pet adoption | 2 | no |

### Balances
- Calculated from this year's requests, not stored as a counter, so the number can't drift out of sync.
- `available = quota − approved − pending`.
- Re-checked when a request is approved, because the balance may have changed since submission.

### Day counting
- **The >3 rule** counts consecutive calendar days, `toDate − fromDate + 1`, inclusive. The README states this assumption.
- **Balance deduction** counts working days, skipping weekends.

### Workflow state machine
Lives in `domain/workflow.ts` as a pure function `transition(request, action, actor) → nextStatus | AppError`, unit-tested on its own.

```
SUBMIT ─► PENDING_MANAGER ─approve(≤3d)─► APPROVED
                │  └─approve(>3d)─► PENDING_HOD ─approve─► APPROVED
                │                        │
                ├─reject──────────────────┴─reject─► REJECTED
                ├─request_info─► INFO_REQUESTED ─employee responds─► back to the stage that asked
                └─(employee) cancel while PENDING_* / INFO_REQUESTED ─► CANCELLED
```

**Rules:**
- A comment is required for REJECT and REQUEST_INFO; it's optional for APPROVE.
- An approver can't act on their own request.
- A manager can act only on `managerId == me`; an HOD only on `hodId == me`.
- More than 3 days, or a type that always needs one, requires at least 1 document at submit.

### Concurrency
- Each action is one conditional update: `findOneAndUpdate({_id, status: expected, version}, {$set…, $inc:{version:1}})`.
- If no document matches, the request was already decided or changed, and the API returns 409 STALE.
- This covers two approvers clicking at once, or a double-click.

### Overlap
A new request whose dates overlap one of the employee's PENDING_*, INFO_REQUESTED or APPROVED requests → 409 OVERLAP.

### Audit log
- An insert-only `AuditLog` collection: `{ requestId, actorId, actorName, role, action, from, to, comment, at }`.
- Written on every transition and on document upload.
- It feeds the timeline on each request.
- **Next step:** a Mongo transaction so the update and the audit entry are written together.

### Documents
- Accepts PDF, JPG and PNG, up to 5 MB, validated by MIME type and size.
- Stored in a Mongo `Document` collection as a Buffer.
- Only the owner, their manager and their HOD can read them. Anyone else gets 404, so nobody learns which IDs exist (IDOR protection).

### Errors
- `AppError(code, status, friendlyMessage)`.
- One error handler sends `{ error: { code, message, fields? } }`.
- Zod errors map to friendly messages per field.

## API
```
GET  /api/health
GET  /api/me                         → { id, name, role, avatarSeed, balances[] }
GET  /api/leave-types
POST /api/documents (multipart)      → 201 {id} | 400 | 413 | 415
GET  /api/documents/:id              → file | 404
POST /api/leaves {leaveType, fromDate, toDate, reason, documentIds[]}
                                     → 201 | 400 | 409 OVERLAP | 422 DOCUMENT_REQUIRED | INSUFFICIENT_BALANCE
GET  /api/leaves/mine?status=        → history
GET  /api/leaves/:id                 → request + timeline | 404
POST /api/leaves/:id/cancel          → 200 | 409
POST /api/leaves/:id/respond {comment, documentIds[]}  (reply to info request) → 200 | 409
GET  /api/approvals?status=pending   → manager: PENDING_MANAGER of reports; HOD: PENDING_HOD
POST /api/leaves/:id/actions {action: APPROVE|REJECT|REQUEST_INFO, comment}
                                     → 200 | 400 | 403 | 409 STALE
GET  /api/audit?requestId=           → approvers / HOD
```

## Server file layout
```
server/src/
  index.ts  createApp.ts (named so Vercel does not mistake it for the entry)
  config/env.ts (zod-validated env)
  auth/requireAuth.ts  auth/requireRole.ts  (Clerk getAuth + publicMetadata)
  domain/leaveTypes.ts  domain/workflow.ts  domain/dates.ts
  models/LeaveRequest.ts  models/AuditLog.ts  models/Document.ts
  services/leaveService.ts  approvalService.ts  auditService.ts  documentService.ts  balanceService.ts
  routes/*.ts  (parse with zod → call service → map errors)
  middleware/errorHandler.ts  validate.ts
  tests/workflow.test.ts  dates.test.ts  leaves.api.test.ts
```
- **Indexes:**
  - `LeaveRequest {employeeId, fromDate}`
  - `{managerId, status}`
  - `{hodId, status}`
  - `AuditLog {requestId, at}`
- **In tests:** auth is replaced by a test header (`x-test-user`) only when `NODE_ENV=test`.

## UI (after the server works)
- **Design tokens:** `build-kit/design`, with colours updated to **Akasa's site palette** (pulled from akasaair.com CSS):
  - brand violet `#5c0fd9`
  - accent orange `#ff6300`
  - tints `#eee7fa` and `#ffefe5`
  - Fonts stay Big Shoulders, Inter and Geist Mono. No Akasa logo.
- **Status colours:**
  - amber: pending with manager
  - violet: with HOD
  - blue: info requested
  - green: approved
  - red: rejected
  - grey: cancelled
- **Login:** a split-screen hero with Clerk `<SignIn>` (Google and email), themed with the tokens through Clerk `appearance`.
- **Screens by role:**
  - **Employee:**
    - Home has balance cards and a "Request leave" button.
    - The apply form:
      - shows the live day count and the balance after this request
      - **shows the document upload and an "HOD approval needed" note only once the request goes over 3 days or the type needs a document** (progressive disclosure)
    - History list and request detail with a timeline stepper.
  - **Manager/HOD:**
    - The approvals queue shows cards on mobile and a table on desktop.
    - The detail panel shows documents, the balance impact and a team-clash hint.
    - Approve, Reject and Ask-for-info buttons; the comment box is required for Reject and Ask-for-info.
- **UX principles:**
  - one primary action per screen
  - progressive disclosure
  - friendly empty, loading and error states
  - mobile-first
- **impeccable:** one critique around 11:40, then polish at 12:20. It never touches `design/DESIGN.md`.

## Timeline
| Time | Do |
|---|---|
| now–+10 min | Repo, scaffold, `.env` (Clerk keys and Atlas URI), Clerk users and metadata, `gh` push |
| →11:15 | Server steps 1–3: models, workflow, services, routes + curl + tests |
| →11:45 | Server steps 4–5: documents, audit, approvals, HOD step |
| →12:30 | Client: login, employee flow, approver flow |
| 12:15 | **Feature freeze** |
| 12:30–12:50 | Polish, tests, README (run steps, architecture, decisions, AI usage) |
| 12:50 | Fresh-clone run test, push, submit |

## Verification
- `npm test` covers:
  - workflow transitions, including the HOD path for more than 3 days and REQUEST_INFO and respond
  - day counting
  - API: 422 DOCUMENT_REQUIRED, 409 OVERLAP, 409 STALE on a double approve, 404 on another user's request
- `curl` script in the README walks the happy path.
- **Manual check:**
  1. Employee applies for 5 days with a PDF.
  2. Manager approves; the request moves to the HOD queue.
  3. HOD asks for info; the employee responds.
  4. HOD approves.
  5. Check the timeline shows every step and the balance dropped.
  6. Open it on a phone-width screen too.
- **Fresh clone:** `npm install && npm run dev` works by following only the README.
