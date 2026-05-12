/**
 * Musical Attendance App Logic (v23) - Rollback to Shared Password
 */

// --- Supabase Configuration ---
const SUPABASE_URL = "https://grjjywivjczcjhjnmvsc.supabase.co";
const SUPABASE_KEY = "sb_publishable_wUsRl8qXkBgNCVPwvBp5Og_yr-htHPt"; 

const sb = (typeof supabase !== 'undefined' && SUPABASE_KEY !== "YOUR_SUPABASE_ANON_KEY") 
    ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY) 
    : null;

// --- Constants ---
const PASS_GENERAL = "kuma";
const PASS_ADMIN = "9203";

// --- State ---
let state = {
    isLoggedIn: sessionStorage.getItem('fermata_logged_in') === 'true',
    isAdmin: sessionStorage.getItem('fermata_is_admin') === 'true',
    currentMemberName: localStorage.getItem('fermata_v23_member_name') || null,
    schedules: [],
    attendance: [], // [{ session_id, name, status, note }]
    members: [],    // [{ id, name }]
    locations: [],
    menuTypes: [],
    tabPermissions: { user: false, summary: false, admin: true, past: true }, // admin/past only for Admin
    selectedMonth: new Date().toISOString().substring(0, 7)
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
    selectedMemberName: document.getElementById('selected-member-name'),
    currentSelectionMsg: document.getElementById('current-selection-msg'),
    attendanceSection: document.getElementById('attendance-section'),
    monthSelector: document.getElementById('month-selector'),
    practiceSchedule: document.getElementById('practice-schedule'),
    summaryView: document.getElementById('summary-view'),
    pastScheduleList: document.getElementById('past-schedule-list'),
    adminScheduleList: document.getElementById('admin-schedule-list'),
    tabPermissionControls: document.getElementById('tab-permission-controls'),
    toast: document.getElementById('toast'),
    locDatalist: document.getElementById('location-options'),
    menuDatalist: document.getElementById('menu-type-options')
};

// --- Initialization ---
async function init() {
    if (state.isLoggedIn) {
        showApp();
    } else {
        el.loginScreen.classList.remove('hidden');
    }
    setupEventListeners();
}

async function showApp() {
    el.loginScreen.classList.add('hidden');
    el.mainApp.classList.remove('hidden');
    await fetchData();
    render();
    switchTab('user');
}

async function fetchData() {
    if (!sb) return;
    // 1. Schedules & Sessions
    const { data: sch } = await sb.from('schedules').select('*, sessions(*)').order('date');
    if (sch) state.schedules = sch;

    // 2. Attendance
    const { data: att } = await sb.from('attendance').select('*');
    if (att) state.attendance = att;

    // 3. Members
    const { data: mem } = await sb.from('members').select('*').order('name');
    if (mem) state.members = mem;
}

// --- Render Functions ---
function render() {
    renderTabs();
    renderMembers();
    renderSelection();
    renderMonthSelector();
    renderSchedules();
    renderSummary();
    renderAdminSchedules();
    renderPastSchedules();
}

function renderTabs() {
    const tabs = [{id:'user', n:'出欠入力'}, {id:'summary', n:'全体の参加状況'}, {id:'admin', n:'管理画面'}, {id:'past', n:'過去の出欠管理'}];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-${t.id}`);
        // 管理者のみロックアイコンを表示（または非表示にする）
        const isLocked = state.tabPermissions[t.id] && !state.isAdmin;
        btn.innerHTML = `${isLocked ? '🔒' : ''}${t.n}`;
    });
}

function renderMembers() {
    el.memberList.innerHTML = '';
    // 全員の名前を表示（プライバシー制限解除）
    state.members.forEach(m => {
        const chip = document.createElement('div');
        chip.className = `member-chip ${state.currentMemberName === m.name ? 'active' : ''}`;
        chip.textContent = m.name;
        chip.onclick = () => {
            state.currentMemberName = (state.currentMemberName === m.name) ? null : m.name;
            localStorage.setItem('fermata_v23_member_name', state.currentMemberName || '');
            render();
        };
        el.memberList.appendChild(chip);
    });
}

function renderSelection() {
    if (state.currentMemberName) {
        el.selectedMemberName.textContent = state.currentMemberName;
        el.currentSelectionMsg.classList.remove('hidden');
        el.attendanceSection.classList.remove('hidden');
    } else {
        el.currentSelectionMsg.classList.add('hidden');
        el.attendanceSection.classList.add('hidden');
    }
}

function renderMonthSelector() {
    const months = [...new Set(state.schedules.map(s => s.date.substring(0, 7)))].filter(m => m !== "").sort();
    const curMonth = new Date().toISOString().substring(0, 7);
    if (!months.includes(curMonth)) months.push(curMonth);
    el.monthSelector.innerHTML = months.map(m => `
        <button class="month-btn ${state.selectedMonth === m ? 'active' : ''}" onclick="selectMonth('${m}')">${m.split('-')[0]}年${m.split('-')[1]}月</button>
    `).join('');
}

function selectMonth(m) { state.selectedMonth = m; renderSchedules(); renderMonthSelector(); }

function renderSchedules() {
    el.practiceSchedule.innerHTML = '';
    const filtered = state.schedules.filter(s => s.date.startsWith(state.selectedMonth));
    if (filtered.length === 0) { el.practiceSchedule.innerHTML = '<p class="text-center text-muted">予定はありません</p>'; return; }

    filtered.forEach(day => {
        const dayEl = document.createElement('div'); dayEl.className = 'day-card';
        let sHtml = day.sessions.map(s => {
            const att = state.attendance.find(a => a.session_id === s.id && a.name === state.currentMemberName) || { status: null, note: '' };
            return `
                <div class="session-item">
                    <div class="session-info"><span class="session-time">${s.start_time || ''}〜${s.end_time || ''}</span><span class="session-title">${s.menu || '稽古'}</span></div>
                    <div class="attendance-controls">
                        <button class="attendance-btn present ${att.status === 'present' ? 'active' : ''}" onclick="saveAttendance('${s.id}', 'present')">出席</button>
                        <button class="attendance-btn absent ${att.status === 'absent' ? 'active' : ''}" onclick="saveAttendance('${s.id}', 'absent')">欠席</button>
                    </div>
                    <div class="session-note-box"><input type="text" class="session-note-input" placeholder="備考があれば入力" value="${att.note || ''}" onchange="saveNote('${s.id}', this.value)"></div>
                </div>`;
        }).join('');
        dayEl.innerHTML = `<div class="day-header"><div class="day-date">${day.date}</div><div class="day-location">${day.location}</div></div><div class="sessions-list">${sHtml}</div>`;
        el.practiceSchedule.appendChild(dayEl);
    });
}

function renderSummary() {
    let html = '';
    state.schedules.filter(d => d.date >= getToday()).forEach(day => {
        let dayHtml = `<div class="summary-day-group"><div class="summary-day-header"><span class="summary-day-date">${day.date}</span><span class="summary-day-location">${day.location}</span></div>`;
        let hasAtt = false;
        day.sessions.forEach(s => {
            const atts = state.attendance.filter(a => a.session_id === s.id && a.status === 'present');
            if (atts.length === 0) return;
            hasAtt = true;
            const names = atts.map(a => `<span class="participant-name">${a.name}</span>${a.note ? `<span class="participant-note"> (${a.note})</span>` : ''}`).join('、');
            dayHtml += `<div class="summary-session"><div style="font-weight:600;">${s.start_time || ''} ${s.menu || ''}</div><div class="summary-participants">出席：${names}</div></div>`;
        });
        if (hasAtt) html += dayHtml + '</div>';
    });
    el.summaryView.innerHTML = html || '<p class="text-center text-muted">直近の予定はありません</p>';
}

function renderAdminSchedules() {
    if (!state.isAdmin) return;
    el.adminScheduleList.innerHTML = '';
    state.schedules.filter(d => d.date >= getToday()).forEach(day => {
        const div = document.createElement('div');
        div.className = 'admin-schedule-item';
        div.innerHTML = `<div class="admin-day-title"><strong>${day.date}</strong> ${day.location}</div><div style="padding:1rem;">${day.sessions.length}個の練習枠</div>`;
        el.adminScheduleList.appendChild(div);
    });
}

function renderPastSchedules() {
    if (!state.isAdmin) return;
    el.pastScheduleList.innerHTML = '<p class="text-center text-muted">過去の記録は管理機能にて確認可能です</p>';
}

// --- Interaction Handlers ---
async function saveAttendance(sid, status) {
    if (!sb || !state.currentMemberName) return;
    const current = state.attendance.find(a => a.session_id === sid && a.name === state.currentMemberName);
    const newStatus = (current && current.status === status) ? null : status;
    if (current) {
        await sb.from('attendance').update({ status: newStatus }).eq('id', current.id);
    } else {
        await sb.from('attendance').insert({ session_id: sid, name: state.currentMemberName, status: newStatus });
    }
    await fetchData(); render(); showToast('保存しました');
}

async function saveNote(sid, note) {
    if (!sb || !state.currentMemberName) return;
    const current = state.attendance.find(a => a.session_id === sid && a.name === state.currentMemberName);
    if (current) {
        await sb.from('attendance').update({ note }).eq('id', current.id);
    } else {
        await sb.from('attendance').insert({ session_id: sid, name: state.currentMemberName, note });
    }
    await fetchData();
}

// --- Auth Handlers ---
function handleLogin() {
    const pass = el.sitePasswordInput.value;
    if (pass === PASS_ADMIN) {
        state.isLoggedIn = true; state.isAdmin = true;
        sessionStorage.setItem('fermata_logged_in', 'true');
        sessionStorage.setItem('fermata_is_admin', 'true');
        showApp();
    } else if (pass === PASS_GENERAL) {
        state.isLoggedIn = true; state.isAdmin = false;
        sessionStorage.setItem('fermata_logged_in', 'true');
        sessionStorage.setItem('fermata_is_admin', 'false');
        showApp();
    } else {
        el.loginError.classList.remove('hidden');
    }
}

function setupEventListeners() {
    el.siteLoginBtn.onclick = handleLogin;
    el.logoutBtn.onclick = () => { sessionStorage.clear(); location.reload(); };
    el.addMemberBtn.onclick = async () => {
        const name = el.memberNameInput.value.trim();
        if (!name || !sb) return;
        const exists = state.members.find(m => m.name === name);
        if (!exists) {
            await sb.from('members').insert({ name });
            await fetchData();
        }
        state.currentMemberName = name;
        localStorage.setItem('fermata_v23_member_name', name);
        el.memberNameInput.value = '';
        render();
        showToast('選択しました');
    };
    el.tabUser.onclick = () => switchTab('user');
    el.tabSummary.onclick = () => switchTab('summary');
    el.tabAdmin.onclick = () => switchTab('admin');
    el.tabPast.onclick = () => switchTab('past');
}

function switchTab(tab) {
    if (state.tabPermissions[tab] && !state.isAdmin) {
        alert('管理者用パスワードでログインが必要です');
        return;
    }
    el.tabUser.classList.toggle('active', tab === 'user'); el.tabSummary.classList.toggle('active', tab === 'summary');
    el.tabAdmin.classList.toggle('active', tab === 'admin'); el.tabPast.classList.toggle('active', tab === 'past');
    el.userModeContent.classList.toggle('hidden', tab !== 'user'); el.summaryModeContent.classList.toggle('hidden', tab !== 'summary');
    el.adminModeContent.classList.toggle('hidden', tab !== 'admin'); el.pastModeContent.classList.toggle('hidden', tab !== 'past');
}

function getToday() { return new Date().toISOString().split('T')[0]; }
function showToast(msg) { el.toast.textContent = msg; el.toast.classList.remove('hidden'); setTimeout(()=>el.toast.classList.add('hidden'), 2000); }

init();
