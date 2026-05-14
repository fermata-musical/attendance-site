// ★【重要】ここにGoogle Apps Scriptで発行した「ウェブアプリ URL」を貼り付けてください
const SYNC_URL = 'https://script.google.com/macros/s/AKfycbzDhp0qsKCgZ3Inun4oaUZy0g_Ze7FIRndsnThYARpUTuInGDxAKZZWy5vsugJOBpui/exec'; 

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

let isInitialLoaded = false;
let saveTimeout = null;

// --- ユーティリティ ---
const $ = (id) => document.getElementById(id);
const generateId = () => Math.random().toString(36).substr(2, 9);
const getMonthStr = (date) => date ? date.substring(0, 7) : "";
const getToday = () => new Date().setHours(0,0,0,0);

// --- クラウド同期ロジック ---

async function loadCloud() {
    if (!SYNC_URL) return;
    const localAuth = { ...state.auth };
    try {
        const response = await fetch(SYNC_URL);
        if (response.ok) {
            const cloudData = await response.json();
            if (cloudData && Object.keys(cloudData).length > 0) {
                state = { ...state, ...cloudData };
                state.auth = localAuth; 
                if (state.auth.isLoggedIn) { renderTab('attendance-input'); }
            }
        }
    } catch (error) { console.error("クラウド同期エラー:", error); }
}

function save() {
    state.members.sort((a, b) => a.localeCompare(b, 'ja'));
    const json = JSON.stringify(state);
    localStorage.setItem(CONFIG.STORAGE_KEY, json);
    if (!SYNC_URL) return;
    if (saveTimeout) clearTimeout(saveTimeout);
    $('sync-indicator').classList.remove('hidden');
    saveTimeout = setTimeout(async () => {
        try {
            const syncData = { ...state };
            delete syncData.auth; 
            await fetch(SYNC_URL, { method: 'POST', body: JSON.stringify(syncData), mode: 'no-cors' });
        } catch (error) { console.error("クラウド保存エラー:", error); }
        finally { setTimeout(() => $('sync-indicator').classList.add('hidden'), 1000); }
    }, 1500);
}

// --- 認証初期化 ---

function initAuth() {
    const localSaved = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (localSaved) { state = { ...state, ...JSON.parse(localSaved) }; }

    $('login-btn').onclick = () => {
        const pw = ($('password-input').value || '').trim();
        if (pw === CONFIG.ADMIN_PW) { state.auth = { isLoggedIn: true, type: 'admin' }; }
        else if (pw === CONFIG.COMMON_PW) { state.auth = { isLoggedIn: true, type: 'common' }; }
        else { $('login-error').classList.remove('hidden'); return; }
        save(); location.reload();
    };

    $('logout-btn').onclick = () => {
        if (confirm('ログアウトしますか？')) {
            state.auth = { isLoggedIn: false, type: null };
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state));
            location.reload();
        }
    };

    if (state.auth.isLoggedIn) {
        $('login-overlay').classList.add('hidden');
        $('app').classList.remove('hidden');
        updateLockIcons();
        renderTab('attendance-input');
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
        if (state.settings.visibility[id] === 'protected') icon.classList.remove('hidden');
        else icon.classList.add('hidden');
    });
}

function initTabs() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.onclick = () => {
            const id = tab.dataset.tab;
            if (state.settings.visibility[id] === 'protected' && state.auth.type !== 'admin') { alert('管理者のみアクセス可能です。'); return; }
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

    // 管理画面：新しい稽古日を追加ボタンのイベント
    const addRehearsalBtn = $('add-rehearsal-btn');
    if (addRehearsalBtn) {
        addRehearsalBtn.onclick = () => {
            const newR = {
                id: generateId(),
                date: '',
                location: '',
                slots: [{ id: generateId(), start: '', end: '', menu: '' }]
            };
            state.rehearsals.push(newR);
            refreshAdminViewList();
            save();
            renderAdminRehearsals();
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
    state.members.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name; opt.textContent = name;
        if (name === state.currentMember) opt.selected = true;
        select.appendChild(opt);
    });
    select.onchange = (e) => { state.currentMember = e.target.value; save(); renderAttendanceInput(); };

    const actionContainer = $('member-action-container');
    actionContainer.innerHTML = `
        <button id="show-add-member-btn" class="action-btn-styled add"><i class="fa-solid fa-plus"></i> 追加</button>
        <button id="edit-current-member-btn" class="action-btn-styled edit ${!state.currentMember ? 'hidden' : ''}"><i class="fa-solid fa-user-pen"></i> 編集</button>
        <button id="delete-current-member-btn" class="action-btn-styled delete ${!state.currentMember ? 'hidden' : ''}"><i class="fa-solid fa-trash-can"></i> 削除</button>
    `;
    $('show-add-member-btn').onclick = () => { $('add-member-form').classList.toggle('hidden'); };
    $('cancel-member-btn').onclick = () => { $('add-member-form').classList.add('hidden'); };
    $('confirm-member-btn').onclick = () => {
        const name = $('new-member-name').value.trim();
        if (name && !state.members.includes(name)) {
            state.members.push(name); state.currentMember = name;
            $('new-member-name').value = ''; $('add-member-form').classList.add('hidden');
            save(); renderAttendanceInput();
        }
    };
    if (state.currentMember) {
        $('edit-current-member-btn').onclick = () => startEditCurrentMember();
        $('delete-current-member-btn').onclick = () => deleteCurrentMember();
    }
    renderAttendanceList();
}

function startEditCurrentMember() {
    const i = state.members.indexOf(state.currentMember);
    const newName = prompt('氏名を編集:', state.currentMember);
    if (newName && newName.trim() !== state.currentMember) {
        const oldName = state.currentMember;
        state.members[i] = newName.trim();
        state.currentMember = newName.trim();
        if (state.attendance[oldName]) { state.attendance[newName.trim()] = state.attendance[oldName]; delete state.attendance[oldName]; }
        save(); renderAttendanceInput();
    }
}
function deleteCurrentMember() {
    if (confirm(`${state.currentMember}さんを削除しますか？`)) {
        const i = state.members.indexOf(state.currentMember);
        const name = state.currentMember;
        state.members.splice(i, 1); delete state.attendance[name];
        state.currentMember = ''; save(); renderAttendanceInput();
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
    if (!state.currentMember) { container.innerHTML = '<p class="admin-hint">メンバーを選択してください</p>'; $('month-tab-bar').innerHTML = ''; $('month-tab-bar-bottom').innerHTML = ''; return; }
    const future = state.rehearsals.filter(r => r.date && new Date(r.date) >= getToday());
    const months = [...new Set(future.map(r => getMonthStr(r.date)))].sort();
    if (months.length === 0) { $('month-tab-bar').innerHTML = ''; $('month-tab-bar-bottom').innerHTML = ''; return; }
    if (!state.ui.currentMonth || !months.includes(state.ui.currentMonth)) { state.ui.currentMonth = months[0]; }
    renderMonthTabs(months, state.ui.currentMonth, 'month-tab-bar', 'month-tab-bar-bottom', (m) => { state.ui.currentMonth = m; renderAttendanceList(); });
    future.filter(r => getMonthStr(r.date) === state.ui.currentMonth).forEach(r => {
        const card = document.createElement('div'); card.className = 'card';
        let slotsHtml = '';
        r.slots.forEach(s => {
            const key = `${r.id}_${s.id}`;
            const data = state.attendance[state.currentMember]?.[key] || {status: null, note: ''};
            slotsHtml += `<div class="slot-row" style="margin-bottom:15px; border-bottom:1px dashed #DDD; padding-bottom:15px;">
                    <div style="font-size:0.9rem; margin-bottom:8px;"><strong>${s.start}〜${s.end}</strong> [${s.menu}]</div>
                    <div class="attendance-toggle">
                        <button class="toggle-btn present ${data.status==='出席'?'active':''}" onclick="setAttend('${r.id}','${s.id}','出席')">出席</button>
                        <button class="toggle-btn absent ${data.status==='欠席'?'active':''}" onclick="setAttend('${r.id}','${s.id}','欠席')">欠席</button>
                    </div>
                    <input type="text" class="cute-input note-area" placeholder="備考があれば" value="${data.note}" onchange="setNote('${r.id}','${s.id}',this.value)">
                </div>`;
        });
        card.innerHTML = `<div class="section-header"><h2><i class="fa-solid fa-calendar-day"></i> ${r.date}　${r.location}</h2></div>${slotsHtml}`;
        container.appendChild(card);
    });
}

window.setAnyAttend = (name, rid, sid, status) => {
    const key = `${rid}_${sid}`;
    if (!state.attendance[name]) state.attendance[name] = {};
    const cur = state.attendance[name][key] || {status:null, note:''};
    const newStatus = cur.status === status ? null : status;
    state.attendance[name][key] = { ...cur, status: newStatus };
    save();
};
window.setAnyNote = (name, rid, sid, note) => {
    const key = `${rid}_${sid}`;
    if (!state.attendance[name]) state.attendance[name] = {};
    const cur = state.attendance[name][key] || {status:null, note:''};
    state.attendance[name][key] = { ...cur, note };
    save();
};
window.setAttend = (rid, sid, status) => { setAnyAttend(state.currentMember, rid, sid, status); renderAttendanceList(); };
window.setNote = (rid, sid, note) => { setAnyNote(state.currentMember, rid, sid, note); };

function renderAdminPanel() {
    const activeSub = document.querySelector('.menu-tab.active').dataset.menu;
    if (activeSub === 'rehearsal-edit') renderAdminRehearsals();
    if (activeSub === 'dropdown-edit') renderAdminDropdowns();
    if (activeSub === 'tab-visibility') renderAdminVisibility();
}

function renderAdminRehearsals() {
    const list = $('admin-rehearsal-list');
    if (!list) return;
    list.innerHTML = '';
    state.ui.adminViewList.forEach(r => {
        const card = document.createElement('div'); card.className = 'admin-card-inner';
        let slotsH = '';
        r.slots.forEach(s => {
            slotsH += `<div class="admin-line slots">
                    <select class="cute-input time-sel" onchange="updateS('${r.id}','${s.id}','start',this.value)">${getTimeOpts(s.start)}</select>
                    <span>-</span>
                    <select class="cute-input time-sel" onchange="updateS('${r.id}','${s.id}','end',this.value)">${getTimeOpts(s.end)}</select>
                    ${renderAdminDropdownSelect(r.id, s.id, 'menu', s.menu)}
                    <button class="del-icon-btn" onclick="delS('${r.id}','${s.id}')"><i class="fa-solid fa-xmark"></i></button>
                </div>`;
        });
        card.innerHTML = `
            <div class="admin-line">
                <input type="date" class="cute-input date-input-fixed" value="${r.date}" onchange="updateR('${r.id}','date',this.value)">
                ${renderAdminDropdownSelect(r.id, null, 'location', r.location)}
                <button class="del-icon-btn" onclick="delR('${r.id}')"><i class="fa-solid fa-trash-can"></i></button>
            </div>
            ${slotsH}
            <div style="margin-top:10px;"><button class="puffy-btn gray puffy-btn-sm" style="width:100%" onclick="addS('${r.id}')"><i class="fa-solid fa-plus"></i> メニュー追加</button></div>
        `;
        list.appendChild(card);
    });
}

function renderAdminDropdownSelect(rid, sid, type, currentVal) {
    const listKey = type === 'location' ? 'locations' : 'menus';
    const items = state.settings[listKey];
    const isOther = currentVal && !items.includes(currentVal);
    
    let opts = `<option value="">選択してください</option>`;
    items.forEach(item => { opts += `<option value="${item}" ${item === currentVal ? 'selected' : ''}>${item}</option>`; });
    opts += `<option value="OTHER_VAL" ${isOther ? 'selected' : ''}>その他 (手入力)</option>`;

    // sidがnullの場合は'base'という文字列で扱う
    const sidKey = (sid === null || sid === undefined) ? 'base' : sid;
    const selectId = `sel-${rid}-${sidKey}-${type}`;
    const inputId = `inp-${rid}-${sidKey}-${type}`;

    return `
        <div class="dropdown-toggle-container">
            <select id="${selectId}" class="cute-input flex-fill-input ${isOther ? 'hidden' : ''}" onchange="handleAdminDropdownChange('${rid}', ${sid ? "'" + sid + "'" : 'null'}, '${type}', this.value)">
                ${opts}
            </select>
            <div id="${inputId}-wrapper" class="manual-input-wrapper ${isOther ? '' : 'hidden'}">
                <input id="${inputId}" type="text" class="cute-input flex-fill-input" value="${isOther ? currentVal : ''}" placeholder="自由入力" onchange="handleAdminOtherInputChange('${rid}', ${sid ? "'" + sid + "'" : 'null'}, '${type}', this.value)">
                <button class="icon-btn-sm" onclick="revertToDropdown('${rid}', ${sid ? "'" + sid + "'" : 'null'}, '${type}')" title="一覧に戻る"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>
    `;
}

window.handleAdminDropdownChange = (rid, sid, type, val) => {
    const sidKey = (sid === 'null' || !sid) ? 'base' : sid;
    const sel = $(`sel-${rid}-${sidKey}-${type}`);
    const wrapper = $(`inp-${rid}-${sidKey}-${type}-wrapper`);
    const input = $(`inp-${rid}-${sidKey}-${type}`);
    if (val === 'OTHER_VAL') { sel.classList.add('hidden'); wrapper.classList.remove('hidden'); input.focus(); }
    else { if (sid && sid !== 'null') updateS(rid, sid, type, val); else updateR(rid, type, val); }
};

window.revertToDropdown = (rid, sid, type) => {
    const sidKey = (sid === 'null' || !sid) ? 'base' : sid;
    const sel = $(`sel-${rid}-${sidKey}-${type}`);
    const wrapper = $(`inp-${rid}-${sidKey}-${type}-wrapper`);
    const input = $(`inp-${rid}-${sidKey}-${type}`);
    sel.value = ""; sel.classList.remove('hidden'); wrapper.classList.add('hidden'); input.value = "";
    if (sid && sid !== 'null') updateS(rid, sid, type, ""); else updateR(rid, type, "");
};

window.handleAdminOtherInputChange = (rid, sid, type, val) => {
    if (sid && sid !== 'null') updateS(rid, sid, type, val); else updateR(rid, type, val);
};

function getTimeOpts(s) {
    let h = `<option value="" ${s===''?'selected':''}>--</option>`;
    for(let i=8; i<=22; i++) {
        ['00','15','30','45'].forEach(m => {
            const t = `${i.toString().padStart(2,'0')}:${m}`;
            h += `<option value="${t}" ${t===s?'selected':''}>${t}</option>`;
        });
    }
    return h;
}
window.updateR = (id, k, v) => { state.rehearsals.find(x => x.id === id)[k] = v; save(); };
window.updateS = (rid, sid, k, v) => { state.rehearsals.find(x => x.id === rid).slots.find(y => y.id === sid)[k] = v; save(); };
window.delR = (id) => { if(confirm('削除しますか？')) { state.rehearsals = state.rehearsals.filter(x => x.id !== id); state.ui.adminViewList = state.ui.adminViewList.filter(x => x.id !== id); save(); renderAdminRehearsals(); } };
window.delS = (rid, sid) => { const r = state.rehearsals.find(x => x.id === rid); r.slots = r.slots.filter(y => y.id !== sid); save(); renderAdminRehearsals(); };

window.addS = (id) => {
    const r = state.rehearsals.find(x => x.id === id);
    const last = r.slots[r.slots.length - 1];
    r.slots.push({ id: generateId(), start: last ? last.end : '', end: '', menu: '' });
    save(); renderAdminRehearsals();
};

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
            const key = `${r.id}_${s.id}`;
            const present = [], absent = [], notesOnly = [];
            state.members.forEach(name => {
                const att = state.attendance[name]?.[key];
                const displayName = `${name}${att?.note ? '(' + att.note + ')' : ''}`;
                if (att?.status === '出席') present.push(displayName);
                else if (att?.status === '欠席') absent.push(displayName);
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
    if ($(btnId)) { $(btnId).onclick = () => { const v = $(inputId).value.trim(); if(v) { state.settings[key].push(v); $(inputId).value=''; save(); renderAdminDropdowns(); } }; }
}

window.editItem = (key, i) => { const oldVal = state.settings[key][i]; const newVal = prompt('項目を編集:', oldVal); if (newVal !== null && newVal.trim() !== '' && newVal !== oldVal) { state.settings[key][i] = newVal.trim(); save(); renderAdminDropdowns(); } };
window.moveItem = (key, i, dir) => { const arr = state.settings[key]; const target = i + dir; if (target < 0 || target >= arr.length) return; [arr[i], arr[target]] = [arr[target], arr[i]]; save(); renderAdminDropdowns(); };
window.delItem = (key, i) => { state.settings[key].splice(i, 1); save(); renderAdminDropdowns(); };

function renderAdminVisibility() {
    const container = $('visibility-controls-container'); if (!container) return;
    container.innerHTML = '';
    const tabs = [{ id: 'attendance-input', label: '出欠入力' }, { id: 'overall-status', label: '参加状況' }, { id: 'past-records', label: '過去' }, { id: 'admin-panel', label: '管理' }];
    tabs.forEach(tab => {
        const cur = state.settings.visibility[tab.id];
        container.innerHTML += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;"><span style="font-size:0.9rem;">${tab.label}</span><select class="cute-input" style="width:100px; margin:0;" onchange="updateVis('${tab.id}', this.value)"><option value="public" ${cur==='public'?'selected':''}>公開</option><option value="protected" ${cur==='protected'?'selected':''}>制限中</option></select></div>`;
    });
}
window.updateVis = (id, val) => { state.settings.visibility[id] = val; save(); updateLockIcons(); };

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
        const isEditing = state.ui.editingId === r.id;
        let headerH = isEditing 
            ? `<div class="admin-line"><input type="date" class="cute-input date-input-fixed" value="${r.date}" onchange="updateR_Base_Past('${r.id}','date',this.value)">${renderAdminDropdownSelect(r.id, null, 'location', r.location)}<button class="icon-btn-sm" onclick="toggleEditPast(null)"><i class="fa-solid fa-check"></i></button></div>`
            : `<div class="section-header" onclick="toggleEditPast('${r.id}')"><div style="display:flex; align-items:center;"><input type="checkbox" class="past-checkbox" value="${r.id}" onclick="event.stopPropagation()"><h2><i class="fa-solid fa-calendar-day"></i> ${r.date}　${r.location}</h2></div><i class="fa-solid fa-pen" style="font-size:0.8rem; color:#DDD;"></i></div>`;
        let slotsH = '';
        r.slots.forEach(s => {
            const key = `${r.id}_${s.id}`;
            const pres = [], absWithNotes = [];
            state.members.forEach(name => {
                const att = state.attendance[name]?.[key];
                if (att?.status === '出席') pres.push({name, note:att.note});
                else if (att?.status === '欠席' && att.note) absWithNotes.push({ name, note: att.note });
            });
            const timeStart = isEditing ? `<input type="time" class="cute-input time-sel" value="${s.start}" onchange="updateR_Past('${r.id}','${s.id}','start',this.value)">` : `<span class="time-sel-display" onclick="toggleEditPast('${r.id}')">${s.start}</span>`;
            const timeEnd = isEditing ? `<input type="time" class="cute-input time-sel" value="${s.end}" onchange="updateR_Past('${r.id}','${s.id}','end',this.value)">` : `<span class="time-sel-display" onclick="toggleEditPast('${r.id}')">${s.end}</span>`;
            const menuContent = isEditing ? renderAdminDropdownSelect(r.id, s.id, 'menu', s.menu) : `<span class="flex-fill-input" onclick="toggleEditPast('${r.id}')">${s.menu} <i class="fa-solid fa-pen" style="font-size:0.6rem; color:#EEE;"></i></span>`;
            slotsH += `<div class="slot-row" style="margin-bottom:15px; border-bottom:1px dashed #EEE; padding-bottom:10px;"><div class="admin-line" style="margin-bottom:8px; font-size:0.85rem;"><strong>${timeStart}〜${timeEnd}</strong>${menuContent}</div><div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:8px;">${pres.map(p => `<span class="pills-edit" onclick="editAnyAttend_UI('${p.name}','${r.id}','${s.id}')">${p.name}${p.note?'('+p.note+')':''}</span>`).join('') || '<span style="color:#CCC; font-size:0.7rem;">出席者なし</span>'}<button class="icon-btn-sm" style="width:auto; padding:0 8px; font-size:0.7rem;" onclick="showAddAnyAttend_UI('${r.id}','${s.id}')">+ 追加/修正</button></div>`;
            if (absWithNotes.length > 0) { slotsH += `<div class="absent-section">${absWithNotes.map(a => `<div class="absent-row" onclick="editAnyAttend_UI('${a.name}','${r.id}','${s.id}')"><span class="absent-name">${a.name}</span><span class="absent-note">${a.note}</span></div>`).join('')}</div>`; }
            slotsH += `</div>`;
        });
        h = headerH + slotsH;
        h += `<button class="puffy-btn pink puffy-btn-sm" style="width:100%; margin-top:10px;" onclick="addS_Past('${r.id}')"><i class="fa-solid fa-plus"></i> メニュー追加</button>`;
        card.innerHTML = h; container.appendChild(card);
    });
}

window.toggleEditPast = (id) => { state.ui.editingId = id; renderPastRecords(); };
window.updateR_Base_Past = (id, k, v) => { updateR(id, k, v); renderPastRecords(); };
window.updateR_Past = (rid, sid, k, v) => { updateS(rid, sid, k, v); renderPastRecords(); };
window.editAnyAttend_UI = (name, rid, sid) => {
    const att = state.attendance[name]?.[`${rid}_${sid}`] || {status:null, note:''};
    const s = confirm(`${name}さんの出欠を切り替えますか？\n現在: ${att.status || '未入力'}`) ? (att.status==='出席'?'欠席':'出席') : att.status;
    const n = prompt(`${name}さんの備考:`, att.note);
    if(s !== att.status || n !== att.note) { setAnyAttend(name, rid, sid, s); setAnyNote(name, rid, sid, n || ''); renderPastRecords(); }
};
window.showAddAnyAttend_UI = (rid, sid) => {
    const name = prompt("修正・追加するメンバーの名前を入力してください:");
    if(name && state.members.includes(name)) editAnyAttend_UI(name, rid, sid);
    else if(name) alert("メンバーが見つかりません。");
};
window.delR_Past = (id) => { if(confirm('削除しますか？')) { state.rehearsals = state.rehearsals.filter(x => x.id !== id); save(); renderPastRecords(); } };
window.addS_Past = (id) => { const r = state.rehearsals.find(x => x.id === id); const last = r.slots[r.slots.length - 1]; r.slots.push({ id: generateId(), start: last ? last.end : '', end: '', menu: '' }); save(); renderPastRecords(); };

window.onload = async () => { initAuth(); initTabs(); await loadCloud(); };
