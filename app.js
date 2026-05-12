/**
 * Musical Attendance App Logic (v19)
 */

// --- Constants & Security ---
const SITE_PASSWORD_HASH = "fermata2026"; // メンバー用共通パスワード
const ADMIN_PASSWORD_HASH = "admin999";    // 管理者用パスワード

// --- Default Data ---
const DEFAULT_LOCATIONS = ['青崎公民館', '祇園公民館', '宇品公民館', '八本松地域センター'];
const DEFAULT_MENU_TYPES = [
    'ワークショップ演技', 'ワークショップ歌', 'ワークショップダンス', 'ワークショップタップ', 'ワークショップミュージカル',
    '美女野獣稽古', '美女野獣合唱練習', '個人レッスン', 'グループレッスン'
];

const DEFAULT_SCHEDULES = [
    { id: 'day1', date: '2026-04-25', location: '青崎公民館', sessions: [{ id: 's1', start: '14:00', end: '17:00', menu: '美女野獣合唱練習' }] },
    { id: 'day2', date: '2026-04-26', location: '午前：八本松地域センター／午後：青崎公民館研修室', sessions: [{ id: 's2', start: '09:30', end: '10:30', menu: 'ワークショップ演技' }, { id: 's3', start: '10:30', end: '12:00', menu: 'ワークショップ歌' }] },
    { id: 'day3', date: '2026-05-10', location: '午前：八本松地域センター／午後：段原公民館', sessions: [{ id: 's4', start: '09:30', end: '10:45', menu: 'ワークショップ演技' }, { id: 's5', start: '11:00', end: '12:00', menu: 'ワークショップミュージカル' }] }
];

// --- State ---
let state = {
    members: JSON.parse(localStorage.getItem('fermata_v19_members')) || [],
    attendance: JSON.parse(localStorage.getItem('fermata_v19_attendance')) || {},
    notes: JSON.parse(localStorage.getItem('fermata_v19_notes')) || {},
    schedules: JSON.parse(localStorage.getItem('fermata_v19_schedules')) || DEFAULT_SCHEDULES,
    locations: JSON.parse(localStorage.getItem('fermata_v19_locations')) || DEFAULT_LOCATIONS,
    menuTypes: JSON.parse(localStorage.getItem('fermata_v19_menu_types')) || DEFAULT_MENU_TYPES,
    tabPermissions: JSON.parse(localStorage.getItem('fermata_v19_tab_permissions')) || { user: false, summary: true, admin: true, past: true },
    currentMemberId: localStorage.getItem('fermata_v19_current_member_id') || null,
    selectedMonth: null,
    isLoggedIn: sessionStorage.getItem('fermata_auth') === 'true',
    isAdmin: sessionStorage.getItem('fermata_admin') === 'true'
};

// --- DOM Elements ---
const el = {
    loginScreen: document.getElementById('login-screen'),
    mainApp: document.getElementById('main-app'),
    sitePasswordInput: document.getElementById('site-password-input'),
    siteLoginBtn: document.getElementById('site-login-btn'),
    loginError: document.getElementById('login-error'),
    logoutBtn: document.getElementById('logout-btn'),
    tabUser: document.getElementById('tab-user'),
    tabSummary: document.getElementById('tab-summary'),
    tabAdmin: document.getElementById('tab-admin'),
    tabPast: document.getElementById('tab-past'),
    userModeContent: document.getElementById('user-mode-content'),
    summaryModeContent: document.getElementById('summary-mode-content'),
    adminModeContent: document.getElementById('admin-mode-content'),
    pastModeContent: document.getElementById('past-mode-content'),
    memberList: document.getElementById('member-list'),
    memberNameInput: document.getElementById('member-name-input'),
    addMemberBtn: document.getElementById('add-member-btn'),
    currentSelectionMsg: document.getElementById('current-selection-msg'),
    selectedMemberName: document.getElementById('selected-member-name'),
    attendanceSection: document.getElementById('attendance-section'),
    monthSelector: document.getElementById('month-selector'),
    practiceSchedule: document.getElementById('practice-schedule'),
    summaryView: document.getElementById('summary-view'),
    pastScheduleList: document.getElementById('past-schedule-list'),
    adminScheduleList: document.getElementById('admin-schedule-list'),
    locList: document.getElementById('loc-list'),
    menuList: document.getElementById('menu-list'),
    newLocInput: document.getElementById('new-loc-input'),
    newMenuInput: document.getElementById('new-menu-input'),
    addLocBtn: document.getElementById('add-loc-btn'),
    addMenuBtn: document.getElementById('add-menu-btn'),
    locDatalist: document.getElementById('location-options'),
    menuDatalist: document.getElementById('menu-type-options'),
    tabPermissionControls: document.getElementById('tab-permission-controls'),
    toast: document.getElementById('toast'),
    deleteAllPastBtn: document.getElementById('delete-all-past-btn')
};

// --- Helpers ---
function save() {
    localStorage.setItem('fermata_v19_members', JSON.stringify(state.members));
    localStorage.setItem('fermata_v19_attendance', JSON.stringify(state.attendance));
    localStorage.setItem('fermata_v19_notes', JSON.stringify(state.notes));
    localStorage.setItem('fermata_v19_schedules', JSON.stringify(state.schedules));
    localStorage.setItem('fermata_v19_locations', JSON.stringify(state.locations));
    localStorage.setItem('fermata_v19_menu_types', JSON.stringify(state.menuTypes));
    localStorage.setItem('fermata_v19_tab_permissions', JSON.stringify(state.tabPermissions));
    localStorage.setItem('fermata_v19_current_member_id', state.currentMemberId || '');
}

function showToast(msg) { el.toast.textContent = msg; el.toast.classList.remove('hidden'); setTimeout(() => el.toast.classList.add('hidden'), 2000); }
function generateId() { return Math.random().toString(36).substr(2, 9); }
function formatTimeRange(s) { if (!s.start && !s.end) return '時間未定'; return `${s.start || ''}〜${s.end || ''}`; }
function getToday() { return new Date().toISOString().split('T')[0]; }
function getCurrentMonth() { return new Date().toISOString().substring(0, 7); }

function generateTimeOptions() {
    const times = [""];
    for (let h = 8; h <= 22; h++) {
        for (let m = 0; m < 60; m += 15) { times.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`); }
    }
    return times;
}
const TIME_OPTIONS = generateTimeOptions();

// --- Initialization ---
function init() {
    if (state.isLoggedIn) { showApp(); } else { showLogin(); }
    setupEventListeners();
}

function showLogin() { el.loginScreen.classList.remove('hidden'); el.mainApp.classList.add('hidden'); }
function showApp() { el.loginScreen.classList.add('hidden'); el.mainApp.classList.remove('hidden'); state.selectedMonth = getCurrentMonth(); render(); switchTab('user', true); }

function render() {
    renderDatalists(); renderMembers(); renderSelection(); renderMonthSelector(); renderSchedules(); renderSummary(); renderPastSchedules(); renderAdminSchedules(); renderOptionLists(); renderTabs(); renderPermissionControls();
}

function renderTabs() {
    const tabs = [
        { id: 'user', name: '出欠入力' },
        { id: 'summary', name: '全体の参加状況' },
        { id: 'admin', name: '管理画面' },
        { id: 'past', name: '過去の出欠管理' }
    ];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-${t.id}`);
        const isLocked = state.tabPermissions[t.id];
        btn.innerHTML = `${isLocked ? '<span style="font-size:0.8rem; margin-right:4px;">🔒</span>' : ''}${t.name}`;
        btn.title = isLocked ? '管理者パスワードが必要です' : '';
    });
}

function renderPermissionControls() {
    const tabs = [
        { id: 'user', name: '出欠入力' },
        { id: 'summary', name: '全体の参加状況' },
        { id: 'admin', name: '管理画面' },
        { id: 'past', name: '過去の出欠管理' }
    ];
    el.tabPermissionControls.innerHTML = tabs.map(t => `
        <div class="option-item">
            <span>${t.name}</span>
            <label class="switch-container" style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" ${state.tabPermissions[t.id] ? 'checked' : ''} onchange="togglePermission('${t.id}', this.checked)">
                <span style="font-size: 0.8rem; color: var(--text-muted);">${state.tabPermissions[t.id] ? '🔒 保護中' : '🔓 公開'}</span>
            </label>
        </div>
    `).join('');
}

function togglePermission(id, val) { state.tabPermissions[id] = val; save(); renderTabs(); renderPermissionControls(); showToast('設定を更新しました'); }

function renderDatalists() {
    el.locDatalist.innerHTML = state.locations.map(o => `<option value="${o}">${o}</option>`).join('');
    el.menuDatalist.innerHTML = state.menuTypes.map(o => `<option value="${o}">${o}</option>`).join('');
}

// --- User Mode ---
function renderMembers() {
    el.memberList.innerHTML = '';
    state.members.forEach(m => {
        const chip = document.createElement('div');
        chip.className = `member-chip ${state.currentMemberId === m.id ? 'active' : ''}`; chip.textContent = m.name;
        chip.onclick = () => { state.currentMemberId = (state.currentMemberId === m.id) ? null : m.id; save(); render(); };
        el.memberList.appendChild(chip);
    });
}

function renderSelection() {
    const member = state.members.find(m => m.id === state.currentMemberId);
    if (member) { el.selectedMemberName.textContent = member.name; el.currentSelectionMsg.classList.remove('hidden'); el.attendanceSection.classList.remove('hidden'); }
    else { el.currentSelectionMsg.classList.add('hidden'); el.attendanceSection.classList.add('hidden'); }
}

function renderMonthSelector() {
    const today = getToday(); const futureDays = state.schedules.filter(s => s.date === '' || s.date >= today);
    const months = [...new Set(futureDays.map(s => s.date.substring(0, 7)))].filter(m => m !== '').sort();
    const curMonth = getCurrentMonth(); if (!months.includes(curMonth)) months.unshift(curMonth);
    el.monthSelector.innerHTML = months.map(m => `
        <button class="month-btn ${state.selectedMonth === m ? 'active' : ''}" onclick="selectMonth('${m}')">${m.split('-')[0]}年${m.split('-')[1]}月</button>
    `).join('');
}

function selectMonth(m) { state.selectedMonth = m; renderSchedules(); renderMonthSelector(); }

function renderSchedules() {
    el.practiceSchedule.innerHTML = ''; const today = getToday();
    const filtered = state.schedules.filter(s => {
        if (s.date < today && s.date !== '') return false;
        return s.date.startsWith(state.selectedMonth) || s.date === '';
    }).sort((a, b) => {
        if (a.date === '' && b.date === '') return 0; if (a.date === '') return 1; if (b.date === '') return -1;
        return a.date.localeCompare(b.date);
    });
    if (filtered.length === 0) { el.practiceSchedule.innerHTML = `<p class="text-center text-muted">${state.selectedMonth}月の予定はありません</p>`; return; }
    filtered.forEach(day => {
        const dayEl = document.createElement('div'); dayEl.className = 'day-card';
        let sHtml = day.sessions.map(s => {
            const status = state.attendance[`${s.id}_${state.currentMemberId}`];
            const note = state.notes[`${s.id}_${state.currentMemberId}`] || '';
            return `
                <div class="session-item">
                    <div class="session-info"><span class="session-time">${formatTimeRange(s)}</span><span class="session-title">${s.menu || '稽古'}</span></div>
                    <div class="attendance-controls">
                        <button class="attendance-btn present ${status === 'present' ? 'active' : ''}" onclick="toggleAttendance('${s.id}', 'present')">出席</button>
                        <button class="attendance-btn absent ${status === 'absent' ? 'active' : ''}" onclick="toggleAttendance('${s.id}', 'absent')">欠席</button>
                    </div>
                    <div class="session-note-box">
                        <input type="text" class="session-note-input" placeholder="備考があれば入力" value="${note}" onchange="saveNote('${s.id}', this.value)">
                    </div>
                </div>
            `;
        }).join('');
        dayEl.innerHTML = `<div class="day-header"><div class="day-date">${day.date || '（日付未設定）'}</div><div class="day-location">${day.location}</div></div><div class="sessions-list">${sHtml}</div>`;
        el.practiceSchedule.appendChild(dayEl);
    });
}

function saveNote(sid, val) { if (!state.currentMemberId) return; state.notes[`${sid}_${state.currentMemberId}`] = val; save(); }

function renderSummary() {
    const today = getToday(); const futureSchedules = state.schedules.filter(s => s.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    if (state.members.length === 0) { el.summaryView.innerHTML = '<p class="text-center text-muted">メンバーを登録すると表示されます</p>'; return; }
    let html = '';
    futureSchedules.forEach(day => {
        let hasAttendee = day.sessions.some(s => state.members.some(m => state.attendance[`${s.id}_${m.id}`] === 'present'));
        if (!hasAttendee) return;
        html += `<div class="summary-day-group"><div class="summary-day-header"><span class="summary-day-date">${day.date}</span><span class="summary-day-location">${day.location}</span></div>`;
        day.sessions.forEach(s => {
            const att = state.members.filter(m => state.attendance[`${s.id}_${m.id}`] === 'present').map(m => {
                const note = state.notes[`${s.id}_${m.id}`];
                return `<span class="participant-name">${m.name}</span>${note ? `<span class="participant-note"> (${note})</span>` : ''}`;
            });
            if (att.length === 0) return;
            html += `<div class="summary-session"><div style="font-weight: 600; font-size: 0.9rem; margin-bottom: 0.25rem;">${formatTimeRange(s)} ${s.menu}</div><div class="summary-participants"><span class="summary-label">出席：</span><span class="name-list">${att.join('、')}</span></div></div>`;
        });
        html += '</div>';
    });
    el.summaryView.innerHTML = html || '<p class="text-center text-muted">直近の出席予定はありません</p>';
}

// --- Past Mode ---
function renderPastSchedules() {
    el.pastScheduleList.innerHTML = ''; const today = getToday();
    const pastSchedules = state.schedules.filter(s => s.date !== '' && s.date < today).sort((a, b) => b.date.localeCompare(a.date));
    if (pastSchedules.length === 0) { el.pastScheduleList.innerHTML = '<p class="text-center text-muted">過去の記録はありません</p>'; return; }
    pastSchedules.forEach(day => {
        const item = document.createElement('div'); item.className = 'admin-schedule-item';
        let sHtml = day.sessions.map(s => {
            const att = state.members.filter(m => state.attendance[`${s.id}_${m.id}`] === 'present').map(m => m.name);
            return `<div style="font-size: 0.85rem; margin-bottom: 0.25rem;"><strong>${formatTimeRange(s)} ${s.menu}</strong>: ${att.length}名出席</div>`;
        }).join('');
        item.innerHTML = `<div class="admin-day-title"><div><div style="font-weight: 700; color: var(--primary-dark);">${day.date}</div><div style="font-size: 0.9rem; color: var(--text-muted);">${day.location}</div></div><button class="btn-discreet" onclick="removeDayById('${day.id}')" style="margin-top:0.5rem">日程ごと削除</button></div><div style="padding: 1rem;">${sHtml}</div>`;
        el.pastScheduleList.appendChild(item);
    });
}

function removeDayById(id) { if (!confirm('データを削除しますか？')) return; state.schedules = state.schedules.filter(s => s.id !== id); save(); render(); showToast('削除しました'); }
function deleteAllPast() { const today = getToday(); if (!confirm('今日より前のすべての日程を削除しますか？')) return; state.schedules = state.schedules.filter(s => s.date === '' || s.date >= today); save(); render(); showToast('すべて削除しました'); }

// --- Admin Mode ---
function renderAdminSchedules() {
    el.adminScheduleList.innerHTML = ''; const today = getToday();
    const activeSchedules = state.schedules.filter(s => s.date === '' || s.date >= today).sort((a, b) => {
        if (a.date === '' && b.date === '') return 0; if (a.date === '') return 1; if (b.date === '') return -1;
        return a.date.localeCompare(b.date);
    });
    activeSchedules.forEach((day) => {
        const item = document.createElement('div'); item.className = 'admin-schedule-item';
        let sHtml = day.sessions.map((s) => `
            <div class="admin-session-edit">
                <div class="admin-form-grid">
                    <div><label>時間</label><div class="time-range"><select class="time-select" onchange="updateSessionById('${day.id}', '${s.id}', 'start', this.value)">${TIME_OPTIONS.map(t => `<option value="${t}" ${s.start === t ? 'selected' : ''}>${t || '（未設定）'}</option>`).join('')}</select><span>〜</span><select class="time-select" onchange="updateSessionById('${day.id}', '${s.id}', 'end', this.value)">${TIME_OPTIONS.map(t => `<option value="${t}" ${s.end === t ? 'selected' : ''}>${t || '（未設定）'}</option>`).join('')}</select></div></div>
                    <div><label>メニュー種別</label><input type="text" list="menu-type-options" value="${s.menu || ''}" placeholder="内容を入力" onchange="updateSessionById('${day.id}', '${s.id}', 'menu', this.value)"></div>
                </div>
                <button class="btn-discreet" onclick="removeSessionById('${day.id}', '${s.id}')" style="width: 100%; text-align: right;">練習枠を削除</button>
            </div>
        `).join('');
        item.innerHTML = `<div class="admin-day-title"><div class="admin-form-row" style="margin-bottom:0"><div><label>日付</label><input type="date" value="${day.date}" onchange="updateDayById('${day.id}', 'date', this.value)"></div><div><label>場所</label><input type="text" list="location-options" value="${day.location}" placeholder="場所を入力" onchange="updateDayById('${day.id}', 'location', this.value)" style="font-weight:bold"></div></div></div><div style="padding: 1rem;">${sHtml}<div class="admin-actions" style="display: flex; justify-content: space-between; margin-top: 0.5rem;"><button class="btn btn-sm btn-secondary" onclick="addSessionById('${day.id}')">＋ 練習枠を追加</button><button class="btn-discreet" onclick="removeDayById('${day.id}')">日程ごと削除</button></div></div>`;
        el.adminScheduleList.appendChild(item);
    });
}

function renderOptionLists() {
    const renderList = (list, key) => list.map((o, idx) => `
        <div class="option-item"><span>${o}</span><button class="icon-btn" onclick="removeOption('${key}', ${idx})">🗑️</button></div>
    `).join('');
    el.locList.innerHTML = renderList(state.locations, 'locations'); el.menuList.innerHTML = renderList(state.menuTypes, 'menuTypes');
}

// --- Operations ---
function toggleAttendance(sid, status) { if (!state.currentMemberId) return; const key = `${sid}_${state.currentMemberId}`; state.attendance[key] = (state.attendance[key] === status) ? null : status; save(); render(); showToast('✅ 保存しました'); }

function switchTab(tab, force = false) {
    if (!force && state.tabPermissions[tab] && !state.isAdmin) {
        const pw = prompt('管理者用パスワードを入力してください');
        if (pw === ADMIN_PASSWORD_HASH) {
            state.isAdmin = true;
            sessionStorage.setItem('fermata_admin', 'true');
        } else {
            if (pw !== null) alert('パスワードが違います');
            return;
        }
    }
    el.tabUser.classList.toggle('active', tab === 'user'); el.tabSummary.classList.toggle('active', tab === 'summary'); el.tabAdmin.classList.toggle('active', tab === 'admin'); el.tabPast.classList.toggle('active', tab === 'past');
    el.userModeContent.classList.toggle('hidden', tab !== 'user'); el.summaryModeContent.classList.toggle('hidden', tab !== 'summary'); el.adminModeContent.classList.toggle('hidden', tab !== 'admin'); el.pastModeContent.classList.toggle('hidden', tab !== 'past');
}

function updateDayById(id, key, val) { const d = state.schedules.find(s => s.id === id); if (d) d[key] = val; save(); render(); }
function updateSessionById(did, sid, key, val) { const d = state.schedules.find(s => s.id === did); if (d) { const s = d.sessions.find(x => x.id === sid); if (s) s[key] = val; } save(); render(); }
function addSessionById(did) { 
    const d = state.schedules.find(s => s.id === did); 
    if (d) {
        let start = '09:00'; let end = '10:00';
        if (d.sessions.length > 0) {
            const lastS = d.sessions[d.sessions.length - 1];
            if (lastS.end) { start = lastS.end; const idx = TIME_OPTIONS.indexOf(start); if (idx !== -1 && idx + 4 < TIME_OPTIONS.length) end = TIME_OPTIONS[idx + 4]; else end = start; }
        }
        d.sessions.push({ id: generateId(), start, end, menu: '' }); 
    }
    save(); render(); 
}
function removeSessionById(did, sid) { const d = state.schedules.find(s => s.id === did); if (d) d.sessions = d.sessions.filter(x => x.id !== sid); save(); render(); }
function addOption(key) { const input = key === 'locations' ? el.newLocInput : el.newMenuInput; const val = input.value.trim(); if (!val) return; state[key].push(val); input.value = ''; save(); render(); }
function removeOption(key, idx) { state[key].splice(idx, 1); save(); render(); }

// --- Event Listeners ---
function setupEventListeners() {
    el.siteLoginBtn.onclick = () => {
        if (el.sitePasswordInput.value === SITE_PASSWORD_HASH) {
            state.isLoggedIn = true; sessionStorage.setItem('fermata_auth', 'true'); showApp();
        } else { el.loginError.classList.remove('hidden'); }
    };
    el.logoutBtn.onclick = () => { sessionStorage.removeItem('fermata_auth'); sessionStorage.removeItem('fermata_admin'); location.reload(); };
    el.tabUser.onclick = () => switchTab('user'); el.tabSummary.onclick = () => switchTab('summary'); el.tabAdmin.onclick = () => switchTab('admin'); el.tabPast.onclick = () => switchTab('past');
    el.addMemberBtn.onclick = () => { const name = el.memberNameInput.value.trim(); if (!name) return; const newM = { id: generateId(), name }; state.members.push(newM); state.currentMemberId = newM.id; el.memberNameInput.value = ''; save(); render(); showToast('登録しました'); };
    document.getElementById('add-new-day-btn').onclick = () => { state.schedules.push({ id: generateId(), date: '', location: '', sessions: [{ id: generateId(), start: '09:00', end: '10:00', menu: '' }] }); save(); render(); };
    el.addLocBtn.onclick = () => addOption('locations'); el.addMenuBtn.onclick = () => addOption('menuTypes'); el.deleteAllPastBtn.onclick = deleteAllPast;
    document.getElementById('delete-member-btn').onclick = () => { if (confirm('削除しますか？')) { state.members = state.members.filter(m => m.id !== state.currentMemberId); state.currentMemberId = null; save(); render(); } };
    document.getElementById('edit-member-btn').onclick = () => { const m = state.members.find(m => m.id === state.currentMemberId); if (!m) return; const newN = prompt('名前を変更', m.name); if (newN) { m.name = newN; save(); render(); } };
}

window.toggleAttendance = toggleAttendance;
window.selectMonth = selectMonth;
window.removeDayById = removeDayById;
window.updateDayById = updateDayById;
window.updateSessionById = updateSessionById;
window.addSessionById = addSessionById;
window.removeSessionById = removeSessionById;
window.removeOption = removeOption;
window.saveNote = saveNote;
window.togglePermission = togglePermission;

init();
