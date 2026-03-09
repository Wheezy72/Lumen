import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  refreshTokenHash: { type: String, required: true, index: true },
  ip: { type: String },
  userAgent: { type: String },
  lastUsedAt: { type: Date },
  revokedAt: { type: Date, default: null, index: true },
}, { timestamps: true });

export default mongoose.model('Session', sessionSchema);
