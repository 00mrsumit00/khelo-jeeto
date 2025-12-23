// Rendeerer/script.js

// DOM Elements
const loginBtn = document.getElementById('login-btn');
const errorMsg = document.getElementById('error-msg');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const rememberCheckbox = document.getElementById('remember');

// Listen for Enter key
passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handleLogin();
    }
});
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handleLogin();
    }
});

// Main Login Handler
loginBtn.addEventListener('click', handleLogin);

// This is the updated async function
async function handleLogin() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    errorMsg.style.display = 'none';

    if (!username || !password) {
        showError('Please enter both username and password');
        return;
    }

    loginBtn.textContent = 'Logging in...';
    loginBtn.disabled = true;

    // Use the "bridge" to call the main.js function
    const result = await window.electronAPI.login(username, password);

    if (result.success) {
        sessionStorage.setItem('isAuthenticated', 'true');
        sessionStorage.setItem('username', result.user.username);
        sessionStorage.setItem('balance', result.user.balance); // Store balance!
        sessionStorage.setItem('userId', result.user.user_id);
        sessionStorage.setItem('loginTime', new Date().toISOString());

        if (rememberCheckbox.checked) {
            localStorage.setItem('rememberedUser', username);
        } else {
            localStorage.removeItem('rememberedUser');
        }

        // Redirect to dashboard
        // Make sure this path is correct!
        window.location.href = './After Login/dashboard.html';

    } else {
        // Failed login
        showError(result.message);
        loginBtn.textContent = 'Login & Play';
        loginBtn.disabled = false;

        // Shake animation
        loginBtn.classList.add('shake');
        setTimeout(() => loginBtn.classList.remove('shake'), 500);
    }
}

function showError(message) {
    errorMsg.textContent = message;
    errorMsg.style.display = 'block';
}

// Auto-fill remembered username
window.addEventListener('DOMContentLoaded', () => {
    const rememberedUser = localStorage.getItem('rememberedUser');
    if (rememberedUser) {
        usernameInput.value = rememberedUser;
        rememberCheckbox.checked = true;
        passwordInput.focus();
    }
});

// Add shake animation CSS (if not already in a separate CSS file)
const style = document.createElement('style');
style.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); }
        20%, 40%, 60%, 80% { transform: translateX(8px); }
    }
    .shake {
        animation: shake 0.5s;
    }
`;
document.head.appendChild(style);