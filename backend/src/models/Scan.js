import mongoose from 'mongoose';

const vulnerabilitySchema = new mongoose.Schema({
  id: String,
  title: String,
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true },
  description: String,
  evidence: String,
  cve: String,
  epss: Number,
  category: String, // e.g., xss, sqli, ssl, headers, traversal, subdomain, cookies, error, access_control, rate_limit
}, { _id: false });

const scanSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  targetUrl: { type: String, required: true },
  status: { type: String, enum: ['queued', 'scheduled', 'running', 'completed', 'failed'], default: 'queued' },
  progress: { type: Number, default: 0 },
  error: String,
  results: [vulnerabilitySchema],
  startedAt: Date,
  completedAt: Date,
  // Scan profile - list of modules to run (e.g., ['headers', 'cookies', 'xss'])
  scanProfile: [{ type: String }],
  // When true, this scan was created by the scheduled-scans script rather than the UI.
  scheduled: { type: Boolean, default: false },
  // Optional: when to run the scan (for scheduled scans)
  scheduledFor: { type: Date },
}, { timestamps: true });

export default mongoose.model('Scan', scanSchema);