console.log("app.js loaded");
// --- 接続設定 ---

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

const REACTIONS = [
  "❤️",
];

let memoReadStatus =
    JSON.parse(localStorage.getItem('memoReadStatus') || '{}');

let memoUpdatedStatus =
    JSON.parse(localStorage.getItem('memoUpdatedStatus') || '{}');

// --- ユーティリティ ---

function setupSelectEventListeners() {
    // プルダウンの挙動を正常化
    document.querySelectorAll('select').forEach(select => {
        if (select.dataset.initialized === 'true') return;
        select.dataset.initialized = 'true';
        // 余計なイベント停止を削除し、ブラウザ標準の動作を優先
    });
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
    console.count('initTabs');
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
            dataList.push({
                id: crypto.randomUUID(),
                date: r.date || null,
                place: r.location,
                start_time: '',
                end_time: '',
                menu: '',
                notice: r.notice || '',
                sort_order: currentOrder++
            });
                } else {
                    r.slots.forEach(s => {
                        dataList.push({
                            id: s.id && s.id !== "undefined" ? s.id : crypto.randomUUID(),
                            date: r.date || null,
                            place: r.location,
                            start_time: s.start || '',
                            end_time: s.end || '',
                            menu: s.menu || '',
                            notice: r.notice || '',
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
//出欠入力タブ（メンバー画面）の描画
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
            card.innerHTML = `
                <div class="section-header">
                    <h2><i class="fa-solid fa-calendar-day"></i> ${dateDisplay}　${r.location}</h2>
                </div>

                <!-- 連絡事項カード（出欠入力タブ） -->
                ${r.notice ? `
                    <div style="
                        margin-bottom:18px;
                        background:var(--bg-card);
                        border:1px solid var(--border-dusty);
                        border-radius:var(--radius-md);
                        box-shadow:var(--shadow-sm);
                        overflow:hidden;
                    ">
                        <div style="
                            padding:16px 18px;
                            color:var(--text-main);
                            white-space:pre-wrap;
                            line-height:1.6;
                            font-size:0.9rem;
                        ">${r.notice}</div>
                    </div>
                ` : ''}

                ${slotsHtml}
            `;
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
        let location = (locSel && locSel.value === 'other')
            ? (locText?.value || '')
            : (locSel?.value || '');

        // 連絡事項
        const notice = card.querySelector('.notice-input')?.value || '';

        const slots = [];

        card.querySelectorAll('.slots').forEach(slot => {
            const id = slot.dataset.id && slot.dataset.id !== "undefined"
                ? slot.dataset.id
                : crypto.randomUUID();

            const start = slot.querySelector('.start-time-input')?.value || '';
            const end = slot.querySelector('.end-time-input')?.value || '';

            // メニューの取得（プルダウン or 直接入力）
            const menuSel = slot.querySelector('.menu-input');
            const menuText = slot.querySelector('.menu-input-text');

            let menu = (menuSel && menuSel.value === 'other')
                ? (menuText?.value || '')
                : (menuSel?.value || '');

            slots.push({
                id,
                start,
                end,
                menu
            });
        });

        state.rehearsals.push({
            date,
            location,
            notice,
            slots
        });
    });

    console.log('[保存データ]', state.rehearsals);
    refreshAdminViewList();
}

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

function renderOverallStatus() {
    const mainContainer = $('overall-status-container'); 
    if (!mainContainer) return;
    
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


window.handleAdminManualInput = () => { savePracticesFromDOM(); };
window.handleAdminManualInputGroup = () => { savePracticesFromDOM(); };


function initChangeEvents() {

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
}

function initPageEvents() {
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
}

function initPastDeleteEvents() {

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
}

window.onload = () => {
    if (window.supabase) { 
        db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); 
    }

    initAuth();
    initTabs();
    initPageEvents();
    initProfileEvents();
    initMenuEvents();
    initLockEvents();
    initMoveEvents();
    initMenuMoveEvents();
    initPracticeSortEvents();
    initMenuSortEvents();
    initChangeEvents();
    initPastDeleteEvents();
}



