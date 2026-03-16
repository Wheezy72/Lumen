import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import fs from 'node:fs';

const rootDir = path.resolve(process.cwd());

const args = process.argv.slice(2);
const withBackendWorker = args.includes('--with-backend-worker');

const services = [
  {
    name: 'backend-api',
    cwd: path.join(rootDir, 'backend'),
    cmd: 'npm run dev',
  },
  ...(withBackendWorker
    ? [
        {
          name: 'backend-worker',
          cwd: path.join(rootDir, 'backend'),
          cmd: 'npm run worker',
        },
      ]
    : []),
  {
    name: 'python-worker',
    cwd: path.join(rootDir, 'python'),
    cmd: `${process.env.PYTHON || 'python'} worker.py`,
  },
  {
    name: 'frontend',
    cwd: path.join(rootDir, 'frontend'),
    cmd: 'npm run dev',
  },
];

const children = [];

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    console.error(`Missing directory: ${dir}`);
    process.exit(1);
  }
};

for (const svc of services) {
  ensureDir(svc.cwd);
}

const startService = (svc) => {
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

for (const svc of services) startService(svc);

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

console.log('[start-all] running. Press Ctrl+C to stop all services.');
