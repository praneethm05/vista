# Vista: senior engineering review

The goal here is not more features. It is to show that what exists is correct.
This document covers:
1. requirements traceability
2. invariants that were not enforced (each with a test written first, then the fix)
3. independent evidence
4. threat model
5. decision records
6. what was not done

Sources used: `docs/problem-statement.docx`, the code and its git history, and the live deployment's runtime logs and response headers.

---

## 1. Requirements traceability matrix

Every line of the brief is mapped to the code, the test that proves it, and a demo step.

| # | Brief says | Code | Proof (test) | Demo step |
|---|---|---|---|---|
| 1 | Employee: submit leave requests | `services/leaveService.ts` `submit` · `pages/ApplyLeave.tsx` | `api.test.ts` long-leave flow · sim "Everyday" (15) | Employee → Apply |
| 2 | Employee: view submitted requests / leave history | `listMine` · `pages/MyLeave.tsx` | sim + `api.test.ts` | Employee → My leave |
| 3 | Employee: check request status | `getDetail` + `Timeline` / `ApprovalSteps` | `api.test.ts` timeline assertion | Open a request |
| 4 | Employee: attach documents | `documentService.upload` · `DocumentUpload` | `api.test.ts` upload · `invariants.test.ts` real-bytes check | Apply 5 days → upload |
| 5 | Manager: view all pending requests | `approvalService.queue` · `pages/Approvals.tsx` | `invariants`/`api` queue use · sim | Manager → Approvals |
| 6 | Manager: approve | `approvalService.act` + `domain/workflow.ts` | `workflow.test.ts` · properties (2,000 random sequences) | Approve |
| 7 | Manager: reject | same | `workflow.test.ts` "reject needs comment" | Reject with comment |
| 8 | Manager: add comments while approving or rejecting | `actionSchema.comment` · `lastComment` | `workflow.test.ts` COMMENT_REQUIRED | Comment box |
| 9 | Manager: view documents | `documentService.download` (approver only) | `api.test.ts` manager 200 · other employee 404 | Click 📎 document |
| 10 | Manager: ask for more information | `REQUEST_INFO` → `INFO_REQUESTED` → `respond` | `workflow.test.ts` · `api.test.ts` round trip | Ask for info → employee replies |
| 11 | **More than 3 consecutive days → documents + Manager AND HOD approval** | `needsDocument`, `requiresHod`, `PENDING_HOD` stage | `api.test.ts` DOCUMENT_REQUIRED + full HOD flow · properties: "approved long leave always passed both approvers" | Apply Mon–Fri → manager → admin |
| 12 | Leave fields `employeeName`, `fromDate`, `toDate`, `reason` | `models/LeaveRequest.ts` (same names) | `api.test.ts` | Network tab / API.md |
| 13 | Output: an executable + README with run instructions | `npm run setup && npm run dev` · `README.md` · live URL | Fresh-clone run (manual) | README |
| 14 | Workflow implementation (skill) | pure state machine in `domain/workflow.ts` | 7 unit + 2,000 property runs | n/a |
| 15 | Form validation (skill) | Zod schemas + UI form state | `api.test.ts` 400 fields · sim "Validation" (13) | Apply form hints |
| 16 | CRUD (skill) | create / read / update (decide, cancel) / soft delete (cancel) | sim | n/a |
| 17 | Usage of AI tools (skill) | README "How AI was used" · `docs/PLAN.md` | n/a | Interview |
| 18 | Plus: audit logs | `auditService.record` (append-only) | `api.test.ts` timeline · `invariants.test.ts` DOCUMENT_VIEWED | Admin → Audit log |
| 19 | Plus: friendly error messages | `AppError` + `errorHandler` | every error test asserts `code` and `message` | Trigger any error |
| 20 | Plus: colour coding | `STATUS_META`, `RoleTag` | manual | Status badges |
| 21 | Plus: responsive web/mobile | Tailwind mobile-first, bottom nav | **manual only, no automated test** | Phone width |

**Without automated proof:** #13 (fresh clone), #20 (colour) and #21 (responsive) are checked by hand only.

---

## 2. Invariants that were not enforced: test first, then fix

| Invariant | Failing test (before) | Fix | Status |
|---|---|---|---|
| An uploaded file must really be PDF/PNG/JPG | An `.exe` sent as `application/pdf` → 201 | `sniffType()` checks the file's first bytes; mismatch → 415 | ✅ fixed |
| "Today" means the organisation's date (IST), not UTC | 01:30 IST on 7 Nov computed as 6 Nov | `orgToday()` uses `Intl` with `Asia/Kolkata` (configurable via `ORG_TIME_ZONE`) | ✅ fixed |
| Every view of a medical document is recorded (DPDP Act) | No audit entry on download | `DOCUMENT_VIEWED` audit on every read | ✅ fixed |
| No orphaned approvals when someone changes manager | The pending request stayed with the old manager | Requests at the manager stage move with the employee (`orgService`) | ✅ fixed |
| Concurrent approvals never exceed a balance | Test passed **even without a fix**: pending days are reserved at submit, so each approval sees the other | Kept a per-employee approval lock as an extra safeguard | ✅ held by design |
| Status change, audit entry and email happen together | Not reproduced as a test (needs failure injection) | **Not fixed:** see decision record 3 | ⚠️ documented |

**Found earlier by the 20-person simulation (`docs/SIMULATION.md`):**
- balance checked against the wrong year
- a triple-click on Submit created duplicate requests

Both are fixed and tested.

---

## 3. Independent evidence

| Tool | Result |
|---|---|
| Vitest (unit + API + invariants) | **25 / 25 passing** |
| fast-check property tests | **3 properties, 3,000 random cases**, 0 counterexamples |
| Corporate simulation (20 people) | **103 / 103 scenarios** as expected |
| Vercel runtime logs + response headers | Used to find 5 deploy-time root causes (wrong entry file, missing express import, CSP blocking Clerk, …) |
| Mutation testing (Stryker) | **Not run.** See §6 |
| Playwright e2e / axe / OWASP ZAP | **Not run.** See §6 |

---

## 4. Threat model (STRIDE)

| Threat | Where | Mitigation | Remaining risk |
|---|---|---|---|
| **S**poofing | API calls | Clerk session token verified on every `/api` call; the test header only works when `NODE_ENV=test` | Clerk dev instance (test emails, code 424242) is demo-only |
| **T**ampering | Status changes, roles | Server-side state machine; roles live in Mongo and only the sysadmin can change them; optimistic locking (`version`) | The audit log is append-only by code convention, not cryptographically chained |
| **R**epudiation | "I never approved that" | Every transition, upload, document view, org and policy change is audited with actor and role | The audit write is not in the same transaction as the status change |
| **I**nformation disclosure | Requests, documents | Owner/approver checks; others get 404, not 403; document views audited | Documents are stored unencrypted in Mongo (Atlas encrypts at rest) |
| **D**enial of service | Uploads, submits | 4 MB upload cap, 100 KB JSON cap, per-employee submit lock | No rate limiting per IP or user |
| **E**levation of privilege | Roles | Only the SYSADMIN can change roles; the SYSADMIN account can't be changed through the API; `requireRole` on every privileged route | No 2-person rule for org changes |

---

## 5. Decision records

1. **"More than 3 consecutive days" counts calendar days, not working days.**
   - Follows the brief's wording ("consecutive"). Balances still deduct working days.
   - The threshold is editable by the sysadmin. If HR wants working days, it's a one-line change.
2. **404, not 403, for other people's requests and documents.**
   - Prevents probing which IDs exist (IDOR protection).
   - Approvers on a different team also get 404.
3. **No Mongo transaction around status + audit + email (yet).**
   - The conditional update (`version`) is the single source of truth.
   - The audit insert follows it, and email is best-effort and never blocks.
   - Next step: a transaction for status + audit, plus an email outbox with retries. Atlas supports transactions; the in-memory test server would need a replica set.
4. **Balances are derived, not stored.**
   - Calculated from requests (approved + pending), so they can't drift.
   - Pending days are reserved at submit, which is why concurrent approvals were already safe.
5. **Users and roles in MongoDB, identity in Clerk.**
   - Self sign-up defaults to Employee with no team.
   - Only the sysadmin (or a manager accepting a join request) can change who reports to whom.

---

## 6. What was not done, and why

Time-boxed to the 4:15 PM submission. The items are ordered by how much they would add.

| Not done | Why | How |
|---|---|---|
| Mutation testing (Stryker) | ~10 min of setup plus run time | `npx stryker run` on `src/domain` + `src/services`; target ≥ 70 % |
| Playwright e2e through real Clerk | Needs `@clerk/testing` tokens and a test instance | One spec: employee applies → manager approves → admin approves |
| axe accessibility pass | Needs a browser run | `@axe-core/playwright` inside the e2e spec |
| OWASP ZAP baseline | Needs Docker; the campus network filters traffic | `docker run zaproxy/zap-stable zap-baseline.py -t <url>` |
| Transaction + email outbox | Changes the write path close to the deadline | See decision record 3 |
| Leave split across the year end | Policy question for HR | Split the request into per-year parts |
| Public holidays / half days / leave accrual / carry-forward | Out of the brief's scope | Holiday calendar per location; accrual job |
