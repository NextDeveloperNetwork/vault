document.addEventListener('DOMContentLoaded', async () => {
  const emailEl = document.getElementById('user-email');
  const nameEl = document.getElementById('user-name');
  const roleEl = document.getElementById('user-role');
  const statusEl = document.getElementById('user-status');
  const dateEl = document.getElementById('user-created-date');
  const logoutBtn = document.getElementById('logout-btn');
  const exportBtn = document.getElementById('export-vault-btn');
  const cfStatusEl = document.getElementById('cf-status');

  try {
    const res = await apiRequest('/api/auth/me');
    if (res && res.user) {
      if (emailEl) emailEl.textContent = res.user.email;
      if (nameEl) nameEl.textContent = res.user.name || 'Not set';
      if (roleEl) {
        roleEl.textContent = res.user.role;
        roleEl.className = `badge badge-${res.user.role}`;
      }
      if (statusEl) {
        statusEl.textContent = res.user.status;
        statusEl.className = `badge badge-${res.user.status}`;
      }
      if (dateEl) dateEl.textContent = new Date(res.user.createdAt).toLocaleDateString();

      renderDesktopSidebar('settings', res.user);
    }
  } catch (e) {
    return;
  }

  // Check health / Cloudflare connection
  try {
    const health = await apiRequest('/api/health');
    if (health && health.status === 'ok') {
      if (cfStatusEl) {
        cfStatusEl.textContent = 'Active & Secure';
        cfStatusEl.className = 'badge badge-DB_CONNECTION';
      }
    }
  } catch (e) {
    if (cfStatusEl) {
      cfStatusEl.textContent = 'Offline / Local';
      cfStatusEl.className = 'badge badge-OTHER';
    }
  }

  // Export Vault Backup
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      try {
        const res = await apiRequest('/api/secrets?category=ALL');
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.secrets, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `passkeeper-backup-${new Date().toISOString().slice(0,10)}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        showToast('Vault backup downloaded!', 'success');
      } catch (err) {
        showToast('Failed to export vault backup.', 'error');
      }
    });
  }

  // Logout Handler
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await apiRequest('/api/auth/logout', { method: 'POST' });
        showToast('Logged out.', 'info');
        setTimeout(() => {
          window.location.replace('/login');
        }, 300);
      } catch (e) {
        window.location.replace('/login');
      }
    });
  }
});
