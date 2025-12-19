(function(){
  const DEFAULT_LANG = localStorage.getItem('lang') || 'en';
  const langSelectId = 'langSelect';

  function applyTranslations(dict){
    document.querySelectorAll('[data-i18n]')
      .forEach(el => {
        const key = el.getAttribute('data-i18n');
        const val = key.split('|').map(k => (dict[k] ?? '').trim()).find(Boolean) || el.textContent;
        if (typeof val === 'string' && val) el.textContent = val;
      });
    document.querySelectorAll('[data-i18n-placeholder]')
      .forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const val = dict[key];
        if (val) el.setAttribute('placeholder', val);
      });
  }

  async function loadLang(lang){
    try {
      const res = await fetch(`i18n/${lang}.json?v=${Date.now()}`);
      const dict = await res.json();
      // expose translator for JS-generated UI
      window.__i18n = { lang, dict, setLang: loadLang };
      window.__t = function(key, fallback){
        try { return (dict[key] ?? fallback ?? key); } catch { return fallback ?? key; }
      };
      applyTranslations(dict);
      localStorage.setItem('lang', lang);
      const select = document.getElementById(langSelectId);
      if (select && select.value !== lang) select.value = lang;
      document.dispatchEvent(new CustomEvent('i18n:loaded', { detail: { lang } }));
    } catch (e) { /* noop */ }
  }

  document.addEventListener('DOMContentLoaded', function(){
    const select = document.getElementById(langSelectId);
    const mobileSelect = document.getElementById('langSelectMobile');

    const initSelect = (el) => {
      if (!el) return;
      if (![...el.options].some(o => o.value === DEFAULT_LANG)) {
        el.value = 'en';
      } else {
        el.value = DEFAULT_LANG;
      }
      el.addEventListener('change', function(){ loadLang(this.value); });
    };

    initSelect(select);
    initSelect(mobileSelect);

    loadLang(DEFAULT_LANG);
  });
})();


