import fs from 'fs';
import path from 'path';
import archiver from 'archiver';

// Creates a zip of the backend folder (src + package.json + .env.example).

const outDir = process.env.EXPORT_DIR || 'reports';
const outFile = process.env.EXPORT_FILE || 'backend-export.zip';

fs.mkdirSync(outDir, { recursive: true });

const output = fs.createWriteStream(path.join(outDir, outFile));
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`Wrote ${outFile} (${archive.pointer()} bytes)`);
});

archive.on('warning', (err) => {
  if (err.code === 'ENOENT') return;
  throw err;
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);
archive.file('package.json', { name: 'package.json' });
archive.file('.env.example', { name: '.env.example' });
archive.directory('src', 'src');
archive.finalize();
