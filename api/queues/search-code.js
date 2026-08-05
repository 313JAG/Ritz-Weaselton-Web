const { processSearchCodeMessage } = require('../_lib/search-worker');

module.exports = async (req, res) => {
  const { handleCallback } = await import('@vercel/queue');
  const handler = handleCallback(
    (message, metadata) => processSearchCodeMessage(message, metadata),
    {
      visibilityTimeoutSeconds: 300,
      retry: (_error, metadata) => {
        if (metadata.deliveryCount >= 3) return { acknowledge: true };
        return { afterSeconds: Math.min(120, 5 * 2 ** metadata.deliveryCount) };
      },
    }
  );
  // The queue package exposes a Web Request handler. Convert Vercel's
  // Node-style function request/response pair at the route boundary.
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const request = new Request(`https://${req.headers.host}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: Buffer.concat(chunks),
  });
  const response = await handler(request);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(await response.text());
};
