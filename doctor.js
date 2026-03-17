#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const run = (label, cmd, args, opts = {}) => {
  process.stdout.write(`\n[doctor] ${label}\n`);
  const res = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts,
  });

  if (res.status !== 0) {
    throw new Error(`${label} failed (exit ${res.status ?? 'unknown'})`);
  }
};

const listFilesRecursive = (dir, predicate) => {
  const out = [];

  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (!predicate || predicate(p)) out.push(p);
    }
  };

  walk(dir);
  return out;
};

const main = () => {
  process.stdout.write('[doctor] Lumen project checks\n');

  // Frontend build (catches Vite/React syntax issues)
  if (fs.existsSync(path.join('frontend', 'package.json'))) {
    run('frontend build', 'npm', ['--prefix', 'frontend', 'run', 'build']);
  }

  // Backend syntax check (fast)
  if (fs.existsSync(path.join('backend', 'src'))) {
    const jsFiles = listFilesRecursive(path.join('backend', 'src'), (p) => p.endsWith('.js'));
    for (const f of jsFiles) {
      run(`node --check ${f}`, 'node', ['--check', f]);
    }
  }

  // Python worker syntax check
  if (fs.existsSync(path.join('python', 'worker.py'))) {
    try {
      run('python -m py_compile python/worker.py', 'python', ['-m', 'py_compile', 'python/worker.py']);
    } catch (e) {
      if (process.platform === 'win32') {
        run('py -m py_compile python/worker.py', 'py', ['-m', 'py_compile', 'python/worker.py']);
      } else {
        throw e;
      }
    }
  }

  process.stdout.write('\n[doctor] OK\n');
};

try {
  main();
} catch (err) {
  process.stderr.write(`\n[doctor] FAIL: ${err.message}\n`);
  process.exit(1);
}
