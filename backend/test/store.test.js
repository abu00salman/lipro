import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call } from './helpers.js';

const ORIGIN = 'https://liproacademy.com';
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

/** Replaces fetch for Tap calls only. Restores it after the test. */
function stubTap(handler) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith('https://api.tap.company/')) return real(url, init);
    const r = await handler(String(url), init);
    return new Response(JSON.stringify(r.body), { status: r.status || 200, headers: { 'Content-Type': 'application/json' } });
  };
  return () => { globalThis.fetch = real; };
}

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

test('unknown products, bad variants and missing confirmation are rejected', async () => {
  const env = makeEnv();
  assert.equal((await call(env, 'POST', '/api/orders', { body: order({ items: [{ product_id: 'free_thing', qty: 1 }] }) })).status, 400);
  assert.equal((await call(env, 'POST', '/api/orders', { body: order({ items: [{ product_id: 'jersey_official', variant_key: 'xxl' }] }) })).status, 400);
  const noConfirm = await call(env, 'POST', '/api/orders', { body: order({ transfer_confirmed: false }) });
  assert.equal(noConfirm.status, 422);
  assert.ok(noConfirm.data.errors.transfer_confirmed);
  assert.equal(env.DB.query('SELECT COUNT(*) AS n FROM orders')[0].n, 0);
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

test('Tap: charge amount comes from our record, and the browser gets a transaction URL', async () => {
  const env = makeEnv();
  env.TAP_SECRET_KEY = 'sk_test_fake_for_tests_only';
  const created = await call(env, 'POST', '/api/orders', { body: order({ payment_method: 'tap', transfer_confirmed: undefined }) });
  let sent;
  const restore = stubTap(async (url, init) => {
    sent = JSON.parse(init.body);
    return { body: { id: 'chg_test_1', transaction: { url: 'https://checkout.tap.test/abc' } } };
  });
  try {
    const res = await call(env, 'POST', '/api/payments/tap/charge', { body: { order_number: created.data.order_number, amount: 1 }, headers: { Origin: ORIGIN } });
    assert.equal(res.status, 200);
    assert.equal(res.data.transaction_url, 'https://checkout.tap.test/abc');
    assert.equal(sent.amount, 190, 'amount from the order record, not from the request');
    assert.equal(sent.metadata.order_number, created.data.order_number);
  } finally { restore(); }
  assert.equal(env.DB.query('SELECT tap_charge_id FROM orders')[0].tap_charge_id, 'chg_test_1');
});

test('Tap: an order is confirmed only after server-side verification, and re-verify is idempotent', async () => {
  const env = makeEnv();
  env.TAP_SECRET_KEY = 'sk_test_fake_for_tests_only';
  const created = await call(env, 'POST', '/api/orders', { body: order({ payment_method: 'tap', transfer_confirmed: undefined }) });
  env.DB.prepare("UPDATE orders SET tap_charge_id = 'chg_ok' WHERE order_number = ?").bind(created.data.order_number).run();
  const restore = stubTap(async () => ({
    body: { id: 'chg_ok', status: 'CAPTURED', amount: 190, currency: 'SAR', metadata: { order_number: created.data.order_number } },
  }));
  try {
    const q = `/api/payments/tap/verify?tap_id=chg_ok&order=${created.data.order_number}`;
    const first = await call(env, 'GET', q);
    assert.equal(first.data.order_status, 'confirmed');
    const second = await call(env, 'GET', q);
    assert.equal(second.data.already_verified, true);
  } finally { restore(); }
});

test('Tap: a charge for a different amount or order never confirms the order', async () => {
  const env = makeEnv();
  env.TAP_SECRET_KEY = 'sk_test_fake_for_tests_only';
  const created = await call(env, 'POST', '/api/orders', { body: order({ payment_method: 'tap', transfer_confirmed: undefined }) });
  env.DB.prepare("UPDATE orders SET tap_charge_id = 'chg_bad' WHERE order_number = ?").bind(created.data.order_number).run();
  const restore = stubTap(async () => ({
    body: { id: 'chg_bad', status: 'CAPTURED', amount: 1, currency: 'SAR', metadata: { order_number: created.data.order_number } },
  }));
  try {
    const res = await call(env, 'GET', `/api/payments/tap/verify?tap_id=chg_bad&order=${created.data.order_number}`);
    assert.equal(res.status, 409);
    assert.equal(res.data.code, 'verification_mismatch');
  } finally { restore(); }
  assert.equal(env.DB.query('SELECT order_status FROM orders')[0].order_status, 'payment_pending');
});

test('Tap is refused without a configured secret, and a failed Tap call leaves no charge id', async () => {
  const env = makeEnv();
  const created = await call(env, 'POST', '/api/orders', { body: order({ payment_method: 'tap', transfer_confirmed: undefined }) });
  const noKey = await call(env, 'POST', '/api/payments/tap/charge', { body: { order_number: created.data.order_number } });
  assert.equal(noKey.status, 500);
  assert.equal(noKey.data.code, 'tap_not_configured');

  env.TAP_SECRET_KEY = 'sk_test_fake_for_tests_only';
  const restore = stubTap(async () => ({ status: 400, body: { errors: [{ code: 'x' }] } }));
  try {
    const res = await call(env, 'POST', '/api/payments/tap/charge', { body: { order_number: created.data.order_number } });
    assert.equal(res.status, 502);
  } finally { restore(); }
  assert.equal(env.DB.query('SELECT tap_charge_id FROM orders')[0].tap_charge_id, null);
});
