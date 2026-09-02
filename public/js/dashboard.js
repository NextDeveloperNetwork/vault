document.addEventListener('DOMContentLoaded', async () => {
  let activeCategory = 'ALL';
  let searchQuery = '';
  let secretsData = [];
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

  // Modal elements
  const addModal = document.getElementById('add-secret-modal');
  const modalHeaderTitle = document.getElementById('modal-header-title');
  const modalSubmitBtn = document.getElementById('modal-submit-btn');
  const openModalBtn = document.getElementById('open-add-modal-btn');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const cancelModalBtn = document.getElementById('cancel-modal-btn');
  const modalForm = document.getElementById('modal-add-form');

  const modalCategorySelect = document.getElementById('modal-category');
  const modalPassFields = document.getElementById('modal-cat-password-fields');
  const modalDbFields = document.getElementById('modal-cat-db-fields');
  const modalStepsFields = document.getElementById('modal-cat-steps-fields');
  const modalApiFields = document.getElementById('modal-cat-api-fields');
  const modalStepsContainer = document.getElementById('modal-steps-container');
  const modalAddStepBtn = document.getElementById('modal-add-step-btn');

  const modalGenPassBtn = document.getElementById('modal-gen-pass-btn');
  const modalParseConnBtn = document.getElementById('modal-parse-conn-btn');

  // Slide-Over Drawer Elements
  const drawerOverlay = document.getElementById('step-drawer-overlay');
  const closeDrawerBtn = document.getElementById('close-drawer-btn');
  const closeDrawerFooterBtn = document.getElementById('close-drawer-footer-btn');
  const drawerEditBtn = document.getElementById('drawer-edit-btn');
  const drawerEditFooterBtn = document.getElementById('drawer-edit-footer-btn');
  const drawerTitle = document.getElementById('drawer-title');
  const drawerSubtitle = document.getElementById('drawer-subtitle');
  const drawerStepsList = document.getElementById('drawer-steps-list');

  // Check auth user
  let currentUser = null;
  try {
    const authRes = await apiRequest('/api/auth/me');
    if (authRes && authRes.user) {
      currentUser = authRes.user;
      const userGreeting = document.getElementById('user-name-display');
      if (userGreeting) userGreeting.textContent = currentUser.name || currentUser.email.split('@')[0];
      
      // Inject Desktop Sidebar Navigation
      renderDesktopSidebar('dashboard', currentUser);
    }
  } catch (e) {
    return;
  }

  // Load Secrets
  async function loadSecrets() {
    try {
      let url = `/api/secrets?category=${activeCategory}`;
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
          <p style="color: var(--muted-foreground); margin-bottom: 1.25rem;">Add your first password, database connection string, or step-by-step procedure.</p>
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
          <button class="btn-copy" onclick="copyToClipboard('${escapeJs(connStr)}', 'Connection String')">
            <i data-lucide="link" class="icon-xs"></i> URI
          </button>
          ${payload.password ? `
            <button class="btn-copy" onclick="copyToClipboard('${escapeJs(payload.password)}', 'DB Password')">
              <i data-lucide="key-round" class="icon-xs"></i> Pass
            </button>
          ` : ''}
        `;
      } else if (item.category === 'PASSWORD') {
        copyActionsHtml = `
          ${item.username ? `
            <button class="btn-copy" onclick="copyToClipboard('${escapeJs(item.username)}', 'Username')">
              <i data-lucide="user" class="icon-xs"></i> User
            </button>
          ` : ''}
          ${payload.password ? `
            <button class="btn-copy" onclick="copyToClipboard('${escapeJs(payload.password)}', 'Password')">
              <i data-lucide="key-round" class="icon-xs"></i> Pass
            </button>
          ` : ''}
        `;
      } else if (item.category === 'STEP_BY_STEP') {
        copyActionsHtml = `
          <button class="btn-copy" style="background:#f0fdf4; color:#15803d; border-color:#bbf7d0;" onclick="openStepDrawer('${item.id}')">
            <i data-lucide="book-open" class="icon-xs"></i> View Steps
          </button>
        `;
      } else if (item.category === 'API_KEY') {
        copyActionsHtml = `
          <button class="btn-copy" onclick="copyToClipboard('${escapeJs(payload.apiKey || payload.password)}', 'API Key')">
            <i data-lucide="zap" class="icon-xs"></i> Key
          </button>
        `;
      } else {
        copyActionsHtml = `
          ${payload.password ? `
            <button class="btn-copy" onclick="copyToClipboard('${escapeJs(payload.password)}', 'Secret Payload')">
              <i data-lucide="copy" class="icon-xs"></i> Copy
            </button>
          ` : ''}
        `;
      }

      const tagsHtml = (item.tags && item.tags.length > 0)
        ? item.tags.map(t => `<span class="badge badge-USER" style="font-size:0.6875rem;">${escapeHtml(t)}</span>`).join(' ')
        : '<span style="color:var(--muted-foreground); font-size:0.75rem;">-</span>';

      return `
        <tr style="cursor: ${item.category === 'STEP_BY_STEP' ? 'pointer' : 'default'};" onclick="${item.category === 'STEP_BY_STEP' ? `openStepDrawer('${item.id}')` : ''}">
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

          <td onclick="event.stopPropagation();">
            <div style="display:flex; gap:0.375rem; flex-wrap:wrap;">${copyActionsHtml}</div>
          </td>

          <td>${tagsHtml}</td>

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
              <button class="btn-copy" onclick="copyToClipboard('${escapeJs(connStr)}', 'Connection String')">
                <i data-lucide="link" class="icon-xs"></i> URI
              </button>
              ${payload.password ? `
                <button class="btn-copy" onclick="copyToClipboard('${escapeJs(payload.password)}', 'DB Password')">
                  <i data-lucide="key-round" class="icon-xs"></i> Pass
                </button>
              ` : ''}
            `;
          } else if (item.category === 'PASSWORD') {
            copyButtonsHtml = `
              ${item.username ? `
                <button class="btn-copy" onclick="copyToClipboard('${escapeJs(item.username)}', 'Username')">
                  <i data-lucide="user" class="icon-xs"></i> User
                </button>
              ` : ''}
              ${payload.password ? `
                <button class="btn-copy" onclick="copyToClipboard('${escapeJs(payload.password)}', 'Password')">
                  <i data-lucide="key-round" class="icon-xs"></i> Pass
                </button>
              ` : ''}
            `;
          } else if (item.category === 'STEP_BY_STEP') {
            copyButtonsHtml = `
              <button class="btn-copy" style="background:#f0fdf4; color:#15803d; border-color:#bbf7d0;" onclick="openStepDrawer('${item.id}')">
                <i data-lucide="book-open" class="icon-xs"></i> View Steps
              </button>
            `;
          } else if (item.category === 'API_KEY') {
            copyButtonsHtml = `
              <button class="btn-copy" onclick="copyToClipboard('${escapeJs(payload.apiKey || payload.password)}', 'API Key')">
                <i data-lucide="zap" class="icon-xs"></i> Key
              </button>
            `;
          } else {
            copyButtonsHtml = `
              ${payload.password ? `
                <button class="btn-copy" onclick="copyToClipboard('${escapeJs(payload.password)}', 'Secret Payload')">
                  <i data-lucide="copy" class="icon-xs"></i> Copy
                </button>
              ` : ''}
            `;
          }

          return `
            <div class="card secret-card" id="card-${item.id}">
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
                <div style="display:flex; align-items:center; gap: 0.375rem;">
                  <button class="btn-icon" style="width:1.75rem; height:1.75rem;" onclick="toggleFav('${item.id}')">
                    <i data-lucide="star" class="icon-xs" style="${isFav ? 'fill: #f59e0b; stroke: #f59e0b;' : ''}"></i>
                  </button>
                  <span class="badge badge-${item.category}">${item.category.replace('_', ' ')}</span>
                </div>
              </div>

              ${item.category === 'DB_CONNECTION' && payload.connectionString ? `
                <div class="conn-string-box">${escapeHtml(payload.connectionString)}</div>
              ` : ''}

              <div class="copy-actions">
                ${copyButtonsHtml}
              </div>

              <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border); padding-top:0.625rem; margin-top:0.25rem;">
                <span style="font-size:0.75rem; color:var(--muted-foreground); font-weight:500;">Updated ${new Date(item.updatedAt).toLocaleDateString()}</span>
                <div style="display:flex; gap:0.375rem;">
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

  // Filter Pills logic
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
      loadSecrets();
    } catch (e) {}
  };

  window.deleteSecretItem = async function(id) {
    if (!confirm('Are you sure you want to permanently delete this secret entry from your vault?')) return;
    try {
      await apiRequest(`/api/secrets/${id}`, { method: 'DELETE' });
      showToast('Secret deleted.', 'success');
      loadSecrets();
    } catch (e) {}
  };

  // ======================================================
  // STEP-BY-STEP SLIDE-OVER DRAWER PANEL LOGIC
  // ======================================================
  window.openStepDrawer = function(id) {
    const item = secretsData.find(s => s.id === id);
    if (!item) return;

    activeDrawerItemId = id;
    const payload = item.payload || {};
    const steps = payload.steps || [];

    if (drawerTitle) drawerTitle.textContent = item.title;
    if (drawerSubtitle) drawerSubtitle.textContent = `${steps.length} Procedure Step${steps.length === 1 ? '' : 's'} • Created ${new Date(item.createdAt).toLocaleDateString()}`;

    if (drawerStepsList) {
      if (steps.length === 0) {
        drawerStepsList.innerHTML = `
          <div style="text-align:center; padding:2rem 1rem; color:var(--muted-foreground);">
            <div style="margin-bottom:0.5rem;"><i data-lucide="book-open" class="icon-lg"></i></div>
            No procedure steps recorded for this guide.
          </div>
        `;
      } else {
        drawerStepsList.innerHTML = steps.map((step, idx) => `
          <div class="step-card">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.625rem;">
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
        `).join('');
      }
    }

    if (drawerOverlay) drawerOverlay.classList.add('open');
    if (window.lucide) lucide.createIcons();
  };

  function closeStepDrawer() {
    if (drawerOverlay) drawerOverlay.classList.remove('open');
  }

  if (closeDrawerBtn) closeDrawerBtn.addEventListener('click', closeStepDrawer);
  if (closeDrawerFooterBtn) closeDrawerFooterBtn.addEventListener('click', closeStepDrawer);
  if (drawerEditBtn) {
    drawerEditBtn.addEventListener('click', () => {
      const id = activeDrawerItemId;
      closeStepDrawer();
      if (id) openEditModal(id);
    });
  }
  if (drawerEditFooterBtn) {
    drawerEditFooterBtn.addEventListener('click', () => {
      const id = activeDrawerItemId;
      closeStepDrawer();
      if (id) openEditModal(id);
    });
  }

  if (drawerOverlay) {
    drawerOverlay.addEventListener('click', (e) => {
      if (e.target === drawerOverlay) closeStepDrawer();
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
      if (e.key === 'Escape' && drawerOverlay && drawerOverlay.classList.contains('open')) closeStepDrawer();
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
            username,
            websiteUrl,
            favorite,
            tags: tagsStr ? tagsStr.split(',').map(t => t.trim()) : [],
            payload
          }
        });

        showToast(editingItemId ? 'Vault entry updated successfully!' : 'Secret encrypted and stored in vault!', 'success');
        closeAddModal();
        loadSecrets();
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

  // Initial fetch
  await loadSecrets();
  if (window.lucide) {
    lucide.createIcons();
  }
});
