document.addEventListener('DOMContentLoaded', async () => {
  let currentUser = null;
  let subjectsData = null;
  let notesList = [];
  let activeSubjectId = 'ALL';
  let activeMastery = 'ALL';
  let searchQuery = '';
  let selectedNoteId = null;
  let editingSubjectId = null;

  // Document View & Theme State
  let isReadMode = false;
  let isCramMode = false;
  let isSidebarCollapsed = window.innerWidth <= 768;
  let docTheme = localStorage.getItem('pk_doc_theme') || 'light'; // 'light' | 'sepia' | 'dark'
  let docFont = localStorage.getItem('pk_doc_font') || 'sans';    // 'sans' | 'serif' | 'calibri' | 'mono'
  let paperPattern = localStorage.getItem('pk_doc_pattern') || 'plain'; // 'plain' | 'lined' | 'dots' | 'grid'
  let docZoom = Number(localStorage.getItem('pk_doc_zoom')) || 100; // 80..150
  let isFullWidthNotepad = localStorage.getItem('pk_doc_fullwidth') === 'true';

  // Pomodoro State
  let pomoSeconds = 25 * 60;
  let pomoInterval = null;

  // Active Table Cell Reference
  let activeTableCell = null;

  // Ordering State (1 -> N by default)
  let notesSortMode = localStorage.getItem('pk_notes_sort') || 'custom_asc';
  let customNoteOrder = [];
  try {
    customNoteOrder = JSON.parse(localStorage.getItem('pk_custom_note_order') || '[]');
    if (!Array.isArray(customNoteOrder)) customNoteOrder = [];
  } catch (e) {
    customNoteOrder = [];
  }
  let collapsedChapters = new Set();

  // Saved Selection Range inside Word Editor for Modal Insertions
  let savedSelectionRange = null;
  let autoSaveTimer = null;

  // Flashcard Deck State
  let flashcardDeck = [];
  let flashcardIndex = 0;
  let flashcardShowingAnswer = false;

  const CHART_PALETTE = ['#4f46e5', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9', '#8b5cf6', '#ef4444', '#14b8a6'];

  // DOM Elements
  const workspaceEl = document.getElementById('study-workspace');
  const sidebarSubjectFilter = document.getElementById('sidebar-subject-filter');
  const editActiveStudyBtn = document.getElementById('edit-active-study-btn');
  const notesListHeading = document.getElementById('notes-list-heading');
  const notesListEl = document.getElementById('study-notes-list');
  const searchInput = document.getElementById('study-search-input');
  const sidebarOutlineList = document.getElementById('sidebar-outline-list');

  // Top Bar Elements
  const topTitleInput = document.getElementById('top-doc-title-input');
  const topSubjectSelect = document.getElementById('top-doc-subject-select');
  const topChapterInput = document.getElementById('top-doc-chapter-input');
  const topMasterySelect = document.getElementById('top-doc-mastery-select');
  const saveStatusEl = document.getElementById('word-save-status');
  const metricFlashcards = document.getElementById('metric-flashcards');

  // Paper Sheet & Editor Surface Elements
  const deskAreaEl = document.getElementById('study-reader-pane');
  const paperSheetEl = document.getElementById('word-paper-sheet');
  const sheetTitleInput = document.getElementById('sheet-title-input');
  const sheetSummaryInput = document.getElementById('sheet-summary-input');
  const editorSurface = document.getElementById('word-editor-surface');
  const sheetFooterNav = document.getElementById('word-sheet-footer-nav');

  // Status Bar & Read Mode Bar
  const statusOutlineSelect = document.getElementById('status-outline-select');
  const statusWordCount = document.getElementById('status-word-count');
  const statusCharCount = document.getElementById('status-char-count');
  const statusReadTime = document.getElementById('status-read-time');
  const statusZoomLabel = document.getElementById('status-zoom-label');
  const layoutModeBtn = document.getElementById('layout-mode-btn');
  const readModeFloatingBar = document.getElementById('read-mode-floating-bar');
  const readModePageSelect = document.getElementById('read-mode-page-select');

  // Modals
  const subjectModal = document.getElementById('study-subject-modal');
  const subjectForm = document.getElementById('study-subject-form');
  const chartModal = document.getElementById('chart-builder-modal');
  const whiteboardModal = document.getElementById('whiteboard-modal');
  const codeEditorModal = document.getElementById('code-editor-modal');
  const diagramModal = document.getElementById('diagram-builder-modal');
  const aiPromptModal = document.getElementById('ai-prompt-modal');
  const flashcardModal = document.getElementById('flashcard-modal');

  let editingCodeCardEl = null;
  let editingDrawingTargetEl = null;

  // ======================================================
  // 1. INITIALIZATION & APPEARANCE SYNC
  // ======================================================
  try {
    const authRes = await apiRequest('/api/auth/me');
    if (authRes && authRes.user) {
      currentUser = authRes.user;
    } else {
      return;
    }
  } catch (e) {
    return;
  }

  renderDesktopSidebar('study', currentUser, subjectsData, activeSubjectId, activeMastery);

  // Mobile App Sidebar Drawer Trigger (#mobile-menu-btn)
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
      const sb = document.querySelector('.desktop-sidebar');
      if (sb) sb.classList.toggle('mobile-open');
    });
  }

  const sortSelectEl = document.getElementById('notes-sort-select');
  if (sortSelectEl) sortSelectEl.value = notesSortMode;

  const fontSelectEl = document.getElementById('ribbon-font-family');
  if (fontSelectEl) fontSelectEl.value = docFont;

  const patternSelectEl = document.getElementById('paper-pattern-select');
  if (patternSelectEl) patternSelectEl.value = paperPattern;

  syncWorkspaceAppearance();
  await refreshAllStudyData();

  function syncWorkspaceAppearance() {
    if (workspaceEl) {
      workspaceEl.classList.toggle('sidebar-collapsed', isSidebarCollapsed);
    }
    if (paperSheetEl) {
      paperSheetEl.classList.remove(
        'doc-theme-light', 'doc-theme-sepia', 'doc-theme-dark',
        'doc-font-sans', 'doc-font-serif', 'doc-font-calibri', 'doc-font-mono',
        'paper-pattern-plain', 'paper-pattern-lined', 'paper-pattern-dots', 'paper-pattern-grid'
      );
      paperSheetEl.classList.add(`doc-theme-${docTheme}`, `doc-font-${docFont}`, `paper-pattern-${paperPattern}`);
      paperSheetEl.classList.toggle('notepad-full-width', isFullWidthNotepad);
    }
    if (deskAreaEl) {
      deskAreaEl.classList.remove('doc-theme-light', 'doc-theme-sepia', 'doc-theme-dark');
      deskAreaEl.classList.add(`doc-theme-${docTheme}`);
    }
    if (editorSurface) {
      editorSurface.style.fontSize = `${(docZoom / 100).toFixed(2)}rem`;
      editorSurface.setAttribute('contenteditable', isReadMode ? 'false' : 'true');
      editorSurface.classList.toggle('cram-mode-active', isCramMode);
    }
    if (sheetTitleInput) sheetTitleInput.readOnly = isReadMode;
    if (sheetSummaryInput) sheetSummaryInput.readOnly = isReadMode;
    if (statusZoomLabel) statusZoomLabel.textContent = `${docZoom}%`;
    if (layoutModeBtn) {
      layoutModeBtn.innerHTML = isFullWidthNotepad ? '<span>🖥️ Notepad Full</span>' : '<span>📄 Paper View</span>';
    }
    if (readModeFloatingBar) {
      readModeFloatingBar.style.display = isReadMode ? 'flex' : 'none';
    }
    document.body.classList.toggle('study-read-mode-active', isReadMode);
  }

  window.setPaperPattern = function(pat) {
    paperPattern = pat || 'plain';
    try { localStorage.setItem('pk_doc_pattern', paperPattern); } catch (e) {}
    syncWorkspaceAppearance();
  };

  window.toggleCramHighlightsMode = function() {
    isCramMode = !isCramMode;
    const rBtn = document.getElementById('ribbon-cram-btn');
    const rmBtn = document.getElementById('read-cram-btn');
    if (rBtn) {
      rBtn.style.background = isCramMode ? 'var(--primary)' : '';
      rBtn.style.color = isCramMode ? '#ffffff' : '';
    }
    if (rmBtn) {
      rmBtn.style.background = isCramMode ? 'var(--primary)' : '';
      rmBtn.style.color = isCramMode ? '#ffffff' : '';
    }
    syncWorkspaceAppearance();
    showToast(isCramMode ? 'Exam Cram Mode ON: showing only highlights, callouts, tables & headings' : 'Full document view restored', 'info');
  };

  window.revealAllClozesInDoc = function() {
    if (!editorSurface) return;
    editorSurface.classList.toggle('reveal-all-clozes');
  };

  window.toggleNotesSidebar = function(forceState) {
    isSidebarCollapsed = typeof forceState === 'boolean' ? forceState : !isSidebarCollapsed;
    syncWorkspaceAppearance();
  };

  window.togglePageLayoutMode = function() {
    isFullWidthNotepad = !isFullWidthNotepad;
    try { localStorage.setItem('pk_doc_fullwidth', String(isFullWidthNotepad)); } catch (e) {}
    syncWorkspaceAppearance();
  };

  window.setDocTheme = function(theme) {
    docTheme = theme;
    try { localStorage.setItem('pk_doc_theme', theme); } catch (e) {}
    syncWorkspaceAppearance();
  };

  window.applyDocFontFamily = function(fontKey) {
    docFont = fontKey || 'sans';
    try { localStorage.setItem('pk_doc_font', docFont); } catch (e) {}
    syncWorkspaceAppearance();
  };

  window.stepDocZoom = function(delta) {
    docZoom = Math.max(80, Math.min(150, docZoom + delta));
    try { localStorage.setItem('pk_doc_zoom', String(docZoom)); } catch (e) {}
    syncWorkspaceAppearance();
  };

  window.toggleReadMode = function(forceState) {
    isReadMode = typeof forceState === 'boolean' ? forceState : !isReadMode;
    if (isReadMode && window.innerWidth <= 900) {
      isSidebarCollapsed = true;
    }
    syncWorkspaceAppearance();
  };

  // ======================================================
  // 2. DATA LOADING, ORDERING (1 -> N) & SIDEBAR RENDERING
  // ======================================================
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
    return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }

  async function refreshAllStudyData() {
    await loadSubjects();
    await loadNotes();
  }

  async function loadSubjects() {
    try {
      subjectsData = await apiRequest('/api/study/subjects');
      renderDesktopSidebar('study', currentUser, subjectsData, activeSubjectId, activeMastery);
      renderSubjectSelectors();
      if (metricFlashcards) metricFlashcards.textContent = subjectsData.totalFlashcards || 0;
    } catch (err) {
      console.error('Failed to load subjects:', err);
    }
  }

  function renderSubjectSelectors() {
    if (!subjectsData) return;
    const subjects = subjectsData.subjects || [];

    // 1. Sidebar Filter Select
    if (sidebarSubjectFilter) {
      sidebarSubjectFilter.innerHTML = `
        <option value="ALL" ${activeSubjectId === 'ALL' ? 'selected' : ''}>📚 All Studies (${subjectsData.totalNotes || 0})</option>
        <option value="PINNED" ${activeSubjectId === 'PINNED' ? 'selected' : ''}>📌 Pinned Pages</option>
        ${subjects.map(s => `
          <option value="${s.id}" ${activeSubjectId === s.id ? 'selected' : ''}>🎓 ${escapeHtml(s.name)} (${s.noteCount || 0})</option>
        `).join('')}
      `;
    }

    if (editActiveStudyBtn) {
      const isSpecific = activeSubjectId !== 'ALL' && activeSubjectId !== 'PINNED' && activeSubjectId !== 'NONE';
      editActiveStudyBtn.style.display = isSpecific ? 'inline-flex' : 'none';
    }

    // 2. Topbar Subject Assignment Select
    if (topSubjectSelect) {
      const currentNote = notesList.find(n => n.id === selectedNoteId);
      const curSubjId = currentNote ? (currentNote.subjectId || '') : '';
      topSubjectSelect.innerHTML = `
        <option value="">📚 General Notebook</option>
        ${subjects.map(s => `
          <option value="${s.id}" ${curSubjId === s.id ? 'selected' : ''}>🎓 ${escapeHtml(s.name)}</option>
        `).join('')}
      `;
    }
  }

  function applyClientNotesSorting(list) {
    if (!Array.isArray(list) || list.length <= 1) return list;

    let NewlyAdded = false;
    const sortedByCreation = [...list].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    sortedByCreation.forEach(n => {
      if (!customNoteOrder.includes(n.id)) {
        customNoteOrder.push(n.id);
        NewlyAdded = true;
      }
    });
    if (NewlyAdded) {
      try { localStorage.setItem('pk_custom_note_order', JSON.stringify(customNoteOrder)); } catch (e) {}
    }

    const copy = [...list];
    copy.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (notesSortMode === 'title_asc') {
        return (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' });
      }
      if (notesSortMode === 'created_desc') {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      }
      if (notesSortMode === 'updated_desc') {
        return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      }
      const idxA = customNoteOrder.indexOf(a.id);
      const idxB = customNoteOrder.indexOf(b.id);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    });
    return copy;
  }

  window.changeNotesSortOrder = function(mode) {
    notesSortMode = mode || 'custom_asc';
    try { localStorage.setItem('pk_notes_sort', notesSortMode); } catch (e) {}
    notesList = applyClientNotesSorting(notesList);
    renderNotesList();
    renderFooterAndReadSelect();
  };

  window.moveNotePosition = function(e, noteId, direction) {
    if (e) e.stopPropagation();
    notesSortMode = 'custom_asc';
    const sortEl = document.getElementById('notes-sort-select');
    if (sortEl) sortEl.value = 'custom_asc';
    try { localStorage.setItem('pk_notes_sort', 'custom_asc'); } catch (err) {}

    const visibleIds = notesList.map(n => n.id);
    const curIdx = visibleIds.indexOf(noteId);
    const targetIdx = curIdx + direction;
    if (curIdx < 0 || targetIdx < 0 || targetIdx >= visibleIds.length) return;

    const otherId = visibleIds[targetIdx];
    visibleIds.forEach(id => {
      if (!customNoteOrder.includes(id)) customNoteOrder.push(id);
    });
    const orderIdxA = customNoteOrder.indexOf(noteId);
    const orderIdxB = customNoteOrder.indexOf(otherId);
    if (orderIdxA !== -1 && orderIdxB !== -1) {
      const tmp = customNoteOrder[orderIdxA];
      customNoteOrder[orderIdxA] = customNoteOrder[orderIdxB];
      customNoteOrder[orderIdxB] = tmp;
      try { localStorage.setItem('pk_custom_note_order', JSON.stringify(customNoteOrder)); } catch (err) {}
    }

    notesList = applyClientNotesSorting(notesList);
    renderNotesList();
    renderFooterAndReadSelect();
  };

  async function loadNotes() {
    try {
      const params = new URLSearchParams();
      if (activeSubjectId === 'PINNED') {
        params.set('pinned', 'true');
      } else if (activeSubjectId !== 'ALL') {
        params.set('subjectId', activeSubjectId);
      }
      if (activeMastery !== 'ALL') {
        params.set('mastery', activeMastery);
      }
      if (searchQuery) params.set('search', searchQuery);

      const res = await apiRequest(`/api/study/notes?${params.toString()}`);
      notesList = applyClientNotesSorting(res.notes || []);

      if (notesListHeading) {
        notesListHeading.textContent = `Pages (${notesList.length})`;
      }

      renderNotesList();

      if (selectedNoteId && notesList.some(n => n.id === selectedNoteId)) {
        const active = notesList.find(n => n.id === selectedNoteId);
        loadNoteIntoWordSheet(active);
      } else if (notesList.length > 0) {
        selectedNoteId = notesList[0].id;
        highlightSelectedPageItem();
        loadNoteIntoWordSheet(notesList[0]);
      } else {
        selectedNoteId = null;
        clearWordSheetWhenEmpty();
      }
    } catch (err) {
      console.error('Failed to load notes:', err);
    }
  }

  function renderPageItemHtml(note) {
    const isSelected = note.id === selectedNoteId;
    const seqNum = notesList.findIndex(n => n.id === note.id) + 1;
    return `
      <div class="word-page-item ${isSelected ? 'selected' : ''}" data-note-id="${note.id}" onclick="selectStudyNote('${note.id}', true)">
        <span class="word-page-num">#${seqNum}</span>
        <span class="word-page-title">
          ${note.pinned ? '<span style="color:#f59e0b;">📌</span> ' : ''}${escapeHtml(note.title || 'Untitled')}
        </span>
        <div style="display:flex; align-items:center; gap:0.12rem; flex-shrink:0;" onclick="event.stopPropagation();">
          <button type="button" class="note-order-btn" onclick="moveNotePosition(event, '${note.id}', -1)" title="Move Page Up">▲</button>
          <button type="button" class="note-order-btn" onclick="moveNotePosition(event, '${note.id}', 1)" title="Move Page Down">▼</button>
          <button type="button" class="note-order-btn note-del-btn" onclick="deleteNoteById(event, '${note.id}')" title="Delete This Page">✕</button>
        </div>
      </div>
    `;
  }

  function renderNotesList() {
    if (!notesListEl) return;

    // Update chapter datalist
    const datalist = document.getElementById('chapter-suggestions');
    if (datalist) {
      const chapters = Array.from(new Set(notesList.map(n => (n.chapter || '').trim()).filter(Boolean)));
      datalist.innerHTML = chapters.map(c => `<option value="${escapeHtml(c)}">`).join('');
    }

    if (notesList.length === 0) {
      notesListEl.innerHTML = `
        <div style="padding:1.5rem 0.75rem; text-align:center; color:#64748b; font-size:0.76rem;">
          <p style="margin-bottom:0.65rem;">No pages in this notebook yet.</p>
          <button type="button" class="btn btn-primary btn-compact" onclick="createNewBlankNote()">+ Create First Page</button>
        </div>
      `;
      return;
    }

    const hasChapters = notesList.some(n => n.chapter && n.chapter.trim());
    if (!hasChapters) {
      notesListEl.innerHTML = notesList.map(renderPageItemHtml).join('');
      return;
    }

    const groups = new Map();
    notesList.forEach(n => {
      const ch = (n.chapter && n.chapter.trim()) ? n.chapter.trim() : 'General Pages';
      if (!groups.has(ch)) groups.set(ch, []);
      groups.get(ch).push(n);
    });

    let html = '';
    groups.forEach((groupNotes, chName) => {
      const isCollapsed = collapsedChapters.has(chName);
      html += `
        <div class="notes-chapter-header" onclick="toggleChapterCollapse('${escapeJsAttr(chName)}')">
          <span>📂 ${escapeHtml(chName)}</span>
          <span>${groupNotes.length}</span>
        </div>
        ${isCollapsed ? '' : groupNotes.map(renderPageItemHtml).join('')}
      `;
    });
    notesListEl.innerHTML = html;
  }

  window.toggleChapterCollapse = function(chName) {
    if (collapsedChapters.has(chName)) collapsedChapters.delete(chName);
    else collapsedChapters.add(chName);
    renderNotesList();
  };

  function highlightSelectedPageItem() {
    document.querySelectorAll('.word-page-item').forEach(el => {
      el.classList.toggle('selected', el.getAttribute('data-note-id') === selectedNoteId);
    });
  }

  window.filterStudySubject = function(subjId) {
    activeSubjectId = subjId || 'ALL';
    renderDesktopSidebar('study', currentUser, subjectsData, activeSubjectId, activeMastery);
    renderSubjectSelectors();
    loadNotes();
  };

  window.filterStudyMastery = function(mastery) {
    activeMastery = mastery || 'ALL';
    renderDesktopSidebar('study', currentUser, subjectsData, activeSubjectId, activeMastery);
    loadNotes();
  };

  window.deleteStudySubjectConfirm = async function(id, name) {
    if (!confirm(`Delete Study "${name}"? Notes inside will be kept as General Notes.`)) return;
    try {
      await apiRequest(`/api/study/subjects/${id}`, { method: 'DELETE' });
      if (activeSubjectId === id) activeSubjectId = 'ALL';
      await refreshAllStudyData();
      showToast('Study deleted', 'info');
    } catch (e) {}
  };

  window.openFlashcardDeck = function() {
    window.openFlashcardModalForCurrent();
  };

  if (searchInput) {
    let searchDebounce = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        searchQuery = searchInput.value.trim();
        loadNotes();
      }, 220);
    });
  }

  // ======================================================
  // 3A. IDE SYNTAX HIGHLIGHTER & CODE CARD ENGINE
  // ======================================================
  function detectCodeLanguage(rawCode, explicitLang = '') {
    const clean = (explicitLang || '').trim().toLowerCase();
    if (clean) {
      if (['js', 'jsx', 'node', 'javascript'].includes(clean)) return 'javascript';
      if (['ts', 'tsx', 'typescript'].includes(clean)) return 'typescript';
      if (['py', 'python'].includes(clean)) return 'python';
      if (['sql', 'postgres', 'mysql', 'sqlite'].includes(clean)) return 'sql';
      if (['sh', 'bash', 'zsh', 'shell', 'cli', 'powershell'].includes(clean)) return 'bash';
      if (['html', 'xml', 'css', 'svg'].includes(clean)) return 'html';
      if (['json', 'yaml', 'yml'].includes(clean)) return 'json';
      if (['cs', 'csharp', 'java', 'cpp', 'c', 'go', 'rust'].includes(clean)) return 'csharp';
      if (['docker', 'dockerfile'].includes(clean)) return 'docker';
      return clean;
    }
    const sample = String(rawCode || '').trim();
    if (/^\s*(SELECT|INSERT\s+INTO|UPDATE\s+\w+|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE)\b/im.test(sample)) return 'sql';
    if (/^\s*(def\s+\w+|import\s+\w+|from\s+\w+\s+import|print\()/m.test(sample)) return 'python';
    if (/^\s*(FROM\s+\S+|RUN\s+|COPY\s+|ENTRYPOINT\s+|CMD\s+)/m.test(sample)) return 'docker';
    if (/^\s*(sudo\s+|apt-get\s+|docker\s+|kubectl\s+|git\s+|npm\s+|curl\s+|chmod\s+|#!)/m.test(sample)) return 'bash';
    if (/^\s*<[a-zA-Z!][\s\S]*>/m.test(sample)) return 'html';
    if (/^\s*\{\s*"[^"]+"\s*:/m.test(sample)) return 'json';
    return 'javascript';
  }

  function highlightCodeLineToTokens(rawLine, lang) {
    const line = String(rawLine ?? '');
    if (!line.trim()) return '&nbsp;';

    // Full-line comment detection
    const trimmed = line.trim();
    if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('--') ||
      (trimmed.startsWith('#') && !trimmed.startsWith('#include')) ||
      (trimmed.startsWith('/*') && trimmed.endsWith('*/')) ||
      (trimmed.startsWith('<!--') && trimmed.endsWith('-->'))
    ) {
      return `<span class="tok-com">${escapeHtml(line)}</span>`;
    }

    // Tokenize line into protected segments (strings & inline comments) vs code segments
    const protectedTokens = [];
    function stashToken(htmlSpan) {
      const key = `@@IDE_TOK_${protectedTokens.length}@@`;
      protectedTokens.push(htmlSpan);
      return key;
    }

    // 1. Protect inline comments (//... or --... or #... when preceded by space)
    let work = line.replace(/(\s\/\/.*$|\s--.*$|\s#.*$)/, (m) => {
      return stashToken(`<span class="tok-com">${escapeHtml(m)}</span>`);
    });

    // 2. Protect strings ("...", '...', `...`)
    work = work.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g, (m) => {
      return stashToken(`<span class="tok-str">${escapeHtml(m)}</span>`);
    });

    // Escape remaining raw characters before keyword/identifier highlighting
    let html = escapeHtml(work);

    // 3. HTML tags if HTML/XML
    if (lang === 'html') {
      html = html.replace(/(&lt;\/?[a-zA-Z0-9:-]+)(.*?)(\/?&gt;)/g, (_, openTag, attrs, closeTag) => {
        const coloredAttrs = attrs.replace(/\b([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?==)/g, '<span class="tok-prop">$1</span>');
        return `<span class="tok-tag">${openTag}</span>${coloredAttrs}<span class="tok-tag">${closeTag}</span>`;
      });
    } else {
      // 4. Control flow & query keywords (purple)
      html = html.replace(
        /\b(if|else|elif|for|while|do|switch|case|break|continue|return|try|catch|finally|throw|async|await|yield|import|from|export|default|as|WHERE|FROM|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|UNION|VALUES|SET|INTO)\b/g,
        '<span class="tok-ctrl">$1</span>'
      );

      // 5. Declaration & primary keywords (blue)
      html = html.replace(
        /\b(const|let|var|function|class|extends|new|this|super|typeof|instanceof|in|of|void|delete|def|lambda|pass|global|nonlocal|public|private|protected|static|readonly|interface|type|enum|namespace|using|package|SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TABLE|INDEX|VIEW|PRIMARY|KEY|FOREIGN|REFERENCES|DISTINCT|AS|AND|OR|NOT|IN|IS|NULL|LIKE|BETWEEN|EXISTS|CASE|WHEN|THEN|END|FROM|RUN|CMD|ENTRYPOINT|COPY|WORKDIR|ENV|EXPOSE|sudo|docker|kubectl|git|npm|node|python3?|pip|curl|grep|awk|sed|chmod|chown|systemctl)\b/g,
        '<span class="tok-kw">$1</span>'
      );

      // 6. Built-in Types, Classes & SQL functions (teal)
      html = html.replace(
        /\b(Array|Object|String|Number|Boolean|Promise|Map|Set|Date|Math|JSON|Error|RegExp|console|window|document|process|INT|INTEGER|VARCHAR|TEXT|BOOLEAN|DECIMAL|NUMERIC|TIMESTAMP|DATE|SERIAL|UUID|COUNT|SUM|AVG|MIN|MAX|COALESCE|ROUND|CAST)\b/g,
        '<span class="tok-type">$1</span>'
      );

      // 7. Booleans & Constants (greenish-gold)
      html = html.replace(
        /\b(true|false|null|undefined|NaN|Infinity|None|True|False)\b/g,
        '<span class="tok-num">$1</span>'
      );

      // 8. Numbers (integers, floats, hex)
      html = html.replace(
        /\b(0x[0-9a-fA-F]+|\d+(?:\.\d+)?%?)\b/g,
        '<span class="tok-num">$1</span>'
      );

      // 9. Function & method calls before '('
      html = html.replace(
        /\b([a-zA-Z_]\w*)(?=\s*\()/g,
        '<span class="tok-fn">$1</span>'
      );

      // 10. CLI flags (--flag or -f) & object properties (.prop)
      html = html.replace(
        /(\s)(--?[a-zA-Z0-9_-]+)/g,
        '$1<span class="tok-prop">$2</span>'
      );
      html = html.replace(
        /\.([a-zA-Z_]\w*)\b(?!\s*\()/g,
        '.<span class="tok-prop">$1</span>'
      );
    }

    // Restore stashed strings & comments
    protectedTokens.forEach((spanHtml, idx) => {
      html = html.replace(`@@IDE_TOK_${idx}@@`, spanHtml);
    });

    return html;
  }

  function renderIdeCodeCardHtml(rawCode, explicitLang = '', filename = '') {
    const cleanCode = String(rawCode || '').replace(/\r\n/g, '\n').replace(/\n$/, '');
    const lang = detectCodeLanguage(cleanCode, explicitLang);
    const lines = cleanCode.split('\n');
    const encodedRaw = encodeURIComponent(cleanCode);
    const encodedLang = encodeURIComponent(lang);
    const encodedFile = encodeURIComponent(filename || '');

    const linesHtml = lines.map((lineText, idx) => `
      <div class="ide-code-line">
        <span class="ide-line-num">${idx + 1}</span>
        <span class="ide-line-code">${highlightCodeLineToTokens(lineText, lang)}</span>
      </div>
    `).join('');

    return `
      <div class="ide-code-card" contenteditable="false" data-raw-code="${encodedRaw}" data-code-lang="${encodedLang}" data-code-file="${encodedFile}">
        <div class="ide-code-header">
          <div class="ide-header-left">
            <span class="ide-win-dots">
              <span class="ide-dot red"></span>
              <span class="ide-dot yellow"></span>
              <span class="ide-dot green"></span>
            </span>
            <span class="ide-lang-badge">${escapeHtml(lang.toUpperCase())}</span>
            ${filename ? `<span class="ide-filename-label">${escapeHtml(filename)}</span>` : ''}
          </div>
          <div class="ide-code-actions">
            <button type="button" class="ide-code-btn" onclick="editIdeCodeCard(this)" title="Edit Code in IDE Studio">✏️ Edit</button>
            <button type="button" class="ide-code-btn" onclick="copyIdeCodeCard(this)" title="Copy Raw Code">📋 Copy</button>
            <button type="button" class="ide-code-btn" onclick="removeIdeCodeCard(this)" title="Delete Code Block">✕</button>
          </div>
        </div>
        <div class="ide-code-body">${linesHtml}</div>
      </div>
    `;
  }

  function upgradeLegacyCodeBlocksInSurface() {
    if (!editorSurface) return;
    // Upgrade any plain <pre class="md-code-block"> or bare <pre> (excluding mermaid) into IDE Code Cards
    const legacyPres = Array.from(editorSurface.querySelectorAll('pre:not(.mermaid)'));
    legacyPres.forEach(pre => {
      if (pre.closest('.ide-code-card') || pre.closest('.mermaid-diagram-box')) return;
      const rawText = pre.innerText || pre.textContent || '';
      const langAttr = pre.getAttribute('data-lang') || '';
      const wrapper = document.createElement('div');
      wrapper.innerHTML = renderIdeCodeCardHtml(rawText, langAttr).trim();
      const cardEl = wrapper.firstElementChild;
      if (cardEl) pre.replaceWith(cardEl);
    });

    // Also re-highlight any existing .ide-code-card if needed
    editorSurface.querySelectorAll('.ide-code-card').forEach(card => {
      card.setAttribute('contenteditable', 'false');
    });
  }

  window.copyIdeCodeCard = function(btn) {
    const card = btn.closest('.ide-code-card');
    if (!card) return;
    const raw = decodeURIComponent(card.getAttribute('data-raw-code') || '');
    copyToClipboard(raw, 'Code snippet');
  };

  window.editIdeCodeCard = function(btn) {
    const card = btn.closest('.ide-code-card');
    if (!card) return;
    window.openCodeEditorModal(card);
  };

  window.removeIdeCodeCard = function(btn) {
    const card = btn.closest('.ide-code-card');
    if (!card) return;
    card.remove();
    window.triggerWordDocSave(false);
  };
  function parseChartConfig(rawText) {
    const cfg = { type: 'bar', title: 'Study Data Chart', unit: '', items: [] };
    const lines = String(rawText || '').split('\n').map(l => l.trim()).filter(Boolean);
    lines.forEach(line => {
      const metaMatch = line.match(/^(type|title|unit)\s*:\s*(.+)$/i);
      if (metaMatch) {
        const key = metaMatch[1].toLowerCase();
        const val = metaMatch[2].trim();
        if (key === 'type') cfg.type = val.toLowerCase();
        if (key === 'title') cfg.title = val;
        if (key === 'unit') cfg.unit = val;
        return;
      }
      const parts = line.split('|').map(p => p.trim());
      if (parts.length >= 2) {
        const num = parseFloat(parts[1].replace(/[^0-9.-]/g, ''));
        if (!Number.isNaN(num)) {
          cfg.items.push({ label: parts[0], value: num, color: parts[2] || null });
        }
      } else {
        const kv = line.match(/^([^:]+):\s*(-?\d+(?:\.\d+)?)\s*(.*)$/);
        if (kv && !['type', 'title', 'unit'].includes(kv[1].trim().toLowerCase())) {
          cfg.items.push({ label: kv[1].trim(), value: parseFloat(kv[2]), color: null });
        }
      }
    });
    if (cfg.items.length === 0) {
      cfg.items = [
        { label: 'Item A', value: 45 },
        { label: 'Item B', value: 78 },
        { label: 'Item C', value: 62 }
      ];
    }
    return cfg;
  }

  function renderSvgChartHtml(rawCode) {
    const cfg = parseChartConfig(rawCode);
    const items = cfg.items;
    const maxVal = Math.max(...items.map(i => Math.abs(i.value)), 1);
    const unitSuffix = cfg.unit ? ` ${escapeHtml(cfg.unit)}` : '';
    let svgHtml = '';

    if (cfg.type === 'pie' || cfg.type === 'doughnut') {
      const total = items.reduce((acc, it) => acc + Math.max(0, it.value), 0) || 1;
      let curAngle = -Math.PI / 2;
      const cx = 130, cy = 110, r = 82;
      const slices = items.map((it, idx) => {
        const val = Math.max(0, it.value);
        const sliceAngle = (val / total) * (Math.PI * 2);
        const endAngle = curAngle + sliceAngle;
        const x1 = cx + r * Math.cos(curAngle);
        const y1 = cy + r * Math.sin(curAngle);
        const x2 = cx + r * Math.cos(endAngle);
        const y2 = cy + r * Math.sin(endAngle);
        const largeArc = sliceAngle > Math.PI ? 1 : 0;
        const color = it.color || CHART_PALETTE[idx % CHART_PALETTE.length];
        curAngle = endAngle;
        if (items.length === 1) return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" />`;
        return `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${color}" stroke="#ffffff" stroke-width="2"/>`;
      }).join('');

      const legend = items.map((it, idx) => {
        const color = it.color || CHART_PALETTE[idx % CHART_PALETTE.length];
        const pct = Math.round((Math.max(0, it.value) / total) * 100);
        const y = 32 + idx * 24;
        return `
          <rect x="245" y="${y - 10}" width="12" height="12" rx="3" fill="${color}"/>
          <text x="264" y="${y}" font-size="11.5" font-family="Inter, sans-serif" fill="#1f2937" font-weight="600">${escapeHtml(it.label)} (${it.value}${unitSuffix} • ${pct}%)</text>
        `;
      }).join('');

      svgHtml = `
        <svg viewBox="0 0 480 220" style="width:100%; max-width:480px; height:auto;">
          ${slices}
          ${cfg.type === 'doughnut' ? `<circle cx="${cx}" cy="${cy}" r="42" fill="#ffffff"/>` : ''}
          ${legend}
        </svg>
      `;
    } else if (cfg.type === 'line' || cfg.type === 'area') {
      const w = 520, h = 220, padL = 48, padR = 24, padT = 24, padB = 38;
      const plotW = w - padL - padR;
      const plotH = h - padT - padB;
      const stepX = items.length > 1 ? plotW / (items.length - 1) : plotW / 2;
      const pts = items.map((it, i) => ({
        x: padL + (items.length > 1 ? i * stepX : plotW / 2),
        y: padT + plotH - (Math.max(0, it.value) / maxVal) * plotH,
        label: it.label,
        value: it.value
      }));
      const polyPoints = pts.map(p => `${p.x},${p.y}`).join(' ');
      const areaPoints = `${pts[0].x},${padT + plotH} ${polyPoints} ${pts[pts.length - 1].x},${padT + plotH}`;

      svgHtml = `
        <svg viewBox="0 0 ${w} ${h}" style="width:100%; max-width:520px; height:auto;">
          <line x1="${padL}" y1="${padT + plotH}" x2="${w - padR}" y2="${padT + plotH}" stroke="#cbd5e1" stroke-width="1.5"/>
          ${cfg.type === 'area' ? `<polygon points="${areaPoints}" fill="rgba(79, 70, 229, 0.16)"/>` : ''}
          <polyline fill="none" stroke="#4f46e5" stroke-width="3" points="${polyPoints}"/>
          ${pts.map(p => `
            <circle cx="${p.x}" cy="${p.y}" r="4.5" fill="#ffffff" stroke="#4f46e5" stroke-width="2.5"/>
            <text x="${p.x}" y="${p.y - 9}" font-size="10.5" font-weight="700" fill="#4f46e5" text-anchor="middle">${p.value}${unitSuffix}</text>
            <text x="${p.x}" y="${h - 12}" font-size="11" font-weight="600" fill="#374151" text-anchor="middle">${escapeHtml(p.label)}</text>
          `).join('')}
        </svg>
      `;
    } else if (cfg.type === 'hbar') {
      const rowH = 34;
      const h = Math.max(150, items.length * rowH + 36);
      const w = 500, padL = 120, padR = 65;
      const plotW = w - padL - padR;
      svgHtml = `
        <svg viewBox="0 0 ${w} ${h}" style="width:100%; max-width:500px; height:auto;">
          ${items.map((it, i) => {
            const y = 18 + i * rowH;
            const bw = Math.max(6, (Math.max(0, it.value) / maxVal) * plotW);
            const color = it.color || CHART_PALETTE[i % CHART_PALETTE.length];
            return `
              <text x="${padL - 8}" y="${y + 15}" font-size="11.5" font-weight="600" fill="#1f2937" text-anchor="end">${escapeHtml(it.label)}</text>
              <rect x="${padL}" y="${y}" width="${bw}" height="22" rx="5" fill="${color}"/>
              <text x="${padL + bw + 6}" y="${y + 15}" font-size="11" font-weight="700" fill="#111827">${it.value}${unitSuffix}</text>
            `;
          }).join('')}
        </svg>
      `;
    } else {
      const w = 520, h = 225, padL = 46, padR = 20, padT = 26, padB = 38;
      const plotW = w - padL - padR;
      const plotH = h - padT - padB;
      const slotW = plotW / items.length;
      const barW = Math.min(48, Math.max(16, slotW * 0.62));
      svgHtml = `
        <svg viewBox="0 0 ${w} ${h}" style="width:100%; max-width:520px; height:auto;">
          <line x1="${padL}" y1="${padT + plotH}" x2="${w - padR}" y2="${padT + plotH}" stroke="#cbd5e1" stroke-width="1.5"/>
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
      <div class="study-chart-card" contenteditable="false">
        <div class="study-chart-header">
          <div class="study-chart-title">
            <span>📊 ${escapeHtml(cfg.title)}</span>
          </div>
          <button type="button" class="btn-tiny" onclick="this.closest('.study-chart-card').remove(); window.triggerWordDocSave();" title="Remove Chart">✕</button>
        </div>
        <div class="study-chart-svg-wrap">${svgHtml}</div>
      </div>
    `;
  }

  function isAlreadyRichWordHtml(content) {
    if (!content) return false;
    const trimmed = content.trim();
    if (trimmed.startsWith('<!--PK_WORD_HTML-->')) return true;
    // Detect standard HTML block tags without raw markdown headings
    if (/^<(div|p|h[1-6]|table|ul|ol|blockquote|section|article)\b/i.test(trimmed) && !/^#{1,3}\s+/m.test(trimmed)) {
      return true;
    }
    return false;
  }

  function convertMarkdownToWordHtml(rawMd) {
    if (!rawMd || !rawMd.trim()) return '<p><br></p>';
    if (isAlreadyRichWordHtml(rawMd)) {
      return rawMd.replace(/^<!--PK_WORD_HTML-->\n?/, '');
    }

    let text = String(rawMd).replace(/\r\n/g, '\n');
    const codePlaceholders = [];

    // 1. Block Math $$ ... $$
    text = text.replace(/\$\$\n?([\s\S]*?)\n?\$\$/g, (_, formula) => {
      const html = `<div class="md-callout"><strong>📐 Formula:</strong> <code>${escapeHtml(formula.trim())}</code></div>`;
      const token = `@@CODEBLOCK_${codePlaceholders.length}@@`;
      codePlaceholders.push(html);
      return token;
    });

    // 2. Charts, Mermaid & Code Blocks
    text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const trimmedCode = code.replace(/\n$/, '');
      const langLower = (lang || '').toLowerCase();
      if (langLower === 'chart') {
        const token = `@@CODEBLOCK_${codePlaceholders.length}@@`;
        codePlaceholders.push(renderSvgChartHtml(trimmedCode));
        return token;
      }
      if (langLower === 'mermaid') {
        const html = `<div class="mermaid-diagram-box" contenteditable="false"><pre class="mermaid">${escapeHtml(trimmedCode)}</pre></div>`;
        const token = `@@CODEBLOCK_${codePlaceholders.length}@@`;
        codePlaceholders.push(html);
        return token;
      }
      const html = renderIdeCodeCardHtml(trimmedCode, langLower);
      const token = `@@CODEBLOCK_${codePlaceholders.length}@@`;
      codePlaceholders.push(html);
      return token;
    });

    function formatInline(line) {
      const imgTokens = [];
      let working = String(line).replace(/!\[([^\]]*)\]\((data:image\/[^)]+|https?:\/\/[^\s)]+|\/[^\s)]+)\)/g, (_, alt, src) => {
        const tok = `@@IMG_${imgTokens.length}@@`;
        imgTokens.push(`<img src="${escapeHtml(src)}" alt="${escapeHtml(alt || 'Image')}" class="md-study-img">`);
        return tok;
      });

      let s = escapeHtml(working);
      s = s.replace(/==(?:(yellow|green|purple|pink):)?(.+?)==/g, (_, color, innerText) => {
        const hlColor = color || 'yellow';
        return `<mark class="study-hl-${hlColor}">${innerText}</mark>`;
      });
      s = s.replace(/\{\{([^}]+)\}\}/g, (_, clozeText) => {
        return `<span class="cloze-pill" onclick="this.classList.toggle('revealed')" title="Click to reveal">${clozeText}</span>`;
      });
      s = s.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

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

    function closeLists() {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }
    }

    function flushTable() {
      if (!inTable || tableRows.length === 0) return;
      inTable = false;
      const headerCells = tableRows[0];
      const bodyRows = tableRows.slice(1).filter(r => !r.every(c => /^[-:\s]+$/.test(c)));
      let tbl = '<table class="md-table"><thead><tr>';
      headerCells.forEach(c => { tbl += `<th>${formatInline(c.trim())}</th>`; });
      tbl += '</tr></thead><tbody>';
      bodyRows.forEach(row => {
        tbl += '<tr>';
        row.forEach(c => { tbl += `<td>${formatInline(c.trim())}</td>`; });
        tbl += '</tr>';
      });
      tbl += '</tbody></table>';
      out.push(tbl);
      tableRows = [];
    }

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
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
        tableRows.push(trimmed.slice(1, -1).split('|'));
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
        out.push('<hr>');
        continue;
      }

      const pinMatch = trimmed.match(/^>\s*\[!PIN:\s*([^\]]+)\]\s*(.*)$/i);
      if (pinMatch) {
        closeLists();
        out.push(`
          <div class="pinned-section-block">
            <div class="pinned-section-header">📌 ${escapeHtml(pinMatch[1].trim())}</div>
            <div>${formatInline(pinMatch[2] || '')}</div>
          </div>
        `);
        continue;
      }

      if (trimmed.startsWith('### ') || trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
        closeLists();
        const level = trimmed.startsWith('### ') ? 3 : trimmed.startsWith('## ') ? 2 : 1;
        const rawHeading = trimmed.replace(/^#{1,3}\s+/, '');
        out.push(`<h${level}>${formatInline(rawHeading)}</h${level}>`);
        continue;
      }

      if (trimmed.startsWith('>')) {
        closeLists();
        out.push(`<div class="md-callout">${formatInline(trimmed.replace(/^>\s?/, ''))}</div>`);
        continue;
      }

      const checkMatch = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
      if (checkMatch) {
        if (inOl) { out.push('</ol>'); inOl = false; }
        if (!inUl) { out.push('<ul>'); inUl = true; }
        const checked = checkMatch[1].toLowerCase() === 'x';
        out.push(`<li style="list-style:none; margin-left:-1.1rem;"><label><input type="checkbox" ${checked ? 'checked' : ''}> ${formatInline(checkMatch[2])}</label></li>`);
        continue;
      }

      if (/^[-*]\s+/.test(trimmed)) {
        if (inOl) { out.push('</ol>'); inOl = false; }
        if (!inUl) { out.push('<ul>'); inUl = true; }
        out.push(`<li>${formatInline(trimmed.replace(/^[-*]\s+/, ''))}</li>`);
        continue;
      }

      if (/^\d+\.\s+/.test(trimmed)) {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (!inOl) { out.push('<ol>'); inOl = true; }
        out.push(`<li>${formatInline(trimmed.replace(/^\d+\.\s+/, ''))}</li>`);
        continue;
      }

      closeLists();
      out.push(`<p>${formatInline(trimmed)}</p>`);
    }

    closeLists();
    flushTable();
    return out.join('\n');
  }

  // ======================================================
  // 4. LOADING A NOTE INTO THE WORD / NOTEPAD SHEET
  // ======================================================
  window.selectStudyNote = function(noteId, closeMobileDrawer = false) {
    const note = notesList.find(n => n.id === noteId);
    if (!note) return;
    selectedNoteId = noteId;
    highlightSelectedPageItem();
    loadNoteIntoWordSheet(note);

    if (closeMobileDrawer && window.innerWidth <= 768) {
      isSidebarCollapsed = true;
      syncWorkspaceAppearance();
    }
  };

  function clearWordSheetWhenEmpty() {
    if (topTitleInput) topTitleInput.value = '';
    if (sheetTitleInput) sheetTitleInput.value = '';
    if (sheetSummaryInput) sheetSummaryInput.value = '';
    if (editorSurface) editorSurface.innerHTML = '';
    if (sheetFooterNav) sheetFooterNav.innerHTML = '';
    updateDocumentStatsAndOutline();
  }

  function loadNoteIntoWordSheet(note) {
    if (!note) return;

    if (topTitleInput) topTitleInput.value = note.title || '';
    if (topSubjectSelect) topSubjectSelect.value = note.subjectId || '';
    if (topChapterInput) topChapterInput.value = note.chapter || '';
    if (topMasterySelect) topMasterySelect.value = note.mastery || 'LEARNING';

    const pinBtn = document.getElementById('ribbon-pin-note-btn');
    if (pinBtn) {
      pinBtn.style.color = note.pinned ? '#d97706' : '';
      pinBtn.style.background = note.pinned ? '#fef3c7' : '';
    }

    if (sheetTitleInput) sheetTitleInput.value = note.title || '';
    if (sheetSummaryInput) sheetSummaryInput.value = note.summary || '';

    if (editorSurface) {
      editorSurface.innerHTML = convertMarkdownToWordHtml(note.content || '');
      upgradeLegacyCodeBlocksInSurface();
    }

    const scroller = document.getElementById('word-desk-scroller');
    if (scroller) scroller.scrollTop = 0;

    renderFooterAndReadSelect();
    updateDocumentStatsAndOutline();
    runMermaidDiagrams();
    if (window.lucide) lucide.createIcons();
  }

  function renderFooterAndReadSelect() {
    const note = notesList.find(n => n.id === selectedNoteId);
    if (!note) return;

    if (readModePageSelect) {
      readModePageSelect.innerHTML = notesList.map((n, i) => `
        <option value="${n.id}" ${n.id === note.id ? 'selected' : ''}>
          #${i + 1} ${escapeHtml(n.title)}${n.chapter ? ` (${escapeHtml(n.chapter)})` : ''}
        </option>
      `).join('');
    }

    if (sheetFooterNav) {
      if (notesList.length <= 1) {
        sheetFooterNav.innerHTML = '';
      } else {
        const idx = notesList.findIndex(n => n.id === note.id);
        const prev = notesList[(idx - 1 + notesList.length) % notesList.length];
        const next = notesList[(idx + 1) % notesList.length];
        sheetFooterNav.innerHTML = `
          <button type="button" class="word-action-btn" onclick="selectStudyNote('${prev.id}')">
            ← Prev: ${escapeHtml((prev.title || '').slice(0, 28))}
          </button>
          <span style="font-size:0.72rem; color:#64748b; font-weight:700;">Page ${idx + 1} of ${notesList.length}</span>
          <button type="button" class="word-action-btn" onclick="selectStudyNote('${next.id}')">
            Next: ${escapeHtml((next.title || '').slice(0, 28))} →
          </button>
        `;
      }
    }
  }

  function runMermaidDiagrams() {
    if (window.mermaid && document.querySelectorAll('.mermaid').length > 0) {
      try {
        window.mermaid.initialize({ startOnLoad: false, theme: 'default' });
        window.mermaid.run({ nodes: document.querySelectorAll('.mermaid') });
      } catch (e) {}
    }
  }

  // ======================================================
  // 5. LIVE STATS, HEADING OUTLINE & AUTO-SAVE ENGINE
  // ======================================================
  function updateDocumentStatsAndOutline() {
    if (!editorSurface) return;
    const plainText = (editorSurface.innerText || '').trim();
    const words = plainText ? plainText.split(/\s+/).filter(Boolean).length : 0;
    const chars = plainText.length;
    const readMins = Math.max(1, Math.ceil(words / 190));

    if (statusWordCount) statusWordCount.textContent = `${words} words`;
    if (statusCharCount) statusCharCount.textContent = `${chars} chars`;
    if (statusReadTime) statusReadTime.textContent = `~${readMins} min read`;

    // Build Heading Outline from H1, H2, H3 inside #word-editor-surface
    const headings = Array.from(editorSurface.querySelectorAll('h1, h2, h3'));
    headings.forEach((h, idx) => {
      if (!h.id) h.id = `doc-sec-${idx}`;
    });

    if (sidebarOutlineList) {
      if (headings.length === 0) {
        sidebarOutlineList.innerHTML = `<div style="font-size:0.72rem; color:#94a3b8; font-style:italic;">Add Heading 1 / 2 / 3 to see sections here</div>`;
      } else {
        sidebarOutlineList.innerHTML = headings.map(h => {
          const isH3 = h.tagName === 'H3';
          return `<button type="button" class="word-outline-item ${isH3 ? 'level-3' : ''}" onclick="jumpToOutlineHeading('${h.id}')">${escapeHtml(h.innerText || 'Section')}</button>`;
        }).join('');
      }
    }

    if (statusOutlineSelect) {
      statusOutlineSelect.innerHTML = `
        <option value="">📑 Jump to section (${headings.length})...</option>
        ${headings.map(h => `<option value="${h.id}">${h.tagName === 'H3' ? '  ↳ ' : ''}${escapeHtml(h.innerText || 'Section')}</option>`).join('')}
      `;
    }
  }

  window.jumpToOutlineHeading = function(domId) {
    if (!domId) return;
    const el = document.getElementById(domId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (window.innerWidth <= 768) {
        isSidebarCollapsed = true;
        syncWorkspaceAppearance();
      }
    }
  };

  function setSaveIndicator(state) {
    if (!saveStatusEl) return;
    if (state === 'saving') {
      saveStatusEl.textContent = '● Saving...';
      saveStatusEl.style.color = '#d97706';
    } else if (state === 'saved') {
      saveStatusEl.textContent = '✓ Saved';
      saveStatusEl.style.color = '#10b981';
    }
  }

  window.triggerWordDocSave = function(immediate = false) {
    if (!selectedNoteId) return;
    setSaveIndicator('saving');
    updateDocumentStatsAndOutline();

    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async () => {
      const note = notesList.find(n => n.id === selectedNoteId);
      if (!note || !editorSurface) return;

      const serializedHtml = `<!--PK_WORD_HTML-->\n${editorSurface.innerHTML}`;
      const newTitle = (sheetTitleInput?.value || topTitleInput?.value || 'Untitled Page').trim();
      const newSummary = (sheetSummaryInput?.value || '').trim();

      try {
        const res = await apiRequest(`/api/study/notes/${note.id}`, {
          method: 'PUT',
          body: {
            title: newTitle,
            summary: newSummary,
            content: serializedHtml
          }
        });
        Object.assign(note, res.note);
        setSaveIndicator('saved');
        renderNotesList();
      } catch (e) {
        console.error('Auto-save failed:', e);
      }
    }, immediate ? 20 : 650);
  };

  if (editorSurface) {
    editorSurface.addEventListener('input', () => {
      window.triggerWordDocSave(false);
    });

    // Save current cursor Range whenever user interacts with editor
    const rememberSelection = () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (editorSurface.contains(range.commonAncestorContainer)) {
          savedSelectionRange = range.cloneRange();
        }
      }
    };
    editorSurface.addEventListener('keyup', rememberSelection);
    editorSurface.addEventListener('mouseup', rememberSelection);

    // Handle checkbox clicks inside contenteditable
    editorSurface.addEventListener('change', (e) => {
      if (e.target && e.target.type === 'checkbox') {
        if (e.target.checked) e.target.setAttribute('checked', 'checked');
        else e.target.removeAttribute('checked');
        window.triggerWordDocSave(false);
      }
    });

    // Smart Paste: Images OR Markdown-to-Word auto-conversion
    editorSurface.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (items) {
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              insertHtmlAtCursor(`<img src="${reader.result}" alt="Pasted Image" class="md-study-img">`);
            };
            reader.readAsDataURL(file);
            return;
          }
        }
      }

      const htmlData = e.clipboardData?.getData('text/html');
      const plainText = e.clipboardData?.getData('text/plain') || '';
      const looksLikeMarkdown = /(?:^|\n)(?:#{1,3}\s+|```|\|.+\|\n\|[-:\s|]+\||>\s*\[!PIN:)/m.test(plainText);

      if (!htmlData && looksLikeMarkdown) {
        e.preventDefault();
        const converted = convertMarkdownToWordHtml(plainText);
        insertHtmlAtCursor(converted);
        runMermaidDiagrams();
      }
    });
  }

  // Title & Subtitle Sync
  window.handleSheetTitleInput = function(val) {
    if (topTitleInput) topTitleInput.value = val;
    window.triggerWordDocSave(false);
  };

  window.syncDocTitleFromTopbar = function(val) {
    if (sheetTitleInput) sheetTitleInput.value = val;
    window.triggerWordDocSave(true);
  };

  window.handleSheetSummaryInput = function() {
    window.triggerWordDocSave(false);
  };

  window.updateActiveNoteMeta = async function(field, value) {
    const note = notesList.find(n => n.id === selectedNoteId);
    if (!note) return;
    const body = {};
    if (field === 'subjectId') body.subjectId = value || null;
    if (field === 'chapter') body.chapter = (value || '').trim() || null;
    if (field === 'mastery') body.mastery = value || 'LEARNING';

    try {
      const res = await apiRequest(`/api/study/notes/${note.id}`, { method: 'PUT', body });
      Object.assign(note, res.note);
      await loadSubjects();
      renderNotesList();
      showToast('Page updated', 'success');
    } catch (e) {}
  };

  // ======================================================
  // 6. WORD RIBBON FORMATTING & DIRECT CURSOR INSERTIONS
  // ======================================================
  function restoreEditorSelection() {
    if (!editorSurface) return;
    editorSurface.focus();
    if (savedSelectionRange) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedSelectionRange);
    }
  }

  function insertHtmlAtCursor(htmlString) {
    restoreEditorSelection();
    document.execCommand('insertHTML', false, htmlString);
    window.triggerWordDocSave(false);
  }

  window.execDocCommand = function(cmd, val = null) {
    if (!editorSurface) return;
    editorSurface.focus();
    document.execCommand(cmd, false, val);
    window.triggerWordDocSave(false);
  };

  window.applyHeadingStyle = function(tag) {
    if (!tag || !editorSurface) return;
    editorSurface.focus();
    document.execCommand('formatBlock', false, tag);
    window.triggerWordDocSave(false);
  };

  window.applyHighlightColor = function(color) {
    if (!editorSurface) return;
    editorSurface.focus();
    document.execCommand('hiliteColor', false, color);
    window.triggerWordDocSave(false);
  };

  window.insertChecklistAtCursor = function() {
    insertHtmlAtCursor(`<p><label><input type="checkbox"> Task / study item...</label></p>`);
  };

  window.insertTableAtCursor = function() {
    const tableHtml = `
      <table class="md-table">
        <thead>
          <tr>
            <th>Column 1</th>
            <th>Column 2</th>
            <th>Column 3</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Data 1</td>
            <td>Data 2</td>
            <td>Data 3</td>
          </tr>
          <tr>
            <td>Data 4</td>
            <td>Data 5</td>
            <td>Data 6</td>
          </tr>
        </tbody>
      </table>
      <p><br></p>
    `;
    insertHtmlAtCursor(tableHtml);
  };

  window.insertCalloutBoxAtCursor = function() {
    const title = prompt('Enter Callout / Key Concept Title:', 'Key Principle') || 'Key Principle';
    const html = `
      <div class="pinned-section-block">
        <div class="pinned-section-header">📌 ${escapeHtml(title)}</div>
        <div>Write your important rule, formula, or definition here...</div>
      </div>
      <p><br></p>
    `;
    insertHtmlAtCursor(html);
  };

  window.insertCodeBlockAtCursor = function() {
    window.openCodeEditorModal(null);
  };

  // ======================================================
  // 6B. IDE CODE BLOCK STUDIO MODAL
  // ======================================================
  window.openCodeEditorModal = function(existingCard = null) {
    if (!codeEditorModal) return;
    editingCodeCardEl = existingCard || null;

    const langSelect = document.getElementById('ide-code-lang');
    const fileInput = document.getElementById('ide-code-filename');
    const codeInput = document.getElementById('ide-code-input');
    const headingEl = document.getElementById('code-modal-heading');
    const submitBtn = document.getElementById('ide-code-submit-btn');

    if (editingCodeCardEl) {
      const raw = decodeURIComponent(editingCodeCardEl.getAttribute('data-raw-code') || '');
      const lang = decodeURIComponent(editingCodeCardEl.getAttribute('data-code-lang') || 'javascript');
      const file = decodeURIComponent(editingCodeCardEl.getAttribute('data-code-file') || '');
      if (langSelect) langSelect.value = lang;
      if (fileInput) fileInput.value = file;
      if (codeInput) codeInput.value = raw;
      if (headingEl) headingEl.textContent = 'Edit IDE Code Block';
      if (submitBtn) submitBtn.textContent = 'Update Code Block';
    } else {
      // If user selected text in the editor, pre-fill the IDE with it
      const sel = window.getSelection();
      const selectedText = (sel && !sel.isCollapsed && editorSurface && editorSurface.contains(sel.anchorNode))
        ? sel.toString().trim()
        : '';
      if (codeInput && (!codeInput.value.trim() || selectedText)) {
        codeInput.value = selectedText || `// Example: Fetch & filter study records\nasync function loadStudyMetrics(subjectId) {\n  const res = await fetch(\`/api/study/notes?subject=\${subjectId}\`);\n  const data = await res.json();\n  return data.notes.filter(n => n.mastery === 'MASTERED');\n}`;
      }
      if (headingEl) headingEl.textContent = 'IDE Code Block Studio';
      if (submitBtn) submitBtn.textContent = 'Insert IDE Code Block';
    }

    codeEditorModal.classList.add('open');
    updateIdeCodePreview();
    setTimeout(() => {
      if (codeInput) codeInput.focus();
    }, 40);
  };

  window.closeCodeEditorModal = function() {
    if (codeEditorModal) codeEditorModal.classList.remove('open');
    editingCodeCardEl = null;
  };

  window.updateIdeCodePreview = function() {
    const lang = document.getElementById('ide-code-lang')?.value || 'javascript';
    const file = document.getElementById('ide-code-filename')?.value.trim() || '';
    const code = document.getElementById('ide-code-input')?.value || '';
    const previewEl = document.getElementById('ide-code-live-preview');
    if (previewEl) {
      previewEl.innerHTML = renderIdeCodeCardHtml(code, lang, file);
    }
  };

  window.loadIdeCodeSnippet = function(type) {
    const langSelect = document.getElementById('ide-code-lang');
    const fileInput = document.getElementById('ide-code-filename');
    const codeInput = document.getElementById('ide-code-input');
    if (!codeInput) return;

    const snippets = {
      js: {
        lang: 'javascript',
        file: 'service.js',
        code: `// Async API Handler with Error Recovery\nexport async function fetchUserVault(userId) {\n  try {\n    const response = await fetch(\`/api/v1/vault/\${userId}\`);\n    if (!response.ok) throw new Error('Failed to load vault');\n    const { items, total } = await response.json();\n    return items.map(item => ({ ...item, verified: true }));\n  } catch (err) {\n    console.error('[VaultError]:', err.message);\n    return [];\n  }\n}`
      },
      py: {
        lang: 'python',
        file: 'analysis.py',
        code: `# Calculate Financial Ratios & Summary Metrics\ndef compute_working_capital(assets: list, liabilities: list) -> dict:\n    total_assets = sum(item["value"] for item in assets)\n    total_liab = sum(item["value"] for item in liabilities)\n    current_ratio = round(total_assets / max(total_liab, 1), 2)\n    return {\n        "net_working_capital": total_assets - total_liab,\n        "current_ratio": current_ratio,\n        "healthy": current_ratio >= 1.5\n    }`
      },
      sql: {
        lang: 'sql',
        file: 'ledger_report.sql',
        code: `-- Monthly Revenue & Expense Aggregation\nSELECT \n  a.account_code,\n  a.account_name,\n  COUNT(t.id) AS tx_count,\n  SUM(t.debit_amount) AS total_debit,\n  SUM(t.credit_amount) AS total_credit\nFROM accounts a\nLEFT JOIN journal_entries t ON t.account_id = a.id\nWHERE t.posted_date >= '2026-01-01'\nGROUP BY a.account_code, a.account_name\nHAVING SUM(t.debit_amount) > 0\nORDER BY total_debit DESC;`
      },
      bash: {
        lang: 'bash',
        file: 'deploy.sh',
        code: `#!/usr/bin/env bash\n# Build and deploy container stack\ndocker build -t passkeeper-app:latest --no-cache .\ndocker stop passkeeper-prod || true\ndocker run -d --name passkeeper-prod -p 3000:3000 --restart unless-stopped passkeeper-app:latest\nkubectl rollout status deployment/passkeeper-api -n production`
      }
    };

    const chosen = snippets[type];
    if (!chosen) return;
    if (langSelect) langSelect.value = chosen.lang;
    if (fileInput) fileInput.value = chosen.file;
    codeInput.value = chosen.code;
    updateIdeCodePreview();
  };

  window.insertOrUpdateIdeCodeBlock = function() {
    const lang = document.getElementById('ide-code-lang')?.value || 'javascript';
    const file = document.getElementById('ide-code-filename')?.value.trim() || '';
    const code = document.getElementById('ide-code-input')?.value || '';
    if (!code.trim()) {
      showToast('Please enter some code first', 'info');
      return;
    }

    const html = renderIdeCodeCardHtml(code, lang, file);
    if (editingCodeCardEl && editorSurface && editorSurface.contains(editingCodeCardEl)) {
      const temp = document.createElement('div');
      temp.innerHTML = html.trim();
      const newCard = temp.firstElementChild;
      if (newCard) editingCodeCardEl.replaceWith(newCard);
      closeCodeEditorModal();
      window.triggerWordDocSave(true);
      showToast('Code block updated!', 'success');
    } else {
      closeCodeEditorModal();
      insertHtmlAtCursor(`${html}<p><br></p>`);
      showToast('IDE Code Block inserted!', 'success');
    }
  };

  // Support Tab key inside #ide-code-input
  const ideCodeTextarea = document.getElementById('ide-code-input');
  if (ideCodeTextarea) {
    ideCodeTextarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = ideCodeTextarea.selectionStart;
        const end = ideCodeTextarea.selectionEnd;
        ideCodeTextarea.value = `${ideCodeTextarea.value.substring(0, start)}  ${ideCodeTextarea.value.substring(end)}`;
        ideCodeTextarea.selectionStart = ideCodeTextarea.selectionEnd = start + 2;
        updateIdeCodePreview();
      }
    });
  }

  // ======================================================
  // 7. CREATE NEW BLANK PAGE, PIN, DELETE & EXPORT
  // ======================================================
  window.createNewBlankNote = async function() {
    const targetSubjectId = (activeSubjectId !== 'ALL' && activeSubjectId !== 'PINNED' && activeSubjectId !== 'NONE')
      ? activeSubjectId
      : null;

    try {
      const nextNum = notesList.length + 1;
      const res = await apiRequest('/api/study/notes', {
        method: 'POST',
        body: {
          title: `Page #${nextNum}: New Study Note`,
          subjectId: targetSubjectId,
          mastery: 'LEARNING',
          summary: '',
          content: '<!--PK_WORD_HTML-->\n<h2>Overview</h2><p>Start typing your notes here...</p>'
        }
      });

      const created = res.note;
      if (!customNoteOrder.includes(created.id)) {
        customNoteOrder.push(created.id);
        try { localStorage.setItem('pk_custom_note_order', JSON.stringify(customNoteOrder)); } catch (e) {}
      }

      if (isReadMode) window.toggleReadMode(false);
      selectedNoteId = created.id;
      await refreshAllStudyData();

      if (sheetTitleInput) {
        sheetTitleInput.focus();
        sheetTitleInput.select();
      }
      showToast('New page created!', 'success');
    } catch (err) {
      showToast('Could not create page', 'error');
    }
  };

  window.togglePinActiveNote = async function() {
    const note = notesList.find(n => n.id === selectedNoteId);
    if (!note) return;
    try {
      const res = await apiRequest(`/api/study/notes/${note.id}`, {
        method: 'PUT',
        body: { pinned: !note.pinned }
      });
      Object.assign(note, res.note);
      notesList = applyClientNotesSorting(notesList);
      renderNotesList();
      loadNoteIntoWordSheet(note);
      showToast(note.pinned ? 'Page pinned!' : 'Page unpinned', 'info');
    } catch (e) {}
  };

  window.deleteNoteById = async function(event, noteId) {
    if (event) event.stopPropagation();
    const targetId = noteId || selectedNoteId;
    const note = notesList.find(n => n.id === targetId);
    if (!note) {
      showToast('No page selected to delete', 'info');
      return;
    }
    if (!confirm(`Delete page "${note.title || 'Untitled'}"?`)) return;

    // Cancel any pending auto-save for the deleted note
    clearTimeout(autoSaveTimer);

    const currentIdx = notesList.findIndex(n => n.id === note.id);
    const nextCandidate = notesList[currentIdx + 1] || notesList[currentIdx - 1] || null;

    try {
      await apiRequest(`/api/study/notes/${note.id}`, { method: 'DELETE' });
      customNoteOrder = customNoteOrder.filter(id => id !== note.id);
      try { localStorage.setItem('pk_custom_note_order', JSON.stringify(customNoteOrder)); } catch (e) {}

      if (selectedNoteId === note.id) {
        selectedNoteId = nextCandidate ? nextCandidate.id : null;
      }
      await refreshAllStudyData();
      showToast('Page deleted', 'info');
    } catch (e) {
      showToast('Could not delete page', 'error');
    }
  };

  window.deleteActiveNote = async function() {
    await window.deleteNoteById(null, selectedNoteId);
  };

  window.exportActiveNoteDoc = function() {
    const note = notesList.find(n => n.id === selectedNoteId);
    if (!note || !editorSurface) return;
    const textContent = `# ${note.title}\n${note.summary ? `> ${note.summary}\n` : ''}\n${editorSurface.innerText}`;
    const blob = new Blob([textContent], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(note.title || 'study-note').replace(/[^a-z0-9-_]+/gi, '-')}.md`;
    a.click();
  };

  // ======================================================
  // 8. CHART BUILDER MODAL (INSERTS SVG CHART INTO PAGE)
  // ======================================================
  window.openChartBuilderModal = function() {
    if (!chartModal) return;
    const rowsEl = document.getElementById('studio-chart-rows');
    if (rowsEl && rowsEl.children.length === 0) {
      const defaults = [
        { label: 'Q1', val: 45 },
        { label: 'Q2', val: 78 },
        { label: 'Q3', val: 94 },
        { label: 'Q4', val: 125 }
      ];
      rowsEl.innerHTML = defaults.map(d => `
        <div class="chart-data-row" style="display:grid; grid-template-columns:1.2fr 0.8fr auto; gap:0.35rem; align-items:center;">
          <input type="text" class="form-input chart-row-label" style="height:1.75rem; font-size:0.78rem;" value="${d.label}" oninput="updateChartModalPreview()">
          <input type="number" step="any" class="form-input chart-row-val" style="height:1.75rem; font-size:0.78rem;" value="${d.val}" oninput="updateChartModalPreview()">
          <button type="button" class="btn-tiny" onclick="this.parentElement.remove(); updateChartModalPreview();">✕</button>
        </div>
      `).join('');
    }
    chartModal.classList.add('open');
    updateChartModalPreview();
  };

  window.closeChartBuilderModal = function() {
    if (chartModal) chartModal.classList.remove('open');
  };

  window.addChartModalRow = function() {
    const rowsEl = document.getElementById('studio-chart-rows');
    if (!rowsEl) return;
    const div = document.createElement('div');
    div.className = 'chart-data-row';
    div.style.cssText = 'display:grid; grid-template-columns:1.2fr 0.8fr auto; gap:0.35rem; align-items:center;';
    div.innerHTML = `
      <input type="text" class="form-input chart-row-label" style="height:1.75rem; font-size:0.78rem;" placeholder="Label" value="New" oninput="updateChartModalPreview()">
      <input type="number" step="any" class="form-input chart-row-val" style="height:1.75rem; font-size:0.78rem;" placeholder="Value" value="50" oninput="updateChartModalPreview()">
      <button type="button" class="btn-tiny" onclick="this.parentElement.remove(); updateChartModalPreview();">✕</button>
    `;
    rowsEl.appendChild(div);
    updateChartModalPreview();
  };

  function serializeChartModalCode() {
    const title = document.getElementById('studio-chart-title')?.value.trim() || 'Study Chart';
    const type = document.getElementById('studio-chart-type')?.value || 'bar';
    const unit = document.getElementById('studio-chart-unit')?.value.trim() || '';
    const rows = [];
    document.querySelectorAll('#studio-chart-rows .chart-data-row').forEach(r => {
      const lbl = r.querySelector('.chart-row-label')?.value.trim();
      const val = r.querySelector('.chart-row-val')?.value.trim();
      if (lbl && val !== '' && !Number.isNaN(Number(val))) {
        rows.push(`${lbl} | ${Number(val)}`);
      }
    });
    return `type: ${type}\ntitle: ${title}${unit ? `\nunit: ${unit}` : ''}\n${rows.join('\n')}`;
  }

  window.updateChartModalPreview = function() {
    const prev = document.getElementById('studio-chart-live-preview');
    if (prev) prev.innerHTML = renderSvgChartHtml(serializeChartModalCode());
  };

  window.insertChartFromModal = function() {
    const html = `${renderSvgChartHtml(serializeChartModalCode())}<p><br></p>`;
    closeChartBuilderModal();
    insertHtmlAtCursor(html);
  };

  // ======================================================
  // 9. UPGRADED WHITEBOARD & DIAGRAM STUDIO MODAL
  // ======================================================
  let wbTool = 'pen';
  let wbColor = '#0f172a';
  let wbStrokeSize = 2.5;
  let wbShapeFill = false;
  let wbDashed = false;
  let wbBgMode = 'dots'; // 'dots' | 'grid' | 'plain' | 'dark'
  let wbHistory = [];
  let wbRedoStack = [];
  let wbTextPt = null;

  function getWbCanvasBgColor() {
    return wbBgMode === 'dark' ? '#0f172a' : '#ffffff';
  }

  function hexToRgba(hex, alpha = 0.16) {
    const clean = String(hex || '#4f46e5').replace('#', '');
    if (clean.length !== 6) return `rgba(79, 70, 229, ${alpha})`;
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  window.openWhiteboardModal = function(existingImgEl = null) {
    if (!whiteboardModal) return;
    editingDrawingTargetEl = existingImgEl || null;
    const submitBtn = document.getElementById('wb-submit-btn');
    const captionInput = document.getElementById('wb-caption-input');

    if (editingDrawingTargetEl) {
      if (submitBtn) submitBtn.textContent = 'Update Drawing on Page';
      const fig = editingDrawingTargetEl.closest('.study-drawing-figure');
      const capEl = fig ? fig.querySelector('.study-drawing-caption') : null;
      if (captionInput) captionInput.value = capEl ? capEl.textContent : '';
    } else {
      if (submitBtn) submitBtn.textContent = 'Insert Drawing into Page';
      if (captionInput) captionInput.value = '';
    }

    whiteboardModal.classList.add('open');
    setTimeout(() => {
      initWhiteboardCanvas(editingDrawingTargetEl ? editingDrawingTargetEl.src : null);
    }, 40);
  };

  window.closeWhiteboardModal = function() {
    hideWbFloatingTextInput(false);
    if (whiteboardModal) whiteboardModal.classList.remove('open');
    editingDrawingTargetEl = null;
  };

  window.setWbTool = function(tool, btn) {
    commitWbFloatingTextIfOpen();
    wbTool = tool;
    document.querySelectorAll('.wb-tool-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
  };

  window.setWbColor = function(col, btn) {
    wbColor = col;
    const picker = document.getElementById('wb-custom-color');
    if (picker && /^#[0-9a-fA-F]{6}$/.test(col)) picker.value = col;
    document.querySelectorAll('#whiteboard-modal .sel-color-dot').forEach(d => {
      d.style.borderColor = 'transparent';
    });
    if (btn) btn.style.borderColor = '#111827';
  };

  window.setWbStrokeSize = function(size, btn) {
    wbStrokeSize = Number(size) || 2.5;
    document.querySelectorAll('#whiteboard-modal [data-wb-size]').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
  };

  window.toggleWbShapeFill = function(btn) {
    wbShapeFill = !wbShapeFill;
    if (btn) {
      btn.classList.toggle('active', wbShapeFill);
      btn.textContent = wbShapeFill ? '🎨 Fill: ON' : '🎨 Fill: OFF';
    }
  };

  window.toggleWbDashed = function(btn) {
    wbDashed = !wbDashed;
    if (btn) btn.classList.toggle('active', wbDashed);
  };

  window.setWhiteboardBackground = function(mode) {
    wbBgMode = mode || 'dots';
    const wrap = document.getElementById('whiteboard-canvas-wrap');
    if (!wrap) return;
    if (wbBgMode === 'dots') {
      wrap.style.backgroundColor = '#ffffff';
      wrap.style.backgroundImage = 'radial-gradient(#cbd5e1 1px, transparent 1px)';
      wrap.style.backgroundSize = '18px 18px';
    } else if (wbBgMode === 'grid') {
      wrap.style.backgroundColor = '#ffffff';
      wrap.style.backgroundImage = 'linear-gradient(to right, #e2e8f0 1px, transparent 1px), linear-gradient(to bottom, #e2e8f0 1px, transparent 1px)';
      wrap.style.backgroundSize = '22px 22px';
    } else if (wbBgMode === 'plain') {
      wrap.style.backgroundColor = '#ffffff';
      wrap.style.backgroundImage = 'none';
    } else if (wbBgMode === 'dark') {
      wrap.style.backgroundColor = '#0f172a';
      wrap.style.backgroundImage = 'radial-gradient(#334155 1px, transparent 1px)';
      wrap.style.backgroundSize = '18px 18px';
    }
  };

  function pushWbHistorySnapshot(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    wbHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (wbHistory.length > 40) wbHistory.shift();
    wbRedoStack = [];
  }

  function drawArrowHead(ctx, fromX, fromY, toX, toY, radius = 12) {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.beginPath();
    ctx.setLineDash([]);
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - radius * Math.cos(angle - Math.PI / 6), toY - radius * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - radius * Math.cos(angle + Math.PI / 6), toY - radius * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = wbColor;
    ctx.fill();
  }

  function drawRoundedRectPath(ctx, x, y, w, h, r) {
    const rx = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    const left = Math.min(x, x + w);
    const top = Math.min(y, y + h);
    const width = Math.abs(w);
    const height = Math.abs(h);
    ctx.beginPath();
    ctx.moveTo(left + rx, top);
    ctx.lineTo(left + width - rx, top);
    ctx.quadraticCurveTo(left + width, top, left + width, top + rx);
    ctx.lineTo(left + width, top + height - rx);
    ctx.quadraticCurveTo(left + width, top + height, left + width - rx, top + height);
    ctx.lineTo(left + rx, top + height);
    ctx.quadraticCurveTo(left, top + height, left, top + height - rx);
    ctx.lineTo(left, top + rx);
    ctx.quadraticCurveTo(left, top, left + rx, top);
    ctx.closePath();
  }

  function hideWbFloatingTextInput(commit = false) {
    const inp = document.getElementById('wb-floating-text-input');
    const canvas = document.getElementById('study-whiteboard-canvas');
    if (!inp) return;
    if (commit && wbTextPt && inp.value.trim() && canvas) {
      const ctx = canvas.getContext('2d');
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
      const fontSize = wbStrokeSize >= 8 ? 22 : wbStrokeSize >= 4.5 ? 17 : 14;
      ctx.font = `bold ${fontSize}px Inter, -apple-system, sans-serif`;
      ctx.fillStyle = wbColor;
      ctx.fillText(inp.value.trim(), wbTextPt.canvasX, wbTextPt.canvasY);
      ctx.restore();
      pushWbHistorySnapshot(canvas);
    }
    inp.value = '';
    inp.style.display = 'none';
    wbTextPt = null;
  }

  function commitWbFloatingTextIfOpen() {
    const inp = document.getElementById('wb-floating-text-input');
    if (inp && inp.style.display !== 'none') {
      hideWbFloatingTextInput(true);
    }
  }

  function initWhiteboardCanvas(preloadDataUrl = null) {
    const canvas = document.getElementById('study-whiteboard-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (preloadDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.fillStyle = getWbCanvasBgColor();
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        wbHistory = [ctx.getImageData(0, 0, canvas.width, canvas.height)];
        wbRedoStack = [];
      };
      img.src = preloadDataUrl;
    } else if (wbHistory.length === 0) {
      ctx.fillStyle = getWbCanvasBgColor();
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      wbHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    }

    const floatingInp = document.getElementById('wb-floating-text-input');
    if (floatingInp && !floatingInp.dataset.bound) {
      floatingInp.dataset.bound = '1';
      floatingInp.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          hideWbFloatingTextInput(true);
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
          hideWbFloatingTextInput(false);
        }
      });
    }

    let drawing = false, startX = 0, startY = 0, snapshot = null;
    function getPt(e) {
      const r = canvas.getBoundingClientRect();
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (cx - r.left) * (canvas.width / r.width),
        y: (cy - r.top) * (canvas.height / r.height),
        domX: cx - r.left,
        domY: cy - r.top
      };
    }

    canvas.onpointerdown = (e) => {
      const pt = getPt(e);
      if (wbTool === 'text') {
        commitWbFloatingTextIfOpen();
        if (floatingInp) {
          wbTextPt = { canvasX: pt.x, canvasY: pt.y + 6 };
          floatingInp.style.left = `${Math.max(8, Math.min(pt.domX, canvas.clientWidth - 170))}px`;
          floatingInp.style.top = `${Math.max(8, pt.domY - 14)}px`;
          floatingInp.style.color = wbColor;
          floatingInp.style.display = 'block';
          setTimeout(() => floatingInp.focus(), 15);
        }
        return;
      }

      commitWbFloatingTextIfOpen();
      drawing = true;
      startX = pt.x;
      startY = pt.y;
      snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);

      if (wbTool === 'pen' || wbTool === 'marker' || wbTool === 'eraser') {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(startX, startY);
      }
    };

    canvas.onpointermove = (e) => {
      if (!drawing) return;
      const pt = getPt(e);

      if (wbTool === 'pen' || wbTool === 'eraser') {
        ctx.globalAlpha = 1;
        ctx.setLineDash(wbDashed && wbTool === 'pen' ? [7, 5] : []);
        ctx.strokeStyle = wbTool === 'eraser' ? getWbCanvasBgColor() : wbColor;
        ctx.lineWidth = wbTool === 'eraser' ? wbStrokeSize * 6 : wbStrokeSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
        return;
      }

      if (wbTool === 'marker') {
        ctx.putImageData(snapshot, 0, 0);
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.setLineDash([]);
        ctx.strokeStyle = wbColor;
        ctx.lineWidth = wbStrokeSize * 5.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
        ctx.restore();
        return;
      }

      ctx.putImageData(snapshot, 0, 0);
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = wbColor;
      ctx.lineWidth = wbStrokeSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash(wbDashed ? [8, 6] : []);

      const w = pt.x - startX;
      const h = pt.y - startY;

      if (wbTool === 'line' || wbTool === 'arrow' || wbTool === 'darrow') {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
        if (wbTool === 'arrow' || wbTool === 'darrow') {
          drawArrowHead(ctx, startX, startY, pt.x, pt.y, 10 + wbStrokeSize);
        }
        if (wbTool === 'darrow') {
          drawArrowHead(ctx, pt.x, pt.y, startX, startY, 10 + wbStrokeSize);
        }
      } else if (wbTool === 'rect') {
        if (wbShapeFill) {
          ctx.fillStyle = hexToRgba(wbColor, 0.16);
          ctx.fillRect(startX, startY, w, h);
        }
        ctx.strokeRect(startX, startY, w, h);
      } else if (wbTool === 'roundrect') {
        drawRoundedRectPath(ctx, startX, startY, w, h, 14);
        if (wbShapeFill) {
          ctx.fillStyle = hexToRgba(wbColor, 0.16);
          ctx.fill();
        }
        ctx.stroke();
      } else if (wbTool === 'circle') {
        ctx.beginPath();
        ctx.ellipse(startX + w / 2, startY + h / 2, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, Math.PI * 2);
        if (wbShapeFill) {
          ctx.fillStyle = hexToRgba(wbColor, 0.16);
          ctx.fill();
        }
        ctx.stroke();
      } else if (wbTool === 'diamond') {
        const midX = startX + w / 2;
        const midY = startY + h / 2;
        ctx.beginPath();
        ctx.moveTo(midX, startY);
        ctx.lineTo(pt.x, midY);
        ctx.lineTo(midX, pt.y);
        ctx.lineTo(startX, midY);
        ctx.closePath();
        if (wbShapeFill) {
          ctx.fillStyle = hexToRgba(wbColor, 0.16);
          ctx.fill();
        }
        ctx.stroke();
      }
      ctx.restore();
    };

    canvas.onpointerup = () => {
      if (!drawing) return;
      drawing = false;
      ctx.restore?.();
      pushWbHistorySnapshot(canvas);
    };
  }

  window.undoWhiteboard = function() {
    commitWbFloatingTextIfOpen();
    const canvas = document.getElementById('study-whiteboard-canvas');
    if (!canvas || wbHistory.length <= 1) return;
    const popped = wbHistory.pop();
    wbRedoStack.push(popped);
    canvas.getContext('2d').putImageData(wbHistory[wbHistory.length - 1], 0, 0);
  };

  window.redoWhiteboard = function() {
    commitWbFloatingTextIfOpen();
    const canvas = document.getElementById('study-whiteboard-canvas');
    if (!canvas || wbRedoStack.length === 0) return;
    const restored = wbRedoStack.pop();
    wbHistory.push(restored);
    canvas.getContext('2d').putImageData(restored, 0, 0);
  };

  window.clearWhiteboard = function() {
    commitWbFloatingTextIfOpen();
    const canvas = document.getElementById('study-whiteboard-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = getWbCanvasBgColor();
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    pushWbHistorySnapshot(canvas);
  };

  window.importImageToWhiteboard = function(event) {
    const file = event?.target?.files?.[0];
    const canvas = document.getElementById('study-whiteboard-canvas');
    if (!file || !canvas) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext('2d');
        const scale = Math.min((canvas.width - 40) / img.width, (canvas.height - 40) / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (canvas.width - w) / 2;
        const y = (canvas.height - h) / 2;
        ctx.drawImage(img, x, y, w, h);
        pushWbHistorySnapshot(canvas);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  window.downloadWhiteboardPng = function() {
    commitWbFloatingTextIfOpen();
    const canvas = document.getElementById('study-whiteboard-canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `study-diagram-${Date.now()}.png`;
    a.click();
  };

  window.insertWhiteboardFromModal = function() {
    commitWbFloatingTextIfOpen();
    const canvas = document.getElementById('study-whiteboard-canvas');
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const caption = document.getElementById('wb-caption-input')?.value.trim() || '';

    if (editingDrawingTargetEl && editorSurface && editorSurface.contains(editingDrawingTargetEl)) {
      editingDrawingTargetEl.src = dataUrl;
      const fig = editingDrawingTargetEl.closest('.study-drawing-figure');
      if (fig) {
        let capEl = fig.querySelector('.study-drawing-caption');
        if (caption) {
          if (!capEl) {
            capEl = document.createElement('div');
            capEl.className = 'study-drawing-caption';
            fig.appendChild(capEl);
          }
          capEl.textContent = caption;
        } else if (capEl) {
          capEl.remove();
        }
      }
      closeWhiteboardModal();
      window.triggerWordDocSave(true);
      showToast('Drawing updated on page!', 'success');
      return;
    }

    closeWhiteboardModal();
    const figureHtml = `
      <div class="study-drawing-figure" contenteditable="false" title="Double-click drawing to re-open in Whiteboard Studio">
        <img src="${dataUrl}" alt="${escapeHtml(caption || 'Diagram Sketch')}" class="md-study-img study-drawing-img" style="margin:0; display:block;">
        ${caption ? `<div class="study-drawing-caption">${escapeHtml(caption)}</div>` : ''}
      </div>
      <p><br></p>
    `;
    insertHtmlAtCursor(figureHtml);
    showToast('Drawing inserted! (Double-click anytime to edit)', 'success');
  };

  // Double-click any drawing or code card inside #word-editor-surface to re-open its Studio editor
  if (editorSurface) {
    editorSurface.addEventListener('dblclick', (e) => {
      if (isReadMode) return;
      const img = e.target.closest('img');
      if (img && editorSurface.contains(img)) {
        e.preventDefault();
        window.openWhiteboardModal(img);
        return;
      }
      const codeCard = e.target.closest('.ide-code-card');
      if (codeCard && editorSurface.contains(codeCard)) {
        e.preventDefault();
        window.openCodeEditorModal(codeCard);
      }
    });
  }

  // ======================================================
  // 10. FLOWCHART / DIAGRAM BUILDER MODAL
  // ======================================================
  window.openDiagramBuilderModal = function() {
    if (!diagramModal) return;
    diagramModal.classList.add('open');
    setTimeout(updateDiagramStudioPreview, 40);
  };

  window.closeDiagramBuilderModal = function() {
    if (diagramModal) diagramModal.classList.remove('open');
  };

  window.loadDiagramPreset = function(preset) {
    const ta = document.getElementById('studio-diagram-code');
    if (!ta) return;
    const presets = {
      flowchart: `graph LR\n  A[Start] --> B{Valid?}\n  B -->|Yes| C[Action]\n  B -->|No| D[Fix]`,
      sequence: `sequenceDiagram\n  User->>API: Request\n  API->>DB: Query\n  DB-->>User: Response`,
      mindmap: `graph TD\n  Topic[Core Topic] --> B1[Branch 1]\n  Topic --> B2[Branch 2]\n  Topic --> B3[Branch 3]`,
      state: `stateDiagram-v2\n  [*] --> Active\n  Active --> Done\n  Done --> [*]`
    };
    ta.value = presets[preset] || presets.flowchart;
    updateDiagramStudioPreview();
  };

  window.updateDiagramStudioPreview = function() {
    const ta = document.getElementById('studio-diagram-code');
    const prev = document.getElementById('studio-diagram-preview');
    if (!ta || !prev) return;
    prev.innerHTML = `<pre class="mermaid">${escapeHtml(ta.value.trim())}</pre>`;
    runMermaidDiagrams();
  };

  window.insertDiagramFromModal = function() {
    const ta = document.getElementById('studio-diagram-code');
    if (!ta || !ta.value.trim()) return;
    const html = `<div class="mermaid-diagram-box" contenteditable="false"><pre class="mermaid">${escapeHtml(ta.value.trim())}</pre></div><p><br></p>`;
    closeDiagramBuilderModal();
    insertHtmlAtCursor(html);
    setTimeout(runMermaidDiagrams, 60);
  };

  // ======================================================
  // 11. AI PROMPT GENERATOR & AI PASTE CONVERTER
  // ======================================================
  function getAiInstructionSpec() {
    return `# PassKeeper Study Studio — AI Note Generation Specification

Generate comprehensive, well-structured study notes on **[INSERT TOPIC HERE]** using clean Markdown that automatically formats into my Word/Notepad Study Page:

1. Use \`## Heading 2\` and \`### Heading 3\` for clear sections.
2. Use Callout / Pinned Concept boxes for core definitions and rules:
   \`> [!PIN: Concept Title] Write the core definition or rule on this single line.\`
3. Use Markdown Tables for comparisons:
   \`\`\`markdown
   | Concept | Formula / Rule | Example |
   | --- | --- | --- |
   | Item A | Explanation | Practical case |
   \`\`\`
4. Include at least one Data Chart block:
   \`\`\`chart
   type: bar
   title: Key Comparison
   unit: %
   Category A | 35
   Category B | 65
   Category C | 90
   \`\`\`
5. Include a Mermaid Flowchart where helpful:
   \`\`\`mermaid
   graph LR
     A[Step 1] --> B[Step 2] --> C[Outcome]
   \`\`\`
6. Include syntax-highlighted IDE Code Blocks where relevant (\`javascript\`, \`python\`, \`sql\`, \`bash\`, \`json\`, \`html\`):
   \`\`\`sql
   SELECT account_name, SUM(debit) AS total FROM ledger GROUP BY account_name;
   \`\`\`
`;
  }

  window.openAiPromptModal = function() {
    if (aiPromptModal) aiPromptModal.classList.add('open');
  };

  window.closeAiPromptModal = function() {
    if (aiPromptModal) aiPromptModal.classList.remove('open');
  };

  window.copyAiPromptToClipboard = function() {
    copyToClipboard(getAiInstructionSpec(), 'AI Formatting Prompt');
  };

  window.downloadAiPromptMdFile = function() {
    const blob = new Blob([getAiInstructionSpec()], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'PassKeeper-Study-AI-Prompt.md';
    a.click();
  };

  window.insertAiContentIntoPage = function(replaceAll = false) {
    const ta = document.getElementById('ai-paste-input');
    if (!ta || !ta.value.trim() || !editorSurface) return;
    const raw = ta.value.trim();

    // Extract H1 if present to set page title
    const h1Match = raw.match(/^#\s+(.+)$/m);
    const cleanedMd = h1Match ? raw.replace(/^#\s+.+\n?/, '') : raw;
    if (h1Match && replaceAll) {
      const titleText = h1Match[1].replace(/[*`]/g, '').trim();
      if (sheetTitleInput) sheetTitleInput.value = titleText;
      if (topTitleInput) topTitleInput.value = titleText;
    }

    const html = convertMarkdownToWordHtml(cleanedMd);
    if (replaceAll) {
      editorSurface.innerHTML = html;
    } else {
      editorSurface.innerHTML += `\n${html}`;
    }

    ta.value = '';
    closeAiPromptModal();
    runMermaidDiagrams();
    window.triggerWordDocSave(true);
    showToast('AI content formatted onto page!', 'success');
  };

  // ======================================================
  // 12. STUDY SUBJECT CRUD MODAL & FLASHCARDS MODAL
  // ======================================================
  window.openStudySubjectModal = function(subj = null) {
    if (!subjectModal) return;
    editingSubjectId = subj ? subj.id : null;
    document.getElementById('subject-name-input').value = subj ? subj.name : '';
    document.getElementById('subject-desc-input').value = subj ? (subj.description || '') : '';
    document.getElementById('subject-icon-select').value = subj ? (subj.icon || 'book-open') : 'book-open';
    document.getElementById('subject-status-select').value = subj ? (subj.status || 'ACTIVE') : 'ACTIVE';
    const delBtn = document.getElementById('subject-delete-btn');
    if (delBtn) delBtn.style.display = subj ? 'inline-flex' : 'none';
    subjectModal.classList.add('open');
  };

  window.editCurrentActiveSubject = function() {
    if (!subjectsData) return;
    const s = (subjectsData.subjects || []).find(x => x.id === activeSubjectId);
    if (s) openStudySubjectModal(s);
  };

  window.closeStudySubjectModal = function() {
    if (subjectModal) subjectModal.classList.remove('open');
  };

  if (subjectForm) {
    subjectForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const colorRadio = document.querySelector('input[name="subject-color"]:checked');
      const body = {
        name: document.getElementById('subject-name-input').value.trim(),
        description: document.getElementById('subject-desc-input').value.trim(),
        icon: document.getElementById('subject-icon-select').value,
        status: document.getElementById('subject-status-select').value,
        color: colorRadio ? colorRadio.value : '#4f46e5'
      };
      try {
        if (editingSubjectId) {
          await apiRequest(`/api/study/subjects/${editingSubjectId}`, { method: 'PUT', body });
        } else {
          const res = await apiRequest('/api/study/subjects', { method: 'POST', body });
          if (res.subject) activeSubjectId = res.subject.id;
        }
        closeStudySubjectModal();
        await refreshAllStudyData();
        showToast('Study notebook saved!', 'success');
      } catch (err) {}
    });
  }

  window.deleteEditingSubject = async function() {
    if (!editingSubjectId || !confirm('Delete this Study Notebook?')) return;
    try {
      await apiRequest(`/api/study/subjects/${editingSubjectId}`, { method: 'DELETE' });
      activeSubjectId = 'ALL';
      closeStudySubjectModal();
      await refreshAllStudyData();
    } catch (e) {}
  };

  // Flashcard Deck
  window.openFlashcardModalForCurrent = function() {
    if (!flashcardModal) return;
    flashcardDeck = [];
    notesList.forEach(n => {
      (n.takeaways || []).forEach(c => {
        flashcardDeck.push({ ...c, noteTitle: n.title });
      });
    });
    flashcardIndex = 0;
    flashcardShowingAnswer = false;
    renderFlashcardStage();
    flashcardModal.classList.add('open');
  };

  window.closeFlashcardDeck = function() {
    if (flashcardModal) flashcardModal.classList.remove('open');
  };

  window.addQuickFlashcardToActiveNote = async function() {
    const note = notesList.find(n => n.id === selectedNoteId);
    const qEl = document.getElementById('quick-fc-q');
    const aEl = document.getElementById('quick-fc-a');
    if (!note || !qEl || !aEl) return;
    const q = qEl.value.trim();
    const a = aEl.value.trim();
    if (!q || !a) return;
    const updated = [...(note.takeaways || []), { question: q, answer: a }];
    try {
      const res = await apiRequest(`/api/study/notes/${note.id}`, { method: 'PUT', body: { takeaways: updated } });
      note.takeaways = res.note.takeaways;
      qEl.value = '';
      aEl.value = '';
      await loadSubjects();
      openFlashcardModalForCurrent();
      showToast('Flashcard added!', 'success');
    } catch (e) {}
  };

  function renderFlashcardStage() {
    const badge = document.getElementById('flashcard-badge');
    const text = document.getElementById('flashcard-text');
    const tag = document.getElementById('flashcard-subject-tag');
    const prog = document.getElementById('flashcard-progress');
    if (!text) return;

    if (flashcardDeck.length === 0) {
      badge.textContent = 'EMPTY';
      text.textContent = 'No flashcards yet. Add a Question & Answer above!';
      tag.textContent = '';
      prog.textContent = '0 / 0';
      return;
    }

    const card = flashcardDeck[flashcardIndex];
    badge.textContent = flashcardShowingAnswer ? 'ANSWER' : 'QUESTION (CLICK TO FLIP)';
    text.textContent = flashcardShowingAnswer ? card.answer : card.question;
    tag.textContent = `Page: ${card.noteTitle}`;
    prog.textContent = `${flashcardIndex + 1} / ${flashcardDeck.length}`;
  }

  window.flipFlashcard = function() {
    if (flashcardDeck.length === 0) return;
    flashcardShowingAnswer = !flashcardShowingAnswer;
    renderFlashcardStage();
  };

  window.prevFlashcard = function() {
    if (flashcardDeck.length === 0) return;
    flashcardIndex = (flashcardIndex - 1 + flashcardDeck.length) % flashcardDeck.length;
    flashcardShowingAnswer = false;
    renderFlashcardStage();
  };

  window.nextFlashcard = function() {
    if (flashcardDeck.length === 0) return;
    flashcardIndex = (flashcardIndex + 1) % flashcardDeck.length;
    flashcardShowingAnswer = false;
    renderFlashcardStage();
  };

  // Global Keyboard Shortcuts (Ctrl+S to save, Ctrl+F Find, Ctrl+Z/Y in Whiteboard, Esc to exit Read Mode)
  document.addEventListener('keydown', (e) => {
    if (whiteboardModal && whiteboardModal.classList.contains('open') && document.activeElement?.tagName !== 'INPUT') {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        window.undoWhiteboard();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        window.redoWhiteboard();
        return;
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      window.triggerWordDocSave(true);
      showToast('Document saved!', 'success');
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      window.toggleFindReplaceBar(true);
    } else if (e.key === 'Escape') {
      if (isReadMode) window.toggleReadMode(false);
      window.toggleFindReplaceBar(false);
    }
  });

  // ======================================================
  // 13. FLOATING SELECTION MINI-TOOLBAR, TABLE TOOLS, TEMPLATES, FIND & POMODORO
  // ======================================================
  const selectionToolbar = document.getElementById('word-selection-toolbar');
  const tableToolbar = document.getElementById('word-table-toolbar');

  document.addEventListener('selectionchange', () => {
    if (!editorSurface || !selectionToolbar) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      selectionToolbar.style.display = 'none';
      return;
    }

    const anchorNode = sel.anchorNode;
    const inEditor = anchorNode && editorSurface.contains(anchorNode);

    // Check if cursor is inside a Table cell
    if (inEditor && !isReadMode) {
      const el = anchorNode.nodeType === 1 ? anchorNode : anchorNode.parentElement;
      const cell = el ? el.closest('td, th') : null;
      if (cell && editorSurface.contains(cell)) {
        activeTableCell = cell;
        if (tableToolbar) tableToolbar.style.display = 'flex';
      } else {
        activeTableCell = null;
        if (tableToolbar) tableToolbar.style.display = 'none';
      }
    }

    if (!inEditor || sel.isCollapsed || sel.toString().trim().length < 2) {
      selectionToolbar.style.display = 'none';
      return;
    }

    const range = sel.getRangeAt(0);
    savedSelectionRange = range.cloneRange();
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      selectionToolbar.style.display = 'none';
      return;
    }

    selectionToolbar.style.display = 'inline-flex';
    const tbW = selectionToolbar.offsetWidth || 340;
    const left = Math.max(10, Math.min(window.innerWidth - tbW - 10, rect.left + rect.width / 2 - tbW / 2));
    const top = Math.max(10, rect.top - 44);
    selectionToolbar.style.left = `${left}px`;
    selectionToolbar.style.top = `${top}px`;
  });

  window.wrapSelectionAsCloze = function() {
    const sel = window.getSelection();
    const text = sel && !sel.isCollapsed ? sel.toString().trim() : '';
    const targetText = text || prompt('Enter term or answer to hide inside Cloze blank:', 'Key Term');
    if (!targetText) return;
    insertHtmlAtCursor(`<span class="cloze-pill" onclick="this.classList.toggle('revealed')" title="Click to reveal">${escapeHtml(targetText)}</span>&nbsp;`);
    if (selectionToolbar) selectionToolbar.style.display = 'none';
  };

  window.pinSelectedTextAsCallout = function() {
    const sel = window.getSelection();
    const text = sel && !sel.isCollapsed ? sel.toString().trim() : '';
    if (!text) return;
    const title = prompt('Title for Pinned Concept:', 'Core Definition') || 'Core Definition';
    insertHtmlAtCursor(`
      <div class="pinned-section-block">
        <div class="pinned-section-header">📌 ${escapeHtml(title)}</div>
        <div>${escapeHtml(text)}</div>
      </div>
    `);
    if (selectionToolbar) selectionToolbar.style.display = 'none';
  };

  window.createFlashcardFromSelection = async function() {
    const sel = window.getSelection();
    const text = sel && !sel.isCollapsed ? sel.toString().trim() : '';
    const note = notesList.find(n => n.id === selectedNoteId);
    if (!text || !note) return;
    const q = prompt('Flashcard Question (Front):', `What is ${text.slice(0, 40)}?`);
    if (!q) return;
    const a = prompt('Flashcard Answer (Back):', text) || text;
    const updated = [...(note.takeaways || []), { question: q.trim(), answer: a.trim() }];
    try {
      const res = await apiRequest(`/api/study/notes/${note.id}`, { method: 'PUT', body: { takeaways: updated } });
      note.takeaways = res.note.takeaways;
      await loadSubjects();
      showToast('Flashcard created from selection!', 'success');
    } catch (e) {}
    if (selectionToolbar) selectionToolbar.style.display = 'none';
  };

  // Interactive Table Row/Column Manipulation
  window.modifyActiveTable = function(action) {
    if (!activeTableCell) return;
    const tr = activeTableCell.closest('tr');
    const table = activeTableCell.closest('table');
    if (!tr || !table) return;
    const cellIdx = Array.from(tr.children).indexOf(activeTableCell);
    const colCount = tr.children.length;

    if (action === 'row-below' || action === 'row-above') {
      const newTr = document.createElement('tr');
      for (let i = 0; i < colCount; i++) {
        const td = document.createElement('td');
        td.innerHTML = 'New cell';
        newTr.appendChild(td);
      }
      if (action === 'row-below') tr.after(newTr);
      else tr.before(newTr);
    } else if (action === 'col-right') {
      table.querySelectorAll('tr').forEach((row, rIdx) => {
        const cell = document.createElement(rIdx === 0 && row.parentElement.tagName === 'THEAD' ? 'th' : 'td');
        cell.innerHTML = rIdx === 0 ? 'Header' : 'Data';
        const ref = row.children[cellIdx];
        if (ref) ref.after(cell);
        else row.appendChild(cell);
      });
    } else if (action === 'del-row') {
      if (table.querySelectorAll('tr').length <= 1) table.remove();
      else tr.remove();
    } else if (action === 'del-col') {
      if (colCount <= 1) table.remove();
      else {
        table.querySelectorAll('tr').forEach(row => {
          if (row.children[cellIdx]) row.children[cellIdx].remove();
        });
      }
    } else if (action === 'del-table') {
      table.remove();
      activeTableCell = null;
      if (tableToolbar) tableToolbar.style.display = 'none';
    }
    window.triggerWordDocSave(false);
  };

  // Smart Document Templates
  window.insertDocumentTemplate = function(tpl) {
    if (!tpl || !editorSurface) return;
    const templates = {
      lecture: `
        <h2>1. Core Learning Objectives</h2>
        <ul>
          <li>Understand the primary concepts and definitions</li>
          <li>Apply key formulas and practical rules</li>
        </ul>
        <div class="pinned-section-block">
          <div class="pinned-section-header">📌 Core Principle</div>
          <div>Summarize the single most important rule or definition of this lesson here.</div>
        </div>
        <h2>2. Detailed Breakdown &amp; Examples</h2>
        <p>Write your detailed lecture explanation here...</p>
        <h2>3. Summary Comparison</h2>
        <table class="md-table">
          <thead><tr><th>Concept</th><th>Definition / Rule</th><th>Example</th></tr></thead>
          <tbody>
            <tr><td>Concept A</td><td>Key rule</td><td>Real-world case</td></tr>
            <tr><td>Concept B</td><td>Key rule</td><td>Real-world case</td></tr>
          </tbody>
        </table>
      `,
      cornell: `
        <div class="pinned-section-block">
          <div class="pinned-section-header">📌 Cue Questions &amp; Key Terms</div>
          <div>• What are the 3 core principles?<br>• How is the main formula applied?</div>
        </div>
        <h2>Detailed Study Notes</h2>
        <p>Record main lecture notes, diagrams, and examples here...</p>
        <h2>Summary (Bottom Takeaway)</h2>
        <div class="md-callout"><strong>Summary in 2 sentences:</strong> Write the high-level takeaway of this page.</div>
      `,
      cheatsheet: `
        <h2>Essential Formulas &amp; Definitions</h2>
        <div class="pinned-section-block">
          <div class="pinned-section-header">📌 Formula 1</div>
          <div><strong>Assets = Liabilities + Equity</strong> — Fundamental accounting identity.</div>
        </div>
        <table class="md-table">
          <thead><tr><th>Term / Metric</th><th>Formula</th><th>When to Use</th></tr></thead>
          <tbody>
            <tr><td>Metric 1</td><td><code>A / B</code></td><td>Standard evaluation</td></tr>
            <tr><td>Metric 2</td><td><code>(X - Y) * 100</code></td><td>Percentage growth</td></tr>
          </tbody>
        </table>
      `,
      case: `
        <h2>Case Study Overview</h2>
        <p><strong>Problem Statement:</strong> Describe the scenario and constraints.</p>
        <h2>Quantitative Analysis</h2>
        <table class="md-table">
          <thead><tr><th>Option</th><th>Pros</th><th>Cons</th><th>Score</th></tr></thead>
          <tbody>
            <tr><td>Option A</td><td>Fast implementation</td><td>Higher cost</td><td>8/10</td></tr>
            <tr><td>Option B</td><td>Low cost</td><td>Slower rollout</td><td>7/10</td></tr>
          </tbody>
        </table>
        <h2>Conclusion &amp; Decision</h2>
        <div class="pinned-section-block">
          <div class="pinned-section-header">📌 Final Recommendation</div>
          <div>Document the chosen approach and key justification.</div>
        </div>
      `
    };
    if (templates[tpl]) {
      insertHtmlAtCursor(templates[tpl]);
      showToast('Template inserted onto page!', 'success');
    }
  };

  // Inline Find & Replace in Document
  window.toggleFindReplaceBar = function(forceState) {
    const bar = document.getElementById('doc-find-bar');
    if (!bar) return;
    const show = typeof forceState === 'boolean' ? forceState : bar.style.display === 'none';
    bar.style.display = show ? 'flex' : 'none';
    if (show) {
      const inp = document.getElementById('doc-find-input');
      if (inp) { inp.focus(); inp.select(); }
    }
  };

  window.findNextInDoc = function() {
    const q = document.getElementById('doc-find-input')?.value;
    if (!q) return;
    window.find(q, false, false, true, false, false, false);
  };

  window.replaceInDoc = function(replaceAll = false) {
    const findVal = document.getElementById('doc-find-input')?.value;
    const repVal = document.getElementById('doc-replace-input')?.value || '';
    if (!findVal || !editorSurface) return;
    const walker = document.createTreeWalker(editorSurface, NodeFilter.SHOW_TEXT, null);
    let count = 0;
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.includes(findVal)) {
        if (replaceAll) {
          const parts = node.nodeValue.split(findVal);
          count += parts.length - 1;
          node.nodeValue = parts.join(repVal);
        } else {
          node.nodeValue = node.nodeValue.replace(findVal, repVal);
          count = 1;
          break;
        }
      }
    }
    if (count > 0) {
      window.triggerWordDocSave(false);
      showToast(`Replaced ${count} occurrence(s)`, 'success');
    } else {
      showToast('No matches found', 'info');
    }
  };

  // Pomodoro Focus Timer
  function updatePomoDisplay() {
    const el = document.getElementById('pomodoro-time-display');
    if (!el) return;
    const m = String(Math.floor(pomoSeconds / 60)).padStart(2, '0');
    const s = String(pomoSeconds % 60).padStart(2, '0');
    el.textContent = `${m}:${s}`;
  }

  window.togglePomodoroTimer = function() {
    const btn = document.getElementById('pomodoro-timer-btn');
    if (pomoInterval) {
      clearInterval(pomoInterval);
      pomoInterval = null;
      if (btn) btn.style.borderColor = '';
      showToast('Focus timer paused', 'info');
    } else {
      if (btn) btn.style.borderColor = '#10b981';
      showToast('25m Study Focus Timer started!', 'success');
      pomoInterval = setInterval(() => {
        if (pomoSeconds > 0) {
          pomoSeconds--;
          updatePomoDisplay();
        } else {
          clearInterval(pomoInterval);
          pomoInterval = null;
          pomoSeconds = 25 * 60;
          updatePomoDisplay();
          showToast('🎉 Focus session complete! Take a 5m break.', 'success');
        }
      }, 1000);
    }
  };

  window.resetPomodoroTimer = function() {
    if (pomoInterval) {
      clearInterval(pomoInterval);
      pomoInterval = null;
    }
    pomoSeconds = 25 * 60;
    updatePomoDisplay();
    showToast('Focus timer reset to 25:00', 'info');
  };
});
