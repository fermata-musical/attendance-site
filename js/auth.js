function initAuth() {
    const localSaved = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (localSaved) {
        const parsed = JSON.parse(localSaved);
        if (parsed.settings) {
            state.settings = { ...state.settings, ...parsed.settings };
        }
        state.auth = parsed.auth || state.auth;
        state.currentMember = parsed.currentMember || '';
    }

    const loginBtn = $('login-btn');
    if (loginBtn) {
        loginBtn.onclick = () => {
            const pw = ($('password-input').value || '').trim();

            if (pw === CONFIG.ADMIN_PW) {
                state.auth = { isLoggedIn: true, type: 'admin' };
            } else if (pw === CONFIG.COMMON_PW) {
                state.auth = { isLoggedIn: true, type: 'common' };
            } else {
                $('login-error').classList.remove('hidden');
                return;
            }

            saveLocal();
            $('login-overlay').style.display = 'none';
            $('app').classList.remove('hidden');
            loadCloud();
        };
    }

    const logoutBtn = $('logout-btn');
    if (logoutBtn) {
        logoutBtn.onclick = () => {
            if (confirm('ログアウトしますか？')) {
                state.auth = { isLoggedIn: false, type: null };
                saveLocal();
                location.reload();
            }
        };
    }

    if (state.auth.isLoggedIn) {
        $('login-overlay').style.display = 'none';
        $('app').classList.remove('hidden');
        loadCloud();
    } else {
        $('login-overlay').style.display = 'flex';
        $('app').classList.add('hidden');
    }

    updateLockIcons();
}