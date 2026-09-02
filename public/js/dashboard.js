document.addEventListener('DOMContentLoaded', async () => {
  let activeCategory = 'ALL';
  let searchQuery = '';
  let secretsData = [];

  const secretListContainer = document.getElementById('secret-list');
  const searchInput = document.getElementById('search-input');
  const pillBtns = document.querySelectorAll('.pill');

  // Metric summary elements
  const metricTotal = document.getElementById('metric-total');
  const metricDb = document.getElementById('metric-db');
  const metricPasswords = document.getElementById('metric-passwords');
  const metricApi = document.getElementById('metric-api');

  // Modal elements
  const addModal = document.getElementById('add-secret-modal');
  const openModalBtn = document.getElementById('open-add-modal-btn');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const cancelModalBtn = document.getElementById('cancel-modal-btn');
  const modalForm = document.getElementById('modal-add-form');

  const modalCategorySelect = document.getElementById('modal-category');
  const modalPassFields = document.getElementById('modal-cat-password-fields');
  const modalDbFields = document.getElementById('modal-cat-db-fields');
  const modalApiFields = document.getElementById('modal-cat-api-fields');
  const modalGenPassBtn = document.getElementById('modal-gen-pass-btn');
  const modalParseConnBtn = document.getElementById('modal-parse-conn-btn');

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
    if (metricApi) metricApi.textContent = items.filter(i => i.category === 'API_KEY').length;
  }

  function getCategoryIcon(cat) {
    switch (cat) {
      case 'PASSWORD': return '🔑';
      case 'DB_CONNECTION': return '🗄️';
      case 'API_KEY': return '⚡';
      case 'SSH_KEY': return '💻';
      default: return '🔐';
    }
  }

  function renderSecrets(items) {
    if (!secretListContainer) return;

    if (items.length === 0) {
      secretListContainer.innerHTML = `
        <div class="glass-card" style="padding: 40px 20px; text-align: center; grid-column: 1 / -1;">
          <div style="font-size: 3rem; margin-bottom: 12px;">🛡️</div>
          <h3 style="margin-bottom: 6px; font-weight: 800; color: #0f172a;">No Vault Entries Found</h3>
          <p style="color: #64748b; margin-bottom: 16px;">Click '+ Add New Entry' above to store your passwords or database connection strings.</p>
          <button class="btn btn-primary" onclick="openAddModal()" style="margin: 0 auto;">+ Add First Entry</button>
        </div>
      `;
      return;
    }

    secretListContainer.innerHTML = items.map(item => {
      const icon = getCategoryIcon(item.category);
      const isFav = item.favorite ? '⭐' : '☆';
      const payload = item.payload || {};

      let copyButtonsHtml = '';

      if (item.category === 'DB_CONNECTION') {
        const connStr = payload.connectionString || `postgresql://${item.username || 'user'}:${payload.password || ''}@${payload.host || 'localhost'}:${payload.port || '5432'}/${payload.dbName || 'db'}`;
        copyButtonsHtml = `
          <button class="btn-copy" onclick="copyToClipboard('${escapeJs(connStr)}', 'Connection String')">
            🔗 Copy Connection URI
          </button>
          ${payload.password ? `
            <button class="btn-copy" onclick="copyToClipboard('${escapeJs(payload.password)}', 'DB Password')">
              🔑 Password
            </button>
          ` : ''}
        `;
      } else if (item.category === 'PASSWORD') {
        copyButtonsHtml = `
          ${item.username ? `
            <button class="btn-copy" onclick="copyToClipboard('${escapeJs(item.username)}', 'Username')">
              👤 Username
            </button>
          ` : ''}
          ${payload.password ? `
            <button class="btn-copy" onclick="copyToClipboard('${escapeJs(payload.password)}', 'Password')">
              🔑 Password
            </button>
          ` : ''}
        `;
      } else if (item.category === 'API_KEY') {
        copyButtonsHtml = `
          <button class="btn-copy" onclick="copyToClipboard('${escapeJs(payload.apiKey || payload.password)}', 'API Key')">
            ⚡ Copy API Key
          </button>
        `;
      } else {
        copyButtonsHtml = `
          ${payload.password ? `
            <button class="btn-copy" onclick="copyToClipboard('${escapeJs(payload.password)}', 'Secret Payload')">
              📋 Copy Secret
            </button>
          ` : ''}
        `;
      }

      return `
        <div class="glass-card secret-card" id="card-${item.id}">
          <div class="card-header">
            <div class="card-title-group">
              <div class="card-icon">${icon}</div>
              <div>
                <div class="card-title-text">${escapeHtml(item.title)}</div>
                <div class="card-subtext">${escapeHtml(item.username || item.websiteUrl || item.category)}</div>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap: 8px;">
              <button class="btn-icon" style="font-size:1.1rem; width:36px; height:36px;" onclick="toggleFav('${item.id}')">${isFav}</button>
              <span class="badge badge-${item.category}">${item.category.replace('_', ' ')}</span>
            </div>
          </div>

          ${item.category === 'DB_CONNECTION' && payload.connectionString ? `
            <div class="conn-string-box">${escapeHtml(payload.connectionString)}</div>
          ` : ''}

          <div class="copy-actions">
            ${copyButtonsHtml}
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #e2e8f0; padding-top:10px; margin-top:4px;">
            <span style="font-size:0.75rem; color:#64748b; font-weight:600;">Updated ${new Date(item.updatedAt).toLocaleDateString()}</span>
            <button class="btn-secondary" style="padding:4px 10px; min-height:30px; font-size:0.75rem;" onclick="deleteSecretItem('${item.id}')">
              🗑️ Delete
            </button>
          </div>
        </div>
      `;
    }).join('');
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
  // MODAL DIALOG CONTROLS & SUBMISSION
  // ======================================================
  function openAddModal() {
    if (addModal) {
      addModal.classList.add('open');
      const titleInput = document.getElementById('modal-title');
      if (titleInput) titleInput.focus();
    }
  }

  function closeAddModal() {
    if (addModal) {
      addModal.classList.remove('open');
      if (modalForm) modalForm.reset();
      if (modalPassFields) modalPassFields.style.display = 'block';
      if (modalDbFields) modalDbFields.style.display = 'none';
      if (modalApiFields) modalApiFields.style.display = 'none';
    }
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
    });
  }

  // Modal Category Switch
  if (modalCategorySelect) {
    modalCategorySelect.addEventListener('change', () => {
      const val = modalCategorySelect.value;
      if (modalPassFields) modalPassFields.style.display = val === 'PASSWORD' ? 'block' : 'none';
      if (modalDbFields) modalDbFields.style.display = val === 'DB_CONNECTION' ? 'block' : 'none';
      if (modalApiFields) modalApiFields.style.display = (val === 'API_KEY' || val === 'SSH_KEY' || val === 'OTHER') ? 'block' : 'none';
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

  // Modal Form Submit
  if (modalForm) {
    modalForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = modalForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Encrypting & Saving...';

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
      } else {
        payload.apiKey = document.getElementById('modal-api-key-val').value;
        payload.notes = document.getElementById('modal-notes').value;
      }

      try {
        await apiRequest('/api/secrets', {
          method: 'POST',
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

        showToast('Secret encrypted and stored in vault!', 'success');
        closeAddModal();
        loadSecrets();
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Encrypt & Save 🔒';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Encrypt & Save 🔒';
      }
    });
  }

  window.openAddModal = openAddModal;
  window.closeAddModal = closeAddModal;

  // Initial fetch
  await loadSecrets();
});
