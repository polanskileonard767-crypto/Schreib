(() => {
  'use strict';

  const STORAGE_KEY = 'schreib-handwriting-v2';
  const CANVAS_W = 1200;
  const CANVAS_H = 600;
  const BASELINE_Y = 420;
  const FONT_X_SCALE = 2.0;
  const FONT_Y_SCALE = 2.0;
  const FONT_SIDE_BEARING = 70;
  const VARIANTS = 3;
  const CHARSET = [
    { title: 'Großbuchstaben', chars: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'] },
    { title: 'Kleinbuchstaben', chars: [...'abcdefghijklmnopqrstuvwxyz'] },
    { title: 'Zahlen', chars: [...'0123456789'] },
    { title: 'Deutsch & Satzzeichen', chars: ['Ä','Ö','Ü','ä','ö','ü','ß','.',',','!','?',';',':','-','(',')','+','/','%'] }
  ];
  const ALL_CHARS = CHARSET.flatMap(group => group.chars);

  const $ = (id) => document.getElementById(id);
  const writingCanvas = $('writingCanvas');
  const writingCtx = writingCanvas.getContext('2d');
  const previewCanvas = $('previewCanvas');
  const previewCtx = previewCanvas.getContext('2d');
  const charGroupsEl = $('charGroups');
  const currentCharLabel = $('currentCharLabel');
  const variantBadge = $('variantBadge');
  const previewText = $('previewText');
  const previewStatus = $('previewStatus');
  const missingCard = $('missingCard');
  const missingChars = $('missingChars');
  const writingEmpty = $('writingEmpty');
  const writingPrompt = $('writingPrompt');
  const progressText = $('progressText');
  const progressBar = $('progressBar');
  const capturedCount = $('capturedCount');
  const progressHint = $('progressHint');
  const glyphInfo = $('glyphInfo');
  const variantInfo = $('variantInfo');
  const fontReadyInfo = $('fontReadyInfo');
  const fontNameInput = $('fontName');
  const strokeWidthInput = $('strokeWidth');
  const strokeWidthValue = $('strokeWidthValue');
  const autosaveState = $('autosaveState');

  let dataset = loadDataset();
  let currentChar = ALL_CHARS[0];
  let currentVariant = 0;
  let strokes = [];
  let activeStroke = null;
  let undoStack = [];
  let redoStack = [];
  let previewFont = null;
  let lastPreviewMissing = [];

  function blankGlyph(ch) {
    return { char: ch, variants: [null, null, null] };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeDataset(input) {
    const result = { version: 2, fontName: String(input?.fontName || 'MeineHandschrift').slice(0, 32), glyphs: {} };
    if (!input || typeof input !== 'object' || !input.glyphs || typeof input.glyphs !== 'object') return result;

    for (const ch of ALL_CHARS) {
      const source = input.glyphs[ch];
      if (!source) continue;
      const variants = Array.isArray(source.variants) ? source.variants : [];
      result.glyphs[ch] = {
        char: ch,
        variants: Array.from({ length: VARIANTS }, (_, i) => {
          const v = variants[i];
          return v && Array.isArray(v.strokes) && v.strokes.length
            ? { strokes: v.strokes, width: Number(v.width) || CANVAS_W, height: Number(v.height) || CANVAS_H, baseline: Number(v.baseline) || BASELINE_Y }
            : null;
        })
      };
    }
    return result;
  }

  function loadDataset() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('schreib-handwriting-v1');
      return normalizeDataset(raw ? JSON.parse(raw) : null);
    } catch {
      return normalizeDataset(null);
    }
  }

  function persistDataset() {
    dataset.fontName = (fontNameInput.value.trim() || 'MeineHandschrift').slice(0, 32);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataset));
      setAutosave('Automatisch gespeichert', 'ok');
    } catch {
      setAutosave('Lokaler Speicher voll', 'warn');
    }
  }

  function ensureGlyph(ch) {
    dataset.glyphs[ch] ||= blankGlyph(ch);
    dataset.glyphs[ch].variants ||= [null, null, null];
    while (dataset.glyphs[ch].variants.length < VARIANTS) dataset.glyphs[ch].variants.push(null);
    return dataset.glyphs[ch];
  }

  function isCaptured(ch) {
    return Boolean(dataset.glyphs[ch]?.variants?.some(v => v?.strokes?.length));
  }

  function countCaptured() { return ALL_CHARS.filter(isCaptured).length; }

  function countVariants() {
    return ALL_CHARS.reduce((sum, ch) => sum + (dataset.glyphs[ch]?.variants || []).filter(v => v?.strokes?.length).length, 0);
  }

  function renderCharGroups() {
    charGroupsEl.innerHTML = '';
    for (const group of CHARSET) {
      const section = document.createElement('section');
      section.className = 'char-group';
      const title = document.createElement('h3');
      title.textContent = group.title;
      section.appendChild(title);

      const grid = document.createElement('div');
      grid.className = 'char-grid';
      for (const ch of group.chars) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'char-chip';
        button.textContent = ch;
        const variantCount = (dataset.glyphs[ch]?.variants || []).filter(v => v?.strokes?.length).length;
        button.title = variantCount ? `${ch}: ${variantCount}/${VARIANTS} Varianten` : `${ch}: noch nicht erfasst`;
        button.setAttribute('aria-label', button.title);
        if (ch === currentChar) button.classList.add('active');
        if (variantCount > 0) button.classList.add('captured');
        if (variantCount === VARIANTS) button.classList.add('full');
        button.addEventListener('click', () => selectChar(ch));
        grid.appendChild(button);
      }
      section.appendChild(grid);
      charGroupsEl.appendChild(section);
    }
  }

  function updateProgress() {
    const captured = countCaptured();
    const pct = Math.round((captured / ALL_CHARS.length) * 100);
    progressText.textContent = `${pct} %`;
    progressBar.style.width = `${pct}%`;
    capturedCount.textContent = `${captured} / ${ALL_CHARS.length} Zeichen`;
    glyphInfo.textContent = captured;
    variantInfo.textContent = countVariants();
    if (captured === 0) progressHint.textContent = 'Starte mit dem A.';
    else if (captured < 10) progressHint.textContent = 'Sehr gut. Die Live-Vorschau wird mit jedem Zeichen besser.';
    else if (captured < ALL_CHARS.length) progressHint.textContent = 'Deine Schrift wächst. Fehlende Zeichen werden markiert.';
    else progressHint.textContent = 'Komplett erfasst. Dein Font ist bereit.';
  }

  function setAutosave(text, state = '') {
    autosaveState.textContent = text;
    autosaveState.className = `status-pill${state ? ` ${state}` : ''}`;
  }

  function updateVariantUI() {
    currentCharLabel.textContent = currentChar;
    variantBadge.textContent = `Variante ${currentVariant + 1}`;
    writingPrompt.textContent = `Schreib dein „${currentChar}“ hier`;
  }

  function selectChar(ch) {
    saveCurrentDraft();
    currentChar = ch;
    const stored = ensureGlyph(ch).variants[currentVariant];
    strokes = stored?.strokes ? clone(stored.strokes) : [];
    undoStack = [];
    redoStack = [];
    updateVariantUI();
    renderWritingCanvas();
    renderCharGroups();
    updateProgress();
    refreshPreview();
  }

  function switchVariant(index) {
    saveCurrentDraft();
    currentVariant = Math.max(0, Math.min(VARIANTS - 1, index));
    const stored = ensureGlyph(currentChar).variants[currentVariant];
    strokes = stored?.strokes ? clone(stored.strokes) : [];
    undoStack = [];
    redoStack = [];
    updateVariantUI();
    renderWritingCanvas();
    refreshPreview();
  }

  // Three compact variant controls are injected beside the current variant badge.
  const variantGroup = document.createElement('div');
  variantGroup.className = 'variant-selector';
  for (let i = 0; i < VARIANTS; i++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = String(i + 1);
    button.dataset.variant = String(i);
    button.addEventListener('click', () => switchVariant(i));
    variantGroup.appendChild(button);
  }
  variantBadge.insertAdjacentElement('afterend', variantGroup);

  function pointFromPointer(event) {
    const rect = writingCanvas.getBoundingClientRect();
    const pressure = Number.isFinite(event.pressure) && event.pressure > 0 ? event.pressure : 0.5;
    return {
      x: clamp((event.clientX - rect.left) * CANVAS_W / rect.width, 0, CANVAS_W),
      y: clamp((event.clientY - rect.top) * CANVAS_H / rect.height, 0, CANVAS_H),
      w: clamp(1.6 + pressure * 3.6, 1.7, 5.4)
    };
  }

  function renderWritingCanvas() {
    writingCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    writingCtx.fillStyle = '#fffefa';
    writingCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    const widthScale = Number(strokeWidthInput.value) || 1;
    strokes.forEach(stroke => drawStroke(writingCtx, stroke, widthScale));
    writingEmpty.classList.toggle('hidden', strokes.length > 0);
    [...variantGroup.children].forEach(button => button.classList.toggle('active', Number(button.dataset.variant) === currentVariant));
  }

  function drawStroke(context, stroke, widthScale = 1, color = '#17181b') {
    if (!stroke?.length) return;
    context.save();
    context.strokeStyle = color;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    if (stroke.length === 1) {
      const p = stroke[0];
      context.beginPath();
      context.arc(p.x, p.y, ((p.w || 3.4) * widthScale) / 2, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
      context.restore();
      return;
    }
    for (let i = 1; i < stroke.length; i++) {
      const a = stroke[i - 1];
      const b = stroke[i];
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.lineWidth = clamp((((a.w || 3.4) + (b.w || 3.4)) / 2) * widthScale, 1.3, 9.8);
      context.stroke();
    }
    context.restore();
  }

  function pushUndo() {
    undoStack.push(clone(strokes));
    if (undoStack.length > 80) undoStack.shift();
    redoStack = [];
  }

  writingCanvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    writingCanvas.setPointerCapture(event.pointerId);
    pushUndo();
    activeStroke = [pointFromPointer(event)];
    strokes.push(activeStroke);
    renderWritingCanvas();
  });

  writingCanvas.addEventListener('pointermove', (event) => {
    if (!activeStroke) return;
    event.preventDefault();
    const next = pointFromPointer(event);
    const last = activeStroke[activeStroke.length - 1];
    if (!last || Math.hypot(next.x - last.x, next.y - last.y) >= 1.2) {
      activeStroke.push(next);
      renderWritingCanvas();
    }
  });

  function finishStroke() {
    if (!activeStroke) return;
    activeStroke = null;
    saveCurrentDraft(true);
    refreshPreview();
  }

  writingCanvas.addEventListener('pointerup', finishStroke);
  writingCanvas.addEventListener('pointercancel', finishStroke);

  function saveCurrentDraft(persist = false) {
    const glyph = ensureGlyph(currentChar);
    glyph.variants[currentVariant] = strokes.length
      ? { strokes: clone(strokes), width: CANVAS_W, height: CANVAS_H, baseline: BASELINE_Y }
      : null;
    if (persist) {
      persistDataset();
      renderCharGroups();
      updateProgress();
    }
  }

  function clearCurrent() {
    if (!strokes.length) return;
    pushUndo();
    strokes = [];
    renderWritingCanvas();
    saveCurrentDraft(true);
    refreshPreview();
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(clone(strokes));
    strokes = undoStack.pop();
    renderWritingCanvas();
    saveCurrentDraft(true);
    refreshPreview();
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(clone(strokes));
    strokes = redoStack.pop();
    renderWritingCanvas();
    saveCurrentDraft(true);
    refreshPreview();
  }

  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

  function bboxOfStrokes(data) {
    const points = (data?.strokes || []).flatMap(stroke => stroke || []);
    if (!points.length) return { minX: 0, maxX: 120, minY: BASELINE_Y, maxY: BASELINE_Y };
    return {
      minX: Math.min(...points.map(p => Number(p.x) || 0)),
      maxX: Math.max(...points.map(p => Number(p.x) || 0)),
      minY: Math.min(...points.map(p => Number(p.y) || 0)),
      maxY: Math.max(...points.map(p => Number(p.y) || 0))
    };
  }

  function addRoundContour(path, cx, cy, radius, steps = 14) {
    if (radius <= 0) return;
    path.moveTo(cx + radius, cy);
    for (let i = 1; i <= steps; i++) {
      const a = (Math.PI * 2 * i) / steps;
      path.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    }
    path.closePath();
  }

  function strokeToContour(path, stroke, minX, widthScale) {
    if (!stroke?.length) return;
    const points = stroke.map(point => ({
      x: ((Number(point.x) || 0) - minX) * FONT_X_SCALE + FONT_SIDE_BEARING,
      y: (BASELINE_Y - (Number(point.y) || BASELINE_Y)) * FONT_Y_SCALE,
      radius: Math.max(9, (Number(point.w) || 3.2) * 10 * widthScale)
    }));

    if (points.length === 1) {
      addRoundContour(path, points[0].x, points[0].y, points[0].radius);
      return;
    }

    const left = [];
    const right = [];
    for (let i = 0; i < points.length; i++) {
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const r = points[i].radius;
      left.push({ x: points[i].x + nx * r, y: points[i].y + ny * r });
      right.push({ x: points[i].x - nx * r, y: points[i].y - ny * r });
    }

    const polygon = [...left, ...right.reverse()];
    if (polygon.length >= 3) {
      path.moveTo(polygon[0].x, polygon[0].y);
      for (let i = 1; i < polygon.length; i++) path.lineTo(polygon[i].x, polygon[i].y);
      path.closePath();
    }

    addRoundContour(path, points[0].x, points[0].y, points[0].radius);
    addRoundContour(path, points[points.length - 1].x, points[points.length - 1].y, points[points.length - 1].radius);
  }

  function glyphPathFromData(data) {
    const path = new opentype.Path();
    if (!data?.strokes?.length) return path;
    const { minX } = bboxOfStrokes(data);
    const widthScale = Number(strokeWidthInput.value) || 1;
    for (const stroke of data.strokes) strokeToContour(path, stroke, minX, widthScale);
    return path;
  }

  function makeGlyph(char, data) {
    const bbox = bboxOfStrokes(data);
    const path = glyphPathFromData(data);
    const rawWidth = Math.max(50, (bbox.maxX - bbox.minX) * FONT_X_SCALE);
    const advanceWidth = clamp(Math.round(rawWidth + FONT_SIDE_BEARING * 2), 220, 1180);
    const unicode = char.codePointAt(0);
    return new opentype.Glyph({ name: `uni${unicode.toString(16).toUpperCase()}`, unicode, advanceWidth, path });
  }

  function makeNotdefGlyph() {
    const path = new opentype.Path();
    path.moveTo(90, -190); path.lineTo(90, 760); path.lineTo(620, 760); path.lineTo(620, -190); path.closePath();
    return new opentype.Glyph({ name: '.notdef', advanceWidth: 700, path });
  }

  function buildFont(includeDraft = true) {
    if (!window.opentype) throw new Error('Die Font-Bibliothek wurde noch nicht geladen. Lade die Seite neu.');

    const glyphs = [
      makeNotdefGlyph(),
      new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: 300, path: new opentype.Path() })
    ];
    const sourceGlyphs = clone(dataset.glyphs);

    if (includeDraft && currentChar && strokes.length) {
      sourceGlyphs[currentChar] ||= blankGlyph(currentChar);
      sourceGlyphs[currentChar].variants ||= [null, null, null];
      sourceGlyphs[currentChar].variants[currentVariant] = { strokes: clone(strokes), width: CANVAS_W, height: CANVAS_H, baseline: BASELINE_Y };
    }

    for (const ch of ALL_CHARS) {
      const data = (sourceGlyphs[ch]?.variants || []).find(v => v?.strokes?.length);
      if (data) glyphs.push(makeGlyph(ch, data));
    }

    const unique = [];
    const seen = new Set();
    for (const glyph of glyphs) {
      const key = glyph.unicode ?? glyph.name;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(glyph);
    }
    if (unique.length <= 2) return { font: null, glyphs: unique };

    return {
      font: new opentype.Font({
        familyName: cleanFontName(fontNameInput.value || 'MeineHandschrift'),
        styleName: 'Regular',
        unitsPerEm: 1000,
        ascender: 830,
        descender: -240,
        glyphs: unique
      }),
      glyphs: unique
    };
  }

  function cleanFontName(name) {
    return (name || 'MeineHandschrift').replace(/[^a-zA-Z0-9ÄÖÜäöüß _-]/g, '').trim().slice(0, 32) || 'MeineHandschrift';
  }

  function availableGlyphs(includeDraft = true) {
    const copy = clone(dataset.glyphs);
    if (includeDraft && currentChar && strokes.length) {
      copy[currentChar] ||= blankGlyph(currentChar);
      copy[currentChar].variants ||= [null, null, null];
      copy[currentChar].variants[currentVariant] = { strokes: clone(strokes), width: CANVAS_W, height: CANVAS_H, baseline: BASELINE_Y };
    }
    return copy;
  }

  function charIsAvailable(ch, glyphData) {
    return ch === ' ' || Boolean(glyphData[ch]?.variants?.some(v => v?.strokes?.length));
  }

  function getCharAdvance(font, ch, fontSize, ctx) {
    if (ch === ' ') return fontSize * 0.36;
    if (font) {
      try {
        const glyph = font.charToGlyph(ch);
        if (glyph && glyph.unicode === ch.codePointAt(0)) return Math.max(6, (glyph.advanceWidth / font.unitsPerEm) * fontSize);
      } catch {}
    }
    ctx.font = `${fontSize}px "Segoe UI", sans-serif`;
    return Math.max(8, ctx.measureText(ch).width);
  }

  function drawTextToContext(ctx, font, text, options) {
    const width = options.width;
    const fontSize = options.fontSize;
    const padding = options.padding;
    const lineHeight = options.lineHeight;
    const availableWidth = width - padding * 2;
    const glyphData = availableGlyphs(true);
    const nativeFont = `${fontSize}px "Segoe UI", sans-serif`;
    ctx.font = nativeFont;

    const missing = new Set();
    const lines = [];

    for (const paragraph of String(text || '').split('\n')) {
      if (!paragraph) { lines.push(''); continue; }
      let line = '';
      let lineWidth = 0;
      for (const ch of [...paragraph]) {
        const advance = getCharAdvance(font, ch, fontSize, ctx);
        if (line && lineWidth + advance > availableWidth) {
          lines.push(line); line = ''; lineWidth = 0;
        }
        line += ch; lineWidth += advance;
        if (!charIsAvailable(ch, glyphData) && ch !== '\t') missing.add(ch);
      }
      lines.push(line);
    }

    const height = Math.max(320, padding * 2 + lines.length * lineHeight);
    ctx.fillStyle = '#fffdf8';
    ctx.fillRect(0, 0, width, height);
    let y = padding + fontSize;

    for (const line of lines) {
      let x = padding;
      for (const ch of [...line]) {
        if (ch === '\t') { x += fontSize * 1.5; continue; }
        const advance = getCharAdvance(font, ch, fontSize, ctx);
        if (font && charIsAvailable(ch, glyphData)) {
          try { font.draw(ctx, ch, x, y, fontSize, { kerning: true }); }
          catch { ctx.font = nativeFont; ctx.fillStyle = '#2a2a2f'; ctx.fillText(ch, x, y); }
        } else {
          ctx.font = nativeFont;
          ctx.fillStyle = '#9b9389';
          ctx.fillText(ch, x, y);
        }
        x += advance;
      }
      y += lineHeight;
    }

    return { width, height, missing: [...missing] };
  }

  function refreshPreview() {
    let font = null;
    try {
      const built = buildFont(true);
      font = built.font;
      previewFont = font;
    } catch {
      previewFont = null;
    }

    const result = drawTextToContext(previewCtx, font, previewText.value, {
      width: 1400,
      fontSize: Math.min(92, Math.max(46, window.innerWidth < 700 ? 58 : 78)),
      padding: 58,
      lineHeight: 112
    });

    previewCanvas.width = result.width;
    previewCanvas.height = result.height;
    drawTextToContext(previewCtx, font, previewText.value, {
      width: result.width,
      fontSize: Math.min(92, Math.max(46, window.innerWidth < 700 ? 58 : 78)),
      padding: 58,
      lineHeight: 112
    });

    lastPreviewMissing = result.missing;
    missingCard.hidden = result.missing.length === 0;
    missingChars.textContent = result.missing.join(' · ');
    const captured = countCaptured();
    previewStatus.textContent = captured ? `${captured} Zeichen aktiv` : 'Noch keine Glyphen';
    previewStatus.className = `status-pill${captured ? ' ok' : ''}`;
    fontReadyInfo.textContent = font ? 'Ja' : 'Nein';
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function safeFilename(name) { return (name || 'MeineHandschrift').replace(/[^a-z0-9äöüß_-]+/gi, '_').slice(0, 48); }

  function downloadOtf() {
    saveCurrentDraft(true);
    try {
      const built = buildFont(true);
      if (!built.font) throw new Error('Schreibe zuerst mindestens ein Zeichen.');
      downloadBlob(new Blob([built.font.toArrayBuffer()], { type: 'font/otf' }), `${safeFilename(fontNameInput.value)}.otf`);
      flashButton($('downloadOtfBtn'), 'OTF erstellt ✓');
    } catch (error) { alert(error.message || 'OTF konnte nicht erstellt werden.'); }
  }

  function downloadPng() {
    saveCurrentDraft(true);
    const exportCanvas = document.createElement('canvas');
    const ctx = exportCanvas.getContext('2d');
    const result = drawTextToContext(ctx, previewFont || buildFont(true).font, previewText.value, { width: 1800, fontSize: 96, padding: 90, lineHeight: 138 });
    exportCanvas.width = result.width; exportCanvas.height = result.height;
    const font = (() => { try { return buildFont(true).font; } catch { return null; } })();
    drawTextToContext(exportCanvas.getContext('2d'), font, previewText.value, { width: result.width, fontSize: 96, padding: 90, lineHeight: 138 });
    exportCanvas.toBlob(blob => { if (blob) downloadBlob(blob, `${safeFilename(fontNameInput.value)}.png`); }, 'image/png');
  }

  function printPreview() {
    saveCurrentDraft(true);
    refreshPreview();
    const printWindow = window.open('', '_blank');
    if (!printWindow) { alert('Der Druckdialog konnte nicht geöffnet werden. Prüfe Pop-ups.'); return; }
    const image = previewCanvas.toDataURL('image/png');
    printWindow.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(cleanFontName(fontNameInput.value))}</title><style>@page{size:A4;margin:14mm}body{margin:0;font-family:system-ui;color:#1a1a1a}img{display:block;width:100%;height:auto}h1{font-size:16px;margin:0 0 10px}p{font-size:10px;color:#666;margin:0 0 16px}</style></head><body><h1>${escapeHtml(cleanFontName(fontNameInput.value))}</h1><p>Schreib · Handschrift-Vorschau</p><img src="${image}" alt="Vorschau"><script>window.onload=()=>window.print();<\/script></body></html>`);
    printWindow.document.close();
  }

  function escapeHtml(text) {
    return String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }

  function exportDataset() {
    saveCurrentDraft(true);
    downloadBlob(new Blob([JSON.stringify({ ...dataset, exportedAt: new Date().toISOString() }, null, 2)], { type:'application/json' }), 'schreib-dataset.json');
  }

  function importDataset(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        dataset = normalizeDataset(JSON.parse(String(reader.result || '')));
        fontNameInput.value = dataset.fontName;
        const stored = dataset.glyphs[currentChar]?.variants?.[currentVariant];
        strokes = stored?.strokes ? clone(stored.strokes) : [];
        persistDataset(); renderWritingCanvas(); renderCharGroups(); updateProgress(); refreshPreview();
      } catch { alert('Das Dataset konnte nicht importiert werden.'); }
    };
    reader.readAsText(file);
  }

  function resetAll() {
    if (!confirm('Wirklich alle gespeicherten Glyphen und Varianten löschen? Das kann nicht rückgängig gemacht werden.')) return;
    dataset = normalizeDataset(null); fontNameInput.value = 'MeineHandschrift'; currentChar = ALL_CHARS[0]; currentVariant = 0; strokes = []; undoStack = []; redoStack = [];
    localStorage.removeItem(STORAGE_KEY); localStorage.removeItem('schreib-handwriting-v1');
    updateVariantUI(); renderWritingCanvas(); renderCharGroups(); updateProgress(); refreshPreview(); setAutosave('Zurückgesetzt', 'warn');
  }

  function flashButton(button, text) {
    const old = button.textContent; button.textContent = text; setTimeout(() => { button.textContent = old; }, 900);
  }

  $('saveGlyphBtn').addEventListener('click', () => { saveCurrentDraft(true); refreshPreview(); renderCharGroups(); flashButton($('saveGlyphBtn'), 'Gespeichert ✓'); });
  $('nextGlyphBtn').addEventListener('click', () => { saveCurrentDraft(true); const i = ALL_CHARS.indexOf(currentChar); selectChar(ALL_CHARS[(i + 1) % ALL_CHARS.length]); });
  $('clearBtn').addEventListener('click', clearCurrent);
  $('undoBtn').addEventListener('click', undo);
  $('redoBtn').addEventListener('click', redo);
  $('downloadOtfBtn').addEventListener('click', downloadOtf);
  $('downloadPngBtn').addEventListener('click', downloadPng);
  $('printBtn').addEventListener('click', printPreview);
  $('exportDatasetBtn').addEventListener('click', exportDataset);
  $('importBtn').addEventListener('click', () => $('importInput').click());
  $('importInput').addEventListener('change', event => { const file = event.target.files?.[0]; if (file) importDataset(file); event.target.value = ''; });
  $('resetBtn').addEventListener('click', resetAll);
  previewText.addEventListener('input', refreshPreview);
  fontNameInput.addEventListener('input', () => { dataset.fontName = fontNameInput.value.trim() || 'MeineHandschrift'; persistDataset(); refreshPreview(); });
  strokeWidthInput.addEventListener('input', () => { strokeWidthValue.textContent = `${Number(strokeWidthInput.value).toFixed(2)}×`; renderWritingCanvas(); refreshPreview(); });

  window.addEventListener('keydown', event => {
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'textarea' || tag === 'input') return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
  });

  window.addEventListener('resize', refreshPreview);
  window.Schreib = { getDataset: () => clone(dataset), buildFont: () => buildFont(true).font, getMissing: () => [...lastPreviewMissing] };

  fontNameInput.value = dataset.fontName;
  strokeWidthValue.textContent = `${Number(strokeWidthInput.value).toFixed(2)}×`;
  updateVariantUI(); renderWritingCanvas(); renderCharGroups(); updateProgress(); refreshPreview();

  let checks = 0;
  const waitForFont = setInterval(() => {
    checks += 1;
    if (window.opentype || checks > 40) { clearInterval(waitForFont); refreshPreview(); }
  }, 250);
})();
