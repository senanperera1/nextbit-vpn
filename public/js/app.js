/* ═══════════════════════════════════════
   NextBit VPN — JavaScript Utilities
   ═══════════════════════════════════════ */

// ─── API Helper ───
const api = {
    async request(method, url, body = null) {
        const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(url, opts);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
    },
    get: (url) => api.request('GET', url),
    post: (url, body) => api.request('POST', url, body),
    put: (url, body) => api.request('PUT', url, body),
    delete: (url) => api.request('DELETE', url),
};

// ─── Toast Notifications ───
function showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 4000);
}

// ─── Modal ───
function openModal(id) {
    document.getElementById(id).classList.add('active');
}
function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

// ─── Clipboard ───
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard!')).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
        showToast('Copied to clipboard!');
    });
}

// ─── Format Bytes ───
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(1)) + ' ' + sizes[i];
}

// ─── Format Date ───
function formatDate(dateStr) {
    if (!dateStr) return 'No expiry';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 'Expired';
    if (diff === 0) return 'Expires today';
    if (diff <= 7) return `${diff}d left`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Auth Navbar ───
function getAuthNavbarHTML(user) {
    return `
    <nav class="navbar">
        <a href="/dashboard" class="navbar-brand">⚡ NextBit VPN</a>
        <div class="navbar-links">
            <a href="/dashboard">Dashboard</a>
            ${user.role === 'ADMIN' ? '<a href="/admin-panel">Admin</a>' : ''}
            <button class="btn btn-secondary btn-sm" onclick="logout()">Logout</button>
        </div>
    </nav>`;
}

// ─── Logout ───
async function logout() {
    try { await api.post('/auth/logout'); } catch (e) { }
    window.location.href = '/login';
}
