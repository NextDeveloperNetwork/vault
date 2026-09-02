document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('users-list-container');
  const pendingBadge = document.getElementById('pending-count-badge');
  let currentUser = null;

  try {
    const authRes = await apiRequest('/api/auth/me');
    if (!authRes || !authRes.user || authRes.user.role !== 'ADMIN') {
      showToast('Admin privileges required.', 'error');
      window.location.replace('/dashboard');
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
        <div class="card" style="padding:2.5rem; text-align:center;">
          <div style="width: 3rem; height: 3rem; border-radius: 50%; background: var(--secondary); display: flex; align-items: center; justify-content: center; margin: 0 auto 0.75rem auto; color: var(--muted-foreground);">
            <i data-lucide="users" class="icon-lg"></i>
          </div>
          <h3 style="font-size:1.125rem; font-weight:600; color:var(--foreground);">No Users Found</h3>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    container.innerHTML = users.map(user => {
      const isSelf = user.id === currentUser.id;

      return `
        <div class="card" style="padding:1.125rem;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.75rem;">
            <div>
              <div style="font-weight:600; font-size:0.9375rem; color:var(--foreground); display:flex; align-items:center; gap:0.5rem;">
                <span>${escapeHtml(user.name || user.email.split('@')[0])}</span>
                ${isSelf ? '<span style="font-size:0.6875rem; color:var(--muted-foreground); font-weight:500;">(You)</span>' : ''}
              </div>
              <div style="font-size:0.8125rem; color:var(--muted-foreground);">${escapeHtml(user.email)}</div>
              <div style="font-size:0.75rem; color:var(--muted-foreground); margin-top:0.25rem;">
                Registered: ${new Date(user.createdAt).toLocaleDateString()} • ${user._count?.secrets || 0} secrets
              </div>
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:0.375rem;">
              <span class="badge badge-${user.role}">${user.role}</span>
              <span class="badge badge-${user.status}">${user.status}</span>
            </div>
          </div>

          <div style="display:flex; flex-wrap:wrap; gap:0.375rem; border-top:1px solid var(--border); padding-top:0.75rem; margin-top:0.5rem;">
            ${user.status === 'PENDING' ? `
              <button class="btn btn-outline" style="border-color:#a7f3d0; color:#047857; background:#ecfdf5; font-size:0.75rem; height:1.75rem;" onclick="approveUser('${user.id}')">
                <i data-lucide="check" class="icon-xs"></i>
                <span>Approve Account</span>
              </button>
              <button class="btn btn-danger" style="font-size:0.75rem; height:1.75rem;" onclick="rejectUser('${user.id}')">
                <i data-lucide="x" class="icon-xs"></i>
                <span>Reject</span>
              </button>
            ` : ''}

            ${user.status === 'REJECTED' ? `
              <button class="btn btn-outline" style="border-color:#a7f3d0; color:#047857; background:#ecfdf5; font-size:0.75rem; height:1.75rem;" onclick="approveUser('${user.id}')">
                <i data-lucide="check" class="icon-xs"></i>
                <span>Re-Approve Account</span>
              </button>
            ` : ''}

            ${!isSelf ? `
              <button class="btn btn-outline" style="font-size:0.75rem; height:1.75rem;" onclick="toggleRole('${user.id}', '${user.role === 'ADMIN' ? 'USER' : 'ADMIN'}')">
                <i data-lucide="shield" class="icon-xs"></i>
                <span>${user.role === 'ADMIN' ? 'Demote to User' : 'Promote to Admin'}</span>
              </button>

              <button class="btn btn-danger" style="margin-left:auto; font-size:0.75rem; height:1.75rem;" onclick="deleteUser('${user.id}')">
                <i data-lucide="trash-2" class="icon-xs"></i>
                <span>Delete</span>
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) {
      lucide.createIcons();
    }
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
      await apiRequest(`/api/admin/users/${id}`, { method: 'DELETE' });
      showToast(res.message, 'success');
      loadUsers();
    } catch (e) {}
  };

  await loadUsers();
});
