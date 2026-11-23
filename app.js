/* CMA Study – PWA học tiếng Anh kế toán và luyện thi CMA Part 1.
   Không cần build. Dữ liệu: data/public.json (nội dung tự soạn) + file Excel người dùng nhập (lưu IndexedDB). */
'use strict';
const APP_VERSION = '1.0.0';
const TYPES = ['vocab', 'los', 'sentences', 'mcq', 'cbq', 'cfo'];
const TYPE_VI = { vocab: 'Từ vựng', los: 'LOS', sentences: 'Câu song ngữ', mcq: 'Câu MCQ', cbq: 'Câu CBQ', cfo: 'Mẫu câu CFO' };
const KEY = {
  vocab: r => r.id, los: r => r.los, sentences: r => r.id, mcq: r => r.id,
  cbq: r => r.case_id + '#' + r.q_no, cfo: r => r.id
};
const REQUIRED = {
  vocab: ['term', 'vi_meaning'], los: ['los', 'title_en'], sentences: ['en', 'vi'],
  mcq: ['question', 'A', 'B', 'answer'], cbq: ['case_id', 'question', 'A', 'B', 'answer'], cfo: ['phrase_en', 'phrase_vi']
};
const BOX_DAYS = [0, 1, 2, 4, 7, 14];
const COVER_CLASS = { 'Đủ': 'ok', 'Một phần': 'warn', 'Thiếu': 'bad', 'Lệch': 'bad' };

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const view = () => $('#view');
function spk(text) {
  return String(text ?? '').split(/([A-Za-z][A-Za-z'’-]*)/).map((t, i) => i % 2 ? `<span class="w">${esc(t)}</span>` : esc(t)).join('');
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
function srcPill(src) {
  if (!src) return '';
  const warn = /cần đối chiếu/i.test(src);
  return `<span class="pill ${warn ? 'warn' : ''}" title="Nguồn">${esc(src)}</span>`;
}

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
  pub: null, imp: {}, data: {}, byId: {}, byLos: {}, termMap: {},
  prog: { srs: {}, mcq: {}, dict: {}, cbq: {}, newDay: { d: '', n: 0 }, log: {} },
  settings: { rate: 0.95, slow: 0.65, voice: '', examDate: '2027-05-01', newPerDay: 10, autoSpeak: true, theme: '', showVi: true }
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
  S.termMap = {};
  for (const v of S.data.vocab) S.termMap[String(v.term).toLowerCase()] = v;
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
  <h3>Hôm nay</h3>
  <div class="grid">
    <a class="tile" href="#/english/cards"><b>${due} thẻ đến hạn</b><small>+ ${nl} từ mới (giới hạn ${esc(S.settings.newPerDay)}/ngày)</small></a>
    <a class="tile" href="#/exam/mcq?mode=random&n=10"><b>10 câu MCQ</b><small>Đã làm ${att} lượt, đúng ${pct(cor, att)}%</small></a>
    <a class="tile" href="#/english/dict"><b>Nghe – chép 5 câu</b><small>Luyện nghe và chính tả</small></a>
    <a class="tile" href="#/english/read"><b>Đọc song ngữ</b><small>${new Set(S.data.sentences.map(s => s.passage_id)).size} đoạn văn</small></a>
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
  </div>
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
    <h3>Trong đề thi CMA</h3>
    <p class="en">${spk(v.exam_example_en)} ${sayBtns(v.exam_example_en)}</p>
    ${S.settings.showVi ? `<p class="vi">${esc(v.exam_example_vi)}</p>` : ''}
    <h3>Trong công việc CFO</h3>
    <p class="en">${spk(v.cfo_example_en)} ${sayBtns(v.cfo_example_en)}</p>
    ${S.settings.showVi ? `<p class="vi">${esc(v.cfo_example_vi)}</p>` : ''}
    <div class="row small" style="margin-top:10px">${v.los && v.los !== 'general' ? `<a href="#/know/${encodeURIComponent(v.los)}" class="pill">${esc(shortLos(v.los))}</a>` : ''}<span class="pill">${esc(v.topic)}</span>${srcPill(v.source)}</div>`;
}
on(/^\/english\/word\/(.+)$/, ([id]) => {
  const v = S.byId.vocab[id]; if (!v) return render('<p>Không tìm thấy từ.</p>');
  setTitle(v.term);
  render(`<div class="card">${cardBack(v)}</div>`);
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
  render(`
  <div class="row" style="margin-bottom:12px">
    <button class="primary" id="playAll">▶ Đọc cả đoạn</button><button id="playSlow">🐢 Đọc chậm</button>
    <label class="row small"><input type="checkbox" id="showVi" ${S.settings.showVi ? 'checked' : ''}> Hiện tiếng Việt</label>
  </div>
  <div class="card" id="sents">${p.sents.map((s, i) => `
    <div class="sent" data-i="${i}"><div class="en">${spk(s.en)} ${sayBtns(s.en)}</div><div class="vi" ${S.settings.showVi ? '' : 'hidden'}>${esc(s.vi)}</div></div>`).join('')}
  </div>
  <div class="row"><a class="btn" href="#/english/dict?src=passage&id=${encodeURIComponent(p.id)}">✍️ Nghe – chép đoạn này</a><a class="btn" href="#/english/speak?src=passage&id=${encodeURIComponent(p.id)}">🎙 Nói theo đoạn này</a>
  ${S.byLos[p.los] ? `<a class="btn" href="#/know/${encodeURIComponent(p.los)}">📘 LOS ${esc(shortLos(p.los))}</a>` : ''}</div>`);
  const play = slow => TTS.queue(p.sents.map(s => s.en), {
    slow, onEach: i => $$('.sent').forEach(el => el.classList.toggle('playing', +el.dataset.i === i))
  });
  $('#playAll').onclick = () => play(false);
  $('#playSlow').onclick = () => play(true);
  $('#showVi').onchange = e => { S.settings.showVi = e.target.checked; saveSettings(); $$('#sents .vi').forEach(el => el.hidden = !e.target.checked); };
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
    <div class="row"><b>${esc(shortLos(code))}</b>${coverPill(l.coverage)}${srcPill(l.source)}</div>
    <h2 class="en" style="margin-top:8px">${spk(l.title_en)} ${sayBtns(l.title_en)}</h2>
    <p class="vi">${esc(l.title_vi)}</p>
  </div>
  <div class="card"><h3 style="margin-top:0">Tóm tắt (tiếng Anh)</h3>
    ${splitSent(l.summary_en).map(s => `<p class="en">${spk(s)} ${sayBtns(s)}</p>`).join('')}
    <details ${S.settings.showVi ? 'open' : ''}><summary>Bản tiếng Việt</summary><p>${esc(l.summary_vi)}</p></details>
  </div>
  ${l.smarttrain_ref ? `<div class="card"><h3 style="margin-top:0">Smart Train</h3><p>${esc(l.smarttrain_ref)}</p></div>` : ''}
  ${l.vas_compare ? `<div class="card"><h3 style="margin-top:0">So sánh với VAS</h3><p>${esc(l.vas_compare)}</p></div>` : ''}
  ${l.ifrs_compare ? `<div class="card"><h3 style="margin-top:0">US GAAP và IFRS</h3><p>${esc(l.ifrs_compare)}</p></div>` : ''}
  <div class="row">
    ${nq ? `<a class="btn primary" href="#/exam/mcq?los=${encodeURIComponent(code)}">📝 Luyện ${nq} câu MCQ</a>` : '<span class="muted small">Chưa có câu MCQ cho LOS này.</span>'}
    ${cb.map(c => `<a class="btn" href="#/exam/cbq/${encodeURIComponent(c)}">📋 CBQ ${esc(c)}</a>`).join('')}
    ${ps.map(p => `<a class="btn" href="#/english/read/${encodeURIComponent(p.id)}">📖 ${esc(p.title)}</a>`).join('')}
  </div>
  ${nv.length ? `<h3>Từ vựng của LOS này</h3><div class="card"><ul class="list">${nv.map(wordRow).join('')}</ul></div>` : ''}`);
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
  </div>
  <h3>Luyện theo LOS</h3>
  <div class="card row"><select id="losSel" style="flex:1">${los.map(l => { const c = S.data.mcq.filter(q => q.los === l.los).length; return c ? `<option value="${esc(l.los)}">${esc(shortLos(l.los))} – ${esc(l.title_vi)} (${c})</option>` : ''; }).join('')}</select>
  <button class="primary" id="goLos">Bắt đầu</button></div>
  ${priv ? '' : `<div class="note">Muốn thêm 453 câu Gleim (Unit 1–6) có giải thích tiếng Việt: vào <a href="#/data">Dữ liệu</a>, nhập file <b>CMA_data_private.xlsx</b>.</div>`}`);
  $('#goLos').onclick = () => location.hash = '#/exam/mcq?los=' + encodeURIComponent($('#losSel').value);
});

let ex = null;
on(/^\/exam\/mcq$/, (_, q) => {
  const key = JSON.stringify(q);
  if (!ex || ex.key !== key) {
    let pool = S.data.mcq;
    if (q.los) pool = pool.filter(x => x.los === q.los);
    if (q.mode === 'wrong') pool = pool.filter(x => S.prog.mcq[x.id] && !S.prog.mcq[x.id].last);
    if (q.mode === 'weak') { const w = new Set(weakLos(10).map(x => x.los)); pool = pool.filter(x => w.has(x.los)); }
    if (q.mode === 'random' || q.mode === 'timed') {
      // ưu tiên câu chưa làm
      const fresh = shuffle(pool.filter(x => !S.prog.mcq[x.id])), seen = shuffle(pool.filter(x => S.prog.mcq[x.id]));
      pool = fresh.concat(seen).slice(0, +q.n || 10); pool = shuffle(pool);
    } else pool = shuffle(pool);
    const timed = q.mode === 'timed';
    ex = { key, ids: pool.map(x => x.id), i: 0, ans: {}, timed, end: timed ? Date.now() + pool.length * 108e3 : 0, done: false, title: q.los ? 'LOS ' + shortLos(q.los) : (timed ? 'Đề thử' : 'Luyện MCQ') };
  }
  drawQ();
});
function qHtml(x) { const mono = /\S {3,}\S/.test(x.question) || /\n.*\$/.test(x.question); return `<div class="q ${mono ? 'mono' : ''}">${spk(x.question)}</div>`; }
function drawQ() {
  setTitle(ex.title);
  clearInterval(drawQ._t);
  if (!ex.ids.length) { render(`<div class="card"><p>Không có câu hỏi phù hợp.</p><a class="btn" href="#/exam">Quay lại</a></div>`); return; }
  if (ex.done || ex.i >= ex.ids.length) return drawResult();
  const x = S.byId.mcq[ex.ids[ex.i]];
  const picked = ex.ans[x.id];
  const show = picked && !ex.timed;
  const opts = ['A', 'B', 'C', 'D'].filter(k => x[k] !== '' && x[k] != null);
  render(`
  <div class="row small muted" style="margin-bottom:8px"><span>Câu ${ex.i + 1}/${ex.ids.length}</span><span class="pill">${esc(shortLos(x.los))}</span>
    ${ex.timed ? `<span class="spacer"></span><span class="timer" id="tmr"></span>` : ''}</div>
  <div class="card">
    ${qHtml(x)}
    <div class="row" style="margin:8px 0">${sayBtns(x.question, 'câu hỏi')}</div>
    ${opts.map(k => {
      let cls = '';
      if (show) cls = k === x.answer ? 'right' : (k === picked ? 'wrong' : '');
      else if (ex.timed && picked === k) cls = 'right';
      return `<button class="opt ${cls}" data-k="${k}"><b>${k}.</b><span>${esc(x[k])}</span></button>`;
    }).join('')}
  </div>
  ${show ? `<div class="card">
     <h3 style="margin-top:0">${picked === x.answer ? '✓ Đúng' : `✗ Sai – đáp án ${esc(x.answer)}`}</h3>
     <p>${esc(x.explain_vi)}</p>
     <details><summary>Giải thích tiếng Anh</summary>${splitSent(x.explain_en).map(s => `<p class="en">${spk(s)} ${sayBtns(s)}</p>`).join('')}</details>
     <div class="row small">${srcPill(x.source)}<a class="pill" href="#/know/${encodeURIComponent(x.los)}">Xem LOS ${esc(shortLos(x.los))}</a></div>
   </div>` : ''}
  <div class="row">
    ${ex.i > 0 ? '<button id="qPrev">‹ Câu trước</button>' : ''}<span class="spacer"></span>
    ${ex.timed ? '<button id="qSubmit">Nộp bài</button>' : ''}
    ${(show || ex.timed) ? `<button class="primary" id="qNext">${ex.i + 1 < ex.ids.length ? 'Câu tiếp ›' : 'Xem kết quả'}</button>` : ''}
  </div>`);
  $$('.opt').forEach(b => b.onclick = () => {
    if (show) return;
    const k = b.dataset.k; const first = !(x.id in ex.ans);
    ex.ans[x.id] = k;
    if (!ex.timed && first) recordQ(x, k === x.answer);
    drawQ();
  });
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
    <details><summary>Bản tiếng Việt</summary>${String(c.vi).split(/\n+/).map(p => `<p class="q">${esc(p)}</p>`).join('')}</details>
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
  render(`${showCase}
  <div class="card">
    <div class="row small muted"><span>Câu ${cb.i + 1}/${c.qs.length}</span></div>
    <p class="en">${spk(x.question)} ${sayBtns(x.question)}</p>
    ${['A', 'B', 'C', 'D'].filter(k => x[k] !== '' && x[k] != null).map(k => `<button class="opt ${picked ? (k === x.answer ? 'right' : k === picked ? 'wrong' : '') : ''}" data-k="${k}"><b>${k}.</b><span>${esc(x[k])}</span></button>`).join('')}
    ${picked ? `<h3>${picked === x.answer ? '✓ Đúng' : '✗ Sai – đáp án ' + esc(x.answer)}</h3><p>${esc(x.explain_vi)}</p>
      <details><summary>Giải thích tiếng Anh</summary><p class="en">${spk(x.explain_en)} ${sayBtns(x.explain_en)}</p></details>
      <button class="primary" id="cbNext">${cb.i + 1 < c.qs.length ? 'Câu tiếp ›' : 'Xem kết quả'}</button>` : ''}
  </div>`);
  $$('.opt').forEach(b => b.onclick = () => { if (cb.ans[x.q_no]) return; cb.ans[x.q_no] = b.dataset.k; route(); });
  $('#cbNext') && ($('#cbNext').onclick = () => { cb.i++; route(); });
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
  ${days.reverse().map(d => { const x = S.prog.log[d]; return `<tr><td>${d}</td><td class="num">${x.cards || 0}</td><td class="num">${x.mcq || 0}</td><td class="num">${x.dict || 0}</td><td class="num">${(x.read || 0) + (x.speak || 0) + (x.cbq || 0) + (x.cfo || 0)}</td></tr>`; }).join('') || '<tr><td colspan="5" class="muted">Chưa có</td></tr>'}</table></div>`);
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

  <h3>Nhập file Excel hoặc CSV</h3>
  <div class="card">
    <p class="small">Mỗi sheet trong file Excel đặt tên đúng loại dữ liệu: <code>vocab</code>, <code>los</code>, <code>sentences</code>, <code>mcq</code>, <code>cbq</code>, <code>cfo</code>. Dòng 1 là tên cột (giữ như file mẫu). Dòng có cùng mã (<code>id</code>) sẽ ghi đè, dòng mới được thêm vào. Với file CSV, đặt tên file chứa loại dữ liệu, ví dụ <code>vocab.csv</code>.</p>
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
    <div class="row"><label><input type="checkbox" id="sVi" ${S.settings.showVi ? 'checked' : ''}> Hiện tiếng Việt kèm câu tiếng Anh</label></div>
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
  $('#clrProg').onclick = async () => { if (!confirm('Xóa toàn bộ tiến độ học? Nên sao lưu trước.')) return; S.prog = { srs: {}, mcq: {}, dict: {}, cbq: {}, newDay: { d: '', n: 0 }, log: {} }; await store.set('prog', S.prog); route(); };
  const bind = (id, k, f = x => x) => { const el = $('#' + id); if (el) el.onchange = e => { S.settings[k] = f(e.target.type === 'checkbox' ? e.target.checked : e.target.value); saveSettings(); }; };
  bind('vSel', 'voice'); bind('exD', 'examDate'); bind('npd', 'newPerDay', x => Math.max(0, +x || 0)); bind('aSp', 'autoSpeak'); bind('sVi', 'showVi'); bind('thm', 'theme');
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
  const w = e.target.closest('.w');
  if (w && !e.target.closest('button.opt')) {
    const word = w.textContent; TTS.speak(word, { slow: true });
    const hit = S.termMap[word.toLowerCase()] || S.termMap[word.toLowerCase().replace(/(ies)$/, 'y').replace(/s$/, '')];
    if (hit) toast(`<b>${esc(hit.term)}</b> ${esc(hit.ipa)}<br>${esc(hit.vi_meaning)}`, 3500);
  }
});
$('#stopBtn').onclick = () => TTS.stop();
$('#backBtn').onclick = () => history.length > 1 ? history.back() : (location.hash = '#/');
window.addEventListener('hashchange', route);

/* ---------- boot ---------- */
async function boot() {
  render('<p class="muted">Đang tải dữ liệu…</p>');
  S.settings = Object.assign(S.settings, await store.get('settings') || {});
  applyTheme();
  S.prog = Object.assign(S.prog, await store.get('prog') || {});
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
