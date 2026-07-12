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

