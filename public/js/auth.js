// Check if user is already logged in and redirect immediately away from login/register
async function checkAuthAndRedirect() {
  try {
    const res = await apiRequest('/api/auth/me');
    if (res && res.user && res.user.status === 'APPROVED') {
      window.location.replace('/dashboard');
    }
  } catch (err) {
    // Not authenticated, stay on page
  }
}

// Check on initial script execution and on bfcache restore
checkAuthAndRedirect();
window.addEventListener('pageshow', () => {
  checkAuthAndRedirect();
});

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const togglePassBtns = document.querySelectorAll('.toggle-password-btn');
  const pendingBanner = document.getElementById('pending-banner');

  // Check URL params for pending state banner
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('pending') === 'true' && pendingBanner) {
    pendingBanner.style.display = 'flex';
  }

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
      submitBtn.textContent = 'Unlocking Vault...';

      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;

      try {
        const res = await apiRequest('/api/auth/login', {
          method: 'POST',
          body: { email, password }
        });

        if (res && res.user) {
          if (res.user.status === 'PENDING') {
            showToast('Account is pending admin approval.', 'info');
            if (pendingBanner) pendingBanner.style.display = 'flex';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign In to Vault 🔓';
            return;
          }

          showToast('Login successful! Redirecting...', 'success');
          // Use replace() so /login is removed from back-button history
          setTimeout(() => {
            window.location.replace('/dashboard');
          }, 300);
        }
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In to Vault 🔓';
      }
    });
  }

  // Register handler with password strength calculator
  if (registerForm) {
    const passwordInput = document.getElementById('password');
    const strengthBar = document.getElementById('password-strength-bar');
    const strengthText = document.getElementById('password-strength-text');

    if (passwordInput && strengthBar) {
      passwordInput.addEventListener('input', () => {
        const val = passwordInput.value;
        if (!val) {
          strengthBar.style.width = '0%';
          if (strengthText) {
            strengthText.textContent = 'Min 8 chars';
            strengthText.style.color = '#94a3b8';
          }
          return;
        }

        let score = 0;
        if (val.length >= 8) score++;
        if (/[A-Z]/.test(val)) score++;
        if (/[0-9]/.test(val)) score++;
        if (/[^A-Za-z0-9]/.test(val)) score++;

        const colors = ['#dc2626', '#d97706', '#059669', '#4f46e5'];
        const labels = ['Weak', 'Fair', 'Strong', 'Ultra Strong 🛡️'];
        const width = (score / 4) * 100;
        
        strengthBar.style.width = `${width}%`;
        strengthBar.style.backgroundColor = colors[Math.max(0, score - 1)] || '#dc2626';
        
        if (strengthText) {
          strengthText.textContent = labels[Math.max(0, score - 1)] || 'Weak';
          strengthText.style.color = colors[Math.max(0, score - 1)] || '#dc2626';
        }
      });
    }

    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = registerForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating Vault Account...';

      const name = document.getElementById('name').value.trim();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirmPassword').value;

      if (password !== confirmPassword) {
        showToast('Passwords do not match.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Vault Account 🔑';
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
            window.location.replace('/login?pending=true');
          }, 1200);
        } else {
          showToast('Admin Vault created! Redirecting to Dashboard...', 'success');
          // Use replace() so registration page is removed from history
          setTimeout(() => {
            window.location.replace('/dashboard');
          }, 300);
        }
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Vault Account 🔑';
      }
    });
  }
});
