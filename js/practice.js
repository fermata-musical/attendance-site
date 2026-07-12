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
// 1つのスロット（時間枠）のHTMLを生成するヘルパー（一貫性のため）

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
function initMenuEvents() {
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
}

function initLockEvents() {
    // 項目管理の「追加」ボタンが反応しない場合への対策
    document.addEventListener('click', (e) => {
        if (e.target.id === 'add-location-btn' || e.target.id === 'add-menu-btn') {
            isLocked = false;
            // 本来の処理が終わるのを少し待ってから再ロック
            setTimeout(() => { isLocked = true; }, 100);
        }
    });
}

function initMoveEvents() {
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
}

function initMenuMoveEvents() {

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
}

function initPracticeSortEvents() {

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
}

function initMenuSortEvents() {
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
}

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

            <details class="notice-section" style="margin-top:12px;">
                <summary style="cursor:pointer; font-weight:bold;">
                    連絡事項
                    ${r.notice ? '📌' : ''}
                </summary>

                <div style="margin-top:8px;">
                    <textarea
                        class="cute-input notice-input"
                        style="width:100%; min-height:90px; resize:vertical;"
                        placeholder="この日の連絡事項を入力してください">${r.notice || ''}</textarea>
                </div>
            </details>

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

