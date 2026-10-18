'use strict';

/* ================================================================
 * Storyboard · 视频内容编排器
 * 结构：上半部分是与 DOM 无关的纯函数（可在 Node 里直接测试），
 *       下半部分是页面渲染与交互。
 * ================================================================ */

/* ---------- 类型识别 ---------- */

const TYPE_LABEL = { video: '视频', image: '图片', audio: '音频', link: '链接', file: '文件', text: '文字' };
const TYPE_ICON = { video: '🎬', image: '🖼️', audio: '🎵', link: '🔗', file: '📄', text: '✍️' };

const EXT_MAP = [
  ['video', ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'mts', 'ts']],
  ['image', ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'tif', 'tiff', 'avif']],
  ['audio', ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'aiff', 'wma']],
];

function detectType(src) {
  const s = String(src || '').trim().toLowerCase();
  if (!s) return 'text';
  const path = s.split(/[?#]/)[0];
  const m = path.match(/\.([a-z0-9]+)$/);
  const ext = m ? m[1] : '';
  for (const [type, exts] of EXT_MAP) {
    if (exts.includes(ext)) return type;
  }
  if (/^https?:\/\//.test(s)) return 'link';
  return 'file';
}

/* ---------- 导出内容构造（纯函数） ---------- */

const INSTRUCTION =
  '本文件是视频生成的内容编排指导：请按素材序号顺序编排成片，' +
  '结合各段描述与全局说明执行；描述中的文字、时长等要求应体现在成片里。';

function activeItems(state) {
  return state.items
    .map((it) => ({ src: String(it.src || '').trim(), note: String(it.note || '').trim() }))
    .filter((it) => it.src !== '' || it.note !== '')
    .map((it, i) => ({ ...it, index: i + 1, type: detectType(it.src) }));
}

function pad(n) { return String(n).padStart(2, '0'); }

function fmtNow() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function tsForFile() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function docTitle(state) { return String(state.title || '').trim() || '未命名'; }

function toMarkdown(state) {
  const items = activeItems(state);
  const globalNotes = String(state.globalNotes || '').trim();
  const out = [];
  out.push(`# 视频内容编排单：${docTitle(state)}`);
  out.push('');
  out.push(`> ${INSTRUCTION}`);
  out.push('');
  out.push(`- 导出时间：${fmtNow()}`);
  out.push(`- 素材数量：${items.length}（按出场顺序）`);
  out.push('');
  out.push('## 全局说明');
  out.push('');
  out.push(globalNotes || '（无）');
  out.push('');
  out.push('## 素材清单');
  items.forEach((it) => {
    out.push('');
    if (it.src) out.push(`### ${it.index}. ${TYPE_LABEL[it.type]} ${it.src}`);
    else out.push(`### ${it.index}. 文字`);
    out.push('');
    out.push(it.note || '（未填写描述）');
  });
  out.push('');
  return out.join('\n');
}

function toJSON(state) {
  const items = activeItems(state);
  return JSON.stringify(
    {
      format: 'storyboard-export',
      version: 1,
      title: docTitle(state),
      exportedAt: fmtNow(),
      instruction: INSTRUCTION,
      globalNotes: String(state.globalNotes || '').trim(),
      items: items.map((it) => ({
        index: it.index,
        type: it.type,
        typeLabel: TYPE_LABEL[it.type],
        src: it.src,
        note: it.note,
      })),
    },
    null,
    2
  ) + '\n';
}

function xmlEsc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toXML(state) {
  const items = activeItems(state);
  const globalNotes = String(state.globalNotes || '').trim();
  const out = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push(`<storyboard title="${xmlEsc(docTitle(state))}" exportedAt="${fmtNow()}" count="${items.length}">`);
  out.push(`  <instruction>${xmlEsc(INSTRUCTION)}</instruction>`);
  out.push(`  <globalNotes>${xmlEsc(globalNotes)}</globalNotes>`);
  items.forEach((it) => {
    out.push(
      `  <item index="${it.index}" type="${it.type}"${it.src ? ` src="${xmlEsc(it.src)}"` : ''}>`
    );
    out.push(`    <note>${xmlEsc(it.note)}</note>`);
    out.push('  </item>');
  });
  out.push('</storyboard>');
  out.push('');
  return out.join('\n');
}

function sanitizeFilename(name) {
  const base = String(name || '').trim().replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '');
  return base || 'storyboard';
}

/* ================================================================
 * 以下为页面逻辑
 * ================================================================ */

const STORAGE_KEY = 'storyboard-v1';
const BLANK_ROWS_ON_FRESH_START = 3;

let state = { title: '', globalNotes: '', items: [] };
let idSeq = 1;
let objUrls = new Map(); // itemId -> { url, file }，仅本次会话的预览
let storageWarned = false;

const $ = (sel) => document.querySelector(sel);
const debounce = (fn, ms) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};
const uid = () => `r${idSeq++}`;

/* ---------- 持久化 ---------- */

function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        title: state.title,
        globalNotes: state.globalNotes,
        items: state.items.map(({ src, note }) => ({ src, note })),
      })
    );
  } catch (e) {
    if (!storageWarned) {
      storageWarned = true;
      const stats = $('#stats');
      stats.classList.add('warn');
      stats.textContent = '⚠️ 当前环境无法自动保存（localStorage 不可用），请及时「保存工程」备份';
    }
  }
}
const persistSoon = debounce(persist, 400);

function restore() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch (e) { /* 损坏数据视为空文档 */ }
  if (!raw || typeof raw !== 'object') return false;
  state.title = String(raw.title || '');
  state.globalNotes = String(raw.globalNotes || '');
  state.items = Array.isArray(raw.items)
    ? raw.items.map((it) => ({ id: uid(), src: String((it && it.src) || ''), note: String((it && it.note) || '') }))
    : [];
  return state.items.some((it) => it.src || it.note) || state.title || state.globalNotes;
}

/* ---------- 行操作 ---------- */

function addRows(n) {
  for (let i = 0; i < n; i++) state.items.push({ id: uid(), src: '', note: '' });
}

function revokeObjUrl(id) {
  const rec = objUrls.get(id);
  if (rec) {
    URL.revokeObjectURL(rec.url);
    objUrls.delete(id);
  }
}

function applyFileToItem(id, file) {
  const item = state.items.find((it) => it.id === id);
  if (!item) return;
  // 当前值为空或只是文件名（无目录）时才覆写；已是完整路径则只更新预览
  const cur = item.src.trim();
  if (!cur || !cur.includes('/')) item.src = file.name;
  revokeObjUrl(id);
  objUrls.set(id, { url: URL.createObjectURL(file), file });
  const tr = rowEl(id);
  if (tr) {
    tr.querySelector('input.src-input').value = item.src;
    refreshMediaUI(tr, item);
  }
  persistSoon();
}

function rowEl(id) {
  return document.querySelector(`tr[data-id="${id}"]`);
}

/* ---------- 渲染 ---------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function buildPreview(item) {
  const type = detectType(item.src);
  const holder = el('div', 'preview');
  const rec = objUrls.get(item.id);
  let mediaSrc = null;

  if (rec) mediaSrc = rec.url;
  else {
    const s = item.src.trim();
    if (/^https?:\/\//.test(s)) mediaSrc = s;
    else if (location.protocol === 'file:' && s.startsWith('/')) mediaSrc = 'file://' + s;
  }

  const fallback = () => { holder.innerHTML = ''; holder.textContent = TYPE_ICON[type]; holder.classList.remove('clickable'); };
  const openIt = () => { if (mediaSrc) window.open(mediaSrc, '_blank'); };

  if (mediaSrc && type === 'image') {
    const img = el('img');
    img.alt = item.src || '预览';
    img.onload = () => holder.classList.add('clickable');
    img.onerror = fallback;
    img.src = mediaSrc;
    holder.appendChild(img);
    holder.addEventListener('click', openIt);
  } else if (mediaSrc && type === 'video') {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'metadata';
    v.onloadeddata = () => { try { v.currentTime = 0.1; } catch (e) {} holder.classList.add('clickable'); };
    v.onerror = fallback;
    v.src = mediaSrc;
    holder.appendChild(v);
    holder.addEventListener('click', openIt);
  } else {
    holder.textContent = TYPE_ICON[type];
    if (mediaSrc && type === 'audio') holder.title = '点击播放';
    if (mediaSrc && type === 'audio') holder.addEventListener('click', openIt);
    if (mediaSrc && type === 'audio') holder.classList.add('clickable');
  }
  return holder;
}

function refreshMediaUI(tr, item) {
  const type = detectType(item.src);
  const badge = tr.querySelector('.badge');
  badge.textContent = TYPE_LABEL[type];
  badge.className = 'badge ' + type;

  const oldPreview = tr.querySelector('.preview');
  const newPreview = buildPreview(item);
  oldPreview.replaceWith(newPreview);

  const hint = tr.querySelector('.path-hint');
  const s = item.src.trim();
  if (s && !s.includes('/') && !/^https?:\/\//.test(s)) hint.textContent = '仅文件名，请补全完整路径';
  else hint.textContent = '';
}

function createRowEl(item, index) {
  const tr = el('tr');
  tr.dataset.id = item.id;

  const tdIdx = el('td', 'idx', String(index + 1));

  const tdMedia = el('td', 'media');
  const top = el('div', 'media-top');
  const srcInput = el('input', 'src-input');
  srcInput.type = 'text';
  srcInput.spellcheck = false;
  srcInput.autocomplete = 'off';
  srcInput.placeholder = '/Users/you/Movies/clip.mp4 或 https://example.com/pic.png';
  srcInput.value = item.src;
  const pickBtn = el('button', 'btn mini', '文件…');
  pickBtn.type = 'button';
  pickBtn.title = '选择本地文件（仅填入文件名并预览）';
  pickBtn.dataset.act = 'pick';
  top.append(srcInput, pickBtn);

  const sub = el('div', 'media-sub');
  sub.append(el('span', 'badge ' + detectType(item.src), TYPE_LABEL[detectType(item.src)]), buildPreview(item), el('span', 'path-hint'));

  tdMedia.append(top, sub);

  const tdNote = el('td', 'note');
  const noteInput = el('textarea');
  noteInput.placeholder = '这段素材是什么、打算怎么用：画面内容 / 叠加文字 / 建议时长 / 转场等';
  noteInput.value = item.note;
  tdNote.appendChild(noteInput);

  const tdOps = el('td', 'ops');
  const mkBtn = (label, act, title) => {
    const b = el('button', 'btn mini', label);
    b.type = 'button';
    b.title = title;
    b.dataset.act = act;
    return b;
  };
  tdOps.append(
    mkBtn('↑', 'up', '上移一行'),
    mkBtn('↓', 'down', '下移一行'),
    mkBtn('＋', 'insert', '在下方插入一行'),
    mkBtn('✕', 'del', '删除此行')
  );

  tr.append(tdIdx, tdMedia, tdNote, tdOps);
  return tr;
}

function renderRows() {
  const tbody = $('#rows');
  tbody.innerHTML = '';
  if (state.items.length === 0) {
    const tr = el('tr', 'empty-row');
    const td = el('td');
    td.colSpan = 4;
    td.append(
      el('div', 'big', '还没有素材行'),
      el('div', null, '点击下方「添加一行」开始编排，或直接把图片 / 视频文件拖进表格')
    );
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    const frag = document.createDocumentFragment();
    state.items.forEach((item, i) => frag.appendChild(createRowEl(item, i)));
    tbody.appendChild(frag);
  }
  state.items.forEach((item) => {
    const ta = rowEl(item.id)?.querySelector('textarea');
    if (ta) fitTextarea(ta);
  });
  updateStats();
}

function updateStats() {
  if (storageWarned) return; // 保存失败提示优先
  const total = state.items.length;
  const active = activeItems(state).length;
  $('#stats').textContent = total ? `共 ${total} 行 · 导出将包含 ${active} 个素材` : '';
}

function fitTextarea(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

/* ---------- 下载 ---------- */

function download(filename, text, mime) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function exportAs(kind) {
  const base = sanitizeFilename(state.title);
  const stamp = tsForFile();
  if (kind === 'md') download(`${base}-${stamp}.md`, toMarkdown(state), 'text/markdown');
  else if (kind === 'json') download(`${base}-${stamp}.json`, toJSON(state), 'application/json');
  else if (kind === 'xml') download(`${base}-${stamp}.xml`, toXML(state), 'text/xml');
}

function saveProject() {
  const base = sanitizeFilename(state.title);
  const data = {
    format: 'storyboard-project',
    version: 1,
    savedAt: new Date().toISOString(),
    title: state.title,
    globalNotes: state.globalNotes,
    items: state.items.map(({ src, note }) => ({ src, note })),
  };
  download(`${base}.storyboard.json`, JSON.stringify(data, null, 2) + '\n', 'application/json');
}

async function loadProject(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (e) {
    alert('不是有效的 JSON 文件');
    return;
  }
  if (!data || data.format !== 'storyboard-project' || !Array.isArray(data.items)) {
    alert('不是 storyboard 工程文件（缺少 format: "storyboard-project"）');
    return;
  }
  const hasContent = state.items.some((it) => it.src || it.note) || state.title || state.globalNotes;
  if (hasContent && !confirm('载入将替换当前全部内容，继续？')) return;
  state.items.forEach((it) => revokeObjUrl(it.id));
  state.title = String(data.title || '');
  state.globalNotes = String(data.globalNotes || '');
  state.items = data.items.map((it) => ({ id: uid(), src: String((it && it.src) || ''), note: String((it && it.note) || '') }));
  renderAll();
  persist();
}

function clearAll() {
  const hasContent = state.items.some((it) => it.src || it.note) || state.title || state.globalNotes;
  if (hasContent && !confirm('确定清空全部内容？此操作不可撤销。')) return;
  state.items.forEach((it) => revokeObjUrl(it.id));
  state = { title: '', globalNotes: '', items: [] };
  addRows(BLANK_ROWS_ON_FRESH_START);
  renderAll();
  persist();
}

function renderAll() {
  $('#field-title').value = state.title;
  $('#field-notes').value = state.globalNotes;
  fitTextarea($('#field-notes'));
  renderRows();
}

/* ---------- 事件绑定 ---------- */

let pickingRowId = null;

function bindEvents() {
  $('#btn-md').addEventListener('click', () => exportAs('md'));
  $('#btn-json').addEventListener('click', () => exportAs('json'));
  $('#btn-xml').addEventListener('click', () => exportAs('xml'));
  $('#btn-saveproj').addEventListener('click', saveProject);
  $('#btn-loadproj').addEventListener('click', () => $('#proj-pick').click());
  $('#btn-clear').addEventListener('click', clearAll);
  $('#btn-add').addEventListener('click', () => {
    addRows(1);
    renderRows();
    persistSoon();
    const last = state.items[state.items.length - 1];
    rowEl(last.id)?.querySelector('input.src-input')?.focus();
  });

  $('#field-title').addEventListener('input', (e) => { state.title = e.target.value; persistSoon(); });
  $('#field-notes').addEventListener('input', (e) => {
    state.globalNotes = e.target.value;
    fitTextarea(e.target);
    persistSoon();
  });

  const filePick = $('#file-pick');
  filePick.addEventListener('change', () => {
    const f = filePick.files[0];
    if (f && pickingRowId) applyFileToItem(pickingRowId, f);
    filePick.value = '';
    pickingRowId = null;
  });

  $('#proj-pick').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) loadProject(f);
    e.target.value = '';
  });

  const tbody = $('#rows');

  tbody.addEventListener('input', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const item = state.items.find((it) => it.id === tr.dataset.id);
    if (!item) return;
    if (e.target.classList.contains('src-input')) {
      item.src = e.target.value;
      refreshMediaUI(tr, item);
      updateStats();
      persistSoon();
    } else if (e.target.tagName === 'TEXTAREA') {
      item.note = e.target.value;
      fitTextarea(e.target);
      updateStats();
      persistSoon();
    }
  });

  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const tr = btn.closest('tr[data-id]');
    if (!tr) return;
    const id = tr.dataset.id;
    const i = state.items.findIndex((it) => it.id === id);
    if (i < 0) return;
    const act = btn.dataset.act;

    if (act === 'pick') {
      pickingRowId = id;
      $('#file-pick').click();
    } else if (act === 'up' && i > 0) {
      [state.items[i - 1], state.items[i]] = [state.items[i], state.items[i - 1]];
      renderRows();
      persistSoon();
    } else if (act === 'down' && i < state.items.length - 1) {
      [state.items[i + 1], state.items[i]] = [state.items[i], state.items[i + 1]];
      renderRows();
      persistSoon();
    } else if (act === 'insert') {
      state.items.splice(i + 1, 0, { id: uid(), src: '', note: '' });
      renderRows();
      persistSoon();
      rowEl(state.items[i + 1].id)?.querySelector('input.src-input')?.focus();
    } else if (act === 'del') {
      const item = state.items[i];
      if ((item.src || item.note) && !confirm('这一行有内容，确定删除？')) return;
      revokeObjUrl(id);
      state.items.splice(i, 1);
      renderRows();
      persistSoon();
    }
  });

  /* 拖放：媒体格 = 定点放入；表格其他区域 = 追加行 */
  const handleFilesOnRow = (tr, files) => {
    const id = tr.dataset.id;
    const item = state.items.find((it) => it.id === id);
    if (!item) return;
    const [first, ...rest] = files;
    if (first) applyFileToItem(id, first);
    rest.forEach((f) => {
      addRows(1);
      applyFileToItem(state.items[state.items.length - 1].id, f);
    });
    renderRows(); // 追加行时刷新序号
    persistSoon();
  };

  tbody.addEventListener('dragover', (e) => {
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
    e.preventDefault();
    const td = e.target.closest('td.media');
    tbody.querySelectorAll('td.media.drag-over').forEach((n) => n.classList.remove('drag-over'));
    if (td) td.classList.add('drag-over');
    $('#sheet').classList.add('drag-over');
  });

  tbody.addEventListener('dragleave', (e) => {
    const td = e.target.closest('td.media');
    if (td) td.classList.remove('drag-over');
    if (!tbody.contains(e.relatedTarget)) $('#sheet').classList.remove('drag-over');
  });

  tbody.addEventListener('drop', (e) => {
    if (!e.dataTransfer) return;
    e.preventDefault();
    $('#sheet').classList.remove('drag-over');
    tbody.querySelectorAll('td.media.drag-over').forEach((n) => n.classList.remove('drag-over'));
    const files = [...e.dataTransfer.files];
    if (!files.length) return; // 拖的是文本（如网址）：交给输入框原生处理，这里不拦截
    const tr = e.target.closest('tr[data-id]');
    const onMediaCell = tr && e.target.closest('td.media');
    if (onMediaCell) {
      handleFilesOnRow(tr, files);
      return;
    }
    // 落在行的其他位置或空状态行：一律追加新行
    files.forEach((f) => {
      addRows(1);
      applyFileToItem(state.items[state.items.length - 1].id, f);
    });
    renderRows();
    persistSoon();
  });
}

/* ---------- 启动 ---------- */

function init() {
  const hadSaved = restore();
  if (!hadSaved && state.items.length === 0) addRows(BLANK_ROWS_ON_FRESH_START);
  bindEvents();
  renderAll();
}

if (typeof document !== 'undefined' && typeof window !== 'undefined' && document.getElementById('rows')) {
  init();
}

/* Node 环境下暴露纯函数，便于测试（浏览器里 module 未定义，自动跳过） */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { detectType, activeItems, toMarkdown, toJSON, toXML, sanitizeFilename };
}
