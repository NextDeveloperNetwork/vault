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
      <div class="brand-logo">
        <i data-lucide="shield-check" class="icon-md"></i>
      </div>
      <div>
        <div class="brand-title">PassKeeper</div>
        <div style="font-size:0.75rem; color:var(--muted-foreground)">Encrypted Secret Vault</div>
      </div>
    </div>

    <nav class="sidebar-menu">
      <a href="/dashboard" class="sidebar-link ${activePage === 'dashboard' ? 'active' : ''}">
        <i data-lucide="layout-dashboard" class="icon-sm"></i>
        <span>Vault Dashboard</span>
      </a>
      ${isAdmin ? `
        <a href="/users" class="sidebar-link ${activePage === 'users' ? 'active' : ''}">
          <i data-lucide="users" class="icon-sm"></i>
          <span>User Approvals</span>
        </a>
      ` : ''}
      <a href="/settings" class="sidebar-link ${activePage === 'settings' ? 'active' : ''}">
        <i data-lucide="settings" class="icon-sm"></i>
        <span>Settings & Backup</span>
      </a>
    </nav>

    <div class="sidebar-footer">
      ${currentUser ? `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
          <div style="overflow:hidden; text-overflow:ellipsis;">
            <div style="font-weight:600; font-size:0.875rem; color:var(--foreground);">${currentUser.name || currentUser.email.split('@')[0]}</div>
            <div style="font-size:0.75rem; color:var(--muted-foreground); text-overflow:ellipsis; overflow:hidden;">${currentUser.email}</div>
          </div>
          <span class="badge badge-${currentUser.role}">${currentUser.role}</span>
        </div>
      ` : ''}
      <button onclick="handleSidebarLogout()" class="btn btn-secondary" style="width:100%; font-size:0.8125rem; height:2rem;">
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
