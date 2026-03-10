import mongoose from 'mongoose';

const targetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  host: { type: String, required: true, trim: true, lowercase: true },
  tags: [{ type: String, trim: true, lowercase: true }],

  // DevSecOps features
  baselineScanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Scan', default: null },

  policyEnabled: { type: Boolean, default: false },
  // If policy is enabled, any new findings with these severities will fail the policy gate.
  policySeverities: {
    type: [String],
    default: ['high', 'critical'],
  },
}, { timestamps: true });

// One target per user per host.
targetSchema.index({ userId: 1, host: 1 }, { unique: true });

export default mongoose.model('Target', targetSchema);
