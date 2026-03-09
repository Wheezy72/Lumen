import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

// Simple markdown-to-PDF renderer (very lightweight).
// It renders the raw markdown text. For a fully formatted PDF, swap this for a
// proper markdown renderer.

const inputPath = process.env.DEV_GUIDE_MD || path.join('..', 'docs', 'dev_guide.md');
const outDir = process.env.REPORTS_DIR || 'reports';
const outFile = process.env.DEV_GUIDE_PDF || 'dev_guide.pdf';

fs.mkdirSync(outDir, { recursive: true });

const md = fs.readFileSync(inputPath, 'utf8');

const doc = new PDFDocument({ margin: 50 });
const outPath = path.join(outDir, outFile);
const stream = fs.createWriteStream(outPath);

doc.pipe(stream);

doc.fontSize(18).text('Lumen Developer Guide', { underline: true });
doc.moveDown();
doc.fontSize(10).text(md);

doc.end();

stream.on('finish', () => {
  console.log(`Wrote ${outPath}`);
});
