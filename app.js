console.log("app.js loaded");
// --- 接続設定 ---
const SUPABASE_URL = 'https://cwepoklweabvpmyfizto.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_3M_jMfBkVJdZNVypnV51ig_oYsn6-0n';

let db; 
let allowUpdate = false; 
let isEditing = false; 
let isLocked = true;   
let allowSort = false; // 並び替え許可フラグ
let isSaving = false;  // 保存中フラグ

function isEditingNow() {
    const active = document.activeElement;
    return active && (
        active.classList.contains('date-input') ||
        ['INPUT', 'SELECT', 'TEXTAREA'].includes(active.tagName)
    );
}

// 標準的なappendChildを使用
function safeAppend(parent, child) {
    if (isLocked) return;
    parent.appendChild(child);
}

function unlockAndUpdate() {
    isLocked = false;
    allowUpdate = true;
    sortPractices();
    hidePastPractices();
}

function showTab(tabId) {
    console.log("tab click:", tabId);
    const target = document.getElementById(tabId);
    if (!target) return;

    if (target.classList.contains('sub-tab-content')) {
        const parent = target.parentElement;
        parent.querySelectorAll('.sub-tab-content').forEach(el => {
            el.classList.remove('active');
            el.style.display = 'none';
        });
        target.classList.add('active');
        target.style.display = 'block';
    } else {
        document.querySelectorAll('.tab-content').forEach(el => {
            el.classList.remove('active');
            el.style.display = 'none';
        });
        target.classList.add('active');
        target.style.display = 'block';
    }
}

// 描画更新
function refreshUI() {
    renderTab(document.querySelector('.nav-tab.active')?.dataset.tab || 'attendance-input');
}

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
        visibility: {} // localStorageから読み込む
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

function setupSelectEventListeners() {
    // プルダウンの挙動を正常化
    document.querySelectorAll('select').forEach(select => {
        if (select.dataset.initialized === 'true') return;
        select.dataset.initialized = 'true';
        // 余計なイベント停止を削除し、ブラウザ標準の動作を優先
    });
}

// --- クラウド同期ロジック (Supabase版) ---

async function loadCloud() {
    if (!db) return;
    try {
        $('sync-indicator').classList.remove('hidden');
        const { data: members, error: mErr } = await db.from('members').select('*');
        if (mErr) throw mErr;
        const { data: practices, error: pErr } = await db.from('practices').select('*');
        if (pErr) throw pErr;
        const { data: attendance, error: aErr } = await db.from('attendance').select('*');
        if (aErr) throw aErr;

        state.members = members;
        const groups = {};
        practices.forEach(p => {
            const key = `${p.date}_${p.place}`;
            if (!groups[key]) groups[key] = { date: p.date, location: p.place, slots: [] };
            groups[key].slots.push({ id: p.id, start: p.start_time, end: p.end_time, menu: p.menu });
        });
        state.rehearsals = Object.values(groups);

        state.attendance = {};
        attendance.forEach(a => {
            if (!state.attendance[a.member_id]) state.attendance[a.member_id] = {};
            state.attendance[a.member_id][a.practice_id] = { id: a.id, status: a.status, note: a.note };
        });

        const savedVis = localStorage.getItem('visibilitySettings');
        if (savedVis) state.settings.visibility = JSON.parse(savedVis);

        if (state.auth.isLoggedIn) { 
            refreshAdminViewList();
            isLocked = false; 
            renderTab(document.querySelector('.nav-tab.active')?.dataset.tab || 'attendance-input'); 
            setupSelectEventListeners();
            isLocked = true;
        }
    } catch (error) { console.error("Supabase読み込みエラー:", error); } 
    finally { $('sync-indicator').classList.add('hidden'); }
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
        if (parsed.settings) {
            state.settings = { ...state.settings, ...parsed.settings };
        }
        state.auth = parsed.auth || state.auth;
        state.currentMember = parsed.currentMember || '';
    }
    const savedVis = localStorage.getItem('visibilitySettings');
    if (savedVis) state.settings.visibility = JSON.parse(savedVis);

    const loginBtn = $('login-btn');
    if (loginBtn) {
        loginBtn.onclick = () => {
            const pw = ($('password-input').value || '').trim();
            if (pw === CONFIG.ADMIN_PW) state.auth = { isLoggedIn: true, type: 'admin' };
            else if (pw === CONFIG.COMMON_PW) state.auth = { isLoggedIn: true, type: 'common' };
            else { $('login-error').classList.remove('hidden'); return; }
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
                saveLocal(); location.reload();
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
        tab.addEventListener('click', () => {
            const id = tab.dataset.tab;
            
            // タブ切替前に今の入力を保存し、並び替えを許可
            savePracticesFromDOM();
            allowSort = true;
            sortPractices();

            if (state.settings.visibility[id] === 'protected' && state.auth.type !== 'admin') { 
                alert('管理者のみアクセス可能です。'); return; 
            }
            refreshAdminViewList();
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active'); 
            
            showTab(id);
            isLocked = false;
            renderTab(id);
            isLocked = true;
        });
    });

    document.querySelectorAll('.menu-tab').forEach(tab => {
        tab.onclick = () => {
            // サブタブ切替前にも保存・並び替え
            savePracticesFromDOM();
            allowSort = true;
            sortPractices();

            refreshAdminViewList();
            document.querySelectorAll('.menu-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.sub-tab-content').forEach(c => c.style.display = 'none');
            tab.classList.add('active'); 
            const menuId = tab.dataset.menu;
            if ($(menuId)) $(menuId).style.display = 'block';
            
            isLocked = false;
            renderAdminPanel(); 
            isLocked = true;
        };
    });

    const addBtn = $('add-rehearsal-btn');
    if (addBtn) {
        addBtn.onclick = () => {
            if (typeof window.addNewRehearsal === 'function') {
                window.addNewRehearsal();
            }
        };
    }
}

async function saveAllPractices(silent = false) {
    if (!db) return;
    const dataList = [];
    const cards = document.querySelectorAll('.admin-card-inner');
    cards.forEach(card => {
        const date = card.querySelector('.date-input').value;
        if (!date) return;
        
        const locSel = card.querySelector('.location-input');
        const locText = card.querySelector('.location-input-text');
        let place = locSel?.value || '';
        if (place === 'other') place = locText?.value || '';

        card.querySelectorAll('.slots').forEach(slot => {
            const id = slot.dataset.id;
            const start = slot.querySelector('.start-time-input').value;
            const end = slot.querySelector('.end-time-input').value;
            
            const menuSel = slot.querySelector('.menu-input');
            const menuText = slot.querySelector('.menu-input-text');
            let menu = menuSel?.value || '';
            if (menu === 'other') menu = menuText?.value || '';
            
            const record = { date, place, start_time: start, end_time: end, menu };
            if (id && id !== "undefined") record.id = id;
            else record.id = crypto.randomUUID();

            dataList.push(record);
        });
    });
    if (dataList.length === 0) return;
    const { error } = await db.from('practices').upsert(dataList);
    if (error) { console.error(error); alert('保存エラー: ' + error.message); } 
    else if (!silent) { 
        // サイレント保存（入力中のchange等）でない場合のみ再描画
        await loadCloud(); 
    }
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
        if (String(m.id) === String(state.currentMember)) opt.selected = true;
        select.appendChild(opt);
    });

    select.onchange = (e) => { 
        state.currentMember = e.target.value; 
        saveLocal(); 
        renderAttendanceContent();
    };

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
                else { 
                    state.currentMember = data.id;
                    saveLocal(); 
                    await loadCloud(); 
                }
            }
        };
        if (state.currentMember) {
            $('edit-current-member-btn').onclick = () => startEditCurrentMember();
            $('delete-current-member-btn').onclick = () => deleteCurrentMember();
        }
    }
    renderAttendanceContent();
    setupSelectEventListeners();
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

function renderAttendanceContent() {
    const mainContainer = $('attendance-list-container');
    if (!mainContainer) return;

    const topBar = $('month-tab-bar');
    const bottomBar = $('month-tab-bar-bottom');
    if (topBar) topBar.innerHTML = '';
    if (bottomBar) bottomBar.innerHTML = '';

    if (!state.currentMember) { 
        mainContainer.innerHTML = '<p class="admin-hint" style="text-align:center; padding:40px 20px;">メンバーを選択してください</p>'; 
        return; 
    }

    const future = state.rehearsals
        .filter(r => r.date && new Date(r.date) >= getToday())
        .sort((a, b) => a.date.localeCompare(b.date));

    const months = [...new Set(future.map(r => getMonthStr(r.date)))].sort(); 
    if (months.length === 0) {
        mainContainer.innerHTML = '<p class="admin-hint" style="text-align:center; padding:40px;">今後の稽古予定はありません</p>';
        return;
    }

    mainContainer.innerHTML = '';

    months.forEach(m => {
        const monthHeader = document.createElement('div');
        monthHeader.style = `background: var(--pink-light); color: var(--pink-dark); padding: 10px 15px; border-radius: 10px; margin: 25px 0 15px 0; font-weight: bold; font-size: 1.1rem; border-left: 5px solid var(--pink-dark); display: flex; align-items: center; gap: 10px;`;
        monthHeader.innerHTML = `<i class="fa-solid fa-calendar-day"></i> ${m.replace('-', '/')}`;
        mainContainer.appendChild(monthHeader);

        future.filter(r => getMonthStr(r.date) === m).forEach(r => {
            const card = document.createElement('div'); card.className = 'card';
            let slotsHtml = '';
            r.slots.forEach(s => {
                const data = state.attendance[state.currentMember]?.[s.id] || {id:null, status: null, note: ''};
                const statusStr = data.status === 'attend' ? '出席' : (data.status === 'absent' ? '欠席' : null);
                slotsHtml += `<div class="slot-row" style="margin-bottom:15px; border-bottom:1px dashed #DDD; padding-bottom:15px;">
                        <div style="font-size:0.9rem; margin-bottom:8px;"><strong>${s.start}〜${s.end}</strong> [${s.menu}]</div>
                        <div class="attendance-toggle">
                            <button class="toggle-btn present ${statusStr==='出席'?'active':''}" onclick="setAttend('${s.id}','attend', this)">出席</button>
                            <button class="toggle-btn absent ${statusStr==='欠席'?'active':''}" onclick="setAttend('${s.id}','absent', this)">欠席</button>
                        </div>
                        <input type="text" class="cute-input note-area" placeholder="備考があれば" value="${data.note || ''}" onchange="setNote('${s.id}',this.value)">
                    </div>`;
            });
            card.innerHTML = `<div class="section-header"><h2><i class="fa-solid fa-calendar-day"></i> ${r.date}　${r.location}</h2></div>${slotsHtml}`;
            mainContainer.appendChild(card);
        });
    });
}

window.setAttend = async (practiceId, status, btnElement) => {
    if (!state.currentMember || !db || isSaving) return;
    
    // 楽観的UI：DBの返答を待たずにUIを更新
    if (btnElement) {
        const parent = btnElement.parentElement;
        parent.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        
        if (!state.attendance[state.currentMember]) state.attendance[state.currentMember] = {};
        const curStatus = state.attendance[state.currentMember][practiceId]?.status;
        const newStatus = curStatus === status ? null : status;

        if (newStatus === 'attend') parent.querySelector('.present')?.classList.add('active');
        if (newStatus === 'absent') parent.querySelector('.absent')?.classList.add('active');
        
        // メモリ上のstateも即座に更新
        state.attendance[state.currentMember][practiceId] = { 
            ...state.attendance[state.currentMember][practiceId], 
            status: newStatus 
        };
    }

    isSaving = true;
    const cur = state.attendance[state.currentMember][practiceId];
    const record = { 
        member_id: state.currentMember, 
        practice_id: practiceId, 
        status: cur.status, 
        note: cur.note || '' 
    };

    const { data, error } = await db.from('attendance').upsert(record, { 
        onConflict: 'member_id,practice_id' 
    }).select();

    if (error) { 
        console.error("保存エラー:", error); 
        // 失敗時のみ通知（UIは戻さない方針）
    } else if (data && data[0]) { 
        state.attendance[state.currentMember][practiceId].id = data[0].id; 
    }
    isSaving = false;
};

window.setNote = async (practiceId, val) => {
    if (!state.currentMember || !db || isSaving) return;
    
    if (!state.attendance[state.currentMember]) state.attendance[state.currentMember] = {};
    const cur = state.attendance[state.currentMember][practiceId] || { id: null, status: null, note: '' };
    
    // メモリ上のstateを即座に更新
    state.attendance[state.currentMember][practiceId] = { ...cur, note: val };
    saveLocal();

    isSaving = true;
    const record = { 
        member_id: state.currentMember, 
        practice_id: practiceId, 
        status: cur.status, 
        note: val 
    };

    const { error } = await db.from('attendance').upsert(record, { 
        onConflict: 'member_id,practice_id' 
    });
    
    if (error) console.error('備考保存エラー:', error);
    isSaving = false;
};

function refreshAdminViewList() {
    state.ui.adminViewList = state.rehearsals;
}

function hidePastPractices() {
    if (!allowUpdate) return;
    const items = document.querySelectorAll('.admin-card-inner');
    const today = new Date().setHours(0,0,0,0);
    items.forEach(item => {
        const dateVal = item.querySelector('.date-input').value;
        if (!dateVal) { item.style.display = ''; return; }
        if (new Date(dateVal) < today) item.style.display = 'none';
        else item.style.display = '';
    });
}

function sortPractices() {
    if (!allowSort) return; // 許可されていない時は何もしない
    const list = $('admin-rehearsal-list');
    if (!list) return;
    const items = Array.from(list.querySelectorAll('.admin-card-inner'));
    items.sort((a, b) => {
        const da = a.querySelector('.date-input').value;
        const db = b.querySelector('.date-input').value;
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da.localeCompare(db);
    });
    items.forEach(item => list.appendChild(item));
    allowSort = false; // 実行後はフラグを戻す
}

function renderAdminPanel() {
    const activeSub = document.querySelector('.menu-tab.active')?.dataset.menu || 'rehearsal-edit';
    if (activeSub === 'rehearsal-edit') {
        // 描画前に最新のadminViewListをセット
        refreshAdminViewList();
        renderAdminRehearsals(); 
    }
    if (activeSub === 'dropdown-edit') renderAdminDropdowns();
    if (activeSub === 'tab-visibility') renderAdminVisibility();
}

function savePracticesFromDOM() {
    const list = $('admin-rehearsal-list');
    // 管理タブの日程編集画面が表示されていない場合はスキップ
    if (!list || list.offsetParent === null) return;

    const cards = list.querySelectorAll('.admin-card-inner');
    const newRehearsals = [];

    cards.forEach(card => {
        const date = card.querySelector('.date-input')?.value || '';
        
        // 場所の取得（プルダウン or 直接入力）
        const locSel = card.querySelector('.location-input');
        const locText = card.querySelector('.location-input-text');
        let location = (locSel && locSel.value === 'other') ? (locText?.value || '') : (locSel?.value || '');

        const slots = [];
        card.querySelectorAll('.slots').forEach(slot => {
            const id = slot.dataset.id || crypto.randomUUID();
            const start = slot.querySelector('.start-time-input')?.value || '';
            const end = slot.querySelector('.end-time-input')?.value || '';
            
            // メニューの取得（プルダウン or 直接入力）
            const menuSel = slot.querySelector('.menu-input');
            const menuText = slot.querySelector('.menu-input-text');
            let menu = (menuSel && menuSel.value === 'other') ? (menuText?.value || '') : (menuSel?.value || '');

            slots.push({ id, start, end, menu });
        });

        newRehearsals.push({ date, location, slots });
    });

    // stateを更新
    state.rehearsals = newRehearsals;
    refreshAdminViewList();
}

function renderAdminRehearsals() {
    const list = $('admin-rehearsal-list');
    if (!list) return;
    list.innerHTML = '';
    
    state.ui.adminViewList.forEach((r, idx) => {
        const card = document.createElement('div');
        card.className = 'admin-card-inner';
        
        // 方針A: 1行（1稽古日）のHTMLをテンプレート文字列で一括生成
        let slotsHtml = '';
        const slots = (r.slots && r.slots.length > 0) ? r.slots : [{ id: crypto.randomUUID(), start: '', end: '', menu: '' }];
        
        slots.forEach(s => {
            slotsHtml += getSlotHtml(s.id, s.start, s.end, s.menu);
        });

        card.innerHTML = `
            <div class="admin-line" style="margin-bottom:10px;">
                <input type="date" class="cute-input date-input" value="${r.date || ''}">
                ${renderAdminDropdownSelect(idx, 'location', r.location, true)}
                <button class="delete-practice-btn icon-delete" type="button" onclick="delPracticeGroup('${r.date}','${r.location}')" title="稽古日削除">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
            <div class="menu-container">
                ${slotsHtml}
            </div>
            <div style="text-align:right; margin-top:10px;">
                <button class="action-btn-styled add add-menu-btn" type="button" data-date="${r.date}" data-place="${r.location}">
                    <i class="fa-solid fa-plus"></i> メニューを追加
                </button>
            </div>
        `;
        list.appendChild(card);
    });
}

// 1つのスロット（時間枠）のHTMLを生成するヘルパー（一貫性のため）
function getSlotHtml(id, start = '', end = '', menu = '') {
    return `
        <div class="menu-row" style="margin-bottom:10px;">
            <div class="admin-line slots" data-id="${id}" style="margin-bottom:5px;">
                <select class="cute-input start-time-input">${getTimeOpts(start)}</select>
                <span style="margin:0 5px;">-</span>
                <select class="cute-input end-time-input">${getTimeOpts(end)}</select>
                ${renderAdminDropdownSelect(id, 'menu', menu)}
                <button class="del-icon-btn" type="button" onclick="this.closest('.menu-row').remove()" title="メニュー削除"><i class="fa-solid fa-trash-can"></i></button>
            </div>
        </div>`;
}

window.addNewRehearsal = () => {
    // 画面上の変更を一旦stateに回収（手動追加分も含む）
    savePracticesFromDOM();
    
    isLocked = false;
    state.rehearsals.push({ 
        date: '', 
        location: '', 
        slots: [{ id: crypto.randomUUID(), start: '', end: '', menu: '' }] 
    });
    refreshAdminViewList();
    
    allowSort = true;
    sortPractices();
    
    renderAdminRehearsals(); 
    isLocked = true;
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
};

window.addMenuToDate = (date, place) => {
    // 追加前に現在の入力をstateに保存
    savePracticesFromDOM();

    const target = state.rehearsals.find(r => r.date === date && r.location === place);
    if (target) {
        target.slots.push({ id: crypto.randomUUID(), start: '', end: '', menu: '' });
        renderAdminRehearsals(); // 再描画
    }
};

window.handleAdminDropdownChange = (practiceId, type, select) => {
    const inp = $(`inp-${practiceId}-${type}`);
    if (select.value === 'other') { 
        select.classList.add('hidden'); 
        inp.classList.remove('hidden'); 
        inp.focus(); 
    } else { 
        saveAllPractices(true); 
    }
};
window.handleAdminDropdownChangeGroup = (practiceId, type, select) => {
    const inp = $(`inp-${practiceId}-${type}`);
    if (select.value === 'other') { 
        select.classList.add('hidden'); 
        inp.classList.remove('hidden'); 
        inp.focus(); 
    } else { 
        saveAllPractices(true); 
    }
};
window.handleAdminManualInput = () => { saveAllPractices(true); };
window.handleAdminManualInputGroup = () => { saveAllPractices(true); };

window.delPractice = async (id) => { 
    if(confirm('この枠を削除しますか？')) { 
        const { error } = await db.from('practices').delete().eq('id', id); 
        if (error) alert(error.message); else await loadCloud(); 
    } 
};
window.delPracticeGroup = async (date, place) => { 
    if(confirm(`${date} の稽古日をすべて削除しますか？`)) { 
        const { error } = await db.from('practices').delete().eq('date', date).eq('place', place); 
        if (error) alert(error.message); else await loadCloud(); 
    } 
};

function renderAdminDropdowns() {
    renderList('locations', 'admin-location-list', 'new-location-input', 'add-location-btn');
    renderList('menus', 'admin-menu-list', 'new-menu-input', 'add-menu-btn');
}

function renderList(key, listId, inputId, btnId) {
    const list = $(listId); if (!list) return;
    list.innerHTML = '';
    state.settings[key].forEach((item, i) => {
        const li = document.createElement('li'); li.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:10px 15px; background:white; border:1px solid #E5E7EB; border-radius:12px; margin-bottom:8px; font-size:0.9rem;";
        li.innerHTML = `<span>${item}</span><div style="display:flex; gap:5px; align-items:center;"><button class="icon-btn-sm" onclick="moveItem('${key}', ${i}, -1)" ${i===0?'disabled':''}><i class="fa-solid fa-chevron-up"></i></button><button class="icon-btn-sm" onclick="moveItem('${key}', ${i}, 1)" ${i===state.settings[key].length-1?'disabled':''}><i class="fa-solid fa-chevron-down"></i></button><button class="icon-btn-sm" onclick="editItem('${key}', ${i})"><i class="fa-solid fa-pen"></i></button><button class="del-icon-btn" onclick="delItem('${key}', ${i})"><i class="fa-solid fa-xmark"></i></button></div>`;
        safeAppend(list, li);
    });
    if ($(btnId)) $(btnId).onclick = () => { const v = $(inputId).value.trim(); if(v) { state.settings[key].push(v); $(inputId).value=''; saveLocal(); renderAdminDropdowns(); } };
}

window.editItem = (key, i) => { const oldVal = state.settings[key][i]; const newVal = prompt('項目を編集:', oldVal); if (newVal && newVal !== oldVal) { state.settings[key][i] = newVal.trim(); saveLocal(); renderAdminDropdowns(); } };
window.moveItem = (key, i, dir) => { const arr = state.settings[key]; const target = i + dir; if (target >= 0 && target < arr.length) { [arr[i], arr[target]] = [arr[target], arr[i]]; saveLocal(); renderAdminDropdowns(); } };
window.delItem = (key, i) => { state.settings[key].splice(i, 1); saveLocal(); renderAdminDropdowns(); };

function renderAdminVisibility() {
    const container = $('visibility-controls-container'); if (!container) return;
    container.innerHTML = '';
    const tabs = [{ id: 'attendance-input', label: '出欠入力' }, { id: 'overall-status', label: '参加状況' }, { id: 'past-records', label: '過去' }, { id: 'admin-panel', label: '管理' }];
    tabs.forEach(tab => {
        const cur = state.settings.visibility[tab.id] || 'public';
        container.innerHTML += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;"><span style="font-size:0.9rem;">${tab.label}</span><select class="cute-input" style="width:100px; margin:0;" onchange="updateVis('${tab.id}', this.value)"><option value="public" ${cur==='public'?'selected':''}>公開</option><option value="protected" ${cur==='protected'?'selected':''}>制限中</option></select></div>`;
    });
}
window.updateVis = (id, val) => { state.settings.visibility[id] = val; localStorage.setItem('visibilitySettings', JSON.stringify(state.settings.visibility)); updateLockIcons(); };

function getTimeOpts(s) {
    let h = `<option value="" ${s===''?'selected':''}>選択..</option>`;
    for(let i=8; i<=22; i++) { ['00','15','30','45'].forEach(m => { const t = `${i.toString().padStart(2,'0')}:${m}`; h += `<option value="${t}" ${t===s?'selected':''}>${t}</option>`; }); }
    return h;
}

function renderOverallStatus() {
    const mainContainer = $('overall-status-container'); 
    if (!mainContainer) return;

    // 年月タブ（ボタン）を完全にクリア
    const topBar = $('status-month-tab-bar');
    const bottomBar = $('status-month-tab-bar-bottom');
    if (topBar) topBar.innerHTML = '';
    if (bottomBar) bottomBar.innerHTML = '';

    const future = state.rehearsals
        .filter(r => r.date && new Date(r.date) >= getToday())
        .sort((a, b) => a.date.localeCompare(b.date));

    const months = [...new Set(future.map(r => getMonthStr(r.date)))].sort(); 
    
    if (months.length === 0) {
        mainContainer.innerHTML = '<p class="admin-hint" style="text-align:center; padding:40px;">今後の稽古予定はありません</p>';
        return;
    }

    mainContainer.innerHTML = '';

    months.forEach(m => {
        // 月ごとの見出しを追加（デザイン強化）
        const monthHeader = document.createElement('div');
        monthHeader.style = `
            background: var(--pink-light);
            color: var(--pink-dark);
            padding: 10px 15px;
            border-radius: 10px;
            margin: 25px 0 15px 0;
            font-weight: bold;
            font-size: 1.1rem;
            border-left: 5px solid var(--pink-dark);
            display: flex;
            align-items: center;
            gap: 10px;
        `;
        monthHeader.innerHTML = `<i class="fa-solid fa-calendar-check"></i> ${m.replace('-', '/')}`;
        mainContainer.appendChild(monthHeader);

        future.filter(r => getMonthStr(r.date) === m).forEach(r => {
            let slotsHtml = '';
            r.slots.forEach(s => {
                const pres = [], abs = [], notesOnly = [];
                state.members.forEach(member => {
                    const att = state.attendance[member.id]?.[s.id];
                    const status = att?.status;
                    const note = (att?.note || '').trim();

                    const isAttend = status === 'attend';
                    const isAbsent = status === 'absent';
                    const hasNote = note !== '';

                    const displayName = `${member.name}${hasNote ? '(' + note + ')' : ''}`;

                    if (isAttend) {
                        pres.push(displayName);
                    } else if (isAbsent) {
                        abs.push(displayName);
                    } else if (hasNote) {
                        notesOnly.push(displayName);
                    }
                });

                slotsHtml += `<div class="slot-row" style="margin-bottom:20px; border-bottom:1px dashed #DDD; padding-bottom:15px;">
                        <div style="font-size:0.9rem; margin-bottom:12px; color:var(--pink-dark);"><strong>${s.start}〜${s.end}</strong> [${s.menu}]</div>
                        <div class="status-group"><div class="absent-title">【出席者】</div><div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:12px;">${pres.map(n => `<span class="status-tag present">${n}</span>`).join('') || 'なし'}</div></div>
                        <div class="status-group"><div class="absent-title">【欠席者】</div><div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:12px;">${abs.map(n => `<span class="status-tag absent">${n}</span>`).join('') || 'なし'}</div></div>
                        <div class="status-group"><div class="absent-title" style="color:#888;">【備考のみ】</div><div style="display:flex; flex-wrap:wrap; gap:5px;">${notesOnly.map(n => `<span class="status-tag" style="background-color:#EEE; color:#666; border:1px solid #DDD;">${n}</span>`).join('') || 'なし'}</div></div>
                    </div>`;
            });
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `<div class="section-header"><h2><i class="fa-solid fa-star"></i> ${r.date}　${r.location}</h2></div>${slotsHtml}`;
            mainContainer.appendChild(card);
        });
    });
}

function renderPastRecords() {
    const mainContainer = $('past-records-container'); 
    if (!mainContainer) return;

    const pastAll = state.rehearsals
        .filter(r => r.date && new Date(r.date) < getToday())
        .sort((a, b) => b.date.localeCompare(a.date)); // 過去分は新しい順

    const months = [...new Set(pastAll.map(r => getMonthStr(r.date)))].sort((a, b) => b.localeCompare(a)); 
    
    if (months.length > 0) {
        if (!state.ui.pastMonth || !months.includes(state.ui.pastMonth)) {
            state.ui.pastMonth = months[0];
        }
        renderMonthTabs(months, state.ui.pastMonth, 'past-month-tab-bar', 'past-month-tab-bar-bottom', 'past');
    } else {
        $('past-month-tab-bar').innerHTML = '';
        $('past-month-tab-bar-bottom').innerHTML = '';
    }

    mainContainer.innerHTML = '';
    const currentViewMonth = state.ui.pastMonth || months[0];

    months.forEach(m => {
        const monthDiv = document.createElement('div');
        monthDiv.id = `past-${m}`;
        monthDiv.className = 'sub-tab-content';
        monthDiv.style.display = (m === currentViewMonth) ? 'block' : 'none';

        let contentHtml = '';
        pastAll.filter(r => getMonthStr(r.date) === m).forEach(r => {
            let slotsHtml = '';
            r.slots.forEach(s => {
                const pres = [], abs = [];
                state.members.forEach(member => {
                    const att = state.attendance[member.id]?.[s.id];
                    if (att?.status === 'attend') pres.push(member.name); 
                    else if (att?.status === 'absent') abs.push(`${member.name}${att.note ? ':' + att.note : ''}`);
                });
                slotsHtml += `<div class="slot-row" style="margin-bottom:15px;">
                        <strong>${s.start}〜${s.end}</strong> ${s.menu}
                        <div style="font-size:0.85rem; margin-top:5px;">出席: ${pres.join(', ') || 'なし'}</div>
                        <div style="font-size:0.85rem; color:var(--muted);">欠席: ${abs.join(', ') || 'なし'}</div>
                    </div>`;
            });
            contentHtml += `<div class="card"><div class="section-header"><h2><i class="fa-solid fa-calendar-day"></i> ${r.date} ${r.location}</h2></div>${slotsHtml}</div>`;
        });
        monthDiv.innerHTML = contentHtml;
        mainContainer.appendChild(monthDiv);
    });
}

function renderAdminDropdownSelect(id, type, current, isGroup=false) {
    const key = type === 'location' ? 'locations' : 'menus';
    const list = state.settings[key];
    const isOther = current && !list.includes(current);
    
    let opts = `<option value="">選択..</option>`;
    list.forEach(val => {
        opts += `<option value="${val}" ${val===current?'selected':''}>${val}</option>`;
    });
    opts += `<option value="other" ${isOther?'selected':''}>その他(直接入力)</option>`;

    const handler = isGroup ? 'handleAdminDropdownChangeGroup' : 'handleAdminDropdownChange';
    const manualHandler = isGroup ? 'handleAdminManualInputGroup' : 'handleAdminManualInput';

    return `
        <div class="dropdown-toggle-container flex-fill-input">
            <select class="cute-input flex-fill-input ${type}-input ${isOther?'hidden':''}" 
                    onchange="${handler}('${id}','${type}', this)">
                ${opts}
            </select>
            <input type="text" id="inp-${id}-${type}" 
                   class="cute-input flex-fill-input ${type}-input-text ${isOther?'':'hidden'}" 
                   value="${isOther?current:''}" 
                   placeholder="直接入力">
        </div>
    `;
}

window.handleAdminDropdownChange = (id, type, select) => {
    const inp = $(`inp-${id}-${type}`);
    if (select.value === 'other') { 
        select.classList.add('hidden'); 
        inp.classList.remove('hidden'); 
        inp.focus(); 
    } else { 
        saveAllPractices(true); 
    }
};

window.handleAdminDropdownChangeGroup = (id, type, select) => {
    const inp = $(`inp-${id}-${type}`);
    if (select.value === 'other') { 
        select.classList.add('hidden'); 
        inp.classList.remove('hidden'); 
        inp.focus(); 
    } else { 
        saveAllPractices(true); 
    }
};

window.handleAdminManualInput = () => { saveAllPractices(true); };
window.handleAdminManualInputGroup = () => { saveAllPractices(true); };

function renderMonthTabs(months, currentMonth, containerTopId, containerBottomId, prefix) {
    const top = $(containerTopId), bottom = $(containerBottomId);
    if (!top || !bottom) return;
    top.innerHTML = ''; bottom.innerHTML = '';
    
    months.forEach(m => {
        const btnTop = document.createElement('button');
        btnTop.className = `month-btn ${m === currentMonth ? 'active' : ''}`;
        btnTop.textContent = m.replace('-', '/');
        btnTop.onclick = () => { 
            if (prefix === 'past') { state.ui.pastMonth = m; renderPastRecords(); }
            else if (prefix === 'status') { state.ui.statusMonth = m; renderOverallStatus(); }
        };
        top.appendChild(btnTop);

        const btnBottom = document.createElement('button');
        btnBottom.className = `month-btn ${m === currentMonth ? 'active' : ''}`;
        btnBottom.textContent = m.replace('-', '/');
        btnBottom.onclick = () => { 
            if (prefix === 'past') { state.ui.pastMonth = m; renderPastRecords(); }
            else if (prefix === 'status') { state.ui.statusMonth = m; renderOverallStatus(); }
        };
        bottom.appendChild(btnBottom);
    });
}

window.onload = () => {
    if (window.supabase) { db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); }
    
    // 入力中フラグの管理
    document.addEventListener('focusin', (e) => {
        if (e.target.matches('input') || e.target.matches('select') || e.target.matches('textarea')) {
            isEditing = true;
            isLocked = true;
        }
    });
    document.addEventListener('focusout', (e) => {
        if (e.target.matches('input') || e.target.matches('select') || e.target.matches('textarea')) {
            isEditing = false;
        }
    });

    // スクロール完全固定ガード
    document.addEventListener('focusin', (e) => {
        if (e.target.classList.contains('date-input')) {
            const y = window.scrollY;
            setTimeout(() => { window.scrollTo(0, y); }, 0);
        }
    });

    initAuth(); initTabs(); 

    // イベント委譲：メニュー追加ボタン
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.add-menu-btn');
        if (btn) {
            // 再描画を絶対に発生させない：DOMに直接追加
            const container = btn.closest('.admin-card-inner').querySelector('.menu-container');
            if (container) {
                const newSlotId = crypto.randomUUID();
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = getSlotHtml(newSlotId);
                const row = tempDiv.firstElementChild;
                container.appendChild(row);
            }
        }
    });

    // 項目管理の「追加」ボタンが反応しない場合への対策
    document.addEventListener('click', (e) => {
        if (e.target.id === 'add-location-btn' || e.target.id === 'add-menu-btn') {
            isLocked = false;
            // 本来の処理が終わるのを少し待ってから再ロック
            setTimeout(() => { isLocked = true; }, 100);
        }
    });
};
