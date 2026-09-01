document.addEventListener('DOMContentLoaded', async () => {
  let activeCategory = 'ALL';
  let searchQuery = '';
  let secretsData = [];

  const secretListContainer = document.getElementById('secret-list');
  const searchInput = document.getElementById('search-input');
  const pillBtns = document.querySelectorAll('.pill');
  const totalCountEl = document.getElementById('total-count');

  // Check auth user
  try {
    const authRes = await apiRequest('/api/auth/me');
    if (authRes && authRes.user) {
      const userGreeting = document.getElementById('user-name-display');
      if (userGreeting) userGreeting.textContent = authRes.user.name || authRes.user.email.split('@')[0];
    }
  } catch (e) {
    // Auth redirect handled by apiRequest
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

      if (totalCountEl) totalCountEl.textContent = `${secretsData.length} item${secretsData.length === 1 ? '' : 's'}`;
      renderSecrets(secretsData);
    } catch (err) {
      console.error('Failed to load secrets:', err);
    }
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
        <div class="glass-card" style="padding: 32px 16px; text-align: center;">
          <div style="font-size: 2.5rem; margin-bottom: 8px;">🛡️</div>
          <h3 style="margin-bottom: 6px;">No Vault Secrets Found</h3>
          <p>Tap '+' below to store your first password or connection string.</p>
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
              <button class="btn-icon" style="font-size:1.1rem" onclick="toggleFav('${item.id}')">${isFav}</button>
              <span class="badge badge-${item.category}">${item.category.replace('_', ' ')}</span>
            </div>
          </div>

          ${item.category === 'DB_CONNECTION' && payload.connectionString ? `
            <div class="conn-string-box">${escapeHtml(payload.connectionString)}</div>
          ` : ''}

          <div class="copy-actions">
            ${copyButtonsHtml}
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-color); padding-top:8px; margin-top:4px;">
            <span style="font-size:0.75rem; color:var(--text-dim);">Updated ${new Date(item.updatedAt).toLocaleDateString()}</span>
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
  }

  // Global window functions for cards
  window.toggleFav = async function(id) {
    try {
      const res = await apiRequest(`/api/secrets/${id}/favorite`, { method: 'PATCH' });
      showToast(res.message, 'success');
      loadSecrets();
    } catch (e) {}
  };

  window.deleteSecretItem = async function(id) {
    if (!confirm('Are you sure you want to permanently delete this secret from your vault?')) return;
    try {
      await apiRequest(`/api/secrets/${id}`, { method: 'DELETE' });
      showToast('Secret deleted.', 'success');
      loadSecrets();
    } catch (e) {}
  };

  // Initial fetch
  await loadSecrets();
});
