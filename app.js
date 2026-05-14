// --- 接続設定 ---
const SUPABASE_URL = 'https://cwepoklweabvpmyfizto.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_3M_jMfBkVJdZNVypnV51ig_oYsn6-0n';

let db; 

const CONFIG = {
    COMMON_PW: 'kuma',
    ADMIN_PW: '9203',
    STORAGE_KEY: 'fermata_v6_sync'
};

let state = {
    auth: { isLoggedIn: false, type: null },
    members: [],
    currentMember: '',
    rehearsals: [], 
    attendance: {}, 
    settings: {
        locations: ['段原公民館', '祇園公民館', '宇品公民館', '青崎公民館', '中央公民館', '己斐公民館', '公民館', '八本松地域センター'],
        menus: ['ワークショップダンス基礎', 'ワークショップダンス', 'ワークショップミュージカル', 'ワークショップ', '美女野獣　稽古', '美女野獣　合唱練習'],
        visibility: {
            'attendance-input': 'public',
            'overall-status': 'public',
            'admin-panel': 'protected',
            'past-records': 'protected'
        }
    },
    ui: {
        currentMonth: '',
        statusMonth: '',
        pastMonth: '',
        editingId: null,
        adminViewList: []
    }
};

// --- ユーティリティ ---
const $ = (id) => document.getElementById(id);
const getMonthStr = (date) => date ? date.substring(0, 7) : "";
const getToday = () => new Date().setHours(0,0,0,0);
const getTodayStr = () => new Date().toISOString().split('T')[0];

function validateInput(el, value) {
    if (!el) return true;
    if (!value || value.trim() === '') {
        el.classList.add('error');
        return false;
    } else {
        el.classList.remove('error');
        return true;
    }
}

// --- クラウド同期ロジック (Supabase版) ---

async function loadCloud() {
    if (!db) return;
    try {
        $('sync-indicator').classList.remove('hidden');
        
        const { data: members, error: mErr } = await db.from('members').select('*').order('name');
        if (mErr) throw mErr;

        const { data: practices, error: pErr } = await db.from('practices').select('*').order('date');
        if (pErr) throw pErr;

        const { data: attendance, error: aErr } = await db.from('attendance').select('*');
        if (aErr) throw aErr;

        if (members.length === 0 && practices.length === 0) {
            await migrateToSupabase();
            return loadCloud();
        }

        state.members = members;
        const groups = {};
        practices.forEach(p => {
            const key = `${p.date}_${p.place}`;
            if (!groups[key]) {
                groups[key] = { date: p.date, location: p.place, slots: [] };
            }
            groups[key].slots.push({ id: p.id, start: p.start_time, end: p.end_time, menu: p.menu });
        });
        state.rehearsals = Object.values(groups);

        state.attendance = {};
        attendance.forEach(a => {
            if (!state.attendance[a.member_id]) state.attendance[a.member_id] = {};
            state.attendance[a.member_id][a.practice_id] = { status: a.status, note: a.note };
        });

        if (state.auth.isLoggedIn) { 
            refreshAdminViewList();
            renderTab(document.querySelector('.nav-tab.active')?.dataset.tab || 'attendance-input'); 
        }
    } catch (error) {
        console.error("Supabase読み込みエラー:", error);
    } finally {
        $('sync-indicator').classList.add('hidden');
    }
}

async function migrateToSupabase() {
    if (!db) return;
    const localSaved = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (!localSaved) return;
    const oldState = JSON.parse(localSaved);
    for (const name of oldState.members) { await db.from('members').insert({ name }); }
    for (const r of oldState.rehearsals) {
        for (const s of r.slots) {
            await db.from('practices').insert({
                date: r.date, place: r.location, start_time: s.start, end_time: s.end, menu: s.menu
            });
        }
    }
}

function saveLocal() {
    const json = JSON.stringify(state);
    localStorage.setItem(CONFIG.STORAGE_KEY, json);
}

// --- 認証 ---

function initAuth() {
    const localSaved = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (localSaved) {
        const parsed = JSON.parse(localSaved);
        state.auth = parsed.auth || state.auth;
        state.currentMember = parsed.currentMember || '';
    }

    const loginBtn = $('login-btn');
    if (loginBtn) {
        loginBtn.onclick = () => {
            const pw = ($('password-input').value || '').trim();
            if (pw === CONFIG.ADMIN_PW) { state.auth = { isLoggedIn: true, type: 'admin' }; }
            else if (pw === CONFIG.COMMON_PW) { state.auth = { isLoggedIn: true, type: 'common' }; }
            else { $('login-error').classList.remove('hidden'); return; }
            saveLocal(); location.reload();
        };
    }

    const logoutBtn = $('logout-btn');
    if (logoutBtn) {
        logoutBtn.onclick = () => {
            if (confirm('ログアウトしますか？')) {
                state.auth = { isLoggedIn: false, type: null };
                saveLocal(); location.reload();
            }
        };
    }

    if (state.auth.isLoggedIn) {
        $('login-overlay').classList.add('hidden');
        $('app').classList.remove('hidden');
        updateLockIcons();
        loadCloud(); 
    } else {
        $('login-overlay').classList.remove('hidden');
        $('app').classList.add('hidden');
    }
}

// --- アプリロジック ---

function updateLockIcons() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        const id = tab.dataset.tab;
        const icon = tab.querySelector('.lock-icon');
        if (state.settings.visibility[id] === 'protected') icon?.classList.remove('hidden');
        else icon?.classList.add('hidden');
    });
}

function initTabs() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.onclick = () => {
            const id = tab.dataset.tab;
            if (state.settings.visibility[id] === 'protected' && state.auth.type !== 'admin') {
                alert('このタブは管理者のみ閲覧可能です。');
                return;
            }
            sortScheduleByDate(); refreshAdminViewList();
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active'); $(id).classList.add('active');
            renderTab(id);
        };
    });
    document.querySelectorAll('.menu-tab').forEach(tab => {
        tab.onclick = () => {
            sortScheduleByDate(); refreshAdminViewList();
            document.querySelectorAll('.menu-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.sub-tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active'); $(tab.dataset.menu).classList.add('active');
            renderTab('admin-panel');
        };
    });

    const addBtn = $('add-rehearsal-btn');
    if (addBtn) {
        addBtn.onclick = async () => {
            const { error } = await db.from('practices').insert({
                date: getTodayStr(), place: '段原公民館', start_time: '09:00', end_time: '12:00', menu: ''
            });
            if (error) alert(error.message);
            else await loadCloud();
        };
    }
}

function refreshAdminViewList() {
    state.ui.adminViewList = state.rehearsals.filter(r => !r.date || new Date(r.date) >= getToday());
}

function sortScheduleByDate() {
    state.rehearsals.sort((a,b) => { if (!a.date) return 1; if (!b.date) return -1; return a.date.localeCompare(b.date); });
}

function renderTab(id) {
    if (id === 'attendance-input') renderAttendanceInput();
    if (id === 'overall-status') renderOverallStatus();
    if (id === 'admin-panel') renderAdminPanel();
    if (id === 'past-records') renderPastRecords();
}

function renderAttendanceInput() {
    const select = $('member-select');
    if (!select) return;
    select.innerHTML = '<option value="">メンバーを選択</option>';
    state.members.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id; opt.textContent = m.name;
        if (m.id === state.currentMember) opt.selected = true;
        select.appendChild(opt);
    });
    select.onchange = (e) => { state.currentMember = e.target.value; saveLocal(); renderAttendanceInput(); };

    const actionContainer = $('member-action-container');
    if (actionContainer) {
        actionContainer.innerHTML = `
            <button id="show-add-member-btn" class="action-btn-styled add"><i class="fa-solid fa-plus"></i> 追加</button>
            <button id="edit-current-member-btn" class="action-btn-styled edit ${!state.currentMember ? 'hidden' : ''}"><i class="fa-solid fa-user-pen"></i> 編集</button>
            <button id="delete-current-member-btn" class="action-btn-styled delete ${!state.currentMember ? 'hidden' : ''}"><i class="fa-solid fa-trash-can"></i> 削除</button>
        `;
        $('show-add-member-btn').onclick = () => { $('add-member-form').classList.toggle('hidden'); };
        $('cancel-member-btn').onclick = () => { $('add-member-form').classList.add('hidden'); };
        $('confirm-member-btn').onclick = async () => {
            const name = $('new-member-name').value.trim();
            if (name) {
                const { data, error } = await db.from('members').insert({ name }).select().single();
                if (error) alert(error.message);
                else { state.currentMember = data.id; saveLocal(); await loadCloud(); }
            }
        };
        if (state.currentMember) {
            $('edit-current-member-btn').onclick = () => startEditCurrentMember();
            $('delete-current-member-btn').onclick = () => deleteCurrentMember();
        }
    }
    renderAttendanceList();
}

async function startEditCurrentMember() {
    const member = state.members.find(m => m.id === state.currentMember);
    const newName = prompt('氏名を編集:', member.name);
    if (newName && newName.trim() !== member.name) {
        await db.from('members').update({ name: newName.trim() }).eq('id', state.currentMember);
        await loadCloud();
    }
}
async function deleteCurrentMember() {
    const member = state.members.find(m => m.id === state.currentMember);
    if (confirm(`${member.name}さんを削除しますか？`)) {
        await db.from('members').delete().eq('id', state.currentMember);
        state.currentMember = ''; saveLocal(); await loadCloud();
    }
}

function renderMonthTabs(months, currentMonth, containerTopId, containerBottomId, callback) {
    const top = $(containerTopId), bottom = $(containerBottomId);
    if (!top || !bottom) return;
    top.innerHTML = ''; bottom.innerHTML = '';
    months.forEach(m => {
        const btnTop = document.createElement('button');
        btnTop.className = `month-btn ${m === currentMonth ? 'active' : ''}`;
        btnTop.textContent = m.replace('-', '/');
        btnTop.onclick = () => { callback(m); };
        top.appendChild(btnTop);
        const btnBottom = document.createElement('button');
        btnBottom.className = `month-btn ${m === currentMonth ? 'active' : ''}`;
        btnBottom.textContent = m.replace('-', '/');
        btnBottom.onclick = () => { callback(m); };
        bottom.appendChild(btnBottom);
    });
}

function renderAttendanceList() {
    const container = $('attendance-list-container');
    if (!container) return;
    container.innerHTML = '';
    if (!state.currentMember) { 
        container.innerHTML = '<p class="admin-hint">メンバーを選択してください</p>'; 
        $('month-tab-bar').innerHTML = ''; $('month-tab-bar-bottom').innerHTML = ''; return; 
    }
    const future = state.rehearsals.filter(r => r.date && new Date(r.date) >= getToday());
    const months = [...new Set(future.map(r => getMonthStr(r.date)))].sort();
    if (months.length === 0) { $('month-tab-bar').innerHTML = ''; $('month-tab-bar-bottom').innerHTML = ''; return; }
    if (!state.ui.currentMonth || !months.includes(state.ui.currentMonth)) { state.ui.currentMonth = months[0]; }
    renderMonthTabs(months, state.ui.currentMonth, 'month-tab-bar', 'month-tab-bar-bottom', (m) => { state.ui.currentMonth = m; renderAttendanceList(); });
    
    future.filter(r => getMonthStr(r.date) === state.ui.currentMonth).forEach(r => {
        const card = document.createElement('div'); card.className = 'card';
        let slotsHtml = '';
        r.slots.forEach(s => {
            const data = state.attendance[state.currentMember]?.[s.id] || {status: null, note: ''};
            const statusStr = data.status === 'attend' ? '出席' : (data.status === 'absent' ? '欠席' : null);
            slotsHtml += `<div class="slot-row" style="margin-bottom:15px; border-bottom:1px dashed #DDD; padding-bottom:15px;">
                    <div style="font-size:0.9rem; margin-bottom:8px;"><strong>${s.start}〜${s.end}</strong> [${s.menu}]</div>
                    <div class="attendance-toggle">
                        <button class="toggle-btn present ${statusStr==='出席'?'active':''}" onclick="setAttend('${s.id}','attend')">出席</button>
                        <button class="toggle-btn absent ${statusStr==='欠席'?'active':''}" onclick="setAttend('${s.id}','absent')">欠席</button>
                    </div>
                    <input type="text" class="cute-input note-area" placeholder="備考があれば" value="${data.note || ''}" onchange="setNote('${s.id}',this.value)">
                </div>`;
        });
        card.innerHTML = `<div class="section-header"><h2><i class="fa-solid fa-calendar-day"></i> ${r.date}　${r.location}</h2></div>${slotsHtml}`;
        container.appendChild(card);
    });
}

window.setAttend = async (practiceId, status) => {
    if (!state.currentMember || !db) return;
    const cur = state.attendance[state.currentMember]?.[practiceId] || {status:null, note:''};
    const newStatus = cur.status === status ? null : status;
    const { error } = await db.from('attendance').upsert({
        member_id: state.currentMember, 
        practice_id: practiceId, 
        status: newStatus,
        note: cur.note, // 既存の備考を確実に送る
        updated_at: new Date().toISOString()
    }, { onConflict: 'member_id, practice_id' }); // 重複キーエラー回避
    
    if (error) alert(error.message);
    else await loadCloud();
};

window.setNote = async (practiceId, note) => {
    if (!state.currentMember || !db) return;
    const cur = state.attendance[state.currentMember]?.[practiceId] || {status:null, note:''};
    const { error } = await db.from('attendance').upsert({
        member_id: state.currentMember, 
        practice_id: practiceId, 
        status: cur.status, // 既存の出欠を確実に送る
        note: note,
        updated_at: new Date().toISOString()
    }, { onConflict: 'member_id, practice_id' }); // 重複キーエラー回避
    
    if (error) alert(error.message);
    else await loadCloud();
};

function renderAdminPanel() {
    const activeSub = document.querySelector('.menu-tab.active')?.dataset.menu || 'rehearsal-edit';
    if (activeSub === 'rehearsal-edit') renderAdminRehearsals();
    if (activeSub === 'dropdown-edit') renderAdminDropdowns();
    if (activeSub === 'tab-visibility') renderAdminVisibility();
}

function renderAdminRehearsals() {
    const list = $('admin-rehearsal-list');
    if (!list) return;
    list.innerHTML = '';
    
    // 日付ごとにグループ化して表示
    state.rehearsals.forEach(r => {
        const card = document.createElement('div'); 
        card.className = 'admin-card-inner';
        
        // 日付・場所エリア（グループ全体）
        let html = `
            <div class="admin-line">
                <input type="date" class="cute-input date-input-fixed" value="${r.date}" onchange="updateGroupPractices('${r.date}', '${r.location}', 'date', this.value)">
                ${renderAdminGroupDropdown(r.date, r.location, 'location', r.location)}
            </div>
            <div id="slots-container-${r.date}-${r.location}">
        `;
        
        // 各時間枠（スロット）を表示
        r.slots.forEach(s => {
            html += `
                <div class="menu-row">
                    <select class="cute-input time-sel" onchange="updatePractice('${s.id}','start_time',this.value)">${getTimeOpts(s.start)}</select>
                    <span>〜</span>
                    <select class="cute-input time-sel" onchange="updatePractice('${s.id}','end_time',this.value)">${getTimeOpts(s.end)}</select>
                    ${renderAdminDropdownSelect(s.id, 'menu', s.menu)}
                    <button class="del-icon-btn" onclick="delPractice('${s.id}')"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            `;
        });
        
        html += `
            </div>
            <button class="action-btn-styled add" style="margin-top:15px; width:100%;" onclick="addTimeSlot('${r.date}', '${r.location}')">
                <i class="fa-solid fa-plus"></i> 時間枠を追加（同日の別メニュー）
            </button>
        `;
        
        card.innerHTML = html;
        list.appendChild(card);
    });
}

window.addTimeSlot = async (date, place) => {
    const { error } = await db.from('practices').insert({
        date, place, start_time: '09:00', end_time: '12:00', menu: ''
    });
    if (error) alert(error.message);
    else await loadCloud();
};

async function updateGroupPractices(oldDate, oldPlace, key, newVal) {
    if (!db) return;
    // 同じグループ（日・場所）の全レコードを更新
    const { error } = await db.from('practices')
        .update({ [key]: newVal })
        .eq('date', oldDate)
        .eq('place', oldPlace);
        
    if (error) alert(error.message);
    else await loadCloud();
}

function renderAdminGroupDropdown(date, place, type, currentVal) {
    const listKey = 'locations';
    const items = state.settings[listKey];
    const isOther = currentVal && !items.includes(currentVal);
    let opts = `<option value="">選択してください</option>`;
    items.forEach(item => { opts += `<option value="${item}" ${item === currentVal ? 'selected' : ''}>${item}</option>`; });
    opts += `<option value="other" ${isOther ? 'selected' : ''}>その他 (手入力)</option>`;
    
    return `
        <div class="dropdown-toggle-container" style="flex:1;">
            <select class="cute-input flex-fill-input ${isOther ? 'hidden' : ''}" onchange="handleGroupDropdownChange('${date}', '${place}', this)">
                ${opts}
            </select>
            <input type="text" class="cute-input flex-fill-input ${isOther ? '' : 'hidden'}" 
                   value="${isOther ? currentVal : ''}" placeholder="自由入力" 
                   onchange="updateGroupPractices('${date}', '${place}', 'place', this.value)">
        </div>
    `;
}

window.handleGroupDropdownChange = async (date, place, sel) => {
    const val = sel.value;
    const input = sel.nextElementSibling;
    if (val === 'other') {
        sel.classList.add('hidden');
        input.classList.remove('hidden');
        input.focus();
    } else {
        await updateGroupPractices(date, place, 'place', val);
    }
};

function renderAdminDropdownSelect(practiceId, type, currentVal) {
    const listKey = 'menus';
    const items = state.settings[listKey];
    const isOther = currentVal && !items.includes(currentVal);
    let opts = `<option value="">選択してください</option>`;
    items.forEach(item => { opts += `<option value="${item}" ${item === currentVal ? 'selected' : ''}>${item}</option>`; });
    opts += `<option value="other" ${isOther ? 'selected' : ''}>その他 (手入力)</option>`;
    
    return `
        <div class="dropdown-toggle-container" style="flex:1;">
            <select class="cute-input flex-fill-input ${isOther ? 'hidden' : ''}" onchange="handleAdminDropdownChange('${practiceId}', '${type}', this)">
                ${opts}
            </select>
            <input type="text" class="cute-input flex-fill-input ${isOther ? '' : 'hidden'}" 
                   value="${isOther ? currentVal : ''}" placeholder="自由入力" 
                   onchange="updatePractice('${practiceId}', 'menu', this.value)">
        </div>
    `;
}

window.handleAdminDropdownChange = async (practiceId, type, sel) => {
    const val = sel.value;
    const input = sel.nextElementSibling;
    if (val === 'other') {
        sel.classList.add('hidden');
        input.classList.remove('hidden');
        input.focus();
    } else {
        await updatePractice(practiceId, type === 'location' ? 'place' : 'menu', val);
    }
};

window.updatePractice = async (id, k, v) => {
    if (!db) return;
    const { error } = await db.from('practices').update({ [k]: v }).eq('id', id);
    if (error) alert(error.message);
    else await loadCloud();
};

window.delPractice = async (id) => {
    if(!db) return;
    if(confirm('削除しますか？')) {
        const { error } = await db.from('practices').delete().eq('id', id);
        if (error) alert(error.message);
        else await loadCloud();
    }
};

function getTimeOpts(s) {
    let h = `<option value="" ${s===''?'selected':''}>選択..</option>`;
    for(let i=8; i<=22; i++) {
        ['00','15','30','45'].forEach(m => {
            const t = `${i.toString().padStart(2,'0')}:${m}`;
            h += `<option value="${t}" ${t===s?'selected':''}>${t}</option>`;
        });
    }
    return h;
}

function renderOverallStatus() {
    const container = $('overall-status-container');
    if (!container) return;
    container.innerHTML = '';
    const future = state.rehearsals.filter(r => r.date && new Date(r.date) >= getToday());
    const months = [...new Set(future.map(r => getMonthStr(r.date)))].sort();
    if (months.length === 0) { $('status-month-tab-bar').innerHTML = ''; $('status-month-tab-bar-bottom').innerHTML = ''; return; }
    if (!state.ui.statusMonth || !months.includes(state.ui.statusMonth)) state.ui.statusMonth = months[0];
    renderMonthTabs(months, state.ui.statusMonth, 'status-month-tab-bar', 'status-month-tab-bar-bottom', (m) => { state.ui.statusMonth = m; renderOverallStatus(); });
    future.filter(r => getMonthStr(r.date) === state.ui.statusMonth).forEach(r => {
        const card = document.createElement('div'); card.className = 'card';
        let h = `<div class="section-header"><h2><i class="fa-solid fa-star"></i> ${r.date}　${r.location}</h2></div>`;
        r.slots.forEach(s => {
            const present = [], absent = [], notesOnly = [];
            state.members.forEach(m => {
                const att = state.attendance[m.id]?.[s.id];
                const displayName = `${m.name}${att?.note ? '(' + att.note + ')' : ''}`;
                if (att?.status === 'attend') present.push(displayName);
                else if (att?.status === 'absent') absent.push(displayName);
                else if (att?.note) notesOnly.push(displayName);
            });
            h += `<div class="slot-row" style="margin-bottom:20px; border-bottom:1px dashed #DDD; padding-bottom:15px;">
                    <div style="font-size:0.9rem; margin-bottom:12px; color:var(--pink-dark);"><strong>${s.start}〜${s.end}</strong> [${s.menu}]</div>
                    <div class="status-group"><div class="absent-title">【出席者】</div><div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:12px;">${present.map(n => `<span class="status-tag present">${n}</span>`).join('') || '<span style="color:#CCC; font-size:0.75rem;">なし</span>'}</div></div>
                    <div class="status-group"><div class="absent-title">【欠席者】</div><div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:12px;">${absent.map(n => `<span class="status-tag absent">${n}</span>`).join('') || '<span style="color:#CCC; font-size:0.75rem;">なし</span>'}</div></div>
                    <div class="status-group"><div class="absent-title">【備考のみ】</div><div style="display:flex; flex-wrap:wrap; gap:5px;">${notesOnly.map(n => `<span class="status-tag note-only">${n}</span>`).join('') || '<span style="color:#CCC; font-size:0.75rem;">なし</span>'}</div></div>
                </div>`;
        });
        card.innerHTML = h; container.appendChild(card);
    });
}

function renderAdminDropdowns() {
    renderList('locations', 'admin-location-list', 'new-location-input', 'add-location-btn');
    renderList('menus', 'admin-menu-list', 'new-menu-input', 'add-menu-btn');
}

function renderList(key, listId, inputId, btnId) {
    const list = $(listId); if (!list) return;
    list.innerHTML = '';
    state.settings[key].forEach((item, i) => {
        const li = document.createElement('li'); li.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:10px 15px; background:white; border:1px solid #E5E7EB; border-radius:12px; margin-bottom:8px; font-size:0.9rem;";
        li.innerHTML = `<span>${item}</span><div style="display:flex; gap:5px; align-items:center;"><button class="icon-btn-sm" style="width:30px; height:30px; font-size:0.7rem;" onclick="moveItem('${key}', ${i}, -1)" ${i===0?'disabled style="opacity:0.3"':''}><i class="fa-solid fa-chevron-up"></i></button><button class="icon-btn-sm" style="width:30px; height:30px; font-size:0.7rem;" onclick="moveItem('${key}', ${i}, 1)" ${i===state.settings[key].length-1?'disabled style="opacity:0.3"':''}><i class="fa-solid fa-chevron-down"></i></button><button class="icon-btn-sm" style="width:30px; height:30px; font-size:0.7rem;" onclick="editItem('${key}', ${i})"><i class="fa-solid fa-pen"></i></button><button class="del-icon-btn" style="margin-left:8px;" onclick="delItem('${key}', ${i})"><i class="fa-solid fa-xmark"></i></button></div>`;
        list.appendChild(li);
    });
    const addBtn = $(btnId);
    if (addBtn) {
        addBtn.onclick = () => {
            const v = $(inputId).value.trim();
            if(v) {
                state.settings[key].push(v);
                $(inputId).value = '';
                saveLocal();
                renderAdminDropdowns();
            }
        };
    }
}

window.editItem = (key, i) => { const oldVal = state.settings[key][i]; const newVal = prompt('項目を編集:', oldVal); if (newVal !== null && newVal.trim() !== '' && newVal !== oldVal) { state.settings[key][i] = newVal.trim(); saveLocal(); renderAdminDropdowns(); } };
window.moveItem = (key, i, dir) => { const arr = state.settings[key]; const target = i + dir; if (target < 0 || target >= arr.length) return; [arr[i], arr[target]] = [arr[target], arr[i]]; saveLocal(); renderAdminDropdowns(); };
window.delItem = (key, i) => { state.settings[key].splice(i, 1); saveLocal(); renderAdminDropdowns(); };

function renderAdminVisibility() {
    const container = $('visibility-controls-container'); if (!container) return;
    container.innerHTML = '';
    const tabs = [{ id: 'attendance-input', label: '出欠入力' }, { id: 'overall-status', label: '参加状況' }, { id: 'past-records', label: '過去' }, { id: 'admin-panel', label: '管理' }];
    tabs.forEach(tab => {
        const cur = state.settings.visibility[tab.id];
        container.innerHTML += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;"><span style="font-size:0.9rem;">${tab.label}</span><select class="cute-input" style="width:100px; margin:0;" onchange="updateVis('${tab.id}', this.value)"><option value="public" ${cur==='public'?'selected':''}>公開</option><option value="protected" ${cur==='protected'?'selected':''}>制限中</option></select></div>`;
    });
}
window.updateVis = (id, val) => { state.settings.visibility[id] = val; saveLocal(); updateLockIcons(); };

function renderPastRecords() {
    const container = $('past-records-container'); if (!container) return;
    container.innerHTML = '';
    const pastAll = state.rehearsals.filter(r => r.date && new Date(r.date) < getToday());
    if (pastAll.length === 0) { container.innerHTML = '<p class="admin-hint">過去の稽古日程はありません</p>'; $('past-month-tab-bar').innerHTML = ''; $('past-month-tab-bar-bottom').innerHTML = ''; return; }
    const months = [...new Set(pastAll.map(r => getMonthStr(r.date)))].sort((a,b) => b.localeCompare(a));
    if (!state.ui.pastMonth || !months.includes(state.ui.pastMonth)) state.ui.pastMonth = months[0];
    renderMonthTabs(months, state.ui.pastMonth, 'past-month-tab-bar', 'past-month-tab-bar-bottom', (m) => { state.ui.pastMonth = m; renderPastRecords(); });
    const past = pastAll.filter(r => getMonthStr(r.date) === state.ui.pastMonth).sort((a,b) => b.date.localeCompare(a.date));
    past.forEach(r => {
        const card = document.createElement('div'); card.className = 'card';
        let slotsH = '';
        r.slots.forEach(s => {
            const pres = [], absWithNotes = [];
            state.members.forEach(m => {
                const att = state.attendance[m.id]?.[s.id];
                if (att?.status === 'attend') pres.push({name: m.name, id: m.id, note:att.note});
                else if (att?.status === 'absent' && att.note) absWithNotes.push({ name: m.name, id: m.id, note: att.note });
            });
            slotsH += `<div class="slot-row" style="margin-bottom:15px; border-bottom:1px dashed #EEE; padding-bottom:10px;"><div class="admin-line" style="margin-bottom:8px; font-size:0.85rem;"><strong>${s.start}〜${s.end}</strong> ${s.menu}</div><div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:8px;">${pres.map(p => `<span class="pills-edit">${p.name}${p.note?'('+p.note+')':''}</span>`).join('') || '<span style="color:#CCC; font-size:0.7rem;">出席者なし</span>'}</div>`;
            if (absWithNotes.length > 0) { slotsH += `<div class="absent-section">${absWithNotes.map(a => `<div class="absent-row"><span class="absent-name">${a.name}</span><span class="absent-note">${a.note}</span></div>`).join('')}</div>`; }
            slotsH += `</div>`;
        });
        card.innerHTML = `<div class="section-header"><h2><i class="fa-solid fa-calendar-day"></i> ${r.date}　${r.location}</h2></div>` + slotsH;
        container.appendChild(card);
    });
}

// --- 起動時の初期化 ---
window.onload = () => {
    if (window.supabase) {
        const { createClient } = window.supabase;
        db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    initAuth(); 
    initTabs(); 
};
