-- Fictional demo data for LOCAL development only.
-- Never run this against the production database. All names, mobiles and emails are invented.
-- Local use:  wrangler d1 execute lipro-db --local --file=seed/demo-data.sql

INSERT INTO guardians (id, full_name, mobile, email) VALUES
  (1, 'ولي أمر تجريبي الأول', '0500000001', 'demo-guardian-1@example.test'),
  (2, 'ولي أمر تجريبي الثاني', '0500000002', NULL);

INSERT INTO players (id, guardian_id, branch_id, full_name, dob, position, status) VALUES
  (1, 1, 'jizan', 'لاعب تجريبي الأول', '2016-02-10', 'striker', 'registered'),
  (2, 1, 'jizan', 'لاعب تجريبي الثاني', '2014-07-21', 'midfielder', 'registered'),
  (3, 2, 'khamis', 'لاعب تجريبي الثالث', '2017-11-05', 'goalkeeper', 'registered');

INSERT INTO registrations (id, registration_no, idempotency_key, request_hash, player_id, guardian_id, branch_id, program_id, amount_halala, status, consent_version, consent_at) VALUES
  (1, 'LPA-2026-KQ7XD', 'demo-key-0000000000000001', 'demo', 1, 1, 'jizan', 'monthly', 30000, 'awaiting_payment', '2026-10-01', '2026-10-10T08:00:00.000Z'),
  (2, 'LPA-2026-Z3PWN', 'demo-key-0000000000000002', 'demo', 2, 1, 'jizan', 'quarter', 90000, 'payment_claimed', '2026-10-01', '2026-10-11T08:00:00.000Z'),
  (3, 'LPA-2026-B6HRT', 'demo-key-0000000000000003', 'demo', 3, 2, 'khamis', 'monthly', 30000, 'paid', '2026-10-01', '2026-10-12T08:00:00.000Z');

INSERT INTO payments (registration_id, method, amount_halala, bank_reference, transfer_date, status) VALUES
  (2, 'bank_transfer', 90000, 'DEMO-REF-0002', '2026-10-11', 'claimed');

INSERT INTO payments (registration_id, method, amount_halala, bank_reference, transfer_date, status, reconciled_ref, reconciled_halala, reviewed_at) VALUES
  (3, 'bank_transfer', 30000, 'DEMO-REF-0003', '2026-10-12', 'approved', 'DEMO-REF-0003', 30000, '2026-10-12T09:00:00.000Z');
