/* =====================================================================
   أكاديمية ليبرو — منطق مشترك لصفحات التسجيل والدفع
   ملاحظة أمنية: لا يوجد هنا أي مفتاح سري. المفتاح المنشور فقط،
   ويصل من الخادم عبر /api/config.
   ===================================================================== */

/** غيّر هذا الرابط بعد نشر الـ Worker. */
window.LIPRO_API = window.LIPRO_API || 'https://lipro-payments.YOUR-SUBDOMAIN.workers.dev';

(function () {
  'use strict';

  /* ---------------- المظهر (نفس سلوك الصفحة الرئيسية) ---------------- */
  const Theme = {
    init() {
      const wrap = document.getElementById('themeSwitch');
      if (!wrap) return;
      const btns = wrap.querySelectorAll('.theme__btn');
      const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
      let pref = document.documentElement.getAttribute('data-pref') || 'auto';

      const resolve = (p) => p === 'dark' ? 'dark' : p === 'light' ? 'light' : (mq && mq.matches ? 'dark' : 'light');

      const apply = (p, save) => {
        pref = p;
        document.documentElement.setAttribute('data-mode', resolve(p));
        document.documentElement.setAttribute('data-pref', p);
        btns.forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === p ? 'true' : 'false'));
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', resolve(p) === 'dark' ? '#03201C' : '#04322C');
        if (save) { try { localStorage.setItem('lipro_theme', p); } catch (e) {} }
      };

      btns.forEach((b) => b.addEventListener('click', () => apply(b.dataset.mode, true)));
      if (mq) {
        const on = () => { if (pref === 'auto') apply('auto', false); };
        mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on);
      }
      apply(pref, false);
    }
  };

  /* ---------------- أدوات ---------------- */
  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const arNum = (n) => {
    try { return new Intl.NumberFormat('ar-SA-u-nu-arab').format(n); }
    catch (e) { return String(n); }
  };

  /** يحسب العمر من تاريخ الميلاد (نفس منطق الخادم). */
  function ageFrom(v) {
    if (!v) return null;
    const d = new Date(v);
    if (isNaN(d.getTime())) return null;
    const n = new Date();
    let a = n.getFullYear() - d.getFullYear();
    const m = n.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && n.getDate() < d.getDate())) a--;
    return (a < 0 || a > 100) ? null : a;
  }

  function ageWord(a) {
    return a === 1 ? 'سنة' : a === 2 ? 'سنتان' : (a >= 3 && a <= 10) ? 'سنوات' : 'سنة';
  }

  /** تطبيع رقم الجوال السعودي — يقبل الأرقام العربية أيضًا. */
  function normMobile(v) {
    if (!v) return null;
    let d = String(v)
      .replace(/[\u0660-\u0669]/g, (x) => String(x.charCodeAt(0) - 0x0660))
      .replace(/[\u06F0-\u06F9]/g, (x) => String(x.charCodeAt(0) - 0x06F0))
      .replace(/\D/g, '');
    if (d.startsWith('00966')) d = d.slice(5);
    else if (d.startsWith('966')) d = d.slice(3);
    else if (d.startsWith('0')) d = d.slice(1);
    return /^5\d{8}$/.test(d) ? '0' + d : null;
  }

  /* ---------------- أحداث التحليلات ---------------- */
  // لا نرسل أي بيانات شخصية — أسماء أحداث ومعرّفات برامج فقط.
  function track(name, props) {
    const payload = props || {};
    try {
      if (typeof window.gtag === 'function') window.gtag('event', name, payload);
      if (Array.isArray(window.dataLayer)) window.dataLayer.push({ event: name, ...payload });
    } catch (e) {}
    document.dispatchEvent(new CustomEvent('lipro:' + name, { detail: payload }));
  }

  /* ---------------- طبقة الاتصال بالخادم ---------------- */
  const Api = {
    base() { return String(window.LIPRO_API || '').replace(/\/+$/, ''); },

    async req(path, opts) {
      const res = await fetch(this.base() + path, {
        headers: { 'Content-Type': 'application/json' },
        ...opts
      });
      let data = null;
      try { data = await res.json(); } catch (e) {}
      if (!res.ok) {
        const err = new Error((data && data.message) || 'تعذّر إتمام الطلب.');
        err.code = data && data.code;
        err.errors = data && data.errors;
        err.status = res.status;
        throw err;
      }
      return data;
    },

    config()               { return this.req('/api/config'); },
    createRegistration(b)  { return this.req('/api/registrations', { method: 'POST', body: JSON.stringify(b) }); },
    verify(b)              { return this.req('/api/payments/verify', { method: 'POST', body: JSON.stringify(b) }); },
    registration(n)        { return this.req('/api/registrations/' + encodeURIComponent(n)); }
  };

  /* ---------------- حفظ المسودة مؤقتًا ---------------- */
  // لا نحفظ شيئًا حساسًا بشكل دائم — sessionStorage يُمسح بإغلاق التبويب.
  const Draft = {
    KEY: 'lipro_reg_draft',
    save(o) { try { sessionStorage.setItem(this.KEY, JSON.stringify(o)); } catch (e) {} },
    load()  { try { return JSON.parse(sessionStorage.getItem(this.KEY) || 'null'); } catch (e) { return null; } },
    clear() { try { sessionStorage.removeItem(this.KEY); } catch (e) {} }
  };

  window.LiproCheckout = { Theme, $, $$, arNum, ageFrom, ageWord, normMobile, track, Api, Draft };
})();
