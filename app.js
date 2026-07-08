console.log("app.js loaded");
// --- 接続設定 ---
const SUPABASE_URL = 'https://cwepoklweabvpmyfizto.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_3M_jMfBkVJdZNVypnV51ig_oYsn6-0n';

let db; 
let allowUpdate = false; 
let isEditing = false; 
let isLocked = true;   
let isSaving = false;  // 保存中フラグ
let isDirty = false;   // 未保存の変更があるかどうかのフラグ

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

const REACTIONS = [
  "👍",
  "❤️",
  "🙏",
  "🔥",
  "😭",
  "🐰",
  "👏",
  "🎉"
];

let state = {
    auth: { isLoggedIn: false, type: null },
    members: [],
    castMaster: [], // 配役マスター
    selfProfiles: [],
    currentMember: '',
    rehearsals: [], 
    attendance: {}, 
    memos: [],
    reactions: [],
    settings: {
        locations: ['段原公民館', '祇園公民館', '宇品公民館', '青崎公民館', '中央公民館', '己斐公民館', '公民館', '八本松地域センター'],
        menus: ['ワークショップダンス基礎', 'ワークショップダンス', 'ワークショップミュージカル', 'ワークショップ', '美女野獣　稽古', '美女野獣　合唱練習'],
        memoCategories: [],
        visibility: {} // localStorageから読み込む
    },
    ui: {
        currentMonth: '',
        statusMonth: '',
        pastMonth: '',
        editingId: null,
        adminViewList: [],
        adminSortOrder: 'asc'
    }
};

// --- ユーティリティ ---
const $ = (id) => document.getElementById(id);
const getMonthStr = (date) => date ? date.substring(0, 7) : "";
const getToday = () => new Date().setHours(0,0,0,0);
const getTodayStr = () => new Date().toISOString().split('T')[0];

function getWeekday(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return days[d.getDay()];
}

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
        
        // 各種データの並列取得
        const [mRes, pRes, aRes, vRes, locRes, menuRes, memoRes, reactionRes, catRes, castRes, profileRes] = await Promise.all([
            db.from('members').select('*'),
            db.from('practices').select('*').order('sort_order', { ascending: true }),
            db.from('attendance').select('*'),
            db.from('visibility_settings').select('*'),
            db.from('places').select('*').order('sort_order', { ascending: true }),
            db.from('menus').select('*').order('sort_order', { ascending: true }),
            db.from('rehearsal_memos').select('*').order('updated_at', { ascending: false }),
            db.from('memo_reactions').select('*'),
            db.from('memo_categories').select('*').order('sort_order', { ascending: true }),
            db.from('cast_master').select('*').order('sort_order', { ascending: true }),
            db.from('self_profiles').select('*')

        ]);

        if (mRes.error) throw mRes.error;
        if (pRes.error) throw pRes.error;
        if (aRes.error) throw aRes.error;

        if (castRes && castRes.data) {
            state.castMaster = castRes.data;
        } else if (castRes && castRes.error) {
            console.warn("cast_master取得エラー:", castRes.error);
        }

        if (profileRes && profileRes.data) {
            state.selfProfiles = profileRes.data;
        } else if (profileRes && profileRes.error) {
            console.warn("self_profiles取得エラー:", profileRes.error);
        }

        // メンバー情報
        state.members = mRes.data;

        // 一覧を描画
        renderSelfProfiles();

        const member = state.members.find(
            m => String(m.id) === String(state.currentMember)
        );

        const memberNameInput =
            document.getElementById('profile-member-name');

        if (memberNameInput) {
            memberNameInput.value = member ? member.name : '';
        }

        // 稽古日程
        const groups = {};
        pRes.data.forEach(p => {
            const key = `${p.date}_${p.place}`;
            if (!groups[key]) groups[key] = { date: p.date, location: p.place, slots: [] };
            groups[key].slots.push({ id: p.id, start: p.start_time, end: p.end_time, menu: p.menu });
        });
        state.rehearsals = Object.values(groups).map(group => {
            const validSlots = group.slots.filter(s => s.start || s.end || s.menu);
            const emptySlots = group.slots.filter(s => !(s.start || s.end || s.menu));

            // 過去のバグで蓄積したゴーストデータを物理削除する処理
            if (validSlots.length > 0 && emptySlots.length > 0) {
                // 有効データがあるのに空データもある場合、空データは完全なゴミ
                emptySlots.forEach(s => {
                    db.from('practices').delete().eq('id', s.id).then();
                });
                group.slots = validSlots;
            } else if (validSlots.length === 0 && emptySlots.length > 1) {
                // 有効データがなく、空データが複数ある場合、1つ残して他はゴミ
                const keep = emptySlots[0];
                const trash = emptySlots.slice(1);
                trash.forEach(s => {
                    db.from('practices').delete().eq('id', s.id).then();
                });
                group.slots = [keep];
            }
            return group;
        });

        // 出欠情報
        state.attendance = {};
        aRes.data.forEach(a => {
            if (!state.attendance[a.member_id]) state.attendance[a.member_id] = {};
            state.attendance[a.member_id][a.practice_id] = { id: a.id, status: a.status, note: a.note };
        });

        // 閲覧制限設定
        if (!vRes.error && vRes.data) {
            const vis = {};
            vRes.data.forEach(v => {
                vis[v.tab_name] = v.is_locked ? 'protected' : 'public';
            });
            state.settings.visibility = vis;
        }

        // 場所リストの同期
        if (locRes.data && locRes.data.length > 0) {
            state.settings.locations = locRes.data.map(d => d.name);
        }

        // メニューリストの同期
        if (menuRes.data && menuRes.data.length > 0) {
            state.settings.menus = menuRes.data.map(d => d.name);
        }

        // 稽古メモ
        if (memoRes.data) {
            state.memos = memoRes.data;
        }

        if (reactionRes.data) {
            state.reactions = reactionRes.data;
        }

        // メモ区分
        if (catRes.data) {
            state.settings.memoCategories = catRes.data;
        }

        if (state.auth.isLoggedIn) { 
            refreshAdminViewList();
            isLocked = false; 
            renderTab(document.querySelector('.nav-tab.active')?.dataset.tab || 'attendance-input'); 
            updateLockIcons(); // 鍵アイコンを更新
            setupSelectEventListeners();
            isLocked = true;
        }
    } catch (error) { 
        console.error("Supabase読み込みエラー:", error); 
    } finally { 
        $('sync-indicator').classList.add('hidden'); 
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
    // 未保存の変更警告（ページ遷移・リロード時）
    window.addEventListener('beforeunload', (e) => {
        if (isDirty) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    // 日程編集画面での変更をすべて検知
    const rehearsalEdit = $('rehearsal-edit');
    if (rehearsalEdit) {
        rehearsalEdit.addEventListener('input', () => { isDirty = true; });
        rehearsalEdit.addEventListener('change', () => { isDirty = true; });
        rehearsalEdit.addEventListener('click', (e) => {
            if (e.target.closest('button') && !e.target.closest('.save-practices-btn-class')) {
                isDirty = true;
            }
        });
    }

    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            if (isDirty) {
                if (!confirm('保存されていない変更があります。\nこのまま移動すると変更内容が失われますが、よろしいですか？')) {
                    return;
                }
                isDirty = false; // 移動を許可した場合はフラグをリセット
            }

            const id = tab.dataset.tab;
            // タブ切替前に今の入力を保存（管理の日程編集サブタブが表示されている場合のみ）
            const activeTab = document.querySelector('.nav-tab.active')?.dataset.tab;
            const activeSub = document.querySelector('#admin-panel > .admin-menu-tabs > .menu-tab.active')?.dataset.menu;
            if (activeTab === 'admin-panel' && activeSub === 'rehearsal-edit') {
                savePracticesFromDOM();
            }

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

    document.querySelectorAll('#admin-panel > .admin-menu-tabs > .menu-tab').forEach(tab => {
        tab.onclick = () => {
            if (isDirty) {
                if (!confirm('保存されていない変更があります。\nこのまま移動すると変更内容が失われますが、よろしいですか？')) {
                    return;
                }
                isDirty = false;
            }

            // 現在のサブタブが「日程編集」の場合のみ保存
            const currentSub = document.querySelector('#admin-panel > .admin-menu-tabs > .menu-tab.active')?.dataset.menu;
            if (currentSub === 'rehearsal-edit') {
                savePracticesFromDOM();
            }

            refreshAdminViewList();
            document.querySelectorAll('.menu-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('#admin-panel > .sub-tab-content').forEach(c => c.style.display = 'none');
            tab.classList.add('active'); 
            const menuId = tab.dataset.menu;
            if ($(menuId)) $(menuId).style.display = 'block';
            
            isLocked = false;
            renderAdminPanel(); 
            isLocked = true;
        };
    });

    document.querySelectorAll('.attendance-sub-tab').forEach(tab => {

    document.querySelectorAll('.rehearsal-sub-tab').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('.rehearsal-sub-tab')
                .forEach(t => t.classList.remove('active'));

            document.querySelectorAll('#rehearsal-work .rehearsal-sub-content')
                .forEach(c => c.style.display = 'none');

            tab.classList.add('active');

            const menuId = tab.dataset.menu;

            if ($(menuId)) {
                $(menuId).style.display = 'block';
            }

            if (menuId === 'rehearsal-memo-main') {
                renderRehearsalMemos();
            }

            if (menuId === 'rehearsal-cast-main') {
                renderAdminCastMaster();
            }
        };
    });
        tab.onclick = () => {
            document.querySelectorAll('.attendance-sub-tab')
                .forEach(t => t.classList.remove('active'));

            document.querySelectorAll('#attendance-input > .sub-tab-content')
                .forEach(c => c.style.display = 'none');

            tab.classList.add('active');

            const menuId = tab.dataset.menu;

            if ($(menuId)) {
                $(menuId).style.display = 'block';
            }

            if (menuId === 'attendance-status') {
                renderOverallStatus();
            }

            if (menuId === 'attendance-past') {
                renderPastRecords();
            }
        };
    });

    document.querySelectorAll('.add-rehearsal-btn-class').forEach(btn => {
        btn.addEventListener('click', async () => {
            try {
                savePracticesFromDOM();
                const newRow = {
                    date: '',
                    location: '',
                    slots: [{ id: crypto.randomUUID(), start: '', end: '', menu: '' }]
                };
                state.rehearsals.unshift(newRow); // 常に一番上に追加
                refreshAdminViewList();
                renderAdminRehearsals();
            } catch (e) {
                console.error('[追加エラー]', e);
            }
        });
    });

    document.querySelectorAll('.save-practices-btn-class').forEach(btn => {
        btn.addEventListener('click', async () => {
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 保存中...';
            btn.disabled = true;
            try {
                savePracticesFromDOM();
                await saveAllPractices(false);
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        });
    });
}

async function saveAllPractices(silent = false) {
    if (!db) return;
    const dataList = [];
    let currentOrder = 0;
    
    // state.rehearsals から直接保存用データを生成する
    // DBのNOT NULL制約エラーを防ぐため、未入力（空文字）は送信対象から除外（画面には残る）
    const validRehearsals = state.rehearsals.filter(p => p.date && p.date.trim() !== '');

    validRehearsals.forEach(r => {
        
        if (!r.slots || r.slots.length === 0) {
            dataList.push({ id: crypto.randomUUID(), date: r.date || null, place: r.location, start_time: '', end_time: '', menu: '', sort_order: currentOrder++ });
        } else {
            r.slots.forEach(s => {
                dataList.push({
                    id: s.id && s.id !== "undefined" ? s.id : crypto.randomUUID(),
                    date: r.date || null,
                    place: r.location,
                    start_time: s.start || '',
                    end_time: s.end || '',
                    menu: s.menu || '',
                    sort_order: currentOrder++
                });
            });
        }
    });

    if (dataList.length === 0) return;
    
    console.log('[upsert送信]', dataList);
    const { error } = await db.from('practices').upsert(dataList, { onConflict: 'id' });
    if (error) { 
        console.error('[保存エラー]', error); 
        alert('保存エラー: ' + error.message); 
    } else { 
        console.log('[保存成功]');
        if (!silent) {
            isDirty = false; // 保存成功でフラグをリセット
            alert('変更を保存しました！');
            await loadCloud(); 
        }
    }
}

function renderSelfProfiles() {

    const container = document.getElementById('profile-list');

    if (!container) return;

    container.innerHTML = '';

    const members = [...state.members].sort((a, b) => {
        const pa = state.selfProfiles.find(
            p => String(p.member_id) === String(a.id)
        );
        const pb = state.selfProfiles.find(
            p => String(p.member_id) === String(b.id)
        );

        return new Date(pb?.updated_at || 0) - new Date(pa?.updated_at || 0);
    });

    members.forEach(member => {

        const profile = state.selfProfiles.find(
            p => String(p.member_id) === String(member.id)
        );
        const updatedDate = profile?.updated_at
        ? new Date(profile.updated_at).toLocaleDateString('ja-JP')
        : '';
        if (profile) {

            container.innerHTML += `
                <div class="card" style="margin-top:15px;padding:22px;">

                    <div style="
                        display:flex;
                        justify-content:space-between;
                        align-items:flex-start;
                        margin-bottom:4px;">

                        <div style="flex:1; min-width:0;">

                            <div style="
                                font-size:1.35rem;
                                font-weight:700;
                                color:var(--pink-accent);">

                                👤 ${profile.full_name || member.name}

                            </div>

                            <div style="
                                color:#777;
                                font-size:0.9rem;
                                margin-top:4px;">

                                ${profile.reading || ''}

                            </div>

                        </div>

                        <div style="
                            display:flex;
                            flex-direction:column;
                            align-items:flex-end;
                            margin-left:12px;
                            flex-shrink:0;">

                            <button
                                class="edit-profile-btn"
                                data-member-id="${member.id}"
                                title="編集"
                                style="
                                    background:none;
                                    border:none;
                                    color:#d98bb3;
                                    font-size:0.9rem;
                                    cursor:pointer;
                                    padding:4px 6px;
                                    margin-bottom:4px;">

                                <i class="fa-solid fa-pen"></i>

                            </button>

                            <div style="
                                font-size:0.72rem;
                                color:#999;
                                white-space:nowrap;">

                                🕒 ${updatedDate}

                            </div>

                        </div>

                    </div>

                    <hr style="border:none;border-top:1px solid #f6d5e5;margin:18px 0;">

                    <div style="margin-bottom:10px;">
                        🎂 ${
                            profile.birth_month && profile.birth_day
                                ? (
                                    (profile.birth_year
                                        ? profile.birth_year + '年'
                                        : '') +
                                    profile.birth_month + '月' +
                                    profile.birth_day + '日'
                                )
                                : ''
                        }
                    </div>

                    <div style="margin-bottom:10px;">
                        📍 ${profile.area || ''}
                    </div>

                    <div>
                        🚃 ${profile.transportation || ''}
                    </div>

                    <hr style="border:none;border-top:1px solid #f6d5e5;margin:18px 0;">

                    <div style="margin-bottom:10px;">
                        💼 ${profile.daily_life || ''}
                    </div>

                    <div style="margin-bottom:10px;">
                        🎵 ${profile.hobbies || ''}
                    </div>

                    <div>
                        🍙 ${profile.favorite_food || ''}
                    </div>

                    <hr style="border:none;border-top:1px solid #f6d5e5;margin:18px 0;">

                    <div style="font-weight:600;color:var(--pink-accent);margin-bottom:6px;">
                        💬 話せる話題
                    </div>

                    <div style="white-space:pre-wrap;margin-bottom:18px;">${(profile.talk_to_me_about || '').trim()}</div>

                    <div style="font-weight:600;color:var(--pink-accent);margin-bottom:6px;">
                        🩷 ひとこと
                    </div>

                    <div style="
                        white-space:pre-wrap;
                        background:#fff6fa;
                        border-radius:12px;
                        padding:12px;
                        margin-bottom:18px;">${(profile.message || '').trim()}</div>
                    
                </div>
            `;

        } else {

            container.innerHTML += `
                <div class="card" style="margin-top:15px;">

                    <div><strong>メンバー名：</strong>${member.name}</div>

                    <div style="margin:15px 0;color:#888;">

                        まだ自己紹介は登録されていません。

                    </div>

                    <button
                        class="edit-profile-btn puffy-btn"
                        data-member-id="${member.id}">

                        <i class="fa-solid fa-plus"></i> 新規作成

                    </button>

                </div>
            `;
        }

    });
    document.querySelectorAll('.edit-profile-btn').forEach(btn => {

        btn.onclick = () => {

            const memberId = btn.dataset.memberId;

            const profile = state.selfProfiles.find(
                p => String(p.member_id) === String(memberId)
            );

            document.getElementById('profile-form')
                .classList.remove('hidden');

            const member = state.members.find(
                m => String(m.id) === String(memberId)
            );

            document.getElementById('profile-member-name').value =
                member ? member.name : '';

            state.currentProfileMemberId = memberId;

            document.getElementById('profile-name').value =
                profile?.full_name || '';

            document.getElementById('profile-reading').value =
                profile?.reading || '';

            document.getElementById('profile-birth-year').value =
                profile?.birth_year || '';

            document.getElementById('profile-birth-month').value =
                profile?.birth_month || '';

            document.getElementById('profile-birth-day').value =
                profile?.birth_day || '';

            document.getElementById('profile-area').value =
                profile?.area || '';

            document.getElementById('profile-transportation').value =
                profile?.transportation || '';

            document.getElementById('profile-daily-life').value =
                profile?.daily_life || '';

            document.getElementById('profile-hobbies').value =
                profile?.hobbies || '';

            document.getElementById('profile-favorite-food').value =
                profile?.favorite_food || '';

            document.getElementById('profile-talk').value =
                profile?.talk_to_me_about || '';

            document.getElementById('profile-message').value =
                profile?.message || '';

            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });

        };

    });

}

function initializeBirthdaySelects() {

    const month = document.getElementById('profile-birth-month');
    const day = document.getElementById('profile-birth-day');

    if (!month || !day) return;

    month.innerHTML = '<option value="">月</option>';

    for (let i = 1; i <= 12; i++) {
        month.innerHTML += `<option value="${i}">${i}月</option>`;
    }

    day.innerHTML = '<option value="">日</option>';

    for (let i = 1; i <= 31; i++) {
        day.innerHTML += `<option value="${i}">${i}日</option>`;
    }

}

function renderTab(id) {
    if (id === 'attendance-input') renderAttendanceInput();
    if (id === 'overall-status') renderOverallStatus();
    if (id === 'self-profile-tab') renderSelfProfiles();

    if (id === 'rehearsal-work') {

        document.querySelectorAll('#rehearsal-work .rehearsal-sub-content')
            .forEach(c => c.style.display = 'none');

        $('rehearsal-memo-main').style.display = 'block';

        document.querySelectorAll('.rehearsal-sub-tab')
            .forEach(t => t.classList.remove('active'));

        document.querySelector('[data-menu="rehearsal-memo-main"]')
            .classList.add('active');

        renderRehearsalMemos();
    }

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
            
            if (!name) {
                alert('氏名を入力してください');
                return;
            }

            const normalized = name.replace(/\s+/g, '');
            const exists = state.members.some(m => m.name.replace(/\s+/g, '') === normalized);

            if (exists) {
                alert('同じ名前はすでに登録されています');
                return;
            }

            const { data, error } = await db.from('members').insert({ name }).select().single();
            if (error) {
                alert(error.message);
            } else { 
                state.currentMember = data.id;
                saveLocal(); 
                await loadCloud(); 
                $('add-member-form').classList.add('hidden');
                $('new-member-name').value = '';
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
        const trimmedName = newName.trim();
        if (!trimmedName) {
            alert('氏名を入力してください');
            return;
        }

        const normalized = trimmedName.replace(/\s+/g, '');
        const exists = state.members.some(m => m.id !== state.currentMember && m.name.replace(/\s+/g, '') === normalized);

        if (exists) {
            alert('同じ名前はすでに登録されています');
            return;
        }

        await db.from('members').update({ name: trimmedName }).eq('id', state.currentMember);
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

            // 有効なスロット（中身があるもの）だけを抽出
            const validSlots = r.slots.filter(s => s.start || s.end || s.menu);
            // 表示対象を決める：有効なものがあればそれら、なければ最初の一件（空データ）を1行だけ
            const displaySlots = validSlots.length > 0 ? validSlots : [r.slots[0]];

            displaySlots.forEach(s => {
                if (!s) return;
                const data = state.attendance[state.currentMember]?.[s.id] || {id:null, status: null, note: ''};
                const statusStr = data.status === 'attend' ? '出席' : (data.status === 'absent' ? '欠席' : null);
                
                // メニューや時間が空の場合の表示
                const displayTime = (s.start || s.end) ? `<strong>${s.start}〜${s.end}</strong>` : '';
                const displayMenu = s.menu ? `[${s.menu}]` : (displayTime ? '' : '<span style="color:#AAA;">時間・メニュー未設定</span>');

                slotsHtml += `<div class="slot-row" style="margin-bottom:15px; border-bottom:1px dashed #DDD; padding-bottom:15px;">
                        <div style="font-size:0.9rem; margin-bottom:8px;">${displayTime} ${displayMenu}</div>
                        <div class="attendance-toggle">
                            <button class="toggle-btn present ${statusStr==='出席'?'active':''}" onclick="setAttend('${s.id}','attend', this)">出席</button>
                            <button class="toggle-btn absent ${statusStr==='欠席'?'active':''}" onclick="setAttend('${s.id}','absent', this)">欠席</button>
                        </div>
                        <input type="text" class="cute-input note-area" placeholder="備考があれば" value="${data.note || ''}" onchange="setNote('${s.id}',this.value)">
                    </div>`;
            });
            const weekday = getWeekday(r.date);
            const dateDisplay = weekday ? `${r.date}（${weekday}）` : (r.date || '');
            card.innerHTML = `<div class="section-header"><h2><i class="fa-solid fa-calendar-day"></i> ${dateDisplay}　${r.location}</h2></div>${slotsHtml}`;
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
    // 常に全てのデータをセットする（表示の有無は render 側で制御する）
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

function renderAdminPanel() {
    const activeSub = document.querySelector('#admin-panel > .admin-menu-tabs > .menu-tab.active')?.dataset.menu || 'rehearsal-edit';
    if (activeSub === 'rehearsal-edit') {
        // 描画前に最新のadminViewListをセット
        refreshAdminViewList();
        renderAdminRehearsals(); 
    }
    if (activeSub === 'dropdown-edit') renderAdminDropdowns();
    if (activeSub === 'cast-master-edit') renderAdminCastMaster();
    if (activeSub === 'tab-visibility') renderAdminVisibility();
}

function savePracticesFromDOM() {
    const list = $('admin-rehearsal-list');
    // 管理タブの日程編集画面が表示されていない場合はスキップ
    if (!list || list.offsetParent === null) return;

    const cards = list.querySelectorAll('.admin-card-inner');
    console.log('[対象数]', cards.length);

    state.rehearsals = [];

    cards.forEach(card => {
        if (!card) return;
        const date = card.querySelector('.date-input')?.value || '';
        
        // 場所の取得（プルダウン or 直接入力）
        const locSel = card.querySelector('.location-input');
        const locText = card.querySelector('.location-input-text');
        let location = (locSel && locSel.value === 'other') ? (locText?.value || '') : (locSel?.value || '');

        const slots = [];
        card.querySelectorAll('.slots').forEach(slot => {
            const id = slot.dataset.id && slot.dataset.id !== "undefined" ? slot.dataset.id : crypto.randomUUID();
            const start = slot.querySelector('.start-time-input')?.value || '';
            const end = slot.querySelector('.end-time-input')?.value || '';
            
            // メニューの取得（プルダウン or 直接入力）
            const menuSel = slot.querySelector('.menu-input');
            const menuText = slot.querySelector('.menu-input-text');
            let menu = (menuSel && menuSel.value === 'other') ? (menuText?.value || '') : (menuSel?.value || '');

            slots.push({ id, start, end, menu });
        });

        state.rehearsals.push({ date, location, slots });
    });

    console.log('[保存データ]', state.rehearsals);
    refreshAdminViewList();
}

function renderAdminRehearsals() {
    const list = $('admin-rehearsal-list');
    if (!list) return;
    list.innerHTML = '';
    
    const showPastCheck = $('show-past-admin-check');
    const showPast = showPastCheck ? showPastCheck.checked : false;
    const today = getToday();
    
    state.ui.adminViewList.forEach((r, idx) => {
        if (!r) return;
        const card = document.createElement('div');
        card.className = 'admin-card-inner';

        // 過去の日程かつチェックボックスがオフなら、物理的に消さずに隠すだけにする
        // これにより savePracticesFromDOM がデータを読み取れる
        const isPast = r.date && new Date(r.date) < today;
        if (isPast && !showPast) {
            card.style.display = 'none';
        }
        
        // 方針A: 1行（1稽古日）のHTMLをテンプレート文字列で一括生成
        let slotsHtml = '';
        // 空のデータを除外して取得する処理を廃止（ゴースト化を防ぐため、全スロットを表示する）
        let slots = r.slots || [];
        // 1件も有効なデータがない場合のみ、入力用の空行を1つ用意する
        if (slots.length === 0) {
            slots = [{ id: crypto.randomUUID(), start: '', end: '', menu: '' }];
        }
        
        slots.forEach(s => {
            slotsHtml += getSlotHtml(s.id, s.start, s.end, s.menu);
        });

        const weekday = getWeekday(r.date);
        const displayWeekday = weekday ? `（${weekday}）` : '';

        card.innerHTML = `
            <div class="admin-line" style="margin-bottom:10px; align-items:center;">
                <input type="date" class="cute-input date-input" value="${r.date || ''}">
                <span class="weekday-label" style="font-size:0.85rem; color:#888; margin-left:4px;">${displayWeekday}</span>
                <div class="dropdown-toggle-container flex:1" style="margin-left:8px;">
                    ${renderAdminDropdownSelect(idx, 'location', r.location, true)}
                </div>
            </div>
            <div class="menu-container">
                ${slotsHtml}
            </div>
            <div class="card-footer" style="display:flex; gap:6px; margin-top:15px; padding-top:10px; border-top:1px dashed var(--border-dusty); align-items:center;">
                <button class="action-btn-styled add add-menu-btn" type="button" data-date="${r.date}" data-place="${r.location}" style="flex:1;">
                    <i class="fa-solid fa-plus"></i> 追加
                </button>
                <button class="action-btn-styled sort-menu-btn" type="button" style="flex:0 0 auto; width:65px; background:#fff; color:var(--pink-accent); border:1px solid var(--pink-accent); font-size:0.75rem; font-weight:bold;">時間順</button>
                <button class="action-btn-styled delete-day-btn" type="button" onclick="delPracticeGroup('${r.date || ''}','${r.location || ''}', this)" style="flex:0 0 auto; width:65px; background:#f0f0f0; color:#888; border:none; font-size:0.75rem;">
                    <i class="fa-solid fa-trash-can"></i> 削除
                </button>
                <button class="action-btn-styled move-up-btn" type="button" style="flex:0 0 36px;"><i class="fa-solid fa-arrow-up"></i></button>
                <button class="action-btn-styled move-down-btn" type="button" style="flex:0 0 36px;"><i class="fa-solid fa-arrow-down"></i></button>
            </div>
        `;
        list.appendChild(card);
    });

    // 追加された入力欄に対しても自動保存などのイベントをバインドする
    setupSelectEventListeners();
}

// 1つのスロット（時間枠）のHTMLを生成するヘルパー（一貫性のため）
function getSlotHtml(id, start = '', end = '', menu = '') {
    return `
        <div class="menu-row" style="margin-bottom:10px;">
            <div class="admin-line slots" data-id="${id}" style="margin-bottom:5px; display:flex; align-items:center; gap:6px;">
                <select class="cute-input start-time-input" style="flex:0 0 85px;">${getTimeOpts(start)}</select>
                <span style="color:#ccc;">-</span>
                <select class="cute-input end-time-input" style="flex:0 0 85px;">${getTimeOpts(end)}</select>
                <div style="flex:1; min-width:0;">
                    ${renderAdminDropdownSelect(id, 'menu', menu)}
                </div>
                <button class="del-row-btn" type="button" onclick="deleteMenuRow(this)" style="background:none; border:none; color:#ccc; padding:5px; font-size:1.2rem; cursor:pointer; flex-shrink:0;">
                    &times;
                </button>
                <button class="menu-up-btn" type="button" style="background:none; border:none; color:#888; padding:5px; font-size:1rem; cursor:pointer; flex-shrink:0;">↑</button>
                <button class="menu-down-btn" type="button" style="background:none; border:none; color:#888; padding:5px; font-size:1rem; cursor:pointer; flex-shrink:0;">↓</button>
            </div>
        </div>`;
}

window.deleteMenuRow = async (btn) => {
    const row = btn.closest('.menu-row');
    if (!row) return;
    
    const slotId = row.querySelector('.slots')?.dataset.id;
    row.remove();
    
    // 1. クラウドから物理削除（IDがある場合のみ）
    if (slotId && db) {
        try {
            await db.from('practices').delete().eq('id', slotId);
        } catch (err) {
            console.error('削除失敗:', err);
        }
    }
    
    // 2. 状態を同期
    savePracticesFromDOM();
};

const handleAdminChange = () => {
    if (isLocked) return;
    savePracticesFromDOM();
};

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

window.handleAdminDropdownChange = (id, type, select) => {
    const inp = $(`inp-${id}-${type}`);
    if (select.value === 'other') { 
        select.classList.add('hidden'); 
        inp.classList.remove('hidden'); 
        inp.focus(); 
    }
};

window.handleAdminDropdownChangeGroup = (id, type, select) => {
    const inp = $(`inp-${id}-${type}`);
    if (select.value === 'other') { 
        select.classList.add('hidden'); 
        inp.classList.remove('hidden'); 
        inp.focus(); 
    }
};

window.handleAdminManualInput = () => { /* 自動保存は廃止 */ };
window.handleAdminManualInputGroup = () => { /* 自動保存は廃止 */ };

window.delPractice = async (id) => { 
    if(confirm('この枠を削除しますか？')) { 
        const { error } = await db.from('practices').delete().eq('id', id); 
        if (error) alert(error.message); else await loadCloud(); 
    } 
};
window.delPracticeGroup = async (date, place, btn) => { 
    if(confirm(`${date ? date + ' の' : 'この'}稽古日をすべて削除しますか？\n（※登録済みのデータは即座に削除されます）`)) { 
        if (date && db) {
            const { error } = await db.from('practices').delete().eq('date', date).eq('place', place); 
            if (error) {
                alert(error.message);
                return;
            }
        }
        
        // 画面全体のリロードはせず、対象の枠のみを削除して状態を同期
        if (btn) {
            const card = btn.closest('.admin-card-inner');
            if (card) card.remove();
        }
        isDirty = true;
        savePracticesFromDOM();
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
    if ($(btnId)) $(btnId).onclick = async () => { 
        const v = $(inputId).value.trim(); 
        if(v) { 
            state.settings[key].push(v); 
            $(inputId).value=''; 
            await syncSettingsList(key);
            
            isLocked = false;
            renderAdminDropdowns(); 
            isLocked = true;
        } 
    };
}

// DBへの同期保存
async function syncSettingsList(key) {
    if (!db) return;
    const tableName = key === 'locations' ? 'places' : 'menus';
    const dataArray = state.settings[key].map((name, index) => ({
        name: name,
        sort_order: index
    }));

    try {
        $('sync-indicator').classList.remove('hidden');
        // シンプルにするため、一旦全削除してから入れ直す（差分管理より確実）
        await db.from(tableName).delete().neq('name', '___NON_EXISTENT___');
        const { error } = await db.from(tableName).insert(dataArray);
        if (error) throw error;
        console.log(`[同期完了] ${tableName} がDBに保存されました`);
    } catch (err) {
        console.error(`[同期失敗] ${tableName}:`, err);
        alert('項目の保存に失敗しました。');
    } finally {
        $('sync-indicator').classList.add('hidden');
    }
}

window.editItem = async (key, i) => { 
    const oldVal = state.settings[key][i]; 
    const newVal = prompt('項目を編集:', oldVal); 
    if (newVal && newVal !== oldVal) { 
        state.settings[key][i] = newVal.trim(); 
        await syncSettingsList(key);
        
        isLocked = false;
        renderAdminDropdowns(); 
        isLocked = true;
    } 
};
window.moveItem = async (key, i, dir) => { 
    const arr = state.settings[key]; 
    const target = i + dir; 
    if (target >= 0 && target < arr.length) { 
        [arr[i], arr[target]] = [arr[target], arr[i]]; 
        await syncSettingsList(key);
        
        isLocked = false;
        renderAdminDropdowns(); 
        isLocked = true;
    } 
};
window.delItem = async (key, i) => { 
    if (confirm('この項目を削除しますか？')) {
        state.settings[key].splice(i, 1); 
        await syncSettingsList(key);
        
        isLocked = false;
        renderAdminDropdowns(); 
        isLocked = true;
    }
};

function renderAdminVisibility() {
    const container = $('visibility-controls-container');
    if (!container) return;

    container.innerHTML = '';

    // 画面上のメインタブを自動取得
    const tabs = Array.from(document.querySelectorAll('nav .nav-tab'))
        .map(btn => {
            const label = btn.innerText
                .replace('🔒', '')
                .replace(/\s+/g, ' ')
                .trim()
                .split(' ')
                .pop();

            return {
                id: btn.dataset.tab,
                label: label
            };
        });

    tabs.forEach(tab => {
        const cur = state.settings.visibility[tab.id] || 'public';

        const div = document.createElement('div');
        div.style.cssText =
            "display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;";

        div.innerHTML = `
            <span style="font-size:0.9rem;">${tab.label}</span>
            <select class="cute-input visibility-select"
                    data-tab-id="${tab.id}"
                    style="width:100px; margin:0;">
                <option value="public" ${cur === 'public' ? 'selected' : ''}>公開</option>
                <option value="protected" ${cur === 'protected' ? 'selected' : ''}>制限中</option>
            </select>
        `;

        div.querySelector('.visibility-select').addEventListener('change', e => {
            window.updateVis(e.target.dataset.tabId, e.target.value);
        });

        container.appendChild(div);
    });
}

window.updateVis = async (id, val) => {
    console.log(`[保存開始] タブ: ${id}, 状態: ${val}`);
    state.settings.visibility[id] = val;
    updateLockIcons();
    
    if (db) {
        try {
            $('sync-indicator').classList.remove('hidden');
            const { error } = await db.from('visibility_settings').upsert({
                tab_name: id,
                is_locked: (val === 'protected')
            }, { onConflict: 'tab_name' });
            
            if (error) {
                console.error('[Supabase保存エラー]', error);
                alert('保存に失敗しました: ' + error.message);
            } else {
                console.log('[保存完了] DBに反映されました');
            }
        } catch (err) {
            console.error('[例外発生]', err);
        } finally {
            $('sync-indicator').classList.add('hidden');
        }
    } else {
        console.warn('[警告] DB接続が確立されていません');
    }
};

function getTimeOpts(s) {
    let h = `<option value="" ${s===''?'selected':''}>選択..</option>`;
    for(let i=8; i<=22; i++) { ['00','15','30','45'].forEach(m => { const t = `${i.toString().padStart(2,'0')}:${m}`; h += `<option value="${t}" ${t===s?'selected':''}>${t}</option>`; }); }
    return h;
}

function renderOverallStatus() {
    const mainContainer = $('overall-status-container'); 
    if (!mainContainer) return;

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
            
            const validSlots = r.slots.filter(s => s.start || s.end || s.menu);
            const displaySlots = validSlots.length > 0 ? validSlots : [r.slots[0]];

            displaySlots.forEach(s => {
                if (!s) return;
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

                slotsHtml += `<div class="slot-row overall-slot-clickable" style="margin-bottom:20px; border-bottom:1px dashed #DDD; padding:10px 15px; border-radius:12px;" onclick="showCastStatusModal('${s.id}', '${r.date}', '${s.menu}')">
                        <div style="font-size:0.9rem; margin-bottom:12px; color:var(--pink-dark); display:flex; justify-content:space-between; align-items:center;">
                            <strong>${s.start}〜${s.end} [${s.menu}]</strong>
                            <span style="font-size:0.75rem; color:var(--pink-accent); font-weight:bold;"><i class="fa-solid fa-users-viewfinder"></i> キャスト成立状況</span>
                        </div>
                        <div class="status-group"><div class="absent-title">【出席者】</div><div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:12px;">${pres.map(n => `<span class="status-tag present">${n}</span>`).join('') || 'なし'}</div></div>
                        <div class="status-group"><div class="absent-title">【欠席者】</div><div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:12px;">${abs.map(n => `<span class="status-tag absent">${n}</span>`).join('') || 'なし'}</div></div>
                        <div class="status-group"><div class="absent-title" style="color:#888;">【備考のみ】</div><div style="display:flex; flex-wrap:wrap; gap:5px;">${notesOnly.map(n => `<span class="status-tag" style="background-color:#EEE; color:#666; border:1px solid #DDD;">${n}</span>`).join('') || 'なし'}</div></div>
                    </div>`;
            });
            const weekday = getWeekday(r.date);
            const dateDisplay = weekday ? `${r.date}（${weekday}）` : (r.date || '');
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `<div class="section-header"><h2><i class="fa-solid fa-star"></i> ${dateDisplay}　${r.location}</h2></div>${slotsHtml}`;
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
        monthDiv.className = 'sub-tab-content month-block';
        monthDiv.style.display = (m === currentViewMonth) ? 'block' : 'none';

        let contentHtml = `
            <div style="display:flex; align-items:center; gap:8px; margin:10px 0 15px 12px; font-size:0.9rem; color:var(--text-sub);">
                <input type="checkbox" class="month-checkbox" style="width:18px; height:18px; cursor:pointer;">
                <span style="font-weight:bold;">${m.replace('-', '/')} すべて選択</span>
            </div>
        `;
        pastAll.filter(r => getMonthStr(r.date) === m).forEach(r => {
            let slotsHtml = '';

            const validSlots = r.slots.filter(s => s.start || s.end || s.menu);
            const displaySlots = validSlots.length > 0 ? validSlots : [r.slots[0]];

            displaySlots.forEach(s => {
                if (!s) return;
                const pres = [], abs = [];
                state.members.forEach(member => {
                    const att = state.attendance[member.id]?.[s.id];
                    if (att?.status === 'attend') pres.push(member.name); 
                    else if (att?.status === 'absent') abs.push(`${member.name}${att.note ? ':' + att.note : ''}`);
                });

                const displayTime = (s.start || s.end) ? `<strong>${s.start}〜${s.end}</strong>` : '';
                const displayMenu = s.menu ? s.menu : (displayTime ? '' : '<span style="color:#AAA;">未設定</span>');

                slotsHtml += `<div class="slot-row" style="margin-bottom:15px;">
                        ${displayTime} ${displayMenu}
                        <div style="font-size:0.85rem; margin-top:5px;">出席: ${pres.join(', ') || 'なし'}</div>
                        <div style="font-size:0.85rem; color:var(--muted);">欠席: ${abs.join(', ') || 'なし'}</div>
                    </div>`;
            });
            const weekday = getWeekday(r.date);
            const dateDisplay = weekday ? `${r.date}（${weekday}）` : (r.date || '');
            contentHtml += `
                <div class="card practice-item" data-date="${r.date}" data-place="${r.location}">
                    <div style="display:flex; align-items:flex-start; gap:12px;">
                        <input type="checkbox" class="select-checkbox" style="width:20px; height:20px; margin-top:4px; flex-shrink:0; cursor:pointer;">
                        <div style="flex:1;" class="past-card-content">
                            <div class="section-header" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                                <h2 style="flex:1;"><i class="fa-solid fa-calendar-day"></i> ${dateDisplay} ${r.location}</h2>
                                <button class="puffy-btn gray puffy-btn-sm" onclick="editPastCard('${r.date}', '${r.location}', this.closest('.practice-item'))" style="padding:4px 10px; font-size:0.75rem; margin-left:10px;">編集</button>
                            </div>
                            <div class="view-mode-content">
                                ${slotsHtml}
                            </div>
                        </div>
                    </div>
                </div>`;
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
        <div class="dropdown-toggle-container" style="display:flex; flex:1; min-width:0; position:relative;">
            <select class="cute-input ${type}-input ${isOther?'hidden':''}" 
                    id="sel-${id}-${type}"
                    style="flex:1; min-width:0;"
                    onchange="${handler}('${id}','${type}', this)">
                ${opts}
            </select>
            <div id="wrapper-${id}-${type}" class="manual-input-wrapper ${isOther?'':'hidden'}" style="display:flex; flex:1; gap:4px; min-width:0;">
                <input type="text" id="inp-${id}-${type}" 
                       class="cute-input ${type}-input-text" 
                       style="flex:1; min-width:0;"
                       value="${isOther?current:''}" 
                       placeholder="直接入力"
                       onchange="savePracticesFromDOM()">
                <button type="button" class="icon-btn-sm" style="width:36px; height:44px; flex-shrink:0; border-radius:12px;" 
                        onclick="toggleDropdownBack('${id}', '${type}', this)">
                    <i class="fa-solid fa-list-ul"></i>
                </button>
            </div>
        </div>
    `;
}

window.handleAdminDropdownChange = (id, type, select) => {
    const wrapper = $(`wrapper-${id}-${type}`);
    if (select.value === 'other') { 
        select.classList.add('hidden'); 
        wrapper.classList.remove('hidden'); 
        const inp = $(`inp-${id}-${type}`);
        if(inp) inp.focus(); 
    } else { 
        savePracticesFromDOM(); 
    }
};

window.handleAdminDropdownChangeGroup = (id, type, select) => {
    const wrapper = $(`wrapper-${id}-${type}`);
    if (select.value === 'other') { 
        select.classList.add('hidden'); 
        wrapper.classList.remove('hidden'); 
        const inp = $(`inp-${id}-${type}`);
        if(inp) inp.focus(); 
    } else { 
        savePracticesFromDOM(); 
    }
};

// 手入力からリストに戻る処理
window.toggleDropdownBack = (id, type, btn) => {
    const select = $(`sel-${id}-${type}`);
    const wrapper = $(`wrapper-${id}-${type}`);
    const input = $(`inp-${id}-${type}`);
    
    if (select && wrapper) {
        if (input) input.value = ''; // 入力をクリア
        select.value = ''; // 選択もクリア
        wrapper.classList.add('hidden');
        select.classList.remove('hidden');
        savePracticesFromDOM();
    }
};

window.handleAdminManualInput = () => { savePracticesFromDOM(); };
window.handleAdminManualInputGroup = () => { savePracticesFromDOM(); };

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

    // 稽古メモ用イベントリスナー
    const toggleMemoBtn = $('toggle-memo-form-btn');
    if (toggleMemoBtn) {

        const toggleMemo = () => {
            const container = $('memo-form-container');
            container.classList.toggle('hidden');

            const opened = !container.classList.contains('hidden');

            toggleMemoBtn.querySelector('i').className =
                opened ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';

            $('toggle-memo-title').textContent =
                opened ? '△ 稽古メモを登録' : '▽ 稽古メモを登録';
        };

        toggleMemoBtn.addEventListener('click', toggleMemo);
        $('toggle-memo-title').addEventListener('click', toggleMemo);

        // 初期状態は閉じる
        $('memo-form-container').classList.add('hidden');
        toggleMemoBtn.querySelector('i').className = 'fa-solid fa-chevron-down';
    }

    $('filter-memo-category')?.addEventListener('change', renderRehearsalMemos);
    $('filter-memo-keyword')?.addEventListener('input', renderRehearsalMemos);
    $('sort-memo-order')?.addEventListener('change', renderRehearsalMemos);
    $('save-memo-btn')?.addEventListener('click', saveMemo);
    $('cancel-memo-btn')?.addEventListener('click', resetMemoForm);

    // 区分リスト管理用
    $('add-memo-category-btn')?.addEventListener('click', addMemoCategory);

    document.querySelectorAll('.memo-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {

            document.querySelectorAll('.memo-tab-btn')
                .forEach(b => b.classList.remove('active'));

            document.querySelectorAll('#rehearsal-memo .sub-tab-content')
                .forEach(c => c.style.display = 'none');

            btn.classList.add('active');

            const target = document.getElementById(btn.dataset.menu);

            if (target) {
                target.style.display = 'block';
            }
        });
    });

    // キャスト成立状況モーダルの閉じるボタン
    $('close-cast-status-btn')?.addEventListener('click', () => {
        $('cast-status-overlay').classList.add('hidden');
    });
    $('cast-status-overlay')?.addEventListener('click', (e) => {
        if (e.target === $('cast-status-overlay')) {
            $('cast-status-overlay').classList.add('hidden');
        }
    });

    // 配役マスター追加・保存ボタンのイベント委譲・バインド
    $('add-cast-btn')?.addEventListener('click', () => {
        const list = $('admin-cast-list');
        if (!list) return;
        const newRow = document.createElement('div');
        newRow.className = 'admin-line cast-master-row';
        newRow.style.cssText = "background:#FFF; border:1px solid var(--border-dusty); border-radius:12px; padding:12px 10px; margin-bottom:10px; display:flex; flex-wrap:wrap; gap:8px; align-items:center;";
        newRow.dataset.id = 'new_' + crypto.randomUUID();
        
        let memberOpts = '<option value="">キャストを選択</option>';
        state.members.forEach(m => {
            memberOpts += `<option value="${m.name}">${m.name}</option>`;
        });

        newRow.innerHTML = `
            <select class="cute-input cast-name-select" style="flex:1; min-width:120px;">${memberOpts}</select>
            <select class="cute-input cast-group-select" style="width:90px;">
                <option value="A">A組</option>
                <option value="B">B組</option>
                <option value="C">C組</option>
                <option value="全組">全組</option>
                <option value="未定">未定</option>
            </select>
            <input type="text" class="cute-input cast-role-input" placeholder="役名" style="flex:1.5; min-width:140px;">
            <div style="display:flex; gap:4px; align-items:center;">
                <button type="button" class="icon-btn-sm cast-row-up-btn" style="width:36px; height:36px;"><i class="fa-solid fa-chevron-up"></i></button>
                <button type="button" class="icon-btn-sm cast-row-down-btn" style="width:36px; height:36px;"><i class="fa-solid fa-chevron-down"></i></button>
                <button type="button" class="del-row-btn" style="background:none; border:none; color:#ccc; padding:5px; font-size:1.2rem; cursor:pointer;" onclick="this.closest('.cast-master-row').remove()">&times;</button>
            </div>
        `;
        list.insertBefore(newRow, list.firstChild);
    });

    $('save-casts-btn')?.addEventListener('click', async () => {
        await saveCastMasterFromDOM();
    });
    $('save-casts-btn-bottom')?.addEventListener('click', async () => {
        await saveCastMasterFromDOM();
    });

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

    const saveProfileBtn = document.getElementById('save-profile-btn');

    if (saveProfileBtn) {

        saveProfileBtn.onclick = async () => {

            if (!state.currentProfileMemberId) {
                alert('メンバーを選択してください。');
                return;
            }

            const profileData = {

                member_id: state.currentProfileMemberId,

                full_name: document.getElementById('profile-name').value,

                reading: document.getElementById('profile-reading').value,

                birth_year:
                    document.getElementById('profile-birth-year').value || null,

                birth_month:
                    document.getElementById('profile-birth-month').value || null,

                birth_day:
                    document.getElementById('profile-birth-day').value || null,

                area:
                    document.getElementById('profile-area').value,

                transportation:
                    document.getElementById('profile-transportation').value,

                daily_life:
                    document.getElementById('profile-daily-life').value,

                hobbies: document.getElementById('profile-hobbies').value,

                favorite_food: document.getElementById('profile-favorite-food').value,
        
                talk_to_me_about: document.getElementById('profile-talk').value,

                message: document.getElementById('profile-message').value

            };

            const { error } = await db
                .from('self_profiles')
                .upsert(profileData);

            if (error) {
                alert(error.message);
                return;
            }

            alert('保存しました');

            document.getElementById('profile-form')
                .classList.add('hidden');

            await loadCloud();

        };
    }

    // イベント委譲：メニュー追加ボタン
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.add-menu-btn');
        if (btn) {
            // 再描画を絶対に発生させない：DOMに直接追加
            const container = btn.closest('.admin-card-inner').querySelector('.menu-container');
            if (container) {
                // 直前のメニューの終了時刻を取得して、次の開始時刻の初期値にする
                const rows = container.querySelectorAll('.menu-row');
                let lastEnd = '';
                if (rows.length > 0) {
                    const lastRow = rows[rows.length - 1];
                    lastEnd = lastRow.querySelector('.end-time-input')?.value || '';
                }

                const newSlotId = crypto.randomUUID();
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = getSlotHtml(newSlotId, lastEnd);
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

    // 手動並び替えボタン（↑ ↓）
    document.addEventListener('click', (e) => {
        const upBtn = e.target.closest('.move-up-btn');
        const downBtn = e.target.closest('.move-down-btn');
        const castUpBtn = e.target.closest('.cast-row-up-btn');
        const castDownBtn = e.target.closest('.cast-row-down-btn');

        if (upBtn || downBtn) {
            const card = e.target.closest('.admin-card-inner');
            if (!card) return;
            const parent = card.parentNode;
            if (upBtn) {
                const prev = card.previousElementSibling;
                if (prev) parent.insertBefore(card, prev);
            } else {
                const next = card.nextElementSibling;
                if (next) parent.insertBefore(next, card);
            }
            // 並び替え後に状態を保存
            savePracticesFromDOM();
        } else if (castUpBtn || castDownBtn) {
            const row = e.target.closest('.cast-master-row');
            if (!row) return;
            const parent = row.parentNode;
            if (castUpBtn) {
                const prev = row.previousElementSibling;
                if (prev && prev.classList.contains('cast-master-row')) parent.insertBefore(row, prev);
            } else {
                const next = row.nextElementSibling;
                if (next && next.classList.contains('cast-master-row')) parent.insertBefore(next, row);
            }
            isDirty = true;
        }
    });

    // メニュー行の手動並び替えボタン（↑ ↓）
    document.addEventListener('click', (e) => {
        const menuUpBtn = e.target.closest('.menu-up-btn');
        const menuDownBtn = e.target.closest('.menu-down-btn');
        if (menuUpBtn || menuDownBtn) {
            const row = e.target.closest('.menu-row');
            if (!row) return;
            const container = row.parentElement;
            if (menuUpBtn) {
                const prev = row.previousElementSibling;
                if (prev) container.insertBefore(row, prev);
            } else {
                const next = row.nextElementSibling;
                if (next) container.insertBefore(next, row);
            }
            savePracticesFromDOM();
        }
    });

    // ワンクリック自動並び替え：全体を日付順
    document.addEventListener('click', (e) => {
        const sortPracticeBtn = e.target.closest('.sort-practice-btn');
        if (sortPracticeBtn) {
            const order = sortPracticeBtn.dataset.order || 'asc';
            state.ui.adminSortOrder = order;
            savePracticesFromDOM();
            state.rehearsals.sort((a, b) => {
                if (order === 'desc') {
                    // 降順の場合は、未入力を一番下にするため 0000-01-01 扱いにする
                    const daDesc = a.date ? new Date(a.date) : new Date('0000-01-01');
                    const dbDesc = b.date ? new Date(b.date) : new Date('0000-01-01');
                    return dbDesc - daDesc;
                } else {
                    // 昇順の場合は、未入力を一番下にするため 9999-12-31 扱いにする
                    const daAsc = a.date ? new Date(a.date) : new Date('9999-12-31');
                    const dbAsc = b.date ? new Date(b.date) : new Date('9999-12-31');
                    return daAsc - dbAsc;
                }
            });
            refreshAdminViewList();
            renderAdminRehearsals();
        }
    });

    // ワンクリック自動並び替え：同日内のメニューを時間順
    document.addEventListener('click', (e) => {
        const sortMenuBtn = e.target.closest('.sort-menu-btn');
        if (sortMenuBtn) {
            const item = sortMenuBtn.closest('.admin-card-inner');
            if (!item) return;
            const container = item.querySelector('.menu-container');
            if (!container) return;
            const rows = Array.from(container.querySelectorAll('.menu-row'));
            
            rows.sort((a, b) => {
                const ta = a.querySelector('.start-time-input')?.value || 'zz:zz';
                const tb = b.querySelector('.start-time-input')?.value || 'zz:zz';
                return ta.localeCompare(tb);
            });
            
            rows.forEach(row => container.appendChild(row));
            savePracticesFromDOM();
        }
    });

    // 管理タブ：過去分表示切り替えの連動
    document.addEventListener('change', (e) => {
        if (e.target.id === 'show-past-admin-check') {
            renderAdminPanel();
        }
    });

    // 管理タブ：日付入力変更時に曜日を連動表示
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('date-input')) {
            const label = e.target.nextElementSibling;
            if (label && label.classList.contains('weekday-label')) {
                const w = getWeekday(e.target.value);
                label.textContent = w ? `（${w}）` : '';
            }
        }
    });

    // 過去タブ：月単位のチェック連動
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('month-checkbox')) {
            const block = e.target.closest('.month-block');
            const items = block.querySelectorAll('.select-checkbox');
            items.forEach(cb => cb.checked = e.target.checked);
        }
    });

    // 過去タブ：選択削除の実行
    const delPastBtn = $('delete-selected-past-btn');
    if (delPastBtn) {

        if (state.auth?.type !== 'admin') {
            delPastBtn.style.display = 'none';
        }

        delPastBtn.onclick = async () => {
            const checked = document.querySelectorAll('.select-checkbox:checked');
            if (checked.length === 0) {
                alert('削除する項目を選択してください。');
                return;
            }

            if (confirm(`${checked.length}件の稽古日程を削除しますか？\n（この操作は取り消せません）`)) {
                try {
                    $('sync-indicator').classList.remove('hidden');
                    for (const cb of checked) {
                        const item = cb.closest('.practice-item');
                        const date = item.dataset.date;
                        const place = item.dataset.place;
                        // 日付と場所が一致するスロットをすべて削除
                        await db.from('practices').delete().eq('date', date).eq('place', place);
                    }
                    await loadCloud();
                    alert('選択した項目を削除しました。');
                } catch (err) {
                    console.error(err);
                    alert('削除中にエラーが発生しました。');
                } finally {
                    $('sync-indicator').classList.add('hidden');
                }
            }
        };
    }
};

// --- 過去タブ編集機能 ---

window.editPastCard = (date, location, cardElement) => {
    const contentArea = cardElement.querySelector('.past-card-content');
    const rehearsal = state.rehearsals.find(r => r.date === date && r.location === location);
    if (!rehearsal) return;

    let editHtml = `
        <div class="admin-line" style="margin-bottom:15px; gap:8px;">
            <input type="date" class="cute-input edit-date" value="${date}" style="flex:1;">
            <div style="flex:1;">
                ${renderAdminDropdownSelect('past-edit-loc', 'location', location)}
            </div>
        </div>
        <div class="edit-slots-container">
    `;

    rehearsal.slots.forEach(s => {
        // 全メンバーの現在の状態を取得
        let presentTags = '', absentTags = '', noneTags = '';
        let noteInputs = '';

        state.members.forEach(m => {
            const att = state.attendance[m.id]?.[s.id] || { status: null, note: '' };
            const status = att.status; // 'attend', 'absent', null
            const tagHtml = `<span class="status-tag ${status === 'attend' ? 'present' : (status === 'absent' ? 'absent' : 'note-only')} edit-member-tag" 
                                  data-member-id="${m.id}" 
                                  data-status="${status || 'none'}" 
                                  onclick="toggleMemberStatus(this)"
                                  style="cursor:pointer; user-select:none;">${m.name}</span>`;
            
            if (status === 'attend') presentTags += tagHtml;
            else if (status === 'absent') absentTags += tagHtml;
            else noneTags += tagHtml;

            // 備考入力欄（全員分作成し、必要に応じて値を保持）
            noteInputs += `
                <div class="edit-note-row" style="display:flex; align-items:center; gap:8px; margin-bottom:5px;">
                    <span style="font-size:0.75rem; width:60px; flex-shrink:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${m.name}</span>
                    <input type="text" class="cute-input member-note-input" data-member-id="${m.id}" placeholder="備考" value="${att.note || ''}" style="flex:1; padding:4px 8px; font-size:0.75rem;">
                </div>`;
        });

        editHtml += `
            <div class="admin-line slots" data-id="${s.id}" style="background:#fff; padding:12px; border:1px solid #eee; border-radius:12px; margin-bottom:20px; display:block;">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:15px; border-bottom:1px solid #f0f0f0; padding-bottom:10px;">
                    <select class="cute-input edit-start" style="width:85px; font-size:0.8rem;">${getTimeOpts(s.start)}</select>
                    <span>-</span>
                    <select class="cute-input edit-end" style="width:85px; font-size:0.8rem;">${getTimeOpts(s.end)}</select>
                    <div style="flex:1;">
                        ${renderAdminDropdownSelect(s.id, 'menu', s.menu)}
                    </div>
                </div>
                
                <div class="attendance-edit-section" style="font-size:0.85rem;">
                    <div class="status-group"><div class="absent-title">【出席】 (クリックで切替)</div><div class="present-list" style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:10px; min-height:20px; background:#fdf8fa; border-radius:8px; padding:5px;">${presentTags}</div></div>
                    <div class="status-group"><div class="absent-title">【欠席】</div><div class="absent-list" style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:10px; min-height:20px; background:#f9f9f9; border-radius:8px; padding:5px;">${absentTags}</div></div>
                    <div class="status-group"><div class="absent-title" style="color:#AAA;">【未選択 / 備考のみ】</div><div class="none-list" style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:15px; min-height:20px; background:#fcfcfc; border-radius:8px; padding:5px;">${noneTags}</div></div>
                    
                    <div class="note-edit-toggle" onclick="this.nextElementSibling.classList.toggle('hidden')" style="color:var(--pink-accent); font-size:0.75rem; cursor:pointer; margin-bottom:5px;"><i class="fa-solid fa-pen-to-square"></i> 備考を編集する</div>
                    <div class="note-edit-area hidden" style="max-height:150px; overflow-y:auto; border:1px solid #eee; padding:8px; border-radius:8px; background:#fff;">
                        ${noteInputs}
                    </div>
                </div>
            </div>
        `;
    });

    editHtml += `
        </div>
        <div style="display:flex; gap:10px; margin-top:15px;">
            <button class="puffy-btn pink puffy-btn-sm" style="flex:1;" onclick="savePastCard('${date}', '${location}', this.closest('.practice-item'))">保存して戻る</button>
            <button class="puffy-btn gray puffy-btn-sm" style="flex:1;" onclick="renderPastRecords()">キャンセル</button>
        </div>
    `;

    contentArea.innerHTML = editHtml;
};

window.toggleMemberStatus = (tag) => {
    const currentStatus = tag.dataset.status; // 'attend', 'absent', 'none'
    const parent = tag.closest('.attendance-edit-section');
    
    let nextStatus = 'none';
    if (currentStatus === 'none') nextStatus = 'attend';
    else if (currentStatus === 'attend') nextStatus = 'absent';
    else if (currentStatus === 'absent') nextStatus = 'none';

    tag.dataset.status = nextStatus;
    tag.classList.remove('present', 'absent', 'note-only');
    
    const targetListClass = nextStatus === 'attend' ? 'present-list' : (nextStatus === 'absent' ? 'absent-list' : 'none-list');
    const targetClass = nextStatus === 'attend' ? 'present' : (nextStatus === 'absent' ? 'absent' : 'note-only');
    
    tag.classList.add(targetClass);
    parent.querySelector(`.${targetListClass}`).appendChild(tag);
};

window.savePastCard = async (oldDate, oldLoc, cardElement) => {
    if (!db) return;
    
    const newDate = cardElement.querySelector('.edit-date').value;
    const locSel = cardElement.querySelector('.location-input');
    const locText = cardElement.querySelector('.location-input-text');
    let newLoc = (locSel && locSel.value === 'other') ? (locText?.value || '') : (locSel?.value || '');

    const practiceDataList = [];
    const attendanceDataList = [];
    const slotDivs = cardElement.querySelectorAll('.slots');
    
    slotDivs.forEach(div => {
        const practiceId = div.dataset.id;
        const start = div.querySelector('.edit-start').value;
        const end = div.querySelector('.edit-end').value;
        const menuSel = div.querySelector('.menu-input');
        const menuText = div.querySelector('.menu-input-text');
        let menu = (menuSel && menuSel.value === 'other') ? (menuText?.value || '') : (menuSel?.value || '');

        practiceDataList.push({ id: practiceId, date: newDate, place: newLoc, start_time: start, end_time: end, menu });

        // 出欠情報の収集
        div.querySelectorAll('.edit-member-tag').forEach(tag => {
            const memberId = tag.dataset.memberId;
            const status = tag.dataset.status === 'none' ? null : tag.dataset.status;
            const noteInput = div.querySelector(`.member-note-input[data-member-id="${memberId}"]`);
            const note = noteInput ? noteInput.value.trim() : '';

            attendanceDataList.push({ 
                member_id: memberId, 
                practice_id: practiceId, 
                status: status, 
                note: note 
            });
        });
    });

    try {
        $('sync-indicator').classList.remove('hidden');
        
        // 1. 稽古情報の更新
        const { error: pErr } = await db.from('practices').upsert(practiceDataList);
        if (pErr) throw pErr;

        // 2. 出欠情報の更新（大量にあるためバッチ処理）
        const { error: aErr } = await db.from('attendance').upsert(attendanceDataList, { 
            onConflict: 'member_id,practice_id' 
        });
        if (aErr) throw aErr;

        await loadCloud();
        alert('全ての変更を保存しました。');
    } catch (err) {
        console.error(err);
        alert('保存に失敗しました。');
    } finally {
        $('sync-indicator').classList.add('hidden');
    }
};

// --- 稽古指示メモ機能 ---

function parseTargetRange(rangeStr) {
    if (!rangeStr) return { page: null, measure: null, scene: null };
    
    let page = null, measure = null, scene = null;
    const str = rangeStr.replace(/\s+/g, ''); // スペース除去
    
    if (str.includes('全体')) {
        page = 0; measure = 0;
    } else if (str.includes('全曲')) {
        measure = 0;
    }
    
    // ページ抽出: p.15, p15, 15ページ 等
    if (page === null) {
        const pMatch = str.match(/(?:p\.?|P\.?|ページ)(\d+)/) || str.match(/(\d+)ページ/);
        if (pMatch) page = parseInt(pMatch[1], 10);
    }
    
    // 小節抽出: M32, m32, 32小節 等
    if (measure === null) {
        const mMatch = str.match(/(?:m|M|小節)(\d+)/) || str.match(/(\d+)小節/);
        if (mMatch) measure = parseInt(mMatch[1], 10);
    }
    
    // シーン抽出: シーン3, Scene3 等
    if (scene === null) {
        const sMatch = str.match(/(?:シーン|scene|Scene)(\d+)/);
        if (sMatch) scene = parseInt(sMatch[1], 10);
    }
    
    return { page, measure, scene };
}

window.saveMemo = async () => {
    if (!db) {
        alert('データベースに接続されていません。');
        return;
    }
    
    // メンバー未選択、または localStorage に不正な値が入っている場合はブロックする
    if (!state.currentMember || state.currentMember === 'undefined' || state.currentMember === 'null') {
        alert('投稿するには、先に「出欠入力」タブであなたの名前（メンバー）を選択してください。');
        return;
    }
    
    const categoryCheckboxes = document.querySelectorAll('.memo-category-check:checked');
    const categories = Array.from(categoryCheckboxes).map(cb => cb.value);
    const category = categories.join(',');
    
    const content = $('memo-content').value.trim();
    if (categories.length === 0 || !content) {
        alert('区分と内容は必須です。');
        return;
    }
    
    const targetPerson = $('memo-target-person').value.trim();
    const targetRange = $('memo-target-range').value.trim();
    const editId = $('edit-memo-id').value;
    
    const parsed = parseTargetRange(targetRange);
    const author = state.members.find(m => String(m.id) === String(state.currentMember))?.name || '不明';
    
    const memoData = {
        author_id: state.currentMember || null,
        author_name: author,
        category: category,
        target_person: targetPerson,
        target_range: targetRange,
        content: content,
        sort_page: parsed.page,
        sort_measure: parsed.measure,
        sort_scene: parsed.scene,
        updated_at: new Date().toISOString()
    };
    
    try {
        $('save-memo-btn').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 保存中...';
        $('save-memo-btn').disabled = true;
        
        let error;
        if (editId) {
            const res = await db.from('rehearsal_memos').update(memoData).eq('id', editId);
            error = res.error;
        } else {
            const res = await db.from('rehearsal_memos').insert([memoData]);
            error = res.error;
        }
        
        if (error) throw error;
        
        alert('メモを保存しました。');
        resetMemoForm();
        await loadCloud(); // 再取得して描画
        if ($('rehearsal-work').classList.contains('active')) {
            renderRehearsalMemos();
        }
    } catch (err) {
        console.error(err);
        alert('保存に失敗しました: ' + err.message);
    } finally {
        $('save-memo-btn').innerHTML = '<i class="fa-solid fa-paper-plane"></i> 登録する';
        $('save-memo-btn').disabled = false;
    }
};

window.resetMemoForm = () => {
    $('edit-memo-id').value = '';
    document.querySelectorAll('.memo-category-check').forEach(cb => cb.checked = false);
    $('memo-target-person').value = '';
    $('memo-target-range').value = '';
    $('memo-content').value = '';
    
    $('cancel-memo-btn').classList.add('hidden');
    $('save-memo-btn').innerHTML = '<i class="fa-solid fa-paper-plane"></i> 登録する';
    
    // フォームを閉じる
    $('memo-form-container').classList.add('hidden');
    $('toggle-memo-form-btn').querySelector('i').className = 'fa-solid fa-chevron-down';
};

window.editMemo = (id) => {
    const memo = state.memos.find(m => m.id === id);
    if (!memo) return;
    
    $('edit-memo-id').value = memo.id;
    const categoryList = (memo.category || '').split(',').map(c => c.trim());
    document.querySelectorAll('.memo-category-check').forEach(cb => {
        cb.checked = categoryList.includes(cb.value);
    });
    $('memo-target-person').value = memo.target_person || '';
    $('memo-target-range').value = memo.target_range || '';
    $('memo-content').value = memo.content || '';
    
    $('cancel-memo-btn').classList.remove('hidden');
    $('save-memo-btn').innerHTML = '<i class="fa-solid fa-pen"></i> 更新する';
    
    // フォームを開く
    $('memo-form-container').classList.remove('hidden');
    $('toggle-memo-form-btn').querySelector('i').className = 'fa-solid fa-chevron-up';
    
    // フォームまでスクロール
    $('rehearsal-memo').scrollIntoView({ behavior: 'smooth' });
};

window.deleteMemo = async (id) => {
    if (!confirm('本当にこのメモを削除しますか？')) return;
    
    try {
        const { error } = await db.from('rehearsal_memos').delete().eq('id', id);
        if (error) throw error;
        
        alert('削除しました。');
        await loadCloud();
        renderRehearsalMemos();
    } catch (err) {
        console.error(err);
        alert('削除に失敗しました: ' + err.message);
    }
};

window.toggleMemoText = (btn) => {
    const contentDiv = btn.previousElementSibling;
    if (contentDiv.classList.contains('memo-content-short')) {
        contentDiv.classList.remove('memo-content-short');
        btn.innerHTML = '<i class="fa-solid fa-chevron-up"></i> 閉じる';
    } else {
        contentDiv.classList.add('memo-content-short');
        btn.innerHTML = '<i class="fa-solid fa-chevron-down"></i> 続きを読む';
    }
};

window.renderRehearsalMemos = () => {
    const container = $('memo-list-container');
    if (!container) return;
    
    const catFilter = $('filter-memo-category').value;
    const keyword = $('filter-memo-keyword').value.toLowerCase();
    const sortOrder = $('sort-memo-order').value;
    
    let filtered = state.memos.filter(m => {
        if (catFilter) {
            const memoCategories = (m.category || '').split(',').map(c => c.trim());
            if (!memoCategories.includes(catFilter)) return false;
        }
        if (keyword) {
            const range = (m.target_range || '').toLowerCase();
            const person = (m.target_person || '').toLowerCase();
            const content = (m.content || '').toLowerCase();
            if (!range.includes(keyword) && !person.includes(keyword) && !content.includes(keyword)) {
                return false;
            }
        }
        return true;
    });
    
    filtered.sort((a, b) => {
        if (sortOrder === 'updated_desc') {
            return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
        } else if (sortOrder === 'updated_asc') {
            return new Date(a.updated_at || a.created_at) - new Date(b.updated_at || b.created_at);
} else if (sortOrder === 'page') {
    const pa = a.sort_page !== null ? a.sort_page : 999999;
    const pb = b.sort_page !== null ? b.sort_page : 999999;
    return pa - pb;
}
return 0;
});    
    container.innerHTML = '';
    
    if (filtered.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-sub);">メモが見つかりません。</div>';
        return;
    }
    
    filtered.forEach(m => {
        const d = new Date(m.updated_at || m.created_at);
        const dateStr = `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
        
        let rangeStr = m.target_range ? `<i class="fa-solid fa-map-pin"></i> ${m.target_range}` : '';
        let personStr = m.target_person ? `<i class="fa-solid fa-user"></i> ${m.target_person}` : '';
        
        const isMine = m.author_id === state.currentMember || state.auth.type === 'admin';
        const actionsHtml = isMine ? `
    <div class="memo-actions">
        <button class="memo-action-btn" onclick="editMemo('${m.id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="memo-action-btn delete" onclick="deleteMemo('${m.id}')"><i class="fa-solid fa-trash-can"></i></button>
    </div>
` : '';

        const reactionsHtml = `
        <div class="memo-reactions" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">
            ${REACTIONS.map(r => `                
                <button
                    class="reaction-btn"
                    onclick="toggleReaction('${m.id}', '${r}')"
                    title="${
                        state.reactions
                            .filter(x =>
                                String(x.memo_id) === String(m.id) &&
                                x.reaction === r
                            )
                            .map(x => {
                                const member = state.members.find(mem =>
                                    String(mem.id) === String(x.member_id)
                                );
                                return member ? member.name : '';
                            })
                            .filter(Boolean)
                            .join('\n')
                    }"
                    style="
                    border:1px solid #ddd;
                    background:${
                        state.reactions.some(x =>
                            String(x.memo_id) === String(m.id) &&
                            String(x.member_id) === String(state.currentMember) &&
                            x.reaction === r
                        ) ? '#ffdce8' : 'white'
                    };
                    border-radius:16px;
                    padding:4px 8px;
                    cursor:pointer;
                    "
                >
                    ${r} ${
                        state.reactions.filter(x =>
                            String(x.memo_id) === String(m.id) &&
                            x.reaction === r
                        ).length
                    }
                </button>
            `).join('')}
        </div>
        `;

        // 改行を判定して省略ボタンを出すか決める（文字数や行数で簡易判定）
        const lines = (m.content || '').split('\n').length;
        const isLong = lines > 3 || (m.content || '').length > 100;
        
        const contentHtml = `
            <div class="${isLong ? 'memo-content-short' : ''}">
                ${m.content
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/\n/g, '<br>')}
            </div>
        `;
        
        const categories = (m.category || '').split(',').map(c => c.trim()).filter(c => c);
        const badgesHtml = categories.map(c => `<span class="memo-category-badge">${c}</span>`).join('');
        
        const card = document.createElement('div');
        card.className = 'memo-card';
        card.innerHTML = `
            <div class="memo-header">
                <div style="display: flex; flex-wrap: wrap; gap: 5px;">${badgesHtml}</div>
                <span style="font-size: 0.75rem; color: var(--text-sub);"><i class="fa-regular fa-clock"></i> ${dateStr}</span>
            </div>
            <div class="memo-meta">
                ${rangeStr ? `<span>${rangeStr}</span>` : ''}
                ${personStr ? `<span>${personStr}</span>` : ''}
                <span style="margin-left: auto; font-weight: bold;"><i class="fa-solid fa-pen-nib"></i> ${m.author_name || '不明'}</span>
            </div>
            ${contentHtml}
            ${reactionsHtml}
            ${actionsHtml}
        `;
        container.appendChild(card);
    });
};

renderRehearsalMemos = window.renderRehearsalMemos;

// アプリの起動時・データロード後にプルダウンを更新するようにフックを追加
const originalRenderRehearsalMemos = window.renderRehearsalMemos;
window.renderRehearsalMemos = () => {
    // タブが切り替わった時などにプルダウンも最新化する
    updateMemoCategoryDropdowns();
    renderMemoSettings();
    originalRenderRehearsalMemos();
};

// 区分リストのプルダウン・チェックボックスを更新
window.updateMemoCategoryDropdowns = () => {
    const cats = state.settings.memoCategories || [];
    
    const checkboxesContainer = $('memo-category-checkboxes');
    if (checkboxesContainer) {
        const checkedValues = Array.from(checkboxesContainer.querySelectorAll('input:checked')).map(cb => cb.value);
        
        checkboxesContainer.innerHTML = '';
        cats.forEach((c, index) => {
            const id = 'memo-cat-' + index;
            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.gap = '4px';
            label.style.fontSize = '0.85rem';
            label.style.cursor = 'pointer';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'memo-category-check';
            checkbox.value = c.name;
            checkbox.id = id;
            if (checkedValues.includes(c.name)) checkbox.checked = true;
            
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(c.name));
            checkboxesContainer.appendChild(label);
        });
    }
    
    const filterSelect = $('filter-memo-category');
    if (filterSelect) {
        const currentFilter = filterSelect.value;
        filterSelect.innerHTML = '<option value="">全ての区分</option>';
        cats.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.name;
            opt.textContent = c.name;
            filterSelect.appendChild(opt);
        });
        filterSelect.value = currentFilter;
    }
};

// 区分リスト管理用UI描画
window.renderMemoSettings = () => {
    const ul = $('memo-category-list');
    if (!ul) return;
    ul.innerHTML = '';
    
    const cats = state.settings.memoCategories || [];
    cats.forEach((cat, index) => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';
        li.style.padding = '8px 0';
        li.style.borderBottom = '1px solid #f0e6ea';
        
        li.innerHTML = `
            <span style="font-weight:bold; color:var(--text-main);"><i class="fa-solid fa-tag"></i> ${cat.name}</span>
            <div style="display:flex; gap:5px;">
                <button class="icon-btn-sm" onclick="moveMemoCategory(${index}, -1)" ${index === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
                <button class="icon-btn-sm" onclick="moveMemoCategory(${index}, 1)" ${index === cats.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button>
                <button class="icon-btn-sm" style="color:var(--danger);" onclick="deleteMemoCategory('${cat.id}')"><i class="fa-solid fa-xmark"></i></button>
            </div>
        `;
        ul.appendChild(li);
    });
};

// 区分を追加
window.addMemoCategory = async () => {
    const input = $('new-memo-category-input');
    const name = input.value.trim();
    if (!name) return;
    
    const sortOrder = state.settings.memoCategories ? state.settings.memoCategories.length : 0;
    
    try {
        $('add-memo-category-btn').disabled = true;
        const { error } = await db.from('memo_categories').insert([{ name, sort_order: sortOrder }]);
        if (error) throw error;
        
        input.value = '';
        await loadCloud();
        
        console.log(state.settings.memoCategories);

        renderMemoSettings();
        updateMemoCategoryDropdowns();
    } catch (err) {
        console.error(err);
        alert('追加に失敗しました。');
    } finally {
        $('add-memo-category-btn').disabled = false;
    }
};

// 区分を削除
window.deleteMemoCategory = async (id) => {
    if (!confirm('この区分を削除しますか？\n（すでにこの区分が設定されているメモの区分名はそのまま残ります）')) return;
    try {
        const { error } = await db.from('memo_categories').delete().eq('id', id);
        if (error) throw error;
        
        await loadCloud();
        renderMemoSettings();
        updateMemoCategoryDropdowns();
    } catch (err) {
        console.error(err);
        alert('削除に失敗しました。');
    }
};

// 区分の並び替え
window.moveMemoCategory = async (index, direction) => {
    const cats = [...state.settings.memoCategories];
    if (index + direction < 0 || index + direction >= cats.length) return;
    
    const temp = cats[index];
    cats[index] = cats[index + direction];
    cats[index + direction] = temp;
    
    try {
        const updates = cats.map((cat, i) => ({
            id: cat.id,
            name: cat.name,
            sort_order: i
        }));
        
        const { error } = await db.from('memo_categories').upsert(updates);
        if (error) throw error;
        
        await loadCloud();
        renderMemoSettings();
    } catch (err) {
        console.error(err);
        alert('並び替えに失敗しました。');
    }
};

// キャスト成立状況モーダルのレンダリング
window.showCastStatusModal = (practiceId, dateStr, menuName) => {
    const weekday = getWeekday(dateStr);
    $('cast-status-date-info').textContent = `${dateStr}（${weekday}） - ${menuName}`;
    
    const tableBody = $('cast-status-table-body');
    tableBody.innerHTML = '';
    
    const groupStatusBody = $('cast-group-status-body');
    groupStatusBody.innerHTML = '';

    const casts = state.castMaster || [];
    if (casts.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" style="padding:20px; color:var(--text-sub);">配役マスターが登録されていません。管理画面から登録してください。</td></tr>';
        ['A', 'B', 'C'].forEach(g => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td style="padding: 8px 10px; font-weight:bold;">${g}組</td><td style="padding: 8px 10px; text-align:right;">0人 / 0人</td>`;
            groupStatusBody.appendChild(tr);
        });
        $('cast-status-overlay').classList.remove('hidden');
        return;
    }

    // 役名でグループ化
    const rolesMap = {};
    casts.forEach(c => {
        if (!rolesMap[c.role]) {
            rolesMap[c.role] = {
                role: c.role,
                sort_order: c.sort_order,
                membersByGroup: { 'A': [], 'B': [], 'C': [], '未定': [] }
            };
        }
        if (rolesMap[c.role].membersByGroup[c.group]) {
            rolesMap[c.role].membersByGroup[c.group].push(c.name);
        }
    });

    const sortedRoles = Object.values(rolesMap).sort((a, b) => a.sort_order - b.sort_order);

    const attendMemberNames = new Set();
    const absentMemberNames = new Set();
    
    state.members.forEach(member => {
        const att = state.attendance[member.id]?.[practiceId];
        if (att?.status === 'attend') {
            attendMemberNames.add(member.name);
        } else if (att?.status === 'absent') {
            absentMemberNames.add(member.name);
        }
    });

    const totalRequiredByGroup = {
        'A': 0,
        'B': 0,
        'C': 0,
        '未定': 0
    };
    const totalAttendedByGroup = {
        'A': 0,
        'B': 0,
        'C': 0,
        '未定': 0
    };

    const uniqueMembersByGroup = {
        'A': new Set(),
        'B': new Set(),
        'C': new Set(),
        '未定': new Set()
    };
    casts.forEach(c => {
        if (uniqueMembersByGroup[c.group]) {
            uniqueMembersByGroup[c.group].add(c.name);
        }
    });
    
    ['A', 'B', 'C', '未定'].forEach(g => {
        totalRequiredByGroup[g] = uniqueMembersByGroup[g].size;
    });

    const attendedMembersByGroup = {
        'A': new Set(),
        'B': new Set(),
        'C': new Set(),
        '未定': new Set()
    };

    sortedRoles.forEach(r => {
        const tr = document.createElement('tr');
        
        let roleHtml = `<td style="padding: 12px 10px; font-weight: bold; border-right: 1px solid var(--border-dusty); text-align: left;">${r.role}</td>`;
        
        ['A', 'B', 'C', '未定'].forEach(g => {
            const list = r.membersByGroup[g] || [];
            if (list.length === 0) {
                roleHtml += `<td class="cast-status-cell none" style="border-right: ${g !== '未定' ? '1px solid var(--border-dusty)' : 'none'};">-</td>`;
                return;
            }

            const attended = list.filter(name => attendMemberNames.has(name));
            attended.forEach(name => { attendedMembersByGroup[g].add(name); });

            const allRegisteredAreAbsent = list.every(name => absentMemberNames.has(name));
            const hasAttended = attended.length > 0;
            
            let cellClass = hasAttended ? 'attend' : (allRegisteredAreAbsent ? 'absent' : 'none');
            let displayVal = hasAttended ? attended.join('、') : '-';

            roleHtml += `<td class="cast-status-cell ${cellClass}" style="border-right: ${g !== '未定' ? '1px solid var(--border-dusty)' : 'none'};">${displayVal}</td>`;
        });

        tr.innerHTML = roleHtml;
        tableBody.appendChild(tr);
    });

    // 成立人数をセット
    ['A', 'B', 'C', '未定'].forEach(g => {
        totalAttendedByGroup[g] = attendedMembersByGroup[g].size;
    });

    ['A', 'B', 'C', '未定'].forEach(g => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = g !== '未定' ? '1px solid var(--border-dusty)' : 'none';
        tr.innerHTML = `
            <td style="padding: 10px; font-weight: bold; color: var(--text-main);">${g}組</td>
            <td style="padding: 10px; text-align: right; font-weight: bold; color: var(--pink-accent); font-size: 1rem;">
                ${totalAttendedByGroup[g]}人 ／ ${totalRequiredByGroup[g]}人
            </td>
        `;
        groupStatusBody.appendChild(tr);
    });

    $('cast-status-overlay').classList.remove('hidden');
};

// 配役マスター管理画面の描画
window.renderAdminCastMaster = () => {
    const list = $('admin-cast-list');
    if (!list) return;
    list.innerHTML = '';

    const casts = state.castMaster || [];

    let memberOpts = '<option value="">キャストを選択</option>';
    state.members.forEach(m => {
        memberOpts += `<option value="${m.name}">${m.name}</option>`;
    });

    if (casts.length === 0) {
        list.innerHTML = '<p class="admin-hint" style="text-align:center; padding:30px; color:var(--text-sub);">登録されている配役がありません。「新しい配役を追加」ボタンから登録してください。</p>';
        return;
    }

    casts.forEach(c => {
        const row = document.createElement('div');
        row.className = 'admin-line cast-master-row';
        row.style.cssText = "background:#FFF; border:1px solid var(--border-dusty); border-radius:12px; padding:12px 10px; margin-bottom:10px; display:flex; flex-wrap:wrap; gap:8px; align-items:center;";
        row.dataset.id = c.id;

        // キャストのプルダウン生成
        let currentOpts = memberOpts;
        if (c.name && !state.members.some(m => m.name === c.name)) {
            // メンバー一覧にない名前の場合も選択肢に一時追加
            currentOpts += `<option value="${c.name}" selected>${c.name}</option>`;
        }

        row.innerHTML = `
            <select class="cute-input cast-name-select" style="flex:1; min-width:120px;">
                <option value="">キャストを選択</option>
                ${state.members.map(m => `<option value="${m.name}" ${m.name === c.name ? 'selected' : ''}>${m.name}</option>`).join('')}
            </select>
            <select class="cute-input cast-group-select" style="width:90px;">
                <option value="A" ${c.group === 'A' ? 'selected' : ''}>A組</option>
                <option value="B" ${c.group === 'B' ? 'selected' : ''}>B組</option>
                <option value="C" ${c.group === 'C' ? 'selected' : ''}>C組</option>
                <option value="全組" ${c.group === '全組' ? 'selected' : ''}>全組</option>
                <option value="未定" ${c.group === '未定' ? 'selected' : ''}>未定</option>
            </select>
            <input type="text" class="cute-input cast-role-input" placeholder="役名" value="${c.role || ''}" style="flex:1.5; min-width:140px;">
            <div style="display:flex; gap:4px; align-items:center;">
                <button type="button" class="icon-btn-sm cast-row-up-btn" style="width:36px; height:36px;"><i class="fa-solid fa-chevron-up"></i></button>
                <button type="button" class="icon-btn-sm cast-row-down-btn" style="width:36px; height:36px;"><i class="fa-solid fa-chevron-down"></i></button>
                <button type="button" class="del-row-btn" style="background:none; border:none; color:#ccc; padding:5px; font-size:1.2rem; cursor:pointer;" onclick="deleteCastMasterRecord('${c.id}', this)">&times;</button>
            </div>
        `;
        list.appendChild(row);
    });
};

// 配役マスターの削除
window.deleteCastMasterRecord = async (id, btn) => {
    if (id.startsWith('new_')) {
        btn.closest('.cast-master-row').remove();
        return;
    }

    if (confirm('この配役設定を削除しますか？\n（保存するまでデータベースからは削除されません）')) {
        btn.closest('.cast-master-row').remove();
        isDirty = true;
    }
};

// 配役マスターの保存
window.saveCastMasterFromDOM = async () => {
    if (!db) return;

    const list = $('admin-cast-list');
    if (!list) return;

    const rows = list.querySelectorAll('.cast-master-row');
    const dataList = [];
    let hasError = false;

    // 現在DOM上に並んでいる順番に基づいて、0から順に sort_order を付与する
    rows.forEach((row, index) => {
        const id = row.dataset.id;
        const name = row.querySelector('.cast-name-select').value;
        const group = row.querySelector('.cast-group-select').value;
        const role = row.querySelector('.cast-role-input').value.trim();
        const sort_order = index;

        if (!name || !role) {
            hasError = true;
            row.style.borderColor = 'red';
        } else {
            row.style.borderColor = 'var(--border-dusty)';

            if (group === '全組') {

                ['A', 'B', 'C'].forEach(g => {
                    dataList.push({
                        id: crypto.randomUUID(),
                        name,
                        group: g,
                        role,
                        sort_order
                    });
                });

            } else {

                dataList.push({
                    id: id.startsWith('new_') ? crypto.randomUUID() : id,
                    name,
                    group,
                    role,
                    sort_order
                });

            }
        }
});

    if (hasError) {
        alert('キャスト名と役名は必須項目です。赤枠の部分をご確認ください。');
        return;
    }

    const saveBtn = $('save-casts-btn');
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 保存中...';
    saveBtn.disabled = true;

    try {
        $('sync-indicator').classList.remove('hidden');

        // DB整合性をシンプルに保つため、画面上に存在しない既存のレコードは削除する
        const currentIds = dataList.filter(d => d.id).map(d => d.id);
        
        // 既存のDBのキャストIDを取得して差分を削除
        const { data: dbCasts, error: fetchErr } = await db.from('cast_master').select('id');
        if (fetchErr) throw fetchErr;

        const deleteIds = dbCasts.filter(dbc => !currentIds.includes(dbc.id)).map(dbc => dbc.id);
        
        if (deleteIds.length > 0) {
            const { error: delErr } = await db.from('cast_master').delete().in('id', deleteIds);
            if (delErr) throw delErr;
        }

        // upsertの実行
        if (dataList.length > 0) {
            const { error: upsertErr } = await db.from('cast_master').upsert(dataList);
            if (upsertErr) throw upsertErr;
        }

        alert('配役マスターを保存しました！');
        isDirty = false;
        await loadCloud();
        renderAdminCastMaster();
    } catch (err) {
        console.error(err);
        alert('配役マスターの保存に失敗しました: ' + err.message);
    } finally {
        $('sync-indicator').classList.add('hidden');
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    }
};

window.toggleReaction = async (memoId, reaction) => {
    if (!state.currentMember) {
        alert('先にメンバーを選択してください');
        return;
    }

    const existing = state.reactions.find(r =>
        String(r.memo_id) === String(memoId) &&
        String(r.member_id) === String(state.currentMember) &&
        r.reaction === reaction
    );

    try {
        if (existing) {
            const { error } = await db
                .from('memo_reactions')
                .delete()
                .eq('id', existing.id);

            if (error) throw error;
        } else {

            await db
                .from('memo_reactions')
                .delete()
                .eq('memo_id', memoId)
                .eq('member_id', state.currentMember);

            const { error } = await db
                .from('memo_reactions')
                .insert([{
                    memo_id: memoId,
                    member_id: state.currentMember,
                    reaction: reaction
                }]);

            if (error) throw error;
        }

        await loadCloud();
        renderRehearsalMemos();

    } catch (err) {
        console.error(err);
        alert(JSON.stringify(err, null, 2));
    }
};