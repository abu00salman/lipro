/**
 * برامج أكاديمية ليبرو — المصدر الموثوق الوحيد للأسعار.
 *
 * ⚠️ لا يُقرأ السعر أبدًا من المتصفح. الواجهة تعرض ما يصلها من هنا،
 *    والخادم يعيد احتساب المبلغ من هذا الملف قبل إنشاء أي دفعة.
 *
 * لتعديل الأسعار: غيّر القيم هنا ثم أعد النشر:
 *    npx wrangler deploy
 *
 * ⚠️ جميع الأسعار **شاملة ضريبة القيمة المضافة (١٥٪)**.
 *    السعر المعروض هو ما يدفعه ولي الأمر نهائيًا بلا إضافات.
 *
 * price_sar  = السعر بالريال شاملًا الضريبة (للعرض والتحرير البشري)
 * السعر بالهللات يُحسب تلقائيًا (× 100) — ميسر يستقبل الوحدة الصغرى.
 */

/** نسبة ضريبة القيمة المضافة في السعودية. */
export const VAT_RATE = 0.15;

/** الأسعار مُعلنة شاملة الضريبة. */
export const VAT_INCLUDED = true;

export const PROGRAMS = [
  {
    id: 'monthly',
    name_ar: 'اشتراك شهري',
    name_en: 'Monthly Training',
    desc_ar: 'تدريب ٣ أيام في الأسبوع لمدة شهر كامل، مع متابعة فنية وبدنية.',
    price_sar: 350,
    duration_ar: 'شهر واحد',
    duration_en: '1 Month',
    age_group_ar: 'من ٥ إلى ١٨ سنة',
    schedule_ar: '٣ أيام أسبوعيًا',
    includes_ar: ['تدريب ٣ أيام أسبوعيًا', 'متابعة فنية وبدنية', 'مباريات داخلية'],
    badge_ar: null,
    active: true,
    sort: 1
  },
  {
    id: 'quarter',
    name_ar: 'اشتراك ٣ شهور',
    name_en: '3 Months',
    desc_ar: 'ثلاثة شهور متصلة بسعر أوفر، مع أولوية الترشيح لتجارب الأندية.',
    price_sar: 900,
    duration_ar: '٣ شهور',
    duration_en: '3 Months',
    age_group_ar: 'من ٥ إلى ١٨ سنة',
    schedule_ar: '٣ أيام أسبوعيًا',
    includes_ar: ['كل مزايا الاشتراك الشهري', 'أولوية تجارب الأندية', 'توفير ١٥٠ ريال'],
    badge_ar: 'الأكثر طلبًا',
    active: true,
    sort: 2
  },
  {
    id: 'half_year',
    name_ar: 'اشتراك ٦ شهور',
    name_en: '6 Months',
    desc_ar: 'موسم كامل تقريبًا، يشمل المشاركة في البطولات والمعسكرات.',
    price_sar: 1650,
    duration_ar: '٦ شهور',
    duration_en: '6 Months',
    age_group_ar: 'من ٥ إلى ١٨ سنة',
    schedule_ar: '٣ أيام أسبوعيًا',
    includes_ar: ['كل مزايا الـ ٣ شهور', 'مشاركة في البطولات', 'معسكرات إعدادية'],
    badge_ar: 'أفضل قيمة',
    active: true,
    sort: 3
  }
];

/** الفروع — تُعرض في نموذج التسجيل. */
export const BRANCHES = [
  { id: 'jizan',   name_ar: 'ليبرو جيزان',       active: true },
  { id: 'bish',    name_ar: 'ليبرو بيش',          active: true },
  { id: 'khamis',  name_ar: 'ليبرو خميس مشيط',   active: true },
  { id: 'madaya',  name_ar: 'ليبرو المضايا',      active: true },
  { id: 'mataan',  name_ar: 'ليبرو المطعن',       active: true },
  { id: 'aliyah',  name_ar: 'ليبرو العالية',      active: true }
];

/**
 * يفصل السعر الشامل إلى صافٍ + ضريبة (للإيصال فقط).
 * مثال: ٣٥٠ شاملة ← صافي ٣٠٤٫٣٥ + ضريبة ٤٥٫٦٥
 */
export function vatBreakdown(priceSar) {
  var net = priceSar / (1 + VAT_RATE);
  return {
    total: priceSar,
    net: Math.round(net * 100) / 100,
    vat: Math.round((priceSar - net) * 100) / 100
  };
}

/** السعر بالهللات — الوحدة التي يستقبلها ميسر. */
export function priceInHalalas(program) {
  return Math.round(program.price_sar * 100);
}

/** يُرجع برنامجًا فعّالًا بمعرّفه، أو null. */
export function findActiveProgram(id) {
  return PROGRAMS.find((p) => p.id === id && p.active) || null;
}

export function findBranch(id) {
  return BRANCHES.find((b) => b.id === id && b.active) || null;
}

/** نسخة مبسّطة تُرسل للواجهة (لا تحتوي شيئًا حساسًا). */
export function publicPrograms() {
  return PROGRAMS.filter((p) => p.active)
    .sort((a, b) => a.sort - b.sort)
    .map((p) => ({
      id: p.id,
      name: p.name_ar,
      name_en: p.name_en,
      desc: p.desc_ar,
      price_sar: p.price_sar,
      duration: p.duration_ar,
      age_group: p.age_group_ar,
      schedule: p.schedule_ar,
      includes: p.includes_ar,
      badge: p.badge_ar,
      vat_included: VAT_INCLUDED,
      vat: vatBreakdown(p.price_sar)
    }));
}

export function publicBranches() {
  return BRANCHES.filter((b) => b.active).map((b) => ({ id: b.id, name: b.name_ar }));
}
