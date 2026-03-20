const { randomUUID } = require('node:crypto');
const { MarriottApiRunner, buildCacheKey, normalizeCode } = require('./marriott-api-runner');

function summarizeResults(params, results) {
  const hotelNames = new Set();
  const failedCodes = [];
  let successfulCodes = 0;

  for (const result of results) {
    if (result.success || result.error === 'NO_RESULTS') {
      successfulCodes += 1;
    } else {
      failedCodes.push(result.code);
    }
    for (const hotel of result.hotels || []) {
      hotelNames.add(hotel.name);
    }
  }

  return {
    destination: [params.city, params.country].filter(Boolean).join(', '),
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    propertyCount: hotelNames.size,
    successfulCodes,
    failedCodes,
    totalCodes: (params.codes || []).length,
  };
}

class SearchJobManager {
  constructor({ store, concurrency = 4 } = {}) {
    this.store = store;
    this.concurrency = concurrency;
    this.jobs = new Map();
  }

  startJob(params, options = {}) {
    const jobId = randomUUID();
    const codeOrder = Array.from(
      new Set((params.codes || []).map(normalizeCode).filter(Boolean))
    );

    const baseResults = Array.isArray(options.baseResults)
      ? options.baseResults.map((result) => ({ ...result }))
      : [];

    const job = {
      id: jobId,
      params: {
        ...params,
        codes: codeOrder,
      },
      debug: Boolean(options.debug),
      status: 'queued',
      message: 'Queued',
      codeOrder: options.codeOrder || codeOrder,
      resultsByCode: new Map(baseResults.map((result) => [normalizeCode(result.code), result])),
      runningCodes: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      error: null,
      sourceJobId: options.sourceJobId || null,
    };

    this.jobs.set(jobId, job);
    this.executeJob(job).catch((error) => {
      job.status = 'failed';
      job.error = String(error?.message || error);
      job.message = 'Search failed';
      job.updatedAt = new Date().toISOString();
      job.completedAt = job.updatedAt;
    });

    return this.getJob(jobId);
  }

  getJob(id) {
    const job = this.jobs.get(id);
    if (!job) return null;
    return this.serializeJob(job);
  }

  retryFailed(id) {
    const original = this.jobs.get(id);
    if (!original) {
      throw new Error('Search job not found');
    }

    const failedCodes = this.serializeJob(original).failedCodes;
    if (failedCodes.length === 0) {
      throw new Error('This search has no failed codes to retry');
    }

    const successfulResults = this.serializeJob(original).results.filter(
      (result) => result.success || result.error === 'NO_RESULTS'
    );

    return this.startJob(
      {
        ...original.params,
        codes: failedCodes,
      },
      {
        debug: original.debug,
        baseResults: successfulResults,
        codeOrder: original.codeOrder,
        sourceJobId: id,
      }
    );
  }

  async executeJob(job) {
    job.status = 'running';
    job.message = 'Contacting Marriott';
    job.updatedAt = new Date().toISOString();

    const runner = new MarriottApiRunner({
      debug: job.debug,
      concurrency: this.concurrency,
    });

    const results = await runner.runSearch(job.params, {
      onProgress: (result) => {
        job.resultsByCode.set(normalizeCode(result.code), result);
        job.runningCodes = job.runningCodes.filter((code) => code !== normalizeCode(result.code));
        job.message = `Processed ${result.code}`;
        job.updatedAt = new Date().toISOString();
      },
    });

    for (const code of job.params.codes) {
      if (!job.runningCodes.includes(code)) {
        job.runningCodes.push(code);
      }
    }

    for (const result of results) {
      job.resultsByCode.set(normalizeCode(result.code), result);
    }

    job.status = 'completed';
    job.message = 'Complete';
    job.updatedAt = new Date().toISOString();
    job.completedAt = job.updatedAt;

    const serialized = this.serializeJob(job);
    const summary = summarizeResults(job.params, serialized.results);

    if (this.store && typeof this.store.recordSearchHistory === 'function') {
      this.store.recordSearchHistory({
        id: serialized.id,
        params: job.params,
        summary,
        results: serialized.results,
        cacheKey: buildCacheKey(job.params),
        reusedCache: Boolean(job.sourceJobId),
      });
    }
  }

  serializeJob(job) {
    const results = job.codeOrder
      .map((code) => job.resultsByCode.get(normalizeCode(code)))
      .filter(Boolean);

    const completedCodes = results.length;
    const failedCodes = results
      .filter((result) => !result.success && result.error !== 'NO_RESULTS')
      .map((result) => result.code);
    const successfulCodes = results.filter(
      (result) => result.success || result.error === 'NO_RESULTS'
    ).length;

    return {
      id: job.id,
      status: job.status,
      message: job.message,
      error: job.error,
      debug: job.debug,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
      sourceJobId: job.sourceJobId,
      params: job.params,
      progress: {
        totalCodes: job.codeOrder.length,
        completedCodes,
        successfulCodes,
        failedCodes: failedCodes.length,
      },
      failedCodes,
      results,
    };
  }
}

module.exports = {
  SearchJobManager,
};
