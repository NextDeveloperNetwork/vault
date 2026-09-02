document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('users-list-container');
  const pendingBadge = document.getElementById('pending-count-badge');
  let currentUser = null;

  try {
    const authRes = await apiRequest('/api/auth/me');
    if (!authRes || !authRes.user || authRes.user.role !== 'ADMIN') {
      showToast('Admin privileges required.', 'error');
      window.location.href = '/dashboard';
      return;
    }
    currentUser = authRes.user;
    renderDesktopSidebar('users', currentUser);
  } catch (e) {
    return;
  }

  async function loadUsers() {
    try {
      const res = await apiRequest('/api/admin/users');
      const users = res.users || [];

      const pendingCount = users.filter(u => u.status === 'PENDING').length;
      if (pendingBadge) pendingBadge.textContent = `${pendingCount} Pending`;

      renderUsers(users);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  }

  function renderUsers(users) {
    if (!container) return;

    if (users.length === 0) {
      container.innerHTML = `
        <div class="glass-card" style="padding:32px; text-align:center;">
          <div style="font-size:2rem; margin-bottom:8px;">👥</div>
          <h3>No Users Found</h3>
        </div>
      `;
      return;
    }

    container.innerHTML = users.map(user => {
      const isSelf = user.id === currentUser.id;

      return `
        <div class="glass-card" style="padding:16px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
            <div>
              <div style="font-weight:700; font-size:1.05rem; color:#0f172a; display:flex; align-items:center; gap:8px;">
                ${escapeHtml(user.name || user.email.split('@')[0])}
                ${isSelf ? '<span style="font-size:0.75rem; color:var(--accent-primary);">(You)</span>' : ''}
              </div>
              <div style="font-size:0.85rem; color:var(--text-muted);">${escapeHtml(user.email)}</div>
              <div style="font-size:0.75rem; color:var(--text-dim); margin-top:4px;">
                Registered: ${new Date(user.createdAt).toLocaleDateString()} • ${user._count?.secrets || 0} secrets
              </div>
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
              <span class="badge badge-${user.role}">${user.role}</span>
              <span class="badge badge-${user.status}">${user.status}</span>
            </div>
          </div>

          <div style="display:flex; flex-wrap:wrap; gap:8px; border-top:1px solid var(--border-color); padding-top:12px; margin-top:8px;">
            ${user.status === 'PENDING' ? `
              <button class="btn-copy" style="background:rgba(16, 185, 129, 0.2); border-color:rgba(16, 185, 129, 0.4); color:#34d399;" onclick="approveUser('${user.id}')">
                ✅ Approve Account
              </button>
              <button class="btn-copy" style="background:rgba(239, 68, 68, 0.15); border-color:rgba(239, 68, 68, 0.3); color:#fca5a5;" onclick="rejectUser('${user.id}')">
                ❌ Reject
              </button>
            ` : ''}

            ${user.status === 'REJECTED' ? `
              <button class="btn-copy" style="background:rgba(16, 185, 129, 0.2); border-color:rgba(16, 185, 129, 0.4); color:#34d399;" onclick="approveUser('${user.id}')">
                ✅ Re-Approve Account
              </button>
            ` : ''}

            ${!isSelf ? `
              <button class="btn-copy" onclick="toggleRole('${user.id}', '${user.role === 'ADMIN' ? 'USER' : 'ADMIN'}')">
                👑 ${user.role === 'ADMIN' ? 'Demote to User' : 'Promote to Admin'}
              </button>

              <button class="btn-copy" style="background:rgba(239, 68, 68, 0.1); border-color:rgba(239, 68, 68, 0.2); color:#fca5a5; margin-left:auto;" onclick="deleteUser('${user.id}')">
                🗑️ Delete
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.approveUser = async function(id) {
    try {
      const res = await apiRequest(`/api/admin/users/${id}/approve`, { method: 'PATCH' });
      showToast(res.message, 'success');
      loadUsers();
    } catch (e) {}
  };

  window.rejectUser = async function(id) {
    try {
      const res = await apiRequest(`/api/admin/users/${id}/reject`, { method: 'PATCH' });
      showToast(res.message, 'info');
      loadUsers();
    } catch (e) {}
  };

  window.toggleRole = async function(id, newRole) {
    try {
      const res = await apiRequest(`/api/admin/users/${id}/role`, {
        method: 'PATCH',
        body: { role: newRole }
      });
      showToast(res.message, 'success');
      loadUsers();
    } catch (e) {}
  };

  window.deleteUser = async function(id) {
    if (!confirm('Are you sure you want to permanently delete this user account?')) return;
    try {
      const res = await apiRequest(`/api/admin/users/${id}`, { method: 'DELETE' });
      showToast(res.message, 'success');
      loadUsers();
    } catch (e) {}
  };

  await loadUsers();
});
