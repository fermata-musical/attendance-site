/**
 * Musical Attendance App Logic (v26) - Final Admin Fixes & UI Polish
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

// 15分刻みの時間リスト生成 (8:00 - 22:00)
const TIME_OPTIONS = (() => {
    const opts = [];
    for (let h = 8; h <= 22; h++) {
        for (let m = 0; m < 60; m += 15) {
            const time = `${h}:${m.toString().padStart(2, '0')}`;
            opts.push(time);
            if (h === 22) break; // 22:00で終了
        }
    }
    return opts;
})();

// --- State ---
let state = {
    isLoggedIn: sessionStorage.getItem('fermata_logged_in') === 'true',
    isAdmin: sessionStorage.getItem('fermata_is_admin') === 'true',
    currentMemberName: localStorage.getItem('fermata_v26_member_name') || null,
    schedules: [],
    attendance: [],
    members: [],
    locations: [],
    menuTypes: [],
    tabPermissions: { user: false, summary: false, admin: true, past: true },
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
    locList: document.getElementById('loc-list'),
    menuList: document.getElementById('menu-list'),
    newLocInput: document.getElementById('new-loc-input'),
    newMenuInput: document.getElementById('new-menu-input'),
    addLocBtn: document.getElementById('add-loc-btn'),
    addMenuBtn: document.getElementById('add-menu-btn'),
    locDatalist: document.getElementById('location-options'),
    menuDatalist: document.getElementById('menu-type-options'),
    tabPermissionControls: document.getElementById('tab-permission-controls'),
    toast: document.getElementById('toast')
};

// --- Initialization ---
async function init() {
    if (state.isLoggedIn) { showApp(); } else { el.loginScreen.classList.remove('hidden'); }
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
    console.log("Fetching everything...");
    
    const [schRes, attRes, memRes, locRes, mnuRes, stgRes] = await Promise.all([
        sb.from('schedules').select('*, sessions(*)').order('date'),
        sb.from('attendance').select('*'),
        sb.from('members').select('*').order('name'),
        sb.from('locations').select('*').order('sort_order'),
        sb.from('menu_types').select('*').order('sort_order'),
        sb.from('settings').select('*').eq('key', 'tab_permissions').single()
    ]);

    if (schRes.data) state.schedules = schRes.data;
    if (attRes.data) state.attendance = attRes.data;
    if (memRes.data) state.members = memRes.data;
    if (locRes.data) state.locations = locRes.data;
    if (mnuRes.data) state.menuTypes = mnuRes.data;
    if (stgRes.data) state.tabPermissions = stgRes.data.value;
}

// --- Render ---
function render() {
    renderTabs();
    renderMembers();
    renderSelection();
    renderMonthSelector();
    renderSchedules();
    renderSummary();
    renderAdminSchedules();
    renderPastSchedules();
    renderOptionLists();
    renderPermissionControls();
    renderDatalists();
}

function renderTabs() {
    const tabs = [{id:'user', n:'出欠入力'}, {id:'summary', n:'全体の参加状況'}, {id:'admin', n:'管理画面'}, {id:'past', n:'過去の出欠管理'}];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-${t.id}`);
        const isLocked = state.tabPermissions[t.id] && !state.isAdmin;
        btn.innerHTML = `${isLocked ? '🔒' : ''}${t.n}`;
    });
}

function renderDatalists() {
    el.locDatalist.innerHTML = state.locations.map(o => `<option value="${o.name}"></option>`).join('');
    el.menuDatalist.innerHTML = state.menuTypes.map(o => `<option value="${o.name}"></option>`).join('');
}

function renderMembers() {
    el.memberList.innerHTML = '';
    state.members.forEach(m => {
        const chip = document.createElement('div');
        chip.className = `member-chip ${state.currentMemberName === m.name ? 'active' : ''}`;
        chip.textContent = m.name;
        chip.onclick = () => {
            state.currentMemberName = (state.currentMemberName === m.name) ? null : m.name;
            localStorage.setItem('fermata_v26_member_name', state.currentMemberName || '');
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
    const today = getToday();
    const filtered = state.schedules.filter(s => s.date.startsWith(state.selectedMonth) && s.date >= today).sort((a,b)=>a.date.localeCompare(b.date));
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
    const today = getToday();
    state.schedules.filter(d => d.date >= today).sort((a,b)=>a.date.localeCompare(b.date)).forEach(day => {
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

// --- Admin Render ---
function renderAdminSchedules() {
    if (!state.isAdmin) return;
    el.adminScheduleList.innerHTML = '';
    const today = getToday();
    state.schedules.filter(d => d.date >= today).sort((a,b)=>a.date.localeCompare(b.date)).forEach(day => {
        const item = document.createElement('div'); item.className = 'admin-schedule-item';
        const timeOptionsHtml = TIME_OPTIONS.map(t => `<option value="${t}">${t}</option>`).join('');
        
        let sHtml = day.sessions.map(s => `
            <div class="admin-session-edit">
                <div class="admin-session-header">
                    <span style="font-weight:bold; font-size:0.9rem; color:var(--primary-dark);">練習枠</span>
                    <button class="btn-danger-text" onclick="deleteSession('${day.id}', '${s.id}')">枠を削除</button>
                </div>
                <div class="admin-form-grid">
                    <div><label>開始</label><select onchange="updateSession('${day.id}', '${s.id}', 'start_time', this.value)"><option value="">選択</option>${TIME_OPTIONS.map(t => `<option value="${t}" ${s.start_time === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
                    <div><label>終了</label><select onchange="updateSession('${day.id}', '${s.id}', 'end_time', this.value)"><option value="">選択</option>${TIME_OPTIONS.map(t => `<option value="${t}" ${s.end_time === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
                    <div><label>メニュー</label><input type="text" list="menu-type-options" value="${s.menu || ''}" onchange="updateSession('${day.id}', '${s.id}', 'menu', this.value)"></div>
                </div>
            </div>
        `).join('');
        
        item.innerHTML = `
            <div class="admin-day-title">
                <div class="admin-form-row">
                    <div><label>日付</label><input type="date" value="${day.date}" onchange="updateDay('${day.id}', 'date', this.value)"></div>
                    <div><label>場所</label><input type="text" list="location-options" value="${day.location}" onchange="updateDay('${day.id}', 'location', this.value)"></div>
                </div>
            </div>
            <div style="padding:1rem;">
                ${sHtml}
                <div class="admin-actions">
                    <button class="btn btn-sm btn-secondary" onclick="addSession('${day.id}')">＋ 練習枠を追加</button>
                    <button class="btn-danger-text" onclick="deleteDay('${day.id}')">日程ごと削除</button>
                </div>
            </div>`;
        el.adminScheduleList.appendChild(item);
    });
}

function renderPastSchedules() {
    if (!state.isAdmin) return;
    el.pastScheduleList.innerHTML = '';
    const today = getToday();
    state.schedules.filter(d => d.date < today).sort((a,b)=>b.date.localeCompare(a.date)).forEach(day => {
        const div = document.createElement('div'); div.className = 'admin-schedule-item';
        div.innerHTML = `<div class="admin-day-title"><strong>${day.date}</strong> ${day.location}</div><div class="admin-actions"><div></div><button class="btn-danger-text" onclick="deleteDay('${day.id}')">削除</button></div>`;
        el.pastScheduleList.appendChild(div);
    });
}

function renderOptionLists() {
    if (!state.isAdmin) return;
    const renderList = (list, key) => list.map((o, idx) => `
        <div class="option-item">
            <div style="display:flex; align-items:center; gap:8px;">
                <button class="icon-btn" onclick="moveOption('${key}', '${o.id}', ${idx}, -1)">▲</button>
                <button class="icon-btn" onclick="moveOption('${key}', '${o.id}', ${idx}, 1)">▼</button>
                <span>${o.name}</span>
            </div>
            <button class="icon-btn" onclick="deleteOption('${key}', '${o.id}')">🗑️</button>
        </div>`).join('');
    el.locList.innerHTML = renderList(state.locations, 'locations');
    el.menuList.innerHTML = renderList(state.menuTypes, 'menu_types');
}

function renderPermissionControls() {
    if (!state.isAdmin) return;
    const tabs = [{id:'user', n:'出欠入力'}, {id:'summary', n:'全体の参加状況'}, {id:'admin', n:'管理画面'}, {id:'past', n:'過去の出欠管理'}];
    el.tabPermissionControls.innerHTML = tabs.map(t => `
        <div class="option-item">
            <span>${t.n}</span>
            <label class="switch-container">
                <input type="checkbox" ${state.tabPermissions[t.id] ? 'checked' : ''} onchange="togglePermission('${t.id}', this.checked)">
                <span style="font-size:0.8rem;">${state.tabPermissions[t.id] ? '🔒 保護中' : '🔓 公開'}</span>
            </label>
        </div>`).join('');
}

// --- Admin Actions ---
async function addDay() {
    if (!sb) return;
    const { error } = await sb.from('schedules').insert({ date: getToday(), location: '' });
    if (error) alert("追加に失敗しました。SQLが正しく実行されているか確認してください。");
    else { await fetchData(); render(); showToast("日程を追加しました"); }
}

async function updateDay(id, key, val) {
    await sb.from('schedules').update({ [key]: val }).eq('id', id);
    await fetchData(); render();
}

async function deleteDay(id) {
    if (!confirm("日程全体を削除しますか？")) return;
    await sb.from('schedules').delete().eq('id', id);
    await fetchData(); render();
}

async function addSession(schId) {
    await sb.from('sessions').insert({ schedule_id: schId, start_time: '09:00', end_time: '10:00', menu: '' });
    await fetchData(); render();
}

async function updateSession(schId, sid, key, val) {
    await sb.from('sessions').update({ [key]: val }).eq('id', sid);
    await fetchData(); render();
}

async function deleteSession(schId, sid) {
    if (!confirm("この練習枠を削除しますか？")) return;
    await sb.from('sessions').delete().eq('id', sid);
    await fetchData(); render();
}

async function addOption(key) {
    const input = key === 'locations' ? el.newLocInput : el.newMenuInput;
    const name = input.value.trim();
    if (!name || !sb) return;
    const { error } = await sb.from(key).insert({ name, sort_order: state[key === 'locations' ? 'locations' : 'menuTypes'].length + 1 });
    if (error) { console.error(error); alert("追加できませんでした。SQL Editorでテーブルが作成されているか確認してください。"); }
    else { input.value = ''; await fetchData(); render(); showToast("追加しました"); }
}

async function deleteOption(key, id) {
    await sb.from(key).delete().eq('id', id);
    await fetchData(); render();
}

async function moveOption(key, id, idx, dir) {
    const list = key === 'locations' ? state.locations : state.menuTypes;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= list.length) return;
    // Simple swap
    const other = list[newIdx];
    await sb.from(key).update({ sort_order: other.sort_order }).eq('id', id);
    await sb.from(key).update({ sort_order: list[idx].sort_order }).eq('id', other.id);
    await fetchData(); render();
}

async function togglePermission(tabId, val) {
    state.tabPermissions[tabId] = val;
    const { error } = await sb.from('settings').upsert({ key: 'tab_permissions', value: state.tabPermissions }, { onConflict: 'key' });
    if (error) console.error(error);
    await fetchData(); render();
}

// --- User Actions ---
async function saveAttendance(sid, status) {
    if (!state.currentMemberName) { alert("最初にお名前を入力してください"); return; }
    const current = state.attendance.find(a => a.session_id === sid && a.name === state.currentMemberName);
    const newStatus = (current && current.status === status) ? null : status;
    if (current) await sb.from('attendance').update({ status: newStatus }).eq('id', current.id);
    else await sb.from('attendance').insert({ session_id: sid, name: state.currentMemberName, status: newStatus });
    await fetchData(); render(); showToast("✅ 保存しました");
}

async function saveNote(sid, note) {
    if (!state.currentMemberName) return;
    const current = state.attendance.find(a => a.session_id === sid && a.name === state.currentMemberName);
    if (current) await sb.from('attendance').update({ note }).eq('id', current.id);
    else await sb.from('attendance').insert({ session_id: sid, name: state.currentMemberName, note });
    await fetchData();
}

// --- Auth ---
function handleLogin() {
    const pass = el.sitePasswordInput.value;
    if (pass === PASS_ADMIN || pass === PASS_GENERAL) {
        state.isLoggedIn = true; state.isAdmin = (pass === PASS_ADMIN);
        sessionStorage.setItem('fermata_logged_in', 'true');
        sessionStorage.setItem('fermata_is_admin', state.isAdmin);
        showApp();
    } else { el.loginError.classList.remove('hidden'); }
}

function setupEventListeners() {
    el.siteLoginBtn.onclick = handleLogin;
    el.logoutBtn.onclick = () => { sessionStorage.clear(); location.reload(); };
    el.addMemberBtn.onclick = async () => {
        const name = el.memberNameInput.value.trim(); if (!name) return;
        if (!state.members.find(m => m.name === name)) { await sb.from('members').insert({ name }); await fetchData(); }
        state.currentMemberName = name; localStorage.setItem('fermata_v26_member_name', name);
        el.memberNameInput.value = ''; render();
    };
    document.getElementById('add-new-day-btn').onclick = addDay;
    el.addLocBtn.onclick = () => addOption('locations');
    el.addMenuBtn.onclick = () => addOption('menu_types');
    el.tabUser.onclick = () => switchTab('user');
    el.tabSummary.onclick = () => switchTab('summary');
    el.tabAdmin.onclick = () => switchTab('admin');
    el.tabPast.onclick = () => switchTab('past');
}

function switchTab(tab) {
    if (state.tabPermissions[tab] && !state.isAdmin) { alert('管理者用パスワードが必要です'); return; }
    ['user','summary','admin','past'].forEach(t => {
        const btn = document.getElementById(`tab-${t}`);
        const cnt = document.getElementById(`${t}-mode-content`);
        if (btn) btn.classList.toggle('active', t === tab);
        if (cnt) cnt.classList.toggle('hidden', t !== tab);
    });
}

function getToday() { return new Date().toISOString().split('T')[0]; }
function showToast(msg) { el.toast.textContent = msg; el.toast.classList.remove('hidden'); setTimeout(()=>el.toast.classList.add('hidden'), 2000); }

// Globalize for HTML
window.selectMonth = selectMonth;
window.saveAttendance = saveAttendance;
window.saveNote = saveNote;
window.updateDay = updateDay;
window.deleteDay = deleteDay;
window.addSession = addSession;
window.updateSession = updateSession;
window.deleteSession = deleteSession;
window.deleteOption = deleteOption;
window.moveOption = moveOption;
window.togglePermission = togglePermission;

init();
