# Vista: recruiter walkthrough (about 10 minutes)

This tour covers every feature, one role at a time.

**Open:** **https://vista.praneethm.dev**. If your network blocks it, use **https://vista-btyc.vercel.app**, which is the same app.

**Logins:**
- The password for every demo account is **`Vista#Leave-2026!`**.
- If Clerk asks for a verification code, type **`424242`**.
- To switch roles, click **Sign out** (top right) and sign in with the next account.
- The demo logins are also on the sign-in page under **"Hey Recruiter, I've made logins for you"**.

> The company is already populated: 22 people in Engineering, Operations, Customer Experience and Product & Design, with 10 months of leave history. You'll find real-looking queues, people on leave today, and upcoming leave.

---

## 1 · Employee: Arjun Shetty (2 min)
**Sign in:** `employee+clerk_test@vista-demo.com`

1. **My leave:**
   - balance cards (Earned, Sick, Casual)
   - your history, with colour-coded statuses
2. Click **+ Apply for leave** and try these, watching the **Summary** panel on the right:
   - **A Saturday only.** The form says it's a weekend, doesn't count it, and Submit stays disabled.
   - **Fri → Mon.** "2 working days · 2 weekend days not counted".
   - **Mon → Fri, Earned leave (5 days).** An upload box appears ("more than 3 consecutive days needs a document") and the approval route shows **Manager → HOD**.
   - **Pet adoption leave for 3 days.** "You have 2 days left, but this needs 3", so it's blocked before you even submit.
3. Submit a **5-day Earned leave** with any small PDF or image. You'll land on the **request page**, which shows:
   - the progress stepper
   - an activity timeline with role tags
   - the attached document
4. *(Optional)* On a request still pending, try **Cancel request**.

## 2 · Manager: Meera Menon (3 min)
**Sign in:** `manager+clerk_test@vista-demo.com`

1. **Dashboard:**
   - team headline numbers (who's out **today**: Rahul is off sick)
   - leave by type
   - status breakdown
   - next 7 days
   - a Working / On leave card for each person
2. **Approvals** shows only what's waiting on her, including **Arjun's request** from step 1 and **Sneha's 5-day leave with a medical certificate**. Open Arjun's:
   - **Before you decide:** his balance after approval, plus **teammates already off** on those dates.
   - Click the document to open it. *The view is recorded in the audit log, because medical documents are sensitive data.*
   - Try **Reject** with no comment: it asks for one. Then add a comment and click **Approve & send to HOD**.
3. Open **Ask for more info** on another request and see how the employee is asked.
4. Use the **All requests** tab to see Priya's request waiting in **"Info needed"**.
5. **My team:**
   - join requests from new joiners (Accept / Decline)
   - the team members, with role tags

## 3 · Admin · HOD: Aditi Rao (2 min)
**Sign in:** `admin+clerk_test@vista-demo.com`

1. **Approvals:**
   - Arjun's request, now at the **HOD stage** (second approval)
   - **Kabir's** and **Siddharth's** long leaves, already approved by their managers
   - Approve one, and look at the timeline: Manager approved → HOD approved.
2. **Dashboard** covers the **whole company**. Scroll to **Approver activity**: for each manager, approved, rejected and asked-info counts, approval rate and **average response time**. The most active approver is flagged.
3. **Audit log:** every submission, decision, document view, organisation change and policy change, with who did it, their role and when.

## 4 · System admin: Sam Kurian (2 min)
**Sign in:** `sysadmin+clerk_test@vista-demo.com`

1. **Organisation:** the whole company as **team cards**: Admin at the top, then one card per manager.
   - **Search** "Ops", "Priya" or an ID like "VST-0012".
   - **Click anyone** to change their role, manager or department. Try:
     - **promoting an employee to Manager**
     - **moving someone to another team**
     - **making a manager report to one of their own reports**: blocked as a loop
     - **demoting a manager who still has reports**: blocked with "move them first"
   - **+ Add person:** pre-register a new joiner (name, email, role, manager). When they first sign in with that email, they land straight in their team.
2. **Settings:** change the leave policy without touching code:
   - **Second approval after N days.** Set it to 5, then as Arjun apply Mon–Thu: no document and no HOD needed now.
   - **Take back approved leave until N days before** it starts.
   - **Yearly quotas** per leave type.
   - Every change goes in the audit log with before and after values.

## 5 · A new joiner: you (1 min)
1. Sign out, then **sign up with your own email** (Google or email).
2. **Step 1 – Profile:** name, job title, mobile (try an invalid one to see the check), location.
3. **Step 2 – Join your team:** search **Meera** or **VST-0002**, add a note, then send.
4. Sign in as the **Manager** → **My team** → **Accept**.
5. Back in your account, you can apply for leave. **You'll also get real emails** from `vista@praneethm.dev`, e.g. "You're in Meera Menon's team".

> Demo accounts never get email, because their addresses can't receive it. Your real address will.

---

## Things worth noticing
- **Mobile:** open the site on your phone. You get a bottom navigation bar and the layout is card-based.
- **Concurrency:** two approvers acting at the same moment → one wins and the other sees "Someone else just updated this request".
- **Privacy:** an employee who changes the URL to another person's request ID gets **404**, so nothing about it is revealed.
- **Evidence:**
  - [`docs/SIMULATION.md`](docs/SIMULATION.md): a 20-person company running 103 scenarios
  - [`docs/REVIEW.md`](docs/REVIEW.md): traceability, threat model and decision records
  - [`docs/API.md`](docs/API.md): curl for every endpoint

## Reset the demo data
Run `npm run seed && npm --prefix server run seed:org` from the repo. It rebuilds the demo company and leaves real accounts untouched.
