// Store: products, orders and Tap card payments for orders.
// Rules kept from the live Worker:
// - Prices come from the server catalog only. The browser never sends a price.
// - Money is stored in halalas. A Tap payment counts only after the server
//   re-reads the charge from Tap and matches order number, amount and currency.
// - Orders paid by bank transfer start as 'new' (admin confirms the transfer).
import { ApiError, json, nowIso, readJson, toAsciiDigits } from './util.js';
import { hit } from './ratelimit.js';
import { ipHash } from './registrations.js';
import { writeAudit } from './audit.js';
import { normalizeMobile } from './validate.js';

export const TAP_API_BASE = 'https://api.tap.company/v2';
const ORDER_NUMBER_RE = /^LPS-\d{4}-[A-Z0-9]{5,10}$/;
const MAX_ITEMS = 20;

/** Server-side catalog. Keep in sync with the store page; prices are SAR, converted to halalas below. */
export const PRODUCTS = [
  {
    id: 'jersey_official', category: 'academy_wear', active: true, featured: true,
    name: 'تيشيرت ليبرو الرسمي', desc: 'قميص رسمي بألوان الأكاديمية، قماش رياضي عالي التنفّس.',
    price_sar: 95, images: ['jersey_official.jpg'],
    variants: [{ key: 's', label: 'S' }, { key: 'm', label: 'M' }, { key: 'l', label: 'L' }, { key: 'xl', label: 'XL' }],
  },
];

const halalas = (sar) => Math.round(sar * 100);

export function publicProducts() {
  return PRODUCTS.filter((p) => p.active).map((p) => ({
    id: p.id, category: p.category, name: p.name, desc: p.desc,
    price_sar: p.price_sar, images: p.images, featured: !!p.featured,
    variants: (p.variants || []).map((v) => ({ key: v.key, label: v.label, price_sar: v.price_sar || p.price_sar, in_stock: true })),
    in_stock: true,
  }));
}

/** Rebuilds each line from the catalog. Unknown products or variants are rejected. */
export function priceLines(items) {
  const lines = [];
  let totalHalala = 0;
  for (const raw of items) {
    const product = PRODUCTS.find((p) => p.id === String(raw.product_id || '') && p.active);
    if (!product) throw new ApiError(400, 'invalid_items', 'أحد المنتجات لم يعد متاحًا.');
    const hasVariants = product.variants && product.variants.length;
    const variant = hasVariants ? product.variants.find((v) => v.key === String(raw.variant_key || '')) : null;
    if (hasVariants && !variant) throw new ApiError(400, 'invalid_items', `اختر مقاسًا صحيحًا لـ ${product.name}.`);
    const qty = Math.max(1, Math.min(20, parseInt(raw.qty, 10) || 1));
    const unit = variant && variant.price_sar ? variant.price_sar : product.price_sar;
    totalHalala += halalas(unit) * qty;
    lines.push({
      product_id: product.id, name: product.name,
      variant_key: variant ? variant.key : '', variant_label: variant ? variant.label : '',
      price_sar: unit, qty, line_sar: Math.round(unit * qty * 100) / 100,
    });
  }
  return { lines, totalHalala };
}

async function newOrderNumber(db) {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 5; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    let code = '';
    for (const b of bytes) code += alphabet[b % alphabet.length];
    const n = `LPS-${new Date().getUTCFullYear()}-${code}`;
    const hit2 = await db.prepare('SELECT 1 AS x FROM orders WHERE order_number = ?').bind(n).first();
    if (!hit2) return n;
  }
  throw new ApiError(503, 'try_again', 'تعذّر إنشاء رقم الطلب، حاول مرة أخرى.');
}

export async function handleCreateOrder(request, env) {
  const ip = await ipHash(request, env);
  await hit(env.DB, `order:${ip}`, 15, 600);
  const body = await readJson(request, 32 * 1024);

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw new ApiError(400, 'empty_cart', 'السلة فارغة.');
  if (items.length > MAX_ITEMS) throw new ApiError(400, 'too_many_items', 'عدد العناصر كبير جدًا.');
  const { lines, totalHalala } = priceLines(items);

  const errors = {};
  const name = String(body.customer_name || '').trim();
  if (name.length < 3 || name.length > 80) errors.customer_name = 'الرجاء كتابة الاسم كاملًا.';
  const mobile = normalizeMobile(toAsciiDigits(body.customer_mobile));
  if (!mobile) errors.customer_mobile = 'رقم جوال سعودي غير صحيح.';
  const city = String(body.city || '').trim();
  if (city.length < 2 || city.length > 60) errors.city = 'الرجاء كتابة المدينة.';
  const district = String(body.district || '').trim().slice(0, 60);
  const address = String(body.address || '').trim();
  if (address.length < 8 || address.length > 300) errors.address = 'الرجاء كتابة عنوان توصيل واضح.';
  const website = String(body.website || '').trim().slice(0, 200);
  const notes = String(body.notes || '').trim().slice(0, 400);

  const method = body.payment_method === 'tap' ? 'tap' : 'bank_transfer';
  if (method === 'bank_transfer' && body.transfer_confirmed !== true) {
    errors.transfer_confirmed = 'يجب تأكيد إتمام التحويل البنكي.';
  }
  if (body.terms_accepted !== true) errors.terms_accepted = 'يجب الموافقة على الشروط والأحكام.';
  if (Object.keys(errors).length) throw new ApiError(422, 'validation_failed', 'بعض البيانات غير مكتملة.', errors);

  const orderNumber = await newOrderNumber(env.DB);
  const t = nowIso();
  await env.DB
    .prepare(
      `INSERT INTO orders (id, order_number, items_json, subtotal_price, delivery_fee, total_price, currency,
         customer_name, customer_mobile, city, district, address, website, notes,
         delivery_method, delivery_method_name, payment_gateway, order_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, 'SAR', ?, ?, ?, ?, ?, ?, ?, 'flat_fee', 'توصيل', ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(), orderNumber, JSON.stringify(lines), `${totalHalala}.0`, totalHalala,
      name, mobile, city, district, address, website, notes,
      method, method === 'tap' ? 'payment_pending' : 'new', t, t
    )
    .run();
  await writeAudit(env.DB, { action: 'order.created', entity: 'order', entityId: orderNumber, meta: { method, total_halala: totalHalala }, ipHash: ip });

  return json({
    ok: true, order_number: orderNumber,
    subtotal_sar: totalHalala / 100, delivery_fee_sar: 0, amount_sar: totalHalala / 100,
    currency: 'SAR', payment_method: method, items: lines,
  }, 201);
}

async function loadOrder(db, orderNumber) {
  if (!ORDER_NUMBER_RE.test(orderNumber)) throw new ApiError(400, 'bad_reference', 'رقم طلب غير صحيح.');
  const row = await db.prepare('SELECT * FROM orders WHERE order_number = ?').bind(orderNumber).first();
  if (!row) throw new ApiError(404, 'not_found', 'لم نجد هذا الطلب.');
  return row;
}

/** Public order status: no contact details. */
export async function handleGetOrder(request, env, orderNumber) {
  const ip = await ipHash(request, env);
  await hit(env.DB, `order-lookup:${ip}`, 30, 60);
  const r = await loadOrder(env.DB, orderNumber);
  let items = [];
  try { items = JSON.parse(r.items_json || '[]'); } catch { items = []; }
  return json({
    ok: true,
    order: {
      order_number: r.order_number, customer_name: r.customer_name, city: r.city,
      amount_sar: r.total_price / 100, order_status: r.order_status,
      items: items.map((it) => ({ name: it.name, qty: it.qty, variant_label: it.variant_label })),
    },
  });
}

function requireTap(env) {
  if (!env.TAP_SECRET_KEY) throw new ApiError(500, 'tap_not_configured', 'بوابة الدفع الإلكتروني غير مُفعَّلة بعد.');
}

export async function handleTapCharge(request, env) {
  requireTap(env);
  const body = await readJson(request);
  const order = await loadOrder(env.DB, String(body.order_number || ''));
  if (order.order_status === 'confirmed' || order.order_status === 'paid') {
    throw new ApiError(409, 'already_paid', 'هذا الطلب مدفوع بالفعل.');
  }
  if (order.tap_charge_id) {
    throw new ApiError(409, 'charge_exists', 'يوجد عملية دفع سابقة لهذا الطلب.');
  }
  const amountSar = order.total_price / 100; // from our record, never from the browser
  const origin = request.headers.get('Origin') || 'https://liproacademy.com';
  const returnUrl = origin.replace(/\/+$/, '') + '/store/payment-return/?order=' + encodeURIComponent(order.order_number);
  const parts = String(order.customer_name || '').trim().split(/\s+/);
  const payload = {
    amount: amountSar, currency: 'SAR', customer_initiated: true, threeDSecure: true, save_card: false,
    description: 'طلب من متجر أكاديمية ليبرو — ' + order.order_number,
    metadata: { order_number: order.order_number, source: 'lipro_store' },
    reference: { order: order.order_number },
    receipt: { email: false, sms: false },
    customer: {
      first_name: parts[0] || 'عميل', last_name: parts.slice(1).join(' ') || 'ليبرو',
      phone: { country_code: '966', number: String(order.customer_mobile).replace(/^0/, '') },
    },
    source: { id: 'src_all' },
    post: { url: returnUrl }, redirect: { url: returnUrl },
  };

  let res, data;
  try {
    res = await fetch(TAP_API_BASE + '/charges', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.TAP_SECRET_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    data = await res.json();
  } catch {
    throw new ApiError(502, 'tap_unreachable', 'تعذّر الاتصال ببوابة الدفع، حاول مرة أخرى.');
  }
  if (!res.ok || !data || !data.id || !data.transaction || !data.transaction.url) {
    // Log the status only: the response body can echo customer data.
    console.log('TAP_CHARGE_FAILED status=' + res.status);
    throw new ApiError(502, 'tap_charge_failed', 'تعذّر إنشاء عملية الدفع.');
  }
  await env.DB.prepare('UPDATE orders SET tap_charge_id = ?, updated_at = ? WHERE order_number = ?')
    .bind(data.id, nowIso(), order.order_number).run();
  return json({ ok: true, order_number: order.order_number, transaction_url: data.transaction.url });
}

export async function handleTapVerify(request, env, url) {
  requireTap(env);
  const tapId = url.searchParams.get('tap_id') || '';
  const orderNumber = url.searchParams.get('order') || '';
  if (!tapId || !ORDER_NUMBER_RE.test(orderNumber)) throw new ApiError(400, 'bad_reference', 'بيانات التحقق غير مكتملة.');
  const order = await loadOrder(env.DB, orderNumber);

  // Idempotent: a confirmed order re-verified with the same charge changes nothing.
  if (order.order_status === 'confirmed' && order.tap_charge_id === tapId) {
    return json({ ok: true, order_number: orderNumber, order_status: 'confirmed', already_verified: true });
  }
  if (order.tap_charge_id && order.tap_charge_id !== tapId) {
    throw new ApiError(409, 'charge_mismatch', 'رقم عملية الدفع لا يطابق سجلّ هذا الطلب.');
  }

  let res, charge;
  try {
    res = await fetch(TAP_API_BASE + '/charges/' + encodeURIComponent(tapId), {
      headers: { Authorization: 'Bearer ' + env.TAP_SECRET_KEY },
    });
    charge = await res.json();
  } catch {
    throw new ApiError(502, 'tap_unreachable', 'تعذّر التحقق من حالة الدفع الآن، حاول تحديث الصفحة.');
  }
  if (!res.ok || !charge || !charge.id) {
    console.log('TAP_VERIFY_FAILED status=' + res.status);
    throw new ApiError(502, 'tap_verify_failed', 'تعذّر التحقق من حالة الدفع.');
  }

  // Full match before any write: order reference, amount and currency.
  const expected = order.total_price / 100;
  const matches =
    charge.metadata && charge.metadata.order_number === orderNumber &&
    Math.abs(Number(charge.amount) - expected) < 0.01 &&
    charge.currency === 'SAR';
  if (!matches) throw new ApiError(409, 'verification_mismatch', 'تعذّر التحقق من مطابقة بيانات الدفع لهذا الطلب.');

  const status = String(charge.status || '').toUpperCase();
  const t = nowIso();
  if (status === 'CAPTURED') {
    await env.DB.prepare("UPDATE orders SET order_status = 'confirmed', tap_charge_id = ?, updated_at = ? WHERE order_number = ?")
      .bind(tapId, t, orderNumber).run();
    await writeAudit(env.DB, { action: 'order.paid', entity: 'order', entityId: orderNumber, meta: { total_halala: order.total_price } });
    return json({ ok: true, order_number: orderNumber, order_status: 'confirmed' });
  }
  if (status === 'FAILED' || status === 'DECLINED' || status === 'CANCELLED') {
    await env.DB.prepare("UPDATE orders SET order_status = 'payment_failed', tap_charge_id = ?, updated_at = ? WHERE order_number = ?")
      .bind(tapId, t, orderNumber).run();
    return json({ ok: true, order_number: orderNumber, order_status: 'payment_failed' });
  }
  return json({ ok: true, order_number: orderNumber, order_status: 'payment_pending' });
}
