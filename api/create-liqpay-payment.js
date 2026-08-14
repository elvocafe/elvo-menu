const { sign, encode, send, saveOrder } = require('./_liqpay');
const { allowRequest } = require('./_lib');

module.exports = async function handler(req, res) {
  if (!allowRequest(req, res)) return;
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const publicKey = process.env.LIQPAY_PUBLIC_KEY;
  const privateKey = process.env.LIQPAY_PRIVATE_KEY;
  if (!publicKey || !privateKey) return send(res, 503, { error: 'LiqPay keys are not configured' });

  let parsedBody = {};
  try {
    if (typeof req.body === 'string') {
      parsedBody = JSON.parse(req.body || '{}');
    } else if (req.body && typeof req.body === 'object') {
      parsedBody = req.body;
    }
  } catch (parseError) {
    return send(res, 400, { error: 'Invalid JSON in request body' });
  }

  const amount = Number(parsedBody.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
    return send(res, 400, { error: 'Invalid amount' });
  }

  const orderId = `ELVO-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const siteUrl = (process.env.SITE_URL || 'https://elvo-menu.vercel.app').replace(/\/$/, '');
  const publicSiteUrl = 'https://elvocafe.github.io/elvo-menu';
  const items = Array.isArray(parsedBody.items) ? parsedBody.items.slice(0, 100).map(item => ({
    name: String(item.name || '').trim().slice(0, 150),
    price: Number(item.price) || 0,
    quantity: Math.max(1, Math.min(50, Number(item.quantity) || 1))
  })).filter(item => item.name && item.price > 0) : [];
  const customerName = String(parsedBody.customerName || 'Гість').trim() || 'Гість';
  const customerPhone = String(parsedBody.customerPhone || '+380000000000').replace(/[^+\d]/g, '');
  const fulfillment = ['pickup', 'delivery'].includes(parsedBody.fulfillment) ? parsedBody.fulfillment : 'pickup';
  const address = String(parsedBody.address || '').trim();
  const comment = String(parsedBody.comment || '').trim().slice(0, 500);
  const subtotal = Number(amount.toFixed(2));

  const payload = {
    public_key: publicKey,
    version: '3',
    action: 'pay',
    amount: subtotal.toFixed(2),
    currency: 'UAH',
    description: `Замовлення ELVO CAFE ${orderId}`,
    order_id: orderId,
    result_url: `${publicSiteUrl}/?payment=return&order_id=${encodeURIComponent(orderId)}`,
    server_url: `${siteUrl}/api/liqpay-callback`,
    language: 'uk',
    sandbox: 1
  };
  const data = encode(payload);
  const signature = sign(data, privateKey);

  try {
    await saveOrder({
      order_id: orderId,
      status: 'payment_pending',
      payment_status: 'pending',
      customer_name: customerName,
      customer_phone: customerPhone,
      fulfillment,
      address: fulfillment === 'delivery' ? address : null,
      comment,
      items,
      subtotal,
      delivery_fee: 0,
      total: subtotal,
      amount: subtotal.toFixed(2),
      currency: 'UAH',
      source: 'website',
      updated_at: new Date().toISOString()
    });
  } catch (_) {
    // Checkout remains available while the order database is being configured.
  }

  return send(res, 200, {
    checkoutUrl: 'https://www.liqpay.ua/api/3/checkout',
    data,
    signature,
    orderId,
    sandbox: true
  });
};
