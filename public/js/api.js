// API Client Helper, Toast System, and Desktop Sidebar Component

function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  toast.innerHTML = `<span style="font-weight:700">${icon}</span> <span>${message}</span>`;
  
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

async function apiRequest(url, options = {}) {
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include' // Send HTTP-Only auth_token cookie
  };

  const config = { ...defaultOptions, ...options };
  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      if ((response.status === 401 || response.status === 403) && !window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
        if (data.status === 'PENDING') {
          showToast(data.error || 'Your account is pending admin approval.', 'error');
        } else {
          window.location.href = '/login';
        }
        return;
      }
      throw new Error(data.error || 'API Request failed');
    }

    return data;
  } catch (err) {
    console.error('API Error:', err.message);
    showToast(err.message, 'error');
    throw err;
  }
}

// Copy to Clipboard Utility
async function copyToClipboard(text, label = 'Content') {
  if (!text) {
    showToast(`No ${label} to copy`, 'error');
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    showToast(`${label} copied to clipboard!`, 'success');
  } catch (err) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast(`${label} copied!`, 'success');
  }
}

// Render Desktop Sidebar Navigation across all pages
function renderDesktopSidebar(activePage = 'dashboard', currentUser = null, groupsData = null, activeGroupId = 'ALL', activeCategory = 'ALL') {
  const existingSidebar = document.querySelector('.desktop-sidebar');
  if (existingSidebar) existingSidebar.remove();

  const sidebar = document.createElement('aside');
  sidebar.className = 'desktop-sidebar';

  const isAdmin = currentUser && currentUser.role === 'ADMIN';

  const totalCount = groupsData ? (groupsData.totalCount || 0) : 0;
  const favCount = groupsData ? (groupsData.favCount || 0) : 0;
  const ungroupedCount = groupsData ? (groupsData.ungroupedCount || 0) : 0;
  const groups = groupsData ? (groupsData.groups || []) : [];
  const catCounts = (groupsData && groupsData.categoryCounts) ? groupsData.categoryCounts : {};

  const userInitial = currentUser && currentUser.name ? currentUser.name.charAt(0).toUpperCase() : (currentUser && currentUser.email ? currentUser.email.charAt(0).toUpperCase() : 'U');

  const isStudyPage = activePage === 'study';
  const studySubjects = (isStudyPage && groupsData && groupsData.subjects) ? groupsData.subjects : [];
  const studyTotalNotes = (isStudyPage && groupsData) ? (groupsData.totalNotes || 0) : 0;
  const studyPinnedCount = (isStudyPage && groupsData) ? (groupsData.pinnedCount || 0) : 0;
  const studyUnassignedCount = (isStudyPage && groupsData) ? (groupsData.unassignedCount || 0) : 0;
  const studyMasteryCounts = (isStudyPage && groupsData && groupsData.masteryCounts) ? groupsData.masteryCounts : {};

  sidebar.innerHTML = `
    <div class="sidebar-brand">
      <div class="brand-logo">
        <i data-lucide="${isStudyPage ? 'graduation-cap' : 'shield-check'}" class="icon-md"></i>
      </div>
      <div>
        <div class="brand-title">PassKeeper</div>
        <div style="font-size:0.75rem; color:var(--muted-foreground)">${isStudyPage ? 'Study & Notes Hub' : 'Encrypted Secret Vault'}</div>
      </div>
    </div>

    <!-- ── WORKSPACE SWITCHER ── -->
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.25rem; background:var(--secondary); padding:0.25rem; border-radius:var(--radius-md); margin-bottom:0.875rem; border:1px solid var(--border);">
      <a href="/dashboard" style="display:flex; align-items:center; justify-content:center; gap:0.35rem; padding:0.375rem 0.5rem; border-radius:var(--radius-sm); font-size:0.75rem; font-weight:700; text-decoration:none; transition:all 0.15s ease; ${!isStudyPage ? 'background:#ffffff; color:var(--primary); box-shadow:var(--shadow-xs);' : 'color:var(--muted-foreground);'}">
        <i data-lucide="shield" class="icon-xs"></i>
        <span>Vault</span>
      </a>
      <a href="/study" style="display:flex; align-items:center; justify-content:center; gap:0.35rem; padding:0.375rem 0.5rem; border-radius:var(--radius-sm); font-size:0.75rem; font-weight:700; text-decoration:none; transition:all 0.15s ease; ${isStudyPage ? 'background:#ffffff; color:var(--primary); box-shadow:var(--shadow-xs);' : 'color:var(--muted-foreground);'}">
        <i data-lucide="graduation-cap" class="icon-xs"></i>
        <span>Study Hub</span>
      </a>
    </div>

    <div class="sidebar-scrollable-content" style="flex:1; overflow-y:auto; overflow-x:hidden; display:flex; flex-direction:column; gap:0.2rem; padding-right:0.25rem;">
      
      ${isStudyPage ? `
        <!-- ── SECTION: STUDY OVERVIEW ── -->
        <div class="sidebar-section-header">Study Overview</div>

        <a href="javascript:void(0)" onclick="if(window.filterStudySubject){window.filterStudySubject('ALL'); if(window.filterStudyMastery) window.filterStudyMastery('ALL');}" class="sidebar-link ${activeGroupId === 'ALL' && activeCategory === 'ALL' ? 'active' : ''}">
          <i data-lucide="book-open" class="icon-sm"></i>
          <span style="flex:1;">All Study Notes</span>
          <span class="badge badge-USER" style="font-size:0.6875rem; padding: 0.1rem 0.4rem;">${studyTotalNotes}</span>
        </a>

        <a href="javascript:void(0)" onclick="if(window.filterStudySubject){window.filterStudySubject('PINNED');}" class="sidebar-link ${activeGroupId === 'PINNED' ? 'active' : ''}">
          <i data-lucide="pin" class="icon-sm" style="color:#f59e0b;"></i>
          <span style="flex:1;">Pinned Notes</span>
          <span class="badge badge-USER" style="font-size:0.6875rem; padding: 0.1rem 0.4rem;">${studyPinnedCount}</span>
        </a>

        <a href="javascript:void(0)" onclick="if(window.openFlashcardDeck){window.openFlashcardDeck();}" class="sidebar-link">
          <i data-lucide="sparkles" class="icon-sm" style="color:#8b5cf6;"></i>
          <span style="flex:1;">Flashcard Practice</span>
          <span class="badge badge-OTHER" style="font-size:0.625rem; padding: 0.1rem 0.4rem;">${(groupsData && groupsData.totalFlashcards) || 0}</span>
        </a>

        <!-- ── SECTION: MASTERY STATUS ── -->
        <div class="sidebar-section-header" style="margin-top:0.875rem;">Mastery Level</div>

        <a href="javascript:void(0)" onclick="if(window.filterStudyMastery){window.filterStudyMastery('NEW');}" class="sidebar-link sidebar-cat-link ${activeCategory === 'NEW' ? 'active' : ''}">
          <div class="sidebar-cat-bullet" style="background:#6366f1;"></div>
          <i data-lucide="circle-dot" class="icon-sm" style="color:#6366f1;"></i>
          <span style="flex:1;">New Topics</span>
          <span class="badge badge-USER" style="font-size:0.6875rem; padding: 0.1rem 0.4rem;">${studyMasteryCounts['NEW'] || 0}</span>
        </a>

        <a href="javascript:void(0)" onclick="if(window.filterStudyMastery){window.filterStudyMastery('LEARNING');}" class="sidebar-link sidebar-cat-link ${activeCategory === 'LEARNING' ? 'active' : ''}">
          <div class="sidebar-cat-bullet" style="background:#3b82f6;"></div>
          <i data-lucide="flame" class="icon-sm" style="color:#3b82f6;"></i>
          <span style="flex:1;">In Progress</span>
          <span class="badge badge-USER" style="font-size:0.6875rem; padding: 0.1rem 0.4rem;">${studyMasteryCounts['LEARNING'] || 0}</span>
        </a>

        <a href="javascript:void(0)" onclick="if(window.filterStudyMastery){window.filterStudyMastery('REVIEW');}" class="sidebar-link sidebar-cat-link ${activeCategory === 'REVIEW' ? 'active' : ''}">
          <div class="sidebar-cat-bullet" style="background:#f59e0b;"></div>
          <i data-lucide="refresh-cw" class="icon-sm" style="color:#f59e0b;"></i>
          <span style="flex:1;">Needs Review</span>
          <span class="badge badge-USER" style="font-size:0.6875rem; padding: 0.1rem 0.4rem;">${studyMasteryCounts['REVIEW'] || 0}</span>
        </a>

        <a href="javascript:void(0)" onclick="if(window.filterStudyMastery){window.filterStudyMastery('MASTERED');}" class="sidebar-link sidebar-cat-link ${activeCategory === 'MASTERED' ? 'active' : ''}">
          <div class="sidebar-cat-bullet" style="background:#10b981;"></div>
          <i data-lucide="check-circle-2" class="icon-sm" style="color:#10b981;"></i>
          <span style="flex:1;">Mastered</span>
          <span class="badge badge-USER" style="font-size:0.6875rem; padding: 0.1rem 0.4rem;">${studyMasteryCounts['MASTERED'] || 0}</span>
        </a>

        <!-- ── SECTION: MY STUDIES & COURSES ── -->
        <div style="display:flex; align-items:center; justify-content:space-between; margin-top:0.875rem; margin-bottom:0.125rem; padding: 0 0.5rem;">
          <span class="sidebar-section-header" style="margin:0; padding:0;">Studies &amp; Subjects</span>
          <button onclick="if(window.openStudySubjectModal) window.openStudySubjectModal();" class="btn-icon" style="width:1.5rem; height:1.5rem;" title="New Study Subject">
            <i data-lucide="plus" class="icon-xs"></i>
          </button>
        </div>

        <div class="sidebar-groups-list" style="display:flex; flex-direction:column; gap:0.125rem;">
          ${studySubjects.map(s => `
            <div style="display:flex; align-items:center; position:relative;" class="group-row">
              <a href="javascript:void(0)" onclick="if(window.filterStudySubject) window.filterStudySubject('${s.id}');" class="sidebar-link ${activeGroupId === s.id ? 'active' : ''}" style="flex:1; padding-right:1.75rem;">
                <i data-lucide="${s.icon || 'book-open'}" class="icon-sm" style="color:${s.color || '#4f46e5'};"></i>
                <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtmlSidebar(s.name)}</span>
                <span class="badge badge-USER" style="font-size:0.6875rem; padding: 0.1rem 0.35rem;">${s.noteCount || 0}</span>
              </a>
              <button onclick="event.stopPropagation(); if(window.deleteStudySubjectConfirm) window.deleteStudySubjectConfirm('${s.id}', '${escapeHtmlSidebar(s.name)}');" class="btn-icon delete-group-btn" style="position:absolute; right:4px; width:1.25rem; height:1.25rem; border:none; opacity:0.35; cursor:pointer;" title="Delete Study">
                <i data-lucide="x" class="icon-xs"></i>
              </button>
            </div>
          `).join('')}

          <a href="javascript:void(0)" onclick="if(window.filterStudySubject) window.filterStudySubject('NONE');" class="sidebar-link ${activeGroupId === 'NONE' ? 'active' : ''}">
            <i data-lucide="file-text" class="icon-sm" style="color:#94a3b8;"></i>
            <span style="flex:1;">General Notes</span>
            <span class="badge badge-USER" style="font-size:0.6875rem; padding: 0.1rem 0.35rem;">${studyUnassignedCount}</span>
          </a>
        </div>
      ` : `
      <!-- ── SECTION: VAULT OVERVIEW ── -->
      <div class="sidebar-section-header">Vault Overview</div>

      <a href="javascript:void(0)" onclick="if(window.filterByGroup){window.filterByGroup('ALL'); if(window.filterByCategory) window.filterByCategory('ALL');} else {window.location.href='/dashboard';}" class="sidebar-link ${activePage === 'dashboard' && activeGroupId === 'ALL' && activeCategory === 'ALL' ? 'active' : ''}">
        <i data-lucide="layout-dashboard" class="icon-sm"></i>
        <span style="flex:1;">All Items</span>
        <span class="badge badge-USER" style="font-size:0.6875rem; padding: 0.1rem 0.4rem;">${totalCount}</span>
      </a>

      <a href="javascript:void(0)" onclick="if(window.filterByGroup){window.filterByGroup('FAV');} else {window.location.href='/dashboard';}" class="sidebar-link ${activePage === 'dashboard' && activeGroupId === 'FAV' ? 'active' : ''}">
        <i data-lucide="star" class="icon-sm" style="color:#f59e0b; fill:#f59e0b;"></i>
        <span style="flex:1;">Favorites</span>
        <span class="badge badge-USER" style="font-size:0.6875rem; padding: 0.1rem 0.4rem;">${favCount}</span>
      </a>

      <a href="/study" class="sidebar-link">
        <i data-lucide="graduation-cap" class="icon-sm" style="color:#7c3aed;"></i>
        <span style="flex:1;">Study &amp; Notes Hub</span>
        <span class="badge badge-OTHER" style="font-size:0.6rem; padding: 0.1rem 0.35rem;">NEW</span>
      </a>

      <!-- ── SECTION: CATEGORIES ── -->
      <div class="sidebar-section-header" style="margin-top:0.875rem;">Categories</div>

      <a href="javascript:void(0)" onclick="if(window.filterByCategory){window.filterByCategory('DB_CONNECTION');} else {window.location.href='/dashboard';}" class="sidebar-link sidebar-cat-link ${activePage === 'dashboard' && activeCategory === 'DB_CONNECTION' ? 'active' : ''}">
        <div class="sidebar-cat-bullet" style="background:#10b981;"></div>
        <i data-lucide="database" class="icon-sm" style="color:#10b981;"></i>
        <span style="flex:1;">Connection Strings</span>
        <span class="badge badge-USER" style="font-size:0.6875rem; padding: 0.1rem 0.4rem;">${catCounts['DB_CONNECTION'] || 0}</span>
      </a>

      <a href="javascript:void(0)" onclick="if(window.filterByCategory){window.filterByCategory('PASSWORD');} else {window.location.href='/dashboard';}" class="sidebar-link sidebar-cat-link ${activePage === 'dashboard' && activeCategory === 'PASSWORD' ? 'active' : ''}">
        <div class="sidebar-cat-bullet" style="background:#6366f1;"></div>
        <i data-lucide="key-round" class="icon-sm" style="color:#6366f1;"></i>
        <span style="flex:1;">Passwords</span>
        <span class="badge badge-USER" style="font-size:0.6875rem; padding: 0.1rem 0.4rem;">${catCounts['PASSWORD'] || 0}</span>
      </a>

      <a href="javascript:void(0)" onclick="if(window.filterByCategory){window.filterByCategory('STEP_BY_STEP');} else {window.location.href='/dashboard';}" class="sidebar-link sidebar-cat-link ${activePage === 'dashboard' && activeCategory === 'STEP_BY_STEP' ? 'active' : ''}">
        <div class="sidebar-cat-bullet" style="background:#16a34a;"></div>
        <i data-lucide="book-open" class="icon-sm" style="color:#16a34a;"></i>
        <span style="flex:1;">Step-by-Step</span>
        <span class="badge badge-USER" style="font-size:0.6875rem; padding: 0.1rem 0.4rem;">${catCounts['STEP_BY_STEP'] || 0}</span>
      </a>

      <a href="javascript:void(0)" onclick="if(window.filterByCategory){window.filterByCategory('API_KEY');} else {window.location.href='/dashboard';}" class="sidebar-link sidebar-cat-link ${activePage === 'dashboard' && activeCategory === 'API_KEY' ? 'active' : ''}">
        <div class="sidebar-cat-bullet" style="background:#f59e0b;"></div>
        <i data-lucide="zap" class="icon-sm" style="color:#f59e0b;"></i>
        <span style="flex:1;">API Keys</span>
        <span class="badge badge-USER" style="font-size:0.6875rem; padding: 0.1rem 0.4rem;">${catCounts['API_KEY'] || 0}</span>
      </a>

      <a href="javascript:void(0)" onclick="if(window.filterByCategory){window.filterByCategory('SSH_KEY');} else {window.location.href='/dashboard';}" class="sidebar-link sidebar-cat-link ${activePage === 'dashboard' && activeCategory === 'SSH_KEY' ? 'active' : ''}">
        <div class="sidebar-cat-bullet" style="background:#ec4899;"></div>
        <i data-lucide="terminal" class="icon-sm" style="color:#ec4899;"></i>
        <span style="flex:1;">SSH Keys</span>
        <span class="badge badge-USER" style="font-size:0.6875rem; padding: 0.1rem 0.4rem;">${catCounts['SSH_KEY'] || 0}</span>
      </a>

      <a href="javascript:void(0)" onclick="if(window.filterByCategory){window.filterByCategory('OTHER');} else {window.location.href='/dashboard';}" class="sidebar-link sidebar-cat-link ${activePage === 'dashboard' && activeCategory === 'OTHER' ? 'active' : ''}">
        <div class="sidebar-cat-bullet" style="background:#8b5cf6;"></div>
        <i data-lucide="shield" class="icon-sm" style="color:#8b5cf6;"></i>
        <span style="flex:1;">Notes & Other</span>
        <span class="badge badge-USER" style="font-size:0.6875rem; padding: 0.1rem 0.4rem;">${catCounts['OTHER'] || 0}</span>
      </a>

      <!-- ── SECTION: FOLDERS & GROUPS ── -->
      <div style="display:flex; align-items:center; justify-content:space-between; margin-top:0.875rem; margin-bottom:0.125rem; padding: 0 0.5rem;">
        <span class="sidebar-section-header" style="margin:0; padding:0;">Folders &amp; Groups</span>
        <button onclick="window.openCreateGroupModal ? window.openCreateGroupModal() : (window.location.href='/dashboard')" class="btn-icon" style="width:1.5rem; height:1.5rem;" title="Create Group">
          <i data-lucide="plus" class="icon-xs"></i>
        </button>
      </div>

      <div class="sidebar-groups-list" style="display:flex; flex-direction:column; gap:0.125rem;">
        ${groups.map(g => `
          <div style="display:flex; align-items:center; position:relative;" class="group-row">
            <a href="javascript:void(0)" onclick="if(window.filterByGroup){window.filterByGroup('${g.id}');} else {window.location.href='/dashboard';}" class="sidebar-link ${activePage === 'dashboard' && activeGroupId === g.id ? 'active' : ''}" style="flex:1; padding-right:1.75rem;">
              <i data-lucide="${g.icon || 'folder'}" class="icon-sm" style="${g.color ? `color:${g.color};` : ''}"></i>
              <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtmlSidebar(g.name)}</span>
              <span class="badge badge-USER" style="font-size:0.6875rem; padding: 0.1rem 0.35rem;">${g.count}</span>
            </a>
            <button onclick="event.stopPropagation(); if(window.deleteGroupConfirm) window.deleteGroupConfirm('${g.id}', '${escapeHtmlSidebar(g.name)}');" class="btn-icon delete-group-btn" style="position:absolute; right:4px; width:1.25rem; height:1.25rem; border:none; opacity:0.35; cursor:pointer;" title="Delete Group">
              <i data-lucide="x" class="icon-xs"></i>
            </button>
          </div>
        `).join('')}

        <a href="javascript:void(0)" onclick="if(window.filterByGroup){window.filterByGroup('NONE');} else {window.location.href='/dashboard';}" class="sidebar-link ${activePage === 'dashboard' && activeGroupId === 'NONE' ? 'active' : ''}">
          <i data-lucide="folder" class="icon-sm" style="color:#94a3b8;"></i>
          <span style="flex:1;">Ungrouped</span>
          <span class="badge badge-USER" style="font-size:0.6875rem; padding: 0.1rem 0.35rem;">${ungroupedCount}</span>
        </a>
      </div>
      `}

      <!-- ── SECTION: MANAGEMENT ── -->
      <div class="sidebar-section-header" style="margin-top:0.875rem;">Management</div>

      ${isAdmin ? `
        <a href="/users" class="sidebar-link ${activePage === 'users' ? 'active' : ''}">
          <i data-lucide="users" class="icon-sm"></i>
          <span>User Approvals</span>
        </a>
      ` : ''}

      <a href="/settings" class="sidebar-link ${activePage === 'settings' ? 'active' : ''}">
        <i data-lucide="settings" class="icon-sm"></i>
        <span>Settings &amp; Backup</span>
      </a>

    </div>

    <!-- ── SIDEBAR FOOTER: USER PROFILE ── -->
    <div class="sidebar-footer">
      ${currentUser ? `
        <div style="display:flex; align-items:center; gap:0.625rem; margin-bottom:0.75rem; padding:0.375rem 0.25rem;">
          <div style="width:2rem; height:2rem; border-radius:50%; background:linear-gradient(135deg, var(--primary) 0%, #7c3aed 100%); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.8125rem; flex-shrink:0;">
            ${userInitial}
          </div>
          <div style="overflow:hidden; flex:1;">
            <div style="font-weight:600; font-size:0.8125rem; color:var(--foreground); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtmlSidebar(currentUser.name || currentUser.email.split('@')[0])}</div>
            <div style="font-size:0.6875rem; color:var(--muted-foreground); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${escapeHtmlSidebar(currentUser.email)}</div>
          </div>
          <span class="badge badge-${currentUser.role}" style="font-size:0.625rem; padding:0.1rem 0.35rem;">${currentUser.role}</span>
        </div>
      ` : ''}
      <button onclick="handleSidebarLogout()" class="btn btn-secondary" style="width:100%; font-size:0.8125rem; height:2.125rem;">
        <i data-lucide="log-out" class="icon-xs"></i>
        <span>Log Out</span>
      </button>
    </div>
  `;

  document.body.prepend(sidebar);
  if (window.lucide) {
    lucide.createIcons();
  }
}

function escapeHtmlSidebar(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function handleSidebarLogout() {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
    showToast('Logged out.', 'info');
    setTimeout(() => window.location.replace('/login'), 300);
  } catch (e) {
    window.location.replace('/login');
  }
}

window.showToast = showToast;
window.apiRequest = apiRequest;
window.copyToClipboard = copyToClipboard;
window.renderDesktopSidebar = renderDesktopSidebar;
window.handleSidebarLogout = handleSidebarLogout;
