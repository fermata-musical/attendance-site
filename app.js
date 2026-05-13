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

// --- クラウド同期ロジック ---

async function load(force = false) {
    if (isInitialLoaded && !force) return;

    if (!isInitialLoaded) $('loading-overlay').classList.remove('hidden');

    const localSaved = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (localSaved) {
        state = { ...state, ...JSON.parse(localSaved) };
    }

    if (!SYNC_URL) {
        isInitialLoaded = true;
        $('loading-overlay').classList.add('hidden');
        return;
    }

    try {
        const response = await fetch(SYNC_URL);
        if (response.ok) {
            const cloudData = await response.json();
            if (cloudData && Object.keys(cloudData).length > 0) {
                state = { ...state, ...cloudData };
                state.currentMember = '';
                // ★ 読み込み直後は年月タブの選択をリセット（一番古いものを選ぶため）
                state.ui.currentMonth = '';
                console.log("クラウドから最新データを取得しました。");
            }
        }
    } catch (error) {
        console.error("クラウド読み込みエラー:", error);
    } finally {
        isInitialLoaded = true;
        $('loading-overlay').classList.add('hidden');
    }
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
            await fetch(SYNC_URL, {
                method: 'POST',
                body: json,
                mode: 'no-cors'
            });
            console.log("クラウド保存完了");
        } catch (error) {
            console.error("クラウド保存エラー:", error);
        } finally {
            setTimeout(() => $('sync-indicator').classList.add('hidden'), 1000);
        }
    }, 1500);
}

// --- 既存のアプリロジック ---

const $ = (id) => document.getElementById(id);
const generateId = () => Math.random().toString(36).substr(2, 9);
const getMonthStr = (date) => date ? date.substring(0, 7) : "";
const getToday = () => new Date().setHours(0,0,0,0);

function initAuth() {
    $('login-btn').onclick = () => {
        const pw = $('password-input').value;
        if (pw === CONFIG.ADMIN_PW) state.auth = { isLoggedIn: true, type: 'admin' };
        else if (pw === CONFIG.COMMON_PW) state.auth = { isLoggedIn: true, type: 'common' };
        else { $('login-error').classList.remove('hidden'); return; }
        save(); location.reload();
    };
    $('logout-btn').onclick = () => { if (confirm('ログアウトしますか？')) { state.auth = { isLoggedIn: false, type: null }; save(); location.reload(); } };
    if (state.auth.isLoggedIn) {
        $('login-overlay').classList.add('hidden');
        $('app').classList.remove('hidden');
        updateLockIcons();
        renderTab('attendance-input');
    }
}

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
            if (state.settings.visibility[id] === 'protected' && state.auth.type !== 'admin') {
                alert('管理者のみアクセス可能です。'); return;
            }
            
            sortScheduleByDate();
            refreshAdminViewList();
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active'); $(id).classList.add('active');
            renderTab(id);
        };
    });

    document.querySelectorAll('.menu-tab').forEach(tab => {
        tab.onclick = () => {
            sortScheduleByDate();
            refreshAdminViewList();
            document.querySelectorAll('.menu-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.sub-tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active'); $(tab.dataset.menu).classList.add('active');
            renderTab('admin-panel');
        };
    });
}

function refreshAdminViewList() {
    state.ui.adminViewList = state.rehearsals.filter(r => !r.date || new Date(r.date) >= getToday());
}

function sortScheduleByDate() {
    state.rehearsals.sort((a,b) => {
        if (!a.date) return 1; if (!b.date) return -1;
        return a.date.localeCompare(b.date);
    });
}

function renderTab(id) {
    if (id === 'attendance-input') renderAttendanceInput();
    if (id === 'overall-status') renderOverallStatus();
    if (id === 'admin-panel') renderAdminPanel();
    if (id === 'past-records') renderPastRecords();
}

function renderAttendanceInput() {
    const select = $('member-select');
    select.innerHTML = '<option value="">メンバーを選択</option>';
    state.members.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        if (name === state.currentMember) opt.selected = true;
        select.appendChild(opt);
    });
    select.onchange = (e) => {
        state.currentMember = e.target.value;
        save();
        renderAttendanceInput();
    };
    const actionGroup = $('member-action-btns');
    if (state.currentMember) {
        actionGroup.classList.remove('hidden');
        $('edit-current-member-btn').onclick = () => startEditCurrentMember();
        $('delete-current-member-btn').onclick = () => deleteCurrentMember();
    } else {
        actionGroup.classList.add('hidden');
    }
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
    renderAttendanceList();
}

function startEditCurrentMember() {
    const i = state.members.indexOf(state.currentMember);
    const newName = prompt('氏名を編集:', state.currentMember);
    if (newName && newName.trim() !== state.currentMember) {
        const oldName = state.currentMember;
        state.members[i] = newName.trim();
        state.currentMember = newName.trim();
        if (state.attendance[oldName]) {
            state.attendance[newName.trim()] = state.attendance[oldName];
            delete state.attendance[oldName];
        }
        save(); renderAttendanceInput();
    }
}
function deleteCurrentMember() {
    if (confirm(`${state.currentMember}さんを削除しますか？`)) {
        const i = state.members.indexOf(state.currentMember);
        const name = state.currentMember;
        state.members.splice(i, 1);
        delete state.attendance[name];
        state.currentMember = '';
        save(); renderAttendanceInput();
    }
}

function renderAttendanceList() {
    const container = $('attendance-list-container');
    const tabBar = $('month-tab-bar');
    container.innerHTML = ''; tabBar.innerHTML = '';
    if (!state.currentMember) {
        container.innerHTML = '<p class="admin-hint">メンバーを選択してください</p>';
        return;
    }
    const future = state.rehearsals.filter(r => r.date && new Date(r.date) >= getToday());
    
    // ★ リストを昇順（古い順）で並べる
    const months = [...new Set(future.map(r => getMonthStr(r.date)))].sort();
    
    if (months.length === 0) return;

    // ★ 初期選択として一番最初の要素（最も古い年月）をセットする
    if (!state.ui.currentMonth || !months.includes(state.ui.currentMonth)) {
        state.ui.currentMonth = months[0];
    }

    months.forEach(m => {
        const btn = document.createElement('button');
        btn.className = `month-btn ${m === state.ui.currentMonth ? 'active' : ''}`;
        btn.textContent = m.replace('-', '/') ;
        btn.onclick = () => { state.ui.currentMonth = m; renderAttendanceList(); };
        tabBar.appendChild(btn);
    });
    future.filter(r => getMonthStr(r.date) === state.ui.currentMonth).forEach(r => {
        const card = document.createElement('div'); card.className = 'card';
        let slotsHtml = '';
        r.slots.forEach(s => {
            const key = `${r.id}_${s.id}`;
            const data = state.attendance[state.currentMember]?.[key] || {status: null, note: ''};
            slotsHtml += `
                <div class="slot-row" style="margin-bottom:15px; border-bottom:1px dashed #FFEFF2; padding-bottom:15px;">
                    <div style="font-size:0.9rem; margin-bottom:8px;"><strong>${s.start}〜${s.end}</strong> [${s.menu}]</div>
                    <div class="attendance-toggle">
                        <button class="toggle-btn present ${data.status==='出席'?'active':''}" onclick="setAttend('${r.id}','${s.id}','出席')">出席</button>
                        <button class="toggle-btn absent ${data.status==='欠席'?'active':''}" onclick="setAttend('${r.id}','${s.id}','欠席')">欠席</button>
                    </div>
                    <input type="text" class="cute-input note-area" placeholder="備考があれば" value="${data.note}" onchange="setNote('${r.id}','${s.id}',this.value)">
                </div>
            `;
        });
        card.innerHTML = `<div class="section-header"><h2><i class="fa-solid fa-calendar-day"></i> ${r.date} (${r.location})</h2></div>${slotsHtml}`;
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
    list.innerHTML = '';
    $('list-locations').innerHTML = state.settings.locations.map(l => `<option value="${l}">`).join('');
    $('list-menus').innerHTML = state.settings.menus.map(m => `<option value="${m}">`).join('');
    if (state.ui.adminViewList.length === 0 && state.rehearsals.length > 0) refreshAdminViewList();
    state.ui.adminViewList.forEach(r => {
        const card = document.createElement('div'); card.className = 'admin-card-inner';
        let slotsH = '';
        r.slots.forEach(s => {
            slotsH += `
                <div class="admin-line slots">
                    <select class="cute-input time-sel" onchange="updateS('${r.id}','${s.id}','start',this.value)">${getTimeOpts(s.start)}</select>
                    <span>-</span>
                    <select class="cute-input time-sel" onchange="updateS('${r.id}','${s.id}','end',this.value)">${getTimeOpts(s.end)}</select>
                    <input list="list-menus" class="cute-input menu-sel flex-fill-input" value="${s.menu}" onchange="updateS('${r.id}','${s.id}','menu',this.value)" placeholder="メニューを追加">
                    <button class="del-icon-btn" onclick="delS('${r.id}','${s.id}')"><i class="fa-solid fa-xmark"></i></button>
                </div>
            `;
        });
        card.innerHTML = `
            <div class="admin-line">
                <input type="date" class="cute-input date-input-fixed" value="${r.date}" onchange="updateR('${r.id}','date',this.value)">
                <input list="list-locations" class="cute-input flex-fill-input" value="${r.location}" onchange="updateR('${r.id}','location',this.value)" placeholder="場所を追加">
                <button class="del-icon-btn" onclick="delR('${r.id}')"><i class="fa-solid fa-trash-can"></i></button>
            </div>
            ${slotsH}
            <div style="margin-top:10px;"><button class="puffy-btn pink puffy-btn-sm" style="width:100%" onclick="addS('${r.id}')"><i class="fa-solid fa-plus"></i> メニュー追加</button></div>
        `;
        list.appendChild(card);
    });
}

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

$('add-rehearsal-btn').onclick = () => {
    sortScheduleByDate(); 
    const newId = generateId();
    const newR = { id: newId, date: '', location: '', slots: [{id: generateId(), start: '', end: '', menu: ''}] };
    state.rehearsals.push(newR);
    refreshAdminViewList();
    save(); renderAdminRehearsals();
};

function renderOverallStatus() {
    const container = $('overall-status-container');
    const tabBar = $('status-month-tab-bar');
    container.innerHTML = ''; tabBar.innerHTML = '';
    const future = state.rehearsals.filter(r => r.date && new Date(r.date) >= getToday());
    const months = [...new Set(future.map(r => getMonthStr(r.date)))].sort();
    if (months.length === 0) return;
    if (!state.ui.statusMonth || !months.includes(state.ui.statusMonth)) state.ui.statusMonth = months[0];
    months.forEach(m => {
        const btn = document.createElement('button');
        btn.className = `month-btn ${m === state.ui.statusMonth ? 'active' : ''}`;
        btn.textContent = m.replace('-', '/');
        btn.onclick = () => { state.ui.statusMonth = m; renderOverallStatus(); };
        tabBar.appendChild(btn);
    });
    future.filter(r => getMonthStr(r.date) === state.ui.statusMonth).forEach(r => {
        const card = document.createElement('div'); card.className = 'card';
        let h = `<div class="section-header"><h2><i class="fa-solid fa-star"></i> ${r.date}</h2></div>`;
        r.slots.forEach(s => {
            const key = `${r.id}_${s.id}`;
            const present = [], absent = [], notesOnly = [];
            
            state.members.forEach(name => {
                const att = state.attendance[name]?.[key];
                const displayName = `${name}${att?.note ? '(' + att.note + ')' : ''}`;
                
                if (att?.status === '出席') {
                    present.push(displayName);
                } else if (att?.status === '欠席') {
                    absent.push(displayName);
                } else if (att?.note) {
                    notesOnly.push(displayName);
                }
            });

            h += `<div class="slot-row" style="margin-bottom:20px; border-bottom:1px dashed #FFEFF2; padding-bottom:15px;">
                    <div style="font-size:0.9rem; margin-bottom:12px; color:var(--pink-dark);"><strong>${s.start}〜${s.end}</strong> [${s.menu}]</div>
                    
                    <div class="status-group">
                        <div class="absent-title">【出席者】</div>
                        <div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:12px;">
                            ${present.map(n => `<span class="pills-edit" style="cursor:default;">${n}</span>`).join('') || '<span style="color:#EEE; font-size:0.75rem;">なし</span>'}
                        </div>
                    </div>

                    <div class="status-group">
                        <div class="absent-title">【欠席者】</div>
                        <div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:12px;">
                            ${absent.map(n => `<span class="pills-edit" style="background:var(--lavender-light); color:#7B1FA2; cursor:default;">${n}</span>`).join('') || '<span style="color:#EEE; font-size:0.75rem;">なし</span>'}
                        </div>
                    </div>

                    <div class="status-group">
                        <div class="absent-title">【備考のみ】</div>
                        <div style="display:flex; flex-wrap:wrap; gap:5px;">
                            ${notesOnly.map(n => `<span class="pills-edit" style="background:#F5F5F5; color:#888; cursor:default;">${n}</span>`).join('') || '<span style="color:#EEE; font-size:0.75rem;">なし</span>'}
                        </div>
                    </div>
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
    const list = $(listId); list.innerHTML = '';
    state.settings[key].forEach((item, i) => {
        const li = document.createElement('li');
        li.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:10px 15px; background:white; border:1px solid #F0F0F0; border-radius:12px; margin-bottom:8px; font-size:0.9rem;";
        
        li.innerHTML = `
            <span>${item}</span>
            <div style="display:flex; gap:5px; align-items:center;">
                <button class="icon-btn-sm" style="width:30px; height:30px; font-size:0.7rem;" onclick="moveItem('${key}', ${i}, -1)" ${i===0?'disabled style="opacity:0.3"':''}><i class="fa-solid fa-chevron-up"></i></button>
                <button class="icon-btn-sm" style="width:30px; height:30px; font-size:0.7rem;" onclick="moveItem('${key}', ${i}, 1)" ${i===state.settings[key].length-1?'disabled style="opacity:0.3"':''}><i class="fa-solid fa-chevron-down"></i></button>
                <button class="del-icon-btn" style="margin-left:8px;" onclick="delItem('${key}', ${i})"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `;
        list.appendChild(li);
    });
    $(btnId).onclick = () => { const v = $(inputId).value.trim(); if(v) { state.settings[key].push(v); $(inputId).value=''; save(); renderAdminDropdowns(); } };
}

window.moveItem = (key, i, dir) => {
    const arr = state.settings[key];
    const target = i + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[i], arr[target]] = [arr[target], arr[i]];
    save();
    renderAdminDropdowns();
};

window.delItem = (key, i) => { state.settings[key].splice(i, 1); save(); renderAdminDropdowns(); };

function renderAdminVisibility() {
    const container = $('visibility-controls-container'); container.innerHTML = '';
    const tabs = [
        { id: 'attendance-input', label: '出欠入力' },
        { id: 'overall-status', label: '参加状況' },
        { id: 'past-records', label: '過去' },
        { id: 'admin-panel', label: '管理' }
    ];
    tabs.forEach(tab => {
        const cur = state.settings.visibility[tab.id];
        container.innerHTML += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <span style="font-size:0.9rem;">${tab.label}</span>
                <select class="cute-input" style="width:100px; margin:0;" onchange="updateVis('${tab.id}', this.value)">
                    <option value="public" ${cur==='public'?'selected':''}>公開</option>
                    <option value="protected" ${cur==='protected'?'selected':''}>制限中</option>
                </select></div>`;
    });
}
window.updateVis = (id, val) => { state.settings.visibility[id] = val; save(); updateLockIcons(); };

function renderPastRecords() {
    const container = $('past-records-container');
    const tabBar = $('past-month-tab-bar');
    container.innerHTML = ''; tabBar.innerHTML = '';
    const pastAll = state.rehearsals.filter(r => r.date && new Date(r.date) < getToday());
    if (pastAll.length === 0) { container.innerHTML = '<p class="admin-hint">過去の稽古日程はありません</p>'; return; }
    const months = [...new Set(pastAll.map(r => getMonthStr(r.date)))].sort((a,b) => b.localeCompare(a));
    if (!state.ui.pastMonth || !months.includes(state.ui.pastMonth)) state.ui.pastMonth = months[0];
    months.forEach(m => {
        const btn = document.createElement('button');
        btn.className = `month-btn ${m === state.ui.pastMonth ? 'active' : ''}`;
        btn.textContent = m.replace('-', '/');
        btn.onclick = () => { state.ui.pastMonth = m; renderPastRecords(); };
        tabBar.appendChild(btn);
    });
    const past = pastAll.filter(r => getMonthStr(r.date) === state.ui.pastMonth).sort((a,b) => b.date.localeCompare(a.date));
    past.forEach(r => {
        const card = document.createElement('div'); card.className = 'card';
        const isEditing = state.ui.editingId === r.id;
        let headerH = isEditing 
            ? `<div class="admin-line"><input type="date" class="cute-input date-input-fixed" value="${r.date}" onchange="updateR_Base_Past('${r.id}','date',this.value)"><input list="list-locations" class="cute-input flex-fill-input" value="${r.location}" onchange="updateR_Base_Past('${r.id}','location',this.value)"><button class="icon-btn-sm" onclick="toggleEditPast(null)"><i class="fa-solid fa-check"></i></button></div>`
            : `<div class="section-header" onclick="toggleEditPast('${r.id}')"><div style="display:flex; align-items:center;"><input type="checkbox" class="past-checkbox" value="${r.id}" onclick="event.stopPropagation()"><h2><i class="fa-solid fa-calendar-day"></i> ${r.date} (${r.location})</h2></div><i class="fa-solid fa-pen" style="font-size:0.8rem; color:#DDD;"></i></div>`;
        let slotsH = '';
        r.slots.forEach(s => {
            const key = `${r.id}_${s.id}`;
            const pres = [], absWithNotes = [];
            state.members.forEach(name => {
                const att = state.attendance[name]?.[key];
                if (att?.status === '出席') pres.push({name, note:att.note});
                else if (att?.status === '欠席' && att.note) absWithNotes.push({ name, note: att.note });
            });

            const timeStart = isEditing
                ? `<input type="time" class="cute-input time-sel" value="${s.start}" onchange="updateR_Past('${r.id}','${s.id}','start',this.value)">`
                : `<span class="time-sel-display" onclick="toggleEditPast('${r.id}')">${s.start}</span>`;
            const timeEnd = isEditing
                ? `<input type="time" class="cute-input time-sel" value="${s.end}" onchange="updateR_Past('${r.id}','${s.id}','end',this.value)">`
                : `<span class="time-sel-display" onclick="toggleEditPast('${r.id}')">${s.end}</span>`;
            
            const menuContent = isEditing
                ? `<input list="list-menus" class="cute-input menu-sel flex-fill-input" value="${s.menu}" onchange="updateR_Past('${r.id}','${s.id}','menu',this.value)">`
                : `<span class="flex-fill-input" onclick="toggleEditPast('${r.id}')">${s.menu} <i class="fa-solid fa-pen" style="font-size:0.6rem; color:#EEE;"></i></span>`;

            slotsH += `<div class="slot-row" style="margin-bottom:15px; border-bottom:1px dashed #EEE; padding-bottom:10px;">
                    <div class="admin-line" style="margin-bottom:8px; font-size:0.85rem;">
                        <strong>${timeStart}〜${timeEnd}</strong>
                        ${menuContent}
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:8px;">
                        ${pres.map(p => `<span class="pills-edit" onclick="editAnyAttend_UI('${p.name}','${r.id}','${s.id}')">${p.name}${p.note?'('+p.note+')':''}</span>`).join('') || '<span style="color:#EEE; font-size:0.7rem;">出席者なし</span>'}
                        <button class="icon-btn-sm" style="width:auto; padding:0 8px; font-size:0.7rem;" onclick="showAddAnyAttend_UI('${r.id}','${s.id}')">+ 追加/修正</button>
                    </div>`;
            if (absWithNotes.length > 0) {
                slotsH += `<div class="absent-section">${absWithNotes.map(a => `<div class="absent-row" onclick="editAnyAttend_UI('${a.name}','${r.id}','${s.id}')"><span class="absent-name">${a.name}</span><span class="absent-note">${a.note}</span></div>`).join('')}</div>`;
            }
            slotsH += `</div>`;
        });
        
        h = headerH + slotsH;
        h += `<button class="puffy-btn pink puffy-btn-sm" style="width:100%; margin-top:10px;" onclick="addS_Past('${r.id}')"><i class="fa-solid fa-plus"></i> メニュー追加</button>`;
        card.innerHTML = h;
        container.appendChild(card);
    });
    $('delete-selected-past-btn').onclick = deleteSelectedPast;
    $('clear-past-btn').onclick = () => { if(confirm('過去データをすべて削除しますか？')) { state.rehearsals = state.rehearsals.filter(r => !r.date || new Date(r.date) >= getToday()); save(); renderPastRecords(); } };
}

function deleteSelectedPast() {
    const checked = Array.from(document.querySelectorAll('.past-checkbox:checked')).map(el => el.value);
    if (checked.length === 0) { alert('削除するデータを選択してください。'); return; }
    if (confirm(`選択した ${checked.length} 件のデータを削除しますか？`)) {
        state.rehearsals = state.rehearsals.filter(r => !checked.includes(r.id));
        save();
        renderPastRecords();
    }
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
window.addS_Past = (id) => { 
    const r = state.rehearsals.find(x => x.id === id);
    const last = r.slots[r.slots.length - 1];
    r.slots.push({ id: generateId(), start: last ? last.end : '', end: '', menu: '' });
    save(); 
    renderPastRecords(); 
};

// --- 初期化 ---
window.onload = async () => { 
    await load(); 
    initAuth(); 
    initTabs(); 
};
