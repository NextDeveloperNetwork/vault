document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const togglePassBtns = document.querySelectorAll('.toggle-password-btn');

  // Password visibility toggle
  togglePassBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling;
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈';
      } else {
        input.type = 'password';
        btn.textContent = '👁️';
      }
    });
  });

  // Login handler
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Authenticating...';

      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;

      try {
        await apiRequest('/api/auth/login', {
          method: 'POST',
          body: { email, password }
        });
        showToast('Login successful! Redirecting...', 'success');
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 600);
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
      }
    });
  }

  // Register handler
  if (registerForm) {
    const passwordInput = document.getElementById('password');
    const strengthBar = document.getElementById('password-strength-bar');

    if (passwordInput && strengthBar) {
      passwordInput.addEventListener('input', () => {
        const val = passwordInput.value;
        let score = 0;
        if (val.length >= 8) score++;
        if (/[A-Z]/.test(val)) score++;
        if (/[0-9]/.test(val)) score++;
        if (/[^A-Za-z0-9]/.test(val)) score++;

        const colors = ['#ef4444', '#f59e0b', '#10b981', '#6366f1'];
        const width = (score / 4) * 100;
        strengthBar.style.width = `${width}%`;
        strengthBar.style.backgroundColor = colors[Math.max(0, score - 1)] || '#ef4444';
      });
    }

    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = registerForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating Account...';

      const name = document.getElementById('name').value;
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirmPassword').value;

      if (password !== confirmPassword) {
        showToast('Passwords do not match.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Vault Account';
        return;
      }

      try {
        const res = await apiRequest('/api/auth/register', {
          method: 'POST',
          body: { name, email, password }
        });

        if (res && res.user && res.user.status === 'PENDING') {
          showToast('Account registered! Pending admin approval before vault access.', 'info');
          setTimeout(() => {
            window.location.href = '/login';
          }, 1500);
        } else {
          showToast('Admin Vault created! Redirecting to Dashboard...', 'success');
          setTimeout(() => {
            window.location.href = '/dashboard';
          }, 600);
        }
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Vault Account';
      }
    });
  }
});
