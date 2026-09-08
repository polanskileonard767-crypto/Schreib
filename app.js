const STORAGE_KEY = 'schreib-handwriting-v1';
const CANVAS_W = 900;
const CANVAS_H = 450;
const BASELINE = 338;
const GUIDE_SCALE = 2.45;

const groups = [
  { title: 'Großbuchstaben', chars: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'] },
  { title: 'Kleinbuchstaben', chars: [...'abcdefghijklmnopqrstuvwxyz'] },
  { title: 'Zahlen', chars: [...'0123456789'] },
  { title: 'Deutsch & Satzzeichen', chars: ['Ä','Ö','Ü','ä','ö','ü','ß','.',',','!','?',';',':','-','(',')','+','/','%'] }
];
const allChars = groups.flatMap(group => group.chars);

const canvas = document.getElementById('writingCanvas');
const ctx = canvas.getContext('2d');
const charGroups = document.getElementById('charGroups');
const currentCharLabel = document.getElementById('currentCharLabel');
const variantSelect = document.getElementById('variantSelect');
const previewText = document.getElementById('previewText');
const previewBox = document.getElementById('previewBox');
const fontNameInput = document.getElementById('fontName');
const strokeWidthInput = document.getElementById('strokeWidth');
const strokeWidthValue = document.getElementById('strokeWidthValue');
const progressText = document.getElementById('progressText');
const progressBar = document.getElementById('progressBar');
const capturedCount = document.getElementById('capturedCount');

let dataset = loadDataset();
let currentChar = allChars[0];
let currentVariant = 0;
let strokes = [];
let activeStroke = null;
let undoStack = [];
let redoStack = [];
let previewFontUrl = null;

function emptyGlyph(ch) {
  return { char: ch, variants: [null, null, null] };
}

function loadDataset() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, fontName: 'MeineHandschrift', glyphs: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid dataset');
    parsed.glyphs ||= {};
    parsed.fontName ||= 'MeineHandschrift';
    return parsed;
  } catch {
    return { version: 1, fontName: 'MeineHandschrift', glyphs: {} };
  }
}

function ensureGlyph(ch) {
  dataset.glyphs[ch] ||= emptyGlyph(ch);
  dataset.glyphs[ch].variants ||= [null, null, null];
  return dataset.glyphs[ch];
}

function saveDataset() {
  dataset.fontName = fontNameInput.value.trim() || 'MeineHandschrift';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dataset));
}

function renderCharButtons() {
  charGroups.innerHTML = '';
  groups.forEach(group => {
    const section = document.createElement('div');
    section.className = 'char-group';
    const title = document.createElement('h3');
    title.textContent = group.title;
    section.appendChild(title);
    const grid = document.createElement('div');
    grid.className = 'char-grid';
    group.chars.forEach(ch => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'char-chip';
      button.textContent = ch;
      button.dataset.char = ch;
      button.addEventListener('click', () => selectChar(ch));
      if (ch === currentChar) button.classList.add('active');
      if (isCaptured(ch)) button.classList.add('captured');
      grid.appendChild(button);
    });
    section.appendChild(grid);
    charGroups.appendChild(section);
  });
}

function isCaptured(ch) {
  const glyph = dataset.glyphs[ch];
  return Boolean(glyph?.variants?.some(variant => variant?.strokes?.length));
}

function updateProgress() {
  const count = allChars.filter(isCaptured).length;
  const pct = Math.round((count / allChars.length) * 100);
  progressText.textContent = `${pct} % erfasst`;
  progressBar.style.width = `${pct}%`;
  capturedCount.textContent = `${count} / ${allChars.length} Zeichen`;
}

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function saveCurrentToMemory(persist = true) {
  if (!currentChar) return;
  const glyph = ensureGlyph(currentChar);
  glyph.variants[currentVariant] = strokes.length
    ? { strokes: deepCopy(strokes), width: CANVAS_W, height: CANVAS_H, baseline: BASELINE }
    : null;
  if (persist) {
    saveDataset();
    renderCharButtons();
    updateProgress();
    updatePreview();
  }
}

function selectChar(ch) {
  if (currentChar) saveCurrentToMemory(false);
  currentChar = ch;
  currentCharLabel.textContent = ch;
  currentVariant = Number(variantSelect.value);
  const stored = ensureGlyph(ch).variants[currentVariant];
  strokes = stored?.strokes ? deepCopy(stored.strokes) : [];
  undoStack = [];
  redoStack = [];
  drawCanvas();
  renderCharButtons();
}

function drawCanvas() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  for (const stroke of strokes) {
    if (!stroke?.length) continue;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 1; i < stroke.length; i++) {
      const a = stroke[i - 1];
      const b = stroke[i];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = '#1a1b23';
      ctx.lineWidth = clamp(((a.w + b.w) / 2) || 3.4, 1.2, 10);
      ctx.stroke();
    }
  }
}

function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) * CANVAS_W / rect.width, 0, CANVAS_W),
    y: clamp((event.clientY - rect.top) * CANVAS_H / rect.height, 0, CANVAS_H),
    w: clamp(1.8 + ((event.pressure || 0.5) * 4.6), 1.8, 6.5)
  };
}

canvas.addEventListener('pointerdown', event => {
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  activeStroke = [];
  undoStack.push(deepCopy(strokes));
  redoStack = [];
  activeStroke.push(pointFromEvent(event));
  strokes.push(activeStroke);
  drawCanvas();
});

canvas.addEventListener('pointermove', event => {
  if (!activeStroke) return;
  event.preventDefault();
  const point = pointFromEvent(event);
  const last = activeStroke[activeStroke.length - 1];
  if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= 1.5) {
    activeStroke.push(point);
    drawCanvas();
  }
});

function endPointer() {
  activeStroke = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function flashButton(button, text) {
  const oldText = button.textContent;
  button.textContent = text;
  setTimeout(() => { button.textContent = oldText; }, 900);
}

document.getElementById('saveCharacterBtn').addEventListener('click', () => {
  saveCurrentToMemory(true);
  flashButton(document.getElementById('saveCharacterBtn'), 'Gespeichert ✓');
});

document.getElementById('clearBtn').addEventListener('click', () => {
  if (!strokes.length) return;
  undoStack.push(deepCopy(strokes));
  redoStack = [];
  strokes = [];
  drawCanvas();
});

document.getElementById('undoBtn').addEventListener('click', () => {
  if (!undoStack.length) return;
  redoStack.push(deepCopy(strokes));
  strokes = undoStack.pop();
  drawCanvas();
});

variantSelect.addEventListener('change', () => {
  saveCurrentToMemory(false);
  currentVariant = Number(variantSelect.value);
  const stored = ensureGlyph(currentChar).variants[currentVariant];
  strokes = stored?.strokes ? deepCopy(stored.strokes) : [];
  undoStack = [];
  redoStack = [];
  drawCanvas();
});

previewText.addEventListener('input', updatePreview);
fontNameInput.addEventListener('input', saveDataset);
strokeWidthInput.addEventListener('input', () => {
  strokeWidthValue.textContent = Number(strokeWidthInput.value).toFixed(1);
  drawCanvas();
});

function strokesToGlyphPath(glyphData) {
  const path = new opentype.Path();
  if (!glyphData?.strokes?.length) return path;

  const xs = glyphData.strokes.flatMap(stroke => stroke.map(point => point.x));
  const minSourceX = xs.length ? Math.min(...xs) : 0;
  const thicknessScale = Number(strokeWidthInput.value) / 3.4;
  const scaleX = GUIDE_SCALE;
  const scaleY = GUIDE_SCALE;
  const originX = 90;

  for (const stroke of glyphData.strokes) {
    if (!stroke?.length) continue;
    const pts = stroke.map(point => ({
      x: (point.x - minSourceX) * scaleX + originX,
      y: (BASELINE - point.y) * scaleY,
      r: Math.max(2, (point.w || 3.4) * thicknessScale * scaleY / 2)
    }));

    if (pts.length === 1) {
      path.moveTo(pts[0].x + pts[0].r, pts[0].y);
      path.lineTo(pts[0].x, pts[0].y + pts[0].r);
      path.lineTo(pts[0].x - pts[0].r, pts[0].y);
      path.lineTo(pts[0].x, pts[0].y - pts[0].r);
      path.closePath();
      continue;
    }

    const left = [];
    const right = [];
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      left.push({ x: pts[i].x + nx * pts[i].r, y: pts[i].y + ny * pts[i].r });
      right.push({ x: pts[i].x - nx * pts[i].r, y: pts[i].y - ny * pts[i].r });
    }

    const polygon = [...left, ...right.reverse()];
    if (polygon.length < 3) continue;
    path.moveTo(polygon[0].x, polygon[0].y);
    for (let i = 1; i < polygon.length; i++) path.lineTo(polygon[i].x, polygon[i].y);
    path.closePath();
  }
  return path;
}

function glyphFromData(ch, data) {
  const path = strokesToGlyphPath(data);
  const xs = data?.strokes?.flatMap(stroke => stroke.map(point => point.x)) || [];
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 120;
  const advanceWidth = Math.min(1250, Math.max(220, (maxX - minX) * GUIDE_SCALE + 160));
  const unicode = ch.codePointAt(0);
  return new opentype.Glyph({
    name: `uni${unicode.toString(16)}`,
    unicode,
    advanceWidth,
    path
  });
}

function buildFont() {
  if (!window.opentype) throw new Error('Die Font-Bibliothek konnte nicht geladen werden.');

  const notdefPath = new opentype.Path();
  notdefPath.moveTo(80, -200);
  notdefPath.lineTo(80, 750);
  notdefPath.lineTo(600, 750);
  notdefPath.lineTo(600, -200);
  notdefPath.closePath();
  const glyphs = [new opentype.Glyph({ name: '.notdef', advanceWidth: 650, path: notdefPath })];

  glyphs.push(new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: 280, path: new opentype.Path() }));

  for (const ch of allChars) {
    const data = dataset.glyphs[ch]?.variants?.find(variant => variant?.strokes?.length);
    if (data) glyphs.push(glyphFromData(ch, data));
  }

  if (glyphs.length < 3) throw new Error('Noch keine Zeichen gespeichert. Schreibe mindestens ein Zeichen und speichere es.');

  const cleanFamily = (fontNameInput.value.trim() || 'MeineHandschrift')
    .replace(/[^a-zA-Z0-9ÄÖÜäöüß _-]/g, '')
    .slice(0, 32) || 'MeineHandschrift';

  return new opentype.Font({
    familyName: cleanFamily,
    styleName: 'Regular',
    unitsPerEm: 1000,
    ascender: 830,
    descender: -240,
    glyphs
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFilename(name) {
  return (name || 'MeineHandschrift').replace(/[^a-z0-9äöüß_-]+/gi, '_').slice(0, 40);
}

document.getElementById('fontDownloadBtn').addEventListener('click', () => {
  try {
    saveCurrentToMemory(true);
    const font = buildFont();
    downloadBlob(new Blob([font.toArrayBuffer()], { type: 'font/otf' }), `${safeFilename(fontNameInput.value)}.otf`);
    flashButton(document.getElementById('fontDownloadBtn'), 'OTF erstellt ✓');
  } catch (error) {
    alert(error.message || 'Font konnte nicht erstellt werden.');
  }
});

document.getElementById('exportJsonBtn').addEventListener('click', () => {
  saveCurrentToMemory(true);
  const exportData = { ...dataset, exportedAt: new Date().toISOString() };
  downloadBlob(new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' }), 'schreib-dataset.json');
});

document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!imported || typeof imported !== 'object' || typeof imported.glyphs !== 'object') throw new Error('Ungültiges Dataset.');
    dataset = { version: 1, fontName: imported.fontName || 'MeineHandschrift', glyphs: imported.glyphs };
    fontNameInput.value = dataset.fontName;
    saveDataset();
    selectChar(currentChar);
    updateProgress();
    updatePreview();
  } catch (error) {
    alert(error.message || 'Import fehlgeschlagen.');
  } finally {
    event.target.value = '';
  }
});

function updatePreview() {
  previewBox.textContent = previewText.value || '';
  if (previewFontUrl) {
    URL.revokeObjectURL(previewFontUrl);
    previewFontUrl = null;
  }

  if (!allChars.some(isCaptured)) {
    previewBox.style.fontFamily = 'inherit';
    document.getElementById('dynamic-schreib-font')?.remove();
    return;
  }

  try {
    const font = buildFont();
    previewFontUrl = URL.createObjectURL(new Blob([font.toArrayBuffer()], { type: 'font/otf' }));
    const styleId = 'dynamic-schreib-font';
    document.getElementById(styleId)?.remove();
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `@font-face{font-family:'SchreibLive';src:url(${previewFontUrl}) format('opentype');font-display:swap}.preview-box{font-family:'SchreibLive',inherit}`;
    document.head.appendChild(style);
  } catch {
    previewBox.style.fontFamily = 'inherit';
  }
}

fontNameInput.value = dataset.fontName || 'MeineHandschrift';
strokeWidthValue.textContent = Number(strokeWidthInput.value).toFixed(1);
renderCharButtons();
updateProgress();
selectChar(currentChar);
updatePreview();
