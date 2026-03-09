import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  action: { type: String, required: true, index: true },
  ip: { type: String },
  userAgent: { type: String },
  method: { type: String },
  path: { type: String },
  status: { type: Number },
  meta: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now, index: true },
}, { versionKey: false });

// Keep 90 days by default
const TTL_DAYS = 90;
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: TTL_DAYS * 24 * 60 * 60 });

export default mongoose.model('AuditLog', auditLogSchema);
