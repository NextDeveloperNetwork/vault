document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('add-secret-form');
  const categorySelect = document.getElementById('category');

  // Check auth user
  try {
    const authRes = await apiRequest('/api/auth/me');
    if (authRes && authRes.user) {
      renderDesktopSidebar('add', authRes.user);
    }
  } catch (e) {
    return;
  }

  const passwordFields = document.getElementById('category-password-fields');
  const dbFields = document.getElementById('category-db-fields');
  const apiFields = document.getElementById('category-api-fields');

  const genPassBtn = document.getElementById('gen-pass-btn');
  const parseConnBtn = document.getElementById('parse-conn-btn');

  // Switch visible category form groups
  categorySelect.addEventListener('change', () => {
    const val = categorySelect.value;
    passwordFields.style.display = val === 'PASSWORD' ? 'block' : 'none';
    dbFields.style.display = val === 'DB_CONNECTION' ? 'block' : 'none';
    apiFields.style.display = (val === 'API_KEY' || val === 'SSH_KEY' || val === 'OTHER') ? 'block' : 'none';
  });

  // Password Generator
  if (genPassBtn) {
    genPassBtn.addEventListener('click', () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+~';
      let password = '';
      const array = new Uint32Array(18);
      window.crypto.getRandomValues(array);
      for (let i = 0; i < 18; i++) {
        password += chars[array[i] % chars.length];
      }

      const passInput = document.getElementById('secret-password');
      if (passInput) {
        passInput.value = password;
        passInput.type = 'text'; // temporarily show generated pass
        showToast('Generated strong 18-char password!', 'success');
      }
    });
  }

  // Connection String Auto-Parser Helper
  if (parseConnBtn) {
    parseConnBtn.addEventListener('click', () => {
      const connStrInput = document.getElementById('db-conn-string');
      const str = connStrInput.value.trim();
      if (!str) {
        showToast('Enter a connection URI first (e.g. postgresql://user:pass@host:5432/dbname)', 'error');
        return;
      }

      try {
        // Parse standard URI regex: protocol://user:pass@host:port/dbname
        const match = str.match(/^(?:([^:\/?#]+):)?(?:\/\/((?:([^:@]*)(?::([^:@]*))?@)?([^:\/?#]*)(?::(\d+))?))?(?:([^?#]*))?/);
        if (match) {
          const user = match[3] || '';
          const pass = match[4] || '';
          const host = match[5] || '';
          const port = match[6] || '';
          const dbName = (match[7] || '').replace(/^\//, '');

          if (user) document.getElementById('db-user').value = decodeURIComponent(user);
          if (pass) document.getElementById('db-pass').value = decodeURIComponent(pass);
          if (host) document.getElementById('db-host').value = host;
          if (port) document.getElementById('db-port').value = port;
          if (dbName) document.getElementById('db-name').value = dbName;

          showToast('Connection string parsed successfully!', 'success');
        }
      } catch (err) {
        showToast('Could not parse connection string pattern.', 'error');
      }
    });
  }

  // Submit Handler
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Encrypting & Saving...';

    const title = document.getElementById('title').value.trim();
    const category = categorySelect.value;
    const username = document.getElementById('username').value.trim();
    const websiteUrl = document.getElementById('websiteUrl').value.trim();
    const tagsStr = document.getElementById('tags').value.trim();
    const favorite = document.getElementById('favorite').checked;

    let payload = {};

    if (category === 'PASSWORD') {
      payload.password = document.getElementById('secret-password').value;
      payload.notes = document.getElementById('notes').value;
    } else if (category === 'DB_CONNECTION') {
      payload.connectionString = document.getElementById('db-conn-string').value.trim();
      payload.host = document.getElementById('db-host').value.trim();
      payload.port = document.getElementById('db-port').value.trim();
      payload.dbName = document.getElementById('db-name').value.trim();
      payload.username = document.getElementById('db-user').value.trim();
      payload.password = document.getElementById('db-pass').value;
      payload.notes = document.getElementById('notes').value;
    } else {
      payload.apiKey = document.getElementById('api-key-val').value;
      payload.notes = document.getElementById('notes').value;
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
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 500);
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save to Vault';
    }
  });
});
