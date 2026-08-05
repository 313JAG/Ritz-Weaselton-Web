const { JOB_TTL_SECONDS } = require('./job-store');

const TOPIC = 'ritz-search-code';

async function enqueueCode(message, options = {}) {
  if (process.env.VERCEL) {
    const { send } = await import('@vercel/queue');
    await send(TOPIC, message, {
      idempotencyKey: `${message.jobId}:${message.code}:${message.retryToken || 'initial'}`,
      retentionSeconds: JOB_TTL_SECONDS,
      ...options,
    });
    return;
  }

  const dispatch = (deliveryCount) => {
    require('./search-worker').processSearchCodeMessage(message, { deliveryCount }).catch((error) => {
      if (deliveryCount < 3) {
        setTimeout(() => dispatch(deliveryCount + 1), Math.min(120000, 5000 * 2 ** deliveryCount));
      } else {
        console.error('Local search worker failed after retries', error);
      }
    });
  };
  setTimeout(() => dispatch(1), 0);
}

module.exports = { TOPIC, enqueueCode };
