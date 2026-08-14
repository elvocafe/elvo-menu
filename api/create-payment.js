const { json, allowRequest, body, requiredEnv, supabase, liqpaySignature } = require('./_lib');

module.exports = async function handler(req, res) {
  if (!allowRequest(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Метод не підтримується' });
  try {
    requiredEnv('LIQPAY_PUBLIC_KEY', 'LIQPAY_PRIVATE_KEY', 'SITE_URL');
    const input = await body(req);
    const items = Array.isArray(input.items) ? input.items : [];
    const customerName = String(input.customerName || '').trim();
    const customerPhone = String(input.customerPhone || '').replace(/[^+\d]/g, '');
    const fulfillment = ['pickup', 'delivery'].includes(input.fulfillment) ? input.fulfillment : '';
    const address = String(input.address || '').trim();
    const comment = String(input.comment || '').trim().slice(0, 500);
    const cleanItems = items.map(item => ({
      name: String(item.name || '').trim().slice(0, 150),
      price: Number(item.price),
      quantity: Math.max(1, Math.min(50, Number(item.quantity) || 1))
    })).filter(item => item.name && Number.isFinite(item.price) && item.price > 0);
    if (!customerName || customerPhone.length < 10 || !fulfillment || !cleanItems.length) {
      return json(res, 400, { error: 'Заповніть ім’я, телефон, спосіб отримання та кошик' });
    }
    if (fulfillment === 'delivery' && !address) {
      return json(res, 400, { error: 'Вкажіть адресу доставки' });
    }
    const subtotal = cleanItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const deliveryFee = Math.max(0, Number(input.deliveryFee) || 0);
    const total = Math.round((subtotal + deliveryFee) * 100) / 100;
    const orderId = `ELVO-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    await supabase('orders', {
      method: 'POST',
      body: JSON.stringify({
        order_id: orderId,
        status: 'payment_pending',
        payment_status: 'pending',
        customer_name: customerName,
        customer_phone: customerPhone,
        fulfillment,
        address: fulfillment === 'delivery' ? address : null,
        comment,
        items: cleanItems,
        subtotal,
        delivery_fee: deliveryFee,
        total
      })
    });
    const payload = {
      version: 3,
      public_key: process.env.LIQPAY_PUBLIC_KEY,
      action: 'pay',
      amount: total.toFixed(2),
      currency: 'UAH',
      description: `Замовлення ELVO CAFE ${orderId}`,
      order_id: orderId,
      result_url: `${process.env.SITE_URL}/?payment=return&order_id=${encodeURIComponent(orderId)}`,
      server_url: `${process.env.SITE_URL}/api/liqpay-callback`,
      sandbox: 1
    };
    const data = Buffer.from(JSON.stringify(payload)).toString('base64');
    json(res, 200, { orderId, data, signature: liqpaySignature(data), checkoutUrl: 'https://www.liqpay.ua/api/3/checkout' });
  } catch (error) {
    console.error(error);
    json(res, 500, { error: 'Не вдалося створити оплату. Спробуйте ще раз.' });
  }
};
