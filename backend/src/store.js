// Store: products and orders. Payment is by bank transfer only (no card gateway).
// - Prices come from the server catalog only. The browser never sends a price.
// - Money is stored in halalas.
// - Orders start as 'new'; the academy confirms the transfer manually.
import { ApiError, json, nowIso, readJson, toAsciiDigits } from './util.js';
import { hit } from './ratelimit.js';
import { ipHash } from './registrations.js';
import { writeAudit } from './audit.js';
import { normalizeMobile } from './validate.js';

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

  if (body.payment_method && body.payment_method !== 'bank_transfer') {
    errors.payment_method = 'طريقة الدفع المتاحة: التحويل البنكي فقط.';
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
      'bank_transfer', 'new', t, t
    )
    .run();
  await writeAudit(env.DB, { action: 'order.created', entity: 'order', entityId: orderNumber, meta: { total_halala: totalHalala }, ipHash: ip });

  return json({
    ok: true, order_number: orderNumber,
    subtotal_sar: totalHalala / 100, delivery_fee_sar: 0, amount_sar: totalHalala / 100,
    currency: 'SAR', payment_method: 'bank_transfer', items: lines,
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

