// Prints an SQL statement that creates the FIRST owner account.
// The password is read from the environment and is never written to disk or the repo.
//
//   LIPRO_OWNER_PASSWORD='<at least 12 characters>' \
//   node scripts/bootstrap-owner.mjs owner@example.com "الاسم الكامل"
//
// Run the printed SQL once in the D1 console (or `wrangler d1 execute lipro-db --remote --command "..."`).
// Then sign in and enrol MFA immediately. Delete the SQL output afterwards.
import { hashPassword } from '../src/auth.js';

const [email, fullName] = process.argv.slice(2);
const password = process.env.LIPRO_OWNER_PASSWORD || '';

if (!email || !fullName) {
  console.error('usage: LIPRO_OWNER_PASSWORD=... node scripts/bootstrap-owner.mjs <email> <full name>');
  process.exit(1);
}
if (password.length < 12) {
  console.error('LIPRO_OWNER_PASSWORD must be set and be at least 12 characters.');
  process.exit(1);
}

const hash = await hashPassword(password);
const esc = (s) => s.replace(/'/g, "''");
console.log(
  `INSERT INTO users (email, full_name, role, branch_id, password_hash) VALUES ('${esc(email.toLowerCase())}', '${esc(fullName)}', 'owner', NULL, '${hash}');`
);
