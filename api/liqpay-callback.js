const crypto = require('crypto');
const { sign, send, saveOrder } = require('./_liqpay');

function parseCallbackBody(reqBody) {
  if (!reqBody) return {};
  if (typeof reqBody === 'string') {
    try {
      return JSON.parse(reqBody);
    } catch (_) {
      return Object.fromEntries(new URLSearchParams(reqBody));
    }
  }
  if (Buffer.isBuffer(reqBody)) {
    const text = reqBody.toString('utf8');
    try {
      return JSON.parse(text);
    } catch (_) {
      return Object.fromEntries(new URLSearchParams(text));
    }
  }
  if (typeof reqBody === 'object') {
    return reqBody;
  }
  return {};
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const privateKey = process.env.LIQPAY_PRIVATE_KEY;
  const body = parseCallbackBody(req.body);
  const data = body.data || body['data'];
  const signature = body.signature || body['signature'];
  if (!privateKey || !data || !signature) return send(res, 400, { error: 'Invalid callback' });

  const expected = sign(data, privateKey);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return send(res, 403, { error: 'Bad signature' });

  let payment;
  try { payment = JSON.parse(Buffer.from(data, 'base64').toString('utf8')); }
  catch (_) { return send(res, 400, { error: 'Bad data' }); }

  const paid = ['success', 'sandbox'].includes(payment.status);
  try {
    await saveOrder({
      order_id: payment.order_id,
      status: paid ? 'paid' : 'payment_failed',
      payment_status: paid ? 'paid' : String(payment.status || 'unknown'),
      liqpay_status: String(payment.status || ''),
      liqpay_payment_id: payment.payment_id || null,
      liqpay_payload: payment,
      updated_at: new Date().toISOString()
    }, 'PATCH');
  } catch (_) {}
  return send(res, 200, { ok: true });
};
