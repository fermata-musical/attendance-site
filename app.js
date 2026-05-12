/**
 * Musical Attendance App Logic (v22) - Full Supabase Integration
 */

// --- Supabase Configuration ---
const SUPABASE_URL = "https://grjjywivjczcjhjnmvsc.supabase.co/rest/v1/";
const SUPABASE_KEY = "sb_publishable_wUsRl8qXkBgNCVPwvBp5Og_yr-htHPt";

const supabaseClient = (typeof supabase !== 'undefined' && SUPABASE_URL !== "YOUR_SUPABASE_URL") 
    ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY) 
    : null;

// --- Constants & Security ---
const SITE_PASSWORD_HASH = "kuma"; 
const ADMIN_PASSWORD_HASH = "9203"; 

// --- State ---
let state = {
    user: null, 
    isSiteAuthenticated: sessionStorage.getItem('fermata_site_auth') === 'true',
    schedules: [],
    attendance: {}, 
    allAttendance: [], 
    allMembers: [],
    tabPermissions: { user: false, summary: true, admin: true, past: true },
    selectedMonth: new Date().toISOString().substring(0, 7)
};

// --- DOM Elements ---
const el = {
    loginScreen: document.getElementById('login-screen'),
    mainApp: document.getElementById('main-app'),
    siteAuthArea: document.getElementById('site-auth-area'),
    memberAuthArea: document.getElementById('member-auth-area'),
    memberLoginForm: document.getElementById('member-login-form'),
    memberRegisterForm: document.getElementById('member-register-form'),
    loginMemberSelect: document.getElementById('login-member-select'),
    sitePasswordInput: document.getElementById('site-password-input'),
    siteLoginBtn: document.getElementById('site-login-btn'),
    memberLoginBtn: document.getElementById('member-login-btn'),
    memberPasscode: document.getElementById('member-passcode-input'),
    regNameInput: document.getElementById('reg-name-input'),
    regPasscodeInput: document.getElementById('reg-passcode-input'),
    memberRegisterBtn: document.getElementById('member-register-btn'),
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
    selectedMemberName: document.getElementById('selected-member-name'),
    attendanceSection: document.getElementById('attendance-section'),
    monthSelector: document.getElementById('month-selector'),
    practiceSchedule: document.getElementById('practice-schedule'),
    summaryView: document.getElementById('summary-view'),
    pastScheduleList: document.getElementById('past-schedule-list'),
    adminScheduleList: document.getElementById('admin-schedule-list'),
    tabPermissionControls: document.getElementById('tab-permission-controls'),
    toast: document.getElementById('toast')
};

// --- Initialization ---
async function init() {
    if (!supabaseClient) {
        console.warn("Supabase is not initialized. Please set URL and Key.");
    }
    const savedUser = sessionStorage.getItem('fermata_user');
    if (state.isSiteAuthenticated && savedUser) {
        state.user = JSON.parse(savedUser);
        showApp();
    } else {
        showLogin();
    }
    setupEventListeners();
}

// --- Auth UI ---
function showLogin() {
    el.loginScreen.classList.remove('hidden');
    el.mainApp.classList.add('hidden');
    if (state.isSiteAuthenticated) {
        el.siteAuthArea.classList.add('hidden');
        el.memberAuthArea.classList.remove('hidden');
        loadMemberList();
    } else {
        el.siteAuthArea.classList.remove('hidden');
        el.memberAuthArea.classList.add('hidden');
    }
}

async function loadMemberList() {
    if (!supabaseClient) return;
    const { data } = await supabaseClient.from('members').select('id, name').order('name');
    if (data) {
        state.allMembers = data;
        el.loginMemberSelect.innerHTML = data.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
    }
}

async function showApp() {
    el.loginScreen.classList.add('hidden');
    el.mainApp.classList.remove('hidden');
    el.selectedMemberName.textContent = state.user.name;
    await fetchData();
    render();
    switchTab('user');
}

// --- Data Fetching ---
async function fetchData() {
    if (!supabaseClient) return;
    const { data: schData } = await supabaseClient.from('schedules').select('*, sessions(*)').order('date');
    if (schData) state.schedules = schData;

    const { data: myAtt } = await supabaseClient.from('attendance').select('*').eq('member_id', state.user.id);
    if (myAtt) {
        state.attendance = {};
        myAtt.forEach(a => state.attendance[a.session_id] = a);
    }

    if (state.user.is_admin) {
        const { data: allAtt } = await supabaseClient.from('attendance').select('*, members(name)');
        state.allAttendance = allAtt || [];
    }
}

// --- Render Core ---
function render() {
    renderTabs();
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
        const isLocked = state.tabPermissions[t.id];
        btn.innerHTML = `${isLocked ? '🔒' : ''}${t.n}`;
    });
}

function renderMonthSelector() {
    const months = [...new Set(state.schedules.map(s => s.date.substring(0, 7)))].sort();
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
            const att = state.attendance[s.id] || { status: null, note: '' };
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
    if (!state.user.is_admin) {
        el.summaryView.innerHTML = '<p class="text-center text-muted">管理者のみ閲覧可能です</p>';
        return;
    }
    let html = '';
    state.schedules.filter(d => d.date >= getToday()).forEach(day => {
        let dayHtml = `<div class="summary-day-group"><div class="summary-day-header"><span class="summary-day-date">${day.date}</span><span class="summary-day-location">${day.location}</span></div>`;
        let hasAtt = false;
        day.sessions.forEach(s => {
            const atts = state.allAttendance.filter(a => a.session_id === s.id && a.status === 'present');
            if (atts.length === 0) return;
            hasAtt = true;
            const names = atts.map(a => `<span class="participant-name">${a.members.name}</span>${a.note ? `<span class="participant-note"> (${a.note})</span>` : ''}`).join('、');
            dayHtml += `<div class="summary-session"><div>${s.start_time} ${s.menu}</div><div class="summary-participants">出席：${names}</div></div>`;
        });
        if (hasAtt) html += dayHtml + '</div>';
    });
    el.summaryView.innerHTML = html || '<p class="text-center text-muted">直近の予定はありません</p>';
}

// --- Admin Handlers ---
async function renderAdminSchedules() {
    if (!state.user.is_admin) return;
    el.adminScheduleList.innerHTML = '';
    state.schedules.filter(d => d.date >= getToday()).forEach(day => {
        const div = document.createElement('div');
        div.className = 'admin-schedule-item';
        div.innerHTML = `<div class="admin-day-title"><strong>${day.date}</strong> ${day.location}</div><div style="padding:1rem;">${day.sessions.length}個の枠</div>`;
        el.adminScheduleList.appendChild(div);
    });
}

function renderPastSchedules() {
    if (!state.user.is_admin) return;
    el.pastScheduleList.innerHTML = '<p class="text-center text-muted">過去の記録は管理画面から確認できます</p>';
}

// --- Interaction Handlers ---
async function saveAttendance(sid, status) {
    if (!supabaseClient) return;
    const current = state.attendance[sid];
    const newStatus = (current && current.status === status) ? null : status;
    if (current) {
        await supabaseClient.from('attendance').update({ status: newStatus }).eq('id', current.id);
    } else {
        await supabaseClient.from('attendance').insert({ session_id: sid, member_id: state.user.id, status: newStatus });
    }
    await fetchData(); render(); showToast('保存しました');
}

async function saveNote(sid, note) {
    if (!supabaseClient) return;
    const current = state.attendance[sid];
    if (current) {
        await supabaseClient.from('attendance').update({ note }).eq('id', current.id);
    } else {
        await supabaseClient.from('attendance').insert({ session_id: sid, member_id: state.user.id, note });
    }
    await fetchData();
}

// --- Auth Handlers ---
async function hashPasscode(pw) {
    const msgUint8 = new TextEncoder().encode(pw);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function handleSiteLogin() {
    if (el.sitePasswordInput.value === SITE_PASSWORD_HASH) {
        state.isSiteAuthenticated = true; sessionStorage.setItem('fermata_site_auth', 'true');
        showLogin();
    } else { el.loginError.classList.remove('hidden'); }
}

async function handleMemberLogin() {
    if (!supabaseClient) return;
    const mid = el.loginMemberSelect.value;
    const pw = el.memberPasscode.value;
    const hash = await hashPasscode(pw);
    const { data, error } = await supabaseClient.from('members').select('*').eq('id', mid).eq('passcode_hash', hash).single();
    if (data) { state.user = data; sessionStorage.setItem('fermata_user', JSON.stringify(data)); showApp(); }
    else { alert("パスコードが違います"); }
}

async function handleMemberRegister() {
    if (!supabaseClient) return;
    const name = el.regNameInput.value.trim();
    const pw = el.regPasscodeInput.value;
    if (!name || pw.length < 4) { alert("正しい情報を入力してください"); return; }
    const hash = await hashPasscode(pw);
    const { data, error } = await supabaseClient.from('members').insert({ name, passcode_hash: hash }).select().single();
    if (error) { alert("登録エラーです。別の名前を試してください。"); }
    else { state.user = data; sessionStorage.setItem('fermata_user', JSON.stringify(data)); showApp(); }
}

function setupEventListeners() {
    el.siteLoginBtn.onclick = handleSiteLogin;
    el.memberLoginBtn.onclick = handleMemberLogin;
    el.memberRegisterBtn.onclick = handleMemberRegister;
    el.logoutBtn.onclick = () => { sessionStorage.clear(); location.reload(); };
    
    document.getElementById('show-register-btn').onclick = () => { el.memberLoginForm.classList.add('hidden'); el.memberRegisterForm.classList.remove('hidden'); };
    document.getElementById('show-login-btn').onclick = () => { el.memberLoginForm.classList.remove('hidden'); el.memberRegisterForm.classList.add('hidden'); };
    
    el.tabUser.onclick = () => switchTab('user');
    el.tabSummary.onclick = () => switchTab('summary');
    el.tabAdmin.onclick = () => switchTab('admin');
    el.tabPast.onclick = () => switchTab('past');
}

function switchTab(tab) {
    if (state.tabPermissions[tab] && !state.user.is_admin) {
        const pw = prompt('管理者パスワードを入力してください');
        if (pw !== ADMIN_PASSWORD_HASH) return;
    }
    el.tabUser.classList.toggle('active', tab === 'user'); el.tabSummary.classList.toggle('active', tab === 'summary');
    el.tabAdmin.classList.toggle('active', tab === 'admin'); el.tabPast.classList.toggle('active', tab === 'past');
    el.userModeContent.classList.toggle('hidden', tab !== 'user'); el.summaryModeContent.classList.toggle('hidden', tab !== 'summary');
    el.adminModeContent.classList.toggle('hidden', tab !== 'admin'); el.pastModeContent.classList.toggle('hidden', tab !== 'past');
}

function getToday() { return new Date().toISOString().split('T')[0]; }
function showToast(msg) { el.toast.textContent = msg; el.toast.classList.remove('hidden'); setTimeout(()=>el.toast.classList.add('hidden'), 2000); }

init();
