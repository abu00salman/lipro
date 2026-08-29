/* =====================================================================
   أكاديمية ليبرو — منطق مشترك لصفحات التسجيل والدفع
   ملاحظة أمنية: لا يوجد هنا أي مفتاح سري. المفتاح المنشور فقط،
   ويصل من الخادم عبر /api/config.
   ===================================================================== */

/** غيّر هذا الرابط بعد نشر الـ Worker. */
/**
 * رابط الخادم — عدّله بعد نشر الـ Worker على Cloudflare.
 * التعليمات كاملة في DATABASE-SETUP.md
 * الرابط الحقيقي يظهر أعلى صفحة الـ Worker في لوحة Cloudflare،
 * بصيغة: https://lipro-backend.YOUR-SUBDOMAIN.workers.dev
 */
window.LIPRO_API = window.LIPRO_API || 'https://lipro-backend.YOUR-SUBDOMAIN.workers.dev';

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
    registration(n)        { return this.req('/api/registrations/' + encodeURIComponent(n)); },
    lookup(mobile)          { return this.req('/api/lookup/' + encodeURIComponent(mobile)); },
    createOrder(b)          { return this.req('/api/orders', { method: 'POST', body: JSON.stringify(b) }); },
    order(n)                { return this.req('/api/orders/' + encodeURIComponent(n)); },
    createTapCharge(orderNumber) { return this.req('/api/payments/tap/charge', { method: 'POST', body: JSON.stringify({ order_number: orderNumber }) }); },
    verifyTapCharge(tapId, orderNumber) { return this.req('/api/payments/tap/verify?tap_id=' + encodeURIComponent(tapId) + '&order=' + encodeURIComponent(orderNumber)); }
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


/* =====================================================================
   مولّد صورة الإيصال — يرسم بطاقة تسجيل بهوية الأكاديمية
   ويتيح حفظها في الصور أو مشاركتها مباشرة على واتساب.
   ===================================================================== */
(function () {
  'use strict';

  var SHIELD = 'data:image/png;base64,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';

  var C = {
    pitch:'#04322C', pitch2:'#0A3F37', gold:'#F5B325',
    white:'#FFFFFF', mut:'#9FC0B8', line:'rgba(255,255,255,0.14)',
    teal:'#17A88F'
  };

  function loadImg(src) {
    return new Promise(function (res, rej) {
      var i = new Image();
      i.onload = function () { res(i); };
      i.onerror = rej;
      i.src = src;
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  var arNum = function (n) {
    try { return new Intl.NumberFormat('ar-SA-u-nu-arab').format(n); }
    catch (e) { return String(n); }
  };

  /**
   * يرسم بطاقة الإيصال ويُعيد Blob بصيغة PNG.
   * data = { ref, player, program, branch, amount, paid, dob, guardian }
   */
  async function buildReceipt(data) {
    var W = 1080, H = 1350;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');

    /* الخلفية */
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, C.pitch2);
    g.addColorStop(1, C.pitch);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    /* خطوط ملعب خفيفة */
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(W / 2, 300, 240, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.strokeRect(-120, 620, 320, 400);
    ctx.strokeRect(W - 200, 620, 320, 400);

    /* شريط ذهبي علوي */
    ctx.fillStyle = C.gold;
    ctx.fillRect(0, 0, W, 10);

    /* الشعار */
    try {
      var logo = await loadImg(SHIELD);
      var lh = 150, lw = logo.width * lh / logo.height;
      ctx.drawImage(logo, W / 2 - lw / 2, 70, lw, lh);
    } catch (e) { /* الصورة تعمل بلا شعار */ }

    ctx.textAlign = 'center';
    ctx.direction = 'rtl';

    /* اسم الأكاديمية */
    ctx.fillStyle = C.white;
    ctx.font = '700 52px "Changa", "Tahoma", sans-serif';
    ctx.fillText('أكاديمية ليبرو الرياضية', W / 2, 285);

    /* حالة العملية */
    var okColor = data.paid ? C.teal : C.gold;
    var okText  = data.paid ? 'تم الدفع بنجاح' : 'تم استلام الطلب';
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    roundRect(ctx, W / 2 - 190, 320, 380, 62, 31); ctx.fill();
    ctx.strokeStyle = okColor; ctx.lineWidth = 2;
    roundRect(ctx, W / 2 - 190, 320, 380, 62, 31); ctx.stroke();
    ctx.fillStyle = okColor;
    ctx.font = '700 32px "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText('✓  ' + okText, W / 2, 362);

    /* رقم التسجيل */
    ctx.fillStyle = C.mut;
    ctx.font = '400 26px "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText('رقم التسجيل', W / 2, 452);
    ctx.fillStyle = C.gold;
    ctx.font = '700 64px "Changa", "Tahoma", sans-serif';
    ctx.direction = 'ltr';
    ctx.fillText(data.ref || '—', W / 2, 522);
    ctx.direction = 'rtl';

    /* بطاقة التفاصيل */
    var bx = 80, by = 580, bw = W - 160;
    var rows = [];
    if (data.player)   rows.push(['اللاعب', data.player]);
    if (data.dob) {
      var dparts = String(data.dob).split('-');
      var dobTxt = data.dob;
      try {
        dobTxt = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-arab',
          { day:'numeric', month:'long', year:'numeric' })
          .format(new Date(data.dob + 'T12:00:00'));
      } catch (e) {}
      rows.push(['تاريخ الميلاد', dobTxt]);
    }
    if (data.branch)   rows.push(['الفرع', data.branch]);
    if (data.program)  rows.push(['البرنامج', data.program]);
    if (data.guardian) rows.push(['ولي الأمر', data.guardian]);

    var rowH = 76;
    var bh = rows.length * rowH + 130;

    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    roundRect(ctx, bx, by, bw, bh, 28); ctx.fill();
    ctx.strokeStyle = C.line; ctx.lineWidth = 2;
    roundRect(ctx, bx, by, bw, bh, 28); ctx.stroke();

    var y = by + 62;
    rows.forEach(function (r, i) {
      ctx.textAlign = 'right';
      ctx.fillStyle = C.mut;
      ctx.font = '400 27px "IBM Plex Sans Arabic", sans-serif';
      ctx.fillText(r[0], bx + bw - 40, y);

      ctx.textAlign = 'left';
      ctx.fillStyle = C.white;
      ctx.font = '600 30px "IBM Plex Sans Arabic", sans-serif';
      var val = String(r[1]);
      if (val.length > 26) val = val.slice(0, 25) + '…';
      ctx.fillText(val, bx + 40, y);

      if (i < rows.length - 1) {
        ctx.strokeStyle = 'rgba(255,255,255,0.09)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx + 40, y + 26); ctx.lineTo(bx + bw - 40, y + 26); ctx.stroke();
      }
      y += rowH;
    });

    /* المبلغ */
    ctx.strokeStyle = C.line; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx + 40, y + 4); ctx.lineTo(bx + bw - 40, y + 4); ctx.stroke();

    ctx.textAlign = 'right';
    ctx.fillStyle = C.mut;
    ctx.font = '400 28px "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText(data.paid ? 'المبلغ المدفوع' : 'المبلغ المطلوب', bx + bw - 40, y + 62);

    ctx.textAlign = 'left';
    ctx.fillStyle = C.gold;
    ctx.font = '700 46px "Changa", "Tahoma", sans-serif';
    // نرسم الرقم ثم الوحدة يدويًا حتى لا يعكسهما اتجاه RTL
    var amt = arNum(data.amount);
    var unit = ' ريال';
    var wAmt = ctx.measureText(amt).width;
    ctx.direction = 'ltr';
    ctx.fillText(amt, bx + 40, y + 66);
    ctx.font = '600 32px "IBM Plex Sans Arabic", sans-serif';
    ctx.direction = 'rtl';
    ctx.fillText(unit, bx + 40 + wAmt + 8, y + 62);

    /* التاريخ وشمول الضريبة */
    ctx.textAlign = 'center';
    ctx.fillStyle = C.mut;
    ctx.font = '400 24px "IBM Plex Sans Arabic", sans-serif';
    var d = new Date();
    var ds = '';
    try {
      ds = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-arab',
        { day:'numeric', month:'long', year:'numeric' }).format(d);
    } catch (e) { ds = d.toLocaleDateString(); }
    ctx.fillText('شامل ضريبة القيمة المضافة  ·  ' + ds, W / 2, by + bh + 54);

    /* التذييل */
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, H - 120, W, 120);
    ctx.fillStyle = C.gold;
    ctx.font = '700 32px "Changa", "Tahoma", sans-serif';
    ctx.direction = 'ltr';
    ctx.fillText('liproacademy.com', W / 2, H - 68);
    ctx.direction = 'rtl';
    ctx.fillStyle = C.mut;
    ctx.font = '400 25px "IBM Plex Sans Arabic", sans-serif';
    ctx.direction = 'ltr';
    ctx.fillText('0530634750', W / 2, H - 28);
    ctx.direction = 'rtl';

    return new Promise(function (res) {
      cv.toBlob(function (b) { res(b); }, 'image/png', 0.95);
    });
  }

  /** ينزّل الصورة — على الآيفون تُحفظ في الصور. */
  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 2000);
  }

  /**
   * يشارك الصورة عبر قائمة المشاركة (واتساب من ضمنها).
   * يعيد 'shared' أو 'downloaded' أو 'failed'.
   */
  async function shareImage(blob, name, text) {
    var file = new File([blob], name, { type: 'image/png' });

    // واجهة المشاركة تدعم الملفات على iOS و Android الحديثين
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: text || '' });
        return 'shared';
      } catch (e) {
        // المستخدم ألغى — لا نعتبره فشلًا
        if (e && e.name === 'AbortError') return 'cancelled';
      }
    }
    // بديل: تنزيل الصورة ليرفقها بنفسه
    downloadBlob(blob, name);
    return 'downloaded';
  }

  window.LiproReceipt = { build: buildReceipt, share: shareImage, download: downloadBlob };
})();
