import { Schema, model } from 'mongoose';

/** Organisation-wide policy, editable by the system admin. A single document with _id "org". */
const settingsSchema = new Schema(
  {
    _id: { type: String, default: 'org' },
    longLeaveThresholdDays: { type: Number, default: 3 },
    cancelNoticeDays: { type: Number, default: 2 },
    quotas: { type: Map, of: Number, default: {} },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true },
);

export const Settings = model('Settings', settingsSchema);
