import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call } from './helpers.js';


const order = (overrides = {}) => ({
  items: [{ product_id: 'jersey_official', variant_key: 'm', qty: 2, price_sar: 1 }], // client price must be ignored
  customer_name: 'عبدالله ناصر الشهري',
  customer_mobile: '0551234567',
  city: 'جازان',
  district: 'السويس',
  address: 'حي السويس، شارع الأمير محمد',
  terms_accepted: true,
  transfer_confirmed: true,
  payment_method: 'bank_transfer',
  ...overrides,
});

test('store config serves the catalog with SAR prices', async () => {
  const env = makeEnv();
  const cfg = await call(env, 'GET', '/api/config');
  assert.equal(cfg.data.products.length, 1);
  assert.equal(cfg.data.products[0].price_sar, 95);
  assert.equal(cfg.data.products[0].variants.length, 4);
});

test('bank-transfer order is priced on the server, stored in halalas, and starts as new', async () => {
  const env = makeEnv();
  const res = await call(env, 'POST', '/api/orders', { body: order() });
  assert.equal(res.status, 201);
  assert.equal(res.data.amount_sar, 190);
  assert.match(res.data.order_number, /^LPS-\d{4}-[A-Z0-9]{5,10}$/);
  const row = env.DB.query('SELECT total_price, order_status, payment_gateway FROM orders')[0];
  assert.deepEqual(row, { total_price: 19000, order_status: 'new', payment_gateway: 'bank_transfer' });
});

test('unknown products and bad variants are rejected', async () => {
  const env = makeEnv();
  assert.equal((await call(env, 'POST', '/api/orders', { body: order({ items: [{ product_id: 'free_thing', qty: 1 }] }) })).status, 400);
  assert.equal((await call(env, 'POST', '/api/orders', { body: order({ items: [{ product_id: 'jersey_official', variant_key: 'xxl' }] }) })).status, 400);
  assert.equal(env.DB.query('SELECT COUNT(*) AS n FROM orders')[0].n, 0);
  // The store page sends transfer_confirmed:false; the transfer is confirmed later on the result page.
  assert.equal((await call(env, 'POST', '/api/orders', { body: order({ transfer_confirmed: false }) })).status, 201);
});

test('order status is public but holds no contact details', async () => {
  const env = makeEnv();
  const created = await call(env, 'POST', '/api/orders', { body: order() });
  const res = await call(env, 'GET', `/api/orders/${created.data.order_number}`);
  assert.equal(res.status, 200);
  assert.equal(res.data.order.order_status, 'new');
  assert.equal(JSON.stringify(res.data).includes('0551234567'), false);
  assert.equal((await call(env, 'GET', '/api/orders/LPS-2026-ZZZZZ')).status, 404);
});

test('card and other electronic payment methods are refused', async () => {
  const env = makeEnv();
  const res = await call(env, 'POST', '/api/orders', { body: order({ payment_method: 'tap' }) });
  assert.equal(res.status, 422);
  assert.ok(res.data.errors.payment_method);
  assert.equal(env.DB.query('SELECT COUNT(*) AS n FROM orders')[0].n, 0);
});

test('no electronic payment endpoints exist', async () => {
  const env = makeEnv();
  assert.equal((await call(env, 'POST', '/api/payments/tap/charge', { body: {} })).status, 404);
  assert.equal((await call(env, 'GET', '/api/payments/tap/verify?tap_id=x&order=LPS-2026-ABCDE')).status, 404);
  assert.equal((await call(env, 'POST', '/api/registrations/tap/charge', { body: {} })).status, 404);
});
