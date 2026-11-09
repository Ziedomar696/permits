# تصاريح وتفويضات مراسي

تصاريح العمل والتفويضات وتصاريح المحلات: تتسجل من صورة أو PDF أو يدوي، وتروح لمشرفي كل قطاع.

- `apps-script/` : ملفات Google Apps Script (Code.gs و Index.html).
- `index.html` : التطبيق اللي بيتفتح على الموبايل (بيفتح لينك الـ /exec جواه).

## التشغيل
1. Google Apps Script: الزق `Code.gs` و `Index` (HTML)، وفعّل Services ← Drive API.
2. Deploy ← New deployment ← Web app · Execute as: Me · Who has access: Anyone.
3. حط لينك الـ `/exec` في `APP_URL` جوه `index.html`.
4. افتح لينك GitHub Pages، وأول مرة سجّل نفسك مدير بكود التسجيل اللي في أول `Code.gs`.
