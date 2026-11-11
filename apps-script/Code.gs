/**
 * تصاريح وتفويضات مراسي — توزيع على مشرفي القطاعات
 * التشغيل:
 *  1) Services ← Drive API ← Add (لقراءة الصور والـ PDF تلقائيًا).
 *  2) Deploy ← New deployment ← Web app (Execute as: Me · Who has access: Anyone).
 *  3) افتح اللينك: هيطلب كود التسجيل (SETUP_CODE تحت) واسمك واسم مستخدم وباسورد، وتبقى مدير النظام.
 *     الكود بيشتغل بس لما مايكونش فيه أي مدير.
 *  4) من شاشة «الحسابات» جوه البرنامج: تعمل الحسابات وتحدد صلاحية وقطاعات كل واحد.
 */
var SETUP_CODE = 'MRS-4826';

var APP_TITLE = 'تصاريح وتفويضات مراسي';
var TZ = 'Africa/Cairo';

var SCHEMA = {
  Users: ['username', 'name', 'role', 'sectors', 'hash', 'salt', 'active', 'createdAt'],
  Sectors: ['id', 'name', 'kind', 'keywords'],
  Docs: ['id', 'createdAt', 'createdBy', 'createdByName', 'type', 'refNo', 'sector', 'unit', 'party', 'contact',
    'from', 'to', 'title', 'description', 'labor', 'people', 'vehicles', 'fileId', 'fileName', 'fileMime',
    'notes', 'status', 'cancelReason', 'updatedAt'],
  Acks: ['docId', 'username', 'name', 'at']
};

var TYPES = {
  unit: 'تصريح عمل وحدة',
  project: 'تصريح عمل مشروعات',
  facility: 'تصريح عمل مؤقت - المرافق',
  delegation: 'تفويض',
  retail: 'تصريح محلات',
  other: 'أخرى'
};

var ROLES = { admin: 'مدير النظام', entry: 'إدخال بيانات', supervisor: 'مشرف قطاع', emaar: 'مشرف أمن إعمار' };

var DEFAULT_SECTORS = [
  ['1', 'Arezzo', 'سكني', 'arezzo, اريزو'],
  ['2', 'Verona', 'سكني', 'verona, فيرونا'],
  ['3', 'Isola', 'سكني', 'isola, ايزولا'],
  ['4', 'Veneto', 'سكني', 'veneto, فينيتو'],
  ['5', 'Catania', 'سكني', 'catania, كتانيا, كاتانيا'],
  ['6', 'Greek & Riva Lagoons', 'سكني', 'greek, riva lagoon, riva lagoons, جريك'],
  ['7', 'Lea & Faya', 'سكني', 'lea, faya'],
  ['8', 'Skaia & Altea', 'سكني', 'skaia, altea'],
  ['9', 'Riva Views', 'سكني', 'riva views, riva view'],
  ['10', 'Riva & Salerno', 'سكني', 'riva, salerno, سالرنو'],
  ['11', 'Blanca', 'سكني', 'blanca, بلانكا'],
  ['12', 'Valencia', 'سكني', 'valencia, فالنسيا'],
  ['13', 'Vectoria', 'سكني', 'vectoria, victoria, فيكتوريا'],
  ['14', 'Verdi', 'سكني', 'verdi, فيردي'],
  ['15', 'Marassi Bay', 'سكني', 'marassi bay'],
  ['16', 'Safi Sands', 'سكني', 'safi, safi sands'],
  ['17', 'Celia', 'سكني', 'celia, سيليا'],
  ['18', 'Marina Residences', 'سكني', 'marina residences, marina res'],
  ['19', 'Marina 2 & Marina West', 'سكني', 'marina 2, marina west'],
  ['20', 'Marina Front & Views', 'سكني', 'marina front, marina views'],
  ['c1', 'Marina (تجاري)', 'تجاري', 'marina, المارينا'],
  ['c2', 'Promenade / Vida', 'تجاري', 'promenade, vida, بروميناد']
];

// ===== التشغيل =====
function doGet() {
  ensure_();
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function ensure_() {
  var p = PropertiesService.getScriptProperties();
  if (p.getProperty('READY') === '2') return;
  Object.keys(SCHEMA).forEach(function (n) { sheet_(n); });
  if (!rows_('Sectors').length) DEFAULT_SECTORS.forEach(function (s) {
    append_('Sectors', { id: s[0], name: s[1], kind: s[2], keywords: s[3] });
  });
  secret_();
  p.setProperty('READY', '2');
}

/** اختياري من المحرر: بيجهّز الشيت ويطبع رابطه. */
function setup() {
  ensure_();
  var msg = 'تمام. شيت البيانات: ' + ss_().getUrl() + (realAdmins_().length ? '' : ' · افتح لينك البرنامج وسجّل نفسك مدير بكود التسجيل.');
  Logger.log(msg);
  return msg;
}

// حساب admin/admin123 القديم (لو اتعمل من نسخة سابقة) مش بيتحسب مدير
function isDefault_(u) { return u.username === 'admin' && u.hash === hash_('admin123', u.salt); }
function realAdmins_() {
  return rows_('Users').filter(function (u) { return u.role === 'admin' && u.active === 'yes' && !isDefault_(u); });
}

function needsAdmin() { ensure_(); return realAdmins_().length === 0; }

function registerAdmin(code, name, username, password) {
  ensure_();
  return withLock_(function () {
    if (realAdmins_().length) throw new Error('فيه مدير متسجل بالفعل. ادخل بحسابك.');
    if (String(code || '').trim() !== SETUP_CODE) throw new Error('كود التسجيل غلط.');
    username = clean_(username, 40).toLowerCase();
    if (!/^[a-z0-9_\-]{3,40}$/.test(username)) throw new Error('اسم المستخدم إنجليزي وأرقام بس (٣ حروف على الأقل).');
    if (!clean_(name)) throw new Error('اكتب اسمك.');
    if (String(password || '').length < 6) throw new Error('الباسورد ٦ حروف على الأقل.');
    rows_('Users').forEach(function (u) { if (isDefault_(u)) { u.active = 'no'; update_('Users', u._row, u); } });
    var u = rows_('Users').filter(function (x) { return x.username === username; })[0] || { username: username, createdAt: now_() };
    u.name = clean_(name, 80); u.role = 'admin'; u.sectors = '*'; u.active = 'yes';
    u.salt = Utilities.getUuid().slice(0, 8); u.hash = hash_(String(password), u.salt);
    if (u._row) update_('Users', u._row, u); else append_('Users', u);
    return { token: makeToken_(u), user: userObj_(u), config: config_() };
  });
}

// ===== الشيتات =====
function ss_() {
  var ss = SpreadsheetApp.getActive();
  if (ss) return ss;
  var p = PropertiesService.getScriptProperties(), id = p.getProperty('SS_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }
  // السكربت مش مربوط بشيت: يعمل شيت جديد لوحده ويفتكره
  ss = SpreadsheetApp.create('تصاريح وتفويضات مراسي - البيانات');
  p.setProperty('SS_ID', ss.getId());
  return ss;
}

function sheet_(name) {
  var ss = ss_(), sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(SCHEMA[name]); sh.setFrozenRows(1); return sh; }
  // إصلاح تلقائي لو عمود اتمسح
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var head = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  var missing = SCHEMA[name].filter(function (k) { return head.indexOf(k) < 0; });
  if (missing.length) {
    var start = head.filter(function (h) { return h; }).length ? lastCol + 1 : 1;
    sh.getRange(1, start, 1, missing.length).setValues([missing]);
  }
  return sh;
}

function header_(sh) { return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String); }

function cell_(v) {
  if (v instanceof Date) {
    var t = Utilities.formatDate(v, TZ, 'HH:mm:ss');
    return t === '00:00:00' ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : v.toISOString();
  }
  return v === null || v === undefined ? '' : String(v);
}

function rows_(name) {
  var sh = sheet_(name), v = sh.getDataRange().getValues(), h = v.shift().map(String);
  return v.map(function (r, i) {
    var o = { _row: i + 2 };
    h.forEach(function (k, j) { if (k) o[k] = cell_(r[j]); });
    return o;
  }).filter(function (o) { return o[SCHEMA[name][0]] !== ''; });
}

function out_(v) {
  v = v === null || v === undefined ? '' : String(v);
  return /^[\d\s\-+.\/:]+$/.test(v) && v.trim() ? "'" + v : v;   // عشان الشيت مايحولش الأرقام والتواريخ
}

function append_(name, obj) {
  var sh = sheet_(name);
  sh.appendRow(header_(sh).map(function (k) { return out_(obj[k]); }));
}

function update_(name, row, obj) {
  var sh = sheet_(name), h = header_(sh);
  sh.getRange(row, 1, 1, h.length).setValues([h.map(function (k) { return out_(obj[k]); })]);
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// ===== أدوات =====
function now_() { return new Date().toISOString(); }
function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function clean_(v, n) { return String(v === null || v === undefined ? '' : v).replace(/[<>]/g, '').trim().slice(0, n || 300); }
function hex_(bytes) { return bytes.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join(''); }
function hash_(pw, salt) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + pw, Utilities.Charset.UTF_8)); }
function secret_() {
  var p = PropertiesService.getScriptProperties(), s = p.getProperty('SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('SECRET', s); }
  return s;
}
function sign_(s) { return hex_(Utilities.computeHmacSha256Signature(s, secret_())).slice(0, 32); }
function isDate_(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ''); }

// ===== الدخول =====
function makeToken_(u) {
  var exp = Date.now() + 30 * 24 * 3600 * 1000;
  var body = u.username + '.' + exp + '.' + String(u.hash).slice(0, 6);
  return body + '.' + sign_(body);
}

function userObj_(u) {
  return { username: u.username, name: u.name, role: u.role, roleName: ROLES[u.role] || u.role,
    sectors: String(u.sectors || '').split(',').map(function (s) { return s.trim(); }).filter(String) };
}

function session_(token) {
  var p = String(token || '').split('.');
  if (p.length !== 4) throw new Error('SESSION_EXPIRED');
  var body = p.slice(0, 3).join('.');
  if (sign_(body) !== p[3] || Number(p[1]) < Date.now()) throw new Error('SESSION_EXPIRED');
  var u = rows_('Users').filter(function (x) { return x.username === p[0]; })[0];
  if (!u || u.active !== 'yes' || String(u.hash).slice(0, 6) !== p[2]) throw new Error('SESSION_EXPIRED');
  return userObj_(u);
}

function need_(user, roles) { if (roles.indexOf(user.role) < 0) throw new Error('الحساب ده مالوش صلاحية.'); }

function login(username, password) {
  ensure_();
  username = clean_(username).toLowerCase();
  var cache = CacheService.getScriptCache(), key = 'fail:' + username, fails = Number(cache.get(key) || 0);
  if (fails >= 5) throw new Error('محاولات غلط كتير. استنى ١٠ دقايق وجرّب تاني.');
  var u = rows_('Users').filter(function (x) { return x.username === username; })[0];
  if (!u || u.active !== 'yes' || isDefault_(u) || hash_(String(password || ''), u.salt) !== u.hash) {
    cache.put(key, String(fails + 1), 600);
    throw new Error('اسم المستخدم أو الباسورد غلط.');
  }
  cache.remove(key);
  return { token: makeToken_(u), user: userObj_(u), config: config_() };
}

function resume(token) { var user = session_(token); return { user: user, config: config_() }; }

function changePassword(token, oldPw, newPw) {
  var me = session_(token);
  if (String(newPw || '').length < 4) throw new Error('الباسورد الجديد لازم ٤ حروف على الأقل.');
  return withLock_(function () {
    var u = rows_('Users').filter(function (x) { return x.username === me.username; })[0];
    if (hash_(String(oldPw || ''), u.salt) !== u.hash) throw new Error('الباسورد القديم غلط.');
    u.salt = Utilities.getUuid().slice(0, 8); u.hash = hash_(String(newPw), u.salt);
    update_('Users', u._row, u);
    return { token: makeToken_(u) };
  });
}

function config_() {
  return { types: TYPES, roles: ROLES, today: today_(),
    sectors: rows_('Sectors').map(function (s) { return { id: s.id, name: s.name, kind: s.kind, keywords: s.keywords }; }) };
}

// ===== المستندات =====
function canSee_(user, doc) {
  if (user.role !== 'supervisor') return true;
  return user.sectors.indexOf('*') >= 0 || user.sectors.indexOf(String(doc.sector)) >= 0;
}

function parseJson_(s) { try { var v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }

function listDocs(token, opts) {
  var user = session_(token);
  opts = opts || {};
  var keepFrom = Utilities.formatDate(new Date(Date.now() - (opts.days || 60) * 864e5), TZ, 'yyyy-MM-dd');
  var docs = rows_('Docs').filter(function (d) { return canSee_(user, d) && (opts.all || d.to >= keepFrom || !d.to); });
  var acks = rows_('Acks');
  var sups = user.role === 'supervisor' ? [] : rows_('Users').filter(function (u) { return u.role === 'supervisor' && u.active === 'yes'; }).map(userObj_);
  return {
    today: today_(),
    docs: docs.map(function (d) {
      var mine = acks.filter(function (a) { return a.docId === d.id && a.at >= (d.updatedAt || d.createdAt); });
      var o = {};
      SCHEMA.Docs.forEach(function (k) { o[k] = d[k]; });
      o.people = parseJson_(d.people); o.vehicles = parseJson_(d.vehicles);
      if (user.role === 'supervisor') o.acked = mine.some(function (a) { return a.username === user.username; });
      else {
        var expected = sups.filter(function (s) { return canSee_(s, d); });
        o.acks = mine.map(function (a) { return { name: a.name, at: a.at }; });
        o.pending = expected.filter(function (s) { return !mine.some(function (a) { return a.username === s.username; }); })
          .map(function (s) { return s.name; });
      }
      return o;
    }).sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; })
  };
}

function cleanList_(arr, keys, max) {
  return (Array.isArray(arr) ? arr : []).slice(0, max).map(function (r) {
    var o = {}; keys.forEach(function (k) { o[k] = clean_(r && r[k], 120); }); return o;
  }).filter(function (o) { return keys.some(function (k) { return o[k]; }); });
}

function saveDoc(token, d) {
  var user = session_(token);
  need_(user, ['admin', 'entry']);
  d = d || {};
  if (!TYPES[d.type]) throw new Error('اختار نوع المستند.');
  var sectors = config_().sectors.map(function (s) { return s.id; });
  if (sectors.indexOf(String(d.sector)) < 0) throw new Error('اختار القطاع.');
  if (!isDate_(d.from) || !isDate_(d.to)) throw new Error('اكتب تاريخ البداية والنهاية.');
  if (d.to < d.from) throw new Error('تاريخ النهاية قبل تاريخ البداية.');
  return withLock_(function () {
    var row = {
      type: d.type, refNo: clean_(d.refNo, 60), sector: String(d.sector), unit: clean_(d.unit, 120),
      party: clean_(d.party, 150), contact: clean_(d.contact, 60), from: d.from, to: d.to,
      title: clean_(d.title, 200), description: clean_(d.description, 1500), labor: clean_(d.labor, 10),
      people: JSON.stringify(cleanList_(d.people, ['name', 'nid', 'phone', 'role'], 40)),
      vehicles: JSON.stringify(cleanList_(d.vehicles, ['plate', 'model', 'color', 'owner'], 15)),
      fileId: clean_(d.fileId, 120), fileName: clean_(d.fileName, 150), fileMime: clean_(d.fileMime, 60),
      notes: clean_(d.notes, 500), updatedAt: now_()
    };
    if (d.id) {
      var old = rows_('Docs').filter(function (x) { return x.id === d.id; })[0];
      if (!old) throw new Error('المستند مش موجود.');
      for (var k in row) old[k] = row[k];
      update_('Docs', old._row, old);
      return { id: old.id };
    }
    if (row.refNo) {
      var dup = rows_('Docs').filter(function (x) { return x.refNo === row.refNo && x.type === row.type && x.status !== 'cancelled'; })[0];
      if (dup && !d.allowDup) throw new Error('DUP:' + row.refNo);
    }
    row.id = Utilities.getUuid().slice(0, 8);
    row.createdAt = row.updatedAt;
    row.createdBy = user.username; row.createdByName = user.name; row.status = 'active';
    append_('Docs', row);
    return { id: row.id };
  });
}

function cancelDoc(token, id, reason) {
  var user = session_(token);
  need_(user, ['admin', 'entry']);
  return withLock_(function () {
    var d = rows_('Docs').filter(function (x) { return x.id === id; })[0];
    if (!d) throw new Error('المستند مش موجود.');
    d.status = 'cancelled'; d.cancelReason = clean_(reason, 200); d.updatedAt = now_();
    update_('Docs', d._row, d);
    return true;
  });
}

function ackDoc(token, id) {
  var user = session_(token);
  var d = rows_('Docs').filter(function (x) { return x.id === id; })[0];
  if (!d || !canSee_(user, d)) throw new Error('المستند مش موجود.');
  return withLock_(function () {
    append_('Acks', { docId: id, username: user.username, name: user.name, at: now_() });
    return true;
  });
}

// ===== التقارير =====
function reportData(token) {
  var user = session_(token);
  need_(user, ['admin', 'entry', 'emaar']);
  var acks = {};
  rows_('Acks').forEach(function (a) { (acks[a.docId] = acks[a.docId] || []).push({ u: a.username, at: a.at }); });
  return {
    today: today_(),
    docs: rows_('Docs').map(function (d) {
      return { id: d.id, type: d.type, sector: d.sector, from: d.from, to: d.to, status: d.status, unit: d.unit, party: d.party,
        title: d.title || d.description, createdAt: d.createdAt, updatedAt: d.updatedAt || d.createdAt,
        people: parseJson_(d.people).length, acks: acks[d.id] || [], imp: /^استيراد/.test(d.createdByName || '') };
    }),
    supervisors: rows_('Users').filter(function (u) { return u.role === 'supervisor' && u.active === 'yes'; }).map(userObj_)
  };
}

// ===== الملفات والقراءة التلقائية =====
function folder_() {
  var p = PropertiesService.getScriptProperties(), id = p.getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var f = DriveApp.createFolder('مرفقات تصاريح مراسي');
  p.setProperty('FOLDER_ID', f.getId());
  return f;
}

function scanFile(token, b64, mime, name, pageImg) {
  var user = session_(token);
  need_(user, ['admin', 'entry']);
  mime = String(mime || 'application/octet-stream');
  if (!/^image\/|^application\/pdf$/.test(mime)) throw new Error('ارفع صورة أو PDF بس.');
  name = clean_(name || 'scan', 150);
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, name);
  var file = folder_().createFile(blob);
  var res = { fileId: file.getId(), fileName: name, fileMime: mime, text: '', warning: '' };
  // الـ PDF بيتقرا من صورة أول صفحة (أسرع، ومن غير حد الـ OCR بتاع ملفات الـ PDF)
  var ocrBlob = /pdf/.test(mime) && pageImg ? Utilities.newBlob(Utilities.base64Decode(pageImg), 'image/jpeg', 'page1.jpg') : blob;
  var o = ocr_(ocrBlob);
  res.text = o.text;
  if (!res.text) res.warning = o.error
    ? 'القراءة التلقائية وقفت: ' + o.error + ' — كمّل البيانات يدوي.'
    : 'مفيش كلام اتقرا من الملف. كمّل البيانات يدوي.';
  res.fields = parseDoc_(res.text, name, config_().sectors);
  return res;
}

function ocr_(blob) {
  if (typeof Drive === 'undefined') return { text: '', error: 'خدمة Drive API مش ظاهرة للنسخة المنشورة (اعمل Deploy ← New version)' };
  var id, text = '', error = '';
  for (var attempt = 0; attempt < 3; attempt++) {
    error = '';
    try {
      if (Drive.Files.create) id = Drive.Files.create({ name: 'permit-ocr', mimeType: 'application/vnd.google-apps.document' }, blob, { ocrLanguage: 'ar' }).id;
      else id = Drive.Files.insert({ title: 'permit-ocr', mimeType: blob.getContentType() }, blob, { ocr: true, ocrLanguage: 'ar' }).id;
      text = DocumentApp.openById(id).getBody().getText();
    } catch (e) {
      error = String(e && e.message || e).slice(0, 200);
    } finally {
      try { if (id) DriveApp.getFileById(id).setTrashed(true); } catch (e2) {}
      id = null;
    }
    if (!error || !/rate limit|quota|backend|internal/i.test(error)) break;
    Utilities.sleep(2500 * (attempt + 1));   // جوجل مزحوم: استنى وجرّب تاني
  }
  if (/rate limit/i.test(error)) error = 'جوجل وقّف القراءة مؤقتًا من كتر الطلبات، جرّب كمان دقيقة';
  return { text: text || '', error: error };
}

/** للفحص من المحرر: بيقرا آخر ملف اترفع ويطبع النتيجة في الـ Execution log. */
function testOcr() {
  var it = folder_().getFiles(), last = null;
  while (it.hasNext()) { var f = it.next(); if (!last || f.getDateCreated() > last.getDateCreated()) last = f; }
  if (!last) { Logger.log('مفيش ملفات مرفوعة لسه. ارفع صورة من البرنامج الأول.'); return; }
  Logger.log('الملف: ' + last.getName() + ' · Drive API: ' + (typeof Drive === 'undefined' ? 'مش موجود' : (Drive.Files.create ? 'v3' : 'v2')));
  if (/pdf/i.test(last.getMimeType())) Logger.log('ملحوظة: البرنامج بيقرا الـ PDF من صورة أول صفحة. الفحص ده بيجرّب الـ PDF نفسه، فالأفضل تجرّب بصورة أو سكرين شوت.');
  var o = ocr_(last.getBlob());
  Logger.log(o.error ? 'خطأ: ' + o.error : 'اتقرا ' + o.text.length + ' حرف:\n' + o.text.slice(0, 500));
  Logger.log(JSON.stringify(parseDoc_(o.text, last.getName(), config_().sectors)));
}

function getFile(token, fileId) {
  var user = session_(token);
  if (!fileId) throw new Error('مفيش مرفق.');
  if (user.role === 'supervisor') {
    var ok = rows_('Docs').some(function (d) { return d.fileId === fileId && canSee_(user, d); });
    if (!ok) throw new Error('مالكش صلاحية على الملف ده.');
  }
  var f = DriveApp.getFileById(fileId), b = f.getBlob();
  return { b64: Utilities.base64Encode(b.getBytes()), mime: b.getContentType(), name: f.getName() };
}

// ===== قراءة النص (من غير أي خدمة خارجية) =====
function parseDoc_(text, fileName, sectors) {
  var t = String(text || '').replace(/[‎‏‪-‮]/g, '')
    .replace(/[٠-٩]/g, function (c) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(c); });
  var all = t + '\n' + String(fileName || '').replace(/[_]+/g, ' ');
  var lines = t.split(/\n/).map(function (l) { return l.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
  var f = { type: 'other', refNo: '', unit: '', party: '', contact: '', from: '', to: '', title: '', description: '', labor: '', sector: '', people: [], vehicles: [] };

  if (/retail\s*permit|store\s*name|msa\s*location|\bRP-\d+/i.test(all)) f.type = 'retail';
  else if (/خطاب\s*تفويض|افوض|أفوض|اﻓﻮض|delegation/i.test(all)) f.type = 'delegation';
  else if (/PKG\s*#?\s*\d+|projects?\s*department|مدير\s*مشروع/i.test(all)) f.type = 'project';
  else if (/[إا]دار[ةه]\s*المرافق|عمل\s*مؤقت/.test(all)) f.type = 'facility';
  else if (/work\s*permit\s*subject|client\s*name|number\s*of\s*labou?r/i.test(all)) f.type = 'unit';

  var NEXT_LABEL = /\s+(?=تاريخ\s*(البد|الانتهاء)|[اأ]سم\s*(الشرك|المهندس)|رقم\s*(تليفون|المحمول)|وصف\s*العمل|المكان\s*بالتفصيل|ورقمها)/;
  function after(re) {
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(re);
      if (m) {
        var v = lines[i].slice(m.index + m[0].length).replace(/^[\s:：\-\/.]+/, '').replace(/[.\-_…]{3,}/g, '').trim();
        v = v.split(NEXT_LABEL)[0].trim();
        if (v) return v;
        var nx = (lines[i + 1] || '').replace(/[.\-_…]{3,}/g, '').trim();
        if (nx && !/:\s*$/.test(nx)) return nx;
      }
    }
    return '';
  }
  function dateOf(s) {
    var m = String(s || '').match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    m = String(s || '').match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2,4})/);
    if (m) { var y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2); }
    return '';
  }

  if (f.type === 'retail') {
    f.refNo = (all.match(/RP-\d+/i) || [''])[0].toUpperCase();
    f.party = after(/store\s*name/i);
    f.unit = after(/msa\s*location/i);
    f.title = after(/list\s*of\s*retail\s*permits?/i);
    f.contact = after(/contact\s*no\.?/i);
    f.from = dateOf(after(/start\s*date/i));
    f.to = dateOf(after(/end\s*date/i));
    f.description = after(/^description/i);
  } else if (f.type === 'unit') {
    f.party = after(/client\s*name/i);
    f.unit = after(/unit\s*number/i);
    f.title = after(/work\s*permit\s*subject/i);
    f.labor = (after(/number\s*of\s*labou?r/i).match(/\d+/) || [''])[0];
    f.description = after(/^description|الوصف\s*التفصيلي/i);
  } else if (f.type === 'project') {
    f.refNo = (all.match(/PKG\s*#?\s*(\d+)/i) || ['', ''])[1] ? 'PKG#' + all.match(/PKG\s*#?\s*(\d+)/i)[1] : '';
    f.party = after(/اسم\s*الشرك[ةه]\s*\/?\s*المقاول|[اأ]سم\s*الشرك[ةه]/);
    f.title = after(/وصف\s*العمل(\s*بالتفصيل)?/);
    var eng = after(/[اأ]سم\s*المهندس(\s*المس[ئؤ]ول)?/);
    if (eng && !/\d{4}/.test(eng)) f.people.push({ name: eng.replace(/تاريخ.*$/, '').trim(), nid: '', phone: '', role: 'المهندس المسئول' });
    f.contact = (after(/رقم\s*تليفون|حال[ةه]\s*الطوارئ/).match(/0\d{9,10}/) || [''])[0];
    f.from = dateOf(after(/تاريخ\s*البد[ءا]/));
    f.to = dateOf(after(/تاريخ\s*الانتهاء/));
  } else if (f.type === 'facility') {
    f.party = after(/اسم\s*الشرك[ةه]/);
    f.unit = after(/المكان\s*بالتفصيل/);
    f.title = after(/وصف\s*العمل(\s*بالتفصيل)?/);
    f.from = dateOf(after(/تاريخ\s*البد[ءا]/));
    f.to = dateOf(after(/تاريخ\s*الانتهاء/));
  } else if (f.type === 'delegation') {
    f.party = after(/السيد\s*\/?\s*[ةه]?/).replace(/مالك.*$/, '').trim();
    f.unit = after(/الوحد[ةه]\s*:?\s*رقم|رقم\s*الوحد[ةه]/);
    var tp = [];
    [['زراع', 'زراعة'], ['مدرس', 'مدرس'], ['حمام السباح', 'صيانة حمام سباحة'], ['سائق', 'سائق'], ['عمال[ةه] منزلي', 'عمالة منزلية'],
     ['تشطيب', 'تشطيبات'], ['الأتوبيس|الاتوبيس', 'الأتوبيس الداخلي'], ['غسيل', 'غسيل سيارات']].forEach(function (p) {
      if (new RegExp(p[0]).test(all) && /✓|☑|☒|x|X|✔/.test(all)) tp.push(p[1]);
    });
    f.title = tp.length && tp.length < 4 ? 'تفويض ' + tp.join(' / ') : 'تفويض';
    var ds = all.match(/من\s*تاريخ([^\n]*)/);
    if (ds) { var two = ds[1].split(/إل[يى]|الى/); f.from = dateOf(two[0]); f.to = dateOf(two[1]); }
  }

  // تواريخ احتياطي: أول تاريخين في النص
  if (!f.from || !f.to) {
    var found = [], re = /(\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}|\d{1,2}\s*[\/\-.]\s*\d{1,2}\s*[\/\-.]\s*\d{2,4})/g, m;
    while ((m = re.exec(t)) && found.length < 4) { var dd = dateOf(m[1]); if (dd && found.indexOf(dd) < 0) found.push(dd); }
    if (!f.from && found[0]) f.from = found[0];
    if (!f.to && found[1]) f.to = found[1] > f.from ? found[1] : f.to;
  }
  if (f.from && f.to && f.to < f.from) { var x = f.from; f.from = f.to; f.to = x; }
  if (!f.unit) { var u = all.match(/\b[A-Z0-9]{1,5}-[A-Z0-9]{1,6}-\d{1,4}\b/i); if (u) f.unit = u[0].toUpperCase(); }
  if (!f.contact) f.contact = (t.match(/\b01[0125][\s\-]?\d{3,4}[\s\-]?\d{4}\b/) || [''])[0];
  f.sector = matchSector_(all, f.type, sectors);
  return f;
}

function matchSector_(text, type, sectors) {
  var low = ' ' + String(text || '').toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  var best = '', score = 0;
  (sectors || []).forEach(function (s) {
    String(s.keywords || '').split(',').concat([s.name]).forEach(function (k) {
      k = String(k).toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (!k) return;
      var esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp('(^|[^a-z0-9؀-ۿ])' + esc + '(?=$|[^a-z0-9؀-ۿ])').test(low)) {
        var sc = k.length + ((type === 'retail') === (s.kind === 'تجاري') ? 50 : 0);
        if (sc > score) { score = sc; best = s.id; }
      }
    });
  });
  return best;
}

// ===== استيراد داتا قديمة (للمدير) =====
// rows: [{refNo,type,sector,unit,party,from,to,description,notes,createdAt}] — اللي رقمه اتسجل قبل كده بيتشال
function importDocs(token, rows, source) {
  var user = session_(token);
  need_(user, ['admin']);
  if (!Array.isArray(rows) || !rows.length) throw new Error('الملف فاضي.');
  if (rows.length > 600) throw new Error('ابعت ٦٠٠ صف بالكتير في المرة.');
  return withLock_(function () {
    var secs = rows_('Sectors');
    if (rows.some(function (r) { return r.sector === 'x1'; }) && !secs.some(function (x) { return x.id === 'x1'; })) {
      append_('Sectors', { id: 'x1', name: 'أماكن عامة / غير محدد', kind: 'سكني', keywords: '' });
      secs = rows_('Sectors');
    }
    var ids = {}; secs.forEach(function (x) { ids[x.id] = 1; });
    var seen = {}; rows_('Docs').forEach(function (d) { if (d.refNo) seen[d.refNo] = 1; });
    var sh = sheet_('Docs'), h = header_(sh), out = [], skipped = 0, bad = 0, by = clean_(source || 'استيراد', 60);
    rows.forEach(function (r) {
      var ref = clean_(r.refNo, 60);
      if (!ref || seen[ref]) { skipped++; return; }
      if (!TYPES[r.type] || !ids[r.sector] || !isDate_(r.from) || !isDate_(r.to)) { bad++; return; }
      seen[ref] = 1;
      var at = /^\d{4}-\d{2}-\d{2}T/.test(r.createdAt || '') ? r.createdAt : r.from + 'T07:00:00.000Z';
      var o = { id: Utilities.getUuid().slice(0, 8), createdAt: at, updatedAt: at, createdBy: user.username, createdByName: 'استيراد · ' + by,
        type: r.type, refNo: ref, sector: r.sector, unit: clean_(r.unit, 120), party: clean_(r.party, 150), from: r.from, to: r.to,
        description: clean_(r.description, 1500), notes: clean_(r.notes, 500), people: '[]', vehicles: '[]', status: 'active' };
      out.push(h.map(function (k) { return out_(o[k]); }));
    });
    if (out.length) sh.getRange(sh.getLastRow() + 1, 1, out.length, h.length).setValues(out);
    return { added: out.length, skipped: skipped, bad: bad };
  });
}

// ===== الحسابات والقطاعات (للمدير) =====
function listUsers(token) {
  need_(session_(token), ['admin']);
  return rows_('Users').filter(function (u) { return !isDefault_(u); }).map(function (u) { var o = userObj_(u); o.active = u.active === 'yes'; return o; });
}

function saveUser(token, d) {
  var me = session_(token);
  need_(me, ['admin']);
  d = d || {};
  var username = clean_(d.username, 40).toLowerCase();
  if (!/^[a-z0-9_\-]{3,40}$/.test(username)) throw new Error('اسم المستخدم إنجليزي وأرقام بس (٣ حروف على الأقل).');
  if (!ROLES[d.role]) throw new Error('اختار الصلاحية.');
  if (!clean_(d.name)) throw new Error('اكتب الاسم.');
  var sectors = d.role === 'supervisor' ? (d.sectors || []).map(String).filter(String) : ['*'];
  if (d.role === 'supervisor' && !sectors.length) throw new Error('اختار قطاع واحد على الأقل للمشرف.');
  return withLock_(function () {
    var u = rows_('Users').filter(function (x) { return x.username === username; })[0];
    if (d.isNew && u) throw new Error('اسم المستخدم ده موجود.');
    if (!u) {
      if (String(d.password || '').length < 4) throw new Error('الباسورد ٤ حروف على الأقل.');
      u = { username: username, createdAt: now_() };
    }
    if (u.role === 'admin' && (d.role !== 'admin' || d.active === false)) {
      if (u.username === me.username) throw new Error('مينفعش توقف حسابك أو تشيل صلاحية المدير من نفسك.');
      if (realAdmins_().filter(function (x) { return x.username !== u.username; }).length === 0) throw new Error('لازم يفضل مدير واحد على الأقل.');
    }
    u.name = clean_(d.name, 80); u.role = d.role; u.sectors = sectors.join(',');
    u.active = d.active === false ? 'no' : 'yes';
    if (d.password) { u.salt = Utilities.getUuid().slice(0, 8); u.hash = hash_(String(d.password), u.salt); }
    if (u._row) update_('Users', u._row, u); else append_('Users', u);
    return true;
  });
}

function saveSector(token, d) {
  need_(session_(token), ['admin']);
  d = d || {};
  if (!clean_(d.name)) throw new Error('اكتب اسم القطاع.');
  return withLock_(function () {
    var list = rows_('Sectors'), s = d.id ? list.filter(function (x) { return x.id === d.id; })[0] : null;
    if (!s) s = { id: 's' + Utilities.getUuid().slice(0, 5) };
    s.name = clean_(d.name, 80); s.kind = d.kind === 'تجاري' ? 'تجاري' : 'سكني'; s.keywords = clean_(d.keywords, 300);
    if (s._row) update_('Sectors', s._row, s); else append_('Sectors', s);
    return config_();
  });
}
