console.log("app.js loaded");
// --- 接続設定 ---

let db; 
let allowUpdate = false; 
let isEditing = false; 
let isLocked = true;   
let isSaving = false;  // 保存中フラグ
let isDirty = false;   // 未保存の変更があるかどうかのフラグ

const REACTIONS = [
  "❤️",
];

let memoReadStatus =
    JSON.parse(localStorage.getItem('memoReadStatus') || '{}');

let memoUpdatedStatus =
    JSON.parse(localStorage.getItem('memoUpdatedStatus') || '{}');

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

        const member = state.members.find(
            m => String(m.id) === String(state.currentMember)
        );

        if (member) {
            localStorage.setItem('currentMemberId', member.id);
            localStorage.setItem('currentMemberName', member.name);
        }

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

                localStorage.setItem('currentMemberId', data.id);
                localStorage.setItem('currentMemberName', data.name);

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

    // 現在選択中のメンバーを localStorage に保存
    if (state.currentMember) {
        const member = state.members.find(
            m => String(m.id) === String(state.currentMember)
        );

        if (member) {
            localStorage.setItem('currentMemberId', member.id);
            localStorage.setItem('currentMemberName', member.name);
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

        localStorage.setItem('currentMemberName', trimmedName);

        await loadCloud();
    }
}

async function deleteCurrentMember() {
    const member = state.members.find(m => m.id === state.currentMember);
    if (confirm(`${member.name}さんを削除しますか？`)) {
        await db.from('members').delete().eq('id', state.currentMember);

        state.currentMember = '';

        localStorage.removeItem('currentMemberId');
        localStorage.removeItem('currentMemberName');

        saveLocal();
        await loadCloud();
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

window.delPractice = async (id) => { 
    if(confirm('この枠を削除しますか？')) { 
        const { error } = await db.from('practices').delete().eq('id', id); 
        if (error) alert(error.message); else await loadCloud(); 
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


window.onload = () => {
    if (window.supabase) { 
        db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        window.db = db;
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




