import mongoose from 'mongoose';

const vulnerabilitySchema = new mongoose.Schema({
  id: String,
  title: String,
  severity: { type: String, enum: ['info', 'low', 'medium', 'high', 'critical'], required: true },
  description: String,
  evidence: String,
  cve: String,
  epss: Number,
  category: String, // e.g., xss, sqli, ssl, headers, traversal, subdomain, cookies, error, access_control, rate_limit
}, { _id: false });

const policySchema = new mongoose.Schema({
  status: { type: String, enum: ['unknown', 'pass', 'fail', 'skipped'], default: 'unknown' },
  blockedSeverities: { type: [String], default: ['high', 'critical'] },
  evaluatedAt: Date,
}, { _id: false });

const diffSummarySchema = new mongoose.Schema({
  compareScanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Scan', default: null },
  newCount: { type: Number, default: 0 },
  fixedCount: { type: Number, default: 0 },
  persistingCount: { type: Number, default: 0 },
  newBlockedCount: { type: Number, default: 0 },
}, { _id: false });

const scanSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },

  // Target summary
  targetUrl: { type: String, required: true },
  targetHost: { type: String, index: true },

  status: { type: String, enum: ['queued', 'scheduled', 'running', 'completed', 'failed'], default: 'queued' },
  progress: { type: Number, default: 0 },
  error: String,

  results: [vulnerabilitySchema],
  startedAt: Date,
  completedAt: Date,

  // Scan profile - list of modules to run (e.g., ['headers', 'cookies', 'xss'])
  scanProfile: [{ type: String }],

  // When true, this scan was created by a scheduler (delayed or recurring) rather than the UI.
  scheduled: { type: Boolean, default: false },
  recurringScanId: { type: mongoose.Schema.Types.ObjectId, ref: 'RecurringScan', index: true },
  // Optional: when to run the scan (for scheduled scans)
  scheduledFor: { type: Date },

  // Optional: call a webhook when the scan completes/fails.
  webhookUrl: { type: String },

  // "Compare to previous scan" summary.
  diffSummary: { type: diffSummarySchema, default: () => ({}) },

  // Simple "policy gate" (fail if new high/critical vs previous scan).
  policy: { type: policySchema, default: () => ({ status: 'unknown' }) },
}, { timestamps: true });

scanSchema.index({ userId: 1, targetHost: 1, createdAt: -1 });

export default mongoose.model('Scan', scanSchema);