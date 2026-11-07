document.addEventListener('DOMContentLoaded', async () => {
  let currentUser = null;
  let subjectsData = null;
  let notesList = [];
  let activeSubjectId = 'ALL'; // 'ALL', 'PINNED', 'NONE', or subject UUID
  let activeMastery = 'ALL';   // 'ALL', 'NEW', 'LEARNING', 'REVIEW', 'MASTERED'
  let searchQuery = '';
  let selectedNoteId = null;
  let editingSubjectId = null;
  let editingNoteId = null;

  let isSummaryMode = false;
  let isCornellMode = false;
  let revealAllClozes = false;
  let isReadMode = false;
  let isReadTocOpen = window.innerWidth > 900;
  let isMobileReaderToolsOpen = false;
  let readTheme = localStorage.getItem('pk_read_theme') || 'sepia'; // 'light' | 'sepia' | 'dark'
  let readFontSize = localStorage.getItem('pk_read_size') || 'md';  // 'sm' | 'md' | 'lg' | 'xl'
  let notesSortMode = localStorage.getItem('pk_notes_sort') || 'custom_asc'; // 'custom_asc' | 'title_asc' | 'created_desc' | 'updated_desc'
  let customNoteOrder = [];
  try {
    customNoteOrder = JSON.parse(localStorage.getItem('pk_custom_note_order') || '[]');
    if (!Array.isArray(customNoteOrder)) customNoteOrder = [];
  } catch (e) {
    customNoteOrder = [];
  }
  let canvasMode = 'study'; // 'study' | 'write' | 'split'
  let activeInlineStudio = null; // null | 'chart' | 'whiteboard' | 'diagram' | 'math' | 'flashcard'
  let editingChartIdx = -1;
  let collapsedChapters = new Set();

  let codeSnippetsRegistry = [];
  let chartsRegistry = [];
  let highlightsRegistry = [];
  let pinnedSectionsRegistry = [];
  let headingsOutlineRegistry = [];
  let currentNoteClozeCount = 0;

  let flashcardDeck = [];
  let flashcardIndex = 0;
  let flashcardShowingAnswer = false;
  let flashcardDueOnly = false;
  let flashcardSourceNoteId = null;

  // Smart Viewer Selection state
  let currentSelectionText = '';
  let currentSelectionLineIndex = -1;
  let pendingMarkerAction = 'pin';

  // Pomodoro Timer state
  let pomoSeconds = 25 * 60;
  let pomoInterval = null;

  const MASTERY_META = {
    NEW:      { label: 'New',         icon: 'circle-dot',     badge: 'badge-mastery-NEW' },
    LEARNING: { label: 'In Progress', icon: 'flame',          badge: 'badge-mastery-LEARNING' },
    REVIEW:   { label: 'Review',      icon: 'refresh-cw',     badge: 'badge-mastery-REVIEW' },
    MASTERED: { label: 'Mastered',    icon: 'check-circle-2', badge: 'badge-mastery-MASTERED' }
  };

  // DOM Elements
  const metricStudies = document.getElementById('metric-studies');
  const metricNotes = document.getElementById('metric-notes');
  const metricMastered = document.getElementById('metric-mastered');
  const metricFlashcards = document.getElementById('metric-flashcards');

  const subjectsShelf = document.getElementById('subjects-shelf');
  const activeStudyActions = document.getElementById('active-study-actions');
  const workspaceEl = document.getElementById('study-workspace');
  const notesListHeading = document.getElementById('notes-list-heading');
  const notesListEl = document.getElementById('study-notes-list');
  const readerPaneEl = document.getElementById('study-reader-pane');
  const searchInput = document.getElementById('study-search-input');

  // Floating Selection Toolbar & Section Marker Modal
  const selectionToolbar = document.getElementById('selection-floating-toolbar');
  const sectionMarkerModal = document.getElementById('section-marker-modal');
  const sectionMarkerForm = document.getElementById('section-marker-form');
  const sectionMarkerTitleInput = document.getElementById('section-marker-title-input');
  const sectionMarkerPreview = document.getElementById('section-marker-preview');
  const sectionMarkerModalTitle = document.getElementById('section-marker-modal-title');

  // Subject Modal
  const subjectModal = document.getElementById('study-subject-modal');
  const subjectForm = document.getElementById('study-subject-form');
  const subjectModalTitle = document.getElementById('subject-modal-title');
  const subjectSubmitBtn = document.getElementById('subject-submit-btn');
  const subjectDeleteBtn = document.getElementById('subject-delete-btn');

  // Note Modal
  const noteModal = document.getElementById('study-note-modal');
  const noteForm = document.getElementById('study-note-form');
  const noteModalTitle = document.getElementById('note-modal-title');
  const noteSubmitBtn = document.getElementById('note-submit-btn');
  const noteSubjectSelect = document.getElementById('note-subject-select');
  const takeawaysContainer = document.getElementById('note-takeaways-container');
  const resourcesContainer = document.getElementById('note-resources-container');

  // Flashcard Modal
  const flashcardModal = document.getElementById('flashcard-modal');

  // ======================================================
  // AUTH CHECK
  // ======================================================
  try {
    const authRes = await apiRequest('/api/auth/me');
    if (authRes && authRes.user) {
      currentUser = authRes.user;
    }
  } catch (e) {
    return;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeJsAttr(str) {
    if (!str) return '';
    return String(str)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '&quot;');
  }

  window.toggleNotesSidebar = function() {
    if (workspaceEl) {
      workspaceEl.classList.toggle('sidebar-collapsed');
    }
  };

  // ======================================================
  // POMODORO FOCUS TIMER (25:00)
  // ======================================================
  function updatePomodoroUI() {
    const display = document.getElementById('pomodoro-time-display');
    const btn = document.getElementById('pomodoro-timer-btn');
    if (!display) return;
    const m = String(Math.floor(pomoSeconds / 60)).padStart(2, '0');
    const s = String(pomoSeconds % 60).padStart(2, '0');
    display.textContent = `${m}:${s}`;
    if (btn) {
      if (pomoInterval) btn.classList.add('running');
      else btn.classList.remove('running');
    }
  }

  window.togglePomodoroTimer = function() {
    if (pomoInterval) {
      clearInterval(pomoInterval);
      pomoInterval = null;
      showToast('Study timer paused.', 'info');
    } else {
      showToast('25-minute focus session started!', 'success');
      pomoInterval = setInterval(() => {
        if (pomoSeconds > 0) {
          pomoSeconds--;
          updatePomodoroUI();
        } else {
          clearInterval(pomoInterval);
          pomoInterval = null;
          pomoSeconds = 25 * 60;
          updatePomodoroUI();
          showToast('🎉 Focus session complete! Take a 5-minute break.', 'success');
        }
      }, 1000);
    }
    updatePomodoroUI();
  };

  window.resetPomodoroTimer = function() {
    if (pomoInterval) {
      clearInterval(pomoInterval);
      pomoInterval = null;
    }
    pomoSeconds = 25 * 60;
    updatePomodoroUI();
    showToast('Focus timer reset to 25:00.', 'info');
  };

  // ======================================================
  // INTERACTIVE SVG DATA CHART ENGINE (BAR, LINE, AREA, PIE, DOUGHNUT, HBAR)
  // ======================================================
  const CHART_PALETTE = ['#4f46e5', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9', '#8b5cf6', '#ef4444', '#14b8a6'];

  function parseChartConfig(rawText) {
    const trimmed = (rawText || '').trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        return {
          type: (parsed.type || 'bar').toLowerCase(),
          title: parsed.title || 'Data Chart',
          unit: parsed.unit || '',
          items: Array.isArray(parsed.items) ? parsed.items : []
        };
      } catch (e) {}
    }

    let type = 'bar';
    let title = 'Study Chart';
    let unit = '';
    const items = [];

    trimmed.split('\n').forEach(line => {
      const l = line.trim();
      if (!l) return;
      if (/^type\s*:/i.test(l)) {
        type = l.replace(/^type\s*:\s*/i, '').trim().toLowerCase();
      } else if (/^title\s*:/i.test(l)) {
        title = l.replace(/^title\s*:\s*/i, '').trim();
      } else if (/^unit\s*:/i.test(l)) {
        unit = l.replace(/^unit\s*:\s*/i, '').trim();
      } else if (/^data\s*:/i.test(l)) {
        const pairs = l.replace(/^data\s*:\s*/i, '').split(',');
        pairs.forEach((p, idx) => {
          const [k, v] = p.split(':').map(s => s && s.trim());
          if (k && v !== undefined && !isNaN(Number(v))) {
            items.push({ label: k, value: Number(v), color: CHART_PALETTE[items.length % CHART_PALETTE.length] });
          }
        });
      } else if (l.includes(':')) {
        const parts = l.split(',');
        if (parts.length > 1 && parts.every(p => p.includes(':'))) {
          parts.forEach(p => {
            const [k, v] = p.split(':').map(s => s && s.trim());
            if (k && v !== undefined && !isNaN(Number(v))) {
              items.push({ label: k, value: Number(v), color: CHART_PALETTE[items.length % CHART_PALETTE.length] });
            }
          });
        } else {
          const idx = l.indexOf(':');
          const k = l.slice(0, idx).trim();
          const v = parseFloat(l.slice(idx + 1).trim());
          if (k && !isNaN(v)) {
            items.push({ label: k, value: v, color: CHART_PALETTE[items.length % CHART_PALETTE.length] });
          }
        }
      }
    });

    if (items.length === 0) {
      items.push(
        { label: 'Q1', value: 45, color: CHART_PALETTE[0] },
        { label: 'Q2', value: 82, color: CHART_PALETTE[1] },
        { label: 'Q3', value: 64, color: CHART_PALETTE[2] },
        { label: 'Q4', value: 110, color: CHART_PALETTE[3] }
      );
    }

    return { type, title, unit, items };
  }

  function renderSvgChartHtml(rawCode, chartIdx, noteId = '') {
    const cfg = parseChartConfig(rawCode);
    const items = cfg.items;
    const maxVal = Math.max(...items.map(i => Math.abs(i.value)), 1);
    const unitSuffix = cfg.unit ? ` ${escapeHtml(cfg.unit)}` : '';
    let svgHtml = '';

    if (cfg.type === 'pie' || cfg.type === 'doughnut') {
      const total = items.reduce((acc, it) => acc + Math.max(0, it.value), 0) || 1;
      let cumulativeAngle = -Math.PI / 2;
      const cx = 130;
      const cy = 115;
      const r = 82;
      const innerR = cfg.type === 'doughnut' ? 44 : 0;

      const slices = items.map((it, i) => {
        const val = Math.max(0, it.value);
        const sliceAngle = (val / total) * Math.PI * 2;
        const startX = cx + r * Math.cos(cumulativeAngle);
        const startY = cy + r * Math.sin(cumulativeAngle);
        const endAngle = cumulativeAngle + sliceAngle;
        const endX = cx + r * Math.cos(endAngle);
        const endY = cy + r * Math.sin(endAngle);
        const largeArc = sliceAngle > Math.PI ? 1 : 0;
        const color = it.color || CHART_PALETTE[i % CHART_PALETTE.length];

        let pathD;
        if (items.length === 1 || sliceAngle >= Math.PI * 1.999) {
          pathD = `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
        } else if (innerR > 0) {
          const iStartX = cx + innerR * Math.cos(endAngle);
          const iStartY = cy + innerR * Math.sin(endAngle);
          const iEndX = cx + innerR * Math.cos(cumulativeAngle);
          const iEndY = cy + innerR * Math.sin(cumulativeAngle);
          pathD = `M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY} L ${iStartX} ${iStartY} A ${innerR} ${innerR} 0 ${largeArc} 0 ${iEndX} ${iEndY} Z`;
        } else {
          pathD = `M ${cx} ${cy} L ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY} Z`;
        }

        cumulativeAngle = endAngle;
        const pct = Math.round((val / total) * 100);
        return { pathD, color, label: it.label, value: it.value, pct };
      });

      svgHtml = `
        <svg viewBox="0 0 480 230" style="width:100%; max-width:480px; height:auto;">
          ${slices.map(s => `<path d="${s.pathD}" fill="${s.color}" stroke="#ffffff" stroke-width="2"><title>${escapeHtml(s.label)}: ${s.value}${unitSuffix} (${s.pct}%)</title></path>`).join('')}
          ${cfg.type === 'doughnut' ? `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="13" font-weight="800" fill="#1e1b4b">Total: ${total}</text>` : ''}
          ${slices.map((s, idx) => `
            <g transform="translate(255, ${32 + idx * 26})">
              <rect width="12" height="12" rx="3" fill="${s.color}"></rect>
              <text x="20" y="10" font-size="12" font-weight="700" fill="#1e1b4b">${escapeHtml(s.label)}</text>
              <text x="195" y="10" font-size="12" font-weight="700" fill="#6b7280" text-anchor="end">${s.value}${unitSuffix} (${s.pct}%)</text>
            </g>
          `).join('')}
        </svg>
      `;
    } else if (cfg.type === 'line' || cfg.type === 'area') {
      const w = 520;
      const h = 220;
      const padL = 48;
      const padR = 24;
      const padT = 26;
      const padB = 38;
      const plotW = w - padL - padR;
      const plotH = h - padT - padB;

      const pts = items.map((it, i) => {
        const x = padL + (items.length === 1 ? plotW / 2 : (i / (items.length - 1)) * plotW);
        const y = padT + plotH - (Math.max(0, it.value) / maxVal) * plotH;
        return { x, y, label: it.label, value: it.value };
      });

      const polyPoints = pts.map(p => `${p.x},${p.y}`).join(' ');
      const areaPath = pts.length > 0
        ? `M ${pts[0].x},${padT + plotH} L ${ pts.map(p => `${p.x},${p.y}`).join(' L ') } L ${pts[pts.length - 1].x},${padT + plotH} Z`
        : '';

      svgHtml = `
        <svg viewBox="0 0 ${w} ${h}" style="width:100%; max-width:540px; height:auto;">
          ${[0, 0.25, 0.5, 0.75, 1].map(step => {
            const y = padT + plotH * (1 - step);
            const val = Math.round(maxVal * step);
            return `
              <line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="#e5e7eb" stroke-dasharray="3,3"/>
              <text x="${padL - 8}" y="${y + 4}" font-size="10" fill="#6b7280" text-anchor="end">${val}</text>
            `;
          }).join('')}
          ${cfg.type === 'area' ? `<path d="${areaPath}" fill="rgba(79, 70, 229, 0.16)"/>` : ''}
          <polyline fill="none" stroke="#4f46e5" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${polyPoints}"/>
          ${pts.map(p => `
            <circle cx="${p.x}" cy="${p.y}" r="5" fill="#ffffff" stroke="#4f46e5" stroke-width="3"/>
            <text x="${p.x}" y="${p.y - 10}" font-size="10.5" font-weight="800" fill="#312e81" text-anchor="middle">${p.value}${unitSuffix}</text>
            <text x="${p.x}" y="${h - 12}" font-size="11" font-weight="600" fill="#374151" text-anchor="middle">${escapeHtml(p.label)}</text>
          `).join('')}
        </svg>
      `;
    } else if (cfg.type === 'hbar') {
      const rowH = 32;
      const w = 520;
      const h = Math.max(140, items.length * rowH + 30);
      const padL = 110;
      const maxBarW = w - padL - 70;

      svgHtml = `
        <svg viewBox="0 0 ${w} ${h}" style="width:100%; max-width:540px; height:auto;">
          ${items.map((it, i) => {
            const y = 16 + i * rowH;
            const bw = Math.max(6, (Math.max(0, it.value) / maxVal) * maxBarW);
            const color = it.color || CHART_PALETTE[i % CHART_PALETTE.length];
            return `
              <text x="${padL - 10}" y="${y + 15}" font-size="11.5" font-weight="700" fill="#374151" text-anchor="end">${escapeHtml(it.label)}</text>
              <rect x="${padL}" y="${y + 2}" width="${bw}" height="20" rx="5" fill="${color}"/>
              <text x="${padL + bw + 8}" y="${y + 16}" font-size="11" font-weight="800" fill="#1e1b4b">${it.value}${unitSuffix}</text>
            `;
          }).join('')}
        </svg>
      `;
    } else {
      // Default Vertical Bar Chart
      const w = 520;
      const h = 225;
      const padL = 46;
      const padR = 20;
      const padT = 26;
      const padB = 38;
      const plotW = w - padL - padR;
      const plotH = h - padT - padB;
      const slotW = plotW / Math.max(items.length, 1);
      const barW = Math.min(46, Math.max(16, slotW * 0.58));

      svgHtml = `
        <svg viewBox="0 0 ${w} ${h}" style="width:100%; max-width:540px; height:auto;">
          ${[0, 0.25, 0.5, 0.75, 1].map(step => {
            const y = padT + plotH * (1 - step);
            const val = Math.round(maxVal * step);
            return `
              <line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="#e5e7eb" stroke-dasharray="3,3"/>
              <text x="${padL - 8}" y="${y + 4}" font-size="10" fill="#6b7280" text-anchor="end">${val}</text>
            `;
          }).join('')}
          ${items.map((it, i) => {
            const bh = Math.max(4, (Math.max(0, it.value) / maxVal) * plotH);
            const x = padL + i * slotW + (slotW - barW) / 2;
            const y = padT + plotH - bh;
            const color = it.color || CHART_PALETTE[i % CHART_PALETTE.length];
            return `
              <rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="5" fill="${color}"/>
              <text x="${x + barW / 2}" y="${y - 6}" font-size="10.5" font-weight="800" fill="#1e1b4b" text-anchor="middle">${it.value}${unitSuffix}</text>
              <text x="${x + barW / 2}" y="${h - 12}" font-size="11" font-weight="600" fill="#374151" text-anchor="middle">${escapeHtml(it.label)}</text>
            `;
          }).join('')}
        </svg>
      `;
    }

    return `
      <div class="study-chart-card">
        <div class="study-chart-header">
          <div class="study-chart-title">
            <i data-lucide="bar-chart-3" class="icon-sm" style="color:var(--primary);"></i>
            <span>${escapeHtml(cfg.title)}</span>
            <span class="badge badge-USER" style="font-size:0.6rem; text-transform:uppercase;">${escapeHtml(cfg.type)}</span>
          </div>
          ${noteId ? `
            <div style="display:flex; gap:0.3rem;">
              <button type="button" class="btn-tiny" onclick="window.editExistingChart(${chartIdx})" title="Edit Chart Data or Type">
                <i data-lucide="sliders-horizontal" class="icon-xs"></i> Edit Chart
              </button>
              <button type="button" class="btn-tiny" style="color:var(--destructive);" onclick="window.deleteExistingChart('${noteId}', ${chartIdx})" title="Remove Chart">
                <i data-lucide="trash-2" class="icon-xs"></i>
              </button>
            </div>
          ` : ''}
        </div>
        <div class="study-chart-svg-wrap">
          ${svgHtml}
        </div>
      </div>
    `;
  }

  // ======================================================
  // RICH MARKDOWN PARSER WITH HIGHLIGHTS, PINS, CLOZES, CHARTS, MATH, MERMAID, IMAGES & WIKI LINKS
  // ======================================================
  function formatMathFormula(expr) {
    return escapeHtml(expr)
      .replace(/\\alpha/g, 'α').replace(/\\beta/g, 'β').replace(/\\gamma/g, 'γ')
      .replace(/\\delta/g, 'δ').replace(/\\Delta/g, 'Δ').replace(/\\pi/g, 'π')
      .replace(/\\sigma/g, 'σ').replace(/\\Sigma/g, '∑').replace(/\\sum/g, '∑')
      .replace(/\\int/g, '∫').replace(/\\sqrt/g, '√').replace(/\\infty/g, '∞')
      .replace(/\\approx/g, '≈').replace(/\\neq/g, '≠').replace(/\\leq/g, '≤')
      .replace(/\\geq/g, '≥').replace(/\\times/g, '×').replace(/\\div/g, '÷')
      .replace(/\\pm/g, '±').replace(/\\rightarrow/g, '→').replace(/\\Rightarrow/g, '⇒')
      .replace(/\^2/g, '²').replace(/\^3/g, '³').replace(/\^n/g, 'ⁿ');
  }

  function renderMarkdown(rawMd, noteId = '') {
    highlightsRegistry = [];
    pinnedSectionsRegistry = [];
    headingsOutlineRegistry = [];
    chartsRegistry = [];
    currentNoteClozeCount = 0;

    if (!rawMd || !rawMd.trim()) {
      return `<p style="color:var(--muted-foreground); font-style:italic;">Click <strong>➕ Add Element</strong> above, switch to <strong>✍️ Write / ⚡ Split Studio</strong>, or type in the bottom bar to start building your study note directly.</p>`;
    }

    codeSnippetsRegistry = [];
    let text = String(rawMd).replace(/\r\n/g, '\n');

    const codePlaceholders = [];

    // 1. Block Math $$ ... $$
    text = text.replace(/\$\$\n?([\s\S]*?)\n?\$\$/g, (_, formula) => {
      const html = `<div class="math-block">${formatMathFormula(formula.trim())}</div>`;
      const token = `@@CODEBLOCK_${codePlaceholders.length}@@`;
      codePlaceholders.push(html);
      return token;
    });

    // 2. Charts, Mermaid Diagrams & Code Blocks ```lang ... ```
    text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (fullBlock, lang, code) => {
      const trimmedCode = code.replace(/\n$/, '');
      const langLower = (lang || '').toLowerCase();

      if (langLower === 'chart') {
        const cIdx = chartsRegistry.length;
        chartsRegistry.push({ rawBlock: fullBlock, rawCode: trimmedCode });
        const html = renderSvgChartHtml(trimmedCode, cIdx, noteId);
        const token = `@@CODEBLOCK_${codePlaceholders.length}@@`;
        codePlaceholders.push(html);
        return token;
      }

      if (langLower === 'mermaid') {
        const html = `<div class="mermaid-diagram-box"><pre class="mermaid">${escapeHtml(trimmedCode)}</pre></div>`;
        const token = `@@CODEBLOCK_${codePlaceholders.length}@@`;
        codePlaceholders.push(html);
        return token;
      }

      const idx = codeSnippetsRegistry.length;
      codeSnippetsRegistry.push(trimmedCode);
      const langLabel = (lang || 'code').toUpperCase();
      const html = `
        <div class="md-code-block">
          <div class="md-code-header">
            <span>${escapeHtml(langLabel)}</span>
            <button type="button" class="btn-copy" style="height:1.35rem; padding:0 0.45rem; font-size:0.65rem; background:#2e2b52; color:#e0e7ff; border-color:#4338ca;" onclick="window.copyCodeSnippet(${idx})">
              <i data-lucide="copy" class="icon-xs"></i> Copy
            </button>
          </div>
          <pre class="md-code-pre"><code>${escapeHtml(trimmedCode)}</code></pre>
        </div>
      `;
      const token = `@@CODEBLOCK_${codePlaceholders.length}@@`;
      codePlaceholders.push(html);
      return token;
    });

    function formatInline(line) {
      // Extract Markdown images ![alt](src) before escaping
      const imgTokens = [];
      let working = String(line).replace(/!\[([^\]]*)\]\((data:image\/[^)]+|https?:\/\/[^\s)]+|\/[^\s)]+)\)/g, (_, alt, src) => {
        const tok = `@@IMG_${imgTokens.length}@@`;
        imgTokens.push(`<img src="${escapeHtml(src)}" alt="${escapeHtml(alt || 'Study Image')}" class="md-study-img" onclick="window.openImageLightbox(this.src)" title="Click to enlarge">`);
        return tok;
      });

      let s = escapeHtml(working);

      // Multi-color highlights: ==yellow:text==, ==green:text==, ==purple:text==, ==pink:text==, or ==text==
      s = s.replace(/==(?:(yellow|green|purple|pink):)?(.+?)==/g, (fullMatch, color, innerText) => {
        const hlColor = color || 'yellow';
        const hlIdx = highlightsRegistry.length;
        const rawMatch = color ? `==${color}:${innerText}==` : `==${innerText}==`;
        highlightsRegistry.push({ rawMatch, innerText, color: hlColor });
        const clickHandler = noteId ? `onclick="event.stopPropagation(); window.openHighlightPopover(event, '${noteId}', ${hlIdx})"` : '';
        return `<mark class="study-hl study-hl-${hlColor}" ${clickHandler} title="Click to change color, pin, or remove">${innerText}</mark>`;
      });

      // Cloze Deletion (Fill-in-the-blank): {{hidden term}}
      s = s.replace(/\{\{([^}]+)\}\}/g, (_, clozeText) => {
        currentNoteClozeCount++;
        return `<span class="cloze-pill" onclick="event.stopPropagation(); this.classList.toggle('revealed')" title="Click to reveal/hide">${clozeText}</span>`;
      });

      // Vault Secret Link: [[vault:Secret Name]]
      s = s.replace(/\[\[vault:([^\]]+)\]\]/gi, (_, secretName) => {
        return `<a href="/dashboard" class="vault-secret-link" onclick="event.stopPropagation();" title="Open Secret Vault: ${secretName}">🔐 Vault: ${secretName.trim()}</a>`;
      });

      // Internal Wiki Note Link: [[Target Note Title]]
      s = s.replace(/\[\[([^\]]+)\]\]/g, (_, targetTitle) => {
        return `<a href="javascript:void(0)" class="wiki-note-link" onclick="event.stopPropagation(); window.openNoteByWikiTitle('${escapeJsAttr(targetTitle)}')" title="Jump to note: ${targetTitle}">🔗 ${targetTitle}</a>`;
      });

      // Inline Math: $formula$
      s = s.replace(/\$([^\$\s][^$]*?)\$/g, (_, mathExpr) => {
        return `<span class="math-inline">${formatMathFormula(mathExpr)}</span>`;
      });

      // Inline code `code`
      s = s.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
      // Bold **text**
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      // Italic *text*
      s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      // Links [label](https://...)
      s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--primary); font-weight:600; text-decoration:underline;">$1</a>');

      // Restore images
      imgTokens.forEach((imgHtml, idx) => {
        s = s.replace(`@@IMG_${idx}@@`, imgHtml);
      });

      return s;
    }

    const lines = text.split('\n');
    const out = [];
    let inUl = false;
    let inOl = false;
    let inTable = false;
    let tableRows = [];
    let checklistIdx = 0;

    function closeLists() {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }
    }

    function flushTable() {
      if (!inTable || tableRows.length === 0) return;
      inTable = false;
      const headerCells = tableRows[0];
      const bodyRows = tableRows.slice(1).filter(r => !r.every(c => /^[-:\s]+$/.test(c)));
      let tbl = '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
      headerCells.forEach(c => { tbl += `<th>${formatInline(c.trim())}</th>`; });
      tbl += '</tr></thead><tbody>';
      bodyRows.forEach(row => {
        tbl += '<tr>';
        row.forEach(c => { tbl += `<td>${formatInline(c.trim())}</td>`; });
        tbl += '</tr>';
      });
      tbl += '</tbody></table></div>';
      out.push(tbl);
      tableRows = [];
    }

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      const codeMatch = trimmed.match(/^@@CODEBLOCK_(\d+)@@$/);
      if (codeMatch) {
        closeLists();
        flushTable();
        out.push(codePlaceholders[Number(codeMatch[1])]);
        continue;
      }

      if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2) {
        closeLists();
        inTable = true;
        const cells = trimmed.slice(1, -1).split('|');
        tableRows.push(cells);
        continue;
      } else if (inTable) {
        flushTable();
      }

      if (!trimmed) {
        closeLists();
        continue;
      }

      if (/^(---|\*\*\*|___)$/.test(trimmed)) {
        closeLists();
        out.push('<hr style="border:none; border-top:1.5px solid var(--border); margin:1rem 0;">');
        continue;
      }

      // Pinned Section Block: > [!PIN: Custom Title] Excerpt text
      const pinMatch = trimmed.match(/^>\s*\[!PIN:\s*([^\]]+)\]\s*(.*)$/i);
      if (pinMatch) {
        closeLists();
        const pinTitle = pinMatch[1].trim();
        const pinBodyRaw = pinMatch[2] || '';
        const pinIdx = pinnedSectionsRegistry.length;
        const domId = `study-pin-sec-${pinIdx}`;
        pinnedSectionsRegistry.push({ id: domId, title: pinTitle, body: pinBodyRaw, lineIndex: i });

        out.push(`
          <div id="${domId}" class="pinned-section-block" data-line-index="${i}">
            <div class="pinned-section-header">
              <span class="pinned-section-title">
                <i data-lucide="pin" class="icon-xs"></i>
                ${escapeHtml(pinTitle)}
              </span>
              ${noteId ? `
                <button type="button" class="viewer-block-btn" onclick="window.unpinViewerSection('${noteId}', ${i})" title="Unpin section (keeps text)">
                  <i data-lucide="x" class="icon-xs"></i> Unpin
                </button>
              ` : ''}
            </div>
            <div class="pinned-section-body">${formatInline(pinBodyRaw)}</div>
          </div>
        `);
        continue;
      }

      // Headings with Outline Anchors
      if (trimmed.startsWith('### ') || trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
        closeLists();
        const level = trimmed.startsWith('### ') ? 3 : trimmed.startsWith('## ') ? 2 : 1;
        const rawHeading = trimmed.replace(/^#{1,3}\s+/, '');
        const cleanHeading = rawHeading.replace(/==(?:yellow|green|purple|pink)?:?(.+?)==/g, '$1').replace(/[*`]/g, '');
        const domId = `study-heading-${headingsOutlineRegistry.length}`;
        headingsOutlineRegistry.push({ id: domId, title: cleanHeading, level });
        out.push(`<h${level} id="${domId}" data-line-index="${i}">${formatInline(rawHeading)}</h${level}>`);
        continue;
      }

      if (trimmed.startsWith('>')) {
        closeLists();
        const quoteText = trimmed.replace(/^>\s?/, '');
        out.push(`<div class="md-callout" data-line-index="${i}">${formatInline(quoteText)}</div>`);
        continue;
      }

      const checkMatch = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
      if (checkMatch) {
        if (inOl) { out.push('</ol>'); inOl = false; }
        if (!inUl) { out.push('<ul class="has-highlight">'); inUl = true; }
        const checked = checkMatch[1].toLowerCase() === 'x';
        const itemText = checkMatch[2];
        const currentCheckIdx = checklistIdx++;
        const toggleAttr = noteId
          ? `onchange="window.toggleNoteChecklistItem('${noteId}', ${currentCheckIdx}, this.checked)"`
          : '';
        out.push(`
          <li class="md-checklist-item" data-line-index="${i}">
            <input type="checkbox" ${checked ? 'checked' : ''} ${toggleAttr}>
            <span style="${checked ? 'text-decoration:line-through; color:var(--muted-foreground);' : ''}">${formatInline(itemText)}</span>
          </li>
        `);
        continue;
      }

      const ulMatch = trimmed.match(/^[-*]\s+(.*)$/);
      if (ulMatch) {
        const lineHasHl = /==.+?==/.test(trimmed);
        if (inOl) { out.push('</ol>'); inOl = false; }
        if (!inUl) { out.push(`<ul class="${lineHasHl ? 'has-highlight' : ''}">`); inUl = true; }
        out.push(`<li data-line-index="${i}">${formatInline(ulMatch[1])}</li>`);
        continue;
      }

      const olMatch = trimmed.match(/^\d+\.\s+(.*)$/);
      if (olMatch) {
        const lineHasHl = /==.+?==/.test(trimmed);
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (!inOl) { out.push(`<ol class="${lineHasHl ? 'has-highlight' : ''}">`); inOl = true; }
        out.push(`<li data-line-index="${i}">${formatInline(olMatch[1])}</li>`);
        continue;
      }

      closeLists();
      const hasHl = /==.+?==/.test(trimmed);
      const hoverToolsHtml = noteId ? `
        <span class="viewer-block-tools" contenteditable="false">
          <button type="button" class="viewer-block-btn" onclick="window.quickActionOnLine('${noteId}', ${i}, 'pin')" title="Pin this paragraph with a custom title">
            <i data-lucide="pin" class="icon-xs" style="color:#f59e0b;"></i> Pin
          </button>
          <button type="button" class="viewer-block-btn" onclick="window.quickActionOnLine('${noteId}', ${i}, 'heading')" title="Add a Section Title above this paragraph">
            <i data-lucide="heading-2" class="icon-xs" style="color:var(--primary);"></i> Title
          </button>
          <button type="button" class="viewer-block-btn" onclick="window.quickHighlightLine('${noteId}', ${i})" title="Highlight this paragraph">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#facc15;"></span> Highlight
          </button>
          <button type="button" class="viewer-block-btn" onclick="window.startInlineBlockEdit('${noteId}', ${i}, this)" title="Edit this paragraph inline (or double-click paragraph)">
            <i data-lucide="pencil" class="icon-xs"></i>
          </button>
        </span>
      ` : '';

      const dblClickAttr = noteId ? `ondblclick="window.startInlineBlockEdit('${noteId}', ${i}, this)" title="Double-click to edit paragraph inline"` : '';

      out.push(`
        <div class="viewer-block ${hasHl ? 'has-highlight' : ''}" data-line-index="${i}" ${dblClickAttr}>
          ${hoverToolsHtml}
          <p style="margin-bottom:0.65rem;">${formatInline(trimmed)}</p>
        </div>
      `);
    }

    closeLists();
    flushTable();
    return out.join('\n');
  }

  window.copyCodeSnippet = function(idx) {
    const code = codeSnippetsRegistry[idx];
    if (code !== undefined) {
      copyToClipboard(code, 'Code snippet');
    }
  };

  window.scrollToReaderSection = function(domId) {
    const el = document.getElementById(domId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('pulse-target');
    setTimeout(() => el.classList.remove('pulse-target'), 1800);
  };

  // Jump to another note via [[Wiki Title]]
  window.openNoteByWikiTitle = function(targetTitle) {
    if (!targetTitle) return;
    const lower = targetTitle.trim().toLowerCase();
    const match = notesList.find(n => n.title.toLowerCase() === lower || n.title.toLowerCase().includes(lower));
    if (match) {
      window.selectStudyNote(match.id, true);
      showToast(`Opened linked note: ${match.title}`, 'info');
    } else {
      if (confirm(`Note "${targetTitle}" doesn't exist yet. Create it now?`)) {
        window.openStudyNoteModal();
        setTimeout(() => {
          const titleEl = document.getElementById('note-title-input');
          if (titleEl) titleEl.value = targetTitle;
        }, 60);
      }
    }
  };

  // Toggle Summary / Exam Cram Mode
  window.toggleSummaryMode = function() {
    isSummaryMode = !isSummaryMode;
    const note = notesList.find(n => n.id === selectedNoteId);
    if (note) renderReaderPane(note);
  };

  // Toggle Cornell Note-Taking Split Layout
  window.toggleCornellMode = function() {
    isCornellMode = !isCornellMode;
    const note = notesList.find(n => n.id === selectedNoteId);
    if (note) renderReaderPane(note);
  };

  window.saveCornellSummary = async function(noteId) {
    const input = document.getElementById('cornell-summary-input');
    const note = notesList.find(n => n.id === noteId);
    if (!input || !note) return;
    try {
      const res = await apiRequest(`/api/study/notes/${noteId}`, {
        method: 'PUT',
        body: { summary: input.value.trim() }
      });
      note.summary = res.note.summary;
      showToast('Cornell Summary saved!', 'success');
      renderNotesList();
    } catch (err) {}
  };

  window.openImageLightbox = function(src) {
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(`<body style="margin:0;background:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img src="${src}" style="max-width:96vw;max-height:96vh;border-radius:8px;"></body>`);
    }
  };

  function runMermaidDiagrams() {
    if (window.mermaid && document.querySelectorAll('.mermaid').length > 0) {
      try {
        window.mermaid.initialize({ startOnLoad: false, theme: 'default' });
        window.mermaid.run({ nodes: document.querySelectorAll('.mermaid') });
      } catch (e) {}
    }
  }

  // Toggle Reveal All Clozes
  window.toggleRevealAllClozes = function() {
    revealAllClozes = !revealAllClozes;
    const article = readerPaneEl?.querySelector('.markdown-content');
    if (article) {
      article.classList.toggle('reveal-all-clozes', revealAllClozes);
    }
    const btn = document.getElementById('reveal-clozes-btn');
    if (btn) {
      btn.innerHTML = `<i data-lucide="${revealAllClozes ? 'eye-off' : 'eye'}" class="icon-xs"></i><span>${revealAllClozes ? 'Hide Clozes' : 'Reveal Clozes'}</span>`;
      if (window.lucide) lucide.createIcons();
    }
  };

  // Double-click Inline Paragraph Edit in Viewer
  window.startInlineBlockEdit = function(noteId, lineIndex, triggerEl) {
    const note = notesList.find(n => n.id === noteId);
    if (!note) return;
    const blockEl = triggerEl.closest('.viewer-block');
    if (!blockEl || blockEl.querySelector('.inline-block-editor')) return;

    const lines = (note.content || '').split('\n');
    const originalLine = lines[lineIndex] || '';

    blockEl.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:0.35rem; margin-bottom:0.65rem;">
        <textarea class="inline-block-editor">${escapeHtml(originalLine)}</textarea>
        <div style="display:flex; justify-content:flex-end; gap:0.35rem;">
          <button type="button" class="btn-tiny" onclick="window.cancelInlineBlockEdit('${noteId}')">Cancel</button>
          <button type="button" class="btn btn-primary btn-compact" style="height:1.5rem !important;" onclick="window.saveInlineBlockEdit('${noteId}', ${lineIndex}, this)">Save (Ctrl+Enter)</button>
        </div>
      </div>
    `;

    const textarea = blockEl.querySelector('.inline-block-editor');
    if (textarea) {
      textarea.focus();
      textarea.selectionStart = textarea.value.length;
      textarea.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          window.saveInlineBlockEdit(noteId, lineIndex, textarea);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          window.cancelInlineBlockEdit(noteId);
        }
      });
    }
  };

  window.saveInlineBlockEdit = async function(noteId, lineIndex, el) {
    const note = notesList.find(n => n.id === noteId);
    if (!note) return;
    const container = el.closest('.viewer-block');
    const textarea = container?.querySelector('.inline-block-editor');
    if (!textarea) return;

    const lines = (note.content || '').split('\n');
    lines[lineIndex] = textarea.value;
    await saveNoteContentDirectly(noteId, lines.join('\n'), 'Paragraph updated!');
  };

  window.cancelInlineBlockEdit = function(noteId) {
    const note = notesList.find(n => n.id === noteId);
    if (note) renderReaderPane(note);
  };

  // Bottom Quick-Append Bar in Reader
  window.quickAppendToNote = async function(noteId) {
    const input = document.getElementById('reader-quick-append-input');
    const note = notesList.find(n => n.id === noteId);
    if (!input || !note || !input.value.trim()) return;

    const textToAdd = input.value.trim();
    const updatedContent = note.content ? `${note.content}\n\n${textToAdd}` : textToAdd;
    input.value = '';
    await saveNoteContentDirectly(noteId, updatedContent, 'Added to note!');
  };

  // ======================================================
  // SMART SELECTION TOOLBAR & DIRECT VIEWER ANNOTATIONS
  // ======================================================
  function hideSelectionToolbar() {
    if (selectionToolbar) {
      selectionToolbar.style.display = 'none';
    }
  }

  document.addEventListener('mouseup', (e) => {
    if (selectionToolbar && selectionToolbar.contains(e.target)) return;
    if (sectionMarkerModal && sectionMarkerModal.classList.contains('open')) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !readerPaneEl) {
      hideSelectionToolbar();
      return;
    }

    const articleEl = readerPaneEl.querySelector('.markdown-content');
    if (!articleEl || !articleEl.contains(sel.anchorNode)) {
      hideSelectionToolbar();
      return;
    }

    const text = sel.toString().trim();
    if (!text || text.length < 2) {
      hideSelectionToolbar();
      return;
    }

    currentSelectionText = text;
    const anchorEl = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    const blockEl = anchorEl ? anchorEl.closest('[data-line-index]') : null;
    currentSelectionLineIndex = blockEl ? Number(blockEl.getAttribute('data-line-index')) : -1;

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    if (selectionToolbar) {
      selectionToolbar.style.display = 'inline-flex';
      const tbWidth = selectionToolbar.offsetWidth || 380;
      const leftPos = Math.max(12, Math.min(window.innerWidth - tbWidth - 12, rect.left + rect.width / 2 - tbWidth / 2));
      const topPos = Math.max(12, rect.top - 46);
      selectionToolbar.style.left = `${leftPos}px`;
      selectionToolbar.style.top = `${topPos}px`;
      if (window.lucide) lucide.createIcons();
    }
  });

  window.applyViewerHighlight = async function(color = 'yellow') {
    hideSelectionToolbar();
    const note = notesList.find(n => n.id === selectedNoteId);
    if (!note || !currentSelectionText) return;

    const cleanSel = currentSelectionText.replace(/\r?\n/g, ' ').trim();
    if (!cleanSel) return;

    let updatedContent = note.content || '';
    if (updatedContent.includes(cleanSel)) {
      updatedContent = updatedContent.replace(cleanSel, `==${color}:${cleanSel}==`);
    } else if (currentSelectionLineIndex >= 0) {
      const lines = updatedContent.split('\n');
      if (lines[currentSelectionLineIndex]) {
        lines[currentSelectionLineIndex] = `==${color}:${lines[currentSelectionLineIndex].trim()}==`;
        updatedContent = lines.join('\n');
      }
    } else {
      showToast('Select text within a single paragraph to highlight.', 'info');
      return;
    }

    window.getSelection()?.removeAllRanges();
    await saveNoteContentDirectly(note.id, updatedContent, 'Highlighted!');
  };

  window.applyViewerCloze = async function() {
    hideSelectionToolbar();
    const note = notesList.find(n => n.id === selectedNoteId);
    if (!note || !currentSelectionText) return;

    const cleanSel = currentSelectionText.replace(/\r?\n/g, ' ').trim();
    if (!cleanSel) return;

    let updatedContent = note.content || '';
    if (updatedContent.includes(cleanSel)) {
      updatedContent = updatedContent.replace(cleanSel, `{{${cleanSel}}}`);
      window.getSelection()?.removeAllRanges();
      await saveNoteContentDirectly(note.id, updatedContent, 'Converted to Cloze fill-in-the-blank!');
    } else {
      showToast('Select a phrase inside a single line to cloak.', 'info');
    }
  };

  // Click an existing highlight in viewer to open action popover
  let activeHlNoteId = null;
  let activeHlIdx = -1;
  const hlPopover = document.getElementById('highlight-action-popover');

  window.openHighlightPopover = function(event, noteId, hlIdx) {
    activeHlNoteId = noteId;
    activeHlIdx = hlIdx;
    if (!hlPopover) return;
    const rect = event.currentTarget.getBoundingClientRect();
    hlPopover.style.display = 'inline-flex';
    const leftPos = Math.max(12, Math.min(window.innerWidth - 260, rect.left));
    const topPos = Math.max(12, rect.top - 42);
    hlPopover.style.left = `${leftPos}px`;
    hlPopover.style.top = `${topPos}px`;
    if (window.lucide) lucide.createIcons();
  };

  document.addEventListener('mousedown', (e) => {
    if (hlPopover && !hlPopover.contains(e.target) && !e.target.classList.contains('study-hl')) {
      hlPopover.style.display = 'none';
    }
  });

  window.changeExistingHighlightColor = async function(newColor) {
    if (hlPopover) hlPopover.style.display = 'none';
    const note = notesList.find(n => n.id === activeHlNoteId);
    const hl = highlightsRegistry[activeHlIdx];
    if (!note || !hl) return;
    const updatedContent = (note.content || '').replace(hl.rawMatch, `==${newColor}:${hl.innerText}==`);
    await saveNoteContentDirectly(activeHlNoteId, updatedContent, 'Highlight color updated');
  };

  window.pinExistingHighlight = function() {
    if (hlPopover) hlPopover.style.display = 'none';
    const hl = highlightsRegistry[activeHlIdx];
    if (!hl) return;
    currentSelectionText = hl.innerText;
    currentSelectionLineIndex = -1;
    window.promptPinOrTitleSelection('pin');
  };

  window.cardFromExistingHighlight = function() {
    if (hlPopover) hlPopover.style.display = 'none';
    const hl = highlightsRegistry[activeHlIdx];
    if (!hl) return;
    currentSelectionText = hl.innerText;
    window.createFlashcardFromSelection();
  };

  window.removeActiveHighlight = async function() {
    if (hlPopover) hlPopover.style.display = 'none';
    if (activeHlNoteId && activeHlIdx >= 0) {
      await window.removeViewerHighlight(activeHlNoteId, activeHlIdx);
    }
  };

  window.removeViewerHighlight = async function(noteId, hlIdx) {
    const note = notesList.find(n => n.id === noteId);
    const hl = highlightsRegistry[hlIdx];
    if (!note || !hl) return;

    const updatedContent = (note.content || '').replace(hl.rawMatch, hl.innerText);
    await saveNoteContentDirectly(noteId, updatedContent, 'Highlight removed');
  };

  window.quickHighlightLine = async function(noteId, lineIndex) {
    const note = notesList.find(n => n.id === noteId);
    if (!note) return;
    const lines = (note.content || '').split('\n');
    if (lines[lineIndex] === undefined) return;

    const raw = lines[lineIndex].trim();
    if (raw.startsWith('==') && raw.endsWith('==')) {
      lines[lineIndex] = raw.replace(/^==(?:yellow|green|purple|pink)?:?(.+)==$/, '$1');
    } else {
      lines[lineIndex] = `==yellow:${raw}==`;
    }
    await saveNoteContentDirectly(noteId, lines.join('\n'), 'Paragraph highlighted!');
  };

  window.quickActionOnLine = function(noteId, lineIndex, actionType) {
    const note = notesList.find(n => n.id === noteId);
    if (!note) return;
    const lines = (note.content || '').split('\n');
    const lineText = (lines[lineIndex] || '').trim();
    currentSelectionText = lineText;
    currentSelectionLineIndex = lineIndex;
    window.promptPinOrTitleSelection(actionType);
  };

  window.promptPinOrTitleSelection = function(actionType = 'pin') {
    hideSelectionToolbar();
    if (!currentSelectionText) return;
    pendingMarkerAction = actionType;

    if (sectionMarkerForm) sectionMarkerForm.reset();
    if (sectionMarkerPreview) sectionMarkerPreview.textContent = currentSelectionText;

    if (sectionMarkerModalTitle) {
      if (actionType === 'heading') {
        sectionMarkerModalTitle.innerHTML = `<i data-lucide="heading-2" class="icon-sm" style="color:var(--primary);"></i><span>Add Section Heading</span>`;
      } else {
        sectionMarkerModalTitle.innerHTML = `<i data-lucide="pin" class="icon-sm" style="color:#f59e0b;"></i><span>Pin &amp; Title Section</span>`;
      }
    }

    if (sectionMarkerModal) {
      sectionMarkerModal.classList.add('open');
      setTimeout(() => sectionMarkerTitleInput?.focus(), 50);
    }
    if (window.lucide) lucide.createIcons();
  };

  window.closeSectionMarkerModal = function() {
    if (sectionMarkerModal) sectionMarkerModal.classList.remove('open');
  };

  if (sectionMarkerForm) {
    sectionMarkerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const customTitle = sectionMarkerTitleInput.value.trim();
      const note = notesList.find(n => n.id === selectedNoteId);
      if (!customTitle || !note) return;

      let updatedContent = note.content || '';
      const lines = updatedContent.split('\n');

      if (pendingMarkerAction === 'heading') {
        if (currentSelectionLineIndex >= 0 && lines[currentSelectionLineIndex] !== undefined) {
          lines.splice(currentSelectionLineIndex, 0, `## ${customTitle}`);
          updatedContent = lines.join('\n');
        } else if (updatedContent.includes(currentSelectionText)) {
          updatedContent = updatedContent.replace(currentSelectionText, `## ${customTitle}\n${currentSelectionText}`);
        } else {
          updatedContent = `${updatedContent}\n\n## ${customTitle}\n${currentSelectionText}`;
        }
        closeSectionMarkerModal();
        await saveNoteContentDirectly(note.id, updatedContent, `Added section "${customTitle}"!`);
      } else {
        const cleanExcerpt = currentSelectionText.replace(/\r?\n/g, ' ').trim();
        if (currentSelectionLineIndex >= 0 && lines[currentSelectionLineIndex] !== undefined && lines[currentSelectionLineIndex].trim() === cleanExcerpt) {
          lines[currentSelectionLineIndex] = `> [!PIN: ${customTitle}] ${cleanExcerpt}`;
          updatedContent = lines.join('\n');
        } else if (updatedContent.includes(currentSelectionText)) {
          updatedContent = updatedContent.replace(currentSelectionText, `\n> [!PIN: ${customTitle}] ${cleanExcerpt}\n`);
        } else {
          updatedContent = `> [!PIN: ${customTitle}] ${cleanExcerpt}\n\n${updatedContent}`;
        }
        closeSectionMarkerModal();
        await saveNoteContentDirectly(note.id, updatedContent, `Pinned "${customTitle}"!`);
      }
    });
  }

  window.unpinViewerSection = async function(noteId, lineIndex) {
    const note = notesList.find(n => n.id === noteId);
    if (!note) return;
    const lines = (note.content || '').split('\n');
    if (lines[lineIndex] !== undefined) {
      lines[lineIndex] = lines[lineIndex].replace(/^>\s*\[!PIN:\s*[^\]]+\]\s*/i, '');
      await saveNoteContentDirectly(noteId, lines.join('\n'), 'Section unpinned');
    }
  };

  window.createFlashcardFromSelection = async function() {
    hideSelectionToolbar();
    const note = notesList.find(n => n.id === selectedNoteId);
    if (!note || !currentSelectionText) return;

    const question = prompt('Enter Question / Front of Flashcard:', `What is the key concept behind: "${currentSelectionText.slice(0, 45)}..."?`);
    if (!question || !question.trim()) return;

    const updatedTakeaways = [...(note.takeaways || []), { question: question.trim(), answer: currentSelectionText }];
    try {
      const res = await apiRequest(`/api/study/notes/${note.id}`, {
        method: 'PUT',
        body: { takeaways: updatedTakeaways }
      });
      note.takeaways = res.note.takeaways;
      showToast('Flashcard created from selection!', 'success');
      await loadSubjects();
      renderReaderPane(note);
      renderNotesList();
    } catch (err) {}
  };

  async function saveNoteContentDirectly(noteId, newContent, toastMsg = 'Saved!', skipFullReRender = false) {
    const note = notesList.find(n => n.id === noteId);
    if (!note) return;
    try {
      const res = await apiRequest(`/api/study/notes/${noteId}`, {
        method: 'PUT',
        body: { content: newContent }
      });
      note.content = res.note.content;
      if (toastMsg) showToast(toastMsg, 'success');
      if (!skipFullReRender) {
        renderReaderPane(note);
      }
      renderNotesList();
    } catch (err) {}
  }

  window.toggleNoteChecklistItem = async function(noteId, checkIndex, isChecked) {
    const note = notesList.find(n => n.id === noteId);
    if (!note) return;

    let currentIdx = 0;
    const updatedLines = (note.content || '').split('\n').map(line => {
      const m = line.match(/^(\s*[-*]\s+\[)([ xX])(\]\s+.*)$/);
      if (m) {
        if (currentIdx === checkIndex) {
          currentIdx++;
          return `${m[1]}${isChecked ? 'x' : ' '}${m[3]}`;
        }
        currentIdx++;
      }
      return line;
    });

    await saveNoteContentDirectly(noteId, updatedLines.join('\n'), isChecked ? 'Task completed!' : 'Task unchecked');
  };

  // ======================================================
  // MASTER DIGEST VIEW (ALL PINS & HIGHLIGHTS ACROSS NOTES)
  // ======================================================
  window.openStudyDigestView = function() {
    if (!readerPaneEl) return;

    const allPins = [];
    const allHighlights = [];

    notesList.forEach(note => {
      const content = note.content || '';
      content.split('\n').forEach(line => {
        const pinMatch = line.trim().match(/^>\s*\[!PIN:\s*([^\]]+)\]\s*(.*)$/i);
        if (pinMatch) {
          allPins.push({
            noteId: note.id,
            noteTitle: note.title,
            subjectName: note.subject ? note.subject.name : 'General',
            pinTitle: pinMatch[1].trim(),
            excerpt: pinMatch[2].trim()
          });
        }
      });

      const hlRegex = /==(?:(yellow|green|purple|pink):)?(.+?)==/g;
      let m;
      while ((m = hlRegex.exec(content)) !== null) {
        allHighlights.push({
          noteId: note.id,
          noteTitle: note.title,
          color: m[1] || 'yellow',
          text: m[2]
        });
      }
    });

    const scopeLabel = activeSubjectId !== 'ALL' && subjectsData?.subjects
      ? (subjectsData.subjects.find(s => s.id === activeSubjectId)?.name || 'Filtered Notes')
      : 'All Studies';

    readerPaneEl.innerHTML = `
      <div class="reader-header">
        <div class="reader-top-bar">
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span class="badge badge-OTHER">📑 MASTER REVISION DIGEST</span>
            <span style="font-size:0.75rem; color:var(--muted-foreground); font-weight:600;">${escapeHtml(scopeLabel)} (${notesList.length} notes)</span>
          </div>
          <div style="display:flex; gap:0.35rem;">
            ${selectedNoteId ? `
              <button type="button" class="btn-tiny" onclick="selectStudyNote('${selectedNoteId}')">
                <i data-lucide="arrow-left" class="icon-xs"></i> Back to Note
              </button>
            ` : ''}
          </div>
        </div>
        <h1 class="reader-title">Pinned Sections &amp; Highlights Digest</h1>
        <div class="reader-summary">All your pinned concepts and color-coded highlights compiled in one place for rapid review.</div>
      </div>

      <div class="reader-body">
        <div class="digest-card">
          <div class="study-section-title">
            <span>📌 Pinned Sections (${allPins.length})</span>
          </div>
          ${allPins.length === 0 ? `<p style="font-size:0.8rem;">No pinned sections yet. Select any text in a note and click <strong>📌 Pin Section</strong>.</p>` : `
            <div style="display:flex; flex-direction:column; gap:0.5rem;">
              ${allPins.map(p => `
                <div class="pinned-section-block" style="margin:0; cursor:pointer;" onclick="selectStudyNote('${p.noteId}', true)">
                  <div class="pinned-section-header">
                    <span class="pinned-section-title">📌 ${escapeHtml(p.pinTitle)}</span>
                    <span style="font-size:0.7rem; color:var(--primary); font-weight:600;">${escapeHtml(p.noteTitle)} ↗</span>
                  </div>
                  <div class="pinned-section-body">${escapeHtml(p.excerpt)}</div>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <div class="digest-card">
          <div class="study-section-title">
            <span>🖍️ Highlighted Key Points (${allHighlights.length})</span>
          </div>
          ${allHighlights.length === 0 ? `<p style="font-size:0.8rem;">No highlights yet. Select text in any note to highlight in Yellow, Green, Purple, or Pink.</p>` : `
            <div style="display:flex; flex-direction:column; gap:0.45rem;">
              ${allHighlights.map(h => `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem; padding:0.45rem 0.65rem; border:1px solid var(--border); border-radius:var(--radius-sm); cursor:pointer;" onclick="selectStudyNote('${h.noteId}', true)">
                  <mark class="study-hl study-hl-${h.color}" style="font-size:0.85rem;">${escapeHtml(h.text)}</mark>
                  <span style="font-size:0.7rem; color:var(--muted-foreground); white-space:nowrap;">${escapeHtml(h.noteTitle)} ↗</span>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();
  };

  // ======================================================
  // LOAD & RENDER STUDY SUBJECTS (COMPACT TAB BAR)
  // ======================================================
  async function loadSubjects() {
    try {
      const res = await apiRequest('/api/study/subjects');
      subjectsData = res;

      if (metricStudies) metricStudies.textContent = res.totalSubjects || 0;
      if (metricNotes) metricNotes.textContent = res.totalNotes || 0;
      if (metricMastered) metricMastered.textContent = (res.masteryCounts && res.masteryCounts.MASTERED) || 0;
      if (metricFlashcards) metricFlashcards.textContent = res.totalFlashcards || 0;

      renderDesktopSidebar('study', currentUser, subjectsData, activeSubjectId, activeMastery);
      renderSubjectsStrip(res.subjects || [], res.totalNotes || 0);
      populateSubjectDropdown();
    } catch (err) {
      console.error('Failed to load study subjects:', err);
    }
  }

  function renderSubjectsStrip(subjects, totalNotes) {
    if (!subjectsShelf) return;

    const allTab = `
      <button type="button" class="study-tab-pill ${activeSubjectId === 'ALL' ? 'active' : ''}" onclick="filterStudySubject('ALL')">
        <i data-lucide="layers" class="icon-xs"></i>
        <span>All Studies</span>
        <span class="study-tab-count">${totalNotes}</span>
      </button>
    `;

    const subjectTabs = subjects.map(s => {
      const isSelected = activeSubjectId === s.id;
      const color = s.color || '#4f46e5';
      return `
        <button type="button" class="study-tab-pill ${isSelected ? 'active' : ''}" onclick="filterStudySubject('${s.id}')" title="${escapeHtml(s.description || s.name)} (${s.progress || 0}% mastered)">
          <span class="study-tab-dot" style="background:${isSelected ? '#ffffff' : color};"></span>
          <i data-lucide="${escapeHtml(s.icon || 'book-open')}" class="icon-xs" style="${isSelected ? 'color:#ffffff;' : `color:${color};`}"></i>
          <span>${escapeHtml(s.name)}</span>
          <span class="study-tab-count">${s.noteCount || 0}</span>
        </button>
      `;
    }).join('');

    const addTabBtn = `
      <button type="button" class="btn-tiny" style="height:1.75rem; border-style:dashed;" onclick="openStudySubjectModal()">
        <i data-lucide="plus" class="icon-xs"></i>
        <span>New Study</span>
      </button>
    `;

    subjectsShelf.innerHTML = allTab + subjectTabs + addTabBtn;

    const isSpecificSubject = activeSubjectId && !['ALL', 'PINNED', 'NONE'].includes(activeSubjectId);
    if (activeStudyActions) {
      activeStudyActions.style.display = isSpecificSubject ? 'flex' : 'none';
    }

    if (window.lucide) lucide.createIcons();
  }

  function populateSubjectDropdown(selectedId = '') {
    if (!noteSubjectSelect || !subjectsData) return;
    const subjects = subjectsData.subjects || [];
    const targetId = selectedId || (!['ALL', 'PINNED', 'NONE'].includes(activeSubjectId) ? activeSubjectId : '');

    noteSubjectSelect.innerHTML = `
      <option value="">General Notes (Unassigned)</option>
      ${subjects.map(s => `
        <option value="${s.id}" ${targetId === s.id ? 'selected' : ''}>
          ${escapeHtml(s.name)}
        </option>
      `).join('')}
    `;
  }

  // ======================================================
  // LOAD & RENDER STUDY NOTES
  // ======================================================
  async function loadNotes(preserveSelection = true) {
    try {
      let url = '/api/study/notes?';
      const params = [];

      if (activeSubjectId === 'PINNED') {
        params.push('pinned=true');
      } else if (activeSubjectId === 'NONE') {
        params.push('subjectId=NONE');
      } else if (activeSubjectId && activeSubjectId !== 'ALL') {
        params.push(`subjectId=${encodeURIComponent(activeSubjectId)}`);
      }

      if (activeMastery && activeMastery !== 'ALL') {
        params.push(`mastery=${encodeURIComponent(activeMastery)}`);
      }

      if (searchQuery) {
        params.push(`search=${encodeURIComponent(searchQuery)}`);
      }

      url += params.join('&');
      const res = await apiRequest(url);
      notesList = res.notes || [];
      applyNotesSorting();

      const sortSelectEl = document.getElementById('notes-sort-select');
      if (sortSelectEl) sortSelectEl.value = notesSortMode;

      if (notesListHeading) {
        let headingLabel = `Notes (${notesList.length})`;
        if (activeSubjectId !== 'ALL' && activeSubjectId !== 'PINNED' && activeSubjectId !== 'NONE' && subjectsData?.subjects) {
          const s = subjectsData.subjects.find(x => x.id === activeSubjectId);
          if (s) headingLabel = `${s.name} (${notesList.length})`;
        } else if (activeSubjectId === 'PINNED') {
          headingLabel = `Pinned (${notesList.length})`;
        }
        notesListHeading.textContent = headingLabel;
      }

      renderNotesList();

      if (notesList.length > 0) {
        const stillExists = preserveSelection && selectedNoteId && notesList.find(n => n.id === selectedNoteId);
        const noteToSelect = stillExists || notesList[0];
        selectedNoteId = noteToSelect.id;
        highlightSelectedCard();
        renderReaderPane(noteToSelect);
      } else {
        selectedNoteId = null;
        renderEmptyReaderPane();
      }
    } catch (err) {
      console.error('Failed to load study notes:', err);
    }
  }

  // ======================================================
  // NOTE SORTING & MANUAL REORDERING (1→N COURSE ORDER & UP/DOWN)
  // ======================================================
  function applyNotesSorting() {
    if (!Array.isArray(notesList) || notesList.length <= 1) return;

    // Ensure every existing note has a stable position in customNoteOrder (oldest created first by default)
    const byCreatedAsc = [...notesList].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    let orderUpdated = false;
    byCreatedAsc.forEach(n => {
      if (!customNoteOrder.includes(n.id)) {
        customNoteOrder.push(n.id);
        orderUpdated = true;
      }
    });
    if (orderUpdated) {
      try { localStorage.setItem('pk_custom_note_order', JSON.stringify(customNoteOrder)); } catch (e) {}
    }

    notesList.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;

      if (notesSortMode === 'title_asc') {
        return (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' });
      }
      if (notesSortMode === 'created_desc') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (notesSortMode === 'updated_desc') {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }

      // Default 'custom_asc' (1→N Course Order: oldest first + manual ▲/▼ order)
      const idxA = customNoteOrder.indexOf(a.id);
      const idxB = customNoteOrder.indexOf(b.id);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }

  window.changeNotesSortOrder = function(newSortMode) {
    notesSortMode = newSortMode || 'custom_asc';
    try { localStorage.setItem('pk_notes_sort', notesSortMode); } catch (e) {}
    applyNotesSorting();
    renderNotesList();
    const note = notesList.find(n => n.id === selectedNoteId);
    if (note && isReadMode) renderReaderPane(note);
  };

  window.moveNotePosition = function(event, noteId, direction) {
    if (event) event.stopPropagation();
    if (notesSortMode !== 'custom_asc') {
      notesSortMode = 'custom_asc';
      try { localStorage.setItem('pk_notes_sort', 'custom_asc'); } catch (e) {}
      const sortSelectEl = document.getElementById('notes-sort-select');
      if (sortSelectEl) sortSelectEl.value = 'custom_asc';
      applyNotesSorting();
    }

    const curIdx = notesList.findIndex(n => n.id === noteId);
    if (curIdx === -1) return;
    const targetIdx = curIdx + direction;
    if (targetIdx < 0 || targetIdx >= notesList.length) return;

    // Swap in notesList
    const temp = notesList[curIdx];
    notesList[curIdx] = notesList[targetIdx];
    notesList[targetIdx] = temp;

    // Rebuild customNoteOrder preserving global IDs
    const currentVisibleIds = notesList.map(n => n.id);
    const otherIds = customNoteOrder.filter(id => !currentVisibleIds.includes(id));
    customNoteOrder = [...currentVisibleIds, ...otherIds];
    try { localStorage.setItem('pk_custom_note_order', JSON.stringify(customNoteOrder)); } catch (e) {}

    renderNotesList();
    const activeNote = notesList.find(n => n.id === selectedNoteId);
    if (activeNote && isReadMode) renderReaderPane(activeNote);
  };

  window.switchStudyInReadMode = async function(subjectId) {
    activeSubjectId = subjectId || 'ALL';
    syncFilterUI();
    await loadNotes(false);
    if (subjectsData) {
      renderDesktopSidebar('study', currentUser, subjectsData, activeSubjectId, activeMastery);
      renderSubjectsStrip(subjectsData.subjects || [], subjectsData.totalNotes || 0);
    }
  };

  window.toggleChapterCollapse = function(chapterKey) {
    if (collapsedChapters.has(chapterKey)) {
      collapsedChapters.delete(chapterKey);
    } else {
      collapsedChapters.add(chapterKey);
    }
    renderNotesList();
  };

  function populateChapterSuggestions() {
    const datalist = document.getElementById('chapter-suggestions');
    if (!datalist) return;
    const chapters = Array.from(new Set(notesList.map(n => n.chapter).filter(Boolean)));
    datalist.innerHTML = chapters.map(c => `<option value="${escapeHtml(c)}">`).join('');
  }

  function renderNoteCardHtml(note, idx = 0) {
    const isSelected = note.id === selectedNoteId;
    const mMeta = MASTERY_META[note.mastery] || MASTERY_META.LEARNING;
    const subj = note.subject;
    const cardPreview = note.summary || (note.content ? note.content.replace(/[#*`>=-]/g, '').trim().slice(0, 90) : '');
    const cardCount = (note.takeaways && note.takeaways.length) || 0;
    const orderNum = notesList.findIndex(n => n.id === note.id) + 1;

    return `
      <div class="note-list-card ${isSelected ? 'selected' : ''} ${note.pinned ? 'pinned-card' : ''}" data-note-id="${note.id}" onclick="selectStudyNote('${note.id}', true)">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:0.3rem;">
          <div class="note-card-title" style="min-width:0; flex:1;">
            <span style="font-size:0.62rem; font-weight:800; color:var(--primary); background:#ede9fe; padding:0.05rem 0.32rem; border-radius:4px; flex-shrink:0;">#${orderNum}</span>
            ${note.pinned ? '<i data-lucide="pin" class="icon-xs" style="color:#f59e0b; flex-shrink:0;"></i>' : ''}
            <span style="overflow:hidden; text-overflow:ellipsis;">${escapeHtml(note.title)}</span>
          </div>
          <div class="note-reorder-btns" style="display:inline-flex; align-items:center; gap:0.1rem; flex-shrink:0;">
            <button type="button" class="note-order-btn" onclick="window.moveNotePosition(event, '${note.id}', -1)" title="Move Note Up">▲</button>
            <button type="button" class="note-order-btn" onclick="window.moveNotePosition(event, '${note.id}', 1)" title="Move Note Down">▼</button>
          </div>
        </div>

        ${cardPreview ? `<div class="note-card-summary">${escapeHtml(cardPreview)}</div>` : ''}

        <div class="note-card-meta">
          <div style="display:flex; align-items:center; gap:0.25rem; min-width:0; overflow:hidden;">
            <span class="badge ${mMeta.badge}" style="font-size:0.55rem; padding:0.08rem 0.35rem;">
              ${mMeta.label}
            </span>
            ${subj && activeSubjectId === 'ALL' ? `
              <span style="font-size:0.625rem; font-weight:600; color:${subj.color || '#4f46e5'}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                ${escapeHtml(subj.name)}
              </span>
            ` : ''}
            ${cardCount > 0 ? `
              <span style="font-size:0.6rem; color:#7c3aed; font-weight:700;" title="${cardCount} Flashcards">✦${cardCount}</span>
            ` : ''}
          </div>
          <span style="font-size:0.6rem; color:var(--muted-foreground); flex-shrink:0;">
            ${new Date(note.createdAt || note.updatedAt).toLocaleDateString()}
          </span>
        </div>
      </div>
    `;
  }

  function renderNotesList() {
    if (!notesListEl) return;
    populateChapterSuggestions();

    if (notesList.length === 0) {
      notesListEl.innerHTML = `
        <div style="padding: 2rem 0.75rem; text-align: center;">
          <p style="font-size: 0.78rem; margin-bottom: 0.75rem;">
            ${activeSubjectId !== 'ALL' || activeMastery !== 'ALL' || searchQuery
              ? 'No notes match this filter.'
              : 'No notes yet.'}
          </p>
          <button class="btn btn-primary btn-compact" onclick="openStudyNoteModal()">
            <i data-lucide="plus" class="icon-xs"></i>
            <span>Add Note</span>
          </button>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    const hasAnyChapters = notesList.some(n => n.chapter && n.chapter.trim());
    if (!hasAnyChapters) {
      notesListEl.innerHTML = notesList.map(renderNoteCardHtml).join('');
      if (window.lucide) lucide.createIcons();
      return;
    }

    // Group notes by chapter
    const groups = new Map();
    notesList.forEach(n => {
      const ch = (n.chapter && n.chapter.trim()) ? n.chapter.trim() : 'General / Uncategorized';
      if (!groups.has(ch)) groups.set(ch, []);
      groups.get(ch).push(n);
    });

    let html = '';
    groups.forEach((groupNotes, chapterName) => {
      const isCollapsed = collapsedChapters.has(chapterName);
      html += `
        <div class="notes-chapter-header" onclick="window.toggleChapterCollapse('${escapeJsAttr(chapterName)}')">
          <span style="display:flex; align-items:center; gap:0.3rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            <i data-lucide="${isCollapsed ? 'chevron-right' : 'chevron-down'}" class="icon-xs"></i>
            <span>${escapeHtml(chapterName)}</span>
          </span>
          <span style="font-size:0.62rem; opacity:0.8;">${groupNotes.length}</span>
        </div>
        ${isCollapsed ? '' : groupNotes.map(renderNoteCardHtml).join('')}
      `;
    });

    notesListEl.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  }

  function highlightSelectedCard() {
    document.querySelectorAll('.note-list-card').forEach(el => {
      if (el.getAttribute('data-note-id') === selectedNoteId) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    });
  }

  window.selectStudyNote = function(noteId, openOnMobile = false) {
    const note = notesList.find(n => n.id === noteId);
    if (!note) return;
    selectedNoteId = noteId;
    if (isReadMode && window.innerWidth <= 900) {
      isReadTocOpen = false;
    }
    highlightSelectedCard();
    renderReaderPane(note);

    if (openOnMobile && window.innerWidth < 1024 && readerPaneEl) {
      readerPaneEl.classList.add('mobile-open');
    }
  };

  window.closeMobileReader = function() {
    if (readerPaneEl) {
      readerPaneEl.classList.remove('mobile-open');
    }
  };

  window.toggleMobileReaderTools = function(forceState) {
    isMobileReaderToolsOpen = typeof forceState === 'boolean' ? forceState : !isMobileReaderToolsOpen;
    const panel = document.getElementById('reader-collapsible-tools');
    const btn = document.getElementById('mobile-reader-hamburger-btn');
    if (panel) panel.classList.toggle('mobile-tools-open', isMobileReaderToolsOpen);
    if (btn) btn.classList.toggle('active', isMobileReaderToolsOpen);
  };

  // ======================================================
  // DIRECT IN-STUDY WRITING, ELEMENT MENU, CHART STUDIO, WHITEBOARD & DIAGRAM BUILDER
  // ======================================================
  let liveAutoSaveTimer = null;

  window.setCanvasMode = function(mode) {
    if (isReadMode) {
      isReadMode = false;
      document.body.classList.remove('study-read-mode-active');
      syncReadModeClasses();
    }
    canvasMode = mode;
    const note = notesList.find(n => n.id === selectedNoteId);
    if (note) renderReaderPane(note);
  };

  // ======================================================
  // PRACTICAL DISTRACTION-FREE READ MODE (PC & PHONE)
  // ======================================================
  function syncReadModeClasses() {
    if (!readerPaneEl) return;
    readerPaneEl.classList.remove('read-theme-light', 'read-theme-sepia', 'read-theme-dark', 'read-size-sm', 'read-size-md', 'read-size-lg', 'read-size-xl');
    if (isReadMode) {
      readerPaneEl.classList.add(`read-theme-${readTheme}`, `read-size-${readFontSize}`);
    }
  }

  window.toggleReadMode = function(forceState) {
    if (!selectedNoteId && notesList.length > 0) {
      selectedNoteId = notesList[0].id;
    }
    const note = notesList.find(n => n.id === selectedNoteId);
    if (!note) {
      showToast('Select or create a note first to enter Read Mode.', 'info');
      return;
    }

    isReadMode = typeof forceState === 'boolean' ? forceState : !isReadMode;
    if (isReadMode && window.innerWidth <= 900) {
      isReadTocOpen = false;
    }
    document.body.classList.toggle('study-read-mode-active', isReadMode);
    syncReadModeClasses();
    renderReaderPane(note);
  };

  window.setReadTheme = function(theme) {
    readTheme = theme;
    try { localStorage.setItem('pk_read_theme', theme); } catch (e) {}
    syncReadModeClasses();
    const note = notesList.find(n => n.id === selectedNoteId);
    if (note && isReadMode) renderReaderPane(note);
  };

  window.stepReadFontSize = function(dir) {
    const order = ['sm', 'md', 'lg', 'xl'];
    const idx = Math.max(0, Math.min(order.length - 1, order.indexOf(readFontSize) + dir));
    readFontSize = order[idx];
    try { localStorage.setItem('pk_read_size', readFontSize); } catch (e) {}
    syncReadModeClasses();
  };

  window.navigateReadModeNote = function(offset) {
    if (notesList.length === 0) return;
    const curIdx = notesList.findIndex(n => n.id === selectedNoteId);
    const nextIdx = (curIdx + offset + notesList.length) % notesList.length;
    selectedNoteId = notesList[nextIdx].id;
    highlightSelectedCard();
    renderReaderPane(notesList[nextIdx]);
  };

  window.toggleReadModeToc = function(forceState) {
    isReadTocOpen = typeof forceState === 'boolean' ? forceState : !isReadTocOpen;
    const splitEl = document.getElementById('read-mode-body-split');
    const btn = document.getElementById('read-toc-toggle-btn');
    if (splitEl) splitEl.classList.toggle('toc-collapsed', !isReadTocOpen);
    if (btn) btn.classList.toggle('active', isReadTocOpen);
  };

  window.jumpToReadSection = function(domId) {
    window.scrollToReaderSection(domId);
    if (window.innerWidth <= 900 && isReadTocOpen) {
      window.toggleReadModeToc(false);
    }
  };

  window.updateReadModeScrollProgress = function(el) {
    const bar = document.getElementById('read-progress-fill');
    if (!bar || !el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    const pct = maxScroll > 0 ? Math.min(100, Math.round((el.scrollTop / maxScroll) * 100)) : 100;
    bar.style.width = `${pct}%`;
  };

  window.toggleElementPalette = function(forceState) {
    const el = document.getElementById('element-palette-dropdown');
    if (!el) return;
    if (typeof forceState === 'boolean') {
      el.classList.toggle('open', forceState);
    } else {
      el.classList.toggle('open');
    }
  };

  document.addEventListener('click', (e) => {
    const palette = document.getElementById('element-palette-dropdown');
    const trigger = document.getElementById('insert-menu-trigger-btn');
    if (palette && palette.classList.contains('open')) {
      if (!palette.contains(e.target) && (!trigger || !trigger.contains(e.target))) {
        palette.classList.remove('open');
      }
    }
  });

  // Insert or append markdown snippet directly into the current note (works in Study, Write, and Split modes!)
  window.insertSnippetIntoActiveNote = async function(snippet, toastMsg = 'Element added to note!') {
    window.toggleElementPalette(false);
    const note = notesList.find(n => n.id === selectedNoteId);
    if (!note) return;

    const directTa = document.getElementById('direct-note-textarea');
    if (directTa) {
      const start = directTa.selectionStart ?? directTa.value.length;
      const end = directTa.selectionEnd ?? directTa.value.length;
      const prefix = start > 0 && !directTa.value.slice(0, start).endsWith('\n') ? '\n\n' : '';
      const inserted = `${prefix}${snippet}\n`;
      directTa.setRangeText(inserted, start, end, 'end');
      directTa.focus();
      note.content = directTa.value;
      updateLiveSplitPreview(note);
      await saveNoteContentDirectly(note.id, directTa.value, toastMsg, true);
    } else {
      const current = (note.content || '').trimEnd();
      const updated = current ? `${current}\n\n${snippet}` : snippet;
      await saveNoteContentDirectly(note.id, updated, toastMsg, false);
    }
  };

  function updateLiveSplitPreview(note) {
    const previewEl = document.getElementById('direct-live-preview-body');
    if (!previewEl || !note) return;
    previewEl.innerHTML = renderMarkdown(note.content, note.id);
    if (window.lucide) lucide.createIcons();
    runMermaidDiagrams();
  }

  window.handleDirectTextareaInput = function(noteId, textarea) {
    const note = notesList.find(n => n.id === noteId);
    if (!note) return;
    note.content = textarea.value;

    // Detect "/" at start of line to pop open Element Menu
    const pos = textarea.selectionStart;
    const before = textarea.value.slice(0, pos);
    if (/(?:^|\n)\/$/.test(before)) {
      window.toggleElementPalette(true);
    }

    updateLiveSplitPreview(note);

    const statusBadge = document.getElementById('direct-save-status');
    if (statusBadge) {
      statusBadge.textContent = '● Editing...';
      statusBadge.style.color = '#d97706';
    }

    clearTimeout(liveAutoSaveTimer);
    liveAutoSaveTimer = setTimeout(async () => {
      try {
        const res = await apiRequest(`/api/study/notes/${noteId}`, {
          method: 'PUT',
          body: { content: textarea.value }
        });
        note.content = res.note.content;
        if (statusBadge) {
          statusBadge.textContent = '✓ Auto-saved';
          statusBadge.style.color = '#10b981';
        }
        renderNotesList();
      } catch (e) {}
    }, 850);
  };

  window.saveDirectNoteNow = async function(noteId) {
    clearTimeout(liveAutoSaveTimer);
    const note = notesList.find(n => n.id === noteId);
    if (!note) return;
    const titleEl = document.getElementById('inline-note-title');
    const summaryEl = document.getElementById('inline-note-summary');
    const chapterEl = document.getElementById('inline-note-chapter');
    const directTa = document.getElementById('direct-note-textarea');

    const body = {
      title: titleEl ? titleEl.value.trim() || 'Untitled Note' : note.title,
      summary: summaryEl ? summaryEl.value.trim() : note.summary,
      chapter: chapterEl ? chapterEl.value.trim() || null : note.chapter,
      content: directTa ? directTa.value : note.content
    };

    try {
      const res = await apiRequest(`/api/study/notes/${noteId}`, {
        method: 'PUT',
        body
      });
      Object.assign(note, res.note);
      const statusBadge = document.getElementById('direct-save-status');
      if (statusBadge) {
        statusBadge.textContent = '✓ Saved';
        statusBadge.style.color = '#10b981';
      }
      showToast('Note saved!', 'success');
      await loadSubjects();
      renderNotesList();
      if (canvasMode === 'study') renderReaderPane(note);
    } catch (e) {}
  };

  window.quickUpdateHeaderMeta = async function(noteId, field, value) {
    const note = notesList.find(n => n.id === noteId);
    if (!note) return;
    const payload = {};
    if (field === 'title') {
      const v = String(value || '').trim();
      if (!v || v === note.title) return;
      payload.title = v;
    } else if (field === 'summary') {
      const v = String(value || '').trim();
      if (v === (note.summary || '')) return;
      payload.summary = v;
    } else if (field === 'chapter') {
      const v = String(value || '').trim();
      if (v === (note.chapter || '')) return;
      payload.chapter = v || null;
    } else if (field === 'subjectId') {
      payload.subjectId = value || null;
    } else if (field === 'tags') {
      payload.tags = String(value || '').split(',').map(t => t.trim()).filter(Boolean);
    }

    try {
      const res = await apiRequest(`/api/study/notes/${noteId}`, {
        method: 'PUT',
        body: payload
      });
      Object.assign(note, res.note);
      await loadSubjects();
      renderNotesList();
    } catch (e) {}
  };

  // ======================================================
  // EMBEDDED STUDIO PANELS (CHART BUILDER, WHITEBOARD, FLOWCHART, MATH, FLASHCARDS)
  // ======================================================
  window.openInlineStudio = function(studioType) {
    window.toggleElementPalette(false);
    if (activeInlineStudio === studioType) {
      activeInlineStudio = null;
    } else {
      activeInlineStudio = studioType;
      if (studioType !== 'chart') editingChartIdx = -1;
    }
    const note = notesList.find(n => n.id === selectedNoteId);
    if (note) {
      renderReaderPane(note);
      if (activeInlineStudio === 'whiteboard') {
        setTimeout(() => initWhiteboardCanvas(), 40);
      } else if (activeInlineStudio === 'chart') {
        setTimeout(() => updateChartStudioPreview(), 40);
      } else if (activeInlineStudio === 'diagram') {
        setTimeout(() => updateDiagramStudioPreview(), 40);
      }
    }
  };

  window.editExistingChart = function(chartIdx) {
    editingChartIdx = chartIdx;
    activeInlineStudio = 'chart';
    const note = notesList.find(n => n.id === selectedNoteId);
    if (note) {
      renderReaderPane(note);
      setTimeout(() => updateChartStudioPreview(), 40);
    }
  };

  window.deleteExistingChart = async function(noteId, chartIdx) {
    const note = notesList.find(n => n.id === noteId);
    const ch = chartsRegistry[chartIdx];
    if (!note || !ch) return;
    const updated = (note.content || '').replace(ch.rawBlock, '').replace(/\n{3,}/g, '\n\n').trim();
    await saveNoteContentDirectly(noteId, updated, 'Chart removed');
  };

  function renderInlineStudioHtml(note) {
    if (!activeInlineStudio) return '';

    // 1. INTERACTIVE CHART BUILDER STUDIO
    if (activeInlineStudio === 'chart') {
      let initCfg = {
        type: 'bar',
        title: 'Performance Comparison',
        unit: '',
        items: [
          { label: 'Q1', value: 48 },
          { label: 'Q2', value: 85 },
          { label: 'Q3', value: 112 },
          { label: 'Q4', value: 145 }
        ]
      };
      if (editingChartIdx >= 0 && chartsRegistry[editingChartIdx]) {
        initCfg = parseChartConfig(chartsRegistry[editingChartIdx].rawCode);
      }

      return `
        <div class="inline-studio-panel">
          <div class="inline-studio-header">
            <div style="display:flex; align-items:center; gap:0.45rem; font-weight:800; font-size:0.9rem; color:var(--primary);">
              <i data-lucide="bar-chart-3" class="icon-sm"></i>
              <span>${editingChartIdx >= 0 ? 'Edit Data Chart' : 'Interactive Data Chart Studio'}</span>
            </div>
            <button type="button" class="btn-tiny" onclick="openInlineStudio(null)">
              <i data-lucide="x" class="icon-xs"></i> Close
            </button>
          </div>

          <div style="display:grid; grid-template-columns: 1.15fr 1fr; gap:1rem; align-items:start;">
            <div>
              <div style="display:grid; grid-template-columns: 1.3fr 1fr 0.7fr; gap:0.5rem; margin-bottom:0.65rem;">
                <div>
                  <label class="form-label" style="font-size:0.7rem;">Chart Title</label>
                  <input type="text" id="studio-chart-title" class="form-input" style="height:1.85rem; font-size:0.78rem;" value="${escapeHtml(initCfg.title)}" oninput="window.updateChartStudioPreview()">
                </div>
                <div>
                  <label class="form-label" style="font-size:0.7rem;">Chart Type</label>
                  <select id="studio-chart-type" class="form-select" style="height:1.85rem; font-size:0.78rem;" onchange="window.updateChartStudioPreview()">
                    <option value="bar" ${initCfg.type === 'bar' ? 'selected' : ''}>📊 Vertical Bar Chart</option>
                    <option value="line" ${initCfg.type === 'line' ? 'selected' : ''}>📈 Line Trend Chart</option>
                    <option value="area" ${initCfg.type === 'area' ? 'selected' : ''}>🌊 Shaded Area Chart</option>
                    <option value="pie" ${initCfg.type === 'pie' ? 'selected' : ''}>🥧 Pie Chart</option>
                    <option value="doughnut" ${initCfg.type === 'doughnut' ? 'selected' : ''}>🍩 Doughnut Chart</option>
                    <option value="hbar" ${initCfg.type === 'hbar' ? 'selected' : ''}>📉 Horizontal Bar</option>
                  </select>
                </div>
                <div>
                  <label class="form-label" style="font-size:0.7rem;">Unit (optional)</label>
                  <input type="text" id="studio-chart-unit" class="form-input" style="height:1.85rem; font-size:0.78rem;" placeholder="%, $, ms" value="${escapeHtml(initCfg.unit || '')}" oninput="window.updateChartStudioPreview()">
                </div>
              </div>

              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem;">
                <span style="font-size:0.7rem; font-weight:700; color:var(--muted-foreground);">DATA POINTS (LABEL &amp; NUMBER)</span>
                <button type="button" class="btn-tiny" onclick="window.addChartStudioRow()">+ Add Row</button>
              </div>

              <div id="studio-chart-rows" style="display:flex; flex-direction:column; gap:0.35rem; max-height:11.5rem; overflow-y:auto; padding-right:0.2rem;">
                ${initCfg.items.map(it => `
                  <div class="chart-data-row" style="display:grid; grid-template-columns: 1.2fr 0.8fr auto; gap:0.35rem; align-items:center;">
                    <input type="text" class="form-input chart-row-label" style="height:1.75rem; font-size:0.76rem;" placeholder="Label" value="${escapeHtml(it.label)}" oninput="window.updateChartStudioPreview()">
                    <input type="number" step="any" class="form-input chart-row-val" style="height:1.75rem; font-size:0.76rem;" placeholder="Value" value="${it.value}" oninput="window.updateChartStudioPreview()">
                    <button type="button" class="btn-icon" style="width:1.65rem; height:1.65rem; color:var(--destructive);" onclick="this.parentElement.remove(); window.updateChartStudioPreview();">
                      <i data-lucide="x" class="icon-xs"></i>
                    </button>
                  </div>
                `).join('')}
              </div>

              <div style="display:flex; justify-content:flex-end; gap:0.4rem; margin-top:0.85rem;">
                <button type="button" class="btn btn-primary btn-compact" onclick="window.commitChartStudioToNote('${note.id}')">
                  <i data-lucide="check" class="icon-xs"></i>
                  <span>${editingChartIdx >= 0 ? 'Update Chart in Note' : 'Insert Chart into Note'}</span>
                </button>
              </div>
            </div>

            <div>
              <div style="font-size:0.68rem; font-weight:700; color:var(--muted-foreground); margin-bottom:0.25rem; text-transform:uppercase;">Live Preview</div>
              <div id="studio-chart-live-preview" style="border:1px solid var(--border); border-radius:var(--radius-md); padding:0.5rem; background:#faf9ff;"></div>
            </div>
          </div>
        </div>
      `;
    }

    // 2. INTERACTIVE WHITEBOARD & DIAGRAM DRAWING STUDIO
    if (activeInlineStudio === 'whiteboard') {
      return `
        <div class="inline-studio-panel">
          <div class="inline-studio-header">
            <div style="display:flex; align-items:center; gap:0.45rem; font-weight:800; font-size:0.9rem; color:var(--primary);">
              <i data-lucide="pen-tool" class="icon-sm"></i>
              <span>Interactive Whiteboard &amp; Diagram Sketchpad</span>
            </div>
            <div style="display:flex; gap:0.4rem;">
              <button type="button" class="btn btn-primary btn-compact" onclick="window.insertWhiteboardIntoNote()">
                <i data-lucide="check" class="icon-xs"></i> Insert Drawing into Note
              </button>
              <button type="button" class="btn-tiny" onclick="openInlineStudio(null)">
                <i data-lucide="x" class="icon-xs"></i> Close
              </button>
            </div>
          </div>

          <div class="whiteboard-toolbar">
            <button type="button" class="wb-tool-btn active" data-wb-tool="pen" onclick="window.setWbTool('pen', this)">✏️ Pen</button>
            <button type="button" class="wb-tool-btn" data-wb-tool="line" onclick="window.setWbTool('line', this)">📏 Line</button>
            <button type="button" class="wb-tool-btn" data-wb-tool="arrow" onclick="window.setWbTool('arrow', this)">↗️ Arrow</button>
            <button type="button" class="wb-tool-btn" data-wb-tool="rect" onclick="window.setWbTool('rect', this)">▭ Box</button>
            <button type="button" class="wb-tool-btn" data-wb-tool="circle" onclick="window.setWbTool('circle', this)">◯ Circle</button>
            <button type="button" class="wb-tool-btn" data-wb-tool="diamond" onclick="window.setWbTool('diamond', this)">◇ Decision</button>
            <button type="button" class="wb-tool-btn" data-wb-tool="text" onclick="window.setWbTool('text', this)">🔤 Text</button>
            <button type="button" class="wb-tool-btn" data-wb-tool="eraser" onclick="window.setWbTool('eraser', this)">🧹 Eraser</button>

            <span style="width:1px; height:1.25rem; background:var(--border); margin:0 0.2rem;"></span>

            <div style="display:inline-flex; align-items:center; gap:0.25rem;">
              ${['#4f46e5', '#0f172a', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9'].map((col, idx) => `
                <button type="button" class="sel-color-dot" style="background:${col}; border:2px solid ${idx === 0 ? '#111827' : 'transparent'};" onclick="window.setWbColor('${col}', this)"></button>
              `).join('')}
            </div>

            <span style="width:1px; height:1.25rem; background:var(--border); margin:0 0.2rem;"></span>

            <button type="button" class="wb-tool-btn" onclick="window.undoWhiteboard()">↩ Undo</button>
            <button type="button" class="wb-tool-btn" onclick="window.clearWhiteboard()">🗑 Clear</button>
          </div>

          <div class="whiteboard-canvas-wrap">
            <canvas id="study-whiteboard-canvas" width="760" height="340"></canvas>
          </div>
          <div style="font-size:0.68rem; color:var(--muted-foreground); margin-top:0.35rem;">
            💡 Tip: Use <strong>▭ Box</strong>, <strong>◇ Decision</strong>, <strong>↗️ Arrow</strong>, and <strong>🔤 Text</strong> to draw flowcharts or architecture diagrams, or sketch freely with <strong>✏️ Pen</strong>.
          </div>
        </div>
      `;
    }

    // 3. VISUAL FLOWCHART & MERMAID DIAGRAM BUILDER
    if (activeInlineStudio === 'diagram') {
      return `
        <div class="inline-studio-panel">
          <div class="inline-studio-header">
            <div style="display:flex; align-items:center; gap:0.45rem; font-weight:800; font-size:0.9rem; color:var(--primary);">
              <i data-lucide="git-merge" class="icon-sm"></i>
              <span>Visual Flowchart &amp; Diagram Studio</span>
            </div>
            <button type="button" class="btn-tiny" onclick="openInlineStudio(null)">
              <i data-lucide="x" class="icon-xs"></i> Close
            </button>
          </div>

          <div style="display:flex; gap:0.35rem; flex-wrap:wrap; margin-bottom:0.65rem;">
            <span style="font-size:0.7rem; font-weight:700; color:var(--muted-foreground); align-self:center; margin-right:0.2rem;">1-Click Templates:</span>
            <button type="button" class="btn-tiny" onclick="window.loadDiagramPreset('flowchart')">🔀 Flowchart</button>
            <button type="button" class="btn-tiny" onclick="window.loadDiagramPreset('sequence')">🔄 Sequence Diagram</button>
            <button type="button" class="btn-tiny" onclick="window.loadDiagramPreset('mindmap')">🧠 Hierarchy Tree</button>
            <button type="button" class="btn-tiny" onclick="window.loadDiagramPreset('state')">⚡ State Machine</button>
            <button type="button" class="btn-tiny" onclick="window.loadDiagramPreset('er')">🗄️ Database ER</button>
          </div>

          <!-- Visual Quick Step Adder -->
          <div style="display:grid; grid-template-columns: 1fr 0.8fr 1fr auto; gap:0.4rem; align-items:center; background:#f8fafc; padding:0.5rem; border-radius:var(--radius-sm); border:1px solid var(--border); margin-bottom:0.65rem;">
            <input type="text" id="diag-from-node" class="form-input" style="height:1.75rem; font-size:0.75rem;" placeholder="From Node (e.g. Client)">
            <input type="text" id="diag-edge-label" class="form-input" style="height:1.75rem; font-size:0.75rem;" placeholder="Arrow Label (optional)">
            <input type="text" id="diag-to-node" class="form-input" style="height:1.75rem; font-size:0.75rem;" placeholder="To Node (e.g. API Server)">
            <button type="button" class="btn btn-secondary btn-compact" style="height:1.75rem !important;" onclick="window.addVisualDiagramConnection()">+ Add Connection</button>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.85rem; align-items:start;">
            <div>
              <textarea id="studio-diagram-code" class="form-textarea code-font" rows="7" style="font-size:0.78rem;" oninput="window.updateDiagramStudioPreview()">graph LR
  A[Start / Input] --> B{Decision}
  B -->|Yes| C[Process Data]
  B -->|No| D[Fallback]
  C --> E[Final Output]</textarea>
              <div style="display:flex; justify-content:flex-end; margin-top:0.5rem;">
                <button type="button" class="btn btn-primary btn-compact" onclick="window.commitDiagramStudioToNote()">
                  <i data-lucide="check" class="icon-xs"></i> Insert Diagram into Note
                </button>
              </div>
            </div>
            <div>
              <div style="font-size:0.68rem; font-weight:700; color:var(--muted-foreground); margin-bottom:0.25rem; text-transform:uppercase;">Live Diagram Preview</div>
              <div id="studio-diagram-preview" class="mermaid-diagram-box" style="margin:0; min-height:9rem;"></div>
            </div>
          </div>
        </div>
      `;
    }

    // 4. MATH FORMULA BUILDER STUDIO
    if (activeInlineStudio === 'math') {
      const symbols = [
        { label: '∑ Sum', code: '\\sum_{i=1}^{n} ' },
        { label: '∫ Integral', code: '\\int_{a}^{b} ' },
        { label: '√ Root', code: '\\sqrt{x} ' },
        { label: 'π Pi', code: '\\pi ' },
        { label: 'Δ Delta', code: '\\Delta ' },
        { label: 'α Alpha', code: '\\alpha ' },
        { label: 'β Beta', code: '\\beta ' },
        { label: 'σ Sigma', code: '\\sigma ' },
        { label: '∞ Infinity', code: '\\infty ' },
        { label: '≈ Approx', code: '\\approx ' },
        { label: '≠ Not Eq', code: '\\neq ' },
        { label: '≤ Less/Eq', code: '\\leq ' },
        { label: '≥ Greater/Eq', code: '\\geq ' },
        { label: '⇒ Implies', code: '\\Rightarrow ' },
        { label: 'x² Squared', code: '^2 ' }
      ];
      return `
        <div class="inline-studio-panel">
          <div class="inline-studio-header">
            <div style="display:flex; align-items:center; gap:0.45rem; font-weight:800; font-size:0.9rem; color:var(--primary);">
              <i data-lucide="sigma" class="icon-sm"></i>
              <span>Math Equation &amp; Formula Builder</span>
            </div>
            <button type="button" class="btn-tiny" onclick="openInlineStudio(null)">
              <i data-lucide="x" class="icon-xs"></i> Close
            </button>
          </div>
          <div style="display:flex; gap:0.3rem; flex-wrap:wrap; margin-bottom:0.6rem;">
            ${symbols.map(s => `
              <button type="button" class="btn-tiny" onclick="const inp=document.getElementById('studio-math-input'); inp.value += '${escapeJsAttr(s.code)}'; inp.focus();">${s.label}</button>
            `).join('')}
          </div>
          <div style="display:flex; gap:0.5rem;">
            <input type="text" id="studio-math-input" class="form-input code-font" value="NPV = \\sum CF_t / (1 + r)^t - C_0" placeholder="Type formula...">
            <button type="button" class="btn btn-primary btn-compact" onclick="const v=document.getElementById('studio-math-input').value.trim(); if(v){ window.insertSnippetIntoActiveNote('$$\\n' + v + '\\n$$', 'Math formula inserted!'); window.openInlineStudio(null); }">
              Insert Equation
            </button>
          </div>
        </div>
      `;
    }

    // 5. INLINE FLASHCARD & REFERENCE ADDER
    if (activeInlineStudio === 'flashcard') {
      return `
        <div class="inline-studio-panel">
          <div class="inline-studio-header">
            <div style="display:flex; align-items:center; gap:0.45rem; font-weight:800; font-size:0.9rem; color:#7c3aed;">
              <i data-lucide="sparkles" class="icon-sm"></i>
              <span>Add Flashcards &amp; Reference Links to Note</span>
            </div>
            <button type="button" class="btn-tiny" onclick="openInlineStudio(null)">
              <i data-lucide="x" class="icon-xs"></i> Close
            </button>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem;">
            <div>
              <div style="font-size:0.72rem; font-weight:700; margin-bottom:0.35rem;">✦ Add Active Recall Flashcard</div>
              <input type="text" id="inline-fc-q" class="form-input" style="height:1.85rem; font-size:0.8rem; margin-bottom:0.35rem;" placeholder="Question (Front of card)...">
              <input type="text" id="inline-fc-a" class="form-input" style="height:1.85rem; font-size:0.8rem; margin-bottom:0.45rem;" placeholder="Answer (Back of card)...">
              <button type="button" class="btn btn-primary btn-compact" onclick="window.addInlineFlashcard('${note.id}')">+ Save Flashcard</button>
            </div>
            <div>
              <div style="font-size:0.72rem; font-weight:700; margin-bottom:0.35rem;">🔗 Add Reference URL</div>
              <input type="text" id="inline-res-title" class="form-input" style="height:1.85rem; font-size:0.8rem; margin-bottom:0.35rem;" placeholder="Resource Title (e.g. Official Docs)...">
              <input type="url" id="inline-res-url" class="form-input" style="height:1.85rem; font-size:0.8rem; margin-bottom:0.45rem;" placeholder="https://...">
              <button type="button" class="btn btn-secondary btn-compact" onclick="window.addInlineResource('${note.id}')">+ Save Link</button>
            </div>
          </div>
        </div>
      `;
    }

    // 6. AI STUDY PROMPT & MARKDOWN INSTRUCTION GENERATOR STUDIO
    if (activeInlineStudio === 'ai') {
      const defaultTopic = `${note.subject ? note.subject.name + ' — ' : ''}${note.title || 'My Study Topic'}`;
      return `
        <div class="inline-studio-panel">
          <div class="inline-studio-header">
            <div style="display:flex; align-items:center; gap:0.45rem; font-weight:800; font-size:0.9rem; color:var(--primary);">
              <i data-lucide="bot" class="icon-sm"></i>
              <span>🤖 AI Study Material Generator — Export Instructions (.md)</span>
            </div>
            <button type="button" class="btn-tiny" onclick="openInlineStudio(null)">
              <i data-lucide="x" class="icon-xs"></i> Close
            </button>
          </div>

          <div style="font-size:0.78rem; color:var(--muted-foreground); margin-bottom:0.65rem;">
            Export or copy the official <strong>PassKeeper Study Hub Markdown Specification</strong>. Feed it to ChatGPT, Claude, or Gemini so the AI formats your study material with <strong>Interactive Charts, Mermaid Diagrams, Pinned Sections, Multi-Color Highlights, Cloze Blanks, and Math Formulas</strong> ready to paste directly here!
          </div>

          <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap; margin-bottom:0.65rem;">
            <input type="text" id="ai-studio-topic-input" class="form-input" style="flex:1; min-width:14rem; height:1.95rem; font-size:0.8rem;" value="${escapeHtml(defaultTopic)}" placeholder="Enter the topic you want the AI to teach you...">
            <button type="button" class="btn btn-primary btn-compact" style="height:1.95rem !important;" onclick="window.downloadAiInstructionsFile(document.getElementById('ai-studio-topic-input')?.value)">
              <i data-lucide="download" class="icon-xs"></i> Download AI Instructions (.md)
            </button>
            <button type="button" class="btn btn-secondary btn-compact" style="height:1.95rem !important;" onclick="window.copyAiInstructionsPrompt(document.getElementById('ai-studio-topic-input')?.value)">
              <i data-lucide="copy" class="icon-xs"></i> Copy Prompt for AI
            </button>
          </div>

          <div style="border-top:1px dashed var(--border); padding-top:0.65rem; margin-top:0.35rem;">
            <div style="font-size:0.72rem; font-weight:700; color:var(--foreground); margin-bottom:0.35rem;">📥 Paste AI Generated Content Here to Insert into Note:</div>
            <div style="display:flex; gap:0.5rem; align-items:flex-start;">
              <textarea id="ai-paste-response-input" class="form-textarea code-font" rows="3" style="font-size:0.76rem;" placeholder="Paste the Markdown output from ChatGPT / Claude / Gemini here..."></textarea>
              <button type="button" class="btn btn-primary btn-compact" onclick="const v=document.getElementById('ai-paste-response-input')?.value.trim(); if(v){ window.insertSnippetIntoActiveNote(v, 'AI study material inserted!'); window.openInlineStudio(null); }">
                Insert into Note
              </button>
            </div>
          </div>
        </div>
      `;
    }

    return '';
  }

  // ======================================================
  // AI MARKDOWN SPECIFICATION BUILDER & EXPORTER (.MD)
  // ======================================================
  function buildAiStudyPromptMarkdown(customTopic = '') {
    const activeNote = notesList.find(n => n.id === selectedNoteId);
    const activeSubj = activeNote?.subject || (subjectsData?.subjects || []).find(s => s.id === activeSubjectId);
    const topicStr = (customTopic && customTopic.trim())
      || (activeNote ? `${activeSubj ? activeSubj.name + ': ' : ''}${activeNote.title}` : '')
      || '[INSERT YOUR STUDY TOPIC HERE]';

    return `# PassKeeper Study Hub — AI Content Generation Specification

You are an expert educator and technical author. Generate comprehensive, high-retention study notes for the topic: **"${topicStr}"**.

Your response **MUST** be formatted in raw Markdown using the custom interactive elements supported by the **PassKeeper Study Hub** parser listed below so I can paste your output directly into my study workspace.

---

## 1. Custom Interactive Elements & Exact Syntax Rules

### A. Section Headings (Auto-Indexed in Study Outline)
Use \`##\` and \`###\` with clear, descriptive titles:
\`\`\`markdown
## 🎯 Core Concepts & Architecture
### 1. Fundamental Principles
\`\`\`

### B. Pinned Concept Blocks (Appears in Top Pin Bar, Cornell Cue Column & Master Digest)
To pin an essential definition, rule, or takeaway, use a single-line \`> [!PIN: Title]\` block:
\`\`\`markdown
> [!PIN: Core Definition] A concise 1-2 sentence explanation of the most important rule or definition.
> [!PIN: Exam Formula] Always verify boundary conditions before applying the rate equation.
\`\`\`
*(Important: Keep each \`> [!PIN: Title] text\` on a single line).*

### C. Multi-Color Semantic Highlights (Used by Summary / Cram Mode)
Wrap key phrases inside paragraphs or bullet points using these exact 4 color tags:
- \`==yellow:key point or main idea==\` (Yellow — Key Point)
- \`==green:exact definition, metric, or formula==\` (Green — Definition / Formula)
- \`==purple:important concept or mechanism==\` (Purple — Deep Concept)
- \`==pink:critical exam trap or warning==\` (Pink — Critical / Exam Focus)

### D. Active-Recall Cloze Fill-in-the-Blanks (Click-to-Reveal Pills)
Wrap key terms, numbers, or commands that the student should memorize inside double curly braces \`{{...}}\`:
\`\`\`markdown
- The default PostgreSQL port is {{5432}} and uses {{MVCC}} for concurrency control.
\`\`\`

### E. Interactive SVG Data Charts (\`\`\`chart)
Whenever comparing numbers, metrics, trends, or proportions, include a \`\`\`chart block.
- Supported \`type\` values: \`bar\`, \`line\`, \`area\`, \`pie\`, \`doughnut\`, \`hbar\`
- Format:
\`\`\`chart
type: bar
title: Performance / Metric Comparison
unit: %
Category A: 35
Category B: 68
Category C: 92
Category D: 48
\`\`\`

### F. Visual Mermaid Diagrams (\`\`\`mermaid)
Include at least one visual diagram (\`graph LR\`, \`graph TD\`, \`sequenceDiagram\`, \`stateDiagram-v2\`, or \`erDiagram\`) to illustrate workflows, relationships, or architecture:
\`\`\`mermaid
graph LR
  A[Input / Trigger] --> B{Condition Check}
  B -->|Valid| C[Execute Core Process]
  B -->|Invalid| D[Handle Exception]
  C --> E[Final Output]
\`\`\`

### G. Mathematical Formulas & Equations
- **Block Equations**: Wrap standalone formulas in \`$$ ... $$\`:
\`\`\`markdown
$$
NPV = \\sum_{t=1}^{n} CF_t / (1 + r)^t - C_0
$$
\`\`\`
- **Inline Math**: Wrap inline expressions in single \`$ ... $\` (e.g., $\\Delta x \\approx \\sigma^2$).
- Supported LaTeX tokens: \`\\sum\`, \`\\int\`, \`\\sqrt\`, \`\\pi\`, \`\\Delta\`, \`\\delta\`, \`\\alpha\`, \`\\beta\`, \`\\gamma\`, \`\\sigma\`, \`\\infty\`, \`\\approx\`, \`\\neq\`, \`\\leq\`, \`\\geq\`, \`\\times\`, \`\\div\`, \`\\pm\`, \`\\rightarrow\`, \`\\Rightarrow\`, \`^2\`, \`^3\`, \`^n\`.

### H. Callout Boxes, Comparison Tables, Code Blocks & Checklists
- **Callouts**: \`> 💡 **Key Insight:** ...\` or \`> ⚠️ **Common Mistake:** ...\`
- **Tables**: Standard Markdown tables (\`| Column 1 | Column 2 | Column 3 |\`)
- **Code Blocks**: Fenced code blocks (\`\`\`bash, \`\`\`sql, \`\`\`javascript, \`\`\`python, etc.)
- **Interactive Study Checklist**:
\`\`\`markdown
- [ ] Understand the difference between {{Concept A}} and {{Concept B}}
- [ ] Practice solving the core equation
\`\`\`
- **Cross-Note Wiki Links**: Link to related topics with \`[[Related Topic Name]]\`.

---

## 2. Required Structure for Your Response

Please output **ONLY** the raw Markdown content (inside a single markdown code block so I can copy-paste it in one click) containing:
1. **Overview & Pinned Core Concepts** (\`> [!PIN: ...]\` + \`==yellow:...==\` & \`==green:...==\` highlights)
2. **Visual Architecture / Workflow Diagram** (\`\`\`mermaid block)
3. **Deep-Dive Sections** with Cloze blanks (\`{{...}}\`), formulas (\`$$...$$\`), and code/examples
4. **Quantitative Data Chart** (\`\`\`chart block illustrating a key comparison, distribution, or trend)
5. **Summary Comparison Table** (\`| ... |\`)
6. **Active Recall Study Checklist** (\`- [ ] ...\`)

**Topic to generate now:** ${topicStr}
`;
  }

  window.downloadAiInstructionsFile = function(customTopic = '') {
    const md = buildAiStudyPromptMarkdown(customTopic);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'PassKeeper-Study-AI-Instructions.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Downloaded PassKeeper-Study-AI-Instructions.md!', 'success');
  };

  window.copyAiInstructionsPrompt = function(customTopic = '') {
    const md = buildAiStudyPromptMarkdown(customTopic);
    copyToClipboard(md, 'AI Study Instructions (.md)');
  };

  window.exportAiStudyInstructionsMd = function() {
    window.downloadAiInstructionsFile();
    window.copyAiInstructionsPrompt();
    const note = notesList.find(n => n.id === selectedNoteId);
    if (note && activeInlineStudio !== 'ai') {
      window.openInlineStudio('ai');
    }
  };

  // Chart Studio Helpers
  window.addChartStudioRow = function() {
    const container = document.getElementById('studio-chart-rows');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'chart-data-row';
    row.style.cssText = 'display:grid; grid-template-columns: 1.2fr 0.8fr auto; gap:0.35rem; align-items:center;';
    row.innerHTML = `
      <input type="text" class="form-input chart-row-label" style="height:1.75rem; font-size:0.76rem;" placeholder="Label" value="Item" oninput="window.updateChartStudioPreview()">
      <input type="number" step="any" class="form-input chart-row-val" style="height:1.75rem; font-size:0.76rem;" placeholder="Value" value="50" oninput="window.updateChartStudioPreview()">
      <button type="button" class="btn-icon" style="width:1.65rem; height:1.65rem; color:var(--destructive);" onclick="this.parentElement.remove(); window.updateChartStudioPreview();">
        <i data-lucide="x" class="icon-xs"></i>
      </button>
    `;
    container.appendChild(row);
    if (window.lucide) lucide.createIcons();
    window.updateChartStudioPreview();
  };

  function buildChartMarkdownFromStudio() {
    const title = document.getElementById('studio-chart-title')?.value.trim() || 'Study Chart';
    const type = document.getElementById('studio-chart-type')?.value || 'bar';
    const unit = document.getElementById('studio-chart-unit')?.value.trim() || '';
    const pairs = [];
    document.querySelectorAll('#studio-chart-rows .chart-data-row').forEach(r => {
      const k = r.querySelector('.chart-row-label')?.value.trim();
      const v = r.querySelector('.chart-row-val')?.value.trim();
      if (k && v !== '' && !isNaN(Number(v))) {
        pairs.push(`${k}: ${Number(v)}`);
      }
    });
    return `type: ${type}\ntitle: ${title}${unit ? `\nunit: ${unit}` : ''}\n${pairs.join('\n')}`;
  }

  window.updateChartStudioPreview = function() {
    const preview = document.getElementById('studio-chart-live-preview');
    if (!preview) return;
    const raw = buildChartMarkdownFromStudio();
    preview.innerHTML = renderSvgChartHtml(raw, -1, '');
    if (window.lucide) lucide.createIcons();
  };

  window.commitChartStudioToNote = async function(noteId) {
    const raw = buildChartMarkdownFromStudio();
    const block = `\`\`\`chart\n${raw}\n\`\`\``;
    const note = notesList.find(n => n.id === noteId);
    if (!note) return;

    if (editingChartIdx >= 0 && chartsRegistry[editingChartIdx]) {
      const updated = (note.content || '').replace(chartsRegistry[editingChartIdx].rawBlock, block);
      activeInlineStudio = null;
      editingChartIdx = -1;
      await saveNoteContentDirectly(noteId, updated, 'Chart updated!');
    } else {
      activeInlineStudio = null;
      editingChartIdx = -1;
      await window.insertSnippetIntoActiveNote(block, 'Chart inserted into note!');
    }
  };

  // Diagram Studio Helpers
  window.loadDiagramPreset = function(preset) {
    const ta = document.getElementById('studio-diagram-code');
    if (!ta) return;
    const presets = {
      flowchart: `graph LR\n  A[Start] --> B{Valid?}\n  B -->|Yes| C[Execute Action]\n  B -->|No| D[Log Error]\n  C --> E[Success]`,
      sequence: `sequenceDiagram\n  participant User\n  participant API\n  participant DB\n  User->>API: POST /request\n  API->>DB: Query Data\n  DB-->>API: Return Rows\n  API-->>User: 200 OK JSON`,
      mindmap: `graph TD\n  Root[Core Topic] --> B1[Branch 1: Theory]\n  Root --> B2[Branch 2: Formulas]\n  Root --> B3[Branch 3: Case Studies]\n  B1 --> C1[Key Principle]\n  B2 --> C2[Equation]`,
      state: `stateDiagram-v2\n  [*] --> Idle\n  Idle --> Processing : Start\n  Processing --> Completed : Success\n  Processing --> Failed : Error\n  Completed --> [*]`,
      er: `erDiagram\n  STUDY_SUBJECT ||--o{ STUDY_NOTE : contains\n  USER ||--o{ STUDY_SUBJECT : owns`
    };
    ta.value = presets[preset] || presets.flowchart;
    window.updateDiagramStudioPreview();
  };

  window.addVisualDiagramConnection = function() {
    const fromEl = document.getElementById('diag-from-node');
    const edgeEl = document.getElementById('diag-edge-label');
    const toEl = document.getElementById('diag-to-node');
    const ta = document.getElementById('studio-diagram-code');
    if (!fromEl || !toEl || !ta) return;
    const f = fromEl.value.trim();
    const t = toEl.value.trim();
    const lbl = edgeEl?.value.trim();
    if (!f || !t) return;
    const fId = f.replace(/[^a-zA-Z0-9]/g, '') || 'N1';
    const tId = t.replace(/[^a-zA-Z0-9]/g, '') || 'N2';
    const line = lbl ? `  ${fId}[${f}] -->|${lbl}| ${tId}[${t}]` : `  ${fId}[${f}] --> ${tId}[${t}]`;
    ta.value = `${ta.value.trimEnd()}\n${line}`;
    fromEl.value = '';
    if (edgeEl) edgeEl.value = '';
    toEl.value = '';
    window.updateDiagramStudioPreview();
  };

  window.updateDiagramStudioPreview = function() {
    const ta = document.getElementById('studio-diagram-code');
    const prev = document.getElementById('studio-diagram-preview');
    if (!ta || !prev) return;
    prev.innerHTML = `<pre class="mermaid">${escapeHtml(ta.value.trim())}</pre>`;
    runMermaidDiagrams();
  };

  window.commitDiagramStudioToNote = async function() {
    const ta = document.getElementById('studio-diagram-code');
    if (!ta || !ta.value.trim()) return;
    const block = `\`\`\`mermaid\n${ta.value.trim()}\n\`\`\``;
    activeInlineStudio = null;
    await window.insertSnippetIntoActiveNote(block, 'Diagram inserted into note!');
  };

  // Interactive Whiteboard Sketchpad Engine
  let wbTool = 'pen';
  let wbColor = '#4f46e5';
  let wbHistory = [];

  window.setWbTool = function(tool, btnEl) {
    wbTool = tool;
    document.querySelectorAll('.wb-tool-btn[data-wb-tool]').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
  };

  window.setWbColor = function(col, btnEl) {
    wbColor = col;
    if (btnEl && btnEl.parentElement) {
      btnEl.parentElement.querySelectorAll('.sel-color-dot').forEach(d => { d.style.borderColor = 'transparent'; });
      btnEl.style.borderColor = '#111827';
    }
  };

  function initWhiteboardCanvas() {
    const canvas = document.getElementById('study-whiteboard-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    wbHistory = [];

    // Fill white background so exported PNG is crisp
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    wbHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));

    let drawing = false;
    let startX = 0;
    let startY = 0;
    let snapshot = null;

    function getCoords(e) {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) * (canvas.width / rect.width),
        y: (clientY - rect.top) * (canvas.height / rect.height)
      };
    }

    function drawArrowhead(context, fromX, fromY, toX, toY) {
      const headLen = 12;
      const angle = Math.atan2(toY - fromY, toX - fromX);
      context.beginPath();
      context.moveTo(toX, toY);
      context.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
      context.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
      context.closePath();
      context.fillStyle = wbColor;
      context.fill();
    }

    canvas.onpointerdown = (e) => {
      const pt = getCoords(e);
      if (wbTool === 'text') {
        const label = prompt('Enter label or text for diagram:');
        if (label && label.trim()) {
          ctx.font = 'bold 15px Inter, sans-serif';
          ctx.fillStyle = wbColor;
          ctx.fillText(label.trim(), pt.x, pt.y);
          wbHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
        }
        return;
      }

      drawing = true;
      startX = pt.x;
      startY = pt.y;
      snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);

      if (wbTool === 'pen' || wbTool === 'eraser') {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
      }
    };

    canvas.onpointermove = (e) => {
      if (!drawing) return;
      const pt = getCoords(e);

      if (wbTool === 'pen' || wbTool === 'eraser') {
        ctx.strokeStyle = wbTool === 'eraser' ? '#ffffff' : wbColor;
        ctx.lineWidth = wbTool === 'eraser' ? 18 : 2.8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
        return;
      }

      ctx.putImageData(snapshot, 0, 0);
      ctx.strokeStyle = wbColor;
      ctx.lineWidth = 2.5;

      if (wbTool === 'line' || wbTool === 'arrow') {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
        if (wbTool === 'arrow') drawArrowhead(ctx, startX, startY, pt.x, pt.y);
      } else if (wbTool === 'rect') {
        ctx.fillStyle = `${wbColor}14`;
        ctx.fillRect(startX, startY, pt.x - startX, pt.y - startY);
        ctx.strokeRect(startX, startY, pt.x - startX, pt.y - startY);
      } else if (wbTool === 'circle') {
        const rx = Math.abs(pt.x - startX) / 2;
        const ry = Math.abs(pt.y - startY) / 2;
        const cx = (startX + pt.x) / 2;
        const cy = (startY + pt.y) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = `${wbColor}14`;
        ctx.fill();
        ctx.stroke();
      } else if (wbTool === 'diamond') {
        const mx = (startX + pt.x) / 2;
        const my = (startY + pt.y) / 2;
        ctx.beginPath();
        ctx.moveTo(mx, startY);
        ctx.lineTo(pt.x, my);
        ctx.lineTo(mx, pt.y);
        ctx.lineTo(startX, my);
        ctx.closePath();
        ctx.fillStyle = `${wbColor}14`;
        ctx.fill();
        ctx.stroke();
      }
    };

    canvas.onpointerup = () => {
      if (!drawing) return;
      drawing = false;
      wbHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
  }

  window.undoWhiteboard = function() {
    const canvas = document.getElementById('study-whiteboard-canvas');
    if (!canvas || wbHistory.length <= 1) return;
    wbHistory.pop();
    const ctx = canvas.getContext('2d');
    ctx.putImageData(wbHistory[wbHistory.length - 1], 0, 0);
  };

  window.clearWhiteboard = function() {
    const canvas = document.getElementById('study-whiteboard-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    wbHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  };

  window.insertWhiteboardIntoNote = async function() {
    const canvas = document.getElementById('study-whiteboard-canvas');
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    activeInlineStudio = null;
    await window.insertSnippetIntoActiveNote(`![Diagram Sketch](${dataUrl})`, 'Whiteboard diagram inserted into note!');
  };

  // Inline Flashcard & Resource Adders
  window.addInlineFlashcard = async function(noteId) {
    const qEl = document.getElementById('inline-fc-q');
    const aEl = document.getElementById('inline-fc-a');
    const note = notesList.find(n => n.id === noteId);
    if (!qEl || !aEl || !note) return;
    const q = qEl.value.trim();
    const a = aEl.value.trim();
    if (!q || !a) {
      showToast('Enter both Question and Answer.', 'info');
      return;
    }
    const updated = [...(note.takeaways || []), { question: q, answer: a, interval: 0, ease: 2.5, reps: 0, nextReview: null }];
    try {
      const res = await apiRequest(`/api/study/notes/${noteId}`, { method: 'PUT', body: { takeaways: updated } });
      note.takeaways = res.note.takeaways;
      qEl.value = '';
      aEl.value = '';
      showToast('Flashcard added to note!', 'success');
      await loadSubjects();
      renderReaderPane(note);
      renderNotesList();
    } catch (e) {}
  };

  window.deleteInlineFlashcard = async function(noteId, idx) {
    const note = notesList.find(n => n.id === noteId);
    if (!note || !Array.isArray(note.takeaways)) return;
    const updated = note.takeaways.filter((_, i) => i !== idx);
    try {
      const res = await apiRequest(`/api/study/notes/${noteId}`, { method: 'PUT', body: { takeaways: updated } });
      note.takeaways = res.note.takeaways;
      showToast('Flashcard removed', 'info');
      await loadSubjects();
      renderReaderPane(note);
      renderNotesList();
    } catch (e) {}
  };

  window.addInlineResource = async function(noteId) {
    const tEl = document.getElementById('inline-res-title');
    const uEl = document.getElementById('inline-res-url');
    const note = notesList.find(n => n.id === noteId);
    if (!uEl || !note) return;
    const u = uEl.value.trim();
    const t = tEl?.value.trim() || u;
    if (!u) return;
    const updated = [...(note.resources || []), { title: t, url: u }];
    try {
      const res = await apiRequest(`/api/study/notes/${noteId}`, { method: 'PUT', body: { resources: updated } });
      note.resources = res.note.resources;
      if (tEl) tEl.value = '';
      uEl.value = '';
      showToast('Reference link added!', 'success');
      renderReaderPane(note);
    } catch (e) {}
  };

  // ======================================================
  // RENDER EXPANSIVE READER PANE WITH DIRECT WRITING, ELEMENT MENU, CHARTS & WHITEBOARD
  // ======================================================
  function renderEmptyReaderPane() {
    if (!readerPaneEl) return;
    readerPaneEl.innerHTML = `
      <div style="margin:auto; padding:3rem 1.5rem; text-align:center; max-width:26rem;">
        <div style="width:3rem; height:3rem; border-radius:var(--radius-lg); background:var(--secondary); color:var(--primary); display:flex; align-items:center; justify-content:center; margin:0 auto 0.875rem auto;">
          <i data-lucide="graduation-cap" class="icon-lg"></i>
        </div>
        <h3 style="font-size:1rem; margin-bottom:0.35rem;">Interactive Study Studio</h3>
        <p style="font-size:0.8rem; margin-bottom:1.125rem;">
          Create a note and write directly inside the study canvas — insert charts, sketch diagrams, pin sections, and build flashcards without any popup dialogs.
        </p>
        <button class="btn btn-primary" onclick="openStudyNoteModal()">
          <i data-lucide="plus" class="icon-xs"></i>
          <span>Start Writing New Note</span>
        </button>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }

  function renderReaderPane(note) {
    if (!readerPaneEl || !note) return;

    syncReadModeClasses();

    const subjects = (subjectsData && subjectsData.subjects) || [];
    const takeaways = note.takeaways || [];
    const resources = note.resources || [];
    const tags = note.tags || [];

    const renderedArticleHtml = renderMarkdown(note.content, note.id);
    const inlineStudioHtml = renderInlineStudioHtml(note);

    const hasPinsOrHeadings = pinnedSectionsRegistry.length > 0 || headingsOutlineRegistry.length > 0;
    const pinsAndOutlineHtml = hasPinsOrHeadings ? `
      <div class="reader-pins-strip">
        ${pinnedSectionsRegistry.length > 0 ? `
          <span style="font-size:0.65rem; font-weight:800; text-transform:uppercase; color:#b45309; display:inline-flex; align-items:center; gap:0.2rem; margin-right:0.15rem;">
            <i data-lucide="pin" class="icon-xs"></i> Pinned:
          </span>
          ${pinnedSectionsRegistry.map(p => `
            <button type="button" class="reader-pin-chip" onclick="window.scrollToReaderSection('${p.id}')">
              <span>📌 ${escapeHtml(p.title)}</span>
            </button>
          `).join('')}
        ` : ''}

        ${headingsOutlineRegistry.length > 0 ? `
          <span style="font-size:0.65rem; font-weight:700; text-transform:uppercase; color:var(--muted-foreground); margin-left:${pinnedSectionsRegistry.length > 0 ? '0.5rem' : '0'};">
            Sections:
          </span>
          ${headingsOutlineRegistry.map(h => `
            <button type="button" class="toc-jump-chip" onclick="window.scrollToReaderSection('${h.id}')">
              ${escapeHtml(h.title)}
            </button>
          `).join('')}
        ` : ''}
      </div>
    ` : '';

    // ======================================================
    // PRACTICAL DISTRACTION-FREE READ MODE VIEW (PHONE & PC)
    // ======================================================
    if (isReadMode) {
      const wordCount = (note.content || '').trim().split(/\s+/).filter(Boolean).length;
      const readMins = Math.max(1, Math.ceil(wordCount / 190));
      const curNoteIdx = notesList.findIndex(n => n.id === note.id);
      const prevNote = notesList.length > 1 ? notesList[(curNoteIdx - 1 + notesList.length) % notesList.length] : null;
      const nextNote = notesList.length > 1 ? notesList[(curNoteIdx + 1) % notesList.length] : null;

      readerPaneEl.innerHTML = `
        <div class="read-progress-track">
          <div id="read-progress-fill" class="read-progress-fill"></div>
        </div>

        <header class="read-mode-topbar">
          <div style="display:flex; align-items:center; gap:0.35rem; flex:1; min-width:0; overflow:hidden;">
            <!-- Hamburger Menu Button for Outline, Studies, Lessons & Settings -->
            <button type="button" id="read-toc-toggle-btn" class="read-ctrl-pill ${isReadTocOpen ? 'active' : ''}" onclick="window.toggleReadModeToc()" title="Toggle Navigation & Reading Menu">
              <i data-lucide="menu" class="icon-xs"></i>
              <span class="read-desktop-only">Outline (${headingsOutlineRegistry.length + pinnedSectionsRegistry.length})</span>
            </button>

            <button type="button" class="read-ctrl-pill" onclick="window.toggleReadMode(false)" title="Exit Read Mode (Esc)">
              <i data-lucide="arrow-left" class="icon-xs"></i>
              <span class="read-desktop-only">Exit</span>
            </button>

            <!-- Quick Study Subject Switcher (Desktop Topbar; inside Hamburger on Small Screens) -->
            <select class="read-mode-select read-desktop-only" onchange="window.switchStudyInReadMode(this.value)" title="Switch Study Subject">
              <option value="ALL" ${activeSubjectId === 'ALL' ? 'selected' : ''}>📚 All Studies (${subjectsData?.totalNotes || notesList.length})</option>
              ${subjects.map(s => `
                <option value="${s.id}" ${activeSubjectId === s.id ? 'selected' : ''}>🎓 ${escapeHtml(s.name)} (${s.noteCount || 0})</option>
              `).join('')}
            </select>

            <!-- Quick Note / Lesson Switcher in Read Mode -->
            <select class="read-mode-select" style="flex:1; max-width:16rem; min-width:5rem; font-weight:700;" onchange="window.selectStudyNote(this.value)" title="Jump to Note / Lesson">
              ${notesList.map((n, i) => `
                <option value="${n.id}" ${n.id === note.id ? 'selected' : ''}>
                  #${i + 1} ${escapeHtml(n.title)}${n.chapter ? ` (${escapeHtml(n.chapter)})` : ''}
                </option>
              `).join('')}
            </select>

            <span style="font-size:0.7rem; opacity:0.75; font-weight:600; flex-shrink:0;" class="read-desktop-only">
              ⏱ ~${readMins}m
            </span>
          </div>

          <div class="read-mode-controls">
            <!-- Font Size Controls (Always accessible) -->
            <button type="button" class="read-ctrl-pill" onclick="window.stepReadFontSize(-1)" title="Smaller Text">A-</button>
            <button type="button" class="read-ctrl-pill" onclick="window.stepReadFontSize(1)" title="Larger Text">A+</button>

            <!-- Reading Theme Switcher (Desktop Topbar; inside Hamburger on Small Screens) -->
            <button type="button" class="read-ctrl-pill read-desktop-only ${readTheme === 'light' ? 'active' : ''}" onclick="window.setReadTheme('light')" title="Paper White Theme">☀️</button>
            <button type="button" class="read-ctrl-pill read-desktop-only ${readTheme === 'sepia' ? 'active' : ''}" onclick="window.setReadTheme('sepia')" title="Warm Book Sepia Theme">📜 Sepia</button>
            <button type="button" class="read-ctrl-pill read-desktop-only ${readTheme === 'dark' ? 'active' : ''}" onclick="window.setReadTheme('dark')" title="Night Dark Theme">🌙 Night</button>

            <!-- Active Recall Toggles (Desktop Topbar; inside Hamburger on Small Screens) -->
            <button type="button" class="read-ctrl-pill read-desktop-only ${isSummaryMode ? 'active' : ''}" onclick="window.toggleSummaryMode()" title="Show Only Highlights & Pinned Concepts">
              🎯 Summary
            </button>
            ${currentNoteClozeCount > 0 ? `
              <button type="button" id="reveal-clozes-btn" class="read-ctrl-pill read-desktop-only ${revealAllClozes ? 'active' : ''}" onclick="window.toggleRevealAllClozes()">
                🔒 Clozes
              </button>
            ` : ''}
            ${takeaways.length > 0 ? `
              <button type="button" class="read-ctrl-pill read-desktop-only" onclick="window.openFlashcardDeck('${note.id}')">
                ✦ Cards (${takeaways.length})
              </button>
            ` : ''}
          </div>
        </header>

        <div id="read-mode-body-split" class="read-mode-body-split ${isReadTocOpen ? '' : 'toc-collapsed'}">
          <!-- Backdrop for Small Screen Hamburger Drawer -->
          <div class="read-mode-drawer-backdrop" onclick="window.toggleReadModeToc(false)"></div>

          <!-- Left Hamburger Drawer / Sticky Book Table of Contents & Settings Sidebar -->
          <aside class="read-mode-toc-sidebar">
            <div style="display:flex; align-items:center; justify-content:space-between; padding-bottom:0.5rem; border-bottom:1px solid rgba(128,128,128,0.2);">
              <span style="font-size:0.75rem; font-weight:800; display:flex; align-items:center; gap:0.35rem;">
                <i data-lucide="book-open-check" class="icon-xs"></i>
                <span>Reading Menu &amp; Outline</span>
              </span>
              <button type="button" class="read-ctrl-pill" style="height:1.5rem; padding:0 0.4rem;" onclick="window.toggleReadModeToc(false)" title="Close Menu">
                <i data-lucide="x" class="icon-xs"></i>
              </button>
            </div>

            <!-- Compact Reading Settings & Study Switcher (Always in Hamburger Menu for Small Screens) -->
            <div class="read-drawer-settings-box">
              <div class="read-toc-group-title" style="padding:0;">
                <span>⚙️ Study &amp; Display Settings</span>
              </div>

              <select class="read-mode-select" style="width:100%; max-width:none; margin-bottom:0.35rem;" onchange="window.switchStudyInReadMode(this.value)">
                <option value="ALL" ${activeSubjectId === 'ALL' ? 'selected' : ''}>📚 All Studies (${subjectsData?.totalNotes || notesList.length})</option>
                ${subjects.map(s => `
                  <option value="${s.id}" ${activeSubjectId === s.id ? 'selected' : ''}>🎓 ${escapeHtml(s.name)} (${s.noteCount || 0})</option>
                `).join('')}
              </select>

              <div style="display:flex; gap:0.25rem; flex-wrap:wrap; margin-bottom:0.35rem;">
                <button type="button" class="read-ctrl-pill ${readTheme === 'light' ? 'active' : ''}" style="flex:1; justify-content:center;" onclick="window.setReadTheme('light')">☀️ Light</button>
                <button type="button" class="read-ctrl-pill ${readTheme === 'sepia' ? 'active' : ''}" style="flex:1; justify-content:center;" onclick="window.setReadTheme('sepia')">📜 Sepia</button>
                <button type="button" class="read-ctrl-pill ${readTheme === 'dark' ? 'active' : ''}" style="flex:1; justify-content:center;" onclick="window.setReadTheme('dark')">🌙 Night</button>
              </div>

              <div style="display:flex; gap:0.25rem; flex-wrap:wrap;">
                <button type="button" class="read-ctrl-pill" style="flex:1; justify-content:center;" onclick="window.stepReadFontSize(-1)">A- Smaller</button>
                <button type="button" class="read-ctrl-pill" style="flex:1; justify-content:center;" onclick="window.stepReadFontSize(1)">A+ Larger</button>
                <button type="button" class="read-ctrl-pill ${isSummaryMode ? 'active' : ''}" style="flex:1; justify-content:center;" onclick="window.toggleSummaryMode()">🎯 Summary</button>
                ${currentNoteClozeCount > 0 ? `
                  <button type="button" class="read-ctrl-pill ${revealAllClozes ? 'active' : ''}" style="flex:1; justify-content:center;" onclick="window.toggleRevealAllClozes()">🔒 Clozes</button>
                ` : ''}
                ${takeaways.length > 0 ? `
                  <button type="button" class="read-ctrl-pill" style="flex:1; justify-content:center;" onclick="window.openFlashcardDeck('${note.id}')">✦ Cards (${takeaways.length})</button>
                ` : ''}
              </div>
            </div>

            ${notesList.length > 1 ? `
              <div>
                <div class="read-toc-group-title">
                  <span>📖 Lessons (${notesList.length})</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:0.15rem;">
                  ${notesList.map((n, i) => `
                    <button type="button" class="read-toc-item ${n.id === note.id ? 'active' : ''}" onclick="window.selectStudyNote('${n.id}')">
                      <span style="font-size:0.65rem; opacity:0.75; flex-shrink:0;">#${i + 1}</span>
                      <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(n.title)}</span>
                    </button>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            ${pinnedSectionsRegistry.length > 0 ? `
              <div>
                <div class="read-toc-group-title">
                  <span>📌 Pinned Concepts (${pinnedSectionsRegistry.length})</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:0.15rem;">
                  ${pinnedSectionsRegistry.map(p => `
                    <button type="button" class="read-toc-item" onclick="window.jumpToReadSection('${p.id}')">
                      <span style="color:#f59e0b; flex-shrink:0;">📌</span>
                      <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(p.title)}</span>
                    </button>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            ${headingsOutlineRegistry.length > 0 ? `
              <div>
                <div class="read-toc-group-title">
                  <span>📑 Sections (${headingsOutlineRegistry.length})</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:0.12rem;">
                  ${headingsOutlineRegistry.map(h => `
                    <button type="button" class="read-toc-item ${h.level === 3 ? 'level-3' : ''}" onclick="window.jumpToReadSection('${h.id}')">
                      <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(h.title)}</span>
                    </button>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </aside>

          <!-- Right Clean Book Reading Canvas -->
          <div id="read-mode-scroll-canvas" class="read-mode-canvas" onscroll="window.updateReadModeScrollProgress(this)">
            <div class="read-mode-book-column">
              <div class="read-mode-meta-kicker">
                <span>${escapeHtml(note.subject ? note.subject.name : 'General Study')}</span>
                ${note.chapter ? `<span>• 📂 ${escapeHtml(note.chapter)}</span>` : ''}
                <span>• ⏱ ${readMins} min read</span>
              </div>

              <h1 class="read-mode-book-title">${escapeHtml(note.title)}</h1>
              ${note.summary ? `<div class="read-mode-book-summary">${escapeHtml(note.summary)}</div>` : '<div style="margin-bottom:1.25rem;"></div>'}

              <article class="markdown-content ${isSummaryMode ? 'summary-mode-active' : ''} ${revealAllClozes ? 'reveal-all-clozes' : ''}">
                ${renderedArticleHtml}
              </article>

              ${takeaways.length > 0 ? `
                <section class="study-section-box" style="margin-top:2rem;">
                  <div class="study-section-title">
                    <span>✦ Self-Test Flashcards (${takeaways.length})</span>
                    <button type="button" class="read-ctrl-pill" onclick="openFlashcardDeck('${note.id}')">Practice Deck</button>
                  </div>
                  <div>
                    ${takeaways.map((card, idx) => `
                      <div class="takeaway-item">
                        <div class="takeaway-q" onclick="const ans = this.nextElementSibling; ans.style.display = ans.style.display === 'none' ? 'block' : 'none';">
                          <span><strong>Q${idx + 1}:</strong> ${escapeHtml(card.question)}</span>
                          <span class="badge badge-USER" style="font-size:0.6rem;">Tap for Answer</span>
                        </div>
                        <div class="takeaway-a" style="display:none;">
                          ${escapeHtml(card.answer)}
                        </div>
                      </div>
                    `).join('')}
                  </div>
                </section>
              ` : ''}

              ${notesList.length > 1 ? `
                <div class="read-mode-nav-footer">
                  <button type="button" class="read-ctrl-pill" style="height:2.2rem; padding:0 0.85rem;" onclick="window.navigateReadModeNote(-1)">
                    <i data-lucide="chevron-left" class="icon-xs"></i>
                    <span>Prev: ${escapeHtml((prevNote?.title || '').slice(0, 26))}</span>
                  </button>
                  <span style="font-size:0.72rem; opacity:0.7; font-weight:700;">${curNoteIdx + 1} / ${notesList.length}</span>
                  <button type="button" class="read-ctrl-pill" style="height:2.2rem; padding:0 0.85rem;" onclick="window.navigateReadModeNote(1)">
                    <span>Next: ${escapeHtml((nextNote?.title || '').slice(0, 26))}</span>
                    <i data-lucide="chevron-right" class="icon-xs"></i>
                  </button>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      `;

      if (window.lucide) lucide.createIcons();
      runMermaidDiagrams();
      return;
    }

    readerPaneEl.innerHTML = `
      <!-- Small-Screen Compact Reader Bar (with Hamburger Menu for Edit/Tools) -->
      <div class="mobile-reader-compact-bar">
        <button type="button" class="btn-tiny" onclick="closeMobileReader()">
          <i data-lucide="arrow-left" class="icon-xs"></i>
          <span>Notes</span>
        </button>

        <select class="form-select" style="flex:1; min-width:0; height:1.65rem; font-size:0.74rem; padding:0 0.45rem; font-weight:700;" onchange="window.selectStudyNote(this.value)">
          ${notesList.map((n, i) => `
            <option value="${n.id}" ${n.id === note.id ? 'selected' : ''}>#${i + 1} ${escapeHtml(n.title)}</option>
          `).join('')}
        </select>

        <button type="button" class="btn-tiny" style="background:#eef2ff; border-color:#a5b4fc; color:var(--primary); font-weight:700;" onclick="window.toggleReadMode(true)">
          <i data-lucide="book-open-check" class="icon-xs"></i>
          <span>Read</span>
        </button>

        <button type="button" id="mobile-reader-hamburger-btn" class="btn-tiny ${isMobileReaderToolsOpen ? 'active' : ''}" onclick="window.toggleMobileReaderTools()" title="Toggle Edit & Study Tools Menu">
          <i data-lucide="menu" class="icon-xs"></i>
          <span>Tools</span>
        </button>
      </div>

      <div id="reader-collapsible-tools" class="reader-collapsible-tools ${isMobileReaderToolsOpen ? 'mobile-tools-open' : ''}">
        <div class="reader-header">
          <div class="reader-top-bar">
            <!-- Direct Inline Metadata Controls (Subject, Mastery, Chapter, Tags) -->
            <div style="display:flex; align-items:center; gap:0.35rem; flex-wrap:wrap;">
              <select class="form-select" style="width:auto; max-width:11rem; height:1.6rem; font-size:0.72rem; padding:0 0.45rem; font-weight:700;" onchange="window.quickUpdateHeaderMeta('${note.id}', 'subjectId', this.value)" title="Assign Study Subject">
                <option value="">📚 General Notes</option>
                ${subjects.map(s => `
                  <option value="${s.id}" ${note.subjectId === s.id ? 'selected' : ''}>🎓 ${escapeHtml(s.name)}</option>
                `).join('')}
              </select>

              <select class="form-select" style="width:auto; height:1.6rem; font-size:0.72rem; padding:0 0.45rem; font-weight:700;" onchange="quickUpdateMastery('${note.id}', this.value)" title="Mastery Status">
                <option value="NEW" ${note.mastery === 'NEW' ? 'selected' : ''}>🟣 New Topic</option>
                <option value="LEARNING" ${note.mastery === 'LEARNING' ? 'selected' : ''}>🔵 In Progress</option>
                <option value="REVIEW" ${note.mastery === 'REVIEW' ? 'selected' : ''}>🟠 Needs Review</option>
                <option value="MASTERED" ${note.mastery === 'MASTERED' ? 'selected' : ''}>🟢 Mastered</option>
              </select>

              <input type="text" id="inline-note-chapter" list="chapter-suggestions" class="inline-meta-input" style="width:8.5rem;" placeholder="📂 Chapter / Module..." value="${escapeHtml(note.chapter || '')}" onblur="window.quickUpdateHeaderMeta('${note.id}', 'chapter', this.value)" onkeydown="if(event.key==='Enter'){this.blur();}" title="Group under a Chapter / Module">

              <input type="text" class="inline-meta-input" style="width:8.5rem;" placeholder="# tags (comma sep)" value="${escapeHtml(tags.join(', '))}" onblur="window.quickUpdateHeaderMeta('${note.id}', 'tags', this.value)" onkeydown="if(event.key==='Enter'){this.blur();}" title="Tags (comma separated)">
            </div>

            <!-- Canvas Mode Switcher & Note Actions -->
            <div class="reader-actions-group">
              <button type="button" class="btn btn-secondary btn-compact" style="height:1.65rem !important; background:#eef2ff; border-color:#a5b4fc; color:var(--primary);" onclick="window.toggleReadMode(true)" title="Open Distraction-Free Practical Read Mode (Phone & PC)">
                <i data-lucide="book-open-check" class="icon-xs"></i>
                <span>📖 Read Mode</span>
              </button>

              <div class="canvas-mode-switcher" role="tablist">
                <button type="button" class="canvas-mode-btn ${canvasMode === 'study' ? 'active' : ''}" onclick="window.setCanvasMode('study')" title="Interactive Study & Reader View">
                  <i data-lucide="book-open" class="icon-xs"></i> Study
                </button>
                <button type="button" class="canvas-mode-btn ${canvasMode === 'split' ? 'active' : ''}" onclick="window.setCanvasMode('split')" title="Side-by-Side Live Editor + Study Canvas">
                  <i data-lucide="columns" class="icon-xs"></i> Split Studio
                </button>
                <button type="button" class="canvas-mode-btn ${canvasMode === 'write' ? 'active' : ''}" onclick="window.setCanvasMode('write')" title="Full Direct Writing Canvas">
                  <i data-lucide="pen-line" class="icon-xs"></i> Write
                </button>
              </div>

              <button type="button" class="btn-tiny ${isCornellMode ? 'cornell-active' : ''}" onclick="toggleCornellMode()" title="Toggle Cornell Note-Taking Split Layout">
                <span>${isCornellMode ? '📐 Cornell ON' : '📐 Cornell'}</span>
              </button>

              <button type="button" class="btn-tiny ${isSummaryMode ? 'summary-active' : ''}" onclick="toggleSummaryMode()" title="Toggle Summary Mode (shows only Pinned Sections & Highlights)">
                <span>${isSummaryMode ? '🎯 Summary ON' : '🎯 Summary'}</span>
              </button>

              ${currentNoteClozeCount > 0 ? `
                <button type="button" id="reveal-clozes-btn" class="btn-tiny" onclick="toggleRevealAllClozes()">
                  <i data-lucide="${revealAllClozes ? 'eye-off' : 'eye'}" class="icon-xs"></i>
                  <span>${revealAllClozes ? 'Hide Clozes' : 'Clozes'}</span>
                </button>
              ` : ''}

              <button type="button" class="btn-tiny" style="${note.pinned ? 'color:#b45309; border-color:#fde68a; background:#fffbeb;' : ''}" onclick="togglePinNote('${note.id}')" title="Pin Note">
                <i data-lucide="pin" class="icon-xs"></i>
              </button>
              <button type="button" class="btn-tiny" onclick="exportNoteMarkdown('${note.id}')" title="Download .md file">
                <i data-lucide="download" class="icon-xs"></i> .md
              </button>
              <button type="button" class="btn btn-danger btn-compact" style="height:1.6rem !important; padding:0 0.45rem !important;" onclick="deleteStudyNoteConfirm('${note.id}')" title="Delete Note">
                <i data-lucide="trash-2" class="icon-xs"></i>
              </button>
            </div>
          </div>

          <!-- Direct Editable Title & Subtitle right in the Study Workspace -->
          <div class="reader-title-row" style="margin-top:0.15rem;">
            <div style="flex:1; min-width:0;">
              <input type="text" id="inline-note-title" class="inline-title-input" value="${escapeHtml(note.title)}" placeholder="Note / Lesson Title..." onblur="window.quickUpdateHeaderMeta('${note.id}', 'title', this.value)" onkeydown="if(event.key==='Enter'){this.blur();}">
              <input type="text" id="inline-note-summary" class="inline-summary-input" value="${escapeHtml(note.summary || '')}" placeholder="Click to add a brief summary or core takeaway..." onblur="window.quickUpdateHeaderMeta('${note.id}', 'summary', this.value)" onkeydown="if(event.key==='Enter'){this.blur();}">
            </div>
            <div style="display:flex; align-items:center; gap:0.5rem; flex-shrink:0;">
              <span id="direct-save-status" style="font-size:0.7rem; font-weight:700; color:#10b981;">✓ Saved</span>
              ${canvasMode !== 'study' ? `
                <button type="button" class="btn btn-primary btn-compact" style="height:1.65rem !important;" onclick="window.saveDirectNoteNow('${note.id}')">
                  <i data-lucide="check" class="icon-xs"></i> Done / Save
                </button>
              ` : ''}
            </div>
          </div>
        </div>

        <!-- ======================================================
             STICKY "+ ADD ELEMENT" MENU RIBBON (CHARTS, DIAGRAMS, WHITEBOARD, BLOCKS)
             ====================================================== -->
        <div class="insert-element-bar">
        <button type="button" id="insert-menu-trigger-btn" class="insert-menu-trigger" onclick="window.toggleElementPalette()">
          <i data-lucide="plus-circle" class="icon-xs"></i>
          <span>Add Element</span>
          <i data-lucide="chevron-down" class="icon-xs"></i>
        </button>

        <button type="button" class="insert-quick-chip" onclick="window.openInlineStudio('chart')" title="Draw Bar, Line, Area, Pie or Doughnut Chart">
          <i data-lucide="bar-chart-3" class="icon-xs" style="color:#4f46e5;"></i>
          <span>📊 Chart</span>
        </button>

        <button type="button" class="insert-quick-chip" onclick="window.openInlineStudio('whiteboard')" title="Freehand & Shape Diagram Sketchpad">
          <i data-lucide="pen-tool" class="icon-xs" style="color:#ec4899;"></i>
          <span>🎨 Draw / Sketch</span>
        </button>

        <button type="button" class="insert-quick-chip" onclick="window.openInlineStudio('diagram')" title="Build Flowchart, Sequence, Mindmap or State Diagram">
          <i data-lucide="git-merge" class="icon-xs" style="color:#10b981;"></i>
          <span>🔀 Flowchart</span>
        </button>

        <button type="button" class="insert-quick-chip" onclick="window.openInlineStudio('math')" title="Insert Math Formula or Equation">
          <i data-lucide="sigma" class="icon-xs" style="color:#0ea5e9;"></i>
          <span>📐 Math</span>
        </button>

        <button type="button" class="insert-quick-chip" onclick="window.insertSnippetIntoActiveNote('| Column 1 | Column 2 | Column 3 |\\n| --- | --- | --- |\\n| Data 1 | Data 2 | Data 3 |', 'Table added!')" title="Insert Table">
          <i data-lucide="table" class="icon-xs" style="color:#f59e0b;"></i>
          <span>📅 Table</span>
        </button>

        <button type="button" class="insert-quick-chip" onclick="window.insertSnippetIntoActiveNote('> [!PIN: Key Concept] Write your key concept or rule here.', 'Pinned concept added!')" title="Insert Pinned Section">
          <i data-lucide="pin" class="icon-xs" style="color:#d97706;"></i>
          <span>📌 Pin Box</span>
        </button>

        <button type="button" class="insert-quick-chip" onclick="window.openInlineStudio('flashcard')" title="Add Flashcards & Reference Links">
          <i data-lucide="sparkles" class="icon-xs" style="color:#8b5cf6;"></i>
          <span>✦ +Card / Link</span>
        </button>

        <button type="button" class="insert-quick-chip" style="border-color:#a5b4fc; background:#eef2ff; color:var(--primary); margin-left:auto;" onclick="window.exportAiStudyInstructionsMd()" title="Download .md AI Prompt Instructions & Open AI Importer">
          <i data-lucide="bot" class="icon-xs"></i>
          <span>🤖 AI Prompt (.md)</span>
        </button>

        <!-- Categorized Dropdown Element Menu -->
        <div id="element-palette-dropdown" class="element-palette-dropdown">
          <div>
            <div class="palette-section-title">📊 Visuals, Charts &amp; Diagrams</div>
            <div class="palette-grid">
              <button type="button" class="palette-item" onclick="window.openInlineStudio('chart')">
                <div class="palette-item-icon">📊</div>
                <div>
                  <div class="palette-item-title">Data Chart</div>
                  <div class="palette-item-desc">Bar, Line, Pie, Area, Doughnut</div>
                </div>
              </button>
              <button type="button" class="palette-item" onclick="window.openInlineStudio('whiteboard')">
                <div class="palette-item-icon">🎨</div>
                <div>
                  <div class="palette-item-title">Draw / Whiteboard</div>
                  <div class="palette-item-desc">Sketch shapes, arrows &amp; diagrams</div>
                </div>
              </button>
              <button type="button" class="palette-item" onclick="window.openInlineStudio('diagram')">
                <div class="palette-item-icon">🔀</div>
                <div>
                  <div class="palette-item-title">Flowchart / Sequence</div>
                  <div class="palette-item-desc">Visual node &amp; arrow builder</div>
                </div>
              </button>
              <button type="button" class="palette-item" onclick="window.insertSnippetIntoActiveNote('| Metric | Value | Notes |\\n| --- | --- | --- |\\n| Example | 100% | Key detail |', 'Table inserted!')">
                <div class="palette-item-icon">📅</div>
                <div>
                  <div class="palette-item-title">Data Table</div>
                  <div class="palette-item-desc">Structured comparison grid</div>
                </div>
              </button>
            </div>
          </div>

          <div>
            <div class="palette-section-title">📌 Study &amp; Active Recall Elements</div>
            <div class="palette-grid">
              <button type="button" class="palette-item" onclick="window.insertSnippetIntoActiveNote('> [!PIN: Core Principle] Write the essential rule or definition here.', 'Pinned block inserted!')">
                <div class="palette-item-icon">📌</div>
                <div>
                  <div class="palette-item-title">Pinned Section</div>
                  <div class="palette-item-desc">Appears in top navigation &amp; Digest</div>
                </div>
              </button>
              <button type="button" class="palette-item" onclick="window.insertSnippetIntoActiveNote('The key term is {{hidden answer}} for active recall.', 'Cloze deletion inserted!')">
                <div class="palette-item-icon">🔒</div>
                <div>
                  <div class="palette-item-title">Cloze Blank ({{...}})</div>
                  <div class="palette-item-desc">Click-to-reveal memory test</div>
                </div>
              </button>
              <button type="button" class="palette-item" onclick="window.openInlineStudio('flashcard')">
                <div class="palette-item-icon">✦</div>
                <div>
                  <div class="palette-item-title">Flashcard (Q&amp;A)</div>
                  <div class="palette-item-desc">Spaced repetition card</div>
                </div>
              </button>
              <button type="button" class="palette-item" onclick="window.insertSnippetIntoActiveNote('> 💡 **Exam Tip / Callout:** Important insight to remember.', 'Callout box inserted!')">
                <div class="palette-item-icon">💡</div>
                <div>
                  <div class="palette-item-title">Callout / Warning Box</div>
                  <div class="palette-item-desc">Highlighted note block</div>
                </div>
              </button>
            </div>
          </div>

          <div>
            <div class="palette-section-title">📐 Structure, Math &amp; Code</div>
            <div class="palette-grid">
              <button type="button" class="palette-item" onclick="window.insertSnippetIntoActiveNote('## New Section Title\\nWrite section details here...', 'Section heading inserted!')">
                <div class="palette-item-icon">H2</div>
                <div>
                  <div class="palette-item-title">Section Heading</div>
                  <div class="palette-item-desc">Auto-indexed in top outline</div>
                </div>
              </button>
              <button type="button" class="palette-item" onclick="window.openInlineStudio('math')">
                <div class="palette-item-icon">📐</div>
                <div>
                  <div class="palette-item-title">Math Formula</div>
                  <div class="palette-item-desc">Equations &amp; Greek symbols</div>
                </div>
              </button>
              <button type="button" class="palette-item" onclick="window.insertSnippetIntoActiveNote('\`\`\`javascript\\n// Code example\\nconsole.log(\"Hello Study Hub\");\\n\`\`\`', 'Code block inserted!')">
                <div class="palette-item-icon">💻</div>
                <div>
                  <div class="palette-item-title">Code Block</div>
                  <div class="palette-item-desc">Syntax block with 1-click Copy</div>
                </div>
              </button>
              <button type="button" class="palette-item" onclick="window.insertSnippetIntoActiveNote('- [ ] Review concept\\n- [ ] Complete practice exercise', 'Checklist inserted!')">
                <div class="palette-item-icon">☑️</div>
                <div>
                  <div class="palette-item-title">Task Checklist</div>
                  <div class="palette-item-desc">Interactive study to-do list</div>
                </div>
              </button>
            </div>
          </div>
        </div>
        </div>
      </div>

      ${pinsAndOutlineHtml}

      <div class="reader-body">
        <div class="mobile-only-reader-title">
          <h1 style="font-size:1.35rem; font-weight:800; line-height:1.25; margin-bottom:0.25rem; color:var(--foreground);">${escapeHtml(note.title)}</h1>
          ${note.summary ? `<p style="font-size:0.84rem; color:var(--muted-foreground); margin-bottom:0.5rem;">${escapeHtml(note.summary)}</p>` : ''}
        </div>
        ${inlineStudioHtml}

        ${canvasMode !== 'study' ? `
          <!-- DIRECT IN-STUDY WRITING / SPLIT STUDIO MODE -->
          <div class="direct-editor-container ${canvasMode === 'split' ? 'split-mode' : ''}">
            <div style="display:flex; flex-direction:column; gap:0.35rem;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:0.68rem; font-weight:800; text-transform:uppercase; color:var(--primary);">✍️ Direct Note Canvas (Type "/" on a new line to open Element Menu • Ctrl+V to paste screenshots)</span>
              </div>
              <textarea id="direct-note-textarea" class="direct-canvas-textarea" placeholder="Write directly here... Use the '+ Add Element' bar above to draw Charts, Diagrams, Flowcharts, Tables, Math, or Pinned Sections." oninput="window.handleDirectTextareaInput('${note.id}', this)" onkeydown="if((event.ctrlKey||event.metaKey)&&event.key==='s'){event.preventDefault();window.saveDirectNoteNow('${note.id}');}">${escapeHtml(note.content || '')}</textarea>
            </div>

            ${canvasMode === 'split' ? `
              <div style="display:flex; flex-direction:column; gap:0.35rem;">
                <span style="font-size:0.68rem; font-weight:800; text-transform:uppercase; color:var(--muted-foreground);">📖 Live Interactive Preview</span>
                <article id="direct-live-preview-body" class="markdown-content direct-live-preview ${isSummaryMode ? 'summary-mode-active' : ''} ${revealAllClozes ? 'reveal-all-clozes' : ''}">
                  ${renderedArticleHtml}
                </article>
              </div>
            ` : ''}
          </div>
        ` : isCornellMode ? `
          <div class="cornell-grid">
            <aside class="cornell-cue-col">
              <div class="cornell-cue-title">
                <span>📐 Cues &amp; Recall Prompts</span>
                <span>${pinnedSectionsRegistry.length + headingsOutlineRegistry.length + takeaways.length}</span>
              </div>

              ${pinnedSectionsRegistry.map(p => `
                <div class="cornell-cue-item" style="border-left-color:#f59e0b;" onclick="window.scrollToReaderSection('${p.id}')">
                  <div style="font-size:0.65rem; color:#b45309; font-weight:800; text-transform:uppercase;">📌 Pinned Concept</div>
                  <div>${escapeHtml(p.title)}</div>
                </div>
              `).join('')}

              ${headingsOutlineRegistry.map(h => `
                <div class="cornell-cue-item" onclick="window.scrollToReaderSection('${h.id}')">
                  <div style="font-size:0.65rem; color:var(--primary); font-weight:700;">Section Cue</div>
                  <div>${escapeHtml(h.title)}?</div>
                </div>
              `).join('')}

              ${takeaways.map((c, idx) => `
                <div class="cornell-cue-item" style="border-left-color:#8b5cf6;" onclick="openFlashcardDeck('${note.id}')">
                  <div style="font-size:0.65rem; color:#7c3aed; font-weight:700;">✦ Flashcard Q${idx + 1}</div>
                  <div>${escapeHtml(c.question)}</div>
                </div>
              `).join('')}

              ${highlightsRegistry.slice(0, 6).map(hl => `
                <div class="cornell-cue-item" style="border-left-color:#10b981; font-size:0.74rem;">
                  <mark class="study-hl study-hl-${hl.color}">${escapeHtml(hl.innerText)}</mark>
                </div>
              `).join('')}

              ${(pinnedSectionsRegistry.length + headingsOutlineRegistry.length + takeaways.length + highlightsRegistry.length) === 0 ? `
                <p style="font-size:0.75rem; color:var(--muted-foreground);">Pin sections, add headings, or highlight text on the right to populate your Cornell Cue column.</p>
              ` : ''}
            </aside>

            <div>
              <article class="markdown-content ${isSummaryMode ? 'summary-mode-active' : ''} ${revealAllClozes ? 'reveal-all-clozes' : ''}">
                ${renderedArticleHtml}
              </article>
            </div>
          </div>

          <div class="cornell-summary-box">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.4rem;">
              <span style="font-size:0.72rem; font-weight:800; text-transform:uppercase; color:#b45309;">📝 Cornell Bottom Summary (Synthesize this lesson in 1–2 sentences)</span>
              <button type="button" class="btn-tiny" onclick="window.saveCornellSummary('${note.id}')">Save Summary</button>
            </div>
            <input type="text" id="cornell-summary-input" class="form-input" style="background:#ffffff;" value="${escapeHtml(note.summary || '')}" placeholder="Write the core takeaway of this entire note..." onkeydown="if(event.key==='Enter'){event.preventDefault(); window.saveCornellSummary('${note.id}');}">
          </div>
        ` : `
          <article class="markdown-content ${isSummaryMode ? 'summary-mode-active' : ''} ${revealAllClozes ? 'reveal-all-clozes' : ''}">
            ${renderedArticleHtml}
          </article>
        `}

        <!-- Quick-Append Input Bar right inside Viewer -->
        <div class="reader-quick-append">
          <input type="text" id="reader-quick-append-input" class="form-input" style="height:1.95rem; font-size:0.8125rem;" placeholder="Type here to append a paragraph, ## Heading, or > [!PIN: Title] text... (Press Enter)" onkeydown="if(event.key==='Enter'){event.preventDefault(); window.quickAppendToNote('${note.id}');}">
          <button type="button" class="btn btn-secondary btn-compact" style="height:1.95rem !important;" onclick="window.quickAppendToNote('${note.id}')">
            <i data-lucide="plus" class="icon-xs"></i> Append
          </button>
          <button type="button" class="btn btn-outline btn-compact" style="height:1.95rem !important;" onclick="window.setCanvasMode(canvasMode === 'study' ? 'split' : 'study')">
            <i data-lucide="columns" class="icon-xs"></i> ${canvasMode === 'study' ? 'Open Split Editor' : 'Back to Reader'}
          </button>
        </div>

        ${takeaways.length > 0 ? `
          <section class="study-section-box">
            <div class="study-section-title">
              <div style="display:flex; align-items:center; gap:0.35rem;">
                <i data-lucide="sparkles" class="icon-xs" style="color:#8b5cf6;"></i>
                <span>Flashcards &amp; Key Takeaways (${takeaways.length})</span>
              </div>
              <div style="display:flex; gap:0.35rem;">
                <button type="button" class="btn-tiny" onclick="window.openInlineStudio('flashcard')">+ Add Card</button>
                <button type="button" class="btn-tiny" onclick="openFlashcardDeck('${note.id}')">
                  <i data-lucide="play" class="icon-xs"></i> Practice
                </button>
              </div>
            </div>
            <div>
              ${takeaways.map((card, idx) => `
                <div class="takeaway-item">
                  <div class="takeaway-q" onclick="const ans = this.nextElementSibling; ans.style.display = ans.style.display === 'none' ? 'block' : 'none';">
                    <span><strong style="color:var(--primary);">Q${idx + 1}:</strong> ${escapeHtml(card.question)}</span>
                    <div style="display:flex; align-items:center; gap:0.3rem;">
                      <span class="badge badge-USER" style="font-size:0.6rem;">Answer</span>
                      <button type="button" class="btn-icon" style="width:1.3rem; height:1.3rem; color:var(--destructive);" onclick="event.stopPropagation(); window.deleteInlineFlashcard('${note.id}', ${idx})" title="Delete card">
                        <i data-lucide="x" class="icon-xs"></i>
                      </button>
                    </div>
                  </div>
                  <div class="takeaway-a" style="display:none;">
                    ${escapeHtml(card.answer)}
                  </div>
                </div>
              `).join('')}
            </div>
          </section>
        ` : ''}

        ${resources.length > 0 ? `
          <section class="study-section-box" style="background:#f8fafc;">
            <div class="study-section-title">
              <div style="display:flex; align-items:center; gap:0.35rem;">
                <i data-lucide="bookmark" class="icon-xs" style="color:var(--primary);"></i>
                <span>References &amp; Resources (${resources.length})</span>
              </div>
              <button type="button" class="btn-tiny" onclick="window.openInlineStudio('flashcard')">+ Add Link</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:0.35rem;">
              ${resources.map(r => `
                <a href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer" style="display:flex; align-items:center; justify-content:space-between; padding:0.45rem 0.7rem; background:#ffffff; border:1px solid var(--border); border-radius:var(--radius-md); text-decoration:none; color:var(--foreground); font-size:0.8rem; font-weight:600;">
                  <span style="display:flex; align-items:center; gap:0.4rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    <i data-lucide="external-link" class="icon-xs" style="color:var(--primary);"></i>
                    ${escapeHtml(r.title || r.url)}
                  </span>
                  <span style="font-size:0.7rem; color:var(--muted-foreground); margin-left:0.5rem;">Open ↗</span>
                </a>
              `).join('')}
            </div>
          </section>
        ` : ''}
      </div>
    `;

    if (window.lucide) lucide.createIcons();
    runMermaidDiagrams();
  }
  // ======================================================
  window.filterStudySubject = function(subjectId) {
    activeSubjectId = subjectId;
    syncFilterUI();
    loadNotes(false);
    if (subjectsData) {
      renderDesktopSidebar('study', currentUser, subjectsData, activeSubjectId, activeMastery);
      renderSubjectsStrip(subjectsData.subjects || [], subjectsData.totalNotes || 0);
    }
  };

  window.filterStudyMastery = function(mastery) {
    activeMastery = mastery;
    if (activeSubjectId === 'PINNED' && mastery !== 'ALL') {
      activeSubjectId = 'ALL';
    }
    syncFilterUI();
    loadNotes(false);
    if (subjectsData) {
      renderDesktopSidebar('study', currentUser, subjectsData, activeSubjectId, activeMastery);
      renderSubjectsStrip(subjectsData.subjects || [], subjectsData.totalNotes || 0);
    }
  };

  window.clearStudyFilters = function() {
    activeSubjectId = 'ALL';
    activeMastery = 'ALL';
    searchQuery = '';
    if (searchInput) searchInput.value = '';
    syncFilterUI();
    loadNotes(false);
    if (subjectsData) {
      renderDesktopSidebar('study', currentUser, subjectsData, activeSubjectId, activeMastery);
      renderSubjectsStrip(subjectsData.subjects || [], subjectsData.totalNotes || 0);
    }
  };

  function syncFilterUI() {
    document.querySelectorAll('.seg-btn').forEach(btn => {
      const m = btn.getAttribute('data-mastery');
      if (activeSubjectId === 'PINNED' && m === 'PINNED') {
        btn.classList.add('active');
      } else if (activeSubjectId !== 'PINNED' && m === activeMastery) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        searchQuery = searchInput.value.trim();
        loadNotes(false);
      }, 200);
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== searchInput && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      if (searchInput) searchInput.focus();
    }
    if (e.key === 'Escape') {
      hideSelectionToolbar();
      if (hlPopover) hlPopover.style.display = 'none';
      if (isReadMode) window.toggleReadMode(false);
      else if (sectionMarkerModal && sectionMarkerModal.classList.contains('open')) closeSectionMarkerModal();
      else if (flashcardModal && flashcardModal.classList.contains('open')) closeFlashcardDeck();
      else if (noteModal && noteModal.classList.contains('open')) closeStudyNoteModal();
      else if (subjectModal && subjectModal.classList.contains('open')) closeStudySubjectModal();
      else if (readerPaneEl && readerPaneEl.classList.contains('mobile-open')) closeMobileReader();
    }
  });

  // ======================================================
  // CREATE / EDIT STUDY SUBJECT MODAL LOGIC
  // ======================================================
  window.openStudySubjectModal = function(subjectId = null) {
    editingSubjectId = subjectId;
    if (subjectForm) subjectForm.reset();

    if (subjectId && subjectsData && subjectsData.subjects) {
      const s = subjectsData.subjects.find(item => item.id === subjectId);
      if (s) {
        if (subjectModalTitle) subjectModalTitle.innerHTML = `<i data-lucide="pencil" class="icon-sm"></i><span>Edit Study Subject</span>`;
        if (subjectSubmitBtn) subjectSubmitBtn.textContent = 'Update Study';
        if (subjectDeleteBtn) subjectDeleteBtn.style.display = 'inline-flex';
        document.getElementById('subject-name-input').value = s.name || '';
        document.getElementById('subject-desc-input').value = s.description || '';
        document.getElementById('subject-icon-select').value = s.icon || 'book-open';
        document.getElementById('subject-status-select').value = s.status || 'ACTIVE';
        const radio = subjectForm.querySelector(`input[name="subject-color"][value="${s.color}"]`);
        if (radio) radio.checked = true;
      }
    } else {
      if (subjectModalTitle) subjectModalTitle.innerHTML = `<i data-lucide="graduation-cap" class="icon-sm"></i><span>Create New Study</span>`;
      if (subjectSubmitBtn) subjectSubmitBtn.textContent = 'Save Study';
      if (subjectDeleteBtn) subjectDeleteBtn.style.display = 'none';
    }

    if (subjectModal) {
      subjectModal.classList.add('open');
      setTimeout(() => document.getElementById('subject-name-input')?.focus(), 50);
    }
    if (window.lucide) lucide.createIcons();
  };

  window.editCurrentActiveSubject = function() {
    if (activeSubjectId && !['ALL', 'PINNED', 'NONE'].includes(activeSubjectId)) {
      window.openStudySubjectModal(activeSubjectId);
    }
  };

  window.deleteEditingSubject = async function() {
    if (!editingSubjectId || !subjectsData?.subjects) return;
    const s = subjectsData.subjects.find(x => x.id === editingSubjectId);
    const idToDelete = editingSubjectId;
    closeStudySubjectModal();
    await window.deleteStudySubjectConfirm(idToDelete, s ? s.name : 'Study');
  };

  window.closeStudySubjectModal = function() {
    if (subjectModal) subjectModal.classList.remove('open');
    editingSubjectId = null;
  };

  if (subjectForm) {
    subjectForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('subject-name-input').value.trim();
      const description = document.getElementById('subject-desc-input').value.trim();
      const icon = document.getElementById('subject-icon-select').value;
      const status = document.getElementById('subject-status-select').value;
      const colorRadio = subjectForm.querySelector('input[name="subject-color"]:checked');
      const color = colorRadio ? colorRadio.value : '#4f46e5';

      try {
        const url = editingSubjectId ? `/api/study/subjects/${editingSubjectId}` : '/api/study/subjects';
        const method = editingSubjectId ? 'PUT' : 'POST';
        const res = await apiRequest(url, {
          method,
          body: { name, description, icon, color, status }
        });

        showToast(res.message || 'Study saved!', 'success');
        if (!editingSubjectId && res.subject) {
          activeSubjectId = res.subject.id;
        }
        closeStudySubjectModal();
        await loadSubjects();
        await loadNotes();

        if (noteModal && noteModal.classList.contains('open') && res.subject) {
          populateSubjectDropdown(res.subject.id);
        }
      } catch (err) {}
    });
  }

  window.deleteStudySubjectConfirm = async function(id, name) {
    if (!confirm(`Delete the study "${name}"?\nAll notes inside it will remain safe in General Notes.`)) return;
    try {
      const res = await apiRequest(`/api/study/subjects/${id}`, { method: 'DELETE' });
      showToast(res.message, 'success');
      if (activeSubjectId === id) activeSubjectId = 'ALL';
      syncFilterUI();
      await loadSubjects();
      await loadNotes(false);
    } catch (err) {}
  };

  // ======================================================
  // CREATE / EDIT STUDY NOTE MODAL & TOOLBAR LOGIC
  // ======================================================
  window.switchEditorTab = function(mode) {
    const writeWrap = document.getElementById('editor-write-wrap');
    const previewWrap = document.getElementById('editor-preview-wrap');
    const previewBody = document.getElementById('editor-preview-body');
    const contentInput = document.getElementById('note-content-input');

    if (mode === 'preview') {
      writeWrap.style.display = 'none';
      previewWrap.style.display = 'block';
      if (previewBody) previewBody.innerHTML = renderMarkdown(contentInput ? contentInput.value : '');
      if (window.lucide) lucide.createIcons();
      runMermaidDiagrams();
    } else {
      writeWrap.style.display = 'block';
      previewWrap.style.display = 'none';
    }
  };

  window.insertMdSyntax = function(prefix, suffix) {
    const textarea = document.getElementById('note-content-input');
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end) || 'text';
    const replacement = `${prefix}${selected}${suffix}`;
    textarea.setRangeText(replacement, start, end, 'end');
    textarea.focus();
  };

  window.insertNoteTemplate = function() {
    const textarea = document.getElementById('note-content-input');
    if (!textarea) return;
    const template = `## 🎯 Overview & Core Concept
> [!PIN: Key Principle] Summarize the main principle or definition here.

## 🛠️ Examples / Commands
\`\`\`bash
# Example command or formula
\`\`\`

## ✅ Study Checklist
- [ ] Understand {{core concept}}
- [ ] Review key takeaways
`;
    textarea.value = textarea.value ? `${textarea.value}\n\n${template}` : template;
    textarea.focus();
  };

  window.addTakeawayRow = function(question = '', answer = '') {
    if (!takeawaysContainer) return;
    const row = document.createElement('div');
    row.className = 'takeaway-builder-row';
    row.style.cssText = 'display:grid; grid-template-columns:1fr 1fr auto; gap:0.35rem; align-items:center;';
    row.innerHTML = `
      <input type="text" class="form-input takeaway-q-input" style="height:1.85rem; font-size:0.78rem;" placeholder="Question" value="${escapeHtml(question)}">
      <input type="text" class="form-input takeaway-a-input" style="height:1.85rem; font-size:0.78rem;" placeholder="Answer" value="${escapeHtml(answer)}">
      <button type="button" class="btn-icon" style="height:1.85rem; width:1.85rem; color:var(--destructive);" onclick="this.parentElement.remove()" title="Remove">
        <i data-lucide="x" class="icon-xs"></i>
      </button>
    `;
    takeawaysContainer.appendChild(row);
    if (window.lucide) lucide.createIcons();
  };

  window.addResourceRow = function(title = '', url = '') {
    if (!resourcesContainer) return;
    const row = document.createElement('div');
    row.className = 'resource-builder-row';
    row.style.cssText = 'display:grid; grid-template-columns:1fr 1.2fr auto; gap:0.35rem; align-items:center;';
    row.innerHTML = `
      <input type="text" class="form-input resource-title-input" style="height:1.85rem; font-size:0.78rem;" placeholder="Title" value="${escapeHtml(title)}">
      <input type="url" class="form-input resource-url-input" style="height:1.85rem; font-size:0.78rem;" placeholder="https://..." value="${escapeHtml(url)}">
      <button type="button" class="btn-icon" style="height:1.85rem; width:1.85rem; color:var(--destructive);" onclick="this.parentElement.remove()" title="Remove">
        <i data-lucide="x" class="icon-xs"></i>
      </button>
    `;
    resourcesContainer.appendChild(row);
    if (window.lucide) lucide.createIcons();
  };

  // Direct In-Study Note Creation / Editing (Zero Modal Dialog!)
  window.openStudyNoteModal = async function(noteId = null) {
    if (noteId) {
      selectedNoteId = noteId;
      canvasMode = 'split';
      const note = notesList.find(n => n.id === noteId);
      if (note) {
        highlightSelectedCard();
        renderReaderPane(note);
        setTimeout(() => document.getElementById('direct-note-textarea')?.focus(), 40);
      }
      return;
    }

    // Create a fresh note directly in the current study and open it in Split Studio mode
    const defaultSubjectId = !['ALL', 'PINNED', 'NONE'].includes(activeSubjectId) ? activeSubjectId : null;
    try {
      const res = await apiRequest('/api/study/notes', {
        method: 'POST',
        body: {
          title: 'Untitled Study Note',
          subjectId: defaultSubjectId,
          summary: '',
          content: `## 🎯 Core Concepts\n> [!PIN: Key Principle] Write the main concept here.\n\n`,
          mastery: 'LEARNING',
          pinned: false
        }
      });

      if (res && res.note) {
        selectedNoteId = res.note.id;
        canvasMode = 'split';
        activeInlineStudio = null;
        await loadSubjects();
        await loadNotes(true);
        if (window.innerWidth < 1024 && readerPaneEl) {
          readerPaneEl.classList.add('mobile-open');
        }
        setTimeout(() => {
          const titleEl = document.getElementById('inline-note-title');
          if (titleEl) {
            titleEl.focus();
            titleEl.select();
          }
        }, 60);
      }
    } catch (err) {}
  };

  window.closeStudyNoteModal = function() {
    if (noteModal) noteModal.classList.remove('open');
    editingNoteId = null;
  };

  if (noteForm) {
    noteForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const subjectId = noteSubjectSelect.value || null;
      const mastery = document.getElementById('note-mastery-select').value;
      const title = document.getElementById('note-title-input').value.trim();
      const chapter = document.getElementById('note-chapter-input')?.value.trim() || null;
      const summary = document.getElementById('note-summary-input').value.trim();
      const content = document.getElementById('note-content-input').value;
      const tagsStr = document.getElementById('note-tags-input').value.trim();
      const pinned = document.getElementById('note-pinned-input').checked;

      const existingNote = editingNoteId ? notesList.find(n => n.id === editingNoteId) : null;
      const existingTakeaways = (existingNote && existingNote.takeaways) || [];

      const takeaways = [];
      document.querySelectorAll('.takeaway-builder-row').forEach((row, idx) => {
        const q = row.querySelector('.takeaway-q-input')?.value.trim();
        const a = row.querySelector('.takeaway-a-input')?.value.trim();
        if (q && a) {
          const prev = existingTakeaways.find(c => c.question === q) || existingTakeaways[idx] || {};
          takeaways.push({
            question: q,
            answer: a,
            interval: prev.interval || 0,
            ease: prev.ease || 2.5,
            reps: prev.reps || 0,
            nextReview: prev.nextReview || null
          });
        }
      });

      const resources = [];
      document.querySelectorAll('.resource-builder-row').forEach(row => {
        const t = row.querySelector('.resource-title-input')?.value.trim();
        const u = row.querySelector('.resource-url-input')?.value.trim();
        if (u) resources.push({ title: t || u, url: u });
      });

      try {
        const url = editingNoteId ? `/api/study/notes/${editingNoteId}` : '/api/study/notes';
        const method = editingNoteId ? 'PUT' : 'POST';

        const res = await apiRequest(url, {
          method,
          body: {
            title,
            subjectId,
            chapter,
            summary,
            content,
            takeaways,
            resources,
            tags: tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [],
            mastery,
            pinned
          }
        });

        showToast(res.message || 'Study note saved!', 'success');
        if (res.note) selectedNoteId = res.note.id;
        closeStudyNoteModal();
        await loadSubjects();
        await loadNotes(true);
      } catch (err) {}
    });
  }

  // ======================================================
  // NOTE ACTIONS (PIN, MASTERY, COPY, EXPORT, DELETE)
  // ======================================================
  window.togglePinNote = async function(noteId) {
    try {
      const res = await apiRequest(`/api/study/notes/${noteId}/pin`, { method: 'PATCH' });
      showToast(res.message, 'success');
      await loadSubjects();
      await loadNotes(true);
    } catch (err) {}
  };

  window.quickUpdateMastery = async function(noteId, mastery) {
    try {
      const res = await apiRequest(`/api/study/notes/${noteId}/mastery`, {
        method: 'PATCH',
        body: { mastery }
      });
      showToast(res.message, 'success');
      await loadSubjects();
      await loadNotes(true);
    } catch (err) {}
  };

  window.copyNoteMarkdown = function(noteId) {
    const note = notesList.find(n => n.id === noteId);
    if (!note) return;
    const fullText = `# ${note.title}\n${note.summary ? `> ${note.summary}\n\n` : '\n'}${note.content || ''}`;
    copyToClipboard(fullText, 'Study Note');
  };

  window.exportNoteMarkdown = function(noteId) {
    const note = notesList.find(n => n.id === noteId);
    if (!note) return;
    let md = `# ${note.title}\n\n`;
    if (note.subject) md += `**Study:** ${note.subject.name} | **Status:** ${note.mastery}\n\n`;
    if (note.summary) md += `> ${note.summary}\n\n`;
    md += `${note.content || ''}\n`;

    if (note.takeaways && note.takeaways.length > 0) {
      md += `\n## Key Takeaways & Flashcards\n`;
      note.takeaways.forEach((c, i) => {
        md += `- **Q${i + 1}: ${c.question}**\n  - ${c.answer}\n`;
      });
    }

    if (note.resources && note.resources.length > 0) {
      md += `\n## References\n`;
      note.resources.forEach(r => {
        md += `- [${r.title || r.url}](${r.url})\n`;
      });
    }

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = note.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'study-note';
    a.href = url;
    a.download = `${safeName}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Downloaded Markdown file (.md)!', 'success');
  };

  window.deleteStudyNoteConfirm = async function(noteId) {
    const note = notesList.find(n => n.id === noteId);
    if (!confirm(`Delete note "${note ? note.title : 'this note'}" permanently?`)) return;
    try {
      const res = await apiRequest(`/api/study/notes/${noteId}`, { method: 'DELETE' });
      showToast(res.message, 'info');
      if (selectedNoteId === noteId) selectedNoteId = null;
      closeMobileReader();
      await loadSubjects();
      await loadNotes(false);
    } catch (err) {}
  };

  // ======================================================
  // CLIPBOARD IMAGE PASTE (CTRL+V SCREENSHOTS IN EDITOR OR READER)
  // ======================================================
  function compressImageFileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const maxW = 1100;
          let w = img.width;
          let h = img.height;
          if (w > maxW) {
            h = Math.round((h * maxW) / w);
            w = maxW;
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = reject;
        img.src = ev.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  document.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    let imageFile = null;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        imageFile = items[i].getAsFile();
        break;
      }
    }
    if (!imageFile) return;

    const directTextarea = document.getElementById('direct-note-textarea');
    const noteTextarea = document.getElementById('note-content-input');
    const isModalEditorOpen = noteModal && noteModal.classList.contains('open') && document.activeElement === noteTextarea;

    if (document.activeElement === directTextarea && directTextarea && selectedNoteId) {
      e.preventDefault();
      showToast('Inserting pasted screenshot...', 'info');
      try {
        const dataUrl = await compressImageFileToDataUrl(imageFile);
        await window.insertSnippetIntoActiveNote(`![Screenshot](${dataUrl})`, 'Screenshot inserted into note!');
      } catch (err) {
        showToast('Failed to process pasted image.', 'error');
      }
    } else if (isModalEditorOpen && noteTextarea) {
      e.preventDefault();
      showToast('Processing pasted screenshot...', 'info');
      try {
        const dataUrl = await compressImageFileToDataUrl(imageFile);
        const mdImg = `\n![Screenshot](${dataUrl})\n`;
        const start = noteTextarea.selectionStart;
        noteTextarea.setRangeText(mdImg, start, noteTextarea.selectionEnd, 'end');
        showToast('Screenshot inserted into note!', 'success');
      } catch (err) {
        showToast('Failed to process pasted image.', 'error');
      }
    } else if (selectedNoteId && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      const note = notesList.find(n => n.id === selectedNoteId);
      if (!note) return;
      showToast('Appending pasted screenshot to note...', 'info');
      try {
        const dataUrl = await compressImageFileToDataUrl(imageFile);
        const updated = `${note.content || ''}\n\n![Screenshot](${dataUrl})`;
        await saveNoteContentDirectly(note.id, updated, 'Screenshot pasted into note!');
      } catch (err) {}
    }
  });

  // ======================================================
  // INTERACTIVE FLASHCARD PRACTICE DECK WITH SPACED REPETITION (SM-2)
  // ======================================================
  function isCardDue(card) {
    if (!card.nextReview) return true;
    return new Date(card.nextReview).getTime() <= Date.now();
  }

  function buildFlashcardDeck() {
    flashcardDeck = [];
    const sourceNotes = flashcardSourceNoteId
      ? notesList.filter(n => n.id === flashcardSourceNoteId)
      : notesList;

    sourceNotes.forEach(n => {
      (n.takeaways || []).forEach((c, cardIdx) => {
        if (c.question && c.answer) {
          if (!flashcardDueOnly || isCardDue(c)) {
            flashcardDeck.push({
              noteId: n.id,
              cardIdx,
              question: c.question,
              answer: c.answer,
              interval: c.interval || 0,
              ease: c.ease || 2.5,
              reps: c.reps || 0,
              nextReview: c.nextReview || null,
              noteTitle: n.title,
              subjectName: n.subject ? n.subject.name : 'General'
            });
          }
        }
      });
    });
  }

  window.openFlashcardDeck = function(specificNoteId = null) {
    flashcardSourceNoteId = specificNoteId;
    flashcardDueOnly = false;
    const filterLabel = document.getElementById('flashcard-due-filter-label');
    if (filterLabel) filterLabel.textContent = 'All Cards';

    buildFlashcardDeck();

    if (flashcardDeck.length === 0) {
      showToast('No flashcards found! Select text in a note and click "+ Card" to create one.', 'info');
      return;
    }

    flashcardIndex = 0;
    flashcardShowingAnswer = false;
    renderCurrentFlashcard();
    if (flashcardModal) flashcardModal.classList.add('open');
    if (window.lucide) lucide.createIcons();
  };

  window.toggleFlashcardDueFilter = function() {
    flashcardDueOnly = !flashcardDueOnly;
    const filterLabel = document.getElementById('flashcard-due-filter-label');
    if (filterLabel) filterLabel.textContent = flashcardDueOnly ? 'Due Today Only' : 'All Cards';

    buildFlashcardDeck();
    if (flashcardDeck.length === 0) {
      flashcardDueOnly = false;
      if (filterLabel) filterLabel.textContent = 'All Cards';
      buildFlashcardDeck();
      showToast('🎉 All cards are reviewed for today! Showing full deck.', 'success');
    }
    flashcardIndex = 0;
    flashcardShowingAnswer = false;
    renderCurrentFlashcard();
  };

  window.closeFlashcardDeck = function() {
    if (flashcardModal) flashcardModal.classList.remove('open');
  };

  function renderCurrentFlashcard() {
    if (flashcardDeck.length === 0) return;
    const card = flashcardDeck[flashcardIndex];
    const stage = document.getElementById('flashcard-stage');
    const label = document.getElementById('flashcard-side-label');
    const text = document.getElementById('flashcard-text');
    const counter = document.getElementById('flashcard-counter');
    const dueBadge = document.getElementById('flashcard-due-badge');
    const subtitle = document.getElementById('flashcard-source-subtitle');
    const sm2Bar = document.getElementById('sm2-rating-bar');

    if (counter) counter.textContent = `Card ${flashcardIndex + 1} of ${flashcardDeck.length}`;
    if (subtitle) subtitle.textContent = `${card.subjectName} • ${card.noteTitle}`;

    if (dueBadge) {
      if (!card.nextReview) {
        dueBadge.textContent = 'New Card';
        dueBadge.className = 'badge badge-USER';
      } else if (isCardDue(card)) {
        dueBadge.textContent = '🔥 Due Now';
        dueBadge.className = 'badge badge-PASSWORD';
      } else {
        const daysLeft = Math.max(1, Math.ceil((new Date(card.nextReview).getTime() - Date.now()) / 86400000));
        dueBadge.textContent = `Next in ${daysLeft}d`;
        dueBadge.className = 'badge badge-DB_CONNECTION';
      }
    }

    // Update dynamic SM-2 interval labels
    const curIvl = card.interval || 1;
    const curEase = card.ease || 2.5;
    const hardDays = Math.max(2, Math.round(curIvl * 1.2));
    const goodDays = card.reps === 0 ? 3 : Math.max(4, Math.round(curIvl * curEase));
    const easyDays = card.reps === 0 ? 7 : Math.max(7, Math.round(curIvl * curEase * 1.3));

    const hardLbl = document.getElementById('sm2-hard-label');
    const goodLbl = document.getElementById('sm2-good-label');
    const easyLbl = document.getElementById('sm2-easy-label');
    if (hardLbl) hardLbl.textContent = `${hardDays} days`;
    if (goodLbl) goodLbl.textContent = `${goodDays} days`;
    if (easyLbl) easyLbl.textContent = `${easyDays} days`;

    if (flashcardShowingAnswer) {
      if (stage) stage.classList.add('is-answer');
      if (label) {
        label.className = 'badge badge-DB_CONNECTION';
        label.textContent = 'ANSWER — RATE YOUR RECALL BELOW';
      }
      if (text) text.textContent = card.answer;
      if (sm2Bar) sm2Bar.style.display = 'grid';
    } else {
      if (stage) stage.classList.remove('is-answer');
      if (label) {
        label.className = 'badge badge-PASSWORD';
        label.textContent = 'QUESTION — CLICK TO REVEAL ANSWER';
      }
      if (text) text.textContent = card.question;
      if (sm2Bar) sm2Bar.style.display = 'none';
    }
  }

  window.rateCurrentFlashcard = async function(quality) {
    if (flashcardDeck.length === 0) return;
    const card = flashcardDeck[flashcardIndex];
    const note = notesList.find(n => n.id === card.noteId);
    if (!note || !Array.isArray(note.takeaways) || !note.takeaways[card.cardIdx]) return;

    let reps = card.reps || 0;
    let interval = card.interval || 1;
    let ease = card.ease || 2.5;

    if (quality < 3) {
      reps = 0;
      interval = 1;
    } else {
      if (reps === 0) {
        interval = quality === 3 ? 2 : quality === 4 ? 4 : 7;
      } else {
        const mult = quality === 3 ? 1.2 : quality === 4 ? ease : ease * 1.3;
        interval = Math.max(2, Math.round(interval * mult));
      }
      reps += 1;
      ease = Math.max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
    }

    const nextReviewDate = quality === 0
      ? new Date(Date.now() + 10 * 60 * 1000).toISOString()
      : new Date(Date.now() + interval * 86400000).toISOString();

    card.reps = reps;
    card.interval = interval;
    card.ease = Number(ease.toFixed(2));
    card.nextReview = nextReviewDate;

    note.takeaways[card.cardIdx] = {
      ...note.takeaways[card.cardIdx],
      reps: card.reps,
      interval: card.interval,
      ease: card.ease,
      nextReview: card.nextReview
    };

    try {
      await apiRequest(`/api/study/notes/${note.id}`, {
        method: 'PUT',
        body: { takeaways: note.takeaways }
      });
    } catch (e) {}

    window.nextFlashcard();
  };

  window.flipCurrentFlashcard = function() {
    flashcardShowingAnswer = !flashcardShowingAnswer;
    renderCurrentFlashcard();
  };

  window.nextFlashcard = function() {
    if (flashcardDeck.length === 0) return;
    flashcardIndex = (flashcardIndex + 1) % flashcardDeck.length;
    flashcardShowingAnswer = false;
    renderCurrentFlashcard();
  };

  window.prevFlashcard = function() {
    if (flashcardDeck.length === 0) return;
    flashcardIndex = (flashcardIndex - 1 + flashcardDeck.length) % flashcardDeck.length;
    flashcardShowingAnswer = false;
    renderCurrentFlashcard();
  };

  window.shuffleFlashcards = function() {
    for (let i = flashcardDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [flashcardDeck[i], flashcardDeck[j]] = [flashcardDeck[j], flashcardDeck[i]];
    }
    flashcardIndex = 0;
    flashcardShowingAnswer = false;
    renderCurrentFlashcard();
    showToast('Flashcards shuffled!', 'info');
  };

  // ======================================================
  // MOBILE SLIDE-OVER NAVIGATION DRAWER
  // ======================================================
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenuDrawer = document.getElementById('mobile-menu-drawer');
  const closeMobileMenuBtn = document.getElementById('close-mobile-menu-btn');
  const mobileMenuUsersLink = document.getElementById('mobile-menu-users-link');
  const mobileMenuStudyContainer = document.getElementById('mobile-menu-study-container');
  const mobileMenuUserInfo = document.getElementById('mobile-menu-user-info');

  function openMobileMenu() {
    if (!mobileMenuDrawer) return;
    if (currentUser) {
      if (mobileMenuUsersLink) {
        mobileMenuUsersLink.style.display = currentUser.role === 'ADMIN' ? 'flex' : 'none';
      }
      if (mobileMenuUserInfo) {
        mobileMenuUserInfo.innerHTML = `
          <div style="overflow:hidden;">
            <div class="mobile-nav-user-name">${escapeHtml(currentUser.name || currentUser.email.split('@')[0])}</div>
            <div class="mobile-nav-user-email">${escapeHtml(currentUser.email)}</div>
          </div>
          <span class="badge badge-${currentUser.role}">${currentUser.role}</span>
        `;
      }
    }

    if (mobileMenuStudyContainer && subjectsData) {
      const subjects = subjectsData.subjects || [];
      mobileMenuStudyContainer.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-top:0.75rem; margin-bottom:0.25rem; padding: 0 0.5rem;">
          <span class="sidebar-section-header" style="margin:0; padding:0;">My Studies</span>
          <button onclick="window.closeMobileMenu(); window.openStudySubjectModal()" class="btn-icon" style="width:1.5rem; height:1.5rem;">
            <i data-lucide="plus" class="icon-xs"></i>
          </button>
        </div>
        <div style="display:flex; flex-direction:column; gap:0.125rem;">
          <a href="javascript:void(0)" onclick="window.filterStudySubject('ALL'); window.closeMobileMenu();" class="sidebar-link ${activeSubjectId === 'ALL' ? 'active' : ''}">
            <i data-lucide="book-open" class="icon-sm"></i>
            <span style="flex:1;">All Study Notes</span>
            <span class="badge badge-USER">${subjectsData.totalNotes || 0}</span>
          </a>
          ${subjects.map(s => `
            <a href="javascript:void(0)" onclick="window.filterStudySubject('${s.id}'); window.closeMobileMenu();" class="sidebar-link ${activeSubjectId === s.id ? 'active' : ''}">
              <i data-lucide="${escapeHtml(s.icon || 'book-open')}" class="icon-sm" style="color:${s.color || '#4f46e5'};"></i>
              <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(s.name)}</span>
              <span class="badge badge-USER">${s.noteCount || 0}</span>
            </a>
          `).join('')}
        </div>
      `;
    }

    mobileMenuDrawer.classList.add('open');
    if (window.lucide) lucide.createIcons();
  }

  window.closeMobileMenu = function() {
    if (mobileMenuDrawer) mobileMenuDrawer.classList.remove('open');
  };

  if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', openMobileMenu);
  if (closeMobileMenuBtn) closeMobileMenuBtn.addEventListener('click', window.closeMobileMenu);
  if (mobileMenuDrawer) {
    mobileMenuDrawer.addEventListener('click', (e) => {
      if (e.target === mobileMenuDrawer) window.closeMobileMenu();
    });
  }

  // Initial load
  await loadSubjects();
  await loadNotes(false);

  if (window.lucide) lucide.createIcons();
});
