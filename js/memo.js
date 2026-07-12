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

        if ((a.pinned || false) !== (b.pinned || false)) {
            return (b.pinned || false) - (a.pinned || false);
        }

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
        const isNew = !memoReadStatus[m.id];
        const isUpdated = memoUpdatedStatus[m.id];
        const d = new Date(m.updated_at || m.created_at);
        const dateStr = `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
        
        let rangeStr = m.target_range ? `<i class="fa-solid fa-map-pin"></i> ${m.target_range}` : '';
        let personStr = m.target_person ? `<i class="fa-solid fa-user"></i> ${m.target_person}` : '';
        
        const isMine = m.author_id === state.currentMember || state.auth.type === 'admin';
        const actionsHtml = isMine ? `
    <div class="memo-actions">

        <button class="memo-action-btn"
            onclick="togglePin('${m.id}')"
            style="
                color:${m.pinned ? 'white' : '#bfbfbf'};
                background:${m.pinned ? 'var(--pink-accent)' : 'transparent'};
                border-radius:50%;
                width:24px;
                height:24px;
                display:flex;
                align-items:center;
                justify-content:center;
                font-size:${m.pinned ? '1.15rem' : '0.9rem'};
                box-shadow:${m.pinned ? '0 2px 6px rgba(233,101,153,0.4)' : 'none'};
            ">
            <i class="fa-solid fa-thumbtack"></i>
        </button>

        <button class="memo-action-btn" onclick="editMemo('${m.id}')">
            <i class="fa-solid fa-pen"></i>
        </button>

        <button class="memo-action-btn delete" onclick="deleteMemo('${m.id}')">
            <i class="fa-solid fa-trash-can"></i>
        </button>

    </div>
` : '';

        const reactionsHtml = `
        <div class="memo-reactions" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:4px;">
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
                    border:none;
                    background:transparent;
                    padding:0;
                    font-size:0.75rem;
                    line-height:1;
                    cursor:pointer;
                    "
                >
                    ${
                        state.reactions.some(x =>
                            String(x.memo_id) === String(m.id) &&
                            String(x.member_id) === String(state.currentMember) &&
                            x.reaction === r
                        )
                            ? '<i class="fa-solid fa-heart" style="color:var(--pink-accent);"></i>'
                            : '<i class="fa-regular fa-heart" style="color:#cfcfcf;"></i>'
                    }
                    <span
                        onclick="event.stopPropagation();showReactionUsers('${m.id}','${r}')"
                        style="margin-left:2px;cursor:pointer;font-size:0.7rem;"
                    >
                    ${
                        state.reactions.filter(x =>
                            String(x.memo_id) === String(m.id) &&
                            x.reaction === r
                        ).length
                    }
                    </span>
                </button>
            `).join('')}
        </div>
        `;

        // 改行を判定して省略ボタンを出すか決める（文字数や行数で簡易判定）
        const lines = (m.content || '').split('\n').length;
        const isLong = lines > 3 || (m.content || '').length > 100;
        
        const contentHtml = `
            <div class="memo-content-short">
                ${m.content
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/\n/g, '<br>')}
            </div>
        `;

        const toggleButtonHtml = `
        <button class="memo-toggle-btn"
            onclick="
            toggleMemoText(this);
            markMemoAsRead('${m.id}');
            "
            <i class="fa-solid fa-chevron-down"></i> 続きを読む
        </button>
        `;
        
        const categories = (m.category || '').split(',').map(c => c.trim()).filter(c => c);
        const badgesHtml = categories.map(c => `<span class="memo-category-badge">${c}</span>`).join('');
        
        const card = document.createElement('div');
        card.className = 'memo-card';
        card.innerHTML = `
            <div class="memo-header">

            <div style="display: flex; flex-wrap: wrap; gap: 5px;">

                ${isNew ? `
                <span style="
                background:var(--pink-accent);
                color:white;
                font-size:0.7rem;
                padding:2px 6px;
                border-radius:4px;
                font-weight:bold;
                ">
                NEW
                </span>
                ` : ''}

                ${!isNew && isUpdated ? `
                <span style="
                background:var(--bg-soft);
                color:var(--pink-accent);
                border:1px solid var(--border-dusty);
                font-size:0.7rem;
                padding:2px 6px;
                border-radius:4px;
                font-weight:bold;
                ">
                更新
                </span>
                ` : ''}

                ${badgesHtml}

            </div>
                <span style="font-size: 0.75rem; color: var(--text-sub);"><i class="fa-regular fa-clock"></i> ${dateStr}</span>
            </div>
            <div class="memo-meta">
                ${rangeStr ? `<span>${rangeStr}</span>` : ''}
                ${personStr ? `<span>${personStr}</span>` : ''}
                <span style="margin-left: auto; font-weight: bold;"><i class="fa-solid fa-pen-nib"></i> ${m.author_name || '不明'}</span>
            </div>
            ${contentHtml}
            ${toggleButtonHtml}
            ${reactionsHtml}
            ${actionsHtml}
        `;
        container.appendChild(card);
    });
};

renderRehearsalMemos = window.renderRehearsalMemos;

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
        updated_at: new Date().toISOString(),
        pinned: false
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

        if (editId) {
            memoUpdatedStatus[editId] = true;

            localStorage.setItem(
                'memoUpdatedStatus',
                JSON.stringify(memoUpdatedStatus)
            );
        }

        alert('メモを保存しました。');
        resetMemoForm();

        await loadCloud();

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

window.showReactionUsers = (memoId, reaction) => {
    const names = state.reactions
        .filter(x =>
            String(x.memo_id) === String(memoId) &&
            x.reaction === reaction
        )
        .map(x => {
            const member = state.members.find(mem =>
                String(mem.id) === String(x.member_id)
            );
            return member ? member.name : '';
        })
        .filter(Boolean);

    alert(
        `${reaction}\n\n` +
        (names.length ? names.join('\n') : 'まだ誰もリアクションしていません')
    );
};

window.markMemoAsRead = (memoId) => {
    memoReadStatus[memoId] = true;
    delete memoUpdatedStatus[memoId];

    localStorage.setItem(
        'memoReadStatus',
        JSON.stringify(memoReadStatus)
    );

    localStorage.setItem(
        'memoUpdatedStatus',
        JSON.stringify(memoUpdatedStatus)
    );
};

window.togglePin = async (memoId) => {

    const memo = state.memos.find(
        m => String(m.id) === String(memoId)
    );

    if (!memo) return;

    const { error } = await db
        .from('rehearsal_memos')
        .update({
            pinned: !memo.pinned,
            updated_at: new Date().toISOString()
        })
        .eq('id', memoId);

    if (error) {
        alert(error.message);
        return;
    }

    await loadCloud();
    renderRehearsalMemos();
};


// アプリの起動時・データロード後にプルダウンを更新するようにフックを追加
const originalRenderRehearsalMemos = window.renderRehearsalMemos;
window.renderRehearsalMemos = () => {
    // タブが切り替わった時などにプルダウンも最新化する
    updateMemoCategoryDropdowns();
    renderMemoSettings();
    originalRenderRehearsalMemos();
};
