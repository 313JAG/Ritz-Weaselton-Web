import { describe, expect, it } from 'vitest'
import jobStore from '../api/_lib/job-store.js'
import worker from '../api/_lib/search-worker.js'
import { extractRateInfo } from '../v2/lib/marriott-api-runner.js'

const { createJob, getJob, storeResult, resetFailed, cancelJob } = jobStore
const { shouldRetry } = worker
const params = { city: 'Sydney', country: 'AU', checkIn: '2026-08-05', checkOut: '2026-08-06', codes: ['BASELINE', 'AAA', 'GOV'] }

describe('durable search job state', () => {
  it('tracks partial results, failed-code retry, and cancellation', async () => {
    const created = await createJob(params)
    await storeResult(created.id, { code: 'BASELINE', success: true, error: null, hotels: [], url: 'std' })
    await storeResult(created.id, { code: 'AAA', success: false, error: 'ACCESS_DENIED', hotels: [], url: 'aaa' })
    const partial = await getJob(created.id)
    expect(partial.progress.completedCodes).toBe(2)
    expect(partial.failedCodes).toEqual(['AAA'])

    const reset = await resetFailed(created.id)
    expect(reset.codes).toContain('AAA')
    const cancelled = await cancelJob(created.id)
    expect(cancelled.status).toBe('cancelled')
  })

  it('only retries transient errors up to the configured limit', () => {
    expect(shouldRetry({ success: false, error: 'TIMEOUT' }, 1)).toBe(true)
    expect(shouldRetry({ success: false, error: 'ACCESS_DENIED' }, 1)).toBe(false)
    expect(shouldRetry({ success: false, error: 'NETWORK_ERROR' }, 3)).toBe(false)
  })

  it('creates a 356-code job without executing it in the request', async () => {
    const codes = ['BASELINE', ...Array.from({ length: 356 }, (_, index) => `C${index}`)]
    const job = await createJob({ ...params, codes })
    expect(job.status).toBe('queued')
    expect(job.progress.totalCodes).toBe(357)
    expect(job.progress.completedCodes).toBe(0)
  })
})

describe('Marriott pricing integrity', () => {
  it('uses Marriott’s complete nightly amount without dividing it by the stay length twice', () => {
    const rate = extractRateInfo([
      {
        rateModes: {
          lowestAverageRate: {
            amount: { amount: 26690, currency: 'USD', decimalPoint: 2 },
            fees: { amount: 75, currency: 'USD', decimalPoint: 2 },
            taxes: { amount: 4671, currency: 'USD', decimalPoint: 2 },
            totalAmount: { amount: 31436, currency: 'USD', decimalPoint: 2 },
          },
        },
      },
    ], { checkIn: '2026-08-07', checkOut: '2026-08-09' })

    expect(rate).toMatchObject({
      price: 314.36,
      totalPrice: 628.72,
      taxes: 93.42,
      fees: 1.5,
      currency: 'USD',
    })
  })
})
