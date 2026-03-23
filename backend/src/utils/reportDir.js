import path from 'path';
import fs from 'fs';

export function ensureReportDir() {
  const dirName = process.env.REPORTS_DIR || 'reports';
  const dir = path.join(process.cwd(), dirName);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return dir;
}
