document.addEventListener('DOMContentLoaded', async () => {
  let activeCategory = 'ALL';
  let activeGroupId = 'ALL';
  let searchQuery = '';
  let secretsData = [];
  let groupsData = null;
  let editingItemId = null;
  let activeDrawerItemId = null;

  const secretListContainer = document.getElementById('secret-list');
  const searchInput = document.getElementById('search-input');
  const pillBtns = document.querySelectorAll('.pill');

  // Metric summary elements
  const metricTotal = document.getElementById('metric-total');
  const metricDb = document.getElementById('metric-db');
  const metricPasswords = document.getElementById('metric-passwords');
  const metricSteps = document.getElementById('metric-steps');

  // Filter indicator
  const activeFilterIndicator = document.getElementById('active-filter-indicator');
  const activeFilterText = document.getElementById('active-filter-text');

  // Add / Edit Entry Modal
  const addModal = document.getElementById('add-secret-modal');
  const modalHeaderTitle = document.getElementById('modal-header-title');
  const modalSubmitBtn = document.getElementById('modal-submit-btn');
  const openModalBtn = document.getElementById('open-add-modal-btn');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const cancelModalBtn = document.getElementById('cancel-modal-btn');
  const modalForm = document.getElementById('modal-add-form');

  const modalCategorySelect = document.getElementById('modal-category');
  const modalGroupSelect = document.getElementById('modal-group');
  const modalPassFields = document.getElementById('modal-cat-password-fields');
  const modalDbFields = document.getElementById('modal-cat-db-fields');
  const modalStepsFields = document.getElementById('modal-cat-steps-fields');
  const modalApiFields = document.getElementById('modal-cat-api-fields');
  const modalStepsContainer = document.getElementById('modal-steps-container');
  const modalAddStepBtn = document.getElementById('modal-add-step-btn');
  const modalGenPassBtn = document.getElementById('modal-gen-pass-btn');
  const modalParseConnBtn = document.getElementById('modal-parse-conn-btn');

  // Group Create Modal Elements
  const groupModal = document.getElementById('create-group-modal');
  const closeGroupModalBtn = document.getElementById('close-group-modal-btn');
  const cancelGroupModalBtn = document.getElementById('cancel-group-modal-btn');
  const createGroupForm = document.getElementById('create-group-form');
  const groupNameInput = document.getElementById('group-name-input');
  const groupIconSelect = document.getElementById('group-icon-select');

  // Universal Detail Drawer Elements
  const drawerOverlay = document.getElementById('detail-drawer-overlay');
  const closeDrawerBtn = document.getElementById('close-drawer-btn');
  const closeDrawerFooterBtn = document.getElementById('close-drawer-footer-btn');
  const drawerEditBtn = document.getElementById('drawer-edit-btn');
  const drawerEditFooterBtn = document.getElementById('drawer-edit-footer-btn');
  const drawerDeleteFooterBtn = document.getElementById('drawer-delete-footer-btn');
  const drawerFavBtn = document.getElementById('drawer-fav-btn');
  const drawerCatBadge = document.getElementById('drawer-cat-badge');
  const drawerGroupBadge = document.getElementById('drawer-group-badge');
  const drawerTitle = document.getElementById('drawer-title');
  const drawerSubtitle = document.getElementById('drawer-subtitle');
  const drawerContentBody = document.getElementById('drawer-content-body');

  // Check auth user
  let currentUser = null;
  try {
    const authRes = await apiRequest('/api/auth/me');
    if (authRes && authRes.user) {
      currentUser = authRes.user;
      const userGreeting = document.getElementById('user-name-display');
      if (userGreeting) userGreeting.textContent = currentUser.name || currentUser.email.split('@')[0];
    }
  } catch (e) {
    return;
  }

  // ======================================================
  // GROUPS & FOLDERS MANAGEMENT
  // ======================================================
  async function loadGroups() {
    try {
      const res = await apiRequest('/api/groups');
      groupsData = res;

      // Populate sidebar
      renderDesktopSidebar('dashboard', currentUser, groupsData, activeGroupId);

      // Populate modal dropdown
      populateGroupSelect();
    } catch (err) {
      console.error('Failed to load groups:', err);
    }
  }

  function populateGroupSelect(selectedGroupId = '') {
    if (!modalGroupSelect || !groupsData) return;
    const groups = groupsData.groups || [];

    modalGroupSelect.innerHTML = `
      <option value="">None (Ungrouped)</option>
      ${groups.map(g => `
        <option value="${g.id}" ${selectedGroupId === g.id ? 'selected' : ''}>
          ${escapeHtml(g.name)}
        </option>
      `).join('')}
    `;
  }

  window.openCreateGroupModal = function() {
    if (groupModal) {
      if (createGroupForm) createGroupForm.reset();
      groupModal.classList.add('open');
      if (groupNameInput) groupNameInput.focus();
    }
    if (window.lucide) lucide.createIcons();
  };

  window.closeCreateGroupModal = function() {
    if (groupModal) {
      groupModal.classList.remove('open');
      if (createGroupForm) createGroupForm.reset();
    }
  };

  if (closeGroupModalBtn) closeGroupModalBtn.addEventListener('click', window.closeCreateGroupModal);
  if (cancelGroupModalBtn) cancelGroupModalBtn.addEventListener('click', window.closeCreateGroupModal);
  if (groupModal) {
    groupModal.addEventListener('click', (e) => {
      if (e.target === groupModal) window.closeCreateGroupModal();
    });
  }

  if (createGroupForm) {
    createGroupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = groupNameInput.value.trim();
      const icon = groupIconSelect.value;
      const colorRadio = createGroupForm.querySelector('input[name="group-color"]:checked');
      const color = colorRadio ? colorRadio.value : '#4f46e5';

      try {
        const res = await apiRequest('/api/groups', {
          method: 'POST',
          body: { name, icon, color }
        });

        showToast(res.message || 'Group created!', 'success');
        window.closeCreateGroupModal();
        await loadGroups();
        // If add modal is open, select the newly created group
        if (addModal && addModal.classList.contains('open') && res.group) {
          populateGroupSelect(res.group.id);
        }
      } catch (err) {
        // Error already handled by apiRequest toast
      }
    });
  }

  window.filterByGroup = function(groupId) {
    activeGroupId = groupId;
    updateFilterIndicator();
    loadSecrets();
    if (groupsData) {
      renderDesktopSidebar('dashboard', currentUser, groupsData, activeGroupId);
    }
  };

  function updateFilterIndicator() {
    if (!activeFilterIndicator || !activeFilterText) return;

    if (activeGroupId === 'ALL' && !searchQuery) {
      activeFilterIndicator.style.display = 'none';
      return;
    }

    activeFilterIndicator.style.display = 'flex';
    let label = 'All Items';

    if (activeGroupId === 'FAV') {
      label = '⭐ Favorites';
    } else if (activeGroupId === 'NONE') {
      label = '📂 Ungrouped';
    } else if (groupsData && groupsData.groups) {
      const found = groupsData.groups.find(g => g.id === activeGroupId);
      if (found) label = `📁 Group: ${found.name}`;
    }

    if (searchQuery) {
      label += ` • Search: "${searchQuery}"`;
    }

    activeFilterText.innerHTML = `Viewing: <strong>${escapeHtml(label)}</strong>`;
  }

  window.deleteGroupConfirm = async function(id, name) {
    if (!confirm(`Are you sure you want to delete the group "${name}"?\nSecrets will not be deleted and will move to Ungrouped.`)) return;

    try {
      const res = await apiRequest(`/api/groups/${id}`, { method: 'DELETE' });
      showToast(res.message, 'success');
      if (activeGroupId === id) activeGroupId = 'ALL';
      await loadGroups();
      await loadSecrets();
    } catch (err) {}
  };

  // ======================================================
  // SECRETS LISTING & FILTERING
  // ======================================================
  async function loadSecrets() {
    try {
      let url = `/api/secrets?category=${activeCategory}`;

      if (activeGroupId === 'FAV') {
        url += '&favorite=true';
      } else if (activeGroupId === 'NONE') {
        url += '&groupId=none';
      } else if (activeGroupId && activeGroupId !== 'ALL') {
        url += `&groupId=${encodeURIComponent(activeGroupId)}`;
      }

      if (searchQuery) {
        url += `&search=${encodeURIComponent(searchQuery)}`;
      }

      const res = await apiRequest(url);
      secretsData = res.secrets || [];

      // Update Summary Metrics
      updateMetrics(secretsData);

      renderSecrets(secretsData);
    } catch (err) {
      console.error('Failed to load secrets:', err);
    }
  }

  function updateMetrics(items) {
    if (metricTotal) metricTotal.textContent = items.length;
    if (metricDb) metricDb.textContent = items.filter(i => i.category === 'DB_CONNECTION').length;
    if (metricPasswords) metricPasswords.textContent = items.filter(i => i.category === 'PASSWORD').length;
    if (metricSteps) metricSteps.textContent = items.filter(i => i.category === 'STEP_BY_STEP').length;
  }

  function getCategoryLucideIcon(cat) {
    switch (cat) {
      case 'PASSWORD': return 'key-round';
      case 'DB_CONNECTION': return 'database';
      case 'STEP_BY_STEP': return 'book-open';
      case 'API_KEY': return 'zap';
      case 'SSH_KEY': return 'terminal';
      default: return 'shield';
    }
  }

  function renderSecrets(items) {
    if (!secretListContainer) return;

    if (items.length === 0) {
      secretListContainer.innerHTML = `
        <div class="card" style="padding: 3.5rem 1.5rem; text-align: center; grid-column: 1 / -1;">
          <div style="width: 3rem; height: 3rem; border-radius: 50%; background: var(--secondary); display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem auto; color: var(--muted-foreground);">
            <i data-lucide="shield" class="icon-lg"></i>
          </div>
          <h3 style="margin-bottom: 0.375rem; font-weight: 600; color: var(--foreground);">No Vault Entries Found</h3>
          <p style="color: var(--muted-foreground); margin-bottom: 1.25rem;">
            ${activeGroupId !== 'ALL' ? 'No items found in this group filter.' : 'Add your first password, connection string, or step-by-step procedure.'}
          </p>
          <button class="btn btn-primary" onclick="openAddModal()" style="margin: 0 auto;">
            <i data-lucide="plus" class="icon-xs"></i>
            <span>Add First Entry</span>
          </button>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    // ======================================================
    // 1. DESKTOP SHADCN DATA TABLE VIEW (>= 768px)
    // Clicking ANY row opens the Universal Detail Drawer!
    // ======================================================
    const desktopTableRows = items.map(item => {
      const iconName = getCategoryLucideIcon(item.category);
      const isFav = item.favorite;
      const payload = item.payload || {};

      let targetInfo = item.username || item.websiteUrl || '-';
      if (item.category === 'DB_CONNECTION') {
        targetInfo = payload.host ? `${payload.host}:${payload.port || '5432'} (${payload.dbName || 'db'})` : (payload.connectionString ? 'Connection String' : '-');
      } else if (item.category === 'STEP_BY_STEP') {
        const stepCount = (payload.steps && Array.isArray(payload.steps)) ? payload.steps.length : 0;
        targetInfo = `${stepCount} Procedure Step${stepCount === 1 ? '' : 's'}`;
      }

      let copyActionsHtml = '';
      if (item.category === 'DB_CONNECTION') {
        const connStr = payload.connectionString || `postgresql://${item.username || 'user'}:${payload.password || ''}@${payload.host || 'localhost'}:${payload.port || '5432'}/${payload.dbName || 'db'}`;
        copyActionsHtml = `
          <button class="btn-copy" onclick="event.stopPropagation(); copyToClipboard('${escapeJs(connStr)}', 'Connection String')">
            <i data-lucide="link" class="icon-xs"></i> URI
          </button>
          ${payload.password ? `
            <button class="btn-copy" onclick="event.stopPropagation(); copyToClipboard('${escapeJs(payload.password)}', 'DB Password')">
              <i data-lucide="key-round" class="icon-xs"></i> Pass
            </button>
          ` : ''}
        `;
      } else if (item.category === 'PASSWORD') {
        copyActionsHtml = `
          ${item.username ? `
            <button class="btn-copy" onclick="event.stopPropagation(); copyToClipboard('${escapeJs(item.username)}', 'Username')">
              <i data-lucide="user" class="icon-xs"></i> User
            </button>
          ` : ''}
          ${payload.password ? `
            <button class="btn-copy" onclick="event.stopPropagation(); copyToClipboard('${escapeJs(payload.password)}', 'Password')">
              <i data-lucide="key-round" class="icon-xs"></i> Pass
            </button>
          ` : ''}
        `;
      } else if (item.category === 'STEP_BY_STEP') {
        copyActionsHtml = `
          <button class="btn-copy" style="background:#f0fdf4; color:#15803d; border-color:#bbf7d0;" onclick="event.stopPropagation(); openDetailDrawer('${item.id}')">
            <i data-lucide="book-open" class="icon-xs"></i> View Steps
          </button>
        `;
      } else if (item.category === 'API_KEY') {
        copyActionsHtml = `
          <button class="btn-copy" onclick="event.stopPropagation(); copyToClipboard('${escapeJs(payload.apiKey || payload.password)}', 'API Key')">
            <i data-lucide="zap" class="icon-xs"></i> Key
          </button>
        `;
      } else {
        copyActionsHtml = `
          ${payload.password ? `
            <button class="btn-copy" onclick="event.stopPropagation(); copyToClipboard('${escapeJs(payload.password)}', 'Secret Payload')">
              <i data-lucide="copy" class="icon-xs"></i> Copy
            </button>
          ` : ''}
        `;
      }

      const groupBadgeHtml = item.group ? `
        <span class="badge" style="background:#f4f4f5; color:#18181b; border-color:#e4e4e7; font-size:0.75rem;">
          <i data-lucide="${item.group.icon || 'folder'}" class="icon-xs" style="${item.group.color ? `color:${item.group.color};` : ''}"></i>
          <span>${escapeHtml(item.group.name)}</span>
        </span>
      ` : '<span style="color:var(--muted-foreground); font-size:0.75rem;">-</span>';

      const tagsHtml = (item.tags && item.tags.length > 0)
        ? item.tags.map(t => `<span class="badge badge-USER" style="font-size:0.6875rem;">${escapeHtml(t)}</span>`).join(' ')
        : '';

      return `
        <tr style="cursor: pointer;" onclick="openDetailDrawer('${item.id}')" title="Click to open detail panel">
          <td>
            <div style="display:flex; align-items:center; gap:0.75rem;">
              <div style="width:2rem; height:2rem; border-radius:var(--radius-md); background:var(--secondary); border:1px solid var(--border); display:flex; align-items:center; justify-content:center; color:var(--foreground);">
                <i data-lucide="${iconName}" class="icon-sm"></i>
              </div>
              <div>
                <strong style="font-size:0.875rem; color:var(--foreground); display:block; font-weight:600;">${escapeHtml(item.title)}</strong>
                <span class="badge badge-${item.category}" style="margin-top:0.25rem;">${item.category.replace('_', ' ')}</span>
              </div>
            </div>
          </td>

          <td>
            <span style="font-size:0.8125rem; color:var(--foreground); font-weight:500;">${escapeHtml(targetInfo)}</span>
          </td>

          <td>${groupBadgeHtml}</td>

          <td onclick="event.stopPropagation();">
            <div style="display:flex; gap:0.375rem; flex-wrap:wrap;">${copyActionsHtml}</div>
          </td>

          <td>${tagsHtml || '<span style="color:var(--muted-foreground); font-size:0.75rem;">-</span>'}</td>

          <td style="font-size:0.8125rem; color:var(--muted-foreground); white-space:nowrap;">
            ${new Date(item.updatedAt).toLocaleDateString()}
          </td>

          <td style="text-align:right; white-space:nowrap;" onclick="event.stopPropagation();">
            <div style="display:inline-flex; align-items:center; gap:0.375rem;">
              <button class="btn btn-outline" style="height:1.75rem; font-size:0.75rem; padding:0 0.5rem;" onclick="openEditModal('${item.id}')" title="Edit Entry">
                <i data-lucide="pencil" class="icon-xs"></i>
                <span>Edit</span>
              </button>
              <button class="btn-icon" style="width:1.75rem; height:1.75rem;" onclick="toggleFav('${item.id}')" title="Favorite">
                <i data-lucide="star" class="icon-xs" style="${isFav ? 'fill: #f59e0b; stroke: #f59e0b;' : ''}"></i>
              </button>
              <button class="btn btn-danger" style="height:1.75rem; width:1.75rem; padding:0;" onclick="deleteSecretItem('${item.id}')" title="Delete Entry">
                <i data-lucide="trash-2" class="icon-xs"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    const desktopTableViewHtml = `
      <div class="desktop-table-view">
        <table class="vault-table">
          <thead>
            <tr>
              <th>Entry Title & Type</th>
              <th>Target / Details</th>
              <th>Folder / Group</th>
              <th>Quick Actions</th>
              <th>Tags</th>
              <th>Updated</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${desktopTableRows}
          </tbody>
        </table>
      </div>
    `;

    // ======================================================
    // 2. MOBILE CARDS VIEW (< 768px)
    // Clicking ANY card opens the Universal Detail Drawer!
    // ======================================================
    const mobileCardsHtml = `
      <div class="mobile-card-view">
        ${items.map(item => {
          const iconName = getCategoryLucideIcon(item.category);
          const isFav = item.favorite;
          const payload = item.payload || {};

          let copyButtonsHtml = '';

          if (item.category === 'DB_CONNECTION') {
            const connStr = payload.connectionString || `postgresql://${item.username || 'user'}:${payload.password || ''}@${payload.host || 'localhost'}:${payload.port || '5432'}/${payload.dbName || 'db'}`;
            copyButtonsHtml = `
              <button class="btn-copy" onclick="event.stopPropagation(); copyToClipboard('${escapeJs(connStr)}', 'Connection String')">
                <i data-lucide="link" class="icon-xs"></i> URI
              </button>
              ${payload.password ? `
                <button class="btn-copy" onclick="event.stopPropagation(); copyToClipboard('${escapeJs(payload.password)}', 'DB Password')">
                  <i data-lucide="key-round" class="icon-xs"></i> Pass
                </button>
              ` : ''}
            `;
          } else if (item.category === 'PASSWORD') {
            copyButtonsHtml = `
              ${item.username ? `
                <button class="btn-copy" onclick="event.stopPropagation(); copyToClipboard('${escapeJs(item.username)}', 'Username')">
                  <i data-lucide="user" class="icon-xs"></i> User
                </button>
              ` : ''}
              ${payload.password ? `
                <button class="btn-copy" onclick="event.stopPropagation(); copyToClipboard('${escapeJs(payload.password)}', 'Password')">
                  <i data-lucide="key-round" class="icon-xs"></i> Pass
                </button>
              ` : ''}
            `;
          } else if (item.category === 'STEP_BY_STEP') {
            copyButtonsHtml = `
              <button class="btn-copy" style="background:#f0fdf4; color:#15803d; border-color:#bbf7d0;" onclick="event.stopPropagation(); openDetailDrawer('${item.id}')">
                <i data-lucide="book-open" class="icon-xs"></i> View Steps
              </button>
            `;
          } else if (item.category === 'API_KEY') {
            copyButtonsHtml = `
              <button class="btn-copy" onclick="event.stopPropagation(); copyToClipboard('${escapeJs(payload.apiKey || payload.password)}', 'API Key')">
                <i data-lucide="zap" class="icon-xs"></i> Key
              </button>
            `;
          } else {
            copyButtonsHtml = `
              ${payload.password ? `
                <button class="btn-copy" onclick="event.stopPropagation(); copyToClipboard('${escapeJs(payload.password)}', 'Secret Payload')">
                  <i data-lucide="copy" class="icon-xs"></i> Copy
                </button>
              ` : ''}
            `;
          }

          return `
            <div class="card secret-card" id="card-${item.id}" style="cursor:pointer;" onclick="openDetailDrawer('${item.id}')">
              <div class="card-header">
                <div class="card-title-group">
                  <div class="card-icon">
                    <i data-lucide="${iconName}" class="icon-sm"></i>
                  </div>
                  <div>
                    <div class="card-title-text">${escapeHtml(item.title)}</div>
                    <div class="card-subtext">${escapeHtml(item.username || item.websiteUrl || item.category)}</div>
                  </div>
                </div>
                <div style="display:flex; align-items:center; gap: 0.375rem;" onclick="event.stopPropagation();">
                  <button class="btn-icon" style="width:1.75rem; height:1.75rem;" onclick="toggleFav('${item.id}')">
                    <i data-lucide="star" class="icon-xs" style="${isFav ? 'fill: #f59e0b; stroke: #f59e0b;' : ''}"></i>
                  </button>
                  <span class="badge badge-${item.category}">${item.category.replace('_', ' ')}</span>
                </div>
              </div>

              ${item.group ? `
                <div style="margin-top:-0.25rem;">
                  <span class="badge" style="background:#f4f4f5; color:#18181b; border-color:#e4e4e7; font-size:0.6875rem;">
                    <i data-lucide="${item.group.icon || 'folder'}" class="icon-xs" style="${item.group.color ? `color:${item.group.color};` : ''}"></i>
                    <span>${escapeHtml(item.group.name)}</span>
                  </span>
                </div>
              ` : ''}

              ${item.category === 'DB_CONNECTION' && payload.connectionString ? `
                <div class="conn-string-box" onclick="event.stopPropagation();">${escapeHtml(payload.connectionString)}</div>
              ` : ''}

              <div class="copy-actions" onclick="event.stopPropagation();">
                ${copyButtonsHtml}
              </div>

              <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border); padding-top:0.625rem; margin-top:0.25rem;">
                <span style="font-size:0.75rem; color:var(--muted-foreground); font-weight:500;">Updated ${new Date(item.updatedAt).toLocaleDateString()}</span>
                <div style="display:flex; gap:0.375rem;" onclick="event.stopPropagation();">
                  <button class="btn btn-outline" style="height:1.75rem; font-size:0.75rem; padding:0 0.5rem;" onclick="openEditModal('${item.id}')">
                    <i data-lucide="pencil" class="icon-xs"></i>
                    <span>Edit</span>
                  </button>
                  <button class="btn btn-danger" style="height:1.75rem; font-size:0.75rem; padding:0 0.5rem;" onclick="deleteSecretItem('${item.id}')">
                    <i data-lucide="trash-2" class="icon-xs"></i>
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    secretListContainer.innerHTML = desktopTableViewHtml + mobileCardsHtml;
    if (window.lucide) {
      lucide.createIcons();
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeJs(str) {
    if (!str) return '';
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
  }

  // Filter Pills logic (Categories)
  pillBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      pillBtns.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.getAttribute('data-cat');
      loadSecrets();
    });
  });

  // Live search with debounce
  if (searchInput) {
    let timeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        searchQuery = e.target.value.trim();
        updateFilterIndicator();
        loadSecrets();
      }, 250);
    });

    // Press '/' key to quickly focus search input
    window.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== searchInput && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchInput.focus();
      }
    });
  }

  // Global Fav & Delete
  window.toggleFav = async function(id) {
    try {
      const res = await apiRequest(`/api/secrets/${id}/favorite`, { method: 'PATCH' });
      showToast(res.message, 'success');
      
      // Update item locally
      const item = secretsData.find(s => s.id === id);
      if (item) item.favorite = res.favorite;

      // Update drawer star if active
      if (activeDrawerItemId === id && drawerFavBtn) {
        drawerFavBtn.innerHTML = `<i data-lucide="star" class="icon-xs" style="${res.favorite ? 'fill: #f59e0b; stroke: #f59e0b;' : ''}"></i>`;
      }

      loadSecrets();
    } catch (e) {}
  };

  window.deleteSecretItem = async function(id) {
    if (!confirm('Are you sure you want to permanently delete this secret entry from your vault?')) return;
    try {
      await apiRequest(`/api/secrets/${id}`, { method: 'DELETE' });
      showToast('Secret deleted.', 'success');
      if (activeDrawerItemId === id) closeDetailDrawer();
      await loadSecrets();
      await loadGroups();
    } catch (e) {}
  };

  // ======================================================
  // UNIVERSAL RIGHT SLIDE-OVER DETAIL PANEL LOGIC
  // Opens for EVERY type: PASSWORD, DB_CONNECTION,
  // STEP_BY_STEP, API_KEY, SSH_KEY, OTHER!
  // ======================================================
  window.openDetailDrawer = function(id) {
    const item = secretsData.find(s => s.id === id);
    if (!item) return;

    activeDrawerItemId = id;
    const payload = item.payload || {};

    // Header updates
    if (drawerTitle) drawerTitle.textContent = item.title;
    if (drawerSubtitle) drawerSubtitle.textContent = `Updated ${new Date(item.updatedAt).toLocaleDateString()} • Created ${new Date(item.createdAt).toLocaleDateString()}`;

    if (drawerCatBadge) {
      drawerCatBadge.className = `badge badge-${item.category}`;
      drawerCatBadge.textContent = item.category.replace('_', ' ');
    }

    if (drawerGroupBadge) {
      if (item.group) {
        drawerGroupBadge.style.display = 'inline-flex';
        drawerGroupBadge.innerHTML = `<i data-lucide="${item.group.icon || 'folder'}" class="icon-xs" style="${item.group.color ? `color:${item.group.color};` : ''}"></i> <span>${escapeHtml(item.group.name)}</span>`;
      } else {
        drawerGroupBadge.style.display = 'none';
      }
    }

    if (drawerFavBtn) {
      drawerFavBtn.innerHTML = `<i data-lucide="star" class="icon-xs" style="${item.favorite ? 'fill: #f59e0b; stroke: #f59e0b;' : ''}"></i>`;
      drawerFavBtn.onclick = () => window.toggleFav(item.id);
    }

    // Dynamic Inspector Body per Category
    let bodyHtml = '';

    if (item.category === 'PASSWORD') {
      bodyHtml = `
        <!-- Username Field -->
        ${item.username ? `
          <div class="step-card">
            <div style="font-size:0.75rem; font-weight:600; color:var(--muted-foreground); text-transform:uppercase; margin-bottom:0.375rem;">Username / Email</div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.9375rem; font-weight:600; color:var(--foreground); word-break:break-all;">${escapeHtml(item.username)}</span>
              <button class="btn-copy" onclick="copyToClipboard('${escapeJs(item.username)}', 'Username')">
                <i data-lucide="copy" class="icon-xs"></i> Copy
              </button>
            </div>
          </div>
        ` : ''}

        <!-- Password Field with Reveal Toggle -->
        ${payload.password ? `
          <div class="step-card">
            <div style="font-size:0.75rem; font-weight:600; color:var(--muted-foreground); text-transform:uppercase; margin-bottom:0.375rem;">Password</div>
            <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem;">
              <span id="drawer-password-val" class="code-font" style="font-size:0.9375rem; font-weight:600; color:var(--foreground); word-break:break-all;" data-real="${escapeHtml(payload.password)}">••••••••••••••••</span>
              <div style="display:flex; gap:0.375rem; flex-shrink:0;">
                <button id="drawer-reveal-pwd-btn" class="btn-copy" onclick="toggleDrawerPasswordReveal()">
                  <i data-lucide="eye" class="icon-xs"></i> <span>Reveal</span>
                </button>
                <button class="btn-copy" onclick="copyToClipboard('${escapeJs(payload.password)}', 'Password')">
                  <i data-lucide="copy" class="icon-xs"></i> Copy
                </button>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Website Link -->
        ${item.websiteUrl ? `
          <div class="step-card">
            <div style="font-size:0.75rem; font-weight:600; color:var(--muted-foreground); text-transform:uppercase; margin-bottom:0.375rem;">Website URL</div>
            <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem;">
              <a href="${escapeHtml(item.websiteUrl)}" target="_blank" rel="noopener noreferrer" style="font-size:0.875rem; color:#4f46e5; font-weight:600; word-break:break-all; text-decoration:none; display:flex; align-items:center; gap:0.375rem;">
                <span>${escapeHtml(item.websiteUrl)}</span>
                <i data-lucide="external-link" class="icon-xs"></i>
              </a>
              <button class="btn-copy" onclick="copyToClipboard('${escapeJs(item.websiteUrl)}', 'Website URL')">
                <i data-lucide="copy" class="icon-xs"></i> Copy
              </button>
            </div>
          </div>
        ` : ''}
      `;
    } else if (item.category === 'DB_CONNECTION') {
      const connStr = payload.connectionString || `postgresql://${item.username || 'user'}:${payload.password || ''}@${payload.host || 'localhost'}:${payload.port || '5432'}/${payload.dbName || 'db'}`;

      bodyHtml = `
        <!-- Full URI Container -->
        <div class="step-card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
            <div style="font-size:0.75rem; font-weight:600; color:var(--muted-foreground); text-transform:uppercase;">Full Connection URI</div>
            <button class="btn-copy" onclick="copyToClipboard('${escapeJs(connStr)}', 'Connection String')">
              <i data-lucide="copy" class="icon-xs"></i> Copy URI
            </button>
          </div>
          <div class="conn-string-box" style="margin:0; font-size:0.8125rem; line-height:1.5;">${escapeHtml(connStr)}</div>
        </div>

        <!-- Connection Parameters Breakdown -->
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.75rem;">
          ${payload.host ? `
            <div class="step-card">
              <div style="font-size:0.6875rem; font-weight:600; color:var(--muted-foreground); text-transform:uppercase; margin-bottom:0.25rem;">Host : Port</div>
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="code-font" style="font-size:0.8125rem; font-weight:600;">${escapeHtml(payload.host)}:${escapeHtml(payload.port || '5432')}</span>
                <button class="btn-copy" style="padding:0.2rem 0.4rem; font-size:0.6875rem;" onclick="copyToClipboard('${escapeJs(payload.host)}', 'Host')">Copy</button>
              </div>
            </div>
          ` : ''}

          ${payload.dbName ? `
            <div class="step-card">
              <div style="font-size:0.6875rem; font-weight:600; color:var(--muted-foreground); text-transform:uppercase; margin-bottom:0.25rem;">Database</div>
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="code-font" style="font-size:0.8125rem; font-weight:600;">${escapeHtml(payload.dbName)}</span>
                <button class="btn-copy" style="padding:0.2rem 0.4rem; font-size:0.6875rem;" onclick="copyToClipboard('${escapeJs(payload.dbName)}', 'Database Name')">Copy</button>
              </div>
            </div>
          ` : ''}

          ${(payload.username || item.username) ? `
            <div class="step-card">
              <div style="font-size:0.6875rem; font-weight:600; color:var(--muted-foreground); text-transform:uppercase; margin-bottom:0.25rem;">DB User</div>
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="code-font" style="font-size:0.8125rem; font-weight:600;">${escapeHtml(payload.username || item.username)}</span>
                <button class="btn-copy" style="padding:0.2rem 0.4rem; font-size:0.6875rem;" onclick="copyToClipboard('${escapeJs(payload.username || item.username)}', 'DB User')">Copy</button>
              </div>
            </div>
          ` : ''}

          ${payload.password ? `
            <div class="step-card">
              <div style="font-size:0.6875rem; font-weight:600; color:var(--muted-foreground); text-transform:uppercase; margin-bottom:0.25rem;">DB Password</div>
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span id="drawer-db-pwd-val" class="code-font" style="font-size:0.8125rem; font-weight:600;" data-real="${escapeHtml(payload.password)}">••••••••</span>
                <div style="display:flex; gap:0.25rem;">
                  <button class="btn-copy" style="padding:0.2rem 0.4rem; font-size:0.6875rem;" onclick="toggleDrawerDbPasswordReveal()">Reveal</button>
                  <button class="btn-copy" style="padding:0.2rem 0.4rem; font-size:0.6875rem;" onclick="copyToClipboard('${escapeJs(payload.password)}', 'DB Password')">Copy</button>
                </div>
              </div>
            </div>
          ` : ''}
        </div>
      `;
    } else if (item.category === 'STEP_BY_STEP') {
      const steps = payload.steps || [];

      if (steps.length === 0) {
        bodyHtml = `
          <div style="text-align:center; padding:2rem 1rem; color:var(--muted-foreground);">
            <div style="margin-bottom:0.5rem;"><i data-lucide="book-open" class="icon-lg"></i></div>
            No procedure steps recorded for this guide.
          </div>
        `;
      } else {
        bodyHtml = `
          <div style="font-size:0.75rem; font-weight:600; color:var(--muted-foreground); text-transform:uppercase;">
            Sequential Procedure Steps (${steps.length})
          </div>
          <div style="display:flex; flex-direction:column; gap:0.875rem;">
            ${steps.map((step, idx) => `
              <div class="step-card">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.5rem;">
                  <div style="display:flex; align-items:center; gap:0.625rem;">
                    <div class="step-badge-num">${idx + 1}</div>
                    <h4 style="font-size:0.9375rem; font-weight:600; color:var(--foreground);">${escapeHtml(step.title || `Step ${idx + 1}`)}</h4>
                  </div>
                  ${step.description ? `
                    <button class="btn-copy" style="padding:0.25rem 0.5rem; font-size:0.75rem;" onclick="copyToClipboard('${escapeJs(step.description)}', 'Step ${idx + 1} Instructions')">
                      <i data-lucide="copy" class="icon-xs"></i>
                      <span>Copy</span>
                    </button>
                  ` : ''}
                </div>
                ${step.description ? `
                  <div style="font-size:0.8125rem; color:var(--foreground); white-space:pre-wrap; line-height:1.6; background:#ffffff; border:1px solid var(--border); border-radius:var(--radius-md); padding:0.75rem; font-family:${step.description.includes('\n') || step.description.includes('sudo') || step.description.includes('docker') ? 'var(--font-mono)' : 'var(--font-sans)'}; font-size:${step.description.includes('sudo') ? '0.75rem' : '0.8125rem'}">
${escapeHtml(step.description)}
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        `;
      }
    } else if (item.category === 'API_KEY' || item.category === 'SSH_KEY') {
      const keyVal = payload.apiKey || payload.password || '';

      bodyHtml = `
        <div class="step-card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
            <div style="font-size:0.75rem; font-weight:600; color:var(--muted-foreground); text-transform:uppercase;">
              ${item.category === 'API_KEY' ? 'API Key / Token Content' : 'SSH Private Key Certificate'}
            </div>
            <button class="btn-copy" onclick="copyToClipboard('${escapeJs(keyVal)}', '${item.category}')">
              <i data-lucide="copy" class="icon-xs"></i> Copy Key
            </button>
          </div>
          <div class="conn-string-box" style="margin:0; max-height:220px; overflow-y:auto; font-size:0.8125rem; white-space:pre-wrap; line-height:1.5;">${escapeHtml(keyVal)}</div>
          <div style="font-size:0.75rem; color:var(--muted-foreground); margin-top:0.375rem;">Length: ${keyVal.length} characters</div>
        </div>
      `;
    } else {
      // OTHER category
      bodyHtml = `
        ${payload.password ? `
          <div class="step-card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.375rem;">
              <span style="font-size:0.75rem; font-weight:600; color:var(--muted-foreground); text-transform:uppercase;">Secret Payload</span>
              <button class="btn-copy" onclick="copyToClipboard('${escapeJs(payload.password)}', 'Payload')">
                <i data-lucide="copy" class="icon-xs"></i> Copy
              </button>
            </div>
            <div class="conn-string-box" style="margin:0;">${escapeHtml(payload.password)}</div>
          </div>
        ` : ''}
      `;
    }

    // Common Notes Block (for all categories)
    if (payload.notes) {
      bodyHtml += `
        <div class="step-card">
          <div style="font-size:0.75rem; font-weight:600; color:var(--muted-foreground); text-transform:uppercase; margin-bottom:0.375rem;">Encrypted Notes</div>
          <div style="font-size:0.875rem; color:var(--foreground); white-space:pre-wrap; line-height:1.5;">${escapeHtml(payload.notes)}</div>
        </div>
      `;
    }

    // Common Tags Block
    if (item.tags && item.tags.length > 0) {
      bodyHtml += `
        <div style="display:flex; flex-direction:column; gap:0.375rem;">
          <div style="font-size:0.75rem; font-weight:600; color:var(--muted-foreground); text-transform:uppercase;">Tags</div>
          <div style="display:flex; gap:0.375rem; flex-wrap:wrap;">
            ${item.tags.map(t => `<span class="badge badge-USER">${escapeHtml(t)}</span>`).join('')}
          </div>
        </div>
      `;
    }

    if (drawerContentBody) {
      drawerContentBody.innerHTML = bodyHtml;
    }

    if (drawerOverlay) drawerOverlay.classList.add('open');
    if (window.lucide) lucide.createIcons();
  };

  // Password reveal helper inside drawer
  window.toggleDrawerPasswordReveal = function() {
    const el = document.getElementById('drawer-password-val');
    const btn = document.getElementById('drawer-reveal-pwd-btn');
    if (!el || !btn) return;

    if (el.textContent === '••••••••••••••••') {
      el.textContent = el.getAttribute('data-real') || '';
      btn.innerHTML = '<i data-lucide="eye-off" class="icon-xs"></i> <span>Hide</span>';
    } else {
      el.textContent = '••••••••••••••••';
      btn.innerHTML = '<i data-lucide="eye" class="icon-xs"></i> <span>Reveal</span>';
    }
    if (window.lucide) lucide.createIcons();
  };

  window.toggleDrawerDbPasswordReveal = function() {
    const el = document.getElementById('drawer-db-pwd-val');
    if (!el) return;
    if (el.textContent === '••••••••') {
      el.textContent = el.getAttribute('data-real') || '';
    } else {
      el.textContent = '••••••••';
    }
  };

  function closeDetailDrawer() {
    if (drawerOverlay) drawerOverlay.classList.remove('open');
    activeDrawerItemId = null;
  }

  if (closeDrawerBtn) closeDrawerBtn.addEventListener('click', closeDetailDrawer);
  if (closeDrawerFooterBtn) closeDrawerFooterBtn.addEventListener('click', closeDetailDrawer);

  if (drawerEditBtn) {
    drawerEditBtn.addEventListener('click', () => {
      const id = activeDrawerItemId;
      closeDetailDrawer();
      if (id) openEditModal(id);
    });
  }
  if (drawerEditFooterBtn) {
    drawerEditFooterBtn.addEventListener('click', () => {
      const id = activeDrawerItemId;
      closeDetailDrawer();
      if (id) openEditModal(id);
    });
  }
  if (drawerDeleteFooterBtn) {
    drawerDeleteFooterBtn.addEventListener('click', () => {
      const id = activeDrawerItemId;
      if (id) window.deleteSecretItem(id);
    });
  }

  if (drawerOverlay) {
    drawerOverlay.addEventListener('click', (e) => {
      if (e.target === drawerOverlay) closeDetailDrawer();
    });
  }

  // ======================================================
  // DYNAMIC STEP BUILDER FOR ADD/EDIT ENTRY MODAL
  // ======================================================
  function addStepRow(stepTitle = '', stepDesc = '') {
    if (!modalStepsContainer) return;

    const stepIndex = modalStepsContainer.children.length + 1;
    const row = document.createElement('div');
    row.className = 'modal-step-row';
    row.style.cssText = 'background:#fafafa; border:1px solid var(--border); border-radius:var(--radius-md); padding:0.75rem; display:flex; flex-direction:column; gap:0.5rem; position:relative;';

    row.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <span style="font-size:0.75rem; font-weight:700; color:var(--foreground); text-transform:uppercase;">
          Step #${stepIndex}
        </span>
        <button type="button" class="btn btn-danger remove-step-btn" style="padding:0 0.375rem; height:1.375rem; font-size:0.6875rem;">
          <i data-lucide="trash-2" class="icon-xs"></i>
          <span>Remove</span>
        </button>
      </div>
      <input type="text" class="form-input step-title-input" placeholder="Step Title (e.g. Run docker-compose up)" value="${escapeHtml(stepTitle)}">
      <textarea class="form-textarea step-desc-input" rows="2" placeholder="Detailed instructions or code snippet...">${escapeHtml(stepDesc)}</textarea>
    `;

    row.querySelector('.remove-step-btn').addEventListener('click', () => {
      row.remove();
      const remainingRows = modalStepsContainer.querySelectorAll('.modal-step-row');
      remainingRows.forEach((r, i) => {
        r.querySelector('span').textContent = `Step #${i + 1}`;
      });
      if (window.lucide) lucide.createIcons();
    });

    modalStepsContainer.appendChild(row);
    if (window.lucide) lucide.createIcons();
  }

  if (modalAddStepBtn) {
    modalAddStepBtn.addEventListener('click', () => {
      addStepRow();
    });
  }

  // ======================================================
  // MODAL DIALOG CONTROLS & SUBMISSION (ADD & EDIT)
  // ======================================================
  function openAddModal() {
    editingItemId = null;
    if (modalHeaderTitle) modalHeaderTitle.innerHTML = '<i data-lucide="plus" class="icon-sm"></i> <span>Add New Entry</span>';
    if (modalSubmitBtn) modalSubmitBtn.textContent = 'Encrypt & Save';

    if (modalForm) modalForm.reset();
    if (modalStepsContainer) modalStepsContainer.innerHTML = '';
    if (modalCategorySelect) modalCategorySelect.value = 'PASSWORD';
    triggerCategoryVisibility('PASSWORD');

    // Preselect active group if in group view
    populateGroupSelect(activeGroupId !== 'ALL' && activeGroupId !== 'FAV' && activeGroupId !== 'NONE' ? activeGroupId : '');

    if (addModal) {
      addModal.classList.add('open');
      const titleInput = document.getElementById('modal-title');
      if (titleInput) titleInput.focus();
    }
    if (window.lucide) lucide.createIcons();
  }

  window.openEditModal = function(id) {
    const item = secretsData.find(s => s.id === id);
    if (!item) return;

    editingItemId = id;
    const payload = item.payload || {};

    if (modalHeaderTitle) modalHeaderTitle.innerHTML = '<i data-lucide="pencil" class="icon-sm"></i> <span>Edit Vault Entry</span>';
    if (modalSubmitBtn) modalSubmitBtn.textContent = 'Update Entry';

    document.getElementById('modal-title').value = item.title || '';
    if (modalCategorySelect) modalCategorySelect.value = item.category || 'PASSWORD';
    triggerCategoryVisibility(item.category || 'PASSWORD');

    populateGroupSelect(item.groupId || '');

    document.getElementById('modal-username').value = item.username || '';
    document.getElementById('modal-websiteUrl').value = item.websiteUrl || '';
    document.getElementById('modal-tags').value = (item.tags || []).join(', ');
    document.getElementById('modal-favorite').checked = Boolean(item.favorite);
    document.getElementById('modal-notes').value = payload.notes || '';

    if (item.category === 'PASSWORD') {
      document.getElementById('modal-secret-password').value = payload.password || '';
    } else if (item.category === 'DB_CONNECTION') {
      document.getElementById('modal-db-conn-string').value = payload.connectionString || '';
      document.getElementById('modal-db-host').value = payload.host || '';
      document.getElementById('modal-db-port').value = payload.port || '';
      document.getElementById('modal-db-user').value = payload.username || '';
      document.getElementById('modal-db-pass').value = payload.password || '';
      document.getElementById('modal-db-name').value = payload.dbName || '';
    } else if (item.category === 'STEP_BY_STEP') {
      if (modalStepsContainer) modalStepsContainer.innerHTML = '';
      const steps = payload.steps || [];
      if (steps.length === 0) {
        addStepRow('Step 1', '');
      } else {
        steps.forEach(st => addStepRow(st.title, st.description));
      }
    } else {
      document.getElementById('modal-api-key-val').value = payload.apiKey || payload.password || '';
    }

    if (addModal) {
      addModal.classList.add('open');
      const titleInput = document.getElementById('modal-title');
      if (titleInput) titleInput.focus();
    }
    if (window.lucide) lucide.createIcons();
  };

  function closeAddModal() {
    if (addModal) {
      addModal.classList.remove('open');
      editingItemId = null;
      if (modalForm) modalForm.reset();
      if (modalStepsContainer) modalStepsContainer.innerHTML = '';
      triggerCategoryVisibility('PASSWORD');
    }
  }

  function triggerCategoryVisibility(catVal) {
    if (modalPassFields) modalPassFields.style.display = catVal === 'PASSWORD' ? 'block' : 'none';
    if (modalDbFields) modalDbFields.style.display = catVal === 'DB_CONNECTION' ? 'block' : 'none';
    if (modalStepsFields) {
      modalStepsFields.style.display = catVal === 'STEP_BY_STEP' ? 'block' : 'none';
      if (catVal === 'STEP_BY_STEP' && modalStepsContainer && modalStepsContainer.children.length === 0) {
        addStepRow('Prerequisites', 'Overview or required tools...');
        addStepRow('Execution Commands', 'docker-compose up -d');
      }
    }
    if (modalApiFields) modalApiFields.style.display = (catVal === 'API_KEY' || catVal === 'SSH_KEY' || catVal === 'OTHER') ? 'block' : 'none';
    if (window.lucide) lucide.createIcons();
  }

  if (openModalBtn) openModalBtn.addEventListener('click', openAddModal);
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeAddModal);
  if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeAddModal);

  // Close modal on backdrop click
  if (addModal) {
    addModal.addEventListener('click', (e) => {
      if (e.target === addModal) closeAddModal();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && addModal.classList.contains('open')) closeAddModal();
      if (e.key === 'Escape' && drawerOverlay && drawerOverlay.classList.contains('open')) closeDetailDrawer();
      if (e.key === 'Escape' && groupModal && groupModal.classList.contains('open')) window.closeCreateGroupModal();
    });
  }

  // Modal Category Switch
  if (modalCategorySelect) {
    modalCategorySelect.addEventListener('change', () => {
      triggerCategoryVisibility(modalCategorySelect.value);
    });
  }

  // Modal Password Generator
  if (modalGenPassBtn) {
    modalGenPassBtn.addEventListener('click', () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+~';
      let password = '';
      const array = new Uint32Array(18);
      window.crypto.getRandomValues(array);
      for (let i = 0; i < 18; i++) {
        password += chars[array[i] % chars.length];
      }

      const passInput = document.getElementById('modal-secret-password');
      if (passInput) {
        passInput.value = password;
        passInput.type = 'text';
        showToast('Generated strong 18-character password!', 'success');
      }
    });
  }

  // Modal Connection String Auto-Parser Helper
  if (modalParseConnBtn) {
    modalParseConnBtn.addEventListener('click', () => {
      const connStrInput = document.getElementById('modal-db-conn-string');
      const str = connStrInput ? connStrInput.value.trim() : '';
      if (!str) {
        showToast('Enter a connection URI first (e.g. postgresql://user:pass@host:5432/dbname)', 'error');
        return;
      }

      try {
        const match = str.match(/^(?:([^:\/?#]+):)?(?:\/\/((?:([^:@]*)(?::([^:@]*))?@)?([^:\/?#]*)(?::(\d+))?))?(?:([^?#]*))?/);
        if (match) {
          const user = match[3] || '';
          const pass = match[4] || '';
          const host = match[5] || '';
          const port = match[6] || '';
          const dbName = (match[7] || '').replace(/^\//, '');

          if (user) document.getElementById('modal-db-user').value = decodeURIComponent(user);
          if (pass) document.getElementById('modal-db-pass').value = decodeURIComponent(pass);
          if (host) document.getElementById('modal-db-host').value = host;
          if (port) document.getElementById('modal-db-port').value = port;
          if (dbName) document.getElementById('modal-db-name').value = dbName;

          showToast('Connection string parsed successfully!', 'success');
        }
      } catch (err) {
        showToast('Could not parse connection string pattern.', 'error');
      }
    });
  }

  // Password visibility toggle in modal
  document.querySelectorAll('.toggle-password-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling;
      if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = '<i data-lucide="eye-off" class="icon-sm"></i>';
      } else {
        input.type = 'password';
        btn.innerHTML = '<i data-lucide="eye" class="icon-sm"></i>';
      }
      if (window.lucide) lucide.createIcons();
    });
  });

  // Modal Form Submit (ADD or EDIT)
  if (modalForm) {
    modalForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = modalForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = editingItemId ? 'Updating Entry...' : 'Encrypting & Saving...';

      const title = document.getElementById('modal-title').value.trim();
      const category = modalCategorySelect.value;
      const groupId = modalGroupSelect ? modalGroupSelect.value : null;
      const username = document.getElementById('modal-username').value.trim();
      const websiteUrl = document.getElementById('modal-websiteUrl').value.trim();
      const tagsStr = document.getElementById('modal-tags').value.trim();
      const favorite = document.getElementById('modal-favorite').checked;

      let payload = {};

      if (category === 'PASSWORD') {
        payload.password = document.getElementById('modal-secret-password').value;
        payload.notes = document.getElementById('modal-notes').value;
      } else if (category === 'DB_CONNECTION') {
        payload.connectionString = document.getElementById('modal-db-conn-string').value.trim();
        payload.host = document.getElementById('modal-db-host').value.trim();
        payload.port = document.getElementById('modal-db-port').value.trim();
        payload.dbName = document.getElementById('modal-db-name').value.trim();
        payload.username = document.getElementById('modal-db-user').value.trim();
        payload.password = document.getElementById('modal-db-pass').value;
        payload.notes = document.getElementById('modal-notes').value;
      } else if (category === 'STEP_BY_STEP') {
        const stepRows = modalStepsContainer ? modalStepsContainer.querySelectorAll('.modal-step-row') : [];
        const steps = [];
        stepRows.forEach(row => {
          const t = row.querySelector('.step-title-input').value.trim();
          const d = row.querySelector('.step-desc-input').value.trim();
          if (t || d) steps.push({ title: t, description: d });
        });
        payload.steps = steps;
        payload.notes = document.getElementById('modal-notes').value;
      } else {
        payload.apiKey = document.getElementById('modal-api-key-val').value;
        payload.notes = document.getElementById('modal-notes').value;
      }

      try {
        const endpoint = editingItemId ? `/api/secrets/${editingItemId}` : '/api/secrets';
        const method = editingItemId ? 'PUT' : 'POST';

        await apiRequest(endpoint, {
          method,
          body: {
            title,
            category,
            groupId: groupId || null,
            username,
            websiteUrl,
            favorite,
            tags: tagsStr ? tagsStr.split(',').map(t => t.trim()) : [],
            payload
          }
        });

        showToast(editingItemId ? 'Vault entry updated successfully!' : 'Secret encrypted and stored in vault!', 'success');
        closeAddModal();
        await loadSecrets();
        await loadGroups();
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = editingItemId ? 'Update Entry' : 'Encrypt & Save';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = editingItemId ? 'Update Entry' : 'Encrypt & Save';
      }
    });
  }

  window.openAddModal = openAddModal;
  window.closeAddModal = closeAddModal;

  // Initial fetch: load both groups and secrets
  await loadGroups();
  await loadSecrets();

  if (window.lucide) {
    lucide.createIcons();
  }
});
