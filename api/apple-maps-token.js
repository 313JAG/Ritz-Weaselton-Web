const fs = require('node:fs');

const TOKEN_TTL_SECONDS = 60 * 30;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function getPrivateKey() {
  if (process.env.APPLE_MAPS_PRIVATE_KEY) {
    return process.env.APPLE_MAPS_PRIVATE_KEY.replace(/\\n/g, '\n');
  }

  if (process.env.APPLE_MAPS_PRIVATE_KEY_PATH) {
    return fs.readFileSync(process.env.APPLE_MAPS_PRIVATE_KEY_PATH, 'utf8');
  }

  return null;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const privateKey = getPrivateKey();
    const keyId = process.env.APPLE_MAPS_KEY_ID;
    const teamId = process.env.APPLE_MAPS_TEAM_ID;
    const mapsId = process.env.APPLE_MAPS_MAPS_ID;

    if (!privateKey || !keyId || !teamId || !mapsId) {
      sendJson(res, 503, { error: 'Apple Maps is not configured' });
      return;
    }

    const { SignJWT, importPKCS8 } = await import('jose');
    const signingKey = await importPKCS8(privateKey, 'ES256');
    const now = Math.floor(Date.now() / 1000);

    const token = await new SignJWT({ sub: mapsId })
      .setProtectedHeader({ alg: 'ES256', kid: keyId, typ: 'JWT' })
      .setIssuer(teamId)
      .setIssuedAt(now)
      .setExpirationTime(now + TOKEN_TTL_SECONDS)
      .sign(signingKey);

    sendJson(res, 200, {
      token,
      expiresAt: new Date((now + TOKEN_TTL_SECONDS) * 1000).toISOString(),
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Apple Maps token generation failed' });
  }
};
