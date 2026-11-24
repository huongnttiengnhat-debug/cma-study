/* CMA Study – PWA học tiếng Anh kế toán và luyện thi CMA Part 1.
   Không cần build. Dữ liệu: data/public.json (nội dung tự soạn) + file Excel người dùng nhập (lưu IndexedDB). */
'use strict';
const APP_VERSION = '1.3.3';
const TYPES = ['vocab', 'los', 'sentences', 'mcq', 'cbq', 'cfo', 'glossary', 'formulas', 'concepts', 'lessons', 'kparts'];
const TYPE_VI = { vocab: 'Từ vựng', los: 'LOS', sentences: 'Câu song ngữ', mcq: 'Câu MCQ', cbq: 'Câu CBQ', cfo: 'Mẫu câu CFO', glossary: 'Từ điển chung', formulas: 'Công thức', concepts: 'Khái niệm', lessons: 'Bài học', kparts: 'Bài giảng slide' };
const KEY = {
  vocab: r => r.id, los: r => r.los, sentences: r => r.id, mcq: r => r.id,
  cbq: r => r.case_id + '#' + r.q_no, cfo: r => r.id, glossary: r => String(r.word).toLowerCase(),
  formulas: r => r.id, concepts: r => r.id, lessons: r => r.los, kparts: r => r.id
};
const REQUIRED = {
  vocab: ['term', 'vi_meaning'], los: ['los', 'title_en'], sentences: ['en', 'vi'],
  mcq: ['question', 'A', 'B', 'answer'], cbq: ['case_id', 'question', 'A', 'B', 'answer'], cfo: ['phrase_en', 'phrase_vi'], glossary: ['word', 'vi'],
  formulas: ['id', 'name_en'], concepts: ['id', 'term_en'], lessons: ['los'], kparts: ['id', 'los']
};
/* Nhãn nguồn thống nhất (giai đoạn a) */
const SRC = {
  ima: ['IMA chính thức', 'ok'],
  st: ['Tài liệu chị cung cấp', ''],
  ai: ['AI biên soạn – cần xác minh', 'warn'],
  sim: ['Câu mô phỏng – AI viết, cần xác minh', 'warn'],
  me: ['Chị tự nhập', '']
};
const VI_LEVELS = { 1: 'Song ngữ', 2: 'Gợi ý', 3: 'Chỉ tiếng Anh' };
const VI_LEVEL_NOTE = {
  1: 'Bản dịch hiện ngay dưới câu hỏi, phương án và câu ví dụ.',
  2: 'Chỉ hiện nghĩa các thuật ngữ khóa. Bấm "Xem tiếng Việt" khi cần bản dịch đầy đủ.',
  3: 'Không hiện tiếng Việt. Chạm vào từ để xem nghĩa; bản dịch chỉ mở sau khi trả lời.'
};
/* Từ tín hiệu trong đề: neg = phủ định, key = so sánh/nhấn mạnh, cond = điều kiện */
const SIG = {};
'not except least incorrect false never neither nor unless cannot without no'.split(' ').forEach(w => SIG[w] = 'neg');
'most best only respectively true primary primarily main greatest highest lowest likely always first'.split(' ').forEach(w => SIG[w] = 'key');
'if assuming assume assumed given under according provided prior before after when whichever'.split(' ').forEach(w => SIG[w] = 'cond');
const TRAPS = [
  [/\b(except|not|incorrect|false|least|never)\b|n['’]t\b/i, 'Câu hỏi PHỦ ĐỊNH: tìm phương án SAI hoặc KHÔNG thuộc nhóm. Xét từng phương án "đúng hay sai", rồi chọn cái sai.'],
  [/\brespectively\b/i, '"respectively" = lần lượt: đáp án ghép nhiều giá trị theo đúng thứ tự được hỏi. Kiểm tra cả thứ tự, không chỉ con số.'],
  [/\b(most likely|least likely|best|most appropriate|primary|primarily|main|greatest)\b/i, 'Câu hỏi "phù hợp NHẤT": có thể nhiều phương án đúng một phần. Chọn phương án đầy đủ và trực tiếp nhất.'],
  [/(^|\n)\s*(I|II|III|IV)\.\s/, 'Dạng tổ hợp I, II, III: đánh giá từng mệnh đề Đúng/Sai trước, rồi mới chọn tổ hợp.'],
  [/\bU\.?S\.? GAAP\b[\s\S]*\bIFRS\b|\bIFRS\b[\s\S]*\bU\.?S\.? GAAP\b/i, 'So sánh U.S. GAAP và IFRS: mỗi vế của phương án phải đúng với chuẩn mực tương ứng.'],
  [/\b(under|according to|in accordance with) (the )?(U\.?S\.? GAAP|IFRS)\b/i, 'Câu chỉ định chuẩn mực: trả lời theo đúng chuẩn mực được nêu, vì US GAAP và IFRS có thể khác nhau.'],
  [/\bnet of tax\b|\bafter[- ]tax\b|\bpretax\b|\bbefore[- ]tax\b|\btax rate\b/i, 'Có yếu tố thuế: xác định số liệu trước thuế hay sau thuế trước khi tính.'],
  [/\bFact Pattern\b/i, 'Câu thuộc chùm tình huống (Fact Pattern): dữ liệu dùng chung cho nhiều câu, nhưng mỗi câu chỉ hỏi một phần.'],
  [/\b(assum(e|ed|ing)|if)\b/i, 'Có giả định ("assuming"/"if"): áp dụng đúng giả định đó, kể cả khi khác thực tế hoặc khác câu trước.'],
  [/\bYear \d+\b[\s\S]*\bYear \d+\b/i, 'Có nhiều năm: xác định năm được hỏi (Year 1, Year 2…) và chỉ lấy số liệu của năm đó.'],
  [/\b(indirect|direct) method\b/i, 'Chú ý phương pháp lập báo cáo lưu chuyển tiền tệ được chỉ định (trực tiếp hay gián tiếp).'],
  [/\b(FIFO|LIFO|first-in|last-in|weighted[- ]average|moving[- ]average|periodic|perpetual)\b/i, 'Chú ý phương pháp tính giá và hệ thống tồn kho được chỉ định (FIFO/LIFO/bình quân; định kỳ hay kê khai thường xuyên).'],
  [/\b(cumulative|to date)\b/i, 'Phân biệt số LŨY KẾ (cumulative/to date) với số phát sinh trong kỳ.'],
  [/\bcash\b[\s\S]*\b(income|revenue|expense)\b|\b(income|revenue|expense)\b[\s\S]*\bcash\b/i, 'Câu có cả "cash" và "income/revenue/expense": phân biệt số tiền thu/chi với số ghi nhận theo dồn tích.']
];
const BOX_DAYS = [0, 1, 2, 4, 7, 14];
const COVER_CLASS = { 'Đủ': 'ok', 'Một phần': 'warn', 'Thiếu': 'bad', 'Lệch': 'bad' };

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const view = () => $('#view');
function spk(text, hl) {
  return String(text ?? '').split(/([A-Za-z][A-Za-z'’-]*)/).map((t, i) => {
    if (!(i % 2)) return esc(t);
    const s = hl && (SIG[t.toLowerCase()] || (/n['’]t$/i.test(t) ? 'neg' : ''));
    return `<span class="w${s ? ' sig-' + s : ''}">${esc(t)}</span>`;
  }).join('');
}
function sayBtns(text, label) {
  const t = esc(text);
  return `<button class="say" data-say="${t}" aria-label="Nghe ${label || ''}">🔊</button><button class="say" data-say="${t}" data-slow="1" aria-label="Nghe chậm">🐢</button>`;
}
function today(d = new Date()) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
function addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return today(d); }
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function splitSent(t) { return (String(t || '').match(/[^.!?]+[.!?]+["')]?(\s+|$)|[^.!?]+$/g) || []).map(s => s.trim()).filter(Boolean); }
function hash(s) { let h = 5381; for (const c of String(s)) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0; return h.toString(36); }
function pct(a, b) { return b ? Math.round(100 * a / b) : 0; }
function toast(msg, ms = 2600) { const t = $('#toast'); t.innerHTML = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms); }
function losName(code) { const l = S.byLos[code]; return l ? `${code.replace(/^1\./, '')} · ${l.title_vi || l.title_en}` : code; }
function shortLos(code) { return String(code || '').replace(/^1\./, ''); }
function coverPill(c) { return c ? `<span class="pill ${COVER_CLASS[c] || ''}">${esc(c)}</span>` : ''; }
function srcType(r, kind) {
  let t = r && r.source_type && SRC[r.source_type] ? r.source_type : '';
  if (!t) {
    const s = String(r?.source || '');
    if (/tài liệu chị cung cấp|smart ?train|gleim/i.test(s)) t = 'st';
    else if (/^IMA LOS/i.test(s)) t = 'ima';
    else if (/soạn bổ sung|cần đối chiếu|\bAI\b/i.test(s)) t = 'ai';
    else t = r && r._src === 'imp' ? 'me' : 'ai';
  }
  if (t === 'ai' && (kind === 'mcq' || kind === 'cbq')) t = 'sim';
  return t;
}
function srcPill(r, kind) {
  if (!r) return '';
  const [label, cls] = SRC[srcType(r, kind)];
  return `<span class="pill ${cls}" title="${esc(r.source || label)}">${esc(label)}</span>`;
}
function aiPill(text = 'AI dịch – cần xác minh') { return `<span class="pill warn">${esc(text)}</span>`; }

/* ---------- storage (IndexedDB, fallback memory) ---------- */
const store = (() => {
  let dbp; const mem = {};
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      try {
        const r = indexedDB.open('cma-study', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
    return dbp;
  }
  async function get(k) {
    try { const d = await db(); return await new Promise((res, rej) => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
    catch (e) { return mem[k]; }
  }
  async function set(k, v) {
    mem[k] = v;
    try { const d = await db(); await new Promise((res, rej) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
    catch (e) { console.warn('IndexedDB không dùng được, dữ liệu chỉ giữ tạm', e); }
  }
  return { get, set };
})();

/* ---------- state ---------- */
const S = {
  pub: null, imp: {}, data: {}, byId: {}, byLos: {}, termMap: {}, terms: [], gloss: {},
  prog: { srs: {}, mcq: {}, dict: {}, cbq: {}, newDay: { d: '', n: 0 }, log: {}, tr: {}, explain: {}, viStat: {}, lesson: {} },
  settings: { rate: 0.95, slow: 0.65, voice: '', examDate: '2027-05-01', newPerDay: 10, autoSpeak: true, theme: '', showVi: true, viLevel: 0, fDiff: '', fType: '' }
};
let saveTimer;
function saveProg() { clearTimeout(saveTimer); saveTimer = setTimeout(() => store.set('prog', S.prog), 300); }
function saveSettings() { store.set('settings', S.settings); applyTheme(); }
function logStudy(kind) { const d = today(); S.prog.log[d] = S.prog.log[d] || {}; S.prog.log[d][kind] = (S.prog.log[d][kind] || 0) + 1; }
function applyTheme() { if (S.settings.theme) document.documentElement.dataset.theme = S.settings.theme; else delete document.documentElement.dataset.theme; }

function rebuild() {
  for (const t of TYPES) {
    const m = new Map();
    for (const r of (S.pub[t] || [])) m.set(KEY[t](r), { ...r, _src: 'pub' });
    for (const r of Object.values(S.imp[t] || {})) m.set(KEY[t](r), { ...r, _src: 'imp' });
    S.data[t] = [...m.values()];
    S.byId[t] = Object.fromEntries(S.data[t].map(r => [KEY[t](r), r]));
  }
  S.byLos = S.byId.los;
  S.gloss = S.byId.glossary || {};
  S.termMap = {}; S.terms = [];
  const seen = new Set();
  for (const v of S.data.vocab) {
    S.termMap[String(v.term).toLowerCase()] = v;
    for (const a of termAliases(v.term)) {
      const k = a.toLowerCase().replace(/-/g, ' ');
      if (!S.termMap[k]) S.termMap[k] = v;
      if (!S.termMap[a.toLowerCase()]) S.termMap[a.toLowerCase()] = v;
      if (seen.has(a + '|' + v.id)) continue; seen.add(a + '|' + v.id);
      S.terms.push({ a, v, re: termRe(a) });
    }
  }
  S.terms.sort((x, y) => y.a.length - x.a.length);
}

/* ---------- tra thuật ngữ trong câu ---------- */
function termAliases(term) {
  const t = String(term || '').trim(); if (!t) return [];
  const out = new Set();
  const base = t.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (base) out.add(base);
  for (const m of t.matchAll(/\(([^)]+)\)/g)) { const ab = m[1].trim(); if (/^[A-Z][A-Za-z&/]{1,7}$/.test(ab)) out.add(ab); }
  if (/ \/ /.test(base)) base.split(' / ').map(x => x.trim()).filter(x => x.length > 2).forEach(x => out.add(x));
  return [...out].filter(a => !/ \/ /.test(a));
}
function termRe(a) {
  const cs = /[A-Z]/.test(a) && a === a.toUpperCase();
  let s = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[- ]+/g, '[\\s-]+');
  s = s.replace(/^US(?=\[)/i, 'U\\.?S\\.?');
  if (/[a-z]y$/i.test(a) && !cs) s = s.slice(0, -1) + '(?:y|ies)'; else s += "(?:s|es|['’]s)?";
  return new RegExp('(^|[^A-Za-z])(' + s + ')(?![A-Za-z])', cs ? 'g' : 'gi');
}
/* Tìm thuật ngữ (từ vựng) xuất hiện trong đoạn văn: ưu tiên cụm dài, không trùng vị trí */
function findTerms(text) {
  const t = String(text || ''); const taken = []; const hits = new Map();
  for (const { v, re } of S.terms) {
    re.lastIndex = 0; let m;
    while ((m = re.exec(t))) {
      const st = m.index + m[1].length, en = st + m[2].length;
      if (!taken.some(([a, b]) => st < b && en > a)) { taken.push([st, en]); if (!hits.has(v.id) || hits.get(v.id).p > st) hits.set(v.id, { v, p: st }); }
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  return [...hits.values()].sort((a, b) => a.p - b.p).map(h => h.v);
}
function termHit(v, text) { return S.terms.some(x => x.v === v && (x.re.lastIndex = 0, x.re.test(text))); }
function lemmas(w) {
  w = w.toLowerCase().replace(/’/g, "'");
  const c = [w, w.replace(/'s$/, ''), w.replace(/s'$/, ''), w.replace(/ies$/, 'y'), w.replace(/es$/, ''), w.replace(/s$/, ''), w.replace(/ied$/, 'y'),
    w.replace(/ed$/, ''), w.replace(/d$/, ''), w.replace(/(.)\1ed$/, '$1'), w.replace(/ing$/, ''), w.replace(/ing$/, 'e'), w.replace(/(.)\1ing$/, '$1'),
    w.replace(/ily$/, 'y'), w.replace(/ly$/, ''), w.replace(/er$/, ''), w.replace(/est$/, '')];
  return [...new Set(c)].filter(x => x.length > 1);
}
function vocabLookup(phrase) {
  const p = phrase.toLowerCase().replace(/’/g, "'").replace(/-/g, ' ');
  for (const c of [p, p.replace(/'s$/, ''), p.replace(/ies$/, 'y'), p.replace(/es$/, ''), p.replace(/s$/, '')]) if (S.termMap[c]) return S.termMap[c];
  return null;
}
/* Chạm vào một từ: ưu tiên cụm thuật ngữ nhiều từ quanh vị trí chạm, sau đó tới từ đơn, rồi từ điển chung */
function lookupWord(el) {
  const word = el.textContent;
  const sib = el.parentElement ? [...el.parentElement.children].filter(e => e.classList.contains('w')) : [el];
  const i = sib.indexOf(el);
  if (i >= 0) for (let len = Math.min(6, sib.length); len >= 2; len--) {
    for (let st = Math.max(0, i - len + 1); st <= i && st + len <= sib.length; st++) {
      const v = vocabLookup(sib.slice(st, st + len).map(e => e.textContent).join(' '));
      if (v) return { v };
    }
  }
  for (const c of lemmas(word)) { const v = S.termMap[c]; if (v) return { v }; }
  if (/^[A-Z]{2,}s?$/.test(word)) { const v = S.termMap[word.replace(/s$/, '').toLowerCase()]; if (v) return { v }; }
  for (const c of lemmas(word)) { const g = S.gloss[c]; if (g) return { g }; }
  return null;
}

/* ---------- mức hiển thị tiếng Việt ---------- */
function viLv() { const l = +S.settings.viLevel; return l >= 1 && l <= 3 ? l : 1; }
function setViLevel(l) { S.settings.viLevel = l; S.settings.showVi = l === 1; saveSettings(); toast(`Mức ${l} – ${VI_LEVELS[l]}: ${VI_LEVEL_NOTE[l]}`, 4000); }
function viCtl() {
  const lv = viLv();
  return `<div class="seg vilv" role="group" aria-label="Mức hiển thị tiếng Việt"><span class="small muted" style="align-self:center;flex:0 0 auto">Tiếng Việt:</span>${[1, 2, 3].map(l => `<button type="button" data-vilv="${l}" class="${lv === l ? 'on' : ''}">${l}. ${VI_LEVELS[l]}</button>`).join('')}</div>`;
}
function viRecord(ok) { const l = viLv(); const s = S.prog.viStat[l] = S.prog.viStat[l] || { n: 0, c: 0 }; s.n++; if (ok) s.c++; }
function viSuggest() {
  const l = viLv(); if (l >= 3) return '';
  const s = S.prog.viStat[l]; if (!s || s.n < 150 || pct(s.c, s.n) < 70) return '';
  return `<div class="note">Chị đã làm ${s.n} câu ở mức "${VI_LEVELS[l]}", đúng ${pct(s.c, s.n)}%. Có thể chuyển lên mức ${l + 1} – ${VI_LEVELS[l + 1]} để quen đọc đề tiếng Anh. <button type="button" class="say" data-vilv="${l + 1}">Chuyển lên mức ${l + 1}</button></div>`;
}
function viBlock(text, after) {
  if (!text) return '';
  const lv = viLv();
  if (lv === 1) return `<p class="vi">${esc(text)}</p>`;
  if (lv === 2 || after) return `<details class="vi-more"><summary>Xem tiếng Việt</summary><p class="vi">${esc(text)}</p></details>`;
  return '';
}
function hasVi(x) { return !!(x && typeof x.question_vi === 'string' && x.question_vi.trim()); }
function optVi(x, k) { const v = String(x[k + '_vi'] ?? '').trim(); return v && v !== String(x[k]).trim() ? v : ''; }
function trBlock(x, opts) {
  if (!hasVi(x)) return `<p class="small muted">Câu này chưa có bản dịch.${x._src === 'imp' ? ' Nhập lại file <b>CMA_data_private.xlsx</b> bản mới ở mục Dữ liệu để có bản dịch (tiến độ giữ nguyên).' : ''}</p>`;
  return `<div class="trb"><div class="row small">${aiPill()}</div><p class="vi q">${esc(x.question_vi)}</p>${opts.map(k => { const v = optVi(x, k); return v ? `<p class="vi small q"><b>${k}.</b> ${esc(v)}</p>` : ''; }).join('')}</div>`;
}
function termChips(terms) {
  return terms.length ? `<div class="chips">${terms.slice(0, 10).map(v => `<span class="chip"><b>${esc(v.term)}</b> ${esc(v.vi_meaning)}</span>`).join('')}</div>` : '';
}
function mainQuestion(t) {
  const lines = String(t || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
  const rev = lines.slice().reverse();
  const line = rev.find(s => /\?\s*$/.test(s)) || rev.find(s => !/\S {3,}\S|\$\s*[\d,.]+\s*$|^[\d$,.()%\s-]+$/.test(s)) || lines[lines.length - 1] || '';
  const ss = splitSent(line); return ss[ss.length - 1] || line;
}
let ddOpen = false;
/* Bảng "Phân tích tiếng Anh" cho câu MCQ/CBQ */
function deepDive(x, opts, answered) {
  const q = String(x.question || '');
  const mq = mainQuestion(q);
  const allOpt = opts.map(k => String(x[k] ?? '')).join('\n');
  const traps = TRAPS.filter(([re]) => re.test(q)).map(([, n]) => n);
  if (/\S {3,}\S/.test(q) || /\n.*\$/.test(q)) traps.push('Câu có bảng số liệu: xác định đơn vị (USD, nghìn, triệu), cột năm/kỳ và dòng cần dùng trước khi tính.');
  if (/\S \| \S/.test(allOpt)) traps.push('Mỗi phương án có nhiều vế (ngăn bởi dấu |): xét từng vế theo đúng thứ tự cột trong câu hỏi; sai một vế là loại cả phương án.');
  if (opts.some(k => /^(yes|no)\b/i.test(String(x[k] ?? '').trim()))) traps.push('Phương án dạng Yes/No: trả lời riêng từng ý được hỏi rồi mới ghép lại.');
  const terms = findTerms(q + '\n' + allOpt);
  const lv = viLv();
  return `<details class="card dd" id="dd" ${ddOpen ? 'open' : ''}><summary>🔍 Phân tích tiếng Anh</summary>
    <h4>1. Câu hỏi chính</h4>
    ${mq && mq.length < q.trim().length - 3 ? `<p class="en">${spk(mq, true)} ${sayBtns(mq)}</p>` : ''}
    <p class="small muted">Mẹo: đọc câu hỏi chính (thường là câu cuối) trước, rồi mới đọc dữ liệu, để biết cần tìm gì.</p>
    <h4>2. Bẫy cần để ý</h4>
    ${traps.length ? `<ul class="small traps">${traps.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="small muted">Không thấy dấu hiệu bẫy thường gặp. Vẫn đọc kỹ từng phương án.</p>'}
    <p class="small">Màu trong câu hỏi: <span class="sig-neg">phủ định</span> · <span class="sig-key">nhấn mạnh, so sánh</span> · <span class="sig-cond">điều kiện, giả định</span></p>
    <h4>3. Thuật ngữ trong câu (${terms.length})</h4>
    ${terms.length ? `<ul class="terms">${terms.map(v => `<li><span style="flex:1"><a href="#/english/word/${encodeURIComponent(v.id)}"><b>${esc(v.term)}</b></a> <span class="ipa small">${esc(v.ipa)}</span><br>${esc(v.vi_meaning)}${v.en_def ? `<br><small class="muted">${esc(v.en_def)}</small>` : ''}</span>${sayBtns(v.term)}</li>`).join('')}</ul>` : '<p class="small muted">Không có thuật ngữ nào trong danh sách từ vựng.</p>'}
    <h4>4. Bản dịch</h4>
    ${lv === 3 && !answered ? '<p class="small muted">Mức 3 (Chỉ tiếng Anh): bản dịch mở sau khi chị trả lời.</p>' : trBlock(x, opts)}
  </details>`;
}
function bindDeepDive() {
  const d = $('#dd'); if (d) d.ontoggle = () => { ddOpen = d.open; };
  const b = $('#showTr'); if (b) b.onclick = () => { const box = $('#trBox'); box.hidden = !box.hidden; b.textContent = box.hidden ? 'Xem tiếng Việt' : 'Ẩn tiếng Việt'; };
}
/* Phần tiếng Việt ngay dưới câu hỏi, theo mức 1/2/3 */
function qViPart(x, opts) {
  const lv = viLv();
  if (lv === 1) return hasVi(x) ? `<p class="vi q qvi">${esc(x.question_vi)} ${aiPill()}</p>` : '';
  if (lv === 2) return `${termChips(findTerms(x.question + '\n' + opts.map(k => x[k]).join('\n')))}<button type="button" id="showTr" class="say">Xem tiếng Việt</button><div id="trBox" hidden>${trBlock(x, opts)}</div>`;
  return '';
}
function optHtml(x, k, cls, withVi) {
  const v = withVi && viLv() === 1 ? optVi(x, k) : '';
  return `<button class="opt ${cls}" data-k="${k}"><b>${k}.</b><span>${esc(x[k])}${v ? `<span class="ovi">${esc(v)}</span>` : ''}</span></button>`;
}

/* ---------- speech ---------- */
const TTS = {
  voices: [], ok: 'speechSynthesis' in window,
  init() {
    if (!this.ok) return;
    const load = () => { this.voices = speechSynthesis.getVoices().filter(v => /^en[-_]US/i.test(v.lang)); };
    load(); speechSynthesis.addEventListener?.('voiceschanged', () => { load(); if (location.hash.startsWith('#/data')) route(); });
  },
  voice() {
    if (!this.voices.length) return null;
    const saved = this.voices.find(v => v.name === S.settings.voice);
    if (saved) return saved;
    const pref = [/Aria|Jenny|Guy|Ava|Andrew|Emma/i, /Google US English/i, /Samantha/i, /Zira|David|Mark/i];
    const local = this.voices.filter(v => v.localService);
    for (const p of pref) { const v = local.find(x => p.test(x.name)); if (v) return v; }
    return local[0] || this.voices[0];
  },
  clean(t) { return String(t).replace(/<IR>/g, 'I R').replace(/\s+/g, ' ').trim(); },
  speak(text, { slow = false, onend, onstart } = {}) {
    if (!this.ok) { toast('Thiết bị này không hỗ trợ giọng đọc.'); onend && onend(); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(this.clean(text));
    const v = this.voice(); if (v) u.voice = v;
    u.lang = 'en-US'; u.rate = slow ? +S.settings.slow : +S.settings.rate;
    u.onend = () => onend && onend(); u.onerror = () => onend && onend(); u.onstart = () => onstart && onstart();
    speechSynthesis.speak(u);
    if (speechSynthesis.paused) speechSynthesis.resume();
  },
  queue(items, { slow, onEach, onDone } = {}) {
    let i = 0; this._stop = false;
    const next = () => {
      if (this._stop || i >= items.length) { onEach && onEach(-1); onDone && onDone(); return; }
      onEach && onEach(i);
      const t = items[i++];
      this.speak(t, { slow, onend: () => setTimeout(next, 250) });
    };
    next();
  },
  stop() { this._stop = true; if (this.ok) speechSynthesis.cancel(); }
};

/* ---------- text compare (dictation / speaking) ---------- */
function norm(t) {
  return String(t).toLowerCase().replace(/[’']/g, "'").replace(/(\d),(?=\d{3})/g, '$1').replace(/[^a-z0-9'%$.\s-]/g, ' ')
    .replace(/(^|\s)[.-]+|[.-]+(\s|$)/g, ' ').split(/\s+/).filter(Boolean);
}
function compare(target, said) {
  const a = norm(target), b = norm(said); const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  let i = 0, j = 0; const out = [];
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push(`<span class="hit">${esc(a[i])}</span>`); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { out.push(`<span class="miss">${esc(a[i])}</span>`); i++; }
    else { out.push(`<span class="extra">${esc(b[j])}</span>`); j++; }
  }
  while (i < n) out.push(`<span class="miss">${esc(a[i++])}</span>`);
  while (j < m) out.push(`<span class="extra">${esc(b[j++])}</span>`);
  return { score: pct(L[0][0], n), html: out.join(' ') };
}

/* ---------- router ---------- */
const routes = [];
function on(re, fn) { routes.push([re, fn]); }
let current = '';
function route() {
  if (!S.pub) return; // dữ liệu chưa tải xong, boot() sẽ gọi lại
  TTS.stop();
  if (onLeave) { try { onLeave(); } catch (e) { } onLeave = null; }
  $('#toast').classList.remove('show');
  document.body.classList.remove('wide');
  const h = location.hash.slice(1) || '/';
  const [path, qs] = h.split('?');
  const q = Object.fromEntries(new URLSearchParams(qs || ''));
  const tab = path.split('/')[1] || 'home';
  $$('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
  $('#backBtn').hidden = path.split('/').filter(Boolean).length < 2 && !qs;
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) { fn(m.slice(1).map(decodeURIComponent), q); break; }
  }
  if (current !== h) { window.scrollTo(0, 0); current = h; }
}
function setTitle(t) { $('#title').textContent = t; document.title = t === 'CMA Study' ? t : `${t} · CMA Study`; }
function render(html) { view().innerHTML = html; }

/* ---------- HOME ---------- */
function dueCards(list = S.data.vocab) { const t = today(); return list.filter(v => S.prog.srs[v.id] && S.prog.srs[v.id].d <= t); }
function newCards(list = S.data.vocab) { return list.filter(v => !S.prog.srs[v.id]); }
function newLeft() { const nd = S.prog.newDay; return Math.max(0, +S.settings.newPerDay - (nd.d === today() ? nd.n : 0)); }
function losStats() {
  const st = {};
  for (const q of S.data.mcq) {
    const a = S.prog.mcq[q.id]; if (!a) continue;
    const s = st[q.los] = st[q.los] || { n: 0, c: 0, q: 0 };
    s.n += a.n; s.c += a.c; s.q++;
  }
  return st;
}
function weakLos(limit = 5) {
  const st = losStats();
  return Object.entries(st).filter(([, s]) => s.n >= 3).map(([l, s]) => ({ los: l, acc: pct(s.c, s.n), n: s.n }))
    .filter(x => x.acc < 70).sort((a, b) => a.acc - b.acc).slice(0, limit);
}
on(/^\/$/, () => {
  setTitle('CMA Study');
  const days = Math.ceil((new Date(S.settings.examDate) - new Date(today())) / 864e5);
  const due = dueCards().length, nl = Math.min(newLeft(), newCards().length);
  let att = 0, cor = 0; for (const a of Object.values(S.prog.mcq)) { att += a.n; cor += a.c; }
  const weak = weakLos(3);
  const priv = S.data.mcq.filter(q => q._src === 'imp').length;
  const noVoice = TTS.ok && TTS.voices.length === 0;
  render(`
  <div class="card row">
    <div><div class="big">${days > 0 ? days : 0}</div><div class="muted small">ngày đến kỳ thi (${esc(S.settings.examDate)})</div></div>
    <div class="spacer"></div>
    <a class="btn primary" href="#/english/cards">Học thẻ hôm nay: ${due + nl}</a>
  </div>
  ${!TTS.ok ? `<div class="note">Trình duyệt này không có giọng đọc. Hãy mở bằng Chrome, Edge hoặc Safari.</div>` : ''}
  ${noVoice ? `<div class="note">Chưa thấy giọng đọc tiếng Anh (Mỹ) trên máy. Xem cách cài ở mục <a href="#/data">Dữ liệu › Giọng đọc</a>.</div>` : ''}
  ${courseNext()}
  <h3>Hôm nay</h3>
  <div class="grid">
    <a class="tile" href="#/course"><b>📚 My CMA Course</b><small>${courseSummary()}</small></a>
    <a class="tile" href="#/english/cards"><b>${due} thẻ đến hạn</b><small>+ ${nl} từ mới (giới hạn ${esc(S.settings.newPerDay)}/ngày)</small></a>
    <a class="tile" href="#/exam/mcq?mode=random&n=10"><b>10 câu MCQ</b><small>Đã làm ${att} lượt, đúng ${pct(cor, att)}%</small></a>
    <a class="tile" href="#/english/dict"><b>Nghe – chép 5 câu</b><small>Luyện nghe và chính tả</small></a>
    <a class="tile" href="#/english/read"><b>Đọc song ngữ</b><small>${new Set(S.data.sentences.map(s => s.passage_id)).size} đoạn văn</small></a>
    <a class="tile" href="#/english/translate"><b>Dịch 10 câu</b><small>Luyện dịch Anh ↔ Việt</small></a>
    <a class="tile" href="#/english/explain"><b>Nói 30 giây</b><small>Giải thích một thuật ngữ</small></a>
  </div>
  <h3>Chủ đề yếu</h3>
  <div class="card">${weak.length ? `<ul class="list">${weak.map(w => `<li><a href="#/exam/mcq?los=${encodeURIComponent(w.los)}"><span class="pill bad">${w.acc}%</span><span>${esc(losName(w.los))}</span></a></li>`).join('')}</ul>`
      : `<p class="muted">Chưa đủ dữ liệu. Làm thêm câu hỏi (mỗi LOS ít nhất 3 lượt) để tool chỉ ra chủ đề yếu.</p>`}</div>
  ${priv ? '' : `<div class="note">Bộ ${S.data.mcq.length} câu MCQ hiện có là câu tự soạn. Để thêm 453 câu Gleim có giải thích tiếng Việt, vào <a href="#/data">Dữ liệu</a> và nhập file <b>CMA_data_private.xlsx</b>.</div>`}
  <div id="install"></div>
  `);
  renderInstall();
});

/* ---------- ENGLISH ---------- */
function topics() {
  const m = {};
  for (const v of S.data.vocab) { m[v.topic] = m[v.topic] || []; m[v.topic].push(v); }
  return m;
}
on(/^\/english$/, () => {
  setTitle('Tiếng Anh kế toán');
  const tp = topics(); const t = today();
  render(`
  <div class="grid">
    <a class="tile" href="#/english/cards"><b>🃏 Thẻ từ hôm nay</b><small>${dueCards().length} đến hạn · ${Math.min(newLeft(), newCards().length)} từ mới</small></a>
    <a class="tile" href="#/english/read"><b>📖 Đọc song ngữ</b><small>Từ → câu → đoạn</small></a>
    <a class="tile" href="#/english/dict"><b>✍️ Nghe – chép</b><small>Nghe rồi gõ lại</small></a>
    <a class="tile" href="#/english/speak"><b>🎙 Nói theo</b><small>Nghe mẫu, ghi âm, so sánh</small></a>
    <a class="tile" href="#/english/translate"><b>🔁 Luyện dịch</b><small>Anh → Việt và Việt → Anh</small></a>
    <a class="tile" href="#/english/explain"><b>🗣 Giải thích 30 giây</b><small>Nói về một thuật ngữ bằng tiếng Anh</small></a>
    <a class="tile" href="#/english/glossary"><b>📚 Từ điển</b><small>${S.data.vocab.length} thuật ngữ + ${S.data.glossary.length} từ chung trong đề</small></a>
  </div>
  ${viCtl()}
  <h3>Từ vựng theo chủ đề</h3>
  <div class="card"><ul class="list">${Object.entries(tp).map(([k, list]) => {
    const learned = list.filter(v => S.prog.srs[v.id] && S.prog.srs[v.id].b >= 3).length;
    const due = list.filter(v => S.prog.srs[v.id] && S.prog.srs[v.id].d <= t).length;
    return `<li><a href="#/english/words?topic=${encodeURIComponent(k)}"><span style="flex:1">${esc(k)}<br><small class="muted">${list.length} từ · đã thuộc ${learned}${due ? ` · <b>${due} đến hạn</b>` : ''}</small></span><div class="bar" style="width:70px"><i style="width:${pct(learned, list.length)}%"></i></div></a></li>`;
  }).join('')}</ul></div>`);
});

on(/^\/english\/words$/, (_, q) => {
  const list = S.data.vocab.filter(v => !q.topic || v.topic === q.topic);
  setTitle(q.topic || 'Từ vựng');
  render(`
  <div class="row" style="margin-bottom:12px"><a class="btn primary" href="#/english/cards?topic=${encodeURIComponent(q.topic || '')}">🃏 Học thẻ chủ đề này</a>
  <a class="btn" href="#/english/cards?topic=${encodeURIComponent(q.topic || '')}&all=1">Ôn lại tất cả</a>
  <a class="btn" href="#/english/dict?src=vocab&topic=${encodeURIComponent(q.topic || '')}">✍️ Nghe – chép câu ví dụ</a></div>
  <input type="text" id="wsearch" placeholder="Tìm từ hoặc nghĩa..." style="width:100%;margin-bottom:12px">
  <div class="card"><ul class="list" id="wlist">${list.map(v => wordRow(v)).join('')}</ul></div>`);
  $('#wsearch').oninput = e => {
    const s = e.target.value.toLowerCase();
    $('#wlist').innerHTML = list.filter(v => (v.term + ' ' + v.vi_meaning).toLowerCase().includes(s)).map(wordRow).join('');
  };
});
function wordRow(v) {
  const s = S.prog.srs[v.id];
  return `<li><a href="#/english/word/${encodeURIComponent(v.id)}"><span style="flex:1"><b>${esc(v.term)}</b> <span class="ipa small">${esc(v.ipa)}</span><br><small class="muted">${esc(v.vi_meaning)}</small></span>${s ? `<span class="pill ${s.b >= 3 ? 'ok' : ''}">hộp ${s.b}</span>` : ''}</a></li>`;
}
function cardBack(v) {
  return `
    <div class="term">${esc(v.term)}</div>
    <div class="row"><span class="ipa">${esc(v.ipa)}</span><span class="pill">${esc(v.word_type)}</span>${sayBtns(v.term)}</div>
    <p style="font-size:20px;font-weight:650;margin-top:10px">${esc(v.vi_meaning)}</p>
    ${v.vi_avoid ? `<p class="small muted">Tránh dịch: ${esc(v.vi_avoid)}</p>` : ''}
    ${v.en_def ? `<h3>Định nghĩa tiếng Anh đơn giản</h3><p class="en">${spk(v.en_def)} ${sayBtns(v.en_def)}</p>` : ''}
    ${v.confusable ? `<p class="small"><span class="pill warn">Dễ nhầm</span> ${esc(v.confusable)}</p>` : ''}
    <h3>Trong đề thi CMA</h3>
    <p class="en">${spk(v.exam_example_en)} ${sayBtns(v.exam_example_en)}</p>
    ${viBlock(v.exam_example_vi, true)}
    <h3>Trong công việc CFO</h3>
    <p class="en">${spk(v.cfo_example_en)} ${sayBtns(v.cfo_example_en)}</p>
    ${viBlock(v.cfo_example_vi, true)}
    <div class="row small" style="margin-top:10px">${v.los && v.los !== 'general' ? `<a href="#/know/${encodeURIComponent(v.los)}" class="pill">${esc(shortLos(v.los))}</a>` : ''}<span class="pill">${esc(v.topic)}</span>${srcPill(v)}</div>`;
}
on(/^\/english\/word\/(.+)$/, ([id]) => {
  const v = S.byId.vocab[id]; if (!v) return render('<p>Không tìm thấy từ.</p>');
  setTitle(v.term);
  render(`<div class="card">${cardBack(v)}</div>
  <div class="row"><a class="btn" href="#/english/explain?id=${encodeURIComponent(v.id)}">🗣 Giải thích từ này trong 30 giây</a><a class="btn" href="#/english/glossary?q=${encodeURIComponent(v.term.replace(/\s*\(.*$/, ''))}">📚 Tìm trong từ điển</a></div>`);
  if (S.settings.autoSpeak) TTS.speak(v.term);
});

let flash = null;
on(/^\/english\/cards$/, (_, q) => {
  const key = JSON.stringify(q);
  if (!flash || flash.key !== key) {
    const pool = S.data.vocab.filter(v => !q.topic || v.topic === q.topic);
    let queue;
    if (q.all) queue = shuffle(pool);
    else {
      const due = shuffle(dueCards(pool));
      const fresh = newCards(pool).slice(0, newLeft());
      queue = due.concat(fresh);
    }
    flash = { key, queue: queue.map(v => v.id), i: 0, flipped: false, done: 0, right: 0, topic: q.topic };
  }
  drawFlash();
});
function drawFlash() {
  setTitle(flash.topic ? `Thẻ: ${flash.topic}` : 'Thẻ từ hôm nay');
  if (flash.i >= flash.queue.length) {
    render(`<div class="card"><h2>Xong! 🎉</h2><p>Bạn đã ôn ${flash.done} lượt thẻ, nhớ ${flash.right}.</p>
    ${flash.queue.length === 0 ? `<p class="muted">Không có thẻ đến hạn hoặc đã hết hạn mức từ mới hôm nay (${esc(S.settings.newPerDay)} từ). Có thể chọn "Ôn lại tất cả" trong từng chủ đề.</p>` : ''}
    <div class="row"><a class="btn primary" href="#/english">Về trang Tiếng Anh</a><a class="btn" href="#/exam/mcq?mode=random&n=10">Làm 10 câu MCQ</a></div></div>`);
    flash = null; return;
  }
  const v = S.byId.vocab[flash.queue[flash.i]];
  const isNew = !S.prog.srs[v.id];
  render(`
  <div class="row small muted" style="margin-bottom:8px"><span>Thẻ ${flash.i + 1}/${flash.queue.length}</span>${isNew ? '<span class="pill warn">từ mới</span>' : `<span class="pill">hộp ${S.prog.srs[v.id].b}</span>`}</div>
  <div class="card flash" id="fc">
    ${flash.flipped ? cardBack(v) : `
      <div class="term">${esc(v.term)}</div>
      <div class="row"><span class="ipa">${esc(v.ipa)}</span><span class="pill">${esc(v.word_type)}</span>${sayBtns(v.term)}</div>
      <p class="muted small">Đoán nghĩa tiếng Việt, rồi bấm "Lật thẻ".</p>`}
  </div>
  <div class="row">${flash.flipped
      ? `<button class="bad" id="fNo" style="flex:1">✗ Chưa nhớ</button><button class="ok" id="fYes" style="flex:1">✓ Nhớ rồi</button>`
      : `<button class="primary" id="fFlip" style="flex:1">Lật thẻ</button>`}</div>`);
  if (!flash.flipped && S.settings.autoSpeak) TTS.speak(v.term);
  const flip = () => { flash.flipped = true; drawFlash(); };
  $('#fFlip') && ($('#fFlip').onclick = flip);
  $('#fYes') && ($('#fYes').onclick = () => answerCard(v, true));
  $('#fNo') && ($('#fNo').onclick = () => answerCard(v, false));
}
function answerCard(v, ok) {
  const t = today();
  let s = S.prog.srs[v.id];
  if (!s) { s = S.prog.srs[v.id] = { b: 0, d: t, r: 0, w: 0 }; const nd = S.prog.newDay; if (nd.d !== t) { nd.d = t; nd.n = 0; } nd.n++; }
  if (ok) { s.b = Math.min(5, s.b + 1); s.d = addDays(BOX_DAYS[s.b]); s.r++; flash.right++; }
  else { s.b = 1; s.d = t; s.w++; flash.queue.splice(Math.min(flash.i + 4, flash.queue.length), 0, v.id); }
  flash.done++; flash.i++; flash.flipped = false; logStudy('cards'); saveProg(); drawFlash();
}

/* Reading (bilingual) */
function passages() {
  const m = new Map();
  for (const s of S.data.sentences) {
    if (!m.has(s.passage_id)) m.set(s.passage_id, { id: s.passage_id, title: s.passage_title || s.passage_id, los: s.los, level: s.level, sents: [] });
    m.get(s.passage_id).sents.push(s);
  }
  for (const p of m.values()) p.sents.sort((a, b) => a.order - b.order);
  return [...m.values()];
}
on(/^\/english\/read$/, () => {
  setTitle('Đọc song ngữ');
  const ps = passages();
  render(`<p class="muted small">Đi từ câu ngắn (cấp 1) đến đoạn dài hơn (cấp 3). Bấm vào một từ bất kỳ để nghe từ đó.</p>
  <div class="card"><ul class="list">${ps.map(p => `<li><a href="#/english/read/${encodeURIComponent(p.id)}"><span class="pill">Cấp ${esc(p.level)}</span><span style="flex:1">${esc(p.title)}<br><small class="muted">${esc(shortLos(p.los))} · ${p.sents.length} câu</small></span></a></li>`).join('')}</ul></div>`);
});
on(/^\/english\/read\/(.+)$/, ([pid]) => {
  const p = passages().find(x => x.id === pid); if (!p) return render('<p>Không tìm thấy đoạn văn.</p>');
  setTitle(p.title);
  const lv = viLv();
  render(`
  <div class="row" style="margin-bottom:12px">
    <button class="primary" id="playAll">▶ Đọc cả đoạn</button><button id="playSlow">🐢 Đọc chậm</button>
  </div>
  ${viCtl()}
  <div class="card" id="sents">${p.sents.map((s, i) => `
    <div class="sent" data-i="${i}"><div class="en">${spk(s.en)} ${sayBtns(s.en)}${lv === 2 ? `<button type="button" class="say viT" aria-label="Xem nghĩa câu này">VI</button>` : ''}</div><div class="vi" ${lv === 1 ? '' : 'hidden'}>${esc(s.vi)}</div></div>`).join('')}
  </div>
  ${lv === 3 ? '<div class="row" style="margin-bottom:12px"><button id="allVi">Đọc xong – hiện bản dịch cả đoạn</button></div>' : ''}
  <div class="row"><a class="btn" href="#/english/dict?src=passage&id=${encodeURIComponent(p.id)}">✍️ Nghe – chép đoạn này</a><a class="btn" href="#/english/speak?src=passage&id=${encodeURIComponent(p.id)}">🎙 Nói theo đoạn này</a>
  ${S.byLos[p.los] ? `<a class="btn" href="#/know/${encodeURIComponent(p.los)}">📘 LOS ${esc(shortLos(p.los))}</a>` : ''}</div>`);
  const play = slow => TTS.queue(p.sents.map(s => s.en), {
    slow, onEach: i => $$('.sent').forEach(el => el.classList.toggle('playing', +el.dataset.i === i))
  });
  $('#playAll').onclick = () => play(false);
  $('#playSlow').onclick = () => play(true);
  $$('.viT').forEach(b => b.onclick = () => { const el = $('.vi', b.closest('.sent')); el.hidden = !el.hidden; });
  const allVi = $('#allVi'); if (allVi) allVi.onclick = () => $$('#sents .vi').forEach(el => { el.hidden = false; });
  logStudy('read'); saveProg();
});

/* Dictation */
function sentencePool(q) {
  if (q.src === 'passage' && q.id) return S.data.sentences.filter(s => s.passage_id === q.id).sort((a, b) => a.order - b.order).map(s => ({ id: s.id, en: s.en, vi: s.vi }));
  if (q.src === 'vocab') return shuffle(S.data.vocab.filter(v => !q.topic || v.topic === q.topic).flatMap(v => [
    { id: v.id + ':x', en: v.exam_example_en, vi: v.exam_example_vi }, { id: v.id + ':c', en: v.cfo_example_en, vi: v.cfo_example_vi }]).filter(s => s.en)).slice(0, 10);
  if (q.src === 'cfo') return S.data.cfo.filter(c => !q.id || c.situation_id === q.id).map(c => ({ id: 'cfo:' + c.id, en: c.phrase_en, vi: c.phrase_vi }));
  // mặc định: 5 câu ngẫu nhiên, ưu tiên câu ngắn cho người mới
  const all = S.data.sentences.map(s => ({ id: s.id, en: s.en, vi: s.vi, lvl: +s.level || 1 }));
  return shuffle(all).sort((a, b) => a.lvl - b.lvl).slice(0, 20).sort(() => Math.random() - .5).slice(0, 5);
}
let dict = null;
on(/^\/english\/dict$/, (_, q) => {
  const key = JSON.stringify(q);
  if (!dict || dict.key !== key) dict = { key, list: sentencePool(q), i: 0, scores: [] };
  drawDict();
});
function drawDict() {
  setTitle('Nghe – chép');
  if (dict.i >= dict.list.length) {
    const avg = dict.scores.length ? Math.round(dict.scores.reduce((a, b) => a + b, 0) / dict.scores.length) : 0;
    render(`<div class="card"><h2>Xong ${dict.list.length} câu</h2><p>Điểm trung bình: <b>${avg}%</b></p><div class="row"><button class="primary" id="again">Làm 5 câu khác</button><a class="btn" href="#/english">Về Tiếng Anh</a></div></div>`);
    $('#again').onclick = () => { dict = null; route(); }; return;
  }
  const s = dict.list[dict.i];
  render(`
  <p class="muted small">Câu ${dict.i + 1}/${dict.list.length}. Nghe rồi gõ lại câu tiếng Anh. Số tiền gõ như 1000 hoặc 1,000 đều được.</p>
  <div class="card">
    <div class="row"><button class="primary" id="dPlay">🔊 Nghe</button><button id="dSlow">🐢 Nghe chậm</button></div>
    <textarea id="dIn" placeholder="Gõ câu bạn nghe được..." autocapitalize="off" autocomplete="off" spellcheck="false" style="margin-top:10px"></textarea>
    <div class="row"><button class="primary" id="dCheck">Kiểm tra</button><button id="dHint">Gợi ý nghĩa tiếng Việt</button></div>
    <div id="dRes"></div>
  </div>`);
  const play = slow => TTS.speak(s.en, { slow });
  $('#dPlay').onclick = () => play(false); $('#dSlow').onclick = () => play(true);
  $('#dHint').onclick = () => { $('#dRes').innerHTML = `<p class="vi">${esc(s.vi)}</p>`; };
  $('#dCheck').onclick = () => {
    const r = compare(s.en, $('#dIn').value);
    dict.scores.push(r.score);
    const d = S.prog.dict[s.id] = S.prog.dict[s.id] || { n: 0, best: 0 }; d.n++; d.best = Math.max(d.best, r.score);
    logStudy('dict'); saveProg();
    $('#dRes').innerHTML = `<h3>${r.score}% đúng</h3><p class="diff">${r.html}</p><p class="small muted">Xanh: đúng · Gạch chân đỏ: thiếu/sai · Gạch ngang: thừa</p>
      <p class="en">${spk(s.en)} ${sayBtns(s.en)}</p><p class="vi">${esc(s.vi)}</p>
      <button class="primary" id="dNext">Câu tiếp ›</button>`;
    $('#dNext').onclick = () => { dict.i++; drawDict(); };
  };
  setTimeout(() => play(false), 300);
}

/* Speaking / shadowing */
on(/^\/english\/speak$/, (_, q) => {
  setTitle('Nói theo');
  if (!q.src) {
    render(`<p class="muted small">Chọn một đoạn văn hoặc một tình huống CFO để luyện nói. Mỗi câu: nghe mẫu → ghi âm giọng mình → nghe lại so sánh.</p>
    <h3>Đoạn văn</h3><div class="card"><ul class="list">${passages().map(p => `<li><a href="#/english/speak?src=passage&id=${encodeURIComponent(p.id)}"><span class="pill">Cấp ${esc(p.level)}</span>${esc(p.title)}</a></li>`).join('')}</ul></div>
    <h3>Tình huống CFO</h3><div class="card"><ul class="list">${cfoSituations().map(c => `<li><a href="#/english/speak?src=cfo&id=${encodeURIComponent(c.id)}">${esc(c.title_vi)}</a></li>`).join('')}</ul></div>`);
    return;
  }
  const list = sentencePool(q);
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  render(`
  <div class="note small">Ghi âm chạy offline, lưu tạm trên máy. ${SR ? 'Nút "Chấm" dùng nhận dạng giọng nói của trình duyệt và <b>cần có mạng</b>.' : 'Trình duyệt này không có nhận dạng giọng nói, nên chỉ nghe lại để tự so sánh.'}</div>
  ${list.map((s, i) => `
  <div class="card" data-i="${i}">
    <p class="en">${spk(s.en)}</p><p class="vi small">${esc(s.vi)}</p>
    <div class="row">${sayBtns(s.en)}<button class="rec" data-i="${i}">🎙 Ghi âm</button>${SR ? `<button class="sr" data-i="${i}">✓ Chấm</button>` : ''}</div>
    <div class="out"></div>
  </div>`).join('')}`);
  let rec = null, chunks = [];
  $$('.rec').forEach(b => b.onclick = async () => {
    const box = b.closest('.card');
    if (rec && rec.state === 'recording') { rec.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { toast('Thiết bị không hỗ trợ ghi âm trong trình duyệt.'); return; }
    try {
      TTS.stop();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = []; rec = new MediaRecorder(stream);
      rec.ondataavailable = e => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop()); b.textContent = '🎙 Ghi âm';
        const url = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
        $('.out', box).innerHTML = `<div class="row small" style="margin-top:8px"><span>Giọng của bạn:</span><audio controls src="${url}"></audio></div>`;
        logStudy('speak'); saveProg();
      };
      rec.start(); b.textContent = '⏹ Dừng';
    } catch (e) { toast('Không mở được micro. Hãy cho phép quyền micro cho trang này.'); }
  });
  $$('.sr').forEach(b => b.onclick = () => {
    const s = list[+b.dataset.i]; const box = b.closest('.card');
    const r = new SR(); r.lang = 'en-US'; r.interimResults = false; r.maxAlternatives = 1;
    b.textContent = '… đang nghe';
    r.onresult = e => {
      const said = e.results[0][0].transcript; const c = compare(s.en, said);
      $('.out', box).insertAdjacentHTML('beforeend', `<p><b>${c.score}%</b> · máy nghe được: "${esc(said)}"</p><p class="diff">${c.html}</p>`);
    };
    r.onerror = e => toast(e.error === 'network' ? 'Chấm phát âm cần có mạng.' : 'Không nhận được giọng nói: ' + e.error);
    r.onend = () => { b.textContent = '✓ Chấm'; };
    try { TTS.stop(); r.start(); } catch (e) { b.textContent = '✓ Chấm'; }
  });
});

/* Từ điển: thuật ngữ CMA (vocab) + từ chung trong đề (glossary) */
const SIG_VI = { neg: ['Phủ định', 'sig-neg'], key: ['Nhấn mạnh, so sánh', 'sig-key'], cond: ['Điều kiện, giả định', 'sig-cond'] };
on(/^\/english\/glossary$/, (_, q) => {
  setTitle('Từ điển');
  const f = q.f || '';
  const all = [
    ...S.data.vocab.map(v => ({ k: 'cma', w: v.term, pos: v.word_type, vi: v.vi_meaning, def: v.en_def, ipa: v.ipa, id: v.id, conf: v.confusable })),
    ...S.data.glossary.map(g => ({ k: 'gen', w: g.word, pos: g.pos, vi: g.vi, sig: SIG[String(g.word).toLowerCase()] }))
  ];
  const segs = [['', 'Tất cả'], ['cma', `Thuật ngữ CMA (${S.data.vocab.length})`], ['gen', `Từ chung (${S.data.glossary.length})`], ['sig', 'Từ tín hiệu trong đề']];
  render(`
  <div class="seg">${segs.map(([k, l]) => `<a href="#/english/glossary${k ? '?f=' + k : ''}" class="${f === k ? 'on' : ''}">${l}</a>`).join('')}</div>
  <p class="small muted">Danh sách lấy từ chính các câu đề trong tool. Nghĩa tiếng Việt và định nghĩa tiếng Anh do AI biên soạn ${aiPill('cần xác minh')}. Chạm vào từ bất kỳ trong bài đọc hoặc câu hỏi cũng tra được ở đây.</p>
  ${f === 'sig' ? `<div class="note small">Từ tín hiệu quyết định câu hỏi hỏi gì. Trong màn hình luyện thi (không tính giờ), các từ này được tô màu: <span class="sig-neg">phủ định</span>, <span class="sig-key">nhấn mạnh</span>, <span class="sig-cond">điều kiện</span>.</div>` : ''}
  <input type="text" id="gq" placeholder="Gõ từ tiếng Anh hoặc nghĩa tiếng Việt…" value="${esc(q.q || '')}" style="width:100%;margin:10px 0 12px" autocapitalize="off" autocomplete="off" spellcheck="false">
  <div class="card"><ul class="terms" id="gl"></ul><p class="small muted" id="glMore"></p></div>`);
  const fold = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  const draw = () => {
    const s = fold($('#gq').value.trim());
    let list = all.filter(r => !f || (f === 'sig' ? r.sig : r.k === f));
    if (s) list = list.filter(r => fold(r.w).includes(s) || fold(r.vi).includes(s) || (r.def && fold(r.def).includes(s)))
      .sort((a, b) => (fold(b.w).startsWith(s) - fold(a.w).startsWith(s)) || String(a.w).length - String(b.w).length);
    else list.sort((a, b) => f === 'sig' ? (a.sig.localeCompare(b.sig) || a.w.localeCompare(b.w)) : String(a.w).toLowerCase().localeCompare(String(b.w).toLowerCase()));
    const show = list.slice(0, 80);
    $('#gl').innerHTML = show.map(r => `<li><span style="flex:1">${r.k === 'cma' ? `<a href="#/english/word/${encodeURIComponent(r.id)}"><b>${esc(r.w)}</b></a> <span class="ipa small">${esc(r.ipa)}</span>` : `<b>${esc(r.w)}</b>`}
      <span class="pill">${esc(r.pos)}</span>${r.k === 'cma' ? ' <span class="pill ok">CMA</span>' : ''}${r.sig ? ` <span class="pill ${SIG_VI[r.sig][1]}">${SIG_VI[r.sig][0]}</span>` : ''}
      <br>${esc(r.vi)}${r.def ? `<br><small class="muted">${esc(r.def)}</small>` : ''}${r.conf ? `<br><small>Dễ nhầm: ${esc(r.conf)}</small>` : ''}</span>${sayBtns(String(r.w).replace(/\s*\(.*$/, ''))}</li>`).join('') || '<li class="muted">Không tìm thấy. Thử gõ dạng gốc của từ (ví dụ "recognize" thay vì "recognized").</li>';
    $('#glMore').textContent = list.length > show.length ? `Hiện ${show.length}/${list.length} mục. Gõ thêm để lọc.` : `${list.length} mục`;
  };
  $('#gq').oninput = draw; draw();
});

/* Luyện dịch Anh ↔ Việt */
function vnorm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/(\d)[.,](?=\d{3}\b)/g, '$1').replace(/[^a-z0-9%\s]/g, ' ').split(/\s+/).filter(Boolean); }
function sylOverlap(model, said) {
  const a = vnorm(model), bag = {}; vnorm(said).forEach(x => bag[x] = (bag[x] || 0) + 1);
  let hit = 0; for (const x of a) if (bag[x] > 0) { hit++; bag[x]--; }
  return pct(hit, a.length);
}
function viHit(v, said) {
  const s = ' ' + vnorm(said).join(' ') + ' ';
  return String(v.vi_meaning || '').split(/[,;/()]|\bhoặc\b/).map(x => vnorm(x).join(' ')).filter(x => x.length > 1).some(x => s.includes(' ' + x + ' '));
}
function trPool() {
  const a = S.data.sentences.filter(s => s.en && s.vi).map(s => ({ id: 's:' + s.id, en: s.en, vi: s.vi, lvl: +s.level || 1 }));
  const b = S.data.vocab.filter(v => v.exam_example_en && v.exam_example_vi).map(v => ({ id: 'v:' + v.id, en: v.exam_example_en, vi: v.exam_example_vi, lvl: 1 }));
  return a.concat(b);
}
let trs = null;
on(/^\/english\/translate$/, (_, q) => {
  const dir = q.dir === 'vi' ? 'vi' : 'en';
  const key = dir;
  if (!trs || trs.key !== key) {
    const pool = trPool();
    const fresh = shuffle(pool.filter(p => !S.prog.tr[p.id + '|' + dir])), seen = shuffle(pool.filter(p => S.prog.tr[p.id + '|' + dir])).sort((x, y) => S.prog.tr[x.id + '|' + dir].best - S.prog.tr[y.id + '|' + dir].best);
    trs = { key, dir, list: fresh.concat(seen).slice(0, 10), i: 0, scores: [] };
  }
  drawTr();
});
function drawTr() {
  setTitle('Luyện dịch');
  const dir = trs.dir;
  const tabs = `<div class="seg"><a href="#/english/translate?dir=en" class="${dir === 'en' ? 'on' : ''}">Anh → Việt</a><a href="#/english/translate?dir=vi" class="${dir === 'vi' ? 'on' : ''}">Việt → Anh</a></div>`;
  if (trs.i >= trs.list.length) {
    const avg = trs.scores.length ? Math.round(trs.scores.reduce((a, b) => a + b, 0) / trs.scores.length) : 0;
    render(`${tabs}<div class="card"><h2>Xong ${trs.list.length} câu</h2><p>Điểm máy chấm trung bình: <b>${avg}%</b></p>
      <div class="row"><button class="primary" id="trAgain">Làm 10 câu khác</button><a class="btn" href="#/english">Về Tiếng Anh</a></div></div>`);
    $('#trAgain').onclick = () => { trs = null; route(); }; return;
  }
  const s = trs.list[trs.i];
  const src = dir === 'en' ? s.en : s.vi;
  // chỉ yêu cầu thuật ngữ mà chính câu mẫu tiếng Việt cũng dùng đúng nghĩa đó (tránh chấm sai khi câu mẫu diễn đạt khác)
  const terms = findTerms(s.en).filter(v => dir === 'vi' || viHit(v, s.vi));
  render(`${tabs}
  <p class="muted small">Câu ${trs.i + 1}/${trs.list.length}. ${dir === 'en' ? 'Dịch sang tiếng Việt, gõ có dấu hoặc không dấu đều được.' : 'Dịch sang tiếng Anh. Dùng đúng thuật ngữ kế toán.'}</p>
  <div class="card">
    ${dir === 'en' ? `<p class="en">${spk(src)} ${sayBtns(src)}</p>` : `<p style="font-size:17px">${esc(src)}</p>`}
    ${dir === 'vi' && terms.length ? `<p class="small muted">Gợi ý thuật ngữ cần dùng: ${terms.map(v => `<span class="chip">${esc(v.vi_meaning)}</span>`).join(' ')}</p>` : ''}
    <textarea id="trIn" placeholder="${dir === 'en' ? 'Gõ bản dịch tiếng Việt…' : 'Type your English translation…'}" ${dir === 'vi' ? 'autocapitalize="off" spellcheck="false"' : ''}></textarea>
    <div class="row"><button class="primary" id="trCheck">Chấm</button><button id="trSkip">Bỏ qua, xem đáp án</button></div>
    <div id="trRes"></div>
  </div>
  <p class="small muted">Giới hạn: máy chỉ so thuật ngữ bắt buộc và mức trùng từ với câu mẫu. Câu dịch diễn đạt khác vẫn có thể đúng, chị tự đánh giá thêm. Câu mẫu do AI biên soạn, cần xác minh.</p>`);
  const check = skip => {
    const said = $('#trIn').value.trim();
    const hits = terms.map(v => ({ v, ok: !skip && (dir === 'en' ? viHit(v, said) : termHit(v, said)) }));
    let ov, diff = '';
    if (dir === 'en') ov = skip ? 0 : sylOverlap(s.vi, said);
    else { const c = compare(s.en, skip ? '' : said); ov = c.score; diff = c.html; }
    const score = skip ? 0 : hits.length ? Math.round(0.6 * ov + 0.4 * pct(hits.filter(h => h.ok).length, hits.length)) : ov;
    trs.scores.push(score);
    const k = s.id + '|' + dir; const r = S.prog.tr[k] = S.prog.tr[k] || { n: 0, best: 0 }; r.n++; r.best = Math.max(r.best, score);
    logStudy('tr'); saveProg();
    $('#trRes').innerHTML = `<h3>${skip ? 'Đáp án tham khảo' : `Máy chấm: ${score}%`}</h3>
      ${hits.length ? `<p class="small">Thuật ngữ: ${hits.map(h => `<span class="pill ${h.ok ? 'ok' : 'bad'}">${h.ok ? '✓' : '✗'} ${esc(dir === 'en' ? h.v.vi_meaning : h.v.term)}</span>`).join(' ')}</p>` : ''}
      ${!skip ? `<p class="small muted">Trùng với câu mẫu: ${ov}%</p>` : ''}
      ${diff && !skip ? `<p class="diff">${diff}</p>` : ''}
      <p class="en">${spk(s.en)} ${sayBtns(s.en)}</p><p class="vi">${esc(s.vi)}</p>
      <div class="row small">${aiPill('Câu mẫu: AI biên soạn – cần xác minh')}</div>
      <button class="primary" id="trNext" style="margin-top:8px">Câu tiếp ›</button>`;
    $('#trCheck').disabled = true; $('#trSkip').disabled = true;
    $('#trNext').onclick = () => { trs.i++; drawTr(); };
  };
  $('#trCheck').onclick = () => { if (!$('#trIn').value.trim()) { toast('Chị gõ bản dịch trước rồi bấm Chấm.'); return; } check(false); };
  $('#trSkip').onclick = () => check(true);
}

/* Giải thích một thuật ngữ trong 30 giây */
const STOP = new Set('that which with from when this have their there into over more than also they such other used uses using each what does some been being were will about after before under between where while your these those them then only must should would could shown shows show often usually because amount amounts'.split(' '));
function defKeywords(v) {
  const out = []; const seen = new Set();
  for (const w of String(v.en_def || '').match(/[A-Za-z][A-Za-z'-]+/g) || []) {
    const k = w.toLowerCase(); if (k.length < 4 || STOP.has(k) || seen.has(k)) continue; seen.add(k); out.push(w);
  }
  return out.slice(0, 6);
}
let onLeave = null;
on(/^\/english\/explain$/, (_, q) => {
  setTitle('Giải thích 30 giây');
  let v = q.id && S.byId.vocab[q.id];
  if (!v) {
    const learned = S.data.vocab.filter(x => x.en_def && S.prog.srs[x.id] && S.prog.srs[x.id].b >= 1);
    const pool = learned.length >= 5 ? learned : S.data.vocab.filter(x => x.en_def);
    const fresh = pool.filter(x => !S.prog.explain[x.id]);
    v = shuffle(fresh.length ? fresh : pool)[0];
  }
  if (!v) return render('<p>Chưa có thuật ngữ.</p>');
  const kw = defKeywords(v);
  const name = String(v.term).replace(/\s*\([^)]*\)/g, '');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const st = S.prog.explain[v.id];
  render(`
  <div class="card">
    <div class="term">${esc(v.term)}</div>
    <div class="row"><span class="ipa">${esc(v.ipa)}</span>${sayBtns(v.term)}${st ? `<span class="pill">đã nói ${st.n} lần</span>` : ''}</div>
    <p class="vi">${esc(v.vi_meaning)}</p>
  </div>
  <div class="card">
    <h3 style="margin-top:0">Dàn ý gợi ý (nói 3–4 câu)</h3>
    <ol class="small">
      <li><b>${esc(name)}</b> is / means … <span class="muted">(định nghĩa)</span></li>
      <li>It is used when / It affects … <span class="muted">(dùng khi nào, ảnh hưởng gì)</span></li>
      <li>For example, … <span class="muted">(ví dụ trong đề hoặc ở công ty)</span></li>
      <li>In our company, … <span class="muted">(liên hệ công việc CFO, nếu được)</span></li>
    </ol>
    ${kw.length ? `<p class="small">Từ khóa nên dùng: ${kw.map(k => `<span class="chip">${esc(k)}</span>`).join(' ')}</p>` : ''}
  </div>
  <div class="card">
    <div class="row"><button class="primary" id="exRec">🎙 Bắt đầu nói 30 giây</button><span class="timer big" id="exT">0:30</span></div>
    <div id="exOut"></div>
  </div>
  <div class="card" id="exModel" hidden>
    <h3 style="margin-top:0">Câu mẫu để so sánh</h3>
    ${v.en_def ? `<p class="en">${spk(name + ': ' + v.en_def)} ${sayBtns(name + '. ' + v.en_def)}</p>` : ''}
    ${v.exam_example_en ? `<p class="en">${spk(v.exam_example_en)} ${sayBtns(v.exam_example_en)}</p>` : ''}
    ${v.cfo_example_en ? `<p class="en">${spk(v.cfo_example_en)} ${sayBtns(v.cfo_example_en)}</p>` : ''}
    <div class="row small">${aiPill('Câu mẫu: AI biên soạn – cần xác minh')}</div>
    ${SR ? `<div class="row" style="margin-top:10px"><button id="exSR">✓ Nói lại để máy đếm từ khóa (cần mạng)</button></div><div id="exSRo"></div>` : '<p class="small muted">Trình duyệt này không có nhận dạng giọng nói, chị nghe lại bản ghi để tự so sánh.</p>'}
  </div>
  <div class="row"><button id="exNext">Từ khác ›</button><button id="exShow">Xem câu mẫu</button><a class="btn" href="#/english/word/${encodeURIComponent(v.id)}">Xem thẻ từ</a></div>
  <p class="small muted">Ghi âm chạy offline và chỉ lưu tạm trên máy, không gửi đi đâu.</p>`);
  let rec = null, stream = null, tmr = null, endAt = 0;
  const stopAll = () => { clearInterval(tmr); if (rec && rec.state === 'recording') rec.stop(); else if (stream) stream.getTracks().forEach(t => t.stop()); };
  onLeave = stopAll;
  const showModel = () => { $('#exModel').hidden = false; };
  $('#exShow').onclick = showModel;
  $('#exNext').onclick = () => { stopAll(); location.hash = '#/english/explain?r=' + Date.now().toString(36); };
  $('#exRec').onclick = async () => {
    const b = $('#exRec');
    if (rec && rec.state === 'recording') { stopAll(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { toast('Thiết bị không hỗ trợ ghi âm trong trình duyệt. Chị vẫn có thể nói to rồi bấm "Xem câu mẫu".'); return; }
    try {
      TTS.stop();
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = []; rec = new MediaRecorder(stream);
      rec.ondataavailable = e => chunks.push(e.data);
      rec.onstop = () => {
        clearInterval(tmr); stream.getTracks().forEach(t => t.stop());
        if (!$('#exOut') || !document.body.contains(b)) return; // đã rời trang
        b.textContent = '🎙 Nói lại 30 giây'; $('#exT').textContent = '0:30';
        const used = Math.min(30, Math.round((30e3 - Math.max(0, endAt - Date.now())) / 1e3));
        const url = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
        $('#exOut').innerHTML = `<div class="row small" style="margin-top:8px"><span>Giọng của chị (${used} giây):</span><audio controls src="${url}"></audio></div>
          <p class="small muted">Nghe lại, so với câu mẫu bên dưới: đã nói đủ định nghĩa, ví dụ và từ khóa chưa?</p>`;
        const e = S.prog.explain[v.id] = S.prog.explain[v.id] || { n: 0 }; e.n++; e.d = today();
        logStudy('speak'); saveProg(); showModel();
      };
      rec.start(); endAt = Date.now() + 30e3; b.textContent = '⏹ Dừng sớm';
      tmr = setInterval(() => {
        const left = Math.max(0, endAt - Date.now()); const el = $('#exT');
        if (el) el.textContent = `0:${String(Math.ceil(left / 1e3)).padStart(2, '0')}`;
        if (!left) stopAll();
      }, 250);
    } catch (e) { toast('Không mở được micro. Hãy cho phép quyền micro cho trang này.'); }
  };
  const srb = $('#exSR');
  const runSR = () => {
    const r = new SR(); r.lang = 'en-US'; r.continuous = true; r.interimResults = false;
    let said = ''; srb.textContent = '… đang nghe (bấm lại để dừng)'; srb.onclick = () => r.stop();
    const cap = setTimeout(() => r.stop(), 30e3);
    onLeave = () => { clearTimeout(cap); try { r.abort(); } catch (e) { } };
    r.onresult = e => { said = [...e.results].map(x => x[0].transcript).join(' '); };
    r.onerror = e => toast(e.error === 'network' ? 'Đếm từ khóa cần có mạng.' : 'Không nhận được giọng nói: ' + e.error);
    r.onend = () => {
      clearTimeout(cap); if (!document.body.contains(srb)) return;
      srb.textContent = '✓ Nói lại để máy đếm từ khóa (cần mạng)'; srb.onclick = runSR;
      const low = ' ' + said.toLowerCase() + ' ';
      const want = [name.toLowerCase(), ...kw.map(k => k.toLowerCase())];
      $('#exSRo').innerHTML = said ? `<p class="small">Máy nghe được: "${esc(said)}"</p><p class="small">${want.map(k => `<span class="pill ${low.includes(k.replace(/s$/, '')) ? 'ok' : 'bad'}">${low.includes(k.replace(/s$/, '')) ? '✓' : '✗'} ${esc(k)}</span>`).join(' ')}</p><p class="small muted">Máy chỉ đếm từ khóa, không chấm ngữ pháp hay ý.</p>` : '<p class="small muted">Chưa nghe được gì.</p>';
    };
    try { TTS.stop(); r.start(); } catch (e) { srb.textContent = '✓ Nói lại để máy đếm từ khóa (cần mạng)'; srb.onclick = runSR; }
  };
  if (srb) srb.onclick = runSR;
});

/* ---------- KNOWLEDGE ---------- */
on(/^\/know$/, (_, q) => {
  setTitle('Kiến thức theo LOS');
  const f = q.f || '';
  const st = losStats();
  const list = S.data.los.filter(l => !f || l.coverage === f).sort((a, b) => losOrder(a.los) - losOrder(b.los));
  const groups = {};
  for (const l of list) { const g = l.los.split('.').slice(0, 3).join('.'); (groups[g] = groups[g] || []).push(l); }
  const GN = { '1.A.1': 'A.1 Financial statements – Báo cáo tài chính', '1.A.2': 'A.2 Recognition, measurement, valuation – Ghi nhận, đo lường, đánh giá' };
  render(`
  <div class="seg">${['', 'Đủ', 'Một phần', 'Thiếu', 'Lệch'].map(x => `<a href="#/know${x ? '?f=' + encodeURIComponent(x) : ''}" class="${f === x ? 'on' : ''}">${x || 'Tất cả'}</a>`).join('')}</div>
  <p class="small muted">Nhãn cho biết bài giảng Smart Train có phủ LOS này không. "Thiếu"/"Lệch" là phần em đã soạn bổ sung theo LOS IMA 01/09/2024, cần chị đối chiếu.</p>
  ${Object.entries(groups).map(([g, ls]) => `<h3>${esc(GN[g] || g)}</h3><div class="card"><ul class="list">${ls.map(l => {
    const s = st[l.los];
    return `<li><a href="#/know/${encodeURIComponent(l.los)}"><b style="min-width:52px">${esc(shortLos(l.los))}</b><span style="flex:1">${esc(l.title_en)}<br><small class="muted">${esc(l.title_vi)}</small></span>${s ? `<span class="pill ${pct(s.c, s.n) >= 70 ? 'ok' : 'bad'}">${pct(s.c, s.n)}%</span>` : ''}${coverPill(l.coverage)}</a></li>`;
  }).join('')}</ul></div>`).join('')}`);
});
function losOrder(code) {
  const p = String(code).split('.'); const last = p[3] || '';
  const n = last.length === 2 ? 26 + (last.charCodeAt(0) - 97) : last.charCodeAt(0) - 97;
  return (p[0] | 0) * 1e6 + ((p[1] || 'A').charCodeAt(0)) * 1e4 + (+p[2] || 0) * 100 + n;
}
on(/^\/know\/(.+)$/, ([code]) => {
  const l = S.byLos[code]; if (!l) return render('<p>Không tìm thấy LOS.</p>');
  setTitle('LOS ' + shortLos(code));
  const nq = S.data.mcq.filter(x => x.los === code).length;
  const nv = S.data.vocab.filter(x => x.los === code);
  const cb = [...new Set(S.data.cbq.filter(x => String(x.los).split(/[,; ]+/).includes(code)).map(x => x.case_id))];
  const ps = passages().filter(p => p.los === code);
  render(`
  <div class="card">
    <div class="row"><b>${esc(shortLos(code))}</b>${coverPill(l.coverage)}${srcPill(l)}</div>
    <h2 class="en" style="margin-top:8px">${spk(l.title_en)} ${sayBtns(l.title_en)}</h2>
    <p class="vi">${esc(l.title_vi)}</p>
  </div>
  <div class="card"><div class="row"><h3 style="margin:0;flex:1">Tóm tắt (tiếng Anh)</h3>${aiPill('AI biên soạn – cần xác minh')}</div>
    ${splitSent(l.summary_en).map(s => `<p class="en">${spk(s)} ${sayBtns(s)}</p>`).join('')}
    <details ${viLv() === 1 ? 'open' : ''}><summary>Bản tiếng Việt</summary><p>${esc(l.summary_vi)}</p></details>
  </div>
  ${kpRowsOf(code).length ? `<div class="card"><div class="row"><h3 style="margin:0;flex:1">Bài giảng Smart Train</h3>${kpPill('st')}</div>${viCtl()}${kpLecture(code)}</div>
  ${kpSupplement(code) ? `<div class="card"><h3 style="margin-top:0">Bổ sung theo IMA và ghi chú lệch</h3>${kpSupplement(code)}</div>` : ''}` : ''}
  ${l.smarttrain_ref ? `<div class="card"><div class="row"><h3 style="margin:0;flex:1">Smart Train</h3><span class="pill">${esc(SRC.st[0])}</span></div><p>${esc(l.smarttrain_ref)}</p></div>` : ''}
  ${l.vas_compare ? `<div class="card"><h3 style="margin-top:0">So sánh với VAS</h3><p>${esc(l.vas_compare)}</p></div>` : ''}
  ${l.ifrs_compare ? `<div class="card"><h3 style="margin-top:0">US GAAP và IFRS</h3><p>${esc(l.ifrs_compare)}</p></div>` : ''}
  <div class="row">
    <a class="btn primary" href="#/study/${encodeURIComponent(code)}">📖 Học tích hợp${S.byId.lessons?.[code] ? (S.byId.lessons[code].layout === 'st' ? ' (bài giảng slide + 11 phần)' : ' (bài 13 phần)') : ''}</a>
    ${nq ? `<a class="btn" href="#/exam/mcq?los=${encodeURIComponent(code)}">📝 Luyện ${nq} câu MCQ</a>` : '<span class="muted small">Chưa có câu MCQ cho LOS này.</span>'}
    ${cb.map(c => `<a class="btn" href="#/exam/cbq/${encodeURIComponent(c)}">📋 CBQ ${esc(c)}</a>`).join('')}
    ${ps.map(p => `<a class="btn" href="#/english/read/${encodeURIComponent(p.id)}">📖 ${esc(p.title)}</a>`).join('')}
  </div>
  ${conceptList(code)}
  ${nv.length ? `<h3>Từ vựng của LOS này</h3><div class="card"><ul class="list">${nv.map(wordRow).join('')}</ul></div>` : ''}`);
});

/* ---------- v1.2 – giai đoạn b: khóa học, bài học 13 phần, khái niệm, công thức, QC ---------- */
const DIFF_VI = { 1: 'Dễ', 2: 'Vừa', 3: 'Khó' };
const TYPE_Q_VI = { MCQ: 'Lý thuyết', Calculation: 'Tính toán', Case: 'Tình huống' };
const SECTIONS = [['A', 'External Financial Reporting Decisions', 'Báo cáo tài chính bên ngoài', 15], ['B', 'Planning, Budgeting, and Forecasting', 'Lập kế hoạch, ngân sách và dự báo', 20],
  ['C', 'Performance Management', 'Quản trị hiệu quả hoạt động', 20], ['D', 'Cost Management', 'Quản trị chi phí', 15], ['E', 'Internal Controls', 'Kiểm soát nội bộ', 15], ['F', 'Technology and Analytics', 'Công nghệ và phân tích dữ liệu', 15]];
/* 20 câu mẫu để chị duyệt (đủ 6 Unit, đủ 3 dạng, gồm câu bị gắn cờ) */
const REVIEW_SAMPLE = ['A-U1-3-011', 'A-U4-2-013', 'A-U5-2-024', 'A-U4-4-002', 'A-U1-3-001', 'A-U3-5-018', 'A-U1-2-017', 'A-U1-2-012', 'A-U2-1-008', 'A-U2-4-005',
  'A-U3-3-015', 'A-U3-5-008', 'A-U4-3-005', 'A-U4-3-009', 'A-U5-2-006', 'A-U5-1-009', 'A-U6-3-017', 'A-U6-2-015', 'A-U2-3-017', 'A-U3-1-001'];
const REVIEW_CLASS = { 'Nghi sai đáp án': 'bad', 'Nghi theo chuẩn mực cũ': 'bad', 'Thiếu dữ liệu': 'bad', 'Cần rà soát': 'warn', 'Đã rà soát – có lưu ý': 'warn', 'Đã đối chiếu lời giải': 'ok' };
const ids = s => String(s || '').split(/[\s,;]+/).filter(Boolean);
function diffPill(x) { const d = +x.difficulty; return DIFF_VI[d] ? `<span class="pill" title="${esc(x.difficulty_basis || '')}">${DIFF_VI[d]}</span>` : ''; }
function typePill(x) { return TYPE_Q_VI[x.q_type] ? `<span class="pill">${TYPE_Q_VI[x.q_type]}</span>` : ''; }
function reviewPill(x) { return x.review_status ? `<span class="pill ${REVIEW_CLASS[x.review_status] || ''}">${esc(x.review_status)}</span>` : ''; }
function fmlBox(fid, open) {
  const f = S.byId.formulas?.[fid]; if (!f) return '';
  return `<details class="fml" ${open ? 'open' : ''}><summary>∑ ${esc(f.name_vi)} <small class="muted">${esc(f.name_en)}</small></summary>
    <p class="en mono-s">${esc(f.expr_en)}</p><p class="vi">${esc(f.expr_vi)}</p>
    <div class="row small">${srcPill(f)}<a class="pill" href="#/know/${encodeURIComponent(f.los)}">LOS ${esc(shortLos(f.los))}</a></div></details>`;
}
function conceptChip(cid) { const c = S.byId.concepts?.[cid]; return c ? `<a class="chip" href="#/concept/${encodeURIComponent(cid)}"><b>${esc(c.term_en)}</b> · ${esc(c.term_vi)}</a>` : ''; }
function qMeta(x) {
  const fs = ids(x.formula_ids), cs = ids(x.concept_ids);
  return `<div class="meta">
    <div class="row small">${typePill(x)}${diffPill(x)}${reviewPill(x)}${x.los_confidence && x.los_confidence !== 'Khớp mục' ? `<span class="pill warn" title="${esc(x.los_note || '')}">LOS: ${esc(x.los_confidence)}</span>` : ''}</div>
    ${x.review_note ? `<p class="small note">${esc(x.review_note)}</p>` : ''}
    ${fs.length ? `<h4>Công thức và cách giải</h4>${fs.map(f => fmlBox(f, fs.length === 1)).join('')}` : ''}
    ${cs.length ? `<h4>Khái niệm liên quan</h4><div class="chips">${cs.map(conceptChip).join('')}</div>` : ''}
    ${x.source_ref ? `<p class="small muted">Nguồn: ${esc(x.source_ref)}${x.topic ? ' · ' + esc(x.topic) : ''}</p>` : ''}
  </div>`;
}
/* bộ lọc độ khó và dạng câu (lưu trong cài đặt) */
function poolFilter(pool) {
  const d = +S.settings.fDiff, t = S.settings.fType;
  return pool.filter(x => (!d || +x.difficulty === d) && (!t || x.q_type === t));
}
function filterCtl() {
  const d = String(S.settings.fDiff || ''), t = S.settings.fType || '';
  return `<div class="seg wrap"><span class="small muted">Độ khó:</span>${[['', 'Tất cả'], ['1', 'Dễ'], ['2', 'Vừa'], ['3', 'Khó']].map(([v, l]) => `<button data-fd="${v}" class="${d === v ? 'on' : ''}">${l}</button>`).join('')}</div>
  <div class="seg wrap"><span class="small muted">Dạng:</span>${[['', 'Tất cả'], ['MCQ', 'Lý thuyết'], ['Calculation', 'Tính toán'], ['Case', 'Tình huống']].map(([v, l]) => `<button data-ft="${v}" class="${t === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
function filterNote() {
  const n = poolFilter(S.data.mcq).length;
  return `Đang lọc: ${S.settings.fDiff ? DIFF_VI[S.settings.fDiff] : 'mọi độ khó'}, ${S.settings.fType ? TYPE_Q_VI[S.settings.fType] : 'mọi dạng'} · ${n}/${S.data.mcq.length} câu. Áp dụng cho luyện ngẫu nhiên, đề thử, câu sai, chủ đề yếu, theo LOS. Độ khó do AI chấm theo độ dài đề, số liệu, bảng và câu phủ định – cần chị xác nhận.`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-fd],[data-ft]'); if (!b) return;
  if (b.dataset.fd !== undefined) S.settings.fDiff = b.dataset.fd; else S.settings.fType = b.dataset.ft;
  saveSettings(); ex = null;
  if (st && location.hash.startsWith('#/study/')) { st.ids = studyIds(st.los); st.i = 0; st.ans = {}; drawStudyQ(); } else route();
});
/* tiến độ theo LOS */
function losProg(code) {
  const qs = S.data.mcq.filter(x => x.los === code);
  let done = 0, n = 0, c = 0;
  for (const x of qs) { const a = S.prog.mcq[x.id]; if (a) { done++; n += a.n; c += a.c; } }
  return { total: qs.length, done, acc: n ? pct(c, n) : null, read: !!S.prog.lesson[code], lesson: !!S.byId.lessons?.[code] };
}
function courseSummary() {
  const los = S.data.los.filter(l => String(l.los).startsWith('1.A'));
  const read = los.filter(l => S.prog.lesson[l.los]).length;
  return `Section A: đã học ${read}/${los.length} LOS`;
}
function nextLos() { return S.data.los.slice().sort((a, b) => losOrder(a.los) - losOrder(b.los)).find(l => !S.prog.lesson[l.los]); }
function courseNext() { const l = nextLos(); return l ? `<div class="card row"><div style="flex:1"><div class="small muted">Học tiếp</div><b>${esc(shortLos(l.los))} · ${esc(l.title_vi)}</b></div><a class="btn primary" href="#/study/${encodeURIComponent(l.los)}">Vào học ›</a></div>` : ''; }
function conceptList(code) {
  const cs = S.data.concepts.filter(c => c.los === code);
  return cs.length ? `<h3>Khái niệm của LOS này</h3><div class="card"><div class="chips">${cs.map(c => conceptChip(c.id)).join('')}</div></div>` : '';
}

on(/^\/course$/, () => {
  setTitle('My CMA Course');
  const days = Math.ceil((new Date(S.settings.examDate) - new Date(today())) / 864e5);
  const los = S.data.los.filter(l => String(l.los).startsWith('1.A')).sort((a, b) => losOrder(a.los) - losOrder(b.los));
  const P = Object.fromEntries(los.map(l => [l.los, losProg(l.los)]));
  const qa = los.reduce((s, l) => s + P[l.los].total, 0), qd = los.reduce((s, l) => s + P[l.los].done, 0);
  const rd = los.filter(l => P[l.los].read).length;
  const GN = { '1.A.1': 'A.1 Financial statements – Báo cáo tài chính', '1.A.2': 'A.2 Recognition, measurement, valuation, and disclosure – Ghi nhận, đo lường, đánh giá và thuyết minh' };
  const groups = {}; for (const l of los) { const g = l.los.split('.').slice(0, 3).join('.'); (groups[g] = groups[g] || []).push(l); }
  render(`
  <div class="card">
    <div class="row"><div style="flex:1"><b>CMA Part 1 – Financial Planning, Performance, and Analytics</b><br><small class="muted">Thi ${esc(S.settings.examDate)} · còn ${Math.max(0, days)} ngày</small></div></div>
    <div class="kpis">
      <div><div class="big">${rd}/${los.length}</div><small class="muted">LOS đã học</small></div>
      <div><div class="big">${qd}/${qa}</div><small class="muted">câu đã làm</small></div>
      <div><div class="big">${S.data.lessons.length}</div><small class="muted">bài 13 phần</small></div>
    </div>
    <div class="bar" title="LOS đã học"><i style="width:${pct(rd, los.length)}%"></i></div>
  </div>
  ${courseNext()}
  <h3>Các Section của Part 1</h3>
  <div class="card"><table><tr><th>Section</th><th class="num">Tỷ trọng</th><th>Trạng thái</th></tr>
  ${SECTIONS.map(([k, en, vi, w]) => `<tr><td><b>${k}.</b> ${esc(en)}<br><small class="muted">${esc(vi)}</small></td><td class="num">${w}%</td><td>${k === 'A' ? '<span class="pill ok">Đang học</span>' : '<span class="pill">Chưa có trong tool</span>'}</td></tr>`).join('')}</table>
  <p class="small muted">Tỷ trọng theo Content Specification Outlines của IMA hiệu lực 01/09/2024.</p></div>
  ${Object.entries(groups).map(([g, ls]) => `<h3>${esc(GN[g] || g)}</h3><div class="card"><ul class="list">${ls.map(l => {
    const p = P[l.los];
    return `<li><a href="#/study/${encodeURIComponent(l.los)}"><b style="min-width:52px">${esc(shortLos(l.los))}</b>
      <span style="flex:1">${esc(l.title_vi)}<br><span class="row small" style="gap:6px;margin-top:3px">${p.lesson ? '<span class="pill ok">Bài 13 phần</span>' : '<span class="pill">Bài cơ bản</span>'}${p.read ? '<span class="pill ok">✓ Đã học</span>' : ''}${p.total ? `<span class="muted">${p.done}/${p.total} câu</span>` : '<span class="muted">chưa có câu</span>'}${p.acc !== null ? `<span class="pill ${p.acc >= 70 ? 'ok' : 'bad'}">${p.acc}%</span>` : ''}</span></span>
      <span class="bar" style="width:70px"><i style="width:${pct(p.done, p.total)}%"></i></span></a></li>`;
  }).join('')}</ul></div>`).join('')}`);
});

/* màn học tích hợp: bài học | luyện tập | khái niệm (máy tính: cạnh nhau; điện thoại: vuốt ngang) */
let st = null;
function part(n, title, body, tag) {
  if (!body) return '';
  return `<details class="part" ${n <= 3 ? 'open' : ''}><summary><span class="pn">${n}</span>${esc(title)}${tag ? ` <span class="pill ${tag === 'Mở rộng CFO' ? 'warn' : 'ok'}">${tag}</span>` : ''}</summary><div class="pb">${body}</div></details>`;
}
const paras = t => String(t || '').split(/\n+/).filter(Boolean).map(s => `<p>${esc(s)}</p>`).join('');
const bullets = t => { const a = String(t || '').split(/\n+/).filter(Boolean); return a.length ? `<ul>${a.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''; };
function lessonHtml(code) {
  const l = S.byLos[code], ls = S.byId.lessons?.[code];
  if (ls?.layout === 'st' || kpRowsOf(code).length) return lessonHtmlSt(code);
  const cs = S.data.concepts.filter(c => c.los === code), vs = S.data.vocab.filter(v => v.los === code);
  const fs = ls ? ids(ls.formula_ids) : [...new Set(S.data.mcq.filter(x => x.los === code).flatMap(x => ids(x.formula_ids)))];
  let sims = []; try { sims = ls?.sim_json ? JSON.parse(ls.sim_json) : []; } catch (e) { }
  const bank = ls ? ids(ls.quiz_ids).filter(id => S.byId.mcq[id]) : [];
  const T = 'Trọng tâm thi', X = 'Mở rộng CFO';
  const head = `<div class="card"><div class="row"><b>${esc(shortLos(code))}</b>${ls ? `<span class="pill ok">${esc(ls.focus || T)}</span>` : ''}${coverPill(l.coverage)}${ls ? srcPill(ls) : ''}${ls?.review_status ? `<span class="pill warn">${esc(ls.review_status)}</span>` : ''}</div>
    <h2 class="en" style="margin:8px 0 2px">${spk(l.title_en)} ${sayBtns(l.title_en)}</h2><p class="vi" style="margin:0">${esc(l.title_vi)}</p></div>`;
  const body = [
    part(1, 'Mục tiêu học tập', ls ? bullets(ls.objectives_vi) : '', T),
    part(2, 'Tóm tắt tiếng Anh', splitSent(l.summary_en).map(s => `<p class="en">${spk(s)} ${sayBtns(s)}</p>`).join(''), T),
    part(3, 'Tóm tắt tiếng Việt', `<p>${esc(l.summary_vi)}</p>`, T),
    part(4, 'Khái niệm và từ vựng chính', (cs.length ? `<div class="chips">${cs.map(c => conceptChip(c.id)).join('')}</div>` : '') + (vs.length ? `<ul class="list">${vs.slice(0, 12).map(wordRow).join('')}</ul>` : ''), T),
    part(5, 'Công thức', fs.map(f => fmlBox(f)).join(''), T),
    part(6, 'Ví dụ bút toán và tính toán', ls ? paras(ls.journal_vi) : '', T),
    part(7, 'So sánh với VAS', ls ? paras(ls.vas_detail_vi) : (l.vas_compare ? `<p>${esc(l.vas_compare)}</p>` : ''), X),
    part(8, 'US GAAP và IFRS', ls ? `<p>${esc(l.ifrs_compare || '')}</p>${paras(ls.ifrs_detail_vi)}` : (l.ifrs_compare ? `<p>${esc(l.ifrs_compare)}</p>` : ''), T),
    part(9, 'Ứng dụng cho CFO', ls ? bullets(ls.cfo_vi) : '', X),
    part(10, 'Lỗi thường gặp', ls ? bullets(ls.mistakes_vi) : '', T),
    part(11, 'Ghi nhớ nhanh', ls ? bullets(ls.takeaways_vi) : '', T),
    part(12, 'Câu hỏi ôn tập', sims.map((q, i) => `<div class="simq"><p class="en"><b>${i + 1}.</b> ${spk(q.q)}</p>${['A', 'B', 'C', 'D'].map(k => `<div class="small">${k}. ${esc(q[k])}</div>`).join('')}
        <details><summary>Đáp án</summary><p><b>${esc(q.answer)}</b> – ${esc(q.explain_vi)}</p></details><div class="small">${aiPill('Câu mô phỏng – AI viết, cần xác minh')}</div></div>`).join('')
      + (bank.length ? `<p class="small" style="margin-top:10px">Câu trong ngân hàng nên làm: ${bank.map(id => `<a class="chip" href="#/exam/mcq?id=${encodeURIComponent(id)}">${esc(id)} · ${DIFF_VI[S.byId.mcq[id].difficulty] || ''}</a>`).join(' ')}</p>` : ''), T),
    part(13, 'Nhãn trọng tâm và nguồn', ls ? `<p><span class="pill ok">${esc(ls.focus)}</span> Các phần gắn "Mở rộng CFO" (VAS, ứng dụng) không thi nhưng hữu ích cho công việc.</p><p class="small muted">Bài học do AI soạn theo LOS IMA 01/09/2024 và tài liệu chị cung cấp. Trích dẫn VAS/TT/ASC/IFRS cần chị xác minh.</p>` : '', '')
  ].join('');
  const basic = !ls ? `<p class="note small">LOS này hiện có bài cơ bản (tóm tắt, VAS, IFRS, khái niệm, từ vựng). Bài 13 phần đầy đủ sẽ được soạn sau khi chị duyệt 5 bài mẫu.</p>` : '';
  return head + basic + body + `<div class="row"><button class="${S.prog.lesson[code] ? '' : 'primary'}" id="lsDone">${S.prog.lesson[code] ? '✓ Đã học ngày ' + esc(S.prog.lesson[code].d) : 'Đánh dấu đã học'}</button></div>`;
}

/* ---------- v1.3 – bài giảng Smart Train theo slide + bổ sung IMA (sheet "kparts") ---------- */
/* block: st = nội dung slide (chỉ trong file riêng), ai = lời giải/diễn giải của AI, ima = bổ sung theo IMA, note = ghi chú lệch */
const KP_BLOCK = { st: ['Smart Train', ''], ima: ['Bổ sung theo IMA', 'ok'], note: ['Ghi chú lệch', 'bad'], ai: ['Diễn giải của AI – cần xác minh', 'warn'] };
function kpRowsOf(code) {
  return (S.data.kparts || []).filter(r => r.los === code).sort((a, b) => ((+a.slide || 0) - (+b.slide || 0)) || ((+a.order || 0) - (+b.order || 0)));
}
function kpPill(b, slide) { const [t, c] = KP_BLOCK[b] || KP_BLOCK.ai; return `<span class="pill ${c}">[${esc(t)}${b === 'st' && slide ? ', slide ' + esc(slide) : ''}]</span>`; }
function kpVi(vi, inline) {
  if (!vi) return '';
  return viLv() === 1 ? `<div class="vi kvi">${inline ? vi : esc(vi)}</div>` : `<details class="kvd"><summary>Tiếng Việt</summary><div class="vi kvi">${inline ? vi : esc(vi)}</div></details>`;
}
function kpSents(t) { return String(t || '').split(/(?<=[.!?])\s+(?=[A-Z"(])/).map(x => x.trim()).filter(Boolean).map(x => `<span class="ks">${spk(x)} ${sayBtns(x)}</span>`).join(' '); }
function kpTable(en, vi) {
  const tb = (t, say) => {
    const rows = String(t || '').split('\n').map(r => r.split(/\s*\|\s*/));
    return `<div class="tscroll"><table class="ktab">${rows.map((r, i) => `<tr>${r.map(c => i ? `<td>${say ? spk(c) : esc(c)}</td>` : `<th>${esc(c)}</th>`).join('')}${say ? `<td class="ksay">${i ? sayBtns(r.join(', ')) : ''}</td>` : ''}</tr>`).join('')}</table></div>`;
  };
  return `<div class="en">${tb(en, true)}</div>` + (vi ? (viLv() === 1 ? `<div class="vi">${tb(vi)}</div>` : `<details class="kvd"><summary>Bảng tiếng Việt</summary>${tb(vi)}</details>`) : '');
}
function kpLine(r) {
  const k = r.kind || 'p';
  if (k === 'table') return `<div class="kl ktb">${kpTable(r.en, r.vi)}</div>`;
  if (k === 'h') return `<div class="kl kh"><h4 class="en">${spk(r.en)} ${sayBtns(r.en)}</h4>${r.vi ? `<div class="vi">${esc(r.vi)}</div>` : ''}</div>`;
  if (k === 'ans') return `<details class="kl kans"><summary>Lời giải ${kpPill('ai')}</summary><p class="en">${kpSents(r.en)}</p>${r.vi ? `<div class="vi kvi">${esc(r.vi)}</div>` : ''}</details>`;
  const cls = { li: 'kli', li2: 'kli kli2', q: 'kq', formula: 'kf' }[k] || 'kp';
  return `<div class="kl ${cls}">${k === 'q' ? '<b>❓</b> ' : ''}<span class="en">${kpSents(r.en)}</span>${kpVi(r.vi)}</div>`;
}
/* nhóm các dòng liên tiếp cùng slide (bài giảng) hoặc cùng loại khối (bổ sung) */
function kpGroups(rows, keyFn) { const g = []; for (const r of rows) { const k = keyFn(r); if (!g.length || g[g.length - 1].k !== k) g.push({ k, rows: [] }); g[g.length - 1].rows.push(r); } return g; }
function kpLecture(code) {
  const rows = kpRowsOf(code).filter(r => r.slide && r.slide !== '');
  const has = rows.some(r => r.block === 'st');
  if (!has) return `<p class="note small">Nội dung slide Smart Train của LOS này nằm trong file riêng <b>CMA_data_private.xlsx</b> (sheet "kparts"), không đưa lên mạng vì có bản quyền. Vào <a href="#/data">Dữ liệu</a> và nhập file để xem đầy đủ.</p>`;
  return kpGroups(rows, r => String(r.slide)).map(g => `<div class="kslide"><div class="row small"><span class="pill">Slide ${esc(g.k)}</span>${[...new Set(g.rows.map(r => r.block))].map(b => kpPill(b, g.k)).join('')}</div>${g.rows.map(r => r.block === 'note' ? `<div class="kl knote">${kpPill('note')} <span class="en">${kpSents(r.en)}</span>${kpVi(r.vi)}</div>` : kpLine(r)).join('')}</div>`).join('');
}
function kpSupplement(code) {
  const rows = kpRowsOf(code).filter(r => !(r.slide && r.slide !== '') || r.block === 'note').filter(r => r.block !== 'st');
  return kpGroups(rows, r => r.block).map(g => `<div class="kslide"><div class="row small">${kpPill(g.k)}</div>${g.rows.map(kpLine).join('')}</div>`).join('');
}
function kpCount(code) { const r = kpRowsOf(code); return { st: new Set(r.filter(x => x.block === 'st').map(x => x.slide)).size, sup: r.filter(x => x.block !== 'st').length }; }
function lessonHtmlSt(code) {
  const l = S.byLos[code], ls = S.byId.lessons?.[code] || {};
  const vs = S.data.vocab.filter(v => v.los === code);
  const cs = [...S.data.concepts.filter(c => c.los === code), ...ids(ls.concept_ids).map(id => S.byId.concepts?.[id]).filter(c => c && c.los !== code)];
  const fs = ls.formula_ids ? ids(ls.formula_ids) : [...new Set(S.data.mcq.filter(x => x.los === code).flatMap(x => ids(x.formula_ids)))];
  let sims = []; try { sims = ls.sim_json ? JSON.parse(ls.sim_json) : []; } catch (e) { }
  const bank = ids(ls.quiz_ids).filter(id => S.byId.mcq[id]);
  const T = 'Trọng tâm thi', X = 'Mở rộng CFO';
  const head = `<div class="card"><div class="row"><b>${esc(shortLos(code))}</b><span class="pill ok">${esc(ls.focus || T)}</span>${coverPill(l.coverage)}${ls.los ? srcPill(ls) : ''}${ls.review_status ? `<span class="pill warn">${esc(ls.review_status)}</span>` : ''}</div>
    <h2 class="en" style="margin:8px 0 2px">${spk(l.title_en)} ${sayBtns(l.title_en)}</h2><p class="vi" style="margin:0">${esc(l.title_vi)}</p></div>`;
  const P = [
    ['Mục tiêu và tóm tắt LOS', bullets(ls.objectives_vi) + `<h4>LOS (tiếng Anh) ${aiPill('AI tóm tắt – cần xác minh')}</h4>` + splitSent(l.summary_en).map(s => `<p class="en">${spk(s)} ${sayBtns(s)}</p>`).join('') + kpVi(l.summary_vi), T],
    ['Bài giảng Smart Train (song ngữ từng câu)', viCtl() + kpLecture(code), T],
    ['Công thức', fs.map(f => fmlBox(f)).join(''), T],
    ['Ví dụ số và bút toán', ls.journal_vi ? paras(ls.journal_vi) + `<div class="small">${aiPill('Diễn giải của AI – số tự đặt, cần xác minh')}</div>` : '', T],
    ['Bổ sung theo IMA và ghi chú lệch', kpSupplement(code), T],
    ['Khái niệm và từ vựng chính', (cs.length ? `<div class="chips">${cs.map(c => conceptChip(c.id)).join('')}</div>` : '') + (vs.length ? `<ul class="list">${vs.slice(0, 12).map(wordRow).join('')}</ul>` : ''), T],
    ['US GAAP, IFRS và VAS', (l.ifrs_compare ? `<p>${esc(l.ifrs_compare)}</p>` : '') + paras(ls.ifrs_detail_vi) + (ls.vas_detail_vi ? `<h4>So sánh với VAS ${aiPill('Cần xác minh')}</h4>` + paras(ls.vas_detail_vi) : ''), T],
    ['Ứng dụng cho CFO (Phú Cường, cọc bê tông)', bullets(ls.cfo_vi), X],
    ['Lỗi hay gặp và mẹo thi', bullets(ls.mistakes_vi) + (ls.takeaways_vi ? `<h4>Ghi nhớ nhanh và mẹo thi</h4>${bullets(ls.takeaways_vi)}` : ''), T],
    ['Câu hỏi ôn tập', sims.map((q, i) => `<div class="simq"><p class="en"><b>${i + 1}.</b> ${spk(q.q)} ${sayBtns(q.q)}</p>${['A', 'B', 'C', 'D'].map(k => `<div class="small">${k}. ${esc(q[k])}</div>`).join('')}
        <details><summary>Đáp án</summary><p><b>${esc(q.answer)}</b> – ${esc(q.explain_vi)}</p></details><div class="small">${aiPill('Câu mô phỏng – AI viết, cần xác minh')}</div></div>`).join('')
      + (bank.length ? `<p class="small" style="margin-top:10px">Câu trong ngân hàng nên làm: ${bank.map(id => `<a class="chip" href="#/exam/mcq?id=${encodeURIComponent(id)}">${esc(id)} · ${DIFF_VI[S.byId.mcq[id].difficulty] || ''}</a>`).join(' ')}</p>` : ''), T],
    ['Nguồn và nhãn', `<p>${kpPill('st')} nội dung slide Smart Train chị cung cấp, chép nguyên văn tiếng Anh, AI dịch tiếng Việt.</p><p>${kpPill('ima')} phần LOS IMA 01/09/2024 yêu cầu mà slide chưa có; AI soạn, cần chị xác minh.</p><p>${kpPill('note')} chỗ slide khác quy định hiện hành.</p><p>${kpPill('ai')} lời giải, ví dụ số, liên hệ VAS và CFO do AI viết.</p>`, '']
  ].filter(p => p[1]);
  return head + P.map((p, i) => part(i + 1, p[0], p[1], p[2])).join('') + `<div class="row"><button class="${S.prog.lesson[code] ? '' : 'primary'}" id="lsDone">${S.prog.lesson[code] ? '✓ Đã học ngày ' + esc(S.prog.lesson[code].d) : 'Đánh dấu đã học'}</button></div>`;
}
function conceptPane(code) {
  const cs = S.data.concepts.filter(c => c.los === code);
  return `<h3 style="margin-top:0">Khái niệm (${cs.length})</h3>${cs.map(c => conceptCard(c, true)).join('') || '<p class="muted">Chưa có khái niệm.</p>'}`;
}
function conceptCard(c, compact) {
  const fs = ids(c.formula_ids);
  return `<div class="card concept"><div class="row"><b class="en">${esc(c.term_en)}</b>${sayBtns(c.term_en)}<span class="spacer"></span><a class="pill" href="#/concept/${encodeURIComponent(c.id)}">${esc(c.id)}</a></div>
    <div class="ipa">${esc(c.ipa)}</div><p class="vi" style="margin:2px 0 6px"><b>${esc(c.term_vi)}</b></p>
    <p class="en small">${spk(c.explain_en)}</p><p>${esc(c.explain_vi)}</p>
    ${compact ? `<details><summary>VAS, IFRS, ví dụ, CFO</summary>` : ''}
    <p><b>US GAAP và IFRS:</b> ${esc(c.gaap_ifrs)}</p>
    <p><b>So sánh VAS:</b> ${esc(c.vas)}</p>
    ${fs.length ? fs.map(f => fmlBox(f)).join('') : ''}
    ${c.example_vi ? `<p><b>Ví dụ:</b> ${esc(c.example_vi)}</p>` : ''}
    ${c.cfo_use ? `<p><b>Ứng dụng CFO:</b> ${esc(c.cfo_use)}</p>` : ''}
    ${compact ? '</details>' : ''}
    <div class="row small">${srcPill(c)}<span class="pill warn">${esc(c.review_status || 'Cần xác minh')}</span></div></div>`;
}
function studyIds(code) {
  const pool = poolFilter(S.data.mcq.filter(x => x.los === code));
  const fresh = pool.filter(x => !S.prog.mcq[x.id]).sort((a, b) => (+a.difficulty || 2) - (+b.difficulty || 2)), seen = pool.filter(x => S.prog.mcq[x.id]);
  return fresh.concat(seen).map(x => x.id);
}
on(/^\/study\/(.+)$/, ([code]) => {
  const l = S.byLos[code]; if (!l) return render('<p>Không tìm thấy LOS.</p>');
  setTitle('Học ' + shortLos(code));
  document.body.classList.add('wide');
  if (!st || st.los !== code) st = { los: code, ids: studyIds(code), i: 0, ans: {}, pane: 0 };
  render(`
  <div class="stabs seg" role="tablist"><button data-pane="0" class="on">📖 Bài học</button><button data-pane="1">📝 Luyện tập</button><button data-pane="2">🧩 Khái niệm</button></div>
  <div class="split" id="split">
    <section class="pane pl" id="pLesson">${lessonHtml(code)}</section>
    <section class="pane pp" id="pPractice"></section>
    <section class="pane pc" id="pConcept">${conceptPane(code)}</section>
  </div>`);
  const sp = $('#split'), tabs = $$('.stabs button');
  const setTab = i => tabs.forEach((b, j) => b.classList.toggle('on', i === j));
  tabs.forEach(b => b.onclick = () => { const i = +b.dataset.pane; st.pane = i; const p = sp.children[i]; sp.scrollTo({ left: p.offsetLeft - sp.offsetLeft, behavior: 'smooth' }); setTab(i); });
  sp.onscroll = () => { const i = Math.round(sp.scrollLeft / Math.max(1, sp.clientWidth)); if (i !== st.pane) { st.pane = i; setTab(i); } };
  if (st.pane) requestAnimationFrame(() => { sp.scrollLeft = sp.children[st.pane].offsetLeft - sp.offsetLeft; setTab(st.pane); });
  const bindLesson = () => {
    const b = $('#lsDone'); if (!b) return;
    b.onclick = () => { if (S.prog.lesson[code]) delete S.prog.lesson[code]; else { S.prog.lesson[code] = { d: today() }; logStudy('lesson'); } saveProg(); $('#pLesson').innerHTML = lessonHtml(code); bindLesson(); };
  };
  bindLesson(); drawStudyQ();
});
function drawStudyQ() {
  const box = $('#pPractice'); if (!box) return;
  const head = `<h3 style="margin-top:0">Luyện tập LOS ${esc(shortLos(st.los))}</h3>${filterCtl()}${viCtl()}`;
  if (!st.ids.length) { box.innerHTML = head + `<p class="muted">Không có câu phù hợp bộ lọc.${S.data.mcq.some(x => x._src === 'imp') ? '' : ' Nhập file CMA_data_private.xlsx ở mục Dữ liệu để có thêm 453 câu.'}</p>`; return; }
  if (st.i >= st.ids.length) st.i = 0;
  const x = S.byId.mcq[st.ids[st.i]], picked = st.ans[x.id], opts = ['A', 'B', 'C', 'D'].filter(k => x[k] !== '' && x[k] != null);
  box.innerHTML = head + `
  <div class="row small muted" style="margin-bottom:6px"><span>Câu ${st.i + 1}/${st.ids.length}</span>${srcPill(x, 'mcq')}${diffPill(x)}${typePill(x)}${S.prog.mcq[x.id] ? `<span class="pill">đã làm ${S.prog.mcq[x.id].n} lần</span>` : ''}</div>
  <div class="card">${qHtml(x, true)}${qViPart(x, opts)}<div class="row" style="margin:8px 0">${sayBtns(x.question, 'câu hỏi')}</div>
    ${opts.map(k => optHtml(x, k, picked ? (k === x.answer ? 'right' : k === picked ? 'wrong' : '') : '', true)).join('')}</div>
  ${picked ? `<div class="card"><h3 style="margin-top:0">${picked === x.answer ? '✓ Đúng' : `✗ Sai – đáp án ${esc(x.answer)}`}</h3><p>${esc(x.explain_vi)}</p>
    <details><summary>Giải thích tiếng Anh</summary>${splitSent(x.explain_en).map(s => `<p class="en">${spk(s)} ${sayBtns(s)}</p>`).join('')}</details>${qMeta(x)}</div>` : ''}
  <div class="row">${st.i > 0 ? '<button id="sPrev">‹ Câu trước</button>' : ''}<span class="spacer"></span>${picked ? `<button class="primary" id="sNext">${st.i + 1 < st.ids.length ? 'Câu tiếp ›' : 'Làm lại từ đầu'}</button>` : ''}</div>`;
  $$('.opt', box).forEach(b => b.onclick = () => { if (st.ans[x.id]) return; const k = b.dataset.k; st.ans[x.id] = k; recordQ(x, k === x.answer); viRecord(k === x.answer); drawStudyQ(); });
  $('#sPrev') && ($('#sPrev').onclick = () => { st.i--; drawStudyQ(); });
  $('#sNext') && ($('#sNext').onclick = () => { st.i = st.i + 1 < st.ids.length ? st.i + 1 : 0; if (!st.i) st.ans = {}; drawStudyQ(); box.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
  bindDeepDive();
}

/* khái niệm và công thức */
on(/^\/concepts$/, (_, q) => {
  setTitle('Khái niệm Section A');
  const f = q.los || '', k = (q.q || '').toLowerCase();
  const list = S.data.concepts.filter(c => (!f || c.los === f) && (!k || (c.term_en + ' ' + c.term_vi).toLowerCase().includes(k)));
  render(`<p class="small muted">${S.data.concepts.length} khái niệm, mỗi khái niệm 11 trường: mã, thuật ngữ, IPA, nghĩa Việt, giải thích Anh/Việt, US GAAP–IFRS, VAS, công thức, ví dụ, ứng dụng CFO, nguồn. Tất cả do AI soạn, cần chị xác minh.</p>
  <div class="row"><input type="text" id="cq" placeholder="Tìm khái niệm…" value="${esc(q.q || '')}" style="flex:1"></div>
  <div class="card"><ul class="list">${list.sort((a, b) => losOrder(a.los) - losOrder(b.los) || a.id.localeCompare(b.id)).map(c => `<li><a href="#/concept/${encodeURIComponent(c.id)}"><b style="min-width:52px">${esc(shortLos(c.los))}</b><span style="flex:1">${esc(c.term_en)}<br><small class="muted">${esc(c.term_vi)}</small></span></a></li>`).join('')}</ul></div>`);
  $('#cq').onchange = e => location.hash = '#/concepts?q=' + encodeURIComponent(e.target.value);
});
on(/^\/concept\/(.+)$/, ([cid]) => {
  const c = S.byId.concepts?.[cid]; if (!c) return render('<p>Không tìm thấy khái niệm.</p>');
  setTitle(c.term_en);
  const qs = S.data.mcq.filter(x => ids(x.concept_ids).includes(cid));
  render(`${conceptCard(c, false)}
  <div class="row"><a class="btn primary" href="#/study/${encodeURIComponent(c.los)}">📖 Học LOS ${esc(shortLos(c.los))}</a></div>
  ${qs.length ? `<h3>Câu hỏi liên kết (${qs.length})</h3><div class="card"><ul class="list">${qs.slice(0, 30).map(x => `<li><a href="#/exam/mcq?id=${encodeURIComponent(x.id)}">${diffPill(x)}${typePill(x)}<span style="flex:1">${esc(String(x.question).slice(0, 100))}…</span></a></li>`).join('')}</ul></div>` : ''}`);
});
on(/^\/formulas$/, () => {
  setTitle('Thư viện công thức');
  const use = {}; for (const x of S.data.mcq) for (const f of ids(x.formula_ids)) use[f] = (use[f] || 0) + 1;
  render(`<p class="small muted">${S.data.formulas.length} công thức do AI tổng hợp từ lời giải trong tài liệu chị cung cấp, cần xác minh. Số bên phải là số câu đang dùng công thức đó.</p>
  ${S.data.formulas.slice().sort((a, b) => losOrder(a.los) - losOrder(b.los)).map(f => `<div class="row" style="align-items:flex-start"><div style="flex:1">${fmlBox(f.id)}</div><span class="pill" style="margin-top:10px">${use[f.id] || 0} câu</span></div>`).join('')}`);
});

/* báo cáo QC tính trực tiếp từ dữ liệu đang có */
on(/^\/data\/qc$/, () => {
  setTitle('Báo cáo QC');
  const Q = S.data.mcq, cnt = (a, f) => a.reduce((m, x) => { const k = f(x) || '(trống)'; m[k] = (m[k] || 0) + 1; return m; }, {});
  const tbl = (o, h) => `<table><tr><th>${h}</th><th class="num">Số câu</th></tr>${Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v}</td></tr>`).join('')}</table>`;
  const noAns = Q.filter(x => !['A', 'B', 'C', 'D'].includes(x.answer) || !x[x.answer]);
  const noExp = Q.filter(x => !String(x.explain_en || '').trim() && !String(x.explain_vi || '').trim());
  const noLos = Q.filter(x => !S.byLos[x.los]);
  const calcNoF = Q.filter(x => x.q_type === 'Calculation' && !ids(x.formula_ids).length);
  const flagged = Q.filter(x => ['Nghi sai đáp án', 'Nghi theo chuẩn mực cũ', 'Thiếu dữ liệu', 'Cần rà soát', 'Đã rà soát – có lưu ý'].includes(x.review_status));
  const empty = S.data.los.filter(l => !Q.some(x => x.los === l.los));
  const priv = Q.filter(x => x._src === 'imp').length;
  render(`
  ${priv ? '' : '<div class="note">Chưa nhập file CMA_data_private.xlsx nên báo cáo chỉ tính câu mô phỏng.</div>'}
  <div class="card"><table>
    <tr><td>Tổng số câu MCQ</td><td class="num">${Q.length}</td></tr>
    <tr><td>Thiếu đáp án hoặc đáp án không khớp phương án</td><td class="num">${noAns.length}</td></tr>
    <tr><td>Thiếu lời giải</td><td class="num">${noExp.length}</td></tr>
    <tr><td>Không phân loại được LOS (mã LOS không có trong danh mục)</td><td class="num">${noLos.length}</td></tr>
    <tr><td>Câu tính toán chưa có công thức</td><td class="num">${calcNoF.length}</td></tr>
    <tr><td>LOS chưa có câu hỏi</td><td class="num">${empty.length}</td></tr></table>
    ${empty.length ? `<p class="small muted">LOS chưa có câu: ${empty.map(l => esc(shortLos(l.los))).join(', ')}</p>` : ''}</div>
  <div class="row"><a class="btn primary" href="#/exam/mcq?sample=1">🧪 Duyệt mẫu 20 câu</a></div>
  <h3>Trạng thái rà soát</h3><div class="card">${tbl(cnt(Q, x => x.review_status), 'Trạng thái')}</div>
  <h3>Độ tin cậy khi gán LOS</h3><div class="card">${tbl(cnt(Q, x => x.los_confidence), 'Mức')}</div>
  <h3>Dạng câu và độ khó</h3><div class="card">${tbl(cnt(Q, x => TYPE_Q_VI[x.q_type] || x.q_type), 'Dạng')}${tbl(cnt(Q, x => DIFF_VI[x.difficulty] || x.difficulty), 'Độ khó')}</div>
  <h3>Câu cần chị xem (${flagged.length})</h3>
  <div class="card"><ul class="list">${flagged.sort((a, b) => (REVIEW_CLASS[a.review_status] === 'bad' ? 0 : 1) - (REVIEW_CLASS[b.review_status] === 'bad' ? 0 : 1)).map(x => `<li><a href="#/exam/mcq?id=${encodeURIComponent(x.id)}">${reviewPill(x)}<span style="flex:1"><b>${esc(x.id)}</b> · ${esc(shortLos(x.los))}<br><small class="muted">${esc(x.review_note || x.los_note || '')}</small></span></a></li>`).join('')}</ul></div>`);
});

/* ---------- EXAM ---------- */
on(/^\/exam$/, () => {
  setTitle('Luyện thi');
  const n = S.data.mcq.length, priv = S.data.mcq.filter(q => q._src === 'imp').length;
  const wrong = S.data.mcq.filter(q => S.prog.mcq[q.id] && !S.prog.mcq[q.id].last).length;
  const los = S.data.los.slice().sort((a, b) => losOrder(a.los) - losOrder(b.los));
  render(`
  <p class="muted small">Ngân hàng hiện có ${n} câu MCQ (${n - priv} câu tự soạn, ${priv} câu nhập từ file riêng) và ${new Set(S.data.cbq.map(c => c.case_id)).size} tình huống CBQ.</p>
  <div class="grid">
    <a class="tile" href="#/exam/mcq?mode=random&n=10"><b>🎲 10 câu ngẫu nhiên</b><small>Có giải thích ngay</small></a>
    <a class="tile" href="#/exam/mcq?mode=random&n=25"><b>🎲 25 câu ngẫu nhiên</b><small>Có giải thích ngay</small></a>
    <a class="tile" href="#/exam/mcq?mode=timed&n=50"><b>⏱ Đề thử 50 câu</b><small>90 phút, chấm cuối bài (1,8 phút/câu như đề thật)</small></a>
    <a class="tile" href="#/exam/mcq?mode=wrong"><b>↺ Câu đã làm sai</b><small>${wrong} câu</small></a>
    <a class="tile" href="#/exam/mcq?mode=weak"><b>⚠ Chủ đề yếu</b><small>LOS đúng dưới 70%</small></a>
    <a class="tile" href="#/exam/cbq"><b>📋 Case-Based (CBQ)</b><small>Thay cho essay từ 2026</small></a>
    <a class="tile" href="#/exam/stats"><b>📊 Tiến độ</b><small>Tỷ lệ đúng theo LOS</small></a>
    <a class="tile" href="#/course"><b>📚 My CMA Course</b><small>Học theo LOS: bài học + luyện tập</small></a>
  </div>
  <h3>Bộ lọc câu hỏi</h3>
  <div class="card">${filterCtl()}<p class="small muted" style="margin:0">${filterNote()}</p></div>
  <h3>Luyện theo LOS</h3>
  <div class="card row"><select id="losSel" style="flex:1">${los.map(l => { const c = S.data.mcq.filter(q => q.los === l.los).length; return c ? `<option value="${esc(l.los)}">${esc(shortLos(l.los))} – ${esc(l.title_vi)} (${c})</option>` : ''; }).join('')}</select>
  <button class="primary" id="goLos">Bắt đầu</button></div>
  ${priv ? '' : `<div class="note">Muốn thêm 453 câu Gleim (Unit 1–6) có giải thích tiếng Việt: vào <a href="#/data">Dữ liệu</a>, nhập file <b>CMA_data_private.xlsx</b>.</div>`}
  ${oldImpNote()}
  <h3>Mức tiếng Việt khi luyện</h3>
  ${viCtl()}
  <p class="small muted">${esc(VI_LEVEL_NOTE[viLv()])} Đề thử tính giờ luôn chỉ có tiếng Anh, như đề thật.</p>
  ${viSuggest()}`);
  $('#goLos').onclick = () => location.hash = '#/exam/mcq?los=' + encodeURIComponent($('#losSel').value);
});

let ex = null;
on(/^\/exam\/mcq$/, (_, q) => {
  const key = JSON.stringify(q);
  if (!ex || ex.key !== key) {
    let pool = S.data.mcq;
    if (q.id) pool = pool.filter(x => x.id === q.id);
    if (q.sample) pool = REVIEW_SAMPLE.map(id => S.byId.mcq[id]).filter(Boolean);
    if (q.los) pool = pool.filter(x => x.los === q.los);
    if (!q.id && !q.sample) pool = poolFilter(pool);
    if (q.mode === 'wrong') pool = pool.filter(x => S.prog.mcq[x.id] && !S.prog.mcq[x.id].last);
    if (q.mode === 'weak') { const w = new Set(weakLos(10).map(x => x.los)); pool = pool.filter(x => w.has(x.los)); }
    if (q.mode === 'random' || q.mode === 'timed') {
      // ưu tiên câu chưa làm
      const fresh = shuffle(pool.filter(x => !S.prog.mcq[x.id])), seen = shuffle(pool.filter(x => S.prog.mcq[x.id]));
      pool = fresh.concat(seen).slice(0, +q.n || 10); pool = shuffle(pool);
    } else if (!q.sample) pool = shuffle(pool);
    const timed = q.mode === 'timed';
    ex = { key, ids: pool.map(x => x.id), i: 0, ans: {}, timed, end: timed ? Date.now() + pool.length * 108e3 : 0, done: false, title: q.sample ? 'Mẫu duyệt 20 câu' : q.id ? 'Câu ' + q.id : q.los ? 'LOS ' + shortLos(q.los) : (timed ? 'Đề thử' : 'Luyện MCQ') };
  }
  drawQ();
});
function qHtml(x, hl) { const mono = /\S {3,}\S/.test(x.question) || /\n.*\$/.test(x.question); return `<div class="q ${mono ? 'mono' : ''}">${spk(x.question, hl)}</div>`; }
function drawQ() {
  setTitle(ex.title);
  clearInterval(drawQ._t);
  if (!ex.ids.length) { render(`<div class="card"><p>Không có câu hỏi phù hợp.</p><a class="btn" href="#/exam">Quay lại</a></div>`); return; }
  if (ex.done || ex.i >= ex.ids.length) return drawResult();
  const x = S.byId.mcq[ex.ids[ex.i]];
  const picked = ex.ans[x.id];
  const show = picked && !ex.timed;
  const opts = ['A', 'B', 'C', 'D'].filter(k => x[k] !== '' && x[k] != null);
  const study = !ex.timed; // chế độ tính giờ: không tô màu, không dịch, không phân tích
  const lv = viLv();
  render(`
  <div class="row small muted" style="margin-bottom:8px"><span>Câu ${ex.i + 1}/${ex.ids.length}</span><span class="pill">${esc(shortLos(x.los))}</span>${srcPill(x, 'mcq')}${study ? diffPill(x) + typePill(x) : ''}
    ${ex.timed ? `<span class="spacer"></span><span class="timer" id="tmr"></span>` : ''}</div>
  ${study ? viCtl() : ''}
  <div class="card">
    ${qHtml(x, study)}
    ${study ? qViPart(x, opts) : ''}
    <div class="row" style="margin:8px 0">${sayBtns(x.question, 'câu hỏi')}</div>
    ${opts.map(k => {
      let cls = '';
      if (show) cls = k === x.answer ? 'right' : (k === picked ? 'wrong' : '');
      else if (ex.timed && picked === k) cls = 'right';
      return optHtml(x, k, cls, study);
    }).join('')}
  </div>
  ${show ? `<div class="card">
     <h3 style="margin-top:0">${picked === x.answer ? '✓ Đúng' : `✗ Sai – đáp án ${esc(x.answer)}`}</h3>
     <p>${esc(x.explain_vi)}</p>
     <details><summary>Giải thích tiếng Anh</summary>${splitSent(x.explain_en).map(s => `<p class="en">${spk(s)} ${sayBtns(s)}</p>`).join('')}</details>
     ${lv === 3 ? `<details><summary>Bản dịch câu hỏi và phương án</summary>${trBlock(x, opts)}</details>` : ''}
     <div class="row small">${srcPill(x, 'mcq')}${srcType(x, 'mcq') === 'st' ? aiPill('Giải thích tiếng Việt: AI – cần xác minh') : ''}<a class="pill" href="#/study/${encodeURIComponent(x.los)}">Học LOS ${esc(shortLos(x.los))}</a></div>
     ${qMeta(x)}
   </div>` : ''}
  ${study ? deepDive(x, opts, !!show) : ''}
  <div class="row">
    ${ex.i > 0 ? '<button id="qPrev">‹ Câu trước</button>' : ''}<span class="spacer"></span>
    ${ex.timed ? '<button id="qSubmit">Nộp bài</button>' : ''}
    ${(show || ex.timed) ? `<button class="primary" id="qNext">${ex.i + 1 < ex.ids.length ? 'Câu tiếp ›' : 'Xem kết quả'}</button>` : ''}
  </div>`);
  $$('.opt').forEach(b => b.onclick = () => {
    if (show) return;
    const k = b.dataset.k; const first = !(x.id in ex.ans);
    ex.ans[x.id] = k;
    if (!ex.timed && first) { recordQ(x, k === x.answer); viRecord(k === x.answer); }
    drawQ();
  });
  bindDeepDive();
  $('#qPrev') && ($('#qPrev').onclick = () => { ex.i--; drawQ(); });
  $('#qNext') && ($('#qNext').onclick = () => { ex.i++; drawQ(); });
  $('#qSubmit') && ($('#qSubmit').onclick = () => { if (confirm('Nộp bài và xem kết quả?')) finishTimed(); });
  if (ex.timed) {
    const tick = () => {
      const left = Math.max(0, ex.end - Date.now()); const m = Math.floor(left / 6e4), s = Math.floor(left % 6e4 / 1e3);
      const el = $('#tmr'); if (el) el.textContent = `⏱ ${m}:${String(s).padStart(2, '0')}`;
      if (!left) { clearInterval(drawQ._t); finishTimed(); }
    };
    tick(); drawQ._t = setInterval(tick, 1000);
  }
}
function recordQ(x, ok) {
  const a = S.prog.mcq[x.id] = S.prog.mcq[x.id] || { n: 0, c: 0 };
  a.n++; if (ok) a.c++; a.last = ok; a.t = today(); logStudy('mcq'); saveProg();
}
function finishTimed() {
  clearInterval(drawQ._t);
  for (const id of ex.ids) { const x = S.byId.mcq[id]; if (ex.ans[id]) recordQ(x, ex.ans[id] === x.answer); }
  ex.done = true; ex.timed = false; drawResult();
}
function drawResult() {
  clearInterval(drawQ._t);
  const qs = ex.ids.map(id => S.byId.mcq[id]);
  const right = qs.filter(x => ex.ans[x.id] === x.answer).length;
  const by = {};
  for (const x of qs) { const b = by[x.los] = by[x.los] || { n: 0, c: 0 }; b.n++; if (ex.ans[x.id] === x.answer) b.c++; }
  render(`
  <div class="card"><h2>Kết quả: ${right}/${qs.length} (${pct(right, qs.length)}%)</h2>
    <p class="muted small">Mốc tham khảo: điểm đạt CMA là 360/500 (khoảng 72%), cần cả MCQ và CBQ.</p>
    ${viSuggest()}
    <table><tr><th>LOS</th><th class="num">Đúng</th><th class="num">%</th></tr>
    ${Object.entries(by).sort((a, b) => losOrder(a[0]) - losOrder(b[0])).map(([l, b]) => `<tr><td><a href="#/know/${encodeURIComponent(l)}">${esc(losName(l))}</a></td><td class="num">${b.c}/${b.n}</td><td class="num">${pct(b.c, b.n)}%</td></tr>`).join('')}</table>
  </div>
  <h3>Xem lại câu sai</h3>
  <div class="card"><ul class="list">${qs.map((x, i) => ex.ans[x.id] === x.answer ? '' : `<li><a href="#" data-review="${i}"><span class="pill bad">${esc(ex.ans[x.id] || '–')} → ${esc(x.answer)}</span><span style="flex:1">${esc(String(x.question).slice(0, 110))}…</span></a></li>`).join('') || '<li class="muted" style="padding:10px">Không có câu sai 🎉</li>'}</ul></div>
  <div class="row"><a class="btn primary" href="#/exam">Về Luyện thi</a></div>`);
  $$('[data-review]').forEach(a => a.onclick = e => {
    e.preventDefault(); ex.done = false; ex.timed = false; ex.i = +a.dataset.review; drawQ();
  });
}

/* CBQ */
function cbqCases() {
  const m = new Map();
  for (const r of S.data.cbq) {
    if (!m.has(r.case_id)) m.set(r.case_id, { id: r.case_id, title: r.case_title || r.case_id, los: r.los, en: r.case_text_en, vi: r.case_text_vi, qs: [] });
    m.get(r.case_id).qs.push(r);
  }
  for (const c of m.values()) c.qs.sort((a, b) => a.q_no - b.q_no);
  return [...m.values()];
}
on(/^\/exam\/cbq$/, () => {
  setTitle('Case-Based Questions');
  render(`<div class="note small">Từ kỳ thi 2026, phần essay được thay bằng CBQ: mỗi Part có 2 tình huống trong 60 phút, mỗi tình huống gồm nhiều câu hỏi dựa trên dữ liệu. Các tình huống dưới đây do em soạn theo LOS, gắn bối cảnh doanh nghiệp sản xuất cọc bê tông (cần đối chiếu).</div>
  <div class="card"><ul class="list">${cbqCases().map(c => { const r = S.prog.cbq[c.id]; return `<li><a href="#/exam/cbq/${encodeURIComponent(c.id)}"><span style="flex:1"><b>${esc(c.title)}</b><br><small class="muted">${esc(c.id)} · ${esc(String(c.los).replace(/1\./g, ''))} · ${c.qs.length} câu</small></span>${r ? `<span class="pill ${r.best >= 70 ? 'ok' : 'warn'}">${r.best}%</span>` : ''}</a></li>`; }).join('')}</ul></div>`);
});
let cb = null;
on(/^\/exam\/cbq\/(.+)$/, ([id]) => {
  const c = cbqCases().find(x => x.id === id); if (!c) return render('<p>Không tìm thấy tình huống.</p>');
  if (!cb || cb.id !== id) cb = { id, i: 0, ans: {}, start: Date.now() };
  setTitle(c.title);
  const showCase = `
  <details class="card" ${cb.i === 0 ? 'open' : ''}><summary>Đề bài tình huống</summary>
    <div class="row" style="margin:8px 0">${sayBtns(c.en, 'tình huống')}</div>
    ${String(c.en).split(/\n+/).map(p => `<p class="en q">${spk(p)}</p>`).join('')}
    ${viLv() === 3 && cb.i < c.qs.length && !cb.ans[c.qs[cb.i].q_no] ? '' : `<details ${viLv() === 1 ? 'open' : ''}><summary>Bản tiếng Việt</summary><div class="row small">${aiPill()}</div>${String(c.vi).split(/\n+/).map(p => `<p class="q vi">${esc(p)}</p>`).join('')}</details>`}
  </details>`;
  if (cb.i >= c.qs.length) {
    const right = c.qs.filter(x => cb.ans[x.q_no] === x.answer).length; const sc = pct(right, c.qs.length);
    const r = S.prog.cbq[id] = S.prog.cbq[id] || { n: 0, best: 0 }; if (!cb.saved) { r.n++; r.best = Math.max(r.best, sc); cb.saved = true; logStudy('cbq'); saveProg(); }
    const mins = Math.round((Date.now() - cb.start) / 6e4);
    render(`${showCase}<div class="card"><h2>${right}/${c.qs.length} câu đúng (${sc}%)</h2><p class="muted small">Thời gian: ${mins} phút (đề thật khoảng 30 phút/tình huống).</p>
      <div class="row"><button class="primary" id="cbAgain">Làm lại</button><a class="btn" href="#/exam/cbq">Tình huống khác</a></div></div>`);
    $('#cbAgain').onclick = () => { cb = null; route(); }; return;
  }
  const x = c.qs[cb.i]; const picked = cb.ans[x.q_no];
  const opts = ['A', 'B', 'C', 'D'].filter(k => x[k] !== '' && x[k] != null);
  render(`${showCase}
  ${viCtl()}
  <div class="card">
    <div class="row small muted"><span>Câu ${cb.i + 1}/${c.qs.length}</span>${srcPill(x, 'cbq')}</div>
    <p class="en q">${spk(x.question, true)} ${sayBtns(x.question)}</p>
    ${qViPart(x, opts)}
    ${opts.map(k => optHtml(x, k, picked ? (k === x.answer ? 'right' : k === picked ? 'wrong' : '') : '', true)).join('')}
    ${picked ? `<h3>${picked === x.answer ? '✓ Đúng' : '✗ Sai – đáp án ' + esc(x.answer)}</h3><p>${esc(x.explain_vi)}</p>
      <details><summary>Giải thích tiếng Anh</summary><p class="en">${spk(x.explain_en)} ${sayBtns(x.explain_en)}</p></details>
      ${viLv() === 3 ? `<details><summary>Bản dịch câu hỏi và phương án</summary>${trBlock(x, opts)}</details>` : ''}
      <button class="primary" id="cbNext">${cb.i + 1 < c.qs.length ? 'Câu tiếp ›' : 'Xem kết quả'}</button>` : ''}
  </div>
  ${deepDive(x, opts, !!picked)}`);
  $$('.opt').forEach(b => b.onclick = () => { if (cb.ans[x.q_no]) return; cb.ans[x.q_no] = b.dataset.k; viRecord(b.dataset.k === x.answer); route(); });
  $('#cbNext') && ($('#cbNext').onclick = () => { cb.i++; route(); });
  bindDeepDive();
});

on(/^\/exam\/stats$/, () => {
  setTitle('Tiến độ');
  const st = losStats();
  const los = S.data.los.slice().sort((a, b) => losOrder(a.los) - losOrder(b.los));
  const boxes = [0, 0, 0, 0, 0, 0]; for (const s of Object.values(S.prog.srs)) boxes[s.b]++;
  const days = Object.keys(S.prog.log).sort().slice(-14);
  let att = 0, cor = 0; for (const a of Object.values(S.prog.mcq)) { att += a.n; cor += a.c; }
  render(`
  <div class="grid">
    <div class="tile"><b class="big">${pct(cor, att)}%</b><small>MCQ đúng (${att} lượt)</small></div>
    <div class="tile"><b class="big">${Object.keys(S.prog.mcq).length}</b><small>/ ${S.data.mcq.length} câu đã làm</small></div>
    <div class="tile"><b class="big">${boxes[4] + boxes[5]}</b><small>/ ${S.data.vocab.length} từ đã thuộc (hộp 4–5)</small></div>
    <div class="tile"><b class="big">${days.length}</b><small>ngày học (14 ngày gần nhất)</small></div>
  </div>
  <h3>Tỷ lệ đúng theo LOS</h3>
  <div class="card"><table><tr><th>LOS</th><th class="num">Câu đã làm</th><th>Tỷ lệ đúng</th></tr>
  ${los.map(l => { const s = st[l.los]; const total = S.data.mcq.filter(q => q.los === l.los).length; if (!total) return ''; const a = s ? pct(s.c, s.n) : null;
    return `<tr><td><a href="#/exam/mcq?los=${encodeURIComponent(l.los)}">${esc(shortLos(l.los))}</a> <small class="muted">${esc(l.title_vi)}</small></td><td class="num">${s ? s.q : 0}/${total}</td><td>${a === null ? '<span class="muted small">chưa làm</span>' : `<div class="row" style="flex-wrap:nowrap"><div class="bar" style="flex:1"><i style="width:${a}%;background:${a >= 70 ? 'var(--ok)' : 'var(--bad)'}"></i></div><span class="small">${a}%</span></div>`}</td></tr>`; }).join('')}
  </table></div>
  <h3>Thẻ từ theo hộp Leitner</h3>
  <div class="card"><table><tr>${['Chưa học', 'Hộp 1 (1 ngày)', 'Hộp 2 (2 ngày)', 'Hộp 3 (4 ngày)', 'Hộp 4 (7 ngày)', 'Hộp 5 (14 ngày)'].map(h => `<th>${h}</th>`).join('')}</tr>
  <tr><td class="num">${S.data.vocab.length - Object.keys(S.prog.srs).length}</td>${boxes.slice(1).map(b => `<td class="num">${b}</td>`).join('')}</tr></table></div>
  <h3>Nhật ký 14 ngày</h3>
  <div class="card"><table><tr><th>Ngày</th><th class="num">Thẻ</th><th class="num">MCQ</th><th class="num">Nghe–chép</th><th class="num">Khác</th></tr>
  ${days.reverse().map(d => { const x = S.prog.log[d]; return `<tr><td>${d}</td><td class="num">${x.cards || 0}</td><td class="num">${x.mcq || 0}</td><td class="num">${x.dict || 0}</td><td class="num">${(x.read || 0) + (x.speak || 0) + (x.cbq || 0) + (x.cfo || 0) + (x.tr || 0)}</td></tr>`; }).join('') || '<tr><td colspan="5" class="muted">Chưa có</td></tr>'}</table></div>`);
});

/* ---------- CFO ---------- */
function cfoSituations() {
  const m = new Map();
  for (const r of S.data.cfo) {
    const id = r.situation_id || r.id;
    if (!m.has(id)) m.set(id, { id, los: r.los, situation: r.situation, title_vi: r.title_vi || r.situation, context_vi: r.context_vi, phrases: [] });
    m.get(id).phrases.push(r);
  }
  return [...m.values()];
}
const SIT_VI = { bank: 'Ngân hàng', auditor: 'Kiểm toán', investor: 'Nhà đầu tư', board: 'HĐQT', tax: 'Thuế', customer: 'Khách hàng', supplier: 'Nhà cung cấp' };
const CH_VI = { email: 'Email', meeting: 'Họp', presentation: 'Thuyết trình' };
on(/^\/cfo$/, (_, q) => {
  setTitle('Thực hành CFO');
  const sits = cfoSituations(); const kinds = [...new Set(sits.map(s => s.situation))];
  const f = q.f || '';
  render(`
  <div class="seg"><a href="#/cfo" class="${f ? '' : 'on'}">Tất cả</a>${kinds.map(k => `<a href="#/cfo?f=${encodeURIComponent(k)}" class="${f === k ? 'on' : ''}">${esc(SIT_VI[k] || k)}</a>`).join('')}</div>
  <p class="small muted">Mỗi tình huống gắn với một LOS, bối cảnh doanh nghiệp sản xuất và thi công cọc bê tông. Mẫu câu dùng cho email, họp và thuyết trình.</p>
  <div class="card"><ul class="list">${sits.filter(s => !f || s.situation === f).map(s => `<li><a href="#/cfo/${encodeURIComponent(s.id)}"><span class="pill">${esc(SIT_VI[s.situation] || s.situation)}</span><span style="flex:1">${esc(s.title_vi)}<br><small class="muted">${esc(shortLos(s.los))} · ${s.phrases.length} mẫu câu</small></span></a></li>`).join('')}</ul></div>`);
});
on(/^\/cfo\/(.+)$/, ([id]) => {
  const s = cfoSituations().find(x => x.id === id); if (!s) return render('<p>Không tìm thấy tình huống.</p>');
  setTitle(s.title_vi);
  render(`
  <div class="card"><div class="row"><span class="pill">${esc(SIT_VI[s.situation] || s.situation)}</span>${S.byLos[s.los] ? `<a class="pill" href="#/know/${encodeURIComponent(s.los)}">LOS ${esc(shortLos(s.los))}</a>` : ''}</div>
    <p style="margin-top:8px">${esc(s.context_vi)}</p>
    <div class="row"><button class="primary" id="cfoAll">▶ Nghe tất cả</button><a class="btn" href="#/english/speak?src=cfo&id=${encodeURIComponent(s.id)}">🎙 Luyện nói</a><a class="btn" href="#/english/dict?src=cfo&id=${encodeURIComponent(s.id)}">✍️ Nghe – chép</a></div>
  </div>
  ${s.phrases.map((p, i) => `<div class="card sent" data-i="${i}"><div class="row small"><span class="pill">${esc(CH_VI[p.channel] || p.channel)}</span></div>
    <p class="en">${spk(p.phrase_en)} ${sayBtns(p.phrase_en)}</p><p class="vi">${esc(p.phrase_vi)}</p></div>`).join('')}`);
  $('#cfoAll').onclick = () => TTS.queue(s.phrases.map(p => p.phrase_en), { onEach: i => $$('.sent').forEach(el => el.classList.toggle('playing', +el.dataset.i === i)) });
  logStudy('cfo'); saveProg();
});

/* ---------- DATA & SETTINGS ---------- */
function cleanRow(t, r) {
  const o = {};
  for (const [k, v] of Object.entries(r)) { const kk = String(k).trim(); if (!kk || kk.startsWith('__')) continue; o[kk] = typeof v === 'string' ? v.trim() : v; }
  if (t === 'vocab' && !o.id) o.id = 'U-V-' + hash(o.term);
  if (t === 'mcq' && !o.id) o.id = 'U-Q-' + hash(o.question);
  if (t === 'sentences' && !o.id) o.id = 'U-S-' + hash(o.en);
  if (t === 'sentences' && !o.passage_id) o.passage_id = 'U-MY';
  if (t === 'sentences' && !o.passage_title) o.passage_title = o.passage_id === 'U-MY' ? 'Câu tôi tự thêm' : o.passage_id;
  if (t === 'sentences' && !o.level) o.level = 1;
  if (t === 'cfo' && !o.id) o.id = 'U-C-' + hash(o.phrase_en);
  if (t === 'cfo' && !o.situation_id) o.situation_id = o.id.split('-').slice(0, -1).join('-') || o.id;
  if (t === 'cbq' && !o.q_no) o.q_no = 1;
  if ((t === 'mcq' || t === 'cbq') && o.answer) o.answer = String(o.answer).trim().toUpperCase().charAt(0);
  if (t === 'vocab') { o.topic = o.topic || 'Từ tôi tự thêm'; o.los = o.los || 'general'; }
  if (t === 'mcq') { o.los = o.los || 'general'; }
  for (const n of ['order', 'q_no', 'level', 'difficulty']) if (o[n] !== undefined && o[n] !== '') o[n] = +o[n] || o[n];
  return o;
}
async function importFile(file) {
  if (typeof XLSX === 'undefined') { toast('Thư viện đọc Excel chưa tải xong, thử lại sau vài giây.'); return; }
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const report = []; let bad = 0;
  for (const name of wb.SheetNames) {
    let t = name.trim().toLowerCase();
    if (!TYPES.includes(t)) { const g = TYPES.find(x => file.name.toLowerCase().includes(x)); if (wb.SheetNames.length === 1 && g) t = g; else { report.push(`Bỏ qua sheet "${esc(name)}" (tên sheet phải là: ${TYPES.join(', ')})`); continue; } }
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: false });
    const m = S.imp[t] = S.imp[t] || {}; let add = 0, upd = 0, skip = 0;
    for (const raw of rows) {
      const r = cleanRow(t, raw);
      if (REQUIRED[t].some(c => !r[c] && r[c] !== 0)) { skip++; continue; }
      const k = KEY[t](r);
      if (m[k] || S.byId[t]?.[k]) upd++; else add++;
      m[k] = r;
    }
    bad += skip;
    report.push(`<b>${TYPE_VI[t]}</b>: thêm ${add}, cập nhật ${upd}${skip ? `, bỏ qua ${skip} dòng thiếu cột bắt buộc (${REQUIRED[t].join(', ')})` : ''}`);
  }
  await store.set('imp', S.imp); rebuild();
  return report.join('<br>');
}
function oldImpNote() {
  const n = S.data.mcq.filter(q => q._src === 'imp' && !('question_vi' in q)).length;
  return n ? `<div class="note">Có ${n} câu MCQ chị đã nhập từ file cũ, chưa có bản dịch tiếng Việt. Vào <a href="#/data">Dữ liệu</a> và nhập lại file <b>CMA_data_private.xlsx</b> bản mới. Tiến độ làm bài giữ nguyên vì mã câu không đổi.</div>` : '';
}
function download(name, text, type = 'application/json') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
let impMsg = '';
on(/^\/data$/, async () => {
  setTitle('Dữ liệu & cài đặt');
  const cnt = t => [S.data[t].filter(r => r._src === 'pub').length, S.data[t].filter(r => r._src === 'imp').length];
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
  const v = TTS.voice();
  render(`
  <h3 style="margin-top:0">Dữ liệu hiện có</h3>
  <div class="card"><table><tr><th>Loại</th><th class="num">Có sẵn</th><th class="num">Chị nhập</th></tr>
  ${TYPES.map(t => { const [a, b] = cnt(t); return `<tr><td>${TYPE_VI[t]} <small class="muted">(sheet "${t}")</small></td><td class="num">${a}</td><td class="num">${b}</td></tr>`; }).join('')}</table></div>

  <div class="row"><a class="btn" href="#/data/qc">🔎 Báo cáo QC ngân hàng câu hỏi</a><a class="btn" href="#/formulas">∑ Thư viện công thức</a><a class="btn" href="#/concepts">🧩 Khái niệm Section A</a></div>
  <h3>Nhập file Excel hoặc CSV</h3>
  <div class="card">
    ${oldImpNote()}
    <p class="small">Mỗi sheet trong file Excel đặt tên đúng loại dữ liệu: <code>vocab</code>, <code>los</code>, <code>sentences</code>, <code>mcq</code>, <code>cbq</code>, <code>cfo</code>, <code>glossary</code>, <code>formulas</code>, <code>concepts</code>, <code>lessons</code>. Cột <code>source_type</code> (không bắt buộc) ghi nguồn: <code>ima</code>, <code>st</code> (tài liệu chị cung cấp), <code>ai</code>, <code>me</code> (chị tự nhập). Dòng 1 là tên cột (giữ như file mẫu). Dòng có cùng mã (<code>id</code>) sẽ ghi đè, dòng mới được thêm vào. Với file CSV, đặt tên file chứa loại dữ liệu, ví dụ <code>vocab.csv</code>.</p>
    <div class="row"><input type="file" id="fileIn" accept=".xlsx,.xls,.csv" multiple></div>
    <div id="impRes" class="small" style="margin-top:8px">${impMsg}</div>
    <div class="row" style="margin-top:8px"><a class="btn" href="data/CMA_data_public.xlsx" download>⬇ Tải file mẫu (toàn bộ dữ liệu có sẵn)</a></div>
    <p class="small muted">File chứa câu hỏi có bản quyền (Gleim) nằm riêng ở <b>CMA_data_private.xlsx</b>, không đưa lên mạng. Nhập file đó trên từng máy.</p>
  </div>

  <h3>Sao lưu và chuyển máy</h3>
  <div class="card">
    <p class="small">Dữ liệu và tiến độ chỉ lưu trên máy này${persisted === true ? ' (đã bật lưu trữ bền vững)' : persisted === false ? ' (trình duyệt có thể xóa khi máy thiếu dung lượng, nên sao lưu định kỳ)' : ''}. Sao lưu ra file để chuyển sang điện thoại hoặc máy khác.</p>
    <div class="row"><button id="bk">⬇ Sao lưu (tiến độ + dữ liệu đã nhập)</button><label class="btn">⬆ Khôi phục từ file sao lưu<input type="file" id="rs" accept=".json" hidden></label></div>
    <div class="row" style="margin-top:8px"><button id="clrImp">Xóa dữ liệu đã nhập</button><button id="clrProg">Xóa toàn bộ tiến độ</button></div>
  </div>

  <h3 id="voice">Giọng đọc</h3>
  <div class="card">
    ${!TTS.ok ? '<p class="note">Trình duyệt không hỗ trợ giọng đọc.</p>' : TTS.voices.length ? `
    <div class="row"><label>Giọng: <select id="vSel">${TTS.voices.map(x => `<option value="${esc(x.name)}" ${v && v.name === x.name ? 'selected' : ''}>${esc(x.name)}${x.localService ? ' · offline' : ' · cần mạng'}</option>`).join('')}</select></label></div>` :
      '<p class="note small">Chưa thấy giọng tiếng Anh (Mỹ). Windows: Settings › Time & language › Speech › Add voices › English (United States). Android: Cài đặt › Hệ thống › Ngôn ngữ › Chuyển văn bản thành giọng nói › Công cụ của Google › tải "English (United States)". iPhone: Cài đặt › Trợ năng › Nội dung được đọc › Giọng nói › English › chọn giọng và tải về.</p>'}
    <div class="row" style="margin-top:8px"><label>Tốc độ thường <input type="range" id="rN" min="0.7" max="1.2" step="0.05" value="${S.settings.rate}"></label><span id="rNv">${S.settings.rate}×</span></div>
    <div class="row"><label>Tốc độ chậm <input type="range" id="rS" min="0.4" max="0.9" step="0.05" value="${S.settings.slow}"></label><span id="rSv">${S.settings.slow}×</span></div>
    <div class="row"><button class="say" data-say="Goodwill impairment is tested at the reporting unit level.">🔊 Thử giọng</button><button class="say" data-slow="1" data-say="Goodwill impairment is tested at the reporting unit level.">🐢 Thử chậm</button></div>
    <p class="small muted">Chọn giọng có chữ "offline" để nghe được khi không có mạng.</p>
  </div>

  <h3>Cài đặt học</h3>
  <div class="card">
    <div class="row"><label>Ngày thi <input type="date" id="exD" value="${esc(S.settings.examDate)}"></label></div>
    <div class="row"><label>Số từ mới mỗi ngày <input type="number" id="npd" min="0" max="50" value="${esc(S.settings.newPerDay)}" style="width:80px"></label></div>
    <div class="row"><label><input type="checkbox" id="aSp" ${S.settings.autoSpeak ? 'checked' : ''}> Tự đọc từ khi hiện thẻ</label></div>
    <div class="row"><label>Mức tiếng Việt <select id="viLv">${[1, 2, 3].map(l => `<option value="${l}" ${viLv() === l ? 'selected' : ''}>${l}. ${VI_LEVELS[l]}</option>`).join('')}</select></label></div>
    <p class="small muted" id="viNote">${esc(VI_LEVEL_NOTE[viLv()])}</p>
    ${Object.keys(S.prog.viStat).length ? `<p class="small muted">Tỷ lệ đúng theo mức: ${[1, 2, 3].filter(l => S.prog.viStat[l]).map(l => `mức ${l}: ${pct(S.prog.viStat[l].c, S.prog.viStat[l].n)}% (${S.prog.viStat[l].n} câu)`).join(' · ')}</p>` : ''}
    ${viSuggest()}
    <div class="row"><label>Giao diện <select id="thm"><option value="">Theo máy</option><option value="light" ${S.settings.theme === 'light' ? 'selected' : ''}>Sáng</option><option value="dark" ${S.settings.theme === 'dark' ? 'selected' : ''}>Tối</option></select></label></div>
  </div>
  <div id="install"></div>
  <p class="small muted">Phiên bản ${APP_VERSION} · dữ liệu ${esc(S.pub.version)} · ${navigator.serviceWorker?.controller ? 'đã sẵn sàng chạy offline' : 'đang chuẩn bị chế độ offline (mở lại trang 1 lần)'}</p>`);
  renderInstall();
  $('#fileIn').onchange = async e => {
    const out = [];
    for (const f of e.target.files) { try { out.push(`<b>${esc(f.name)}</b><br>` + await importFile(f)); } catch (err) { out.push(`<b>${esc(f.name)}</b>: không đọc được (${esc(err.message)})`); } }
    impMsg = out.join('<br><br>'); toast('Đã nhập xong'); route();
  };
  $('#bk').onclick = () => download(`CMA-sao-luu-${today()}.json`, JSON.stringify({ app: 'cma-study', v: 1, at: new Date().toISOString(), prog: S.prog, settings: S.settings, imp: S.imp }));
  $('#rs').onchange = async e => {
    try {
      const d = JSON.parse(await e.target.files[0].text()); if (d.app !== 'cma-study') throw new Error('không phải file sao lưu của tool');
      S.prog = Object.assign(S.prog, d.prog || {}); S.settings = Object.assign(S.settings, d.settings || {}); S.imp = d.imp || {};
      await store.set('prog', S.prog); await store.set('settings', S.settings); await store.set('imp', S.imp); rebuild(); applyTheme(); toast('Đã khôi phục'); route();
    } catch (err) { toast('Không khôi phục được: ' + esc(err.message)); }
  };
  $('#clrImp').onclick = async () => { if (!confirm('Xóa toàn bộ dữ liệu chị đã nhập (kể cả câu Gleim)? Tiến độ vẫn giữ.')) return; S.imp = {}; await store.set('imp', S.imp); rebuild(); route(); };
  $('#clrProg').onclick = async () => { if (!confirm('Xóa toàn bộ tiến độ học? Nên sao lưu trước.')) return; S.prog = { srs: {}, mcq: {}, dict: {}, cbq: {}, newDay: { d: '', n: 0 }, log: {}, tr: {}, explain: {}, viStat: {}, lesson: {} }; await store.set('prog', S.prog); route(); };
  const bind = (id, k, f = x => x) => { const el = $('#' + id); if (el) el.onchange = e => { S.settings[k] = f(e.target.type === 'checkbox' ? e.target.checked : e.target.value); saveSettings(); }; };
  bind('vSel', 'voice'); bind('exD', 'examDate'); bind('npd', 'newPerDay', x => Math.max(0, +x || 0)); bind('aSp', 'autoSpeak'); bind('thm', 'theme');
  $('#viLv').onchange = e => { setViLevel(+e.target.value); $('#viNote').textContent = VI_LEVEL_NOTE[viLv()]; };
  $('#rN').oninput = e => { S.settings.rate = +e.target.value; $('#rNv').textContent = e.target.value + '×'; saveSettings(); };
  $('#rS').oninput = e => { S.settings.slow = +e.target.value; $('#rSv').textContent = e.target.value + '×'; saveSettings(); };
});

/* ---------- install prompt ---------- */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; renderInstall(); });
function renderInstall() {
  const el = $('#install'); if (!el) return;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) { el.innerHTML = ''; return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  el.innerHTML = `<h3>Cài như ứng dụng</h3><div class="card small">${deferredPrompt ? '<button class="primary" id="instBtn">📲 Cài đặt CMA Study</button>' :
    ios ? 'Trên iPhone/iPad: mở trang bằng Safari › bấm nút Chia sẻ (ô vuông có mũi tên) › "Thêm vào MH chính".' :
      'Trên Chrome/Edge: bấm biểu tượng cài đặt ở thanh địa chỉ, hoặc menu ⋮ › "Cài đặt ứng dụng" / "Thêm vào màn hình chính".'}</div>`;
  $('#instBtn') && ($('#instBtn').onclick = async () => { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; renderInstall(); });
}

/* ---------- global events ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-say]');
  if (b) { e.preventDefault(); e.stopPropagation(); TTS.speak(b.dataset.say, { slow: !!b.dataset.slow }); return; }
  const lv = e.target.closest('[data-vilv]');
  if (lv) { e.preventDefault(); setViLevel(+lv.dataset.vilv); route(); return; }
  const w = e.target.closest('.w');
  if (w && !e.target.closest('button.opt')) {
    const word = w.textContent; TTS.speak(word, { slow: true });
    const r = lookupWord(w);
    if (r && r.v) toast(`<b>${esc(r.v.term)}</b> ${esc(r.v.ipa)} <small>(${esc(r.v.word_type)})</small><br>${esc(r.v.vi_meaning)}${r.v.en_def ? `<br><small>${esc(r.v.en_def)}</small>` : ''}`, 5000);
    else if (r && r.g) toast(`<b>${esc(r.g.word)}</b> <small>(${esc(r.g.pos)})</small><br>${esc(r.g.vi)}<br><small>Từ điển AI biên soạn – cần xác minh</small>`, 4000);
    else toast(`<b>${esc(word)}</b>: chưa có trong từ điển của tool.`, 2200);
  }
});
$('#stopBtn').onclick = () => TTS.stop();
$('#backBtn').onclick = () => history.length > 1 ? history.back() : (location.hash = '#/');
window.addEventListener('hashchange', route);

/* ---------- boot ---------- */
async function boot() {
  render('<p class="muted">Đang tải dữ liệu…</p>');
  S.settings = Object.assign(S.settings, await store.get('settings') || {});
  // v1.0 → v1.1: chuyển ô "Hiện tiếng Việt" cũ sang mức tiếng Việt 1–3 (bỏ tích = mức 3)
  if (![1, 2, 3].includes(+S.settings.viLevel)) { S.settings.viLevel = S.settings.showVi === false ? 3 : 1; store.set('settings', S.settings); }
  applyTheme();
  S.prog = Object.assign(S.prog, await store.get('prog') || {});
  for (const k of ['tr', 'explain', 'viStat', 'lesson']) if (!S.prog[k] || typeof S.prog[k] !== 'object') S.prog[k] = {};
  S.imp = await store.get('imp') || {};
  try { S.pub = await (await fetch('data/public.json')).json(); }
  catch (e) { render('<div class="card"><p>Không tải được dữ liệu. Hãy mở lại khi có mạng lần đầu để tool lưu offline.</p></div>'); return; }
  rebuild(); TTS.init();
  navigator.storage?.persist?.().catch(() => { });
  route();
}
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw && nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            $('#update').hidden = false; $('#reloadBtn').onclick = () => nw.postMessage('skip');
          }
        });
      });
    }).catch(() => { });
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) return; if (!$('#update').hidden) { reloading = true; location.reload(); } });
  });
}
boot();
