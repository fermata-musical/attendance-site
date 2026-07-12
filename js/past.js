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
