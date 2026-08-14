(function () {
  const API_BASE = (window.ELVO_API_BASE || 'https://elvo-menu.vercel.app').replace(/\/$/, '');

  const money = (text) => {
    const values = String(text || '').match(/\d[\d\s]*(?:[.,]\d{1,2})?\s*₴/g) || [];
    const last = values.at(-1);
    return last ? Number(last.replace(/[^\d,.]/g, '').replace(',', '.')) : 0;
  };

  function cartRoot(button) {
    let node = button;
    while (node && node !== document.body) {
      if (/Разом|Итого/i.test(node.textContent || '') || node.dataset.orderRoot === 'true') return node;
      node = node.parentElement;
    }
    return document.body;
  }

  function itemsFrom(root) {
    return Array.from(root.querySelectorAll('.cart-item, [data-cart-item], .cart-row')).map((node) => ({
      name: (node.querySelector('.name, [data-name], h3, h4')?.textContent || '').trim(),
      price: money(node.textContent),
      quantity: Number((node.querySelector('input')?.value || node.querySelector('[data-quantity]')?.textContent || 1)) || 1
    })).filter((item) => item.name);
  }

  function persistOrder(order) {
    try {
      localStorage.setItem('elvo_checkout', JSON.stringify({ ...order, savedAt: Date.now() }));
    } catch (_) {
      // Ignore storage failures in private mode.
    }
  }

  function loadCart() {
    try {
      const raw = localStorage.getItem('elvo-cart');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(item => item && item.name && Number(item.price) > 0) : [];
    } catch (_) {
      return [];
    }
  }

  async function pay(button) {
    const cart = loadCart();
    const total = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
    const amount = Number(button.dataset.amount || total || 0);
    if (!amount) {
      return alert('Не вдалося визначити суму замовлення. Оновіть сторінку та спробуйте ще раз.');
    }

    const order = {
      amount,
      customerName: 'Гість',
      customerPhone: '+380000000000',
      fulfillment: button.dataset.orderType || 'pickup',
      address: '',
      comment: '',
      items: cart.map(item => ({
        name: item.name,
        price: Number(item.price || 0),
        quantity: Number(item.quantity || 1)
      }))
    };

    const old = button.textContent;
    button.disabled = true;
    button.textContent = 'Готуємо оплату…';

    try {
      persistOrder(order);
      const response = await fetch(`${API_BASE}/api/create-liqpay-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      });
      const payment = await response.json();
      if (!response.ok) throw new Error(payment.error || `HTTP ${response.status}`);
      if (!payment.checkoutUrl || !payment.data || !payment.signature) {
        throw new Error('Invalid payment response: missing required fields');
      }
      try {
        localStorage.setItem('elvo_payment_order_id', String(payment.orderId || ''));
      } catch (_) {}
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = payment.checkoutUrl;
      [['data', payment.data], ['signature', payment.signature]].forEach(([name, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      console.error('Payment error:', err.message);
      alert('Оплата тимчасово недоступна. Будь ласка, спробуйте ще раз.');
      button.disabled = false;
      button.textContent = old;
    }
  }

  function ensurePaymentStatusNode() {
    let statusNode = document.querySelector('#payment-status');
    if (statusNode) return statusNode;
    statusNode = document.createElement('div');
    statusNode.id = 'payment-status';
    statusNode.setAttribute('role', 'status');
    statusNode.style.cssText = 'position:fixed;top:86px;left:50%;transform:translateX(-50%);z-index:9999;max-width:calc(100% - 32px);padding:14px 18px;border:1px solid rgba(212,175,55,.7);border-radius:14px;background:#111;color:#f4df8a;font-weight:800;text-align:center;box-shadow:0 12px 34px rgba(0,0,0,.45)';
    document.body.appendChild(statusNode);
    return statusNode;
  }

  function showPaymentStatus(statusText, isError = false) {
    const statusNode = ensurePaymentStatusNode();
    statusNode.textContent = statusText;
    statusNode.style.borderColor = isError ? '#d9534f' : 'rgba(212,175,55,.7)';
    statusNode.style.color = isError ? '#ffb3af' : '#f4df8a';
  }

  function clearPaidCart() {
    try {
      localStorage.removeItem('elvo-cart');
      localStorage.removeItem('elvo_checkout');
      localStorage.removeItem('elvo_payment_order_id');
    } catch (_) {}

    if (typeof window.renderCart === 'function') {
      window.renderCart();
    } else {
      const count = document.querySelector('#cart-count');
      const items = document.querySelector('#cart-items');
      const total = document.querySelector('#cart-total');
      if (count) count.textContent = '0';
      if (items) items.innerHTML = '<div class="empty-cart">Кошик порожній. Додайте страву з меню.</div>';
      if (total) total.textContent = '0 ₴';
    }
  }

  function initPaymentReturnStatus() {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('order_id');
    if (params.get('payment') !== 'return' || !orderId) return;

    showPaymentStatus('Перевіряємо статус замовлення…');
    fetch(`${API_BASE}/api/order-status?order_id=${encodeURIComponent(orderId)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'Order status failed');
        if (data.status === 'paid' || data.payment_status === 'paid') {
          clearPaidCart();
          showPaymentStatus('Оплата підтверджена. Замовлення успішно оформлено.', false);
          window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
        } else if (data.status === 'payment_failed' || data.payment_status === 'failed') {
          showPaymentStatus('Оплата не пройшла. Будь ласка, повторіть спробу.', true);
        } else {
          showPaymentStatus('Платіж обробляється. Замовлення очікує підтвердження.', false);
        }
      })
      .catch(() => {
        showPaymentStatus('Платіж обробляється. Станом на зараз замовлення перевіряється.', false);
      });
  }

  function enhance() {
    const buttons = Array.from(document.querySelectorAll('[data-liqpay-button]'));
    const button = buttons.find((el) => !el.dataset.liqpayReady);
    if (!button) return;

    button.dataset.liqpayReady = '1';
    button.removeAttribute('href');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      pay(button);
    }, true);
  }

  window.elvoPayCart = pay;

  new MutationObserver(enhance).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => {
    enhance();
    initPaymentReturnStatus();
  });
  enhance();
  initPaymentReturnStatus();
})();
