import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Scan from '../src/models/Scan.js';
import { scanQueue } from '../src/queue/index.js';

dotenv.config();

// A tiny scheduler that enqueues scans whose scheduledFor is in the past.
// Note: the API already uses Bull's `delay` option, which persists in Redis.
// This script is useful if you want a DB-driven scheduler (e.g. via cron).

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lumen_scanner';

async function runOnce() {
  await mongoose.connect(MONGODB_URI);

  const now = new Date();

  const due = await Scan.find({
    scheduled: true,
    status: 'scheduled',
    scheduledFor: { $lte: now },
  }).limit(100);

  for (const scan of due) {
    scan.status = 'queued';
    scan.progress = 0;
    await scan.save();

    await scanQueue.add(
      'start',
      { scanId: scan._id.toString(), scanProfile: scan.scanProfile },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
  }

  console.log(`Enqueued ${due.length} scheduled scan(s).`);
  await mongoose.disconnect();
  process.exit(0);
}

runOnce().catch((e) => {
  console.error(e);
  process.exit(1);
});
