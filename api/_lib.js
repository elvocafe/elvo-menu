const crypto = require('crypto');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function allowRequest(req, res) {
  const allowed = process.env.ALLOWED_ORIGIN || process.env.SITE_URL || '*';
  const origin = req.headers.origin;
  if (allowed === '*' || !origin || origin === allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin || allowed);
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Pin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return false;
  }
  return true;
}

function body(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error('Занадто великий запит'));
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('Некоректні дані')); }
    });
    req.on('error', reject);
  });
}

function requiredEnv(...names) {
  for (const name of names) {
    if (!process.env[name]) throw new Error(`Не налаштовано ${name}`);
  }
}

async function supabase(path, options = {}) {
  requiredEnv('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.hint || 'Помилка бази замовлень');
  return data;
}

function liqpaySignature(data) {
  requiredEnv('LIQPAY_PRIVATE_KEY');
  return crypto.createHash('sha1')
    .update(process.env.LIQPAY_PRIVATE_KEY + data + process.env.LIQPAY_PRIVATE_KEY)
    .digest('base64');
}

function adminAllowed(req) {
  return Boolean(process.env.ORDERS_ADMIN_PIN) &&
    req.headers['x-admin-pin'] === process.env.ORDERS_ADMIN_PIN;
}

module.exports = { json, allowRequest, body, requiredEnv, supabase, liqpaySignature, adminAllowed };
