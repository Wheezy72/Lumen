const SCAN_TIMEOUT_MS = parseInt(process.env.SCAN_TIMEOUT_MS || String(15 * 60 * 1000), 10);
const WORKER_RESPONSE_TIMEOUT_MS = parseInt(process.env.SCAN_WORKER_RESPONSE_TIMEOUT_MS || String(20 * 1000), 10);

export const createWaiter = (scanId, scan, pendingScans) => {
  let settled = false;
  let overallTimeout = null;
  let responseTimeout = null;
  let heardFromWorker = false;

  // Mongoose throws if you call scan.save() concurrently on the same document.
  // Progress messages can arrive quickly, so serialize all writes per scan.
  let writeChain = Promise.resolve();
  const enqueueWrite = (fn) => {
    writeChain = writeChain.then(fn, fn);
    return writeChain;
  };

  const cleanup = () => {
    if (overallTimeout) clearTimeout(overallTimeout);
    if (responseTimeout) clearTimeout(responseTimeout);
  };

  let _resolve;
  let _reject;
  const promise = new Promise((resolve, reject) => {
    _resolve = resolve;
    _reject = reject;
  });

  const settle = (fn) => (value) => {
    if (settled) return;
    settled = true;
    cleanup();
    pendingScans.delete(scanId);
    fn(value);
  };

  const resolve = settle(_resolve);
  const reject = settle(_reject);

  const start = () => {
    // The worker can publish an immediate "job received" progress message.
    // If that arrives before start() is called, we must not arm the response timeout.
    if (!heardFromWorker) {
      responseTimeout = setTimeout(() => {
        reject(new Error(`No response from Python worker within ${WORKER_RESPONSE_TIMEOUT_MS}ms`));
      }, WORKER_RESPONSE_TIMEOUT_MS);
    }

    overallTimeout = setTimeout(() => {
      reject(new Error('Worker timeout - scan took too long'));
    }, SCAN_TIMEOUT_MS);
  };

  const markHeardFromWorker = () => {
    heardFromWorker = true;
    if (responseTimeout) {
      clearTimeout(responseTimeout);
      responseTimeout = null;
    }
  };

  return {
    scan,
    promise,
    start,
    cleanup,
    resolve,
    reject,
    markHeardFromWorker,
    enqueueWrite,
  };
};
