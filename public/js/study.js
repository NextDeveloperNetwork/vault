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
  let collapsedChapters = new Set();

  let codeSnippetsRegistry = [];
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
  // RICH MARKDOWN PARSER WITH HIGHLIGHTS, PINS, CLOZES, MATH, MERMAID, IMAGES & WIKI LINKS
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
    currentNoteClozeCount = 0;

    if (!rawMd || !rawMd.trim()) {
      return `<p style="color:var(--muted-foreground); font-style:italic;">No content written yet. Click <strong>Edit</strong> or use the bottom quick-append bar to add notes.</p>`;
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

    // 2. Code Blocks & Mermaid Diagrams ```lang ... ```
    text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const trimmedCode = code.replace(/\n$/, '');
      if ((lang || '').toLowerCase() === 'mermaid') {
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

  async function saveNoteContentDirectly(noteId, newContent, toastMsg = 'Saved!') {
    const note = notesList.find(n => n.id === noteId);
    if (!note) return;
    try {
      const res = await apiRequest(`/api/study/notes/${noteId}`, {
        method: 'PUT',
        body: { content: newContent }
      });
      note.content = res.note.content;
      showToast(toastMsg, 'success');
      renderReaderPane(note);
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

  function renderNoteCardHtml(note) {
    const isSelected = note.id === selectedNoteId;
    const mMeta = MASTERY_META[note.mastery] || MASTERY_META.LEARNING;
    const subj = note.subject;
    const cardPreview = note.summary || (note.content ? note.content.replace(/[#*`>=-]/g, '').trim().slice(0, 90) : '');
    const cardCount = (note.takeaways && note.takeaways.length) || 0;

    return `
      <div class="note-list-card ${isSelected ? 'selected' : ''} ${note.pinned ? 'pinned-card' : ''}" data-note-id="${note.id}" onclick="selectStudyNote('${note.id}', true)">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:0.35rem;">
          <div class="note-card-title">
            ${note.pinned ? '<i data-lucide="pin" class="icon-xs" style="color:#f59e0b; flex-shrink:0;"></i>' : ''}
            <span style="overflow:hidden; text-overflow:ellipsis;">${escapeHtml(note.title)}</span>
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
            ${new Date(note.updatedAt).toLocaleDateString()}
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

  // ======================================================
  // RENDER EXPANSIVE READER PANE WITH SUMMARY MODE & QUICK APPEND
  // ======================================================
  function renderEmptyReaderPane() {
    if (!readerPaneEl) return;
    readerPaneEl.innerHTML = `
      <div style="margin:auto; padding:3rem 1.5rem; text-align:center; max-width:24rem;">
        <div style="width:3rem; height:3rem; border-radius:var(--radius-lg); background:var(--secondary); color:var(--primary); display:flex; align-items:center; justify-content:center; margin:0 auto 0.875rem auto;">
          <i data-lucide="graduation-cap" class="icon-lg"></i>
        </div>
        <h3 style="font-size:1rem; margin-bottom:0.35rem;">Ready to Study</h3>
        <p style="font-size:0.8rem; margin-bottom:1.125rem;">
          Select a note on the left or create a new study note with Markdown, highlights, pinned sections, and flashcards.
        </p>
        <button class="btn btn-primary" onclick="openStudyNoteModal()">
          <i data-lucide="plus" class="icon-xs"></i>
          <span>New Study Note</span>
        </button>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }

  function renderReaderPane(note) {
    if (!readerPaneEl || !note) return;

    const subj = note.subject;
    const takeaways = note.takeaways || [];
    const resources = note.resources || [];
    const tags = note.tags || [];

    const renderedArticleHtml = renderMarkdown(note.content, note.id);

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

    readerPaneEl.innerHTML = `
      <div class="reader-header">
        <div class="reader-top-bar">
          <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
            <button type="button" class="btn-tiny mobile-menu-trigger" onclick="closeMobileReader()">
              <i data-lucide="arrow-left" class="icon-xs"></i> Back
            </button>

            ${subj ? `
              <span class="badge" style="color:${subj.color || '#4f46e5'}; border-color:${subj.color || '#4f46e5'}50; background:${subj.color || '#4f46e5'}12; cursor:pointer;" onclick="filterStudySubject('${subj.id}')">
                <i data-lucide="${escapeHtml(subj.icon || 'book-open')}" class="icon-xs"></i>
                ${escapeHtml(subj.name)}
              </span>
            ` : `
              <span class="badge badge-USER">General Note</span>
            `}

            <select class="form-select" style="width:auto; height:1.6rem; font-size:0.72rem; padding:0 0.45rem; font-weight:700;" onchange="quickUpdateMastery('${note.id}', this.value)">
              <option value="NEW" ${note.mastery === 'NEW' ? 'selected' : ''}>🟣 New Topic</option>
              <option value="LEARNING" ${note.mastery === 'LEARNING' ? 'selected' : ''}>🔵 In Progress</option>
              <option value="REVIEW" ${note.mastery === 'REVIEW' ? 'selected' : ''}>🟠 Needs Review</option>
              <option value="MASTERED" ${note.mastery === 'MASTERED' ? 'selected' : ''}>🟢 Mastered</option>
            </select>

            ${note.chapter ? `
              <span class="badge badge-OTHER" style="font-size:0.65rem;">📂 ${escapeHtml(note.chapter)}</span>
            ` : ''}

            ${tags.map(t => `<span class="note-tag-chip">#${escapeHtml(t)}</span>`).join('')}
          </div>

          <div class="reader-actions-group">
            <button type="button" class="btn-tiny ${isCornellMode ? 'cornell-active' : ''}" onclick="toggleCornellMode()" title="Toggle Cornell Note-Taking Split Layout (Left Cue Column + Right Notes + Bottom Summary)">
              <i data-lucide="columns" class="icon-xs"></i>
              <span>${isCornellMode ? '📐 Cornell ON' : '📐 Cornell'}</span>
            </button>

            <button type="button" class="btn-tiny ${isSummaryMode ? 'summary-active' : ''}" onclick="toggleSummaryMode()" title="Toggle Summary / Cheat-Sheet Mode (shows only Pinned Sections & Highlights)">
              <i data-lucide="filter" class="icon-xs"></i>
              <span>${isSummaryMode ? '🎯 Summary ON' : '🎯 Summary'}</span>
            </button>

            ${currentNoteClozeCount > 0 ? `
              <button type="button" id="reveal-clozes-btn" class="btn-tiny" onclick="toggleRevealAllClozes()" title="Reveal or Hide all Cloze Fill-in-the-blanks">
                <i data-lucide="${revealAllClozes ? 'eye-off' : 'eye'}" class="icon-xs"></i>
                <span>${revealAllClozes ? 'Hide Clozes' : 'Reveal Clozes'}</span>
              </button>
            ` : ''}

            <button type="button" class="btn-tiny" style="${note.pinned ? 'color:#b45309; border-color:#fde68a; background:#fffbeb;' : ''}" onclick="togglePinNote('${note.id}')" title="${note.pinned ? 'Unpin Note' : 'Pin Note'}">
              <i data-lucide="pin" class="icon-xs"></i>
              <span>${note.pinned ? 'Pinned' : 'Pin'}</span>
            </button>
            <button type="button" class="btn-tiny" onclick="copyNoteMarkdown('${note.id}')" title="Copy Note Markdown">
              <i data-lucide="copy" class="icon-xs"></i>
              <span>Copy</span>
            </button>
            <button type="button" class="btn-tiny" onclick="exportNoteMarkdown('${note.id}')" title="Download .md file">
              <i data-lucide="download" class="icon-xs"></i>
              <span>.md</span>
            </button>
            <button type="button" class="btn btn-primary btn-compact" style="height:1.6rem !important;" onclick="openStudyNoteModal('${note.id}')">
              <i data-lucide="pencil" class="icon-xs"></i>
              <span>Edit</span>
            </button>
            <button type="button" class="btn btn-danger btn-compact" style="height:1.6rem !important; padding:0 0.45rem !important;" onclick="deleteStudyNoteConfirm('${note.id}')" title="Delete Note">
              <i data-lucide="trash-2" class="icon-xs"></i>
            </button>
          </div>
        </div>

        <div class="reader-title-row">
          <div>
            <h1 class="reader-title">${escapeHtml(note.title)}</h1>
            ${note.summary ? `<div class="reader-summary">${escapeHtml(note.summary)}</div>` : ''}
          </div>
          <span style="font-size:0.68rem; color:var(--muted-foreground);" class="desktop-only-btn">
            💡 Select text to Highlight / Pin / Cloze • Double-click paragraph to edit
          </span>
        </div>
      </div>

      ${pinsAndOutlineHtml}

      <div class="reader-body">
        ${isCornellMode ? `
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
          <input type="text" id="reader-quick-append-input" class="form-input" style="height:1.95rem; font-size:0.8125rem;" placeholder="Quick append paragraph, ## Heading, or > [!PIN: Title] text... (Press Enter)" onkeydown="if(event.key==='Enter'){event.preventDefault(); window.quickAppendToNote('${note.id}');}">
          <button type="button" class="btn btn-secondary btn-compact" style="height:1.95rem !important;" onclick="window.quickAppendToNote('${note.id}')">
            <i data-lucide="plus" class="icon-xs"></i> Append
          </button>
        </div>

        ${takeaways.length > 0 ? `
          <section class="study-section-box">
            <div class="study-section-title">
              <div style="display:flex; align-items:center; gap:0.35rem;">
                <i data-lucide="sparkles" class="icon-xs" style="color:#8b5cf6;"></i>
                <span>Flashcards &amp; Key Takeaways (${takeaways.length})</span>
              </div>
              <button type="button" class="btn-tiny" onclick="openFlashcardDeck('${note.id}')">
                <i data-lucide="play" class="icon-xs"></i> Practice
              </button>
            </div>
            <div>
              ${takeaways.map((card, idx) => `
                <div class="takeaway-item">
                  <div class="takeaway-q" onclick="const ans = this.nextElementSibling; ans.style.display = ans.style.display === 'none' ? 'block' : 'none';">
                    <span><strong style="color:var(--primary);">Q${idx + 1}:</strong> ${escapeHtml(card.question)}</span>
                    <span class="badge badge-USER" style="font-size:0.6rem; flex-shrink:0;">Answer</span>
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
      if (sectionMarkerModal && sectionMarkerModal.classList.contains('open')) closeSectionMarkerModal();
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

  window.openStudyNoteModal = function(noteId = null) {
    editingNoteId = noteId;
    if (noteForm) noteForm.reset();
    if (takeawaysContainer) takeawaysContainer.innerHTML = '';
    if (resourcesContainer) resourcesContainer.innerHTML = '';
    switchEditorTab('write');

    if (noteId) {
      const note = notesList.find(n => n.id === noteId);
      if (note) {
        if (noteModalTitle) noteModalTitle.innerHTML = `<i data-lucide="pencil" class="icon-sm"></i><span>Edit Study Note</span>`;
        if (noteSubmitBtn) noteSubmitBtn.textContent = 'Update Note';
        populateSubjectDropdown(note.subjectId || '');
        document.getElementById('note-mastery-select').value = note.mastery || 'LEARNING';
        document.getElementById('note-title-input').value = note.title || '';
        const chInput = document.getElementById('note-chapter-input');
        if (chInput) chInput.value = note.chapter || '';
        document.getElementById('note-summary-input').value = note.summary || '';
        document.getElementById('note-content-input').value = note.content || '';
        document.getElementById('note-tags-input').value = (note.tags || []).join(', ');
        document.getElementById('note-pinned-input').checked = Boolean(note.pinned);

        (note.takeaways || []).forEach(c => addTakeawayRow(c.question, c.answer));
        (note.resources || []).forEach(r => addResourceRow(r.title, r.url));
      }
    } else {
      if (noteModalTitle) noteModalTitle.innerHTML = `<i data-lucide="file-plus-2" class="icon-sm"></i><span>New Study Note</span>`;
      if (noteSubmitBtn) noteSubmitBtn.textContent = 'Save Note';
      populateSubjectDropdown();
    }

    if (noteModal) {
      noteModal.classList.add('open');
      setTimeout(() => document.getElementById('note-title-input')?.focus(), 50);
    }
    if (window.lucide) lucide.createIcons();
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

    const noteTextarea = document.getElementById('note-content-input');
    const isEditorOpen = noteModal && noteModal.classList.contains('open') && document.activeElement === noteTextarea;

    if (isEditorOpen && noteTextarea) {
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
