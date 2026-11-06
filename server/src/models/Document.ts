import { Schema, model } from 'mongoose';

/** Supporting documents (medical certificate etc.). Small files only (≤ 5 MB), stored in Mongo. */
const documentSchema = new Schema(
  {
    ownerId: { type: String, required: true, index: true },
    requestId: { type: Schema.Types.ObjectId, ref: 'LeaveRequest', default: null },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true, select: false },
  },
  { timestamps: true },
);

export const LeaveDocument = model('Document', documentSchema);
