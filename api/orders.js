const { json, allowRequest, body, supabase } = require('./_lib');

module.exports = async function handler(req, res) {
  if (!allowRequest(req, res)) return;
  try {
    if (req.method === 'GET') {
      const rows = await supabase('orders?select=*&status=not.in.(completed,cancelled)&order=created_at.desc&limit=100');
      return json(res, 200, rows);
    }
    if (req.method === 'PATCH') {
      const input = await body(req);
      const allowed = ['new', 'paid', 'accepted', 'kitchen', 'ready', 'courier', 'completed', 'cancelled'];
      if (!allowed.includes(input.status)) return json(res, 400, { error: 'Невірний статус' });
      const rows = await supabase(`orders?order_id=eq.${encodeURIComponent(input.orderId || '')}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: input.status, updated_at: new Date().toISOString() })
      });
      return json(res, 200, rows?.[0] || { ok: true });
    }
    json(res, 405, { error: 'Метод не підтримується' });
  } catch (error) {
    console.error(error);
    json(res, 500, { error: 'Помилка роботи із замовленнями' });
  }
};
