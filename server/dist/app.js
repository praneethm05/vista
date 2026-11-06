// src/createApp.ts
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { clerkMiddleware } from "@clerk/express";

// src/auth/requireAuth.ts
import { clerkClient, getAuth } from "@clerk/express";

// src/domain/errors.ts
var AppError = class extends Error {
  constructor(code, status, message, fields) {
    super(message);
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
  code;
  status;
  fields;
};
var notFound = (what = "Leave request") => new AppError("NOT_FOUND", 404, `${what} not found.`);

// src/models/User.ts
import { Schema, model } from "mongoose";
var userSchema = new Schema(
  {
    clerkId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, index: true },
    role: { type: String, enum: ["EMPLOYEE", "MANAGER", "ADMIN", "SYSADMIN"], default: "EMPLOYEE" },
    employeeCode: { type: String, required: true, unique: true },
    department: { type: String, default: "Unassigned" },
    managerId: { type: String, default: null, index: true },
    hodId: { type: String, default: null }
  },
  { timestamps: true }
);
var User = model("User", userSchema);

// src/auth/requireAuth.ts
var CACHE_MS = 3e4;
var cache = /* @__PURE__ */ new Map();
function forgetUser(id) {
  cache.delete(id);
}
async function requireAuth(req, _res, next) {
  if (process.env.NODE_ENV === "test") {
    const header = req.header("x-test-user");
    if (!header) throw new AppError("UNAUTHENTICATED", 401, "Please sign in to continue.");
    req.user = JSON.parse(header);
    return next();
  }
  const { userId } = getAuth(req);
  if (!userId) throw new AppError("UNAUTHENTICATED", 401, "Please sign in to continue.");
  req.user = await loadUser(userId);
  next();
}
async function loadUser(clerkId) {
  const hit = cache.get(clerkId);
  if (hit && hit.until > Date.now()) return hit.user;
  let doc = await User.findOne({ clerkId }).lean();
  if (!doc) doc = (await createFromClerk(clerkId)).toObject();
  const user = toCurrentUser(doc);
  cache.set(clerkId, { user, until: Date.now() + CACHE_MS });
  return user;
}
async function createFromClerk(clerkId) {
  const clerkUser = await clerkClient.users.getUser(clerkId);
  const email = clerkUser.primaryEmailAddress?.emailAddress ?? "";
  const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || email.split("@")[0] || "New employee";
  try {
    return await User.create({ clerkId, name, email, role: "EMPLOYEE", employeeCode: await nextEmployeeCode() });
  } catch (err) {
    const existing = await User.findOne({ clerkId });
    if (existing) return existing;
    throw err;
  }
}
async function nextEmployeeCode() {
  const count = await User.countDocuments();
  return `VST-${1001 + count}-${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
}
function toCurrentUser(doc) {
  return {
    id: doc.clerkId,
    name: doc.name,
    email: doc.email,
    role: doc.role,
    department: doc.department ?? "Unassigned",
    employeeCode: doc.employeeCode,
    managerId: doc.managerId ?? null,
    hodId: doc.hodId ?? null,
    avatarSeed: doc.email || doc.clerkId
  };
}
function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError("FORBIDDEN", 403, "You don't have access to this page.");
    }
    next();
  };
}

// src/middleware/errorHandler.ts
import { ZodError } from "zod";
import multer from "multer";
function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, fields: err.fields } });
  }
  if (err instanceof ZodError) {
    const fields = {};
    for (const issue of err.issues) fields[issue.path.join(".") || "body"] ??= issue.message;
    const first = err.issues[0]?.message ?? "Some fields need attention.";
    return res.status(400).json({ error: { code: "VALIDATION", message: first, fields } });
  }
  if (err instanceof multer.MulterError) {
    const tooBig = err.code === "LIMIT_FILE_SIZE";
    return res.status(tooBig ? 413 : 400).json({
      error: { code: tooBig ? "FILE_TOO_LARGE" : "UPLOAD_ERROR", message: tooBig ? "Files must be 4 MB or smaller." : "The upload failed. Please try again." }
    });
  }
  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong on our side. Please try again in a moment." } });
}

// src/routes/leaves.ts
import { Router } from "express";

// src/domain/schemas.ts
import { z } from "zod";

// src/domain/leaveTypes.ts
var LEAVE_TYPES = [
  { code: "ANNUAL", label: "Earned leave", description: "Planned time off, holidays and travel.", quota: 18, documentAlways: false, backdateDays: 0 },
  { code: "SICK", label: "Sick leave", description: "When you are unwell. Can be applied up to 7 days after.", quota: 12, documentAlways: false, backdateDays: 7 },
  { code: "CASUAL", label: "Casual leave", description: "Short personal errands and emergencies.", quota: 6, documentAlways: false, backdateDays: 0 },
  { code: "WELLNESS", label: "Wellness leave", description: "Critical illness needing ongoing care. Medical proof required.", quota: null, documentAlways: true, backdateDays: 7 },
  { code: "PARENTAL", label: "Parental leave", description: "Gender-neutral, for birth, adoption or surrogacy.", quota: 150, documentAlways: true, backdateDays: 0 },
  { code: "BEREAVEMENT", label: "Bereavement leave", description: "Time to grieve the loss of someone close.", quota: 5, documentAlways: false, backdateDays: 3 },
  { code: "PET", label: "Pet adoption leave", description: "Settle in your new family member.", quota: 2, documentAlways: false, backdateDays: 0 }
];
var LEAVE_TYPE_CODES = LEAVE_TYPES.map((t) => t.code);
function getLeaveType(code) {
  const type = LEAVE_TYPES.find((t) => t.code === code);
  if (!type) throw new Error(`Unknown leave type ${code}`);
  return type;
}
var LONG_LEAVE_THRESHOLD_DAYS = 3;
function isLongLeave(calendarDayCount, threshold = LONG_LEAVE_THRESHOLD_DAYS) {
  return calendarDayCount > threshold;
}
function needsDocument(type, calendarDayCount, threshold = LONG_LEAVE_THRESHOLD_DAYS) {
  return type.documentAlways || isLongLeave(calendarDayCount, threshold);
}

// src/domain/workflow.ts
var APPROVER_ACTIONS = ["APPROVE", "REJECT", "REQUEST_INFO"];
var OPEN_STATUSES = ["PENDING_MANAGER", "PENDING_HOD", "INFO_REQUESTED"];
var ACTIVE_STATUSES = [...OPEN_STATUSES, "APPROVED"];
function transition(request, action, actor, comment, cancelContext) {
  if (action === "CANCEL") return cancel(request, actor, cancelContext);
  if (action === "RESPOND") return respond(request, actor);
  return decide(request, action, actor, comment);
}
function cancel(request, actor, ctx) {
  if (actor.id !== request.employeeId) {
    throw new AppError("FORBIDDEN", 403, "Only the employee who applied can cancel this request.");
  }
  if (request.status === "APPROVED" && ctx) {
    if (ctx.daysUntilStart < ctx.noticeDays) {
      throw new AppError("TOO_LATE_TO_CANCEL", 409, `Approved leave can be taken back up to ${ctx.noticeDays} day${ctx.noticeDays === 1 ? "" : "s"} before it starts. Please talk to your manager.`);
    }
    return { status: "CANCELLED", stage: request.stage };
  }
  if (!OPEN_STATUSES.includes(request.status)) {
    throw new AppError("NOT_CANCELLABLE", 409, `This request is already ${label(request.status)} and can no longer be cancelled.`);
  }
  return { status: "CANCELLED", stage: request.stage };
}
function respond(request, actor) {
  if (actor.id !== request.employeeId) {
    throw new AppError("FORBIDDEN", 403, "Only the employee who applied can respond.");
  }
  if (request.status !== "INFO_REQUESTED") {
    throw new AppError("NO_INFO_REQUESTED", 409, "Nobody has asked for more information on this request.");
  }
  return { status: request.stage === "HOD" ? "PENDING_HOD" : "PENDING_MANAGER", stage: request.stage };
}
function decide(request, action, actor, comment) {
  if (actor.id === request.employeeId) {
    throw new AppError("SELF_APPROVAL", 403, "You cannot approve or reject your own leave.");
  }
  const expectedApprover = request.status === "PENDING_HOD" ? request.hodId : request.managerId;
  const isPending = request.status === "PENDING_MANAGER" || request.status === "PENDING_HOD";
  if (!isPending) {
    throw new AppError("NOT_PENDING", 409, `This request is ${label(request.status)}, so there is nothing to decide right now.`);
  }
  if (actor.id !== expectedApprover) {
    throw new AppError("NOT_YOUR_APPROVAL", 403, `This request is waiting for the ${request.status === "PENDING_HOD" ? "HOD" : "manager"}, not you.`);
  }
  if ((action === "REJECT" || action === "REQUEST_INFO") && !comment?.trim()) {
    const verb = action === "REJECT" ? "rejecting" : "asking for more information";
    throw new AppError("COMMENT_REQUIRED", 400, `Please add a comment when ${verb}, so the employee knows why.`, { comment: "Required" });
  }
  if (action === "REJECT") return { status: "REJECTED", stage: request.stage };
  if (action === "REQUEST_INFO") return { status: "INFO_REQUESTED", stage: request.stage };
  if (request.status === "PENDING_MANAGER" && request.requiresHod) {
    return { status: "PENDING_HOD", stage: "HOD" };
  }
  return { status: "APPROVED", stage: request.stage };
}
var LABELS = {
  PENDING_MANAGER: "waiting for the manager",
  PENDING_HOD: "waiting for the HOD",
  INFO_REQUESTED: "waiting for more information",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELLED: "cancelled"
};
function label(status) {
  return LABELS[status];
}

// src/domain/schemas.ts
var day = z.string({ error: "Please pick a date." }).regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.").refine((v) => !Number.isNaN(Date.parse(v)), "That date does not exist.");
var objectId = z.string().regex(/^[a-f0-9]{24}$/, "Invalid document id.");
var createLeaveSchema = z.object({
  leaveType: z.enum(LEAVE_TYPE_CODES, { error: "Please choose a leave type." }),
  fromDate: day,
  toDate: day,
  reason: z.string({ error: "Please tell us the reason." }).trim().min(3, "Please add a short reason (at least 3 characters).").max(500, "Keep the reason under 500 characters."),
  documentIds: z.array(objectId).max(5, "You can attach up to 5 documents.").default([])
}).refine((v) => v.toDate >= v.fromDate, {
  path: ["toDate"],
  message: "The end date must be on or after the start date."
});
var actionSchema = z.object({
  action: z.enum(APPROVER_ACTIONS, { error: "Choose approve, reject or request info." }),
  comment: z.string().trim().max(500, "Keep the comment under 500 characters.").optional().default("")
});
var respondSchema = z.object({
  comment: z.string().trim().min(3, "Please add a short reply.").max(500),
  documentIds: z.array(objectId).max(5).default([])
});
var listQuerySchema = z.object({
  status: z.string().optional()
});

// src/services/leaveService.ts
import { Types as Types3 } from "mongoose";

// src/models/LeaveRequest.ts
import { Schema as Schema2, model as model2, Types } from "mongoose";
var STATUSES = ["PENDING_MANAGER", "PENDING_HOD", "INFO_REQUESTED", "APPROVED", "REJECTED", "CANCELLED"];
var leaveRequestSchema = new Schema2(
  {
    employeeId: { type: String, required: true },
    employeeName: { type: String, required: true },
    employeeEmail: { type: String, default: "" },
    department: { type: String, default: "" },
    // Approvers are copied from the employee's profile at submit time,
    // so a later org change doesn't silently move in-flight requests.
    managerId: { type: String, required: true },
    hodId: { type: String, required: true },
    leaveType: { type: String, enum: LEAVE_TYPE_CODES, required: true },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    calendarDays: { type: Number, required: true },
    workingDays: { type: Number, required: true },
    reason: { type: String, required: true },
    documentIds: [{ type: Types.ObjectId, ref: "Document" }],
    requiresHod: { type: Boolean, required: true },
    status: { type: String, enum: STATUSES, required: true },
    stage: { type: String, enum: ["MANAGER", "HOD"], required: true },
    /** Latest approver comment, shown on the employee's list. Full history lives in AuditLog. */
    lastComment: { type: String, default: "" },
    /** Optimistic-locking counter: every state change must match the version it read. */
    version: { type: Number, default: 0 }
  },
  { timestamps: true }
);
leaveRequestSchema.index({ employeeId: 1, fromDate: -1 });
leaveRequestSchema.index({ managerId: 1, status: 1 });
leaveRequestSchema.index({ hodId: 1, status: 1 });
var LeaveRequest = model2("LeaveRequest", leaveRequestSchema);

// src/domain/dates.ts
var DAY_MS = 24 * 60 * 60 * 1e3;
function parseDay(value) {
  return /* @__PURE__ */ new Date(`${value}T00:00:00.000Z`);
}
function todayUtc() {
  return parseDay((/* @__PURE__ */ new Date()).toISOString().slice(0, 10));
}
function calendarDays(from, to) {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
}
function workingDays(from, to) {
  let count = 0;
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    const weekday = new Date(t).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count++;
  }
  return count;
}
function addDays(date, days2) {
  return new Date(date.getTime() + days2 * DAY_MS);
}

// src/services/settingsService.ts
import { z as z2 } from "zod";

// src/models/Settings.ts
import { Schema as Schema3, model as model3 } from "mongoose";
var settingsSchema = new Schema3(
  {
    _id: { type: String, default: "org" },
    longLeaveThresholdDays: { type: Number, default: 3 },
    cancelNoticeDays: { type: Number, default: 2 },
    quotas: { type: Map, of: Number, default: {} },
    updatedBy: { type: String, default: "" }
  },
  { timestamps: true }
);
var Settings = model3("Settings", settingsSchema);

// src/models/AuditLog.ts
import { Schema as Schema4, model as model4 } from "mongoose";
var auditLogSchema = new Schema4({
  requestId: { type: Schema4.Types.ObjectId, ref: "LeaveRequest", index: true },
  actorId: { type: String, required: true },
  actorName: { type: String, required: true },
  actorRole: { type: String, required: true },
  action: { type: String, required: true },
  fromStatus: { type: String, default: null },
  toStatus: { type: String, default: null },
  comment: { type: String, default: "" },
  meta: { type: Schema4.Types.Mixed, default: {} },
  at: { type: Date, default: () => /* @__PURE__ */ new Date() }
});
auditLogSchema.index({ requestId: 1, at: 1 });
var AuditLog = model4("AuditLog", auditLogSchema);

// src/services/auditService.ts
async function record(actor, entry) {
  await AuditLog.create({
    ...entry,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role
  });
}
async function timeline(requestId) {
  return AuditLog.find({ requestId }).sort({ at: 1 }).lean();
}
async function recent(limit = 100) {
  return AuditLog.find().sort({ at: -1 }).limit(limit).lean();
}

// src/services/settingsService.ts
var CACHE_MS2 = 15e3;
var cached = null;
async function getPolicy() {
  if (cached && cached.until > Date.now()) return cached.policy;
  const doc = await Settings.findById("org").lean();
  const saved = doc?.quotas ?? {};
  const quotas = {};
  for (const t of LEAVE_TYPES) quotas[t.code] = t.quota === null ? null : saved[t.code] ?? t.quota;
  const policy = {
    longLeaveThresholdDays: doc?.longLeaveThresholdDays ?? 3,
    cancelNoticeDays: doc?.cancelNoticeDays ?? 2,
    quotas
  };
  cached = { policy, until: Date.now() + CACHE_MS2 };
  return policy;
}
var settingsSchema2 = z2.object({
  longLeaveThresholdDays: z2.coerce.number().int().min(1, "At least 1 day.").max(30, "At most 30 days."),
  cancelNoticeDays: z2.coerce.number().int().min(0, "Cannot be negative.").max(60, "At most 60 days."),
  quotas: z2.record(z2.string(), z2.coerce.number().int().min(0, "Quota cannot be negative.").max(365, "At most 365 days.")).refine((q) => Object.keys(q).every((k) => LEAVE_TYPE_CODES.includes(k)), "Unknown leave type.").default({})
});
async function updatePolicy(user, input) {
  const before = await getPolicy();
  await Settings.updateOne({ _id: "org" }, { $set: { ...input, updatedBy: user.name } }, { upsert: true });
  cached = null;
  const after = await getPolicy();
  await record(user, { action: "SETTINGS_UPDATED", meta: { before, after } });
  return after;
}

// src/services/balanceService.ts
async function getBalances(employeeId, year = (/* @__PURE__ */ new Date()).getUTCFullYear()) {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  const rows2 = await LeaveRequest.aggregate([
    { $match: { employeeId, status: { $in: ACTIVE_STATUSES }, fromDate: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: { type: "$leaveType", approved: { $eq: ["$status", "APPROVED"] } },
        days: { $sum: "$workingDays" }
      }
    }
  ]);
  const { quotas } = await getPolicy();
  return LEAVE_TYPES.map((type) => {
    const quota = quotas[type.code] ?? type.quota;
    const used = rows2.find((r) => r._id.type === type.code && r._id.approved)?.days ?? 0;
    const pending = rows2.find((r) => r._id.type === type.code && !r._id.approved)?.days ?? 0;
    return {
      code: type.code,
      label: type.label,
      quota,
      used,
      pending,
      available: quota === null ? null : quota - used - pending
    };
  });
}

// src/services/documentService.ts
import { Types as Types2 } from "mongoose";

// src/models/Document.ts
import { Schema as Schema5, model as model5 } from "mongoose";
var documentSchema = new Schema5(
  {
    ownerId: { type: String, required: true, index: true },
    requestId: { type: Schema5.Types.ObjectId, ref: "LeaveRequest", default: null },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true, select: false }
  },
  { timestamps: true }
);
var LeaveDocument = model5("Document", documentSchema);

// src/services/documentService.ts
var ALLOWED_MIME = ["application/pdf", "image/png", "image/jpeg"];
var MAX_BYTES = 4 * 1024 * 1024;
async function upload(user, file) {
  if (!file) throw new AppError("FILE_REQUIRED", 400, "Please choose a file to upload.");
  if (!ALLOWED_MIME.includes(file.mimetype)) {
    throw new AppError("UNSUPPORTED_FILE", 415, "Only PDF, PNG or JPG files are allowed.");
  }
  const doc = await LeaveDocument.create({
    ownerId: user.id,
    filename: file.originalname.slice(0, 120),
    mimeType: file.mimetype,
    size: file.size,
    data: file.buffer
  });
  await record(user, { action: "DOCUMENT_UPLOADED", meta: { documentId: doc.id, filename: doc.filename } });
  return { id: doc.id, filename: doc.filename, mimeType: doc.mimeType, size: doc.size };
}
async function assertOwned(user, ids) {
  if (ids.length === 0) return;
  const count = await LeaveDocument.countDocuments({ _id: { $in: ids }, ownerId: user.id });
  if (count !== ids.length) {
    throw new AppError("INVALID_DOCUMENT", 400, "One of the attached documents could not be found. Please upload it again.");
  }
}
async function linkToRequest(ids, requestId) {
  if (ids.length === 0) return;
  await LeaveDocument.updateMany({ _id: { $in: ids } }, { $set: { requestId } });
}
async function download(user, id) {
  if (!Types2.ObjectId.isValid(id)) throw notFound("Document");
  const doc = await LeaveDocument.findById(id).select("+data");
  if (!doc) throw notFound("Document");
  if (doc.ownerId === user.id) return doc;
  const request = doc.requestId ? await LeaveRequest.findById(doc.requestId).lean() : null;
  const isApprover = request && (request.managerId === user.id || request.hodId === user.id);
  if (!isApprover) throw notFound("Document");
  return doc;
}
async function listMeta(ids) {
  return LeaveDocument.find({ _id: { $in: ids } }).select("filename mimeType size createdAt").lean();
}

// src/services/lockService.ts
import { Schema as Schema6, model as model6 } from "mongoose";
var lockSchema = new Schema6({ _id: String, expireAt: { type: Date, expires: 0 } });
var Lock = model6("Lock", lockSchema);
async function withLock(key, fn) {
  try {
    await Lock.create({ _id: key, expireAt: new Date(Date.now() + 1e4) });
  } catch (err) {
    if (err.code === 11e3) {
      throw new AppError("IN_PROGRESS", 409, "We are already processing a request from you. Please wait a moment.");
    }
    throw err;
  }
  try {
    return await fn();
  } finally {
    await Lock.deleteOne({ _id: key });
  }
}

// src/mail/mailService.ts
import { Resend } from "resend";

// src/mail/template.ts
var TONES = {
  pending: ["#fff4e0", "#b26a00"],
  hod: ["#eee7fa", "#5c0fd9"],
  info: ["#e7f1fa", "#216ba5"],
  approved: ["#e6f4ed", "#1f8a5b"],
  rejected: ["#fbeae7", "#c2412d"],
  neutral: ["#f0eef4", "#6b6478"]
};
var esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function renderEmail(c) {
  const font = "font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const status = c.status ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:4px"><tr><td style="border-left:3px solid ${TONES[c.status.tone][1]};padding:1px 0 1px 12px"><div style="font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#8a8496">Status</div><div style="font-size:14px;font-weight:600;color:${TONES[c.status.tone][1]};margin-top:2px">${esc(c.status.label)}</div></td></tr></table>` : "";
  const rows2 = (c.rows ?? []).map(([k, v]) => `<tr><td style="padding:10px 0;border-bottom:1px solid #efeaf6;color:#6b6478;font-size:13px;width:38%">${esc(k)}</td><td style="padding:10px 0;border-bottom:1px solid #efeaf6;color:#16121f;font-size:14px;font-weight:600">${esc(v)}</td></tr>`).join("");
  const quote = c.quote ? `<div style="margin:20px 0 0;padding:14px 16px;border-left:3px solid #ff6300;background:#fff7f1;border-radius:0 10px 10px 0"><div style="font-size:12px;color:#6b6478;margin-bottom:4px">${esc(c.quote.by)} wrote</div><div style="font-size:15px;color:#16121f;line-height:1.5">\u201C${esc(c.quote.text)}\u201D</div></div>` : "";
  const cta = c.cta ? `<a href="${esc(c.cta.url)}" style="display:inline-block;margin-top:24px;padding:13px 22px;background:#5c0fd9;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px">${esc(c.cta.label)}</a>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.title)}</title></head>
<body style="margin:0;padding:0;background:#f4f1fa;${font}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(c.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1fa;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
  <tr><td style="background:#5c0fd9;border-radius:18px 18px 0 0;padding:22px 28px;position:relative">
    <table role="presentation" width="100%"><tr>
      <td><span style="display:inline-block;width:30px;height:30px;border-radius:8px;background:#ffffff;color:#ff6300;font-weight:900;font-size:18px;line-height:30px;text-align:center">V</span>
      <span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:.12em;vertical-align:middle;margin-left:8px">VISTA</span></td>
      <td align="right" style="color:#d9c8fb;font-size:12px">Leave, simplified</td>
    </tr></table>
  </td></tr>
  <tr><td style="height:4px;background:linear-gradient(90deg,#ff6300,#ff9a4d);background-color:#ff6300"></td></tr>
  <tr><td style="background:#ffffff;padding:30px 28px 32px;border-radius:0 0 18px 18px;box-shadow:0 8px 28px rgba(60,20,140,.08)">
    <div style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#6b6478">${esc(c.eyebrow)}</div>
    <h1 style="margin:8px 0 12px;font-size:24px;line-height:1.25;color:#16121f">${esc(c.title)}</h1>
    ${status}
    <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#3b3546">${esc(c.intro)}</p>
    ${rows2 ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px">${rows2}</table>` : ""}
    ${quote}
    ${cta}
  </td></tr>
  <tr><td style="padding:18px 8px;text-align:center;font-size:12px;color:#8a8496;line-height:1.6">
    You're receiving this because of activity on your Vista leave account.<br>Vista \xB7 Hasta la vista, see you soon.
  </td></tr>
</table></td></tr></table></body></html>`;
}

// src/mail/mailService.ts
var client = null;
function isDemoAddress(email) {
  return /\+clerk_test@/i.test(email) || /@vista-demo\.com$/i.test(email);
}
function appUrl(path = "") {
  const base = process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:5173");
  return base.replace(/\/$/, "") + path;
}
async function sendEmail(to, subject, content) {
  if (!to || process.env.NODE_ENV === "test") return { skipped: "test-or-no-recipient" };
  if (isDemoAddress(to)) {
    console.log(`\u2709\uFE0E skipped (demo address) \u2192 ${to}: ${subject}`);
    return { skipped: "demo-address" };
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`\u2709\uFE0E skipped (RESEND_API_KEY not set) \u2192 ${to}: ${subject}`);
    return { skipped: "not-configured" };
  }
  client ??= new Resend(key);
  try {
    const { error } = await client.emails.send({
      from: process.env.EMAIL_FROM ?? "Vista <onboarding@resend.dev>",
      to,
      subject,
      html: renderEmail(content)
    });
    if (error) console.error("\u2709\uFE0E Resend error:", error.message);
    else console.log(`\u2709\uFE0E sent \u2192 ${to}: ${subject}`);
    return { sent: !error };
  } catch (err) {
    console.error("\u2709\uFE0E email failed:", err.message);
    return { sent: false };
  }
}

// src/mail/notifications.ts
var fmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
var range = (r) => {
  const a = fmt.format(new Date(r.fromDate));
  const b = fmt.format(new Date(r.toDate));
  return a === b ? a : `${a} \u2013 ${b}`;
};
var typeLabel = (r) => getLeaveType(r.leaveType).label;
var days = (r) => `${r.workingDays} working day${r.workingDays === 1 ? "" : "s"}`;
var rows = (r) => [
  ["Employee", r.employeeName],
  ["Leave type", typeLabel(r)],
  ["Dates", range(r)],
  ["Duration", days(r)],
  ["Approval", r.requiresHod ? "Manager, then Admin (HOD)" : "Manager"]
];
async function emailOf(clerkId) {
  if (!clerkId) return null;
  const user = await User.findOne({ clerkId }).select("email name").lean();
  return user?.email ?? null;
}
async function leaveSubmitted(r) {
  await sendEmail(await emailOf(r.managerId), `${r.employeeName} requested ${days(r)} off`, {
    preheader: `${typeLabel(r)} \xB7 ${range(r)}: needs your decision`,
    eyebrow: "Needs your decision",
    title: `${r.employeeName} requested ${typeLabel(r).toLowerCase()}`,
    intro: r.requiresHod ? "This is longer than 3 days, so after you approve it goes to the Admin (HOD)." : "Review the request and approve, reject or ask for more information.",
    status: { label: "Waiting for you", tone: "pending" },
    rows: rows(r),
    quote: { by: r.employeeName, text: r.reason },
    cta: { label: "Review request", url: appUrl(`/approvals/${r._id}`) }
  });
}
async function leaveDecided(r, actorName, comment) {
  const link = appUrl(`/leaves/${r._id}`);
  const quote = comment ? { by: actorName, text: comment } : void 0;
  if (r.status === "PENDING_HOD") {
    await sendEmail(r.employeeEmail, `Your leave is approved by your manager \xB7 now with the HOD`, {
      preheader: `${range(r)}: one more approval to go`,
      eyebrow: "Leave update",
      title: "Manager approved \xB7 one step left",
      intro: `${actorName} approved your leave. Because it is longer than 3 days, the Admin (HOD) gives the final approval.`,
      status: { label: "With HOD", tone: "hod" },
      rows: rows(r),
      quote,
      cta: { label: "Track request", url: link }
    });
    await sendEmail(await emailOf(r.hodId), `${r.employeeName}'s leave needs final approval`, {
      preheader: `${days(r)} \xB7 approved by manager`,
      eyebrow: "Needs your decision",
      title: `Final approval: ${r.employeeName}`,
      intro: `${actorName} approved this request. It needs your final approval as HOD.`,
      status: { label: "Waiting for you", tone: "hod" },
      rows: rows(r),
      quote: { by: r.employeeName, text: r.reason },
      cta: { label: "Review request", url: appUrl(`/approvals/${r._id}`) }
    });
    return;
  }
  const map = {
    APPROVED: { subject: `Approved: your leave on ${range(r)} \u{1F389}`, title: "Your leave is approved", tone: "approved", label: "Approved", intro: `${actorName} approved your leave. Hasta la vista, enjoy your time off!` },
    REJECTED: { subject: `Your leave request was not approved`, title: "Leave not approved", tone: "rejected", label: "Rejected", intro: `${actorName} could not approve this request. Their note is below; you can apply again for other dates.` },
    INFO_REQUESTED: { subject: `More information needed for your leave`, title: "Your approver has a question", tone: "info", label: "Info needed", intro: `${actorName} needs a little more information before deciding. Reply from the request page.` }
  };
  const m = map[r.status];
  if (!m) return;
  await sendEmail(r.employeeEmail, m.subject, {
    preheader: `${typeLabel(r)} \xB7 ${range(r)}`,
    eyebrow: "Leave update",
    title: m.title,
    intro: m.intro,
    status: { label: m.label, tone: m.tone },
    rows: rows(r),
    quote,
    cta: { label: r.status === "INFO_REQUESTED" ? "Reply now" : "View request", url: link }
  });
}
async function infoProvided(r, reply) {
  const approverId = r.status === "PENDING_HOD" ? r.hodId : r.managerId;
  await sendEmail(await emailOf(approverId), `${r.employeeName} replied to your question`, {
    preheader: reply.slice(0, 90),
    eyebrow: "Needs your decision",
    title: `${r.employeeName} sent more information`,
    intro: "The request is back in your queue.",
    status: { label: "Waiting for you", tone: "pending" },
    rows: rows(r),
    quote: { by: r.employeeName, text: reply },
    cta: { label: "Review request", url: appUrl(`/approvals/${r._id}`) }
  });
}
async function joinRequested(managerId, employeeName, employeeEmail, message) {
  await sendEmail(await emailOf(managerId), `${employeeName} wants to join your team`, {
    preheader: "Accept or decline in Vista",
    eyebrow: "Team request",
    title: `${employeeName} wants to join your team`,
    intro: "Once you accept, they can apply for leave and their requests will come to you.",
    status: { label: "Waiting for you", tone: "pending" },
    rows: [["Name", employeeName], ["Email", employeeEmail]],
    quote: message ? { by: employeeName, text: message } : void 0,
    cta: { label: "Open team requests", url: appUrl("/team") }
  });
}
async function joinDecided(employeeEmail, managerName, accepted, comment) {
  await sendEmail(employeeEmail, accepted ? `You're in ${managerName}'s team \u{1F389}` : "Your team request was declined", {
    preheader: accepted ? "You can now apply for leave" : "You can ask another manager",
    eyebrow: "Team update",
    title: accepted ? `Welcome to ${managerName}'s team` : "Team request declined",
    intro: accepted ? "You can now apply for leave in Vista. Your requests go to your manager first." : "You can search for another manager and send a new request.",
    status: { label: accepted ? "Accepted" : "Declined", tone: accepted ? "approved" : "rejected" },
    quote: comment ? { by: managerName, text: comment } : void 0,
    cta: { label: accepted ? "Apply for leave" : "Find your manager", url: appUrl(accepted ? "/apply" : "/") }
  });
}
async function leaveWithdrawn(r) {
  await sendEmail(await emailOf(r.managerId), `${r.employeeName} took back approved leave`, {
    preheader: `${range(r)} is no longer off`,
    eyebrow: "Team update",
    title: `${r.employeeName} will be working after all`,
    intro: "They withdrew leave you had approved. Their balance has been restored automatically.",
    status: { label: "Withdrawn", tone: "neutral" },
    rows: rows(r),
    cta: { label: "View request", url: appUrl(`/approvals/${r._id}`) }
  });
}

// src/services/leaveService.ts
function submit(user, input) {
  return withLock(`submit:${user.id}`, () => submitUnlocked(user, input));
}
async function submitUnlocked(user, input) {
  const type = getLeaveType(input.leaveType);
  const from = parseDay(input.fromDate);
  const to = parseDay(input.toDate);
  const days2 = calendarDays(from, to);
  const working = workingDays(from, to);
  const policy = await getPolicy();
  if (!user.managerId || !user.hodId) {
    throw new AppError("NO_TEAM", 422, "Join a team first: once your manager accepts you, you can apply for leave.");
  }
  if (from < addDays(todayUtc(), -type.backdateDays)) {
    const hint = type.backdateDays ? ` ${type.label} can start at most ${type.backdateDays} days ago.` : "";
    throw new AppError("DATE_IN_PAST", 400, `The start date is in the past.${hint}`, { fromDate: "Too far in the past" });
  }
  if (days2 > 365) {
    throw new AppError("TOO_LONG", 400, "A single request can be at most one year long.", { toDate: "Too long" });
  }
  if (working === 0) {
    throw new AppError("NO_WORKING_DAYS", 422, "These dates fall on a weekend, so no leave is needed.");
  }
  if (needsDocument(type, days2, policy.longLeaveThresholdDays) && input.documentIds.length === 0) {
    const why = type.documentAlways ? `${type.label} needs a supporting document.` : `Leave longer than ${policy.longLeaveThresholdDays} consecutive days needs a supporting document.`;
    throw new AppError("DOCUMENT_REQUIRED", 422, why, { documentIds: "Required" });
  }
  await assertOwned(user, input.documentIds);
  await assertNoOverlap(user.id, from, to);
  await assertBalance(user.id, input.leaveType, working, from.getUTCFullYear());
  const request = await LeaveRequest.create({
    employeeId: user.id,
    employeeName: user.name,
    employeeEmail: user.email,
    department: user.department,
    managerId: user.managerId,
    hodId: user.hodId,
    leaveType: input.leaveType,
    fromDate: from,
    toDate: to,
    calendarDays: days2,
    workingDays: working,
    reason: input.reason,
    documentIds: input.documentIds,
    // Second level only when it's a different person (e.g. a manager's own leave goes to the admin once).
    requiresHod: isLongLeave(days2, policy.longLeaveThresholdDays) && user.managerId !== user.hodId,
    status: "PENDING_MANAGER",
    stage: "MANAGER"
  });
  await linkToRequest(input.documentIds, request._id);
  await record(user, { requestId: request._id, action: "SUBMITTED", toStatus: "PENDING_MANAGER", comment: input.reason });
  await leaveSubmitted(request.toObject());
  return request.toObject();
}
async function assertNoOverlap(employeeId, from, to) {
  const clash = await LeaveRequest.findOne({
    employeeId,
    status: { $in: ACTIVE_STATUSES },
    fromDate: { $lte: to },
    toDate: { $gte: from }
  }).lean();
  if (clash) {
    const range2 = `${clash.fromDate.toISOString().slice(0, 10)} to ${clash.toDate.toISOString().slice(0, 10)}`;
    throw new AppError("OVERLAP", 409, `You already have leave from ${range2} that overlaps these dates.`);
  }
}
async function assertBalance(employeeId, leaveType, workingDayCount, year, excludeRequest) {
  const balance = (await getBalances(employeeId, year)).find((b) => b.code === leaveType);
  if (!balance || balance.available === null) return;
  const available = balance.available + (excludeRequest ? excludeRequest.workingDays : 0);
  if (workingDayCount > available) {
    throw new AppError(
      "INSUFFICIENT_BALANCE",
      422,
      `Not enough ${balance.label.toLowerCase()} for ${year}: you asked for ${workingDayCount} working days but have ${Math.max(available, 0)} left.`
    );
  }
}
async function listMine(user, status) {
  const filter = { employeeId: user.id };
  if (status) filter.status = { $in: status.split(",") };
  return LeaveRequest.find(filter).sort({ createdAt: -1 }).lean();
}
async function getVisible(user, id) {
  if (!Types3.ObjectId.isValid(id)) throw notFound();
  const request = await LeaveRequest.findById(id).lean();
  const canSee = request && [request.employeeId, request.managerId, request.hodId].includes(user.id);
  if (!request || !canSee) throw notFound();
  return request;
}
async function getDetail(user, id) {
  const request = await getVisible(user, id);
  const [history, documents] = await Promise.all([timeline(request._id), listMeta(request.documentIds)]);
  return { request, timeline: history, documents };
}
async function applyTransition(request, next, extra = {}) {
  const updated = await LeaveRequest.findOneAndUpdate(
    { _id: request._id, version: request.version, status: request.status },
    { $set: { status: next.status, stage: next.stage, ...extra }, $inc: { version: 1 } },
    { returnDocument: "after" }
  ).lean();
  if (!updated) {
    throw new AppError("STALE", 409, "Someone else just updated this request. Please refresh to see the latest status.");
  }
  return updated;
}
async function cancel2(user, id) {
  const request = await getVisible(user, id);
  const { cancelNoticeDays } = await getPolicy();
  const daysUntilStart = Math.round((new Date(request.fromDate).getTime() - todayUtc().getTime()) / 864e5);
  const next = transition(request, "CANCEL", user, void 0, { daysUntilStart, noticeDays: cancelNoticeDays });
  const updated = await applyTransition(request, next);
  const wasApproved = request.status === "APPROVED";
  await record(user, { requestId: request._id, action: wasApproved ? "WITHDRAWN" : "CANCELLED", fromStatus: request.status, toStatus: next.status });
  if (wasApproved) await leaveWithdrawn(updated);
  return updated;
}
async function respond2(user, id, input) {
  const request = await getVisible(user, id);
  const next = transition(request, "RESPOND", user);
  await assertOwned(user, input.documentIds);
  const allDocs = [...request.documentIds.map(String), ...input.documentIds];
  const updated = await applyTransition(request, next, { documentIds: allDocs });
  await linkToRequest(input.documentIds, request._id);
  await record(user, {
    requestId: request._id,
    action: "INFO_PROVIDED",
    fromStatus: request.status,
    toStatus: next.status,
    comment: input.comment,
    meta: { documentIds: input.documentIds }
  });
  await infoProvided(updated, input.comment);
  return updated;
}

// src/routes/leaves.ts
var leavesRouter = Router();
leavesRouter.post("/", async (req, res) => {
  const input = createLeaveSchema.parse(req.body);
  res.status(201).json(await submit(req.user, input));
});
leavesRouter.get("/mine", async (req, res) => {
  const { status } = listQuerySchema.parse(req.query);
  res.json(await listMine(req.user, status));
});
leavesRouter.get("/:id", async (req, res) => {
  res.json(await getDetail(req.user, req.params.id));
});
leavesRouter.post("/:id/cancel", async (req, res) => {
  res.json(await cancel2(req.user, req.params.id));
});
leavesRouter.post("/:id/respond", async (req, res) => {
  const input = respondSchema.parse(req.body);
  res.json(await respond2(req.user, req.params.id, input));
});

// src/routes/approvals.ts
import { Router as Router2 } from "express";

// src/services/approvalService.ts
var ACTION_TO_AUDIT = { APPROVE: "APPROVED", REJECT: "REJECTED", REQUEST_INFO: "INFO_REQUESTED" };
async function queue(user, scope = "pending") {
  const mine = [{ managerId: user.id }, { hodId: user.id }];
  const filter = scope === "pending" ? { $or: [{ managerId: user.id, status: "PENDING_MANAGER" }, { hodId: user.id, status: "PENDING_HOD" }] } : { $or: mine, employeeId: { $ne: user.id } };
  const requests = await LeaveRequest.find(filter).sort({ fromDate: 1 }).limit(200).lean();
  return Promise.all(requests.map((r) => withInsights(r)));
}
async function withInsights(request) {
  const [balances, clashes] = await Promise.all([
    getBalances(request.employeeId, new Date(request.fromDate).getUTCFullYear()),
    LeaveRequest.find({
      _id: { $ne: request._id },
      managerId: request.managerId,
      employeeId: { $ne: request.employeeId },
      status: { $in: ACTIVE_STATUSES },
      fromDate: { $lte: request.toDate },
      toDate: { $gte: request.fromDate }
    }).select("employeeName fromDate toDate status").lean()
  ]);
  const balance = balances.find((b) => b.code === request.leaveType);
  return {
    ...request,
    insights: {
      balance: balance ?? null,
      // Pending already includes this request, so "after" = available as it stands.
      balanceAfterApproval: balance?.available ?? null,
      teamClashes: clashes
    }
  };
}
async function act(user, id, input) {
  const request = await getVisible(user, id);
  const next = transition(request, input.action, user, input.comment);
  if (next.status === "APPROVED") {
    await assertBalance(request.employeeId, request.leaveType, request.workingDays, new Date(request.fromDate).getUTCFullYear(), request);
  }
  const updated = await applyTransition(request, next, { lastComment: input.comment });
  await record(user, {
    requestId: request._id,
    action: next.status === "PENDING_HOD" ? "APPROVED_BY_MANAGER" : ACTION_TO_AUDIT[input.action],
    fromStatus: request.status,
    toStatus: next.status,
    comment: input.comment
  });
  await leaveDecided(updated, user.name, input.comment);
  return updated;
}

// src/routes/approvals.ts
var approvalsRouter = Router2();
approvalsRouter.use(requireRole("MANAGER", "ADMIN"));
approvalsRouter.get("/", async (req, res) => {
  const scope = req.query.scope === "all" ? "all" : "pending";
  res.json(await queue(req.user, scope));
});
approvalsRouter.get("/:id", async (req, res) => {
  const detail = await getDetail(req.user, req.params.id);
  res.json({ ...detail, request: await withInsights(detail.request) });
});
approvalsRouter.post("/:id/actions", async (req, res) => {
  const input = actionSchema.parse(req.body);
  res.json(await act(req.user, req.params.id, input));
});

// src/routes/documents.ts
import { Router as Router3 } from "express";
import multer2 from "multer";
var documentsRouter = Router3();
var uploadOne = multer2({ storage: multer2.memoryStorage(), limits: { fileSize: MAX_BYTES } }).single("file");
documentsRouter.post("/", uploadOne, async (req, res) => {
  res.status(201).json(await upload(req.user, req.file));
});
documentsRouter.get("/:id", async (req, res) => {
  const doc = await download(req.user, req.params.id);
  res.setHeader("Content-Type", doc.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.filename)}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(doc.data);
});

// src/routes/meta.ts
import { Router as Router4 } from "express";
var metaRouter = Router4();
metaRouter.get("/me", async (req, res) => {
  res.json({ ...req.user, balances: await getBalances(req.user.id) });
});
metaRouter.get("/leave-types", async (_req, res) => {
  const policy = await getPolicy();
  res.json({
    types: LEAVE_TYPES.map((t) => ({ ...t, quota: policy.quotas[t.code] ?? t.quota })),
    longLeaveThresholdDays: policy.longLeaveThresholdDays,
    cancelNoticeDays: policy.cancelNoticeDays
  });
});
metaRouter.get("/audit", requireRole("ADMIN", "SYSADMIN"), async (_req, res) => {
  res.json(await recent());
});

// src/routes/team.ts
import { Router as Router5 } from "express";
import { z as z3 } from "zod";

// src/models/TeamRequest.ts
import { Schema as Schema7, model as model7 } from "mongoose";
var teamRequestSchema = new Schema7(
  {
    employeeId: { type: String, required: true, index: true },
    employeeName: { type: String, required: true },
    employeeEmail: { type: String, required: true },
    managerId: { type: String, required: true },
    message: { type: String, default: "" },
    status: { type: String, enum: ["PENDING", "ACCEPTED", "REJECTED", "WITHDRAWN"], default: "PENDING" },
    decisionComment: { type: String, default: "" }
  },
  { timestamps: true }
);
teamRequestSchema.index({ managerId: 1, status: 1 });
teamRequestSchema.index({ employeeId: 1 }, { unique: true, partialFilterExpression: { status: "PENDING" } });
var TeamRequest = model7("TeamRequest", teamRequestSchema);

// src/services/teamService.ts
async function searchManagers(query = "") {
  const q = query.trim();
  const filter = { role: "MANAGER" };
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: rx }, { email: rx }, { employeeCode: rx }];
  }
  const managers = await User.find(filter).sort({ name: 1 }).limit(20).lean();
  return managers.map((m) => ({ id: m.clerkId, name: m.name, email: m.email, employeeCode: m.employeeCode, department: m.department }));
}
async function myRequest(user) {
  return TeamRequest.findOne({ employeeId: user.id }).sort({ createdAt: -1 }).lean();
}
async function requestToJoin(user, managerId, message) {
  if (user.managerId) throw new AppError("ALREADY_IN_TEAM", 409, "You are already part of a team.");
  if (user.role !== "EMPLOYEE") throw new AppError("FORBIDDEN", 403, "Only employees join a team this way.");
  const manager = await User.findOne({ clerkId: managerId, role: "MANAGER" }).lean();
  if (!manager) throw new AppError("MANAGER_NOT_FOUND", 404, "We could not find that manager. Check the name or ID and try again.");
  await TeamRequest.updateMany({ employeeId: user.id, status: "PENDING" }, { $set: { status: "WITHDRAWN" } });
  const request = await TeamRequest.create({
    employeeId: user.id,
    employeeName: user.name,
    employeeEmail: user.email,
    managerId,
    message: message.trim()
  });
  await record(user, { action: "TEAM_JOIN_REQUESTED", comment: message, meta: { managerId, managerName: manager.name } });
  await joinRequested(managerId, user.name, user.email, message);
  return request.toObject();
}
async function inbox(manager) {
  return TeamRequest.find({ managerId: manager.id, status: "PENDING" }).sort({ createdAt: 1 }).lean();
}
async function decide2(manager, id, decision, comment) {
  const request = await TeamRequest.findById(id).lean().catch(() => null);
  if (!request || request.managerId !== manager.id) throw notFound("Team request");
  const status = decision === "ACCEPT" ? "ACCEPTED" : "REJECTED";
  const updated = await TeamRequest.findOneAndUpdate(
    { _id: id, status: "PENDING" },
    { $set: { status, decisionComment: comment } },
    { returnDocument: "after" }
  ).lean();
  if (!updated) throw new AppError("ALREADY_DECIDED", 409, "This request was already handled.");
  if (decision === "ACCEPT") {
    await User.updateOne(
      { clerkId: request.employeeId },
      { $set: { managerId: manager.id, hodId: manager.hodId ?? manager.id, department: manager.department } }
    );
    forgetUser(request.employeeId);
  }
  await record(manager, {
    action: decision === "ACCEPT" ? "TEAM_JOIN_ACCEPTED" : "TEAM_JOIN_REJECTED",
    comment,
    meta: { employeeId: request.employeeId, employeeName: request.employeeName }
  });
  await joinDecided(request.employeeEmail, manager.name, decision === "ACCEPT", comment);
  return updated;
}
async function myTeam(manager) {
  const members = await User.find({ managerId: manager.id }).sort({ name: 1 }).lean();
  return members.map(toCurrentUser);
}
async function allUsers() {
  const users = await User.find().sort({ role: 1, name: 1 }).lean();
  return users.map(toCurrentUser);
}

// src/routes/team.ts
var teamRouter = Router5();
teamRouter.get("/managers", async (req, res) => {
  res.json(await searchManagers(String(req.query.q ?? "")));
});
teamRouter.get("/join-request", async (req, res) => {
  res.json(await myRequest(req.user));
});
var joinSchema = z3.object({
  managerId: z3.string({ error: "Choose your manager." }).min(1, "Choose your manager."),
  message: z3.string().trim().max(300, "Keep the note under 300 characters.").optional().default("")
});
teamRouter.post("/join-request", async (req, res) => {
  const input = joinSchema.parse(req.body);
  res.status(201).json(await requestToJoin(req.user, input.managerId, input.message));
});
teamRouter.get("/requests", requireRole("MANAGER"), async (req, res) => {
  res.json(await inbox(req.user));
});
var decisionSchema = z3.object({
  decision: z3.enum(["ACCEPT", "REJECT"], { error: "Choose accept or reject." }),
  comment: z3.string().trim().max(300).optional().default("")
});
teamRouter.post("/requests/:id/decision", requireRole("MANAGER"), async (req, res) => {
  const input = decisionSchema.parse(req.body);
  res.json(await decide2(req.user, String(req.params.id), input.decision, input.comment));
});
teamRouter.get("/members", requireRole("MANAGER", "ADMIN", "SYSADMIN"), async (req, res) => {
  res.json(req.user.role !== "MANAGER" ? await allUsers() : await myTeam(req.user));
});

// src/routes/admin.ts
import { Router as Router6 } from "express";

// src/services/statsService.ts
async function dashboard(user) {
  const scope = user.role === "MANAGER" ? { managerId: user.id } : {};
  const people = await User.find(user.role === "MANAGER" ? { managerId: user.id } : { role: { $in: ["EMPLOYEE", "MANAGER"] } }).select("clerkId name email role department").sort({ name: 1 }).lean();
  const ids = people.map((p) => p.clerkId);
  const today = todayUtc();
  const in7 = addDays(today, 7);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const base = { ...scope, employeeId: { $in: ids } };
  const [pending, approvedThisMonth, byType, byStatus, current, upcoming] = await Promise.all([
    LeaveRequest.countDocuments({ ...base, status: { $in: ["PENDING_MANAGER", "PENDING_HOD", "INFO_REQUESTED"] } }),
    LeaveRequest.countDocuments({ ...base, status: "APPROVED", fromDate: { $gte: monthStart } }),
    LeaveRequest.aggregate([
      { $match: { ...base, status: "APPROVED", fromDate: { $gte: yearStart } } },
      { $group: { _id: "$leaveType", days: { $sum: "$workingDays" }, requests: { $sum: 1 } } }
    ]),
    LeaveRequest.aggregate([{ $match: { ...base, fromDate: { $gte: yearStart } } }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    LeaveRequest.find({ ...base, status: "APPROVED", fromDate: { $lte: today }, toDate: { $gte: today } }).select("employeeId leaveType toDate").lean(),
    LeaveRequest.find({ ...base, status: { $in: ["APPROVED", "PENDING_MANAGER", "PENDING_HOD"] }, fromDate: { $gt: today, $lte: in7 } }).select("employeeId employeeName leaveType fromDate toDate status").sort({ fromDate: 1 }).lean()
  ]);
  const onLeave = new Map(current.map((r) => [r.employeeId, r]));
  const roster = people.map((p) => {
    const away = onLeave.get(p.clerkId);
    return {
      id: p.clerkId,
      name: p.name,
      email: p.email,
      role: p.role,
      department: p.department,
      status: away ? "ON_LEAVE" : "WORKING",
      leaveType: away?.leaveType ?? null,
      backOn: away ? addDays(new Date(away.toDate), 1).toISOString().slice(0, 10) : null
    };
  });
  return {
    scope: user.role === "MANAGER" ? "team" : "organisation",
    headcount: people.length,
    onLeaveToday: current.length,
    pending,
    approvedThisMonth,
    byType: LEAVE_TYPES.map((t) => {
      const row = byType.find((b) => b._id === t.code);
      return { code: t.code, label: t.label, days: row?.days ?? 0, requests: row?.requests ?? 0 };
    }),
    byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.n])),
    roster,
    upcoming
  };
}

// src/services/orgService.ts
import { z as z4 } from "zod";
var orgChangeSchema = z4.object({
  role: z4.enum(["EMPLOYEE", "MANAGER", "ADMIN"], { error: "Choose employee, manager or admin." }).optional(),
  managerId: z4.string().min(1).nullable().optional(),
  department: z4.string().trim().min(1).max(60).optional()
});
async function changeOrg(actor, targetId, input) {
  const target = await User.findOne({ clerkId: targetId }).lean();
  if (!target) throw notFound("Person");
  if (target.role === "SYSADMIN") throw new AppError("FORBIDDEN", 403, "The system admin account cannot be changed here.");
  const role = input.role ?? target.role;
  let managerId = input.managerId === void 0 ? target.managerId : input.managerId;
  if (role === "ADMIN") managerId = null;
  const reports = await User.countDocuments({ managerId: targetId });
  if (role === "EMPLOYEE" && reports > 0) {
    throw new AppError("HAS_REPORTS", 409, `${target.name} still has ${reports} people reporting to them. Move them to another manager first.`);
  }
  let hodId = null;
  if (managerId) {
    if (managerId === targetId) throw new AppError("SELF_MANAGER", 400, "Someone cannot report to themselves.");
    const manager = await User.findOne({ clerkId: managerId }).lean();
    if (!manager || !["MANAGER", "ADMIN"].includes(manager.role)) {
      throw new AppError("INVALID_MANAGER", 400, "Pick a manager or admin as the reporting manager.");
    }
    if (role === "MANAGER" && manager.role !== "ADMIN") {
      throw new AppError("INVALID_MANAGER", 400, "Managers report to an admin (HOD).");
    }
    let cursor = manager.managerId;
    for (let depth = 0; cursor && depth < 20; depth++) {
      if (cursor === targetId) throw new AppError("CYCLE", 400, "That would create a reporting loop.");
      cursor = (await User.findOne({ clerkId: cursor }).select("managerId").lean())?.managerId;
    }
    hodId = manager.role === "ADMIN" ? manager.clerkId : manager.hodId ?? manager.managerId ?? manager.clerkId;
  }
  const department = input.department ?? target.department;
  await User.updateOne({ clerkId: targetId }, { $set: { role, managerId, hodId, department } });
  forgetUser(targetId);
  if (role === "MANAGER") {
    const reportIds = (await User.find({ managerId: targetId }).select("clerkId").lean()).map((u) => u.clerkId);
    await User.updateMany({ managerId: targetId }, { $set: { hodId: hodId ?? targetId } });
    reportIds.forEach(forgetUser);
  }
  await record(actor, {
    action: "ORG_CHANGED",
    comment: `${target.name}: ${target.role} \u2192 ${role}`,
    meta: { targetId, before: { role: target.role, managerId: target.managerId, department: target.department }, after: { role, managerId, department } }
  });
  return User.findOne({ clerkId: targetId }).lean();
}

// src/routes/admin.ts
var adminRouter = Router6();
adminRouter.get("/stats", requireRole("MANAGER", "ADMIN", "SYSADMIN"), async (req, res) => {
  res.json(await dashboard(req.user));
});
adminRouter.get("/settings", async (_req, res) => {
  res.json(await getPolicy());
});
adminRouter.put("/settings", requireRole("SYSADMIN"), async (req, res) => {
  res.json(await updatePolicy(req.user, settingsSchema2.parse(req.body)));
});
adminRouter.patch("/org/:id", requireRole("SYSADMIN"), async (req, res) => {
  res.json(await changeOrg(req.user, String(req.params.id), orgChangeSchema.parse(req.body)));
});

// src/db.ts
import mongoose from "mongoose";
var connection = null;
function connectDb(uri = process.env.MONGODB_URI) {
  if (!uri) throw new Error("MONGODB_URI is missing. Copy .env.example to .env and fill it in.");
  connection ??= mongoose.connect(uri, { dbName: "vista", serverSelectionTimeoutMS: 1e4 }).catch((err) => {
    connection = null;
    throw err;
  });
  return connection;
}

// src/createApp.ts
function createApp(options = {}) {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: options.clientOrigin ?? "http://localhost:5173", credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.get("/api/health", (_req, res) => res.json({ ok: true, service: "vista", time: (/* @__PURE__ */ new Date()).toISOString() }));
  if (options.connect !== false) {
    app.use("/api", async (_req, _res, next) => {
      await connectDb();
      next();
    });
  }
  if (process.env.NODE_ENV !== "test") app.use(clerkMiddleware());
  app.use("/api", requireAuth);
  app.use("/api", metaRouter);
  app.use("/api/leaves", leavesRouter);
  app.use("/api/approvals", approvalsRouter);
  app.use("/api/documents", documentsRouter);
  app.use("/api/team", teamRouter);
  app.use("/api", adminRouter);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "That API route does not exist." } });
  });
  app.use(errorHandler);
  return app;
}

// src/vercelApp.ts
var vercelApp_default = createApp({ clientOrigin: process.env.CLIENT_ORIGIN });
export {
  vercelApp_default as default
};
