import fs from 'fs';

// Generates a tiny API doc stub from the known route mounts.
// For richer docs, consider OpenAPI/Swagger.

const outDir = 'docs';
fs.mkdirSync(outDir, { recursive: true });

const content = `# Lumen Backend API (Quick Reference)\n\nBase URL: \`/api\`\n\n## Auth\n- POST \`/api/auth/register\`\n- POST \`/api/auth/login\`\n- POST \`/api/auth/logout\`\n- GET  \`/api/auth/me\`\n\n## Scans\n(All require auth cookie)\n- GET  \`/api/scans\`\n- POST \`/api/scans\`\n- GET  \`/api/scans/:id\`\n- PUT  \`/api/scans/:id\`\n- DELETE \`/api/scans/:id\`\n\n## Reports\n(All require auth cookie)\n- GET \`/api/reports/:id/pdf\`\n- GET \`/api/reports/:id/csv\`\n\n## SSE\n(All require auth cookie)\n- GET \`/api/sse\`\n`;

fs.writeFileSync(`${outDir}/api.md`, content, 'utf8');
console.log('Wrote docs/api.md');
