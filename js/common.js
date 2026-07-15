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

            if (menuId === 'rehearsal-links-main') {
                renderLinks();
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

function renderTab(id) {
    if (id === 'attendance-input') renderAttendanceInput();
    if (id === 'overall-status') renderOverallStatus();
    if (id === 'self-profile-tab') renderSelfProfiles();

    if (id === 'rehearsal-work') {

        const activeSubTab =
            document.querySelector('.rehearsal-sub-tab.active')?.dataset.menu
            || 'rehearsal-memo-main';

        document.querySelectorAll('#rehearsal-work .rehearsal-sub-content')
            .forEach(c => c.style.display = 'none');

        document.getElementById(activeSubTab).style.display = 'block';

        document.querySelectorAll('.rehearsal-sub-tab')
            .forEach(t => t.classList.remove('active'));

        document.querySelector(`[data-menu="${activeSubTab}"]`)
            .classList.add('active');

        if (activeSubTab === 'rehearsal-memo-main') {
            renderRehearsalMemos();
        } else if (activeSubTab === 'rehearsal-links-main') {
            renderLinks();
        }
    }

    if (id === 'admin-panel') renderAdminPanel();
    if (id === 'past-records') renderPastRecords();
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