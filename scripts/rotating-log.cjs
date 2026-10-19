'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS module shared with supervisor.mjs and Jest */

const { appendFileSync, existsSync, renameSync, statSync, unlinkSync } = require('node:fs');

/**
 * Append-only log file that rotates by size: server.log → server.log.1 → … →
 * server.log.<keep>, the oldest is deleted. Synchronous on purpose — it is fed
 * from child-process pipes and must never interleave or lose lines on exit.
 */
function createRotatingLog(filePath, { maxBytes = 5 * 1024 * 1024, keep = 3 } = {}) {
  let size = existsSync(filePath) ? statSync(filePath).size : 0;

  function rotate() {
    const oldest = `${filePath}.${keep}`;
    if (existsSync(oldest)) unlinkSync(oldest);
    for (let i = keep - 1; i >= 1; i--) {
      if (existsSync(`${filePath}.${i}`)) renameSync(`${filePath}.${i}`, `${filePath}.${i + 1}`);
    }
    if (existsSync(filePath)) renameSync(filePath, `${filePath}.1`);
    size = 0;
  }

  return {
    write(chunk) {
      const data = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      if (size > 0 && size + data.length > maxBytes) rotate();
      appendFileSync(filePath, data);
      size += data.length;
    },
  };
}

/** Restart delay grows with consecutive quick crashes, capped; resets after a stable run. */
function nextRestartDelay(consecutiveFailures) {
  const steps = [2000, 5000, 15000, 30000, 60000];
  return steps[Math.min(consecutiveFailures, steps.length - 1)];
}

module.exports = { createRotatingLog, nextRestartDelay };
