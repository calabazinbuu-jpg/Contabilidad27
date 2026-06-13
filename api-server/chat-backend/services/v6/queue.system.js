"use strict";
/**
 * v6 - Queue System (in-process, BullMQ-style API)
 * Para batching de queries y trabajos pesados sin dependencias externas.
 * Reemplazable por BullMQ/Kafka adapter manteniendo la misma interfaz.
 */

function createQueue({ name = "default", concurrency = 4, maxRetries = 2, logger = console } = {}) {
  const jobs = [];
  const processors = new Map(); // jobName -> handler
  let active = 0;
  let running = false;
  let nextId = 1;
  const completed = [];
  const failed = [];

  function process(jobName, handler) {
    processors.set(jobName, handler);
  }

  function add(jobName, data = {}, opts = {}) {
    const job = {
      id: nextId++,
      name: jobName,
      data,
      attempts: 0,
      maxAttempts: opts.retries ?? maxRetries,
      addedAt: Date.now(),
    };
    jobs.push(job);
    tick();
    return job;
  }

  async function runOne(job) {
    const handler = processors.get(job.name);
    if (!handler) {
      failed.push({ ...job, error: `no processor for ${job.name}` });
      return;
    }
    active++;
    try {
      job.attempts++;
      const result = await handler(job.data, job);
      completed.push({ ...job, result, finishedAt: Date.now() });
    } catch (err) {
      if (job.attempts <= job.maxAttempts) {
        jobs.push(job);
      } else {
        logger.error?.(`[queue:${name}] job ${job.id} (${job.name}) failed:`, err.message);
        failed.push({ ...job, error: err.message, finishedAt: Date.now() });
      }
    } finally {
      active--;
      tick();
    }
  }

  function tick() {
    if (running) return;
    running = true;
    queueMicrotask(async () => {
      while (active < concurrency && jobs.length > 0) {
        const job = jobs.shift();
        runOne(job);
      }
      running = false;
    });
  }

  async function drain() {
    while (jobs.length > 0 || active > 0) {
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  function stats() {
    return { name, pending: jobs.length, active, completed: completed.length, failed: failed.length };
  }

  return { add, process, drain, stats, completed, failed };
}

/** Helper de batching para queries SQL repetidas. */
function createBatcher({ runQuery, windowMs = 25, maxSize = 100 } = {}) {
  const buckets = new Map(); // sql -> [{ params, resolve, reject }]
  let timer = null;

  function flush() {
    timer = null;
    for (const [sql, items] of buckets.entries()) {
      const all = items.splice(0, items.length);
      Promise.all(all.map((i) => runQuery(sql, i.params))).then(
        (results) => results.forEach((r, i) => all[i].resolve(r)),
        (err) => all.forEach((i) => i.reject(err))
      );
    }
    buckets.clear();
  }

  function enqueue(sql, params) {
    return new Promise((resolve, reject) => {
      if (!buckets.has(sql)) buckets.set(sql, []);
      const bucket = buckets.get(sql);
      bucket.push({ params, resolve, reject });
      if (bucket.length >= maxSize) return flush();
      if (!timer) timer = setTimeout(flush, windowMs);
    });
  }

  return { enqueue, flush };
}

module.exports = { createQueue, createBatcher };
