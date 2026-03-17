import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import fs from 'node:fs';

const rootDir = path.resolve(process.cwd());

const args = process.argv.slice(2);
const withBackendWorker = args.includes('--with-backend-worker');

const children = [];

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    console.error(`Missing directory: ${dir}`);
    process.exit(1);
  }
};

const startService = (svc) => {
  ensureDir(svc.cwd);

  console.log(`[start-all] starting ${svc.name}: ${svc.cmd} (cwd: ${path.relative(rootDir, svc.cwd) || '.'})`);

  const child = spawn(svc.cmd, {
    cwd: svc.cwd,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      FORCE_COLOR: process.env.FORCE_COLOR || '1',
    },
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(`[start-all] ${svc.name} exited (signal ${signal})`);
      return;
    }

    if (code === 0) {
      console.log(`[start-all] ${svc.name} exited (code 0)`);
      return;
    }

    console.log(`[start-all] ${svc.name} exited (code ${code})`);
  });

  children.push({ name: svc.name, child });
};

const shutdown = (reason) => {
  console.log(`[start-all] shutting down (${reason})`);

  for (const { name, child } of children) {
    if (!child || child.killed) continue;

    try {
      console.log(`[start-all] stopping ${name}`);
      child.kill('SIGINT');
    } catch {
      try {
        child.kill();
      } catch {
        // ignore
      }
    }
  }

  setTimeout(() => process.exit(0), 750);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

const waitForBackend = async ({ url, timeoutMs = 30000, intervalMs = 500 }) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 800);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (res.ok || res.status) return true;
    } catch {
      // ignore
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return false;
};

const main = async () => {
  // Start backend first so Vite proxy doesn't spam ECONNREFUSED.
  startService({
    name: 'backend-api',
    cwd: path.join(rootDir, 'backend'),
    cmd: 'npm run dev',
  });

  if (withBackendWorker) {
    startService({
      name: 'backend-worker',
      cwd: path.join(rootDir, 'backend'),
      cmd: 'npm run worker',
    });
  }

  startService({
    name: 'python-worker',
    cwd: path.join(rootDir, 'python'),
    cmd: `${process.env.PYTHON || 'python'} worker.py`,
  });

  const backendHealthUrl = process.env.START_ALL_BACKEND_HEALTH_URL || 'http://127.0.0.1:4000/health';
  const ok = await waitForBackend({ url: backendHealthUrl, timeoutMs: 30000 });

  if (!ok) {
    console.log(`[start-all] backend not reachable at ${backendHealthUrl} yet (starting frontend anyway)`);
  } else {
    console.log(`[start-all] backend reachable (${backendHealthUrl})`);
  }

  startService({
    name: 'frontend',
    cwd: path.join(rootDir, 'frontend'),
    cmd: 'npm run dev',
  });

  console.log('[start-all] running. Press Ctrl+C to stop all services.');
};

main().catch((err) => {
  console.error(`[start-all] failed to start: ${err.message}`);
  shutdown('startup failure');
});
