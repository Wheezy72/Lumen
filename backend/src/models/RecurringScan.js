import mongoose from 'mongoose';

const recurringScanSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },

  targetUrl: { type: String, required: true },
  targetHost: { type: String, index: true },

  scanProfile: [{ type: String }],

  cron: { type: String, required: true },
  timezone: { type: String },

  enabled: { type: Boolean, default: true },

  webhookUrl: { type: String },

  lastRunAt: { type: Date },
}, { timestamps: true });

recurringScanSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('RecurringScan', recurringScanSchema);
