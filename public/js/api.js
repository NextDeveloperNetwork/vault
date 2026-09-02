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
function renderDesktopSidebar(activePage = 'dashboard', currentUser = null) {
  const existingSidebar = document.querySelector('.desktop-sidebar');
  if (existingSidebar) existingSidebar.remove();

  const sidebar = document.createElement('aside');
  sidebar.className = 'desktop-sidebar';

  const isAdmin = currentUser && currentUser.role === 'ADMIN';

  sidebar.innerHTML = `
    <div class="sidebar-brand">
      <div class="brand-logo">🔐</div>
      <div>
        <div class="brand-title" style="font-size:1.2rem;">PassKeeper</div>
        <div style="font-size:0.72rem; color:var(--text-muted)">Encrypted Secret Vault</div>
      </div>
    </div>

    <nav class="sidebar-menu">
      <a href="/dashboard" class="sidebar-link ${activePage === 'dashboard' ? 'active' : ''}">
        <span style="font-size:1.2rem">🛡️</span> Vault Dashboard
      </a>
      ${isAdmin ? `
        <a href="/users" class="sidebar-link ${activePage === 'users' ? 'active' : ''}">
          <span style="font-size:1.2rem">👥</span> User Approvals
        </a>
      ` : ''}
      <a href="/settings" class="sidebar-link ${activePage === 'settings' ? 'active' : ''}">
        <span style="font-size:1.2rem">⚙️</span> Settings & Backup
      </a>
    </nav>

    <div class="sidebar-footer">
      ${currentUser ? `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
          <div>
            <div style="font-weight:700; font-size:0.85rem; color:#0f172a;">${currentUser.name || currentUser.email.split('@')[0]}</div>
            <div style="font-size:0.75rem; color:#64748b;">${currentUser.email}</div>
          </div>
          <span class="badge badge-${currentUser.role}">${currentUser.role}</span>
        </div>
      ` : ''}
      <button onclick="handleSidebarLogout()" class="btn btn-secondary" style="width:100%; font-size:0.85rem; padding:8px 12px; min-height:36px;">
        🚪 Log Out
      </button>
    </div>
  `;

  document.body.prepend(sidebar);
}

async function handleSidebarLogout() {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
    showToast('Logged out.', 'info');
    setTimeout(() => window.location.href = '/login', 300);
  } catch (e) {
    window.location.href = '/login';
  }
}

window.showToast = showToast;
window.apiRequest = apiRequest;
window.copyToClipboard = copyToClipboard;
window.renderDesktopSidebar = renderDesktopSidebar;
window.handleSidebarLogout = handleSidebarLogout;
