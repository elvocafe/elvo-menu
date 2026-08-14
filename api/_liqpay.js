const crypto = require('crypto');

function sign(data, privateKey) {
  return crypto.createHash('sha1').update(`${privateKey}${data}${privateKey}`).digest('base64');
}

function encode(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const origin = res.getHeader('Access-Control-Allow-Origin');
  if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.end(JSON.stringify(body));
}

async function saveOrder(order, method = 'POST') {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return false;

  const lookup = order.order_id || order.id;
  const url = method === 'PATCH'
    ? `${base.replace(/\/$/, '')}/rest/v1/orders?order_id=eq.${encodeURIComponent(String(lookup || ''))}`
    : `${base.replace(/\/$/, '')}/rest/v1/orders`;

  const payload = method === 'PATCH'
    ? { ...order, id: undefined, updated_at: new Date().toISOString() }
    : { ...order, id: undefined, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };

  const response = await fetch(url, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal,resolution=merge-duplicates'
    },
    body: JSON.stringify(payload)
  });

  return response.ok;
}

module.exports = { sign, encode, send, saveOrder };
