const { processSearchCodeMessage } = require('../_lib/search-worker');

module.exports = async (req, res) => {
  const { handleNodeCallback } = await import('@vercel/queue');
  const handler = handleNodeCallback(
    (message, metadata) => processSearchCodeMessage(message, metadata),
    {
      visibilityTimeoutSeconds: 300,
      retry: (_error, metadata) => {
        if (metadata.deliveryCount >= 3) return { acknowledge: true };
        return { afterSeconds: Math.min(120, 5 * 2 ** metadata.deliveryCount) };
      },
    }
  );
  return handler(req, res);
};
