import fetch from 'node-fetch';

// Minimal end-to-end smoke check.
//
// This script assumes you have the backend server running locally.
// It does NOT spin up MongoDB/Redis automatically.

const port = process.env.PORT || 4000;
const baseUrl = process.env.BASE_URL || `http://127.0.0.1:${port}`;

(async () => {
  try {
    const health = await fetch(`${baseUrl}/health`);
    if (!health.ok) {
      throw new Error(`Health check failed: HTTP ${health.status}`);
    }

    console.log('E2E smoke check: backend /health OK');
    console.log('If you want a full E2E (register/login/create scan), start MongoDB + Redis + python/worker.py and extend this script.');
    process.exit(0);
  } catch (e) {
    console.error(`E2E smoke check failed: ${e.message}`);
    process.exit(1);
  }
})();
