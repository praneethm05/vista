# Vista API reference (curl + Postman)

Every endpoint the server exposes, with ready-to-run `curl` commands, example responses and the error cases.

> **Postman:** *Import → Raw text* → paste any curl below. Create an environment with the variables `BASE`, `TOKEN`, `LEAVE_ID` and `DOC_ID`.

## Setup

```bash
export BASE=http://localhost:4000/api
export TOKEN=<clerk-session-token> # see "Getting a token" below
export AUTH="Authorization: Bearer $TOKEN"
```

### Getting a token
Vista uses **Clerk**. The API accepts a Clerk session token as a Bearer token.

1. Run the client (`npm run dev`) and sign in as the user you want to test with: employee, manager or HOD.
2. Open the browser DevTools console and run:
   ```js
   await window.Clerk.session.getToken()
   ```
3. Copy the result into `TOKEN`.

The default Clerk token lives about **60 seconds**. For longer Postman sessions:
1. Create a JWT template named `postman` in the Clerk dashboard (*Configure → Sessions → JWT templates*) and set its lifetime to 3600 s.
2. Get a token with `await window.Clerk.session.getToken({ template: 'postman' })`.

Use one token per demo account: `TOKEN_EMP` (employee+clerk_test@vista-demo.com), `TOKEN_MGR` (manager@), `TOKEN_HOD` (admin@, the second-level approver), and `TOKEN_NEW` for a fresh sign-up, to walk through the full approval flow.

### Response conventions
- JSON everywhere. Dates are `YYYY-MM-DD` in requests and ISO strings in responses.
- **Every error has the same shape:**
  ```json
  { "error": { "code": "DOCUMENT_REQUIRED", "message": "Leave longer than 3 consecutive days needs a supporting document.", "fields": { "documentIds": "Required" } } }
  ```
- **Status codes:**

  | Code | Meaning |
  |---|---|
  | 200 | OK |
  | 201 | Created |
  | 400 | Invalid input |
  | 401 | Not signed in |
  | 403 | Wrong role or wrong approver |
  | 404 | Not found, or not yours (never reveals that the item exists) |
  | 409 | Conflict: overlap, already decided, or a concurrent update |
  | 413 | File too large |
  | 415 | File type not allowed |
  | 422 | A business rule failed: document required, insufficient balance, no approver |

---

## Leave statuses (workflow)

```
PENDING_MANAGER ─approve─► APPROVED                              (≤ 3 consecutive days)
PENDING_MANAGER ─approve─► PENDING_HOD ─approve─► APPROVED       (> 3 consecutive days: Manager + HOD)
PENDING_*       ─reject──► REJECTED                              (comment required)
PENDING_*       ─request info─► INFO_REQUESTED ─respond─► back to the same stage
PENDING_* / INFO_REQUESTED ─cancel (employee)─► CANCELLED
```

---

## 1. Health (public)

```bash
curl -s $BASE/health
```
```json
{ "ok": true, "service": "vista", "time": "2026-11-06T08:10:00.000Z" }
```

## 2. Current user + balances

```bash
curl -s $BASE/me -H "$AUTH"
```
```json
{
  "id": "user_2x…", "name": "Asha Rao", "email": "asha@example.com", "role": "EMPLOYEE",
  "department": "Engineering", "managerId": "user_mgr…", "hodId": "user_hod…", "avatarSeed": "asha@example.com",
  "balances": [
    { "code": "ANNUAL", "label": "Earned leave", "quota": 18, "used": 5, "pending": 0, "available": 13 },
    { "code": "WELLNESS", "label": "Wellness leave", "quota": null, "used": 0, "pending": 0, "available": null }
  ]
}
```
- **Errors:** `401 UNAUTHENTICATED` (missing or expired token).

## 3. Leave types (policy)

```bash
curl -s $BASE/leave-types -H "$AUTH"
```
- **Returns:** `{ types: [...], longLeaveThresholdDays: 3 }`.
- **Types:** ANNUAL 18, SICK 12, CASUAL 6, WELLNESS (no cap, document required), PARENTAL 150 (document required), BEREAVEMENT 5, PET 2.

---

## 4. Upload a supporting document

```bash
curl -s -X POST $BASE/documents -H "$AUTH" -F "file=@./medical-certificate.pdf"
```
```json
{ "id": "6729f1c2a1b2c3d4e5f60718", "filename": "medical-certificate.pdf", "mimeType": "application/pdf", "size": 48213 }
```
```bash
export DOC_ID=6729f1c2a1b2c3d4e5f60718
```

| Case | Status | Code |
|---|---|---|
| No file sent | 400 | `FILE_REQUIRED` |
| File over 5 MB | 413 | `FILE_TOO_LARGE` |
| Not PDF/PNG/JPG | 415 | `UNSUPPORTED_FILE` |

```bash
# 415 example
curl -s -X POST $BASE/documents -H "$AUTH" -F "file=@./notes.txt"
```

## 5. View / download a document

```bash
curl -s $BASE/documents/$DOC_ID -H "$AUTH" -o downloaded.pdf -w "%{http_code}\n"
```
- **Who can read it:** the uploader, plus the **manager and HOD** of the request the document is attached to.
- **Anyone else:** `404 NOT_FOUND`.

---

## 6. Apply for leave (employee)

**Short leave (≤ 3 days)**, approved by the manager only:
```bash
curl -s -X POST $BASE/leaves -H "$AUTH" -H "Content-Type: application/json" -d '{
  "leaveType": "CASUAL",
  "fromDate": "2026-11-16",
  "toDate": "2026-11-17",
  "reason": "Bank and passport work"
}'
```

**Long leave (> 3 consecutive days)** needs a document, then Manager **and** HOD approval:
```bash
curl -s -X POST $BASE/leaves -H "$AUTH" -H "Content-Type: application/json" -d '{
  "leaveType": "ANNUAL",
  "fromDate": "2026-11-23",
  "toDate": "2026-11-27",
  "reason": "Family wedding in Mysuru",
  "documentIds": ["'"$DOC_ID"'"]
}'
```

**Response `201`:**
```json
{
  "_id": "6729f2…", "employeeName": "Asha Rao", "leaveType": "ANNUAL",
  "fromDate": "2026-11-23T00:00:00.000Z", "toDate": "2026-11-27T00:00:00.000Z",
  "calendarDays": 5, "workingDays": 5, "reason": "Family wedding in Mysuru",
  "requiresHod": true, "status": "PENDING_MANAGER", "stage": "MANAGER", "version": 0
}
```
```bash
export LEAVE_ID=<_id from the response>
```

**Validation and rule errors:**

| Case | Status | Code |
|---|---|---|
| Missing or invalid field, end date before start | 400 | `VALIDATION` (+ `fields`) |
| Start date in the past (SICK/WELLNESS: up to 7 days back is allowed) | 400 | `DATE_IN_PAST` |
| More than 365 days | 400 | `TOO_LONG` |
| Only weekend days | 422 | `NO_WORKING_DAYS` |
| More than 3 days, or WELLNESS/PARENTAL, with no document | 422 | `DOCUMENT_REQUIRED` |
| Document not yours or doesn't exist | 400 | `INVALID_DOCUMENT` |
| Overlaps your pending or approved leave | 409 | `OVERLAP` |
| Not enough balance | 422 | `INSUFFICIENT_BALANCE` |
| You have no manager or HOD assigned | 422 | `NO_APPROVER` |

```bash
# 400: end before start
curl -s -X POST $BASE/leaves -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"leaveType":"ANNUAL","fromDate":"2026-11-20","toDate":"2026-11-18","reason":"Trip"}'

# 422: 5 days without a document
curl -s -X POST $BASE/leaves -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"leaveType":"ANNUAL","fromDate":"2026-12-07","toDate":"2026-12-11","reason":"Vacation"}'

# 422: pet leave quota is 2 days
curl -s -X POST $BASE/leaves -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"leaveType":"PET","fromDate":"2026-12-14","toDate":"2026-12-16","reason":"New puppy"}'
```

## 7. My leave history (employee)

```bash
curl -s "$BASE/leaves/mine" -H "$AUTH"
curl -s "$BASE/leaves/mine?status=PENDING_MANAGER,PENDING_HOD,INFO_REQUESTED" -H "$AUTH" # filter (comma-separated)
curl -s "$BASE/leaves/mine?status=APPROVED" -H "$AUTH"
```
- **Returns:** an array of requests, newest first.
- **Each request includes:** `status` and `lastComment`, the latest approver comment.

## 8. Request detail + timeline (employee, manager, HOD)

```bash
curl -s $BASE/leaves/$LEAVE_ID -H "$AUTH"
```
```json
{
  "request": { "_id": "…", "status": "PENDING_HOD", "stage": "HOD", "…": "…" },
  "timeline": [
    { "action": "SUBMITTED", "actorName": "Asha Rao", "actorRole": "EMPLOYEE", "toStatus": "PENDING_MANAGER", "comment": "Family wedding in Mysuru", "at": "…" },
    { "action": "APPROVED_BY_MANAGER", "actorName": "Meera M", "actorRole": "MANAGER", "fromStatus": "PENDING_MANAGER", "toStatus": "PENDING_HOD", "at": "…" }
  ],
  "documents": [ { "_id": "…", "filename": "medical-certificate.pdf", "mimeType": "application/pdf", "size": 48213 } ]
}
```
- **Errors:** `404` if the request isn't yours and you aren't its manager or HOD.

## 9. Cancel (employee, while still open)

```bash
curl -s -X POST $BASE/leaves/$LEAVE_ID/cancel -H "$AUTH"
```
- **Success:** `200` with `status: "CANCELLED"`.
- **Errors:**
  - `409 NOT_CANCELLABLE` if the request is already approved, rejected or cancelled
  - `403` if it isn't your request

## 10. Respond to an info request (employee)

```bash
curl -s -X POST $BASE/leaves/$LEAVE_ID/respond -H "$AUTH" -H "Content-Type: application/json" -d '{
  "comment": "Ravi will cover my on-call shifts. Doctor note attached.",
  "documentIds": ["'"$DOC_ID"'"]
}'
```
- **Success:** `200`, and the request goes back to the stage that asked (`PENDING_MANAGER` or `PENDING_HOD`).
- **Errors:** `409 NO_INFO_REQUESTED` if nobody has asked for more information.

---

## 11. Approval queue (manager / HOD)

```bash
curl -s $BASE/approvals -H "Authorization: Bearer $TOKEN_MGR" # waiting on me
curl -s "$BASE/approvals?scope=all" -H "Authorization: Bearer $TOKEN_MGR" # everything I approve, any status
```
- **Who sees what:**
  - **Manager:** `PENDING_MANAGER` requests from their reports.
  - **HOD:** `PENDING_HOD` requests for their department.
- **Insights:** each item includes `insights` to help the approver decide:
```json
"insights": {
  "balance": { "code": "ANNUAL", "quota": 18, "used": 0, "pending": 5, "available": 13 },
  "balanceAfterApproval": 13,
  "teamClashes": [ { "employeeName": "Ravi K", "fromDate": "…", "toDate": "…", "status": "APPROVED" } ]
}
```
- **Errors:** `403 FORBIDDEN` for employees.

## 12. Approval detail (manager / HOD)

```bash
curl -s $BASE/approvals/$LEAVE_ID -H "Authorization: Bearer $TOKEN_MGR"
```
- **Returns:** the same shape as #8, plus `request.insights`.

## 13. Approve / Reject / Ask for more info (manager / HOD)

```bash
# Approve (comment optional)
curl -s -X POST $BASE/approvals/$LEAVE_ID/actions -H "Authorization: Bearer $TOKEN_MGR" -H "Content-Type: application/json" \
  -d '{"action":"APPROVE","comment":"Approved, enjoy the wedding!"}'

# Reject (comment required)
curl -s -X POST $BASE/approvals/$LEAVE_ID/actions -H "Authorization: Bearer $TOKEN_MGR" -H "Content-Type: application/json" \
  -d '{"action":"REJECT","comment":"Release week: please move this by a week."}'

# Ask for more information (comment required)
curl -s -X POST $BASE/approvals/$LEAVE_ID/actions -H "Authorization: Bearer $TOKEN_HOD" -H "Content-Type: application/json" \
  -d '{"action":"REQUEST_INFO","comment":"Who is covering your on-call?"}'
```

| Case | Status | Code |
|---|---|---|
| Reject or request info without a comment | 400 | `COMMENT_REQUIRED` |
| Unknown action | 400 | `VALIDATION` |
| Not the approver for the current stage (e.g. manager acting on a `PENDING_HOD` request) | 403 | `NOT_YOUR_APPROVAL` |
| Acting on your own leave | 403 | `SELF_APPROVAL` |
| Already decided or cancelled | 409 | `NOT_PENDING` |
| Someone updated it a moment ago (concurrent click) | 409 | `STALE` |
| Final approval would exceed the balance | 422 | `INSUFFICIENT_BALANCE` |

**Concurrency demo** (two decisions at once → exactly one wins):
```bash
curl -s -X POST $BASE/approvals/$LEAVE_ID/actions -H "Authorization: Bearer $TOKEN_MGR" -H "Content-Type: application/json" -d '{"action":"APPROVE"}' &
curl -s -X POST $BASE/approvals/$LEAVE_ID/actions -H "Authorization: Bearer $TOKEN_MGR" -H "Content-Type: application/json" -d '{"action":"REJECT","comment":"x"}' &
wait
```

## 14. Teams: join requests

**Find a manager** (search by name, email or employee ID):
```bash
curl -s "$BASE/team/managers?q=VST-0002" -H "Authorization: Bearer $TOKEN_NEW"
```

**My latest join request:**
```bash
curl -s $BASE/team/join-request -H "Authorization: Bearer $TOKEN_NEW"
```

**Ask to join** (a new request replaces any earlier pending one):
```bash
curl -s -X POST $BASE/team/join-request -H "Authorization: Bearer $TOKEN_NEW" -H "Content-Type: application/json" \
  -d '{"managerId":"<manager clerk id from search>","message":"I joined the Payments squad"}'
```
- **Success:** `201`.
- **Errors:**
  - `404 MANAGER_NOT_FOUND`
  - `409 ALREADY_IN_TEAM`

**Manager inbox** (pending requests to join their team):
```bash
curl -s $BASE/team/requests -H "Authorization: Bearer $TOKEN_MGR"
```

**Accept or decline:**
```bash
curl -s -X POST $BASE/team/requests/<id>/decision -H "Authorization: Bearer $TOKEN_MGR" -H "Content-Type: application/json" \
  -d '{"decision":"ACCEPT","comment":"Welcome aboard"}'
```
- **Success:** `200`. On accept, the employee gets `managerId` = this manager and `hodId` = the admin.
- **Errors:**
  - `409 ALREADY_DECIDED` on a second click
  - `403` for non-managers

**Team members (manager) / everyone (admin):**
```bash
curl -s $BASE/team/members -H "Authorization: Bearer $TOKEN_MGR"
```

> An employee with no team gets `422 NO_TEAM` from `POST /leaves`.

## 15. Dashboard, policy and organisation

```bash
# Dashboard: manager → their team; admin and sysadmin → everyone
curl -s $BASE/stats -H "Authorization: Bearer $TOKEN_MGR"

# Current leave policy (anyone signed in)
curl -s $BASE/settings -H "$AUTH"

# Change the policy (sysadmin only)
curl -s -X PUT $BASE/settings -H "Authorization: Bearer $TOKEN_SYS" -H "Content-Type: application/json" \
  -d '{"longLeaveThresholdDays":5,"cancelNoticeDays":2,"quotas":{"ANNUAL":20,"CASUAL":8}}'

# Reshape the org (sysadmin only): role, manager, department
curl -s -X PATCH $BASE/org/<clerkUserId> -H "Authorization: Bearer $TOKEN_SYS" -H "Content-Type: application/json" \
  -d '{"role":"EMPLOYEE","managerId":"<managerClerkId>","department":"Engineering"}'
```

**`PATCH /org/:id` errors:**

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_MANAGER` | The new manager isn't a manager or admin, or a manager is placed under a non-admin |
| 400 | `SELF_MANAGER` | Someone is set to report to themselves |
| 400 | `CYCLE` | The change would create a reporting loop |
| 409 | `HAS_REPORTS` | A manager with reports is demoted to employee |
| 403 | | The caller isn't the sysadmin |

**Taking back approved leave** uses the same cancel endpoint: `POST /leaves/:id/cancel` on an `APPROVED` request.
- Works if it starts at least `cancelNoticeDays` days from today.
- Otherwise `409 TOO_LATE_TO_CANCEL`.

## 16. Audit log (Admin)

```bash
curl -s $BASE/audit -H "Authorization: Bearer $TOKEN_HOD"
```
- **Returns:** the latest 100 audit entries, newest first.
- **Each entry:** `actorName`, `actorRole`, `action`, `fromStatus`, `toStatus`, `comment` and `at`.
- **Actions recorded:**
  - `TEAM_JOIN_REQUESTED`
  - `TEAM_JOIN_ACCEPTED`
  - `TEAM_JOIN_REJECTED`
  - `SUBMITTED`
  - `APPROVED_BY_MANAGER`
  - `APPROVED`
  - `REJECTED`
  - `INFO_REQUESTED`
  - `INFO_PROVIDED`
  - `CANCELLED`
  - `DOCUMENT_UPLOADED`
- **Errors:** `403` for non-admin users.

---

## End-to-end script (long leave, Manager → HOD)

```bash
# 1. Employee uploads a document and applies for 5 days
DOC_ID=$(curl -s -X POST $BASE/documents -H "Authorization: Bearer $TOKEN_EMP" -F "file=@./note.pdf" | jq -r .id)
LEAVE_ID=$(curl -s -X POST $BASE/leaves -H "Authorization: Bearer $TOKEN_EMP" -H "Content-Type: application/json" \
  -d '{"leaveType":"ANNUAL","fromDate":"2026-11-23","toDate":"2026-11-27","reason":"Family wedding","documentIds":["'"$DOC_ID"'"]}' | jq -r ._id)

# 2. Manager approves → PENDING_HOD
curl -s -X POST $BASE/approvals/$LEAVE_ID/actions -H "Authorization: Bearer $TOKEN_MGR" -H "Content-Type: application/json" -d '{"action":"APPROVE"}' | jq .status

# 3. HOD asks for info → INFO_REQUESTED; employee responds → PENDING_HOD
curl -s -X POST $BASE/approvals/$LEAVE_ID/actions -H "Authorization: Bearer $TOKEN_HOD" -H "Content-Type: application/json" -d '{"action":"REQUEST_INFO","comment":"Who covers on-call?"}' | jq .status
curl -s -X POST $BASE/leaves/$LEAVE_ID/respond -H "Authorization: Bearer $TOKEN_EMP" -H "Content-Type: application/json" -d '{"comment":"Ravi covers on-call"}' | jq .status

# 4. HOD approves → APPROVED; check the timeline and the balance
curl -s -X POST $BASE/approvals/$LEAVE_ID/actions -H "Authorization: Bearer $TOKEN_HOD" -H "Content-Type: application/json" -d '{"action":"APPROVE","comment":"Enjoy"}' | jq .status
curl -s $BASE/leaves/$LEAVE_ID -H "Authorization: Bearer $TOKEN_EMP" | jq '.timeline[].action'
curl -s $BASE/me -H "Authorization: Bearer $TOKEN_EMP" | jq '.balances[] | select(.code=="ANNUAL")'
```

> The same flow runs automatically, with no tokens needed, in `server/src/tests/api.test.ts` (`cd server && npm test`).
