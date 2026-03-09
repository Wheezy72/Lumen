import fetch from 'node-fetch';

const port = process.env.PORT || 4000;
const url = process.env.HEALTH_URL || `http://127.0.0.1:${port}/health`;

(async () => {
  try {
    const res = await fetch(url);
    const text = await res.text();
    if (!res.ok) {
      console.error(`Health check failed: HTTP ${res.status} ${text}`);
      process.exit(1);
    }
    console.log(`OK: ${text}`);
    process.exit(0);
  } catch (e) {
    console.error(`Health check failed: ${e.message}`);
    process.exit(1);
  }
})();
