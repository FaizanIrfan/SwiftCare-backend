const express = require('express');
const router = express.Router();

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const candidates = [
    req.headers['cf-connecting-ip'],
    req.headers['x-real-ip'],
    req.headers['true-client-ip'],
    forwardedFor?.split(',')[0]?.trim(),
    req.ip,
    req.socket.remoteAddress
  ];

  const ip = candidates.find((candidate) => candidate && candidate !== 'unknown' && candidate !== '::1' && candidate !== '127.0.0.1');
  return ip || '';
}

async function fetchCoordinatesFromProviders(ip) {
  const suffix = ip ? `/${encodeURIComponent(ip)}` : '';
  const providers = [
    async () => {
      const response = await fetch(`https://ipapi.co${suffix}/json/`);
      if (!response.ok) return null;

      const data = await response.json();
      const lat = Number(data?.latitude);
      const lng = Number(data?.longitude);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    },
    async () => {
      const response = await fetch(`https://ipwho.is${suffix}`);
      if (!response.ok) return null;

      const data = await response.json();
      const lat = Number(data?.latitude);
      const lng = Number(data?.longitude);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    },
    async () => {
      const response = await fetch(`https://ipinfo.io${suffix}/json`);
      if (!response.ok) return null;

      const data = await response.json();
      const loc = typeof data?.loc === 'string' ? data.loc.split(',') : [];
      const lat = Number(loc[0]);
      const lng = Number(loc[1]);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    },
  ];

  for (const provider of providers) {
    try {
      const result = await provider();
      if (result) return result;
    } catch (e) {
      continue;
    }
  }

  return null;
}

router.get('/', async (req, res) => {
  try {
    const ip = getClientIp(req);
    const location = await fetchCoordinatesFromProviders(ip);

    if (!location) {
      return res.status(502).json({ error: 'Unable to resolve location' });
    }

    res.setHeader('Cache-Control', 'no-store');
    res.json(location);
  } catch (error) {
    console.error('Location routing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
