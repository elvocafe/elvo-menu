const { json, allowRequest, supabase } = require('./_lib');

module.exports = async function handler(req, res) {
  if (!allowRequest(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Метод не підтримується' });
  try {
    const id = String(req.query?.order_id || '').trim();
    if (!/^ELVO-[A-Z0-9-]+$/i.test(id)) return json(res, 400, { error: 'Невірний номер' });
    const rows = await supabase(`orders?order_id=eq.${encodeURIComponent(id)}&select=order_id,status,payment_status,total,fulfillment`);
    if (!rows?.length) return json(res, 404, { error: 'Замовлення не знайдено' });
    json(res, 200, rows[0]);
  } catch (error) {
    console.error(error);
    json(res, 500, { error: 'Не вдалося перевірити оплату' });
  }
};
