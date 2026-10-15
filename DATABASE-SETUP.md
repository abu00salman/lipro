# نشر قاعدة البيانات والخادم — دليل التشغيل

> ⚠️ **تنبيه أمني — اقرأ أولًا:** النسخة السابقة من هذا الدليل كانت تنشر مفتاح إدارة (`ADMIN_KEY`) وتعرض طريقة الدخول عبر `?key=` في الرابط.
> هذا يعني أن المفتاح **مكشوف** ويجب اعتباره مسرّبًا:
>
> 1. **ادخل إعدادات Worker في Cloudflare وألغِ/دوّر `ADMIN_KEY` فورًا** (Settings ← Variables and Secrets)، أو احذفه.
> 2. تحقق من سجل الوصول (Logs) لأي طلب إلى `/api/admin?key=` قبل التدوير.
> 3. لا تعِد استخدام القيمة القديمة في أي مكان.
>
> الإدارة الجديدة لا تستخدم أي مفتاح في الرابط؛ تعمل بتسجيل دخول + رمز تحقق (MFA) وصلاحيات حسب الدور والفرع.

الكود الكامل للخادم الجديد موجود في مجلد **`backend/`** (Cloudflare Worker + D1). التفاصيل التقنية والاختبارات في `backend/README.md`.

---

## ما الذي يتغيّر عند النشر؟

| | قبل | بعد |
|---|---|---|
| الكود | `worker-bundle.js` غير موجود في المستودع | `backend/src/` مع اختبارات |
| رقم التسجيل عند تعذّر الخادم | يُولَّد في المتصفح ويُعرض كأنه مقبول | **لا يُولَّد** — تظهر رسالة واضحة وزر واتساب |
| تكرار الإرسال | قد يُنشئ تسجيلين | مفتاح `Idempotency-Key` يمنع التكرار |
| إثبات الدفع | الإيصال كافٍ | لا يُعتمد إلا بعد مطابقة المرجع والمبلغ مع كشف البنك |
| الإدارة | `?key=` في الرابط | تسجيل دخول + MFA + صلاحيات حسب الدور والفرع |
| البحث برقم الجوال عن تسجيل سابق | متاح لأي شخص | **أُوقف** (كان يكشف بيانات أولياء الأمور) |
| `/api/orders`، `/api/payments/*` | موجودة في الخادم المنشور (غير مرئية هنا) | **تُرجع 501** في هذا الإصدار |

> ⚠️ **لا تستبدل الخادم المنشور حاليًا قبل:** (أ) نسخة احتياطية من قاعدة `lipro-db`، و(ب) موافقتك على إيقاف `/api/orders` و`/api/payments/*` مؤقتًا، أو نقلها.

---

## الخطوة ١ — إنشاء قاعدة البيانات (أو استخدام القائمة)

1. Cloudflare ← **Workers & Pages** ← تبويب **D1 SQL Database** ← **Create Database** ← الاسم `lipro-db`.
2. **قبل أي تغيير على قاعدة موجودة:** Export/Backup من صفحة القاعدة.

## الخطوة ٢ — إنشاء الجداول

من تبويب **Console** في `lipro-db` الصِق محتوى `backend/migrations/0001_init.sql` ثم `backend/migrations/0002_coaching.sql` (بالترتيب) ثم **Execute** لكل واحد.
أو من سطر الأوامر: `cd backend && npx wrangler d1 migrations apply lipro-db --remote` (بعد تعديل `database_id` في `wrangler.toml`).

تحقق: `SELECT name FROM sqlite_master WHERE type='table';` يجب أن تظهر جداول `registrations` و`payments` و`users` و`audit_log` وغيرها.

## الخطوة ٣ — إنشاء الـ Worker ونشر الكود

- **الطريقة الموصى بها:** `cd backend && npx wrangler deploy` — محرر الواجهة في Cloudflare يقبل ملفًا واحدًا فقط، والخادم الجديد من عدة ملفات.
- الطريقة اليدوية غير مدعومة لهذا الإصدار.

## الخطوة ٤ — الربط والإعدادات (Bindings & Secrets)

| النوع | الاسم | القيمة |
|---|---|---|
| D1 binding | `DB` | قاعدة `lipro-db` |
| Text variable | `ALLOWED_ORIGINS` | `https://liproacademy.com,https://www.liproacademy.com` |
| Secret | `MFA_ENCRYPTION_KEY` | 32 بايت عشوائية بصيغة base64 — مثال توليد: `openssl rand -base64 32` |
| Secret | `SESSION_SECRET` | 32 حرفًا عشوائيًا على الأقل — `openssl rand -base64 48` |
| Secret | `IP_HASH_SALT` | نص عشوائي — `openssl rand -hex 16` |
| Secret | `RESEND_API_KEY` | (اختياري) مفتاح Resend لإرسال رموز الدخول بالبريد |
| Variable | `MAIL_FROM` | (اختياري) مرسل من نطاق تحققت منه في Resend، مثل `Lipro <no-reply@liproacademy.com>` |

> القيم تُولَّد **على جهازك** ولا تُكتب في المستودع ولا في المحادثات. عند تغيير `MFA_ENCRYPTION_KEY` تصبح أسرار MFA الحالية غير قابلة للفك، لذا لا تغيّره بعد التفعيل.

## الخطوة ٥ — إنشاء أول حساب مالك

```bash
cd backend
LIPRO_OWNER_PASSWORD='<كلمة مرور لا تقل عن 12 حرفًا>' node scripts/bootstrap-owner.mjs owner@liproacademy.com "الاسم الكامل"
```

انسخ جملة `INSERT` الناتجة وشغّلها مرة واحدة في Console، ثم احذف الناتج. ادخل إلى لوحة الإدارة وفعّل MFA فورًا.

## الخطوة ٦ — ربط الموقع

الموقع يستدعي الخادم عبر `window.LIPRO_API` في `assets/lipro-checkout.js`. عدّله إذا تغيّر اسم الـ Worker أو نطاقه. لا يوجد مفتاح سري في الواجهة.

## الخطوة ٧ — التحقق

| الرابط | المتوقع |
|---|---|
| `GET /api/health` | `{"ok":true,...}` |
| `GET /api/config` | 6 فروع و4 برامج بأسعار بالريال |
| `GET /api/admin/me` بدون توكن | `401` |
| `GET /api/admin/registrations?key=...` | `401` (المفاتيح في الرابط لم تعد تعمل) |
| صفحة `register/` | تسجيل يُنشئ رقمًا من الخادم، أو رسالة "غير متاح" إن تعذّر الخادم |

---

## للتجربة المحلية فقط

```bash
cd backend
npm test                                             # 44 اختبار: منطق + تكامل على SQLite
npx wrangler d1 execute lipro-db --local --file=migrations/0001_init.sql
npx wrangler d1 execute lipro-db --local --file=seed/demo-data.sql   # بيانات خيالية فقط
```

لا تشغّل ملف `seed/demo-data.sql` على قاعدة الإنتاج أبدًا.
