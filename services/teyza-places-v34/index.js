'use strict';
const express = require('express');
const {onRequest} = require('firebase-functions/v2/https');
const {defineSecret} = require('firebase-functions/params');
const {num, category, photoResource, discover, fetchPhoto} = require('./places');
const API_KEY = defineSecret('TEYZA_GOOGLE_PLACES_KEY');
const app = express();
const ORIGINS = new Set(['https://teyza.co.za', 'https://www.teyza.co.za',
  'https://business-lift-3c19c.web.app', 'https://discover.teyza.co.za']);
app.disable('x-powered-by');
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (ORIGINS.has(origin)) { res.set('Access-Control-Allow-Origin', origin); res.vary('Origin'); }
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  next();
});
app.get('/health', (_, res) => res.json({ok: true, service: 'teyza-places', version: '3.6', provider: 'firebase-functions'}));
app.get(['/shopper-discover.php', '/shopper-discover'], async (req, res) => {
  const lat = num(req.query.lat, -90, 90), lon = num(req.query.lon, -180, 180);
  if (lat === null || lon === null) return res.status(400).json({ok: false, error: 'lat and lon required'});
  const kind = category(req.query.category);
  const radius = num(req.query.radius, 500, 50000) ?? (kind === 'spaza' ? 22000 : 40000);
  try {
    const key = API_KEY.value();
    if (!key) return res.status(503).json({ok: false, error: 'Places not configured'});
    return res.json(await discover({key, lat, lon, radius, kind}));
  } catch (error) {
    console.error('Teyza discovery:', error.message);
    return res.status(502).json({ok: false, error: 'Nearby shops temporarily unavailable'});
  }
});
app.get(['/shopper-place-photo.php', '/shopper-place-photo'], async (req, res) => {
  const ref = photoResource(req.query.name || req.query.ref);
  if (!ref) return res.status(400).send('Invalid place photo');
  const width = Math.round(num(req.query.w, 64, 1600) ?? 720);
  try {
    const key = API_KEY.value();
    if (!key) return res.status(503).send('Photo service not configured');
    const image = await fetchPhoto({key, ref, width});
    res.type(image.contentType);
    return res.send(image.bytes);
  } catch (error) {
    console.error('Teyza photo:', error.message);
    return res.status(error.status === 404 ? 404 : 502).send('Photo temporarily unavailable');
  }
});
exports.teyzaPlaces = onRequest({region: 'us-central1', memory: '256MiB', timeoutSeconds: 45,
  maxInstances: 10, secrets: [API_KEY]}, app);
