// 備品管理用スクリプト (closet.js)

let currentEditingItemId = null;

const TREASURE_MODE = true;

// 掘り出し市終了後は false に戻す

// 掘り出し市モード時のみお知らせを表示
document.addEventListener('DOMContentLoaded', () => {
    const notice = document.getElementById('treasure-mode-notice');
    if (notice) {
        notice.style.display = TREASURE_MODE ? 'block' : 'none';
    }
});

// 編集中に内容が変更されたか
let hasEditChanges = false;

// セット数量変更モーダル用
let pendingSetQuantity = null;
let pendingOriginalItem = null;
let pendingResolveSetQuantity = null;

// ページロード時の初期化処理
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOMContentLoaded");

    const notice = document.getElementById('treasure-mode-notice');
    if (notice) {
        notice.style.display = TREASURE_MODE ? 'block' : 'none';
    }

    let currentMember = getCurrentMember();

    const nameLabel = document.getElementById('current-user-name');

    if (nameLabel) {
        if (currentMember?.id) {
            nameLabel.textContent = currentMember.name;
        } else {
            nameLabel.textContent = '使用者を選択';
        }
    }

    const userButton = document.getElementById('current-user-btn');

    if (userButton) {
        userButton.onclick = () => {
            localStorage.removeItem('currentMemberId');
            localStorage.removeItem('currentMemberName');

            window.location.href = 'index.html#attendance-input';
        };
    }

    // 検索イベントの設定
    const searchName = document.getElementById('closet-search-name');
    const searchNumber = document.getElementById('closet-search-number');
    const searchCategory = document.getElementById('closet-search-category');
    
    if (searchName) searchName.addEventListener('input', renderClosetItems);
    if (searchNumber) searchNumber.addEventListener('input', renderClosetItems);
    if (searchCategory) searchCategory.addEventListener('change', renderClosetItems);

    // 削除ボタン
    const deleteBtn = document.getElementById('delete-item-btn');

    if (deleteBtn) {
        deleteBtn.addEventListener('click', deleteClosetItem);
    }

    // キャンセル・新規登録ボタン
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const newEntryBtn = document.getElementById('new-entry-btn');

    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', () => {

            if (currentEditingItemId && hasEditChanges) {
                if (!confirm('変更内容を破棄しますか？')) {
                    return;
                }
            }

            resetClosetEntryForm();
            document.querySelector('[data-tab="closet-list"]').click();
        });
    }

    if (newEntryBtn) {
        newEntryBtn.addEventListener('click', () => {

            if (hasEditChanges) {
                if (!confirm('入力内容を破棄して新規登録を開始しますか？')) {
                    return;
                }
            }

            resetClosetEntryForm(true);

            // 登録タブを表示したままにする
            const entryTabBtn = document.querySelector('[data-tab="closet-entry"]');
            if (entryTabBtn) {
                entryTabBtn.click();
            }
        });
    }
    

    // ログイン完了を監視して備品データを自動取得
    const initInterval = setInterval(() => {
        console.log("db:", !!window.db, "state:", typeof state);

        if (window.db && typeof state !== 'undefined') {
            console.log("loadClosetItems call");
            clearInterval(initInterval);

            currentMember = getCurrentMember();

            const nameLabel = document.getElementById('current-user-name');
            if (nameLabel) {
                nameLabel.textContent = currentMember?.name || '使用者を選択';
            }

            loadClosetItems();
        }
    }, 500);
});

// 編集中の変更を検知
const entryForm = document.getElementById('closet-entry-form');

if (entryForm) {
    entryForm.addEventListener('input', () => {
        if (currentEditingItemId) {
            hasEditChanges = true;
        }
    });

    entryForm.addEventListener('change', () => {
        if (currentEditingItemId) {
            hasEditChanges = true;
        }
    });
}

// マスタデータ取得
async function loadClosetMasterData() {
    console.log("loadClosetMasterData start");

    if (!window.db) return;
    try {
        const masterData = await window.closetApi.fetchMasterData();

        if (typeof state === 'undefined') window.state = {};
        state.closetMaster = masterData;

        populateDropdown('entry-large-category', state.closetMaster.large, 'id', 'name');
        populateDropdown('entry-middle-category', state.closetMaster.middle, 'id', 'name');
        populateDropdown('entry-small-category', state.closetMaster.small, 'id', 'name');
        populateDropdown('entry-storage', state.closetMaster.storage, 'id', 'location');
        populateDropdown('entry-status', state.closetMaster.statuses, 'id', 'name');

        populateDropdown('closet-filter-large', state.closetMaster.large, 'id', 'name');
        populateDropdown('closet-filter-middle', state.closetMaster.middle, 'id', 'name');
        populateSmallFilterCheckboxes(state.closetMaster.small);
        populateDropdown('closet-filter-storage', state.closetMaster.storage, 'id', 'location');
        populateStatusFilterCheckboxes(state.closetMaster.statuses);
        populateCheckboxes(
            'closet-filter-color-container',
            state.closetMaster.colors,
            'filter-color',
            'id',
            'name'
        );

        populateCheckboxes(
            'closet-filter-mood-container',
            state.closetMaster.moods,
            'filter-mood',
            'id',
            'name'
        );

        const storageFilter = document.getElementById('closet-filter-storage');
        if (storageFilter) {
            storageFilter.options[0].textContent = '全ての保管ボックス';
        }

        populateCheckboxes('entry-color-container', state.closetMaster.colors, 'color', 'id', 'name');
        populateCheckboxes('entry-acquisition-container', state.closetMaster.acquisition, 'acquisition', 'id', 'name');
        populateCheckboxes('entry-mood-container', state.closetMaster.moods, 'mood', 'id', 'name');

        handleLargeCategoryChange();

        const largeCategory = document.getElementById('entry-large-category');
        if (largeCategory) {
            largeCategory.addEventListener('change', handleLargeCategoryChange);
        }

        const smallCategory = document.getElementById('entry-small-category');
        if (smallCategory) {
            smallCategory.addEventListener('change', updateSmallCategoryExample);
        }

        const filterLarge = document.getElementById('closet-filter-large');
        if (filterLarge) {
            filterLarge.addEventListener('change', handleClosetFilterLargeChange);
        }

        const filterMiddle = document.getElementById('closet-filter-middle');
        if (filterMiddle) {
            filterMiddle.addEventListener('change', handleClosetFilterMiddleChange);
        }

        handleClosetFilterLargeChange();

        renderStorageBoxes();
        renderGuideTables();
    } catch (error) {
        console.error('マスタデータ取得エラー', error);
    }
}

// ==========================================
// マスタ名取得
// ==========================================
function getLargeCategoryName(id) {
    return state.closetMaster.large.find(x => x.id === id)?.name || '-';
}

function getMiddleCategoryName(id) {
    return state.closetMaster.middle.find(x => x.id === id)?.name || '-';
}

function getSmallCategoryName(id) {
    return state.closetMaster.small.find(x => x.id === id)?.name || '-';
}

function getStorageBoxName(id) {
    const box = state.closetMaster.storage.find(x => x.id === id);
    if (!box) return "-";
    return `📦 ${box.code}　📍 ${box.location}`;
}

function populateDropdown(elementId, data, valKey, textKey) {
    const el = document.getElementById(elementId);
    if (!el) return;

    let firstText = '選択';

    if (elementId.startsWith('closet-filter-')) {
        if (elementId === 'closet-filter-large') firstText = '全ての大項目';
        if (elementId === 'closet-filter-middle') firstText = '全ての中項目';
        if (elementId === 'closet-filter-small') firstText = '全ての小項目';
    }

    el.innerHTML = `<option value="">${firstText}</option>`;

    data.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item[valKey];

        if (elementId === 'entry-storage') {
            opt.textContent = `${item.code}：${item.location}`;
        } else {
            opt.textContent = item[textKey];
        }

        el.appendChild(opt);
    });
}

function populateCheckboxes(containerId, data, namePrefix, valKey, textKey) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    data.forEach(item => {
        const label = document.createElement('label');
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        label.style.gap = '4px';
        label.style.cursor = 'pointer';
        label.style.fontSize = '0.85rem';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.name = namePrefix;
        checkbox.value = item[valKey];

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(item[textKey]));
        container.appendChild(label);
    });
}

function populateSmallFilterCheckboxes(items) {

    const container = document.getElementById('closet-filter-small-container');
    if (!container) return;

    container.innerHTML = '';

    items
        .sort((a, b) => a.sort_order - b.sort_order)
        .forEach(item => {

        const label = document.createElement('label');
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        label.style.gap = '4px';

        label.innerHTML = `
            <input
                type="checkbox"
                value="${item.id}"
                class="filter-small-checkbox">
            ${item.name}
        `;

        const checkbox = label.querySelector('input');

        checkbox.addEventListener('change', renderClosetItems);

        container.appendChild(label);

    });

}

function populateStatusFilterCheckboxes(items) {
    const container = document.getElementById('closet-filter-status-container');
    if (!container) return;

    container.innerHTML = '';

    items
        .sort((a, b) => a.sort_order - b.sort_order)
        .forEach(item => {
            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.gap = '4px';

            label.innerHTML = `
                <input
                    type="checkbox"
                    class="filter-status-checkbox"
                    value="${item.id}">
                ${item.name}
            `;

            const checkbox = label.querySelector('input');
            checkbox.addEventListener('change', renderClosetItems);

            container.appendChild(label);
        });
}

function handleClosetFilterLargeChange() {
    const largeSelect = document.getElementById('closet-filter-large');
    const middleSelect = document.getElementById('closet-filter-middle');
    const middleWrapper = document.getElementById('closet-filter-middle-wrapper');

    if (!largeSelect || !middleSelect) return;

    const largeId = largeSelect.value;
    const selectedOption = largeSelect.options[largeSelect.selectedIndex];

    console.log(selectedOption?.text);

    if (middleWrapper) {
        if (selectedOption && selectedOption.text.trim() === '衣裳') {
            middleWrapper.style.display = 'block';
        } else {
            middleWrapper.style.display = 'none';
            middleSelect.value = '';
        }
    }

    const middleList = largeId
        ? state.closetMaster.middle.filter(x => String(x.large_category_id) === String(largeId))
        : state.closetMaster.middle;

    const smallList = largeId
        ? state.closetMaster.small.filter(x => String(x.large_category_id) === String(largeId))
        : state.closetMaster.small;

    populateDropdown('closet-filter-middle', middleList, 'id', 'name');
    populateSmallFilterCheckboxes(smallList);

    middleSelect.value = '';

    renderClosetItems();
}

// アイテムの取得
async function loadClosetItems() {

    currentMember = getCurrentMember();

    if (!currentMember?.id) {
        alert('使用者を選択してください。');
        window.location.href = 'index.html#attendance-input';
        return;
    }
    if (!window.db) {
        console.warn('Supabaseクライアント (db) が見つかりません。');
        return;
    }
    
    try {
        const indicator = document.getElementById('sync-indicator');
        if (indicator) indicator.classList.remove('hidden');

        // マスタデータが未取得なら取得
        if (!state.closetMaster) {
            console.log("loadClosetMasterData start");
            await loadClosetMasterData();
            console.log(state.closetMaster);
        }
        
        // items テーブルと関連データの取得（API経由）
        const itemsData = await window.closetApi.fetchItems();

        if (itemsData.length > 0) {
            console.log("next=", itemsData[0].next_production_items);
        }

        if (typeof state !== 'undefined') {
            state.closetItems = itemsData;
        }
        
        // お気に入り一覧取得
        currentMember = getCurrentMember();

        if (currentMember?.id) {
            state.favoriteItems = await window.closetApi.fetchFavoriteItemIds(currentMember.id);
        } else {
            state.favoriteItems = [];
        }

        renderClosetItems();
    } catch (error) {
        console.error("備品データ取得エラー:", error);
        console.log("message =", error.message);
        console.log("details =", error.details);
        console.log("hint =", error.hint);
    } finally {
        const indicator = document.getElementById('sync-indicator');
        if (indicator) indicator.classList.add('hidden');
    }
}

// アイテム一覧の描画
function renderClosetItems() {
    const container = document.getElementById('closet-items-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    const items = typeof state !== 'undefined' ? state.closetItems : [];
    if (!items || items.length === 0) {
        container.innerHTML = '<p style="color: var(--text-sub);">登録されている備品がありません。</p>';
        return;
    }
    
    const textFilter = document.getElementById('closet-search-text')?.value.toLowerCase() || '';
    const numberFilter = document.getElementById('closet-search-number')?.value.toLowerCase() || '';

    const largeFilter = document.getElementById('closet-filter-large')?.value || '';
    const middleFilter = document.getElementById('closet-filter-middle')?.value || '';
    const selectedSmalls =
        Array.from(
            document.querySelectorAll('#closet-filter-small-container input:checked')
        ).map(cb => cb.value);
    const storageFilter = document.getElementById('closet-filter-storage')?.value || '';

    const selectedStatuses =
        Array.from(
            document.querySelectorAll('#closet-filter-status-container input:checked')
        ).map(cb => cb.value);

    const selectedColors =
        Array.from(
            document.querySelectorAll('#closet-filter-color-container input:checked')
        ).map(cb => cb.value);

    const selectedMoods =
        Array.from(
            document.querySelectorAll('#closet-filter-mood-container input:checked')
        ).map(cb => cb.value);

    const nextUsableFilter = document.getElementById('closet-filter-next-usable')?.value || '';
    const favoriteFilter = document.getElementById('closet-filter-favorite')?.value || '';
    const setFilter = document.getElementById('closet-filter-set')?.value || '';

    // 何も入力・選択されていないときは一覧を表示しない
    if (
        !textFilter &&
        !numberFilter &&
        !largeFilter &&
        !middleFilter &&
        selectedSmalls.length === 0 &&
        !storageFilter &&
        selectedStatuses.length === 0 &&
        selectedColors.length === 0 &&
        selectedMoods.length === 0 &&
        !nextUsableFilter &&
        !favoriteFilter &&
        !setFilter &&
        document.activeElement.id !== 'closet-search-text' &&
        document.activeElement.id !== 'closet-search-number'
    ) {

        container.innerHTML = `
            <p style="text-align:center;color:#888;padding:40px;">
                検索してください。
            </p>
        `;

        return;
    }
    
    const hasSearchCondition =
        textFilter ||
        numberFilter ||
        largeFilter ||
        middleFilter ||
        selectedSmalls.length > 0 ||
        storageFilter ||
        selectedStatuses.length > 0 ||
        selectedColors.length > 0 ||
        selectedMoods.length > 0 ||
        nextUsableFilter ||
        favoriteFilter ||
        setFilter;

    const filteredItems = items.filter(item => {
        const searchText = [
            item.name,
            item.size,
            item.usage_history,
            item.remarks,
            item.next_production_items?.comment
        ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

        const matchText =
            !textFilter ||
            searchText.includes(textFilter);
        const matchNumber = !numberFilter ||
                    (item.item_number && item.item_number.toLowerCase().includes(numberFilter));
        const matchLarge = !largeFilter || (item.large_category_id === largeFilter);
        const matchMiddle = !middleFilter || (item.middle_category_id === middleFilter);
        const matchSmall =
            selectedSmalls.length === 0 ||
            selectedSmalls.includes(item.small_category_id);

        const usable = item.next_production_items?.usable;

        const matchStorage =
            !storageFilter ||
            (item.storage_box_id === storageFilter);

        const matchStatus =
            selectedStatuses.length === 0 ||
            selectedStatuses.includes(item.status_id);

        const matchColor =
            selectedColors.length === 0 ||
            item.item_colors?.some(
                color => selectedColors.includes(color.color_id)
            );

        const matchMood =
            selectedMoods.length === 0 ||
            item.item_moods?.some(
                mood => selectedMoods.includes(mood.mood_id)
            );

        const matchNextUsable =
            !nextUsableFilter ||
            String(usable) === nextUsableFilter;

        const isFavorite = state.favoriteItems?.includes(item.id) ?? false;

        const matchFavorite =
            !favoriteFilter ||
            String(isFavorite) === favoriteFilter;

        const matchSet =
            !setFilter ||
            (
                setFilter === 'parent' &&
                item.is_set_item === true
            );

        return matchText &&
               matchNumber &&
               matchLarge &&
               matchMiddle &&
               matchSmall &&
               matchStorage &&
               matchStatus &&
               matchColor &&
               matchMood &&
               matchNextUsable &&
               matchFavorite &&
               matchSet;
    });

    if (!hasSearchCondition) {
        container.innerHTML = `
            <p style="text-align:center;color:#888;padding:40px;">
                検索してください。
            </p>
        `;
        return;
    }

    if (filteredItems.length === 0) {
        container.innerHTML = '<p style="color: var(--text-sub);">条件に一致する備品がありません。</p>';
        return;
    }

    const sortOrder = document.getElementById('closet-sort-order')?.value || 'management-asc';

    filteredItems.sort((a, b) => {

        if (sortOrder === 'management-asc') {
            return Number(a.management_number || 0) -
                   Number(b.management_number || 0);
        }

        if (sortOrder === 'name-asc') {
            return (a.name || '').localeCompare(
                b.name || '',
                'ja'
            );
        }

        if (sortOrder === 'updated-desc') {
            return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
        }

        return 0;
    });

    state.filteredClosetItems = filteredItems;
    
    console.log("favoriteItems =", state.favoriteItems);
    console.log("currentMember =", currentMember);
    filteredItems.forEach(item => {
        const card = document.createElement('div');
        card.className = 'closet-photo';
        
        let imageUrl = 'images/no-image.png';
        if (item.item_images && item.item_images.length > 0) {
            imageUrl = getImageUrl(
                item.item_images[0].storage_path,
                'item-images'
            );
        }

        const storageBox = state.closetMaster?.storage?.find(s => s.id === item.storage_box_id);
        const storageText = storageBox ? storageBox.location : '-';

        const isFavorite = state.favoriteItems?.includes(item.id);

        const isSelected = state.selectedItems && state.selectedItems.has(item.id);

        card.innerHTML = `
            <div style="
                position:relative;
                width:100%;
                aspect-ratio:1 / 1;
                overflow:hidden;
                background:#f5f5f5;
            ">
                
                <input type="checkbox" class="bulk-select-checkbox" 
                    ${isSelected ? 'checked' : ''}
                    onclick="event.stopPropagation(); toggleBulkSelection('${item.id}', this.checked)"
                    style="
                        position:absolute;
                        top:10px;
                        left:10px;
                        z-index:2;
                        width: 20px;
                        height: 20px;
                        cursor: pointer;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                    ">

                <i
                    class="${isFavorite ? 'fa-solid' : 'fa-regular'} fa-star"
                    onclick="event.stopPropagation(); toggleFavorite('${item.id}')"
                    style="
                        position:absolute;
                        top:10px;
                        right:10px;
                        z-index:2;
                        font-size:14px;
                        color:#ffffff;
                        text-shadow:
                            -1px 0 rgba(0,0,0,.35),
                            1px 0 rgba(0,0,0,.35),
                            0 -1px rgba(0,0,0,.35),
                            0 1px rgba(0,0,0,.35);
                        cursor:pointer;
                    ">
                </i>

                <div
                    style="
                        cursor:pointer;
                        width:100%;
                        height:100%;
                        display:flex;
                        align-items:center;
                        justify-content:center;
                    "
                    onclick="showClosetDetail('${item.id}')">

                    ${
                        item.item_images && item.item_images.length > 0
                        ? `
                            <img src="${imageUrl}"
                                loading="lazy"
                                alt="備品写真"
                                style="
                                    width:100%;
                                    height:100%;
                                    object-fit:cover;
                                    object-position:center;
                                    display:block;
                                ">
                        `
                        : `
                            <div style="
                                width:100%;
                                height:100%;
                                display:flex;
                                flex-direction:column;
                                justify-content:center;
                                align-items:center;
                                background:#f7f7f7;
                                border:1px solid #ddd;
                                box-sizing:border-box;
                                text-align:center;
                                padding:8px;
                                font-size:0.9rem;
                            ">
                                <div style="font-weight:bold; font-size:1rem;">
                                    ${item.item_number || '-'}
                                </div>

                                <div style="margin-top:8px;">
                                    ${item.name || '名称未登録'}
                                </div>
                            </div>
                        `
                    }

                </div>

            </div>
        `;
        container.appendChild(card);
    });
}

function toggleSetItemFields() {
    const isSet = document.getElementById('entry-is-set').checked;
    const fields = document.getElementById('set-item-fields');
    if (fields) {
        fields.style.display = isSet ? 'block' : 'none';
    }
}

function toggleLoanFields() {
    const statusId = document.getElementById('entry-status').value;

    const loanFields = document.getElementById('loan-fields');
    const disposedField = document.getElementById('disposed-field');
    const lostField = document.getElementById('lost-field');

    if (!loanFields || !disposedField || !lostField) return;

    const statuses = state.closetMaster.statuses || [];

    const loanId = statuses.find(s => s.name === '貸出中')?.id;
    const disposedId = statuses.find(s => s.name === '破棄')?.id;
    const lostId = statuses.find(s => s.name === '紛失')?.id;

    loanFields.style.display = statusId === loanId ? 'block' : 'none';
    disposedField.style.display = statusId === disposedId ? 'block' : 'none';
    lostField.style.display = statusId === lostId ? 'block' : 'none';
}

function handleLargeCategoryChange() {
    const largeSelect = document.getElementById('entry-large-category');
    const middleSelect = document.getElementById('entry-middle-category');
    const smallSelect = document.getElementById('entry-small-category');
    const middleWrapper = document.getElementById('middle-category-wrapper');

    if (!largeSelect) return;

    const largeId = largeSelect.value;
    const selectedOption = largeSelect.options[largeSelect.selectedIndex];

    if (middleWrapper) {
        if (selectedOption && selectedOption.text.trim() === '衣裳') {
            middleWrapper.style.display = 'block';
        } else {
            middleWrapper.style.display = 'none';
            if (middleSelect) middleSelect.value = '';
        }
    }

    const middleList = (state.closetMaster.middle || []).filter(
        x => String(x.large_category_id) === String(largeId)
    );

    const smallList = (state.closetMaster.small || []).filter(
        x => String(x.large_category_id) === String(largeId)
    );

    populateDropdown('entry-middle-category', middleList, 'id', 'name');
    populateDropdown('entry-small-category', smallList, 'id', 'name');

    if (middleSelect) middleSelect.value = '';
    if (smallSelect) smallSelect.value = '';

    updateSmallCategoryExample();
}

function updateSmallCategoryExample() {
    const smallId = document.getElementById('entry-small-category').value;
    const example = document.getElementById('entry-small-category-example');

    if (!example) return;

    const item = (state.closetMaster.small || []).find(x => x.id === smallId);

    example.textContent = item?.example || '';
}

// 新規備品データまたは更新データの保存
async function submitClosetEntry() {

    if (TREASURE_MODE) {

        if (selectedImages.length === 0) {
            alert('写真を登録してください。');
            return;
        }

        if (!document.getElementById('entry-large-category').value) {
            alert('大項目を選択してください。');
            return;
        }

        if (!document.getElementById('entry-storage').value) {
            alert('保管ボックスを選択してください。');
            return;
        }

        if (!document.getElementById('entry-status').value) {
            alert('管理状態を選択してください。');
            return;
        }

        const statusSelect = document.getElementById('entry-status');

        const statusText =
            statusSelect.selectedOptions.length
                ? statusSelect.selectedOptions[0].textContent
                : '';

        if (
            statusText.includes('貸出') &&
            !document.getElementById('entry-loan-to').value.trim()
        ) {
            alert('貸出先を入力してください。');
            document.getElementById('entry-loan-to').focus();
            return;
        }
    }
    if (!window.db) {
        alert('データベースに接続されていません。');
        return;
    }

    const name = document.getElementById('entry-name').value.trim();
    const largeCat = document.getElementById('entry-large-category').value;
    const middleCat = document.getElementById('entry-middle-category').value;
    const smallCat = document.getElementById('entry-small-category').value;
    const size = document.getElementById('entry-size').value.trim();
    const storageBoxId = document.getElementById('entry-storage').value;
    const usageHistory = document.getElementById('entry-usage-history').value.trim();
    const statusId = document.getElementById('entry-status').value;
    const loanTo = document.getElementById('entry-loan-to').value.trim();
    const loanDate = document.getElementById('entry-loan-date').value;
    const returnDueDate = document.getElementById('entry-return-date').value;
    const disposedDate = document.getElementById('entry-disposed-date').value;
    const lostDate = document.getElementById('entry-lost-date').value;
    const lastUsedDate = document.getElementById('entry-last-used-date').value;
    const purchaseDate = document.getElementById('entry-purchase-date').value;
    const purchasePrice = document.getElementById('entry-purchase-price').value;
    const remarks = document.getElementById('entry-remarks').value.trim();

    const nextUsable =
        document.getElementById('entry-next-usable').checked;

    const nextComment =
        document.getElementById('entry-next-comment').value.trim();
    
    const isSetItem = document.getElementById('entry-is-set').checked;
    let parentItemNumber = null;
    let setQuantity = null;

    if (isSetItem) {
        const parentInput = document.getElementById('entry-parent-number');

        if (parentInput) {
            parentItemNumber = parentInput.value.trim();
        }

        setQuantity = parseInt(document.getElementById('entry-set-quantity').value, 10);
    }

    if (!largeCat) {
        alert('大項目を選択してください。');
        return;
    }

    try {
        const indicator = document.getElementById('sync-indicator');
        if (indicator) indicator.classList.remove('hidden');

        // ※ ID と item_number はDBのトリガーで自動採番される前提
        const itemDataPayload = {
            name: name || null,
            large_category_id: largeCat || null,
            middle_category_id: middleCat || null,
            small_category_id: smallCat || null,
            size: size,
            storage_box_id: storageBoxId || null,

            created_by: currentEditingItemId ? undefined : currentMember?.id || null,
            updated_by: currentMember?.id || null,

            usage_history: usageHistory || null,
            status_id: statusId || null,
            loan_to: loanTo || null,
            loan_date: loanDate || null,
            return_due_date: returnDueDate || null,
            disposed_date: disposedDate || null,
            lost_date: lostDate || null,
            last_used_date: lastUsedDate || null,
            purchase_date: purchaseDate || null,
            purchase_price: purchasePrice || null,

            remarks: remarks,

            is_set_item: isSetItem,
            parent_item_number:
                isSetItem && parentItemNumber
                    ? parentItemNumber
                    : null,
            set_child_no: null,
            set_quantity: isSetItem && !isNaN(setQuantity) ? setQuantity : 1
        };

        let insertedItem;
        let newlyInsertedItems = [];

        if (currentEditingItemId) {

            const originalItem = state.closetItems.find(
                x => String(x.id) === String(currentEditingItemId)
            );

            const wasSet = !!(originalItem && originalItem.is_set_item);
            const willBeSet = isSetItem;

            if (!wasSet && !willBeSet) {

                // 通常品 → 通常品
                insertedItem = await window.closetApi.updateItem(currentEditingItemId, itemDataPayload);
                await window.closetApi.deleteItemRelations(currentEditingItemId);

            } else if (!wasSet && willBeSet) {

                if (!confirm('通常品をセット品へ変更しますか？')) {
                    return;
                }

                const parentNumber = originalItem.item_number;

                // 枝番-01 の作成（元のアイテムをUPDATE）
                insertedItem = await window.closetApi.updateItem(currentEditingItemId, {
                    ...itemDataPayload,
                    is_set_item: true,
                    parent_item_number: parentNumber,
                    item_number: `${parentNumber}-01`,
                    set_child_no: 1,
                    set_quantity: setQuantity,
                    updated_by: window.currentMember ? window.currentMember.id : null,
                    updated_at: new Date().toISOString()
                });
                insertedItem.item_number = `${parentNumber}-01`;

                await window.closetApi.deleteItemRelations(currentEditingItemId);

                // 枝番-02 以降の作成（INSERT）
                for (let i = 2; i <= setQuantity; i++) {
                    const branchNoStr = i.toString().padStart(2, '0');
                    const newItem = await window.closetApi.insertItem({
                        ...itemDataPayload,
                        is_set_item: true,
                        parent_item_number: parentNumber,
                        item_number: `${parentNumber}-${branchNoStr}`,
                        set_child_no: i,
                        set_quantity: setQuantity,
                        created_by: window.currentMember ? window.currentMember.id : null,
                        updated_by: window.currentMember ? window.currentMember.id : null
                    });
                    newlyInsertedItems.push(newItem);
                }

            } else if (wasSet && !willBeSet) {

                if (!confirm('セット品を通常品へ変更しますか？')) {
                    return;
                }

                const setItems = await window.closetApi.fetchSetItems(originalItem.parent_item_number);
                const selectedItemId = await showUnsetSetModal(setItems);

                if (!selectedItemId) {
                    return;
                }

                const keepItem = setItems.find(item => String(item.id) === String(selectedItemId));
                if (!keepItem) {
                    throw new Error('選択した子番号が見つかりません。');
                }

                // 選択されなかったアイテムを削除
                const itemsToDelete = setItems.filter(item => String(item.id) !== String(selectedItemId));
                for (const item of itemsToDelete) {
                    await window.closetApi.deleteItem(item.id);
                }

                // 選択されたアイテムを通常品に戻す（枝番を外して親番号にする）
                insertedItem = await window.closetApi.updateItem(keepItem.id, {
                    ...itemDataPayload,
                    is_set_item: false,
                    parent_item_number: null,
                    item_number: originalItem.parent_item_number,
                    set_child_no: null,
                    set_quantity: 1,
                    updated_by: window.currentMember ? window.currentMember.id : null,
                    updated_at: new Date().toISOString()
                });
                insertedItem.item_number = originalItem.parent_item_number;

                await window.closetApi.deleteItemRelations(keepItem.id);

            } else {

                const oldQty = originalItem.set_quantity || 1;
                const newQty = setQuantity || 1;
                const parentNumber = originalItem.parent_item_number;

                const setItems = await window.closetApi.fetchSetItems(parentNumber);

                if (oldQty === newQty) {
                    // 数量変更なし - 現在編集中のアイテムのみ全項目UPDATE、他はset_quantity等のみ
                    for (const item of setItems) {
                        if (item.id === currentEditingItemId) {
                            const updated = await window.closetApi.updateItem(item.id, {
                                ...itemDataPayload,
                                is_set_item: true,
                                parent_item_number: parentNumber,
                                item_number: item.item_number,
                                set_child_no: item.set_child_no,
                                updated_by: window.currentMember ? window.currentMember.id : null,
                                updated_at: new Date().toISOString()
                            });
                            await window.closetApi.deleteItemRelations(item.id);
                            insertedItem = updated;
                            insertedItem.item_number = item.item_number;
                        } else {
                            await window.closetApi.updateItem(item.id, {
                                set_quantity: newQty,
                                updated_by: window.currentMember ? window.currentMember.id : null,
                                updated_at: new Date().toISOString()
                            });
                        }
                    }
                    if (!insertedItem) insertedItem = await window.closetApi.fetchFirstSetItem(parentNumber);

                } else if (newQty > oldQty) {
                    // 数量増加
                    // 既存の最大枝番を取得
                    let maxChildNo = 0;
                    setItems.forEach(item => {
                        if (item.set_child_no > maxChildNo) maxChildNo = item.set_child_no;
                    });

                    // 既存分をUPDATE
                    for (const item of setItems) {
                        if (item.id === currentEditingItemId) {
                            const updated = await window.closetApi.updateItem(item.id, {
                                ...itemDataPayload,
                                is_set_item: true,
                                parent_item_number: parentNumber,
                                item_number: item.item_number,
                                set_child_no: item.set_child_no,
                                set_quantity: newQty,
                                updated_by: window.currentMember ? window.currentMember.id : null,
                                updated_at: new Date().toISOString()
                            });
                            await window.closetApi.deleteItemRelations(item.id);
                            insertedItem = updated;
                            insertedItem.item_number = item.item_number;
                        } else {
                            await window.closetApi.updateItem(item.id, {
                                set_quantity: newQty,
                                updated_by: window.currentMember ? window.currentMember.id : null,
                                updated_at: new Date().toISOString()
                            });
                        }
                    }

                    // 増える分だけINSERT
                    const addCount = newQty - oldQty;
                    for (let i = 1; i <= addCount; i++) {
                        const newChildNo = maxChildNo + i;
                        const branchNoStr = newChildNo.toString().padStart(2, '0');
                        const newItem = await window.closetApi.insertItem({
                            ...itemDataPayload,
                            is_set_item: true,
                            parent_item_number: parentNumber,
                            item_number: `${parentNumber}-${branchNoStr}`,
                            set_child_no: newChildNo,
                            set_quantity: newQty,
                            created_by: window.currentMember ? window.currentMember.id : null,
                            updated_by: window.currentMember ? window.currentMember.id : null
                        });
                        newlyInsertedItems.push(newItem);
                    }
                    if (!insertedItem) insertedItem = await window.closetApi.fetchFirstSetItem(parentNumber);

                } else {
                    // 数量減少
                    const keepIds = await showSetQuantityModal(setItems, newQty);
                    if (!keepIds) return;

                    const itemsToDelete = setItems.filter(item => !keepIds.includes(String(item.id)));
                    for (const item of itemsToDelete) {
                        await window.closetApi.deleteItem(item.id);
                    }

                    const itemsToKeep = setItems.filter(item => keepIds.includes(String(item.id)));
                    for (const item of itemsToKeep) {
                        if (item.id === currentEditingItemId) {
                            const updated = await window.closetApi.updateItem(item.id, {
                                ...itemDataPayload,
                                is_set_item: true,
                                parent_item_number: parentNumber,
                                item_number: item.item_number,
                                set_child_no: item.set_child_no,
                                set_quantity: newQty,
                                updated_by: window.currentMember ? window.currentMember.id : null,
                                updated_at: new Date().toISOString()
                            });
                            await window.closetApi.deleteItemRelations(item.id);
                            insertedItem = updated;
                            insertedItem.item_number = item.item_number;
                        } else {
                            await window.closetApi.updateItem(item.id, {
                                set_quantity: newQty,
                                updated_by: window.currentMember ? window.currentMember.id : null,
                                updated_at: new Date().toISOString()
                            });
                        }
                    }
                    if (!insertedItem) insertedItem = await window.closetApi.fetchFirstSetItem(parentNumber);
                }
            }

        } else {
            // 新規作成時
            if (isSetItem) {
                // まず通常品として1つ目をINSERTし、自動採番されたitem_numberを取得する
                const tempPayload = { ...itemDataPayload, is_set_item: false, parent_item_number: null, set_child_no: null };
                const firstItem = await window.closetApi.insertItem(tempPayload);
                const parentNumber = firstItem.item_number; // DBで自動採番された番号
                
                // 1つ目をUPDATEして枝番-01にする
                insertedItem = await window.closetApi.updateItem(firstItem.id, {
                    is_set_item: true,
                    parent_item_number: parentNumber,
                    item_number: `${parentNumber}-01`,
                    set_child_no: 1,
                    set_quantity: setQuantity
                });
                insertedItem.item_number = `${parentNumber}-01`;

                // 2つ目以降をINSERT
                for (let i = 2; i <= setQuantity; i++) {
                    const branchNoStr = i.toString().padStart(2, '0');
                    const newItem = await window.closetApi.insertItem({
                        ...itemDataPayload,
                        is_set_item: true,
                        parent_item_number: parentNumber,
                        item_number: `${parentNumber}-${branchNoStr}`,
                        set_child_no: i,
                        set_quantity: setQuantity,
                        created_by: window.currentMember ? window.currentMember.id : null,
                        updated_by: window.currentMember ? window.currentMember.id : null
                    });
                    newlyInsertedItems.push(newItem);
                }

            } else {
                insertedItem = await window.closetApi.insertItem(itemDataPayload);
            }
        }
        
        let targetItems = [insertedItem];
        if (newlyInsertedItems.length > 0) {
            targetItems = targetItems.concat(newlyInsertedItems);
        }

        // 中間テーブルへInsert
        const checkedColors = Array.from(document.querySelectorAll('input[name="color"]:checked')).map(cb => cb.value);
        const checkedAcqs = Array.from(document.querySelectorAll('input[name="acquisition"]:checked')).map(cb => cb.value);
        const checkedMoods = Array.from(document.querySelectorAll('input[name="mood"]:checked')).map(cb => cb.value);
        
        if (checkedColors.length > 0) {

            const colorRows = [];

            targetItems.forEach(item => {
                checkedColors.forEach(colorId => {
                    colorRows.push({
                        item_id: item.id,
                        color_id: colorId
                    });
                });
            });

            await window.closetApi.insertColors(colorRows);
        }

        if (checkedAcqs.length > 0) {

            const acqRows = [];

            targetItems.forEach(item => {
                checkedAcqs.forEach(acquisitionId => {
                    acqRows.push({
                        item_id: item.id,
                        acquisition_method_id: acquisitionId
                    });
                });
            });

            await window.closetApi.insertAcquisitions(acqRows);
        }

        if (checkedMoods.length > 0) {

            const moodRows = [];

            targetItems.forEach(item => {
                checkedMoods.forEach(moodId => {
                    moodRows.push({
                        item_id: item.id,
                        mood_id: moodId
                    });
                });
            });

            await window.closetApi.insertMoods(moodRows);
        }
        
        // 次回の公演情報を保存
        const nextProductionRows = targetItems.map(item => ({
            item_id: item.id,
            usable: nextUsable,
            comment: nextComment || null,
            updated_by: currentMember?.id || null,
            created_by: currentMember?.id || null
        }));
        await window.closetApi.upsertNextProductionItems(nextProductionRows);

        for (const item of targetItems) {

            await saveItemImages(
                item.id,
                currentEditingItemId !== null
            );

        }

        alert(currentEditingItemId ? '備品を更新しました！' : '備品を登録しました！');

        // 作成者・更新者名を取得するため再取得
        try {
            const latestItem = await window.closetApi.fetchItemWithRelations(insertedItem.id);
            if (latestItem) insertedItem = latestItem;
        } catch (e) {
            console.warn('Failed to fetch related data:', e);
        }

        // 登録情報を表示
        document.getElementById('item-info-panel').style.display = 'block';

        if (!insertedItem) {
            console.error('登録データ取得失敗');
            return;
        }

        // データを再取得して一覧を更新
        await loadClosetItems();

        // 登録した最新データを取得
        const latest = state.closetItems.find(i => String(i.id) === String(insertedItem.id));

        if (latest) {
            currentEditingItemId = latest.id;
            editClosetItem(latest.id);
        }

    } catch (error) {
        console.error("備品保存エラー:", error);
        alert(error.message || JSON.stringify(error));
    } finally {
        const indicator = document.getElementById('sync-indicator');
        if (indicator) indicator.classList.add('hidden');
    }
}

// フォームをリセットし、新規登録状態に戻す
function resetClosetEntryForm(clearInfo = true) {
    console.log('resetClosetEntryForm');

    currentEditingItemId = null;
    hasEditChanges = false;

    const notice = document.getElementById('treasure-mode-notice');
    if (notice) {
        notice.style.display = TREASURE_MODE ? 'block' : 'none';
    }

    // 削除ボタンを非表示
    document.getElementById('delete-item-btn').style.display = 'none';

    if (clearInfo) {
        // 管理情報を非表示
        document.getElementById('item-info-panel').style.display = 'none';
        document.getElementById('item-management-panel').style.display = 'none';

        document.getElementById('info-management-number').textContent = '-';
    }

    const form = document.getElementById('closet-entry-form');
    if (form) {
        form.reset();
        form.style.display = 'block';
    }
    const entryCard = document.getElementById('closet-entry-card');
    if (entryCard) entryCard.style.display = 'block';
    const detailView = document.getElementById('closet-detail-view');
    if (detailView) {
        detailView.style.display = 'none';
    }

    clearSelectedImages();

    document.getElementById('entry-next-usable').checked = false;
    document.getElementById('entry-next-comment').value = '';

    toggleLoanFields();
    
    // チェックボックスもリセット
    document.querySelectorAll('#closet-entry-form input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
    });
    
    toggleSetItemFields();
    handleLargeCategoryChange();
    
    // UIを「登録」に戻す
    const headerTitle = document.querySelector('#closet-entry .section-header h2');
    if (headerTitle) {
        headerTitle.innerHTML = '<i class="fa-solid fa-square-plus"></i> 備品登録';
    }

    const submitBtn = document.querySelector('#closet-entry-form button[type="submit"]');
    if (submitBtn) {
        submitBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> 登録する';
    }

    // キャンセル・新規登録ボタンを非表示
    const cancelBtn = document.getElementById('cancel-edit-btn');
    if (cancelBtn) {
        cancelBtn.style.display = 'none';
    }

    const newEntryBtn = document.getElementById('new-entry-btn');
    if (newEntryBtn) {
        newEntryBtn.style.display = 'none';
    }
}

// ==========================================
// アイテム詳細表示
// ==========================================
function showClosetDetail(id) {

    const displayItems = state.filteredClosetItems || state.closetItems;

    const currentIndex = displayItems.findIndex(i => i.id === id);

    const item = displayItems[currentIndex];
    if (!item) return;

    document.getElementById('closet-detail-view').style.display = 'block';
    const entryCard = document.getElementById('closet-entry-card');
    if (entryCard) entryCard.style.display = 'none';
    const entryForm = document.getElementById('closet-entry-form');
    if (entryForm) entryForm.style.display = 'none';

    const contentArea = document.getElementById('detail-content-area');

    const imageUrls = (item.item_images || []).map(image => getImageUrl(image.storage_path));
    const imageUrl = imageUrls.length ? imageUrls[0] : '';
    const categoryText = [getLargeCategoryName(item.large_category_id), getMiddleCategoryName(item.middle_category_id), getSmallCategoryName(item.small_category_id)].filter(x=>x&&x!=='-').join(' ＞ ');
    const colorsText = (item.item_colors || []).map(c => state.closetMaster.colors.find(x => x.id === c.color_id)?.name).filter(Boolean).join('・') || '-';
    const acqText = (item.item_acquisition_methods || []).map(a => state.closetMaster.acquisition.find(x => x.id === a.acquisition_method_id)?.name).filter(Boolean).join('・') || '-';
    const moodsText = (item.item_moods || []).map(m => state.closetMaster.moods.find(x => x.id === m.mood_id)?.name).filter(Boolean).join('・') || '-';

    contentArea.innerHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
            <div style="font-size: 2rem; font-weight: bold; color: var(--accent-pink, #e83e8c); letter-spacing: 1px;">${item.management_number || item.item_number || '-'}</div>
            <div style="font-size: 1.2rem; font-weight: bold; color: var(--text-main); margin-top: 5px;">${item.name || '-'}</div>
        </div>

        <div style="margin-bottom: 20px;">
            ${imageUrl
                ? `
                    <img id="detail-main-image"
                        src="${imageUrl}"
                        style="width:100%; border-radius:12px; object-fit:cover; max-height:400px;"
                        alt="">

                    ${imageUrls.length > 1 ? `
                        <div style="display:flex; gap:8px; margin-top:10px; overflow-x:auto;">
                            ${imageUrls.map(url => `
                                <img
                                    src="${url}"
                                    style="
                                        width:70px;
                                        height:70px;
                                        object-fit:cover;
                                        border-radius:8px;
                                        border:2px solid transparent;
                                        cursor:pointer;
                                    "
                                    class="detail-thumbnail">
                            `).join('')}
                        </div>
                    ` : ''}
                `
                : `<div style="
                    width:100%;
                    height:200px;
                    background:#f9f9f9;
                    border-radius:12px;
                    display:flex;
                    align-items:center;
                    justify-content:center;">
                    画像なし
                </div>`
            }
        </div>

        <div style="margin-bottom: 20px; padding: 15px; border-radius: 12px; background: white; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">

            <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
                <i class="fa-solid fa-shirt" style="color:var(--accent-pink,#e83e8c); width:20px; text-align:center;"></i>
                <span>
                    ${[
                        getLargeCategoryName(item.large_category_id),
                        getMiddleCategoryName(item.middle_category_id),
                        getSmallCategoryName(item.small_category_id)
                    ].filter(name => name && name !== '-').join(' ＞ ')}
                </span>
            </div>

            <div style="display:flex; align-items:center; gap:10px; border-top:1px dashed #eee; padding-top:12px; margin-bottom:12px;">
                <i class="fa-solid fa-layer-group" style="color:var(--accent-pink,#e83e8c); width:20px; text-align:center;"></i>
                <span>セット品：${item.is_set_item ? '〇' : '×'}</span>
            </div>

            ${item.is_set_item ? `
                <div style="display:flex; align-items:center; gap:10px; border-top:1px dashed #eee; padding-top:12px; margin-bottom:12px;">
                    <i class="fa-solid fa-hashtag" style="color:var(--accent-pink,#e83e8c); width:20px; text-align:center;"></i>
                    <span>数量：${item.set_quantity || '-'}</span>
                </div>
            ` : ''}

            <div style="display:flex; align-items:center; gap:10px; border-top:1px dashed #eee; padding-top:12px; margin-bottom:12px;">
                <i class="fa-solid fa-box-archive" style="color:var(--accent-pink,#e83e8c); width:20px; text-align:center;"></i>
                <span>${getStorageBoxName(item.storage_box_id)}</span>
            </div>

            <div style="display:flex; align-items:center; gap:10px; border-top:1px dashed #eee; padding-top:12px;">
                <i class="fa-solid fa-circle-check" style="color:var(--accent-pink,#e83e8c); width:20px; text-align:center;"></i>
                <span>${state.closetMaster.statuses.find(s => s.id === item.status_id)?.name || '-'}</span>
            </div>

        </div>

        <div style="margin-bottom: 20px; padding: 15px; border-radius: 12px; background: white; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">

            <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
                <i class="fa-solid fa-circle-question" style="color:#8b5cf6; width:20px; text-align:center;"></i>
                <span>次回公演で使えそう：${item.next_production_items?.usable ? '〇' : '×'}</span>
            </div>

            <div style="display:flex; align-items:center; gap:10px; border-top:1px dashed #eee; padding-top:12px; margin-bottom:12px;">
                <i class="fa-solid fa-comment-dots" style="color:#8b5cf6; width:20px; text-align:center;"></i>
                <span>使えるとしたら：${item.next_production_items?.comment || '-'}</span>
            </div>

            <div style="display:flex; align-items:center; gap:10px; border-top:1px dashed #eee; padding-top:12px; margin-bottom:12px;">
                <i class="fa-solid fa-masks-theater" style="color:#8b5cf6; width:20px; text-align:center;"></i>
                <span>${item.usage_history || '-'}</span>
            </div>

            <div style="display:flex; align-items:center; gap:10px; border-top:1px dashed #eee; padding-top:12px;">
                <i class="fa-solid fa-note-sticky" style="color:#8b5cf6; width:20px; text-align:center;"></i>
                <span>${item.remarks || '-'}</span>
            </div>

        </div>

        <div style="margin-bottom: 20px; padding: 15px; border-radius: 12px; background: white; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">

            <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
                <i class="fa-solid fa-ruler" style="color:#f59e0b; width:20px; text-align:center;"></i>
                <span>${item.size || '-'}</span>
            </div>

            <div style="display:flex; align-items:center; gap:10px; border-top:1px dashed #eee; padding-top:12px; margin-bottom:12px;">
                <i class="fa-solid fa-wand-magic-sparkles" style="color:#f59e0b; width:20px; text-align:center;"></i>
                <span>${moodsText}</span>
            </div>

            <div style="display:flex; align-items:center; gap:10px; border-top:1px dashed #eee; padding-top:12px;">
                <i class="fa-solid fa-palette" style="color:#f59e0b; width:20px; text-align:center;"></i>
                <span>${colorsText}</span>
            </div>

        </div>

        <details style="margin-bottom:20px;">
            <summary style="
                cursor:pointer;
                padding:15px;
                background:#f7f7f7;
                border-radius:12px;
                font-weight:bold;
            ">
                詳細情報
            </summary>

            <div style="
                margin-top:12px;
                padding:15px;
                border-radius:12px;
                background:#fff;
                box-shadow:0 4px 15px rgba(0,0,0,.05);
            ">

                <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
                    <i class="fa-solid fa-cart-shopping" style="width:20px;"></i>
                    <span>入手方法：${acqText}</span>
                </div>

                <div style="display:flex; align-items:center; gap:10px; border-top:1px dashed #eee; padding-top:12px; margin-bottom:12px;">
                    <i class="fa-solid fa-calendar-plus" style="width:20px;"></i>
                    <span>入手日：${item.purchase_date ? item.purchase_date.replace(/-/g,'/') : '-'}</span>
                </div>

                <div style="display:flex; align-items:center; gap:10px; border-top:1px dashed #eee; padding-top:12px; margin-bottom:12px;">
                    <i class="fa-solid fa-yen-sign" style="width:20px;"></i>
                    <span>価格：${item.purchase_price ? Number(item.purchase_price).toLocaleString() + '円' : '-'}</span>
                </div>

                <div style="display:flex; align-items:center; gap:10px; border-top:1px dashed #eee; padding-top:12px; margin-bottom:12px;">
                    <i class="fa-solid fa-handshake" style="width:20px;"></i>
                    <span>貸出先：${item.loan_to || '-'}</span>
                </div>

                <div style="display:flex; align-items:center; gap:10px; border-top:1px dashed #eee; padding-top:12px; margin-bottom:12px;">
                    <i class="fa-solid fa-calendar-day" style="width:20px;"></i>
                    <span>貸出日：${item.loan_date ? item.loan_date.replace(/-/g,'/') : '-'}</span>
                </div>

                <div style="display:flex; align-items:center; gap:10px; border-top:1px dashed #eee; padding-top:12px; margin-bottom:12px;">
                    <i class="fa-solid fa-calendar-check" style="width:20px;"></i>
                    <span>返却予定日：${item.return_due_date ? item.return_due_date.replace(/-/g,'/') : '-'}</span>
                </div>

                <div style="display:flex; align-items:center; gap:10px; border-top:1px dashed #eee; padding-top:12px; margin-bottom:12px;">
                    <i class="fa-solid fa-trash" style="width:20px;"></i>
                    <span>破棄日：${item.disposed_date ? item.disposed_date.replace(/-/g,'/') : '-'}</span>
                </div>

                <div style="display:flex; align-items:center; gap:10px; border-top:1px dashed #eee; padding-top:12px; margin-bottom:12px;">
                    <i class="fa-solid fa-triangle-exclamation" style="width:20px;"></i>
                    <span>紛失日：${item.lost_date ? item.lost_date.replace(/-/g,'/') : '-'}</span>
                </div>

                <div style="display:flex; align-items:center; gap:10px; border-top:1px dashed #eee; padding-top:12px; margin-bottom:12px;">
                    <i class="fa-solid fa-calendar-days" style="width:20px;"></i>
                    <span>最終使用日：${item.last_used_date ? item.last_used_date.replace(/-/g,'/') : '-'}</span>
                </div>

                <div style="display:flex; align-items:center; gap:10px; border-top:1px dashed #eee; padding-top:12px; margin-bottom:12px;">
                    <i class="fa-solid fa-user-plus" style="width:20px;"></i>
                    <span>作成者：${item.created_by || '-'}</span>
                </div>

                <div style="display:flex; align-items:center; gap:10px; border-top:1px dashed #eee; padding-top:12px; margin-bottom:12px;">
                    <i class="fa-solid fa-clock" style="width:20px;"></i>
                    <span>作成日時：${formatDateTime(item.created_at) || '-'}</span>
                </div>

                <div style="display:flex; align-items:center; gap:10px; border-top:1px dashed #eee; padding-top:12px; margin-bottom:12px;">
                    <i class="fa-solid fa-user-pen" style="width:20px;"></i>
                    <span>更新者：${item.updated_by || '-'}</span>
                </div>

                <div style="display:flex; align-items:center; gap:10px; border-top:1px dashed #eee; padding-top:12px;">
                    <i class="fa-solid fa-clock-rotate-left" style="width:20px;"></i>
                    <span>更新日時：${formatDateTime(item.updated_at) || '-'}</span>
                </div>

            </div>

        </details>
    `;

    const entryTabBtn = document.querySelector('[data-tab="closet-entry"]');
    if (entryTabBtn) {
        entryTabBtn.click();
    }

    window.scrollTo({
        top: 0,
        behavior: 'auto'
    });

    const backBtn = document.getElementById('detail-back-btn');

    if (backBtn) {
        backBtn.onclick = () => {

            document.getElementById('closet-detail-view').style.display = 'none';
            const entryCard = document.getElementById('closet-entry-card');
            if (entryCard) entryCard.style.display = 'block';

            const headerTitle = document.querySelector('#closet-entry .section-header h2');
            if (headerTitle) {
                headerTitle.innerHTML =
                    '<i class="fa-solid fa-shirt"></i> 備品登録';
            }

            const listTabBtn = document.querySelector('[data-tab="closet-list"]');
            if (listTabBtn) {
                listTabBtn.click();
            }

        };
    }

    document.querySelectorAll('.detail-thumbnail').forEach(img => {

        img.onclick = () => {

            document.getElementById('detail-main-image').src = img.src;

            document.querySelectorAll('.detail-thumbnail').forEach(thumbnail => {
                thumbnail.style.border = '2px solid transparent';
            });

            img.style.border = '2px solid var(--accent-pink, #e83e8c)';

        };

    });

    const firstThumbnail = document.querySelector('.detail-thumbnail');

    if (firstThumbnail) {
        firstThumbnail.style.border = '2px solid var(--accent-pink, #e83e8c)';
    }

    console.log('currentIndex =', currentIndex);
    console.log('displayItems =', displayItems);

    const prevBtn = document.getElementById('detail-prev-btn');

    if (prevBtn) {
        prevBtn.disabled = currentIndex === 0;

        prevBtn.onclick = () => {
            if (currentIndex > 0) {
                console.log('前へ', currentIndex - 1, displayItems[currentIndex - 1]);

                showClosetDetail(displayItems[currentIndex - 1].id);
            }
        };
    }

    const nextBtn = document.getElementById('detail-next-btn');

    if (nextBtn) {
        nextBtn.disabled = currentIndex === displayItems.length - 1;

        nextBtn.onclick = () => {
            if (currentIndex < displayItems.length - 1) {
                console.log('次へ', currentIndex + 1, displayItems[currentIndex + 1]);

                showClosetDetail(displayItems[currentIndex + 1].id);
            }
        };
    }

    const newBtn = document.getElementById('detail-new-btn');

    if (newBtn) {
        newBtn.onclick = () => {
            document.getElementById('closet-detail-view').style.display = 'none';
            document.getElementById('closet-entry-card').style.display = '';
            document.getElementById('new-entry-btn').click();
        };
    }

    const editBtn = document.getElementById('detail-edit-btn');

    if (editBtn) {
        editBtn.onclick = () => {
            editClosetItem(id);
        };
    }
    hasEditChanges = false;
}

// アイテムの編集
function editClosetItem(id) {
    const displayItems = state.filteredClosetItems || state.closetItems;

    console.log('displayItems', displayItems);
    console.log('id', id);

    const currentIndex = displayItems.findIndex(i => String(i.id) === String(id));

    console.log('currentIndex', currentIndex);

    const item = displayItems[currentIndex];
    if (!item) return;

    currentEditingItemId = id;
    hasEditChanges = false;

    // 管理情報を表示
    document.getElementById('item-info-panel').style.display = 'block';
    document.getElementById('item-management-panel').style.display = 'block';

    // 削除ボタンを表示
    document.getElementById('delete-item-btn').style.display = 'inline-flex';

    document.getElementById('info-management-number').textContent =
        item.item_number || '-';

    const createdBy = document.getElementById('info-created-by');
    if (createdBy) {
        createdBy.textContent = item.created_by_member?.name || '-';
    }

    const updatedBy = document.getElementById('info-updated-by');
    if (updatedBy) {
        updatedBy.textContent = item.updated_by_member?.name || '-';
    }

    const createdAt = document.getElementById('info-created-at');
    if (createdAt) {
        createdAt.textContent = item.created_at
            ? new Date(item.created_at).toLocaleString('ja-JP')
            : '-';
    }

    const updatedAt = document.getElementById('info-updated-at');
    if (updatedAt) {
        updatedAt.textContent = item.updated_at
            ? new Date(item.updated_at).toLocaleString('ja-JP')
            : '-';
    }

    // フォームに値をセット
    document.getElementById('entry-name').value = item.name || '';
    document.getElementById('entry-large-category').value = item.large_category_id || '';
    
    // 大項目の変更に伴う中項目の表示制御を適用
    handleLargeCategoryChange();
    
    document.getElementById('entry-middle-category').value = item.middle_category_id || '';
    document.getElementById('entry-small-category').value = item.small_category_id || '';

    // ★追加
    updateSmallCategoryExample();

    document.getElementById('entry-size').value = item.size || '';
    document.getElementById('entry-storage').value = item.storage_box_id || '';
    document.getElementById('entry-usage-history').value = item.usage_history || '';
    document.getElementById('entry-status').value = item.status_id || '';
    document.getElementById('entry-loan-to').value = item.loan_to || '';
    document.getElementById('entry-loan-date').value = item.loan_date || '';
    document.getElementById('entry-return-date').value = item.return_due_date || '';
    document.getElementById('entry-disposed-date').value = item.disposed_date || '';
    document.getElementById('entry-lost-date').value = item.lost_date || '';
    document.getElementById('entry-last-used-date').value = item.last_used_date || '';
    document.getElementById('entry-purchase-date').value = item.purchase_date || '';
    document.getElementById('entry-purchase-price').value = item.purchase_price || '';
    document.getElementById('entry-remarks').value = item.remarks || '';

    console.log("edit", item.next_production_items);
    const nextProduction = item.next_production_items;

    console.log(typeof nextProduction?.usable, nextProduction?.usable);
    document.getElementById('entry-next-usable').checked =
        nextProduction?.usable === true;

    document.getElementById('entry-next-comment').value =
        nextProduction?.comment || '';
    
    document.getElementById('entry-is-set').checked = !!item.is_set_item;

    const setCheckbox = document.getElementById('entry-is-set');
    if (setCheckbox) {
        setCheckbox.disabled = false;
    }

    const parentNumber = document.getElementById('entry-parent-number');
    if (parentNumber) {
        parentNumber.value = item.parent_item_number || '';
    }

    document.getElementById('entry-set-quantity').value = item.set_quantity || '1';

    toggleSetItemFields();
    toggleLoanFields();

    // 一旦チェックボックスをすべてクリア（セット品以外）
    document.querySelectorAll('#closet-entry-form input[type="checkbox"]').forEach(cb => {
        if (
            cb.id !== 'entry-is-set' &&
            cb.id !== 'entry-next-usable'
        ) {
            cb.checked = false;
        }
    });

    // 中間テーブルのリレーションデータに基づいてチェックボックスをオンにする
    if (item.item_colors) {
        item.item_colors.forEach(ic => {
            const cb = document.querySelector(`input[name="color"][value="${ic.color_id}"]`);
            if (cb) cb.checked = true;
        });
    }
    if (item.item_acquisition_methods) {
        item.item_acquisition_methods.forEach(ia => {
            const cb = document.querySelector(`input[name="acquisition"][value="${ia.acquisition_method_id}"]`);
            if (cb) cb.checked = true;
        });
    }
    if (item.item_moods) {
        item.item_moods.forEach(im => {
            const cb = document.querySelector(`input[name="mood"][value="${im.mood_id}"]`);
            if (cb) cb.checked = true;
        });
    }

    // 編集中画像を表示
    clearSelectedImages();

    if (item.item_images && item.item_images.length > 0) {
        item.item_images.forEach(img => {
            selectedImages.push({
                name: img.storage_path,
                isExisting: true,
                storage_path: img.storage_path
            });
        });
        renderImagePreview();
    }

    // UIを「更新」に変更
    const headerTitle = document.querySelector('#closet-entry .section-header h2');
    if (headerTitle) {
        headerTitle.innerHTML = '<i class="fa-solid fa-pen"></i> 備品編集';
    }

    const submitBtn = document.querySelector('#closet-entry-form button[type="submit"]');
    if (submitBtn) {
        submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 更新する';
    }

    // キャンセル・新規登録ボタンを非表示
    const cancelBtn = document.getElementById('cancel-edit-btn');
    if (cancelBtn) {
        cancelBtn.style.display = 'none';
    }

    const newEntryBtn = document.getElementById('new-entry-btn');
    if (newEntryBtn) {
        newEntryBtn.style.display = 'none';
    }

    // 詳細画面を閉じる
    const detailView = document.getElementById('closet-detail-view');
    if (detailView) {
        detailView.style.display = 'none';
    }

    // 編集フォームを表示
    const entryForm = document.getElementById('closet-entry-form');
    if (entryForm) {
        entryForm.style.display = 'block';
    }
    const entryCard = document.getElementById('closet-entry-card');
    if (entryCard) {
        entryCard.style.display = 'block';
    }

    // 登録タブへ切り替え
    const entryTabBtn = document.querySelector('[data-tab="closet-entry"]');
    if (entryTabBtn) {
        entryTabBtn.click();
    }

    window.scrollTo({
        top: 0,
        behavior: 'instant'
    });
}

// アイテムの削除
async function deleteClosetItem(id) {
    if (!confirm('この備品を削除しますか？\n※関連する画像データや中間データも削除されます。')) {
        return;
    }

    try {
        const indicator = document.getElementById('sync-indicator');
        if (indicator) indicator.classList.remove('hidden');

        // 中間テーブルや画像の外部キーにCASCADEがない場合を想定し明示的に削除
        const item = state.closetItems.find(i => i.id === id);
        
        await window.closetApi.deleteItemRelations(id);

        if (item && item.item_images && item.item_images.length > 0) {
            await window.closetApi.deleteItemImages(id);
        }

        await window.closetApi.deleteItem(id);

        alert('削除しました。');
        await loadClosetItems();

    } catch (error) {
        console.error("削除エラー:", error);
        alert('削除に失敗しました。');
    } finally {
        const indicator = document.getElementById('sync-indicator');
        if (indicator) indicator.classList.add('hidden');
    }
}

async function toggleFavorite(itemId) {

    currentMember = getCurrentMember();

    if (!currentMember?.id) {
        alert('使用者を選択してください。');
        return;
    }

    const isFavorite = state.favoriteItems?.includes(itemId);

    if (isFavorite) {

        await db
            .from('item_favorites')
            .delete()
            .eq('member_id', currentMember.id)
            .eq('item_id', itemId);

        state.favoriteItems =
            state.favoriteItems.filter(id => id !== itemId);

    } else {

        const { error } = await db
            .from('item_favorites')
            .insert({
                member_id: currentMember.id,
                item_id: itemId
            });

        console.log("favorite insert error =", error);

        if (!error) {
            state.favoriteItems.push(itemId);
        }

    }

    renderClosetItems();
}

// 一覧検索条件リセット
function resetClosetFilters() {

    const ids = [
        'closet-search-text',
        'closet-search-number',
        'closet-filter-large',
        'closet-filter-middle',
        'closet-filter-storage',
        'closet-filter-color',
        'closet-filter-next-usable',
        'closet-filter-favorite',
        'closet-filter-set',
        'closet-sort-order'
    ];

    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.value = '';
            el.blur();
        }
    });

    document
        .querySelectorAll('#closet-filter-small-container input[type="checkbox"]')
        .forEach(cb => {
            cb.checked = false;
        });

    document
        .querySelectorAll('#closet-filter-status-container input[type="checkbox"]')
        .forEach(cb => {
            cb.checked = false;
        });

    document
        .querySelectorAll('#closet-filter-color-container input[type="checkbox"]')
        .forEach(cb => {
            cb.checked = false;
        });

    document
        .querySelectorAll('#closet-filter-mood-container input[type="checkbox"]')
        .forEach(cb => {
            cb.checked = false;
        });

    // 並び替えは管理番号順に戻す
    const sortSelect = document.getElementById('closet-sort-order');
    if (sortSelect) {
        sortSelect.value = 'management-asc';
    }

    // 中項目・小項目の表示状態を戻す
    handleClosetFilterLargeChange();

    renderClosetItems();
}

// 保管場所一覧表示
function renderStorageBoxes() {
    const container = document.getElementById('storage-box-list');
    if (!container) return;

    container.innerHTML = '';

    const storageBoxes = state.closetMaster?.storage || [];

    storageBoxes.forEach(box => {

        const card = document.createElement('div');

        card.className = 'card';
        card.style.display = 'flex';
        card.style.justifyContent = 'space-between';
        card.style.alignItems = 'center';
        card.style.marginBottom = '10px';
        card.style.padding = '12px';

        card.innerHTML = `
            <div>
                <strong>${box.code}</strong><br>
                ${box.location}
            </div>

            <div style="display:flex; gap:6px;">

                <button
                    class="icon-btn-sm"
                    onclick="moveStorageBox('${box.id}', -1)">
                    <i class="fa-solid fa-chevron-up"></i>
                </button>

                <button
                    class="icon-btn-sm"
                    onclick="moveStorageBox('${box.id}', 1)">
                    <i class="fa-solid fa-chevron-down"></i>
                </button>

                <button
                    class="icon-btn-sm"
                    onclick="editStorageBox('${box.id}')">
                    <i class="fa-solid fa-pen"></i>
                </button>

                <button
                    class="icon-btn-sm"
                    onclick="deleteStorageBox('${box.id}')">
                    <i class="fa-solid fa-trash"></i>
                </button>

            </div>
        `;

        container.appendChild(card);

    });
}

let currentEditingStorageId = null;

async function saveStorageBox() {

    const code = document.getElementById('storage-code').value.trim();
    const location = document.getElementById('storage-location').value.trim();

    if (!code || !location) {
        alert('箱と保管場所を入力してください。');
        return;
    }

    const nextSort =
        (state.closetMaster.storage.at(-1)?.sort_order || 0) + 1;

    let error;

    if (currentEditingStorageId) {

        ({ error } = await db
            .from('storage_boxes')
            .update({
                code,
                location
            })
            .eq('id', currentEditingStorageId));

    } else {

        ({ error } = await db
            .from('storage_boxes')
            .insert({
                code,
                location,
                sort_order: nextSort,
                member_code: currentMember.member_code
            }));

    }

    if (error) {
        alert(error.message);
        return;
    }

    await loadClosetMasterData();
    renderStorageBoxes();

    currentEditingStorageId = null;

    document.getElementById('storage-code').value = '';
    document.getElementById('storage-location').value = '';

    document.getElementById('storage-entry-form').style.display = 'none';
    document.getElementById('btn-add-storage').style.display = 'inline-flex';
}

function editStorageBox(id) {

    const box = state.closetMaster.storage.find(x => x.id === id);
    if (!box) return;

    currentEditingStorageId = id;

    document.getElementById('storage-code').value = box.code;
    document.getElementById('storage-location').value = box.location;

    document.getElementById('storage-entry-form').style.display = 'block';
    document.getElementById('btn-add-storage').style.display = 'none';

}

async function deleteStorageBox(id) {

    if (!confirm('この保管場所を削除しますか？')) return;

    const { error } = await db
        .from('storage_boxes')
        .delete()
        .eq('id', id);

    if (error) {
        alert(error.message);
        return;
    }

    await loadClosetMasterData();
    renderStorageBoxes();

}

async function moveStorageBox(id, direction) {

    const list = [...state.closetMaster.storage]
        .sort((a, b) => a.sort_order - b.sort_order);

    const index = list.findIndex(x => x.id === id);
    if (index < 0) return;

    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    const current = list[index];
    const target = list[targetIndex];

    const currentOrder = current.sort_order;

    const { error: error1 } = await db
        .from('storage_boxes')
        .update({ sort_order: target.sort_order })
        .eq('id', current.id);

    if (error1) {
        alert(error1.message);
        return;
    }

    const { error: error2 } = await db
        .from('storage_boxes')
        .update({ sort_order: currentOrder })
        .eq('id', target.id);

    if (error2) {
        alert(error2.message);
        return;
    }

    await loadClosetMasterData();
    renderStorageBoxes();

}

// 小項目の例を表示
function handleClosetFilterMiddleChange() {
    const largeSelect = document.getElementById('closet-filter-large');
    const middleSelect = document.getElementById('closet-filter-middle');

    if (!largeSelect || !middleSelect) return;

    const largeId = largeSelect.value;

    const smallList = largeId
        ? state.closetMaster.small.filter(
            x => x.large_category_id === largeId
        )
        : state.closetMaster.small;

    populateSmallFilterCheckboxes(smallList);

    renderClosetItems();
}

function renderGuideTables() {

    renderSmallCategoryGuide();
    renderColorGuide();
    renderMoodGuide();
    renderAcquisitionGuide();

}

// ===============================
// 管理サブタブ切替
// ===============================
document.querySelectorAll('.admin-subtab').forEach(btn => {

    btn.addEventListener('click', () => {

        document.querySelectorAll('.admin-subtab').forEach(b =>
            b.classList.remove('active')
        );

        btn.classList.add('active');

        document.querySelectorAll('.admin-tab-content').forEach(tab =>
            tab.style.display = 'none'
        );

        document.getElementById(
            'admin-' + btn.dataset.adminTab
        ).style.display = 'block';

    });

});

// 初期表示
document.addEventListener('DOMContentLoaded', () => {

    document.querySelectorAll('.admin-tab-content').forEach(tab =>
        tab.style.display = 'none'
    );

    const first = document.getElementById('admin-guide');

    if (first) {
        first.style.display = 'block';
    }

    const toggleBtn = document.getElementById('toggle-search-panel-btn');
    const searchPanel = document.getElementById('closet-search-panel');

    if (toggleBtn && searchPanel) {

        const isHidden = localStorage.getItem('closetSearchPanelHidden') === 'true';

        searchPanel.style.display = isHidden ? 'none' : '';

        toggleBtn.innerHTML = isHidden
            ? '<i class="fa-solid fa-chevron-right"></i> 検索条件を表示'
            : '<i class="fa-solid fa-chevron-down"></i> 検索条件を隠す';

        toggleBtn.onclick = () => {

            const hidden = searchPanel.style.display === 'none';

            searchPanel.style.display = hidden ? '' : 'none';

            toggleBtn.innerHTML = hidden
                ? '<i class="fa-solid fa-chevron-down"></i> 検索条件を隠す'
                : '<i class="fa-solid fa-chevron-right"></i> 検索条件を表示';

            localStorage.setItem('closetSearchPanelHidden', !hidden);
        };

    }

});

function renderSmallCategoryGuide() {

    const container = document.getElementById('guide-small-category');
    if (!container) return;

    const rows = state.closetMaster.small.map(item => {

        const large = state.closetMaster.large.find(
            x => x.id === item.large_category_id
        );

        return `
            <tr>
                <td>${large?.name || ''}</td>
                <td>${item.name || ''}</td>
                <td>${item.example || ''}</td>
            </tr>
        `;

    }).join('');

    container.innerHTML = `
        <table class="simple-table">
            <thead>
                <tr>
                    <th>大項目</th>
                    <th>小項目</th>
                    <th>例</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;

}

function renderSmallCategoryGuide() {

    const container = document.getElementById('guide-small-category');
    if (!container) return;

    const rows = state.closetMaster.small.map(item => {

        const large = state.closetMaster.large.find(
            x => x.id === item.large_category_id
        );

        return `
            <tr>
                <td style="border:1px solid #eee;padding:10px;vertical-align:top;">
                    ${large?.name || ''}
                </td>

                <td style="border:1px solid #eee;padding:10px;vertical-align:top;">
                    ${item.name || ''}
                </td>

                <td style="
                    border:1px solid #eee;
                    padding:10px;
                    vertical-align:top;
                    white-space:normal;
                    word-break:break-word;
                    line-height:1.6;
                ">
                    ${item.example || ''}
                </td>
            </tr>
        `;

    }).join('');

    container.innerHTML = `
        <table style="
            width:100%;
            border-collapse:collapse;
            table-layout:fixed;
            font-size:14px;
            background:#fff;
        ">
            <thead>
                <tr style="background:#fbe3ec;">
                    <th style="width:80px;padding:10px;border:1px solid #ddd;">大項目</th>
                    <th style="width:140px;padding:10px;border:1px solid #ddd;">小項目</th>
                    <th style="padding:10px;border:1px solid #ddd;">例</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;

}

function renderColorGuide() {

    const container = document.getElementById('guide-colors');
    if (!container) return;

    const rows = state.closetMaster.colors.map(item => `
        <tr>
            <td style="border:1px solid #eee;padding:10px;vertical-align:top;width:140px;">
                ${item.name || ''}
            </td>

            <td style="
                border:1px solid #eee;
                padding:10px;
                vertical-align:top;
                white-space:normal;
                word-break:break-word;
                line-height:1.6;
            ">
                ${item.example || ''}
            </td>
        </tr>
    `).join('');

    container.innerHTML = `
        <table style="
            width:100%;
            border-collapse:collapse;
            table-layout:fixed;
            font-size:14px;
            background:#fff;
        ">
            <thead>
                <tr style="background:#fbe3ec;">
                    <th style="width:140px;padding:10px;border:1px solid #ddd;">色</th>
                    <th style="padding:10px;border:1px solid #ddd;">例</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;

}

function renderMoodGuide() {

    const container = document.getElementById('guide-moods');
    if (!container) return;

    const rows = state.closetMaster.moods.map(item => `
        <tr>
            <td style="border:1px solid #eee;padding:10px;vertical-align:top;width:140px;">
                ${item.name || ''}
            </td>

            <td style="
                border:1px solid #eee;
                padding:10px;
                vertical-align:top;
                white-space:normal;
                word-break:break-word;
                line-height:1.6;
            ">
                ${item.example || ''}
            </td>
        </tr>
    `).join('');

    container.innerHTML = `
        <table style="
            width:100%;
            border-collapse:collapse;
            table-layout:fixed;
            font-size:14px;
            background:#fff;
        ">
            <thead>
                <tr style="background:#fbe3ec;">
                    <th style="width:140px;padding:10px;border:1px solid #ddd;">雰囲気</th>
                    <th style="padding:10px;border:1px solid #ddd;">例</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;

}

function renderAcquisitionGuide() {

    const container = document.getElementById('guide-acquisition');
    if (!container) return;

    const rows = state.closetMaster.acquisition.map(item => `
        <tr>
            <td style="border:1px solid #eee;padding:10px;vertical-align:top;width:140px;">
                ${item.name || ''}
            </td>

            <td style="
                border:1px solid #eee;
                padding:10px;
                vertical-align:top;
                white-space:normal;
                word-break:break-word;
                line-height:1.6;
            ">
                ${item.example || ''}
            </td>
        </tr>
    `).join('');

    container.innerHTML = `
        <table style="
            width:100%;
            border-collapse:collapse;
            table-layout:fixed;
            font-size:14px;
            background:#fff;
        ">
            <thead>
                <tr style="background:#fbe3ec;">
                    <th style="width:140px;padding:10px;border:1px solid #ddd;">入手方法</th>
                    <th style="padding:10px;border:1px solid #ddd;">例</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;

}

async function deleteClosetItem() {

    if (!currentEditingItemId) return;

    if (!confirm('この備品を削除しますか？\n※画像も削除されます。')) {
        return;
    }

    try {

        const indicator = document.getElementById('sync-indicator');
        if (indicator) indicator.classList.remove('hidden');

        const item = state.closetItems.find(
            i => i.id === currentEditingItemId
        );

        // Storageの画像削除
        if (item?.item_images?.length) {

            const paths = item.item_images
                .map(x => x.storage_path)
                .filter(Boolean);

            if (paths.length) {
                const { error } = await db.storage
                    .from('item-images')
                    .remove(paths);

                if (error) throw error;
            }
        }

        // 中間テーブル削除
        await db.from('item_images').delete().eq('item_id', currentEditingItemId);
        await db.from('item_colors').delete().eq('item_id', currentEditingItemId);
        await db.from('item_acquisition_methods').delete().eq('item_id', currentEditingItemId);
        await db.from('item_moods').delete().eq('item_id', currentEditingItemId);
        await db.from('next_production_items').delete().eq('item_id', currentEditingItemId);
        await db.from('item_favorites').delete().eq('item_id', currentEditingItemId);

        // 本体削除
        const { error } = await db
            .from('items')
            .delete()
            .eq('id', currentEditingItemId);

        if (error) throw error;

        alert('削除しました。');

        await loadClosetItems();

        resetClosetEntryForm();

        document.querySelector('[data-tab="closet-list"]').click();

    } catch (error) {

        console.error(error);
        alert(error.message);

    } finally {

        const indicator = document.getElementById('sync-indicator');
        if (indicator) indicator.classList.add('hidden');

    }

}

async function showUnsetSetModal(setItems) {

    return new Promise((resolve) => {

        const modal = document.getElementById('unset-set-modal');
        const list = document.getElementById('unset-set-list');

        const cancelBtn = document.getElementById('btn-cancel-unset-set');
        const okBtn = document.getElementById('btn-confirm-unset-set');

        list.innerHTML = '';

        setItems.forEach((item, index) => {

            const label = document.createElement('label');

            label.innerHTML = `
                <input
                    type="radio"
                    name="unset-set-item"
                    value="${item.id}"
                    ${index === 0 ? 'checked' : ''}
                >

                ${item.item_number}
               　${item.name || ''}
            `;

            list.appendChild(label);

        });

        modal.style.display = 'flex';

        cancelBtn.onclick = () => {

            modal.style.display = 'none';
            resolve(null);

        };

        okBtn.onclick = () => {

            const checked = document.querySelector(
                'input[name="unset-set-item"]:checked'
            );

            modal.style.display = 'none';

            resolve(checked ? checked.value : null);

        };

    });

}

async function showSetQuantityModal(setItems, remainCount) {

    return new Promise((resolve) => {

        const modal = document.getElementById('set-quantity-modal');
        const list = document.getElementById('set-quantity-list');
        const message = document.getElementById('set-quantity-message');

        const cancelBtn = document.getElementById('btn-cancel-set-quantity');
        const okBtn = document.getElementById('btn-confirm-set-quantity');

        message.textContent =
            `残す子番号を ${remainCount} 個選択してください。`;

        list.innerHTML = '';

        setItems.forEach((item) => {

            const label = document.createElement('label');

            label.style.display = 'block';
            label.style.marginBottom = '8px';

            label.innerHTML = `
                <input
                    type="checkbox"
                    name="set-quantity-item"
                    value="${item.id}"
                >

                ${item.item_number}
                　${item.name || ''}
            `;

            list.appendChild(label);

        });

        modal.style.display = 'flex';

        cancelBtn.onclick = () => {

            modal.style.display = 'none';
            resolve(null);

        };

        okBtn.onclick = () => {

            const checked = [
                ...document.querySelectorAll(
                    'input[name="set-quantity-item"]:checked'
                )
            ];

            if (checked.length !== remainCount) {

                alert(`残す子番号を ${remainCount} 個選択してください。`);
                return;

            }

            modal.style.display = 'none';

            resolve(
                checked.map(c => c.value)
            );

        };

    });

}

// ==========================================
// 日時表示
// ==========================================
function formatDateTime(value) {

    if (!value) return '-';

    const date = new Date(value);

    if (isNaN(date.getTime())) return '-';

    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');

    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');

    return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;

}

// ==========================================
// 一括編集機能
// ==========================================

function toggleBulkSelection(itemId, isChecked) {
    if (!state.selectedItems) state.selectedItems = new Set();
    
    if (isChecked) {
        state.selectedItems.add(itemId);
    } else {
        state.selectedItems.delete(itemId);
    }
    updateBulkActionBar();
}

function updateBulkActionBar() {
    const count = state.selectedItems ? state.selectedItems.size : 0;
    const bar = document.getElementById('bulk-action-bar');
    const countSpan = document.getElementById('bulk-selection-count');
    
    if (count > 0) {
        bar.style.display = 'flex';
        countSpan.textContent = `${count}件選択中`;
    } else {
        bar.style.display = 'none';
    }
}

function selectAllVisibleItems() {
    if (!state.selectedItems) state.selectedItems = new Set();
    
    // 一旦現在の選択をクリアしてから、現在表示されているアイテムのみを選択する
    state.selectedItems.clear();
    
    const items = state.filteredClosetItems || state.closetItems || [];
    items.forEach(item => state.selectedItems.add(item.id));
    
    renderClosetItems();
    updateBulkActionBar();
}

function clearBulkSelection() {
    if (state.selectedItems) state.selectedItems.clear();
    renderClosetItems();
    updateBulkActionBar();
}

function openBulkEditModal() {
    const modal = document.getElementById('bulk-edit-modal');
    if (!modal) return;
    
    // 大項目の初期化
    const largeSelect = document.getElementById('bulk-input-large-category');
    if (largeSelect) {
        largeSelect.innerHTML = '<option value="">（空欄にする）</option>';
        (state.closetMaster.large || []).forEach(l => {
            largeSelect.innerHTML += `<option value="${l.id}">${l.name}</option>`;
        });
        largeSelect.onchange = handleBulkLargeCategoryChange;
    }

    // 中項目・小項目のリセット
    const middleSelect = document.getElementById('bulk-input-middle-category');
    if (middleSelect) middleSelect.innerHTML = '<option value="">（空欄にする）</option>';
    const smallSelect = document.getElementById('bulk-input-small-category');
    if (smallSelect) smallSelect.innerHTML = '<option value="">（空欄にする）</option>';
    
    // 保管場所プルダウンの初期化
    const storageSelect = document.getElementById('bulk-input-storage');
    storageSelect.innerHTML = '<option value="">（空欄にする）</option>';
    (state.closetMaster.storage || []).forEach(s => {
        storageSelect.innerHTML += `<option value="${s.id}">${s.location}</option>`;
    });
    
    // 色の初期化
    const colorContainer = document.getElementById('bulk-input-color-container');
    colorContainer.innerHTML = '';
    (state.closetMaster.colors || []).forEach(c => {
        colorContainer.innerHTML += `<label><input type="checkbox" name="bulk-color" value="${c.id}"> ${c.name}</label>`;
    });
    
    // 雰囲気の初期化
    const moodContainer = document.getElementById('bulk-input-mood-container');
    moodContainer.innerHTML = '';
    (state.closetMaster.moods || []).forEach(m => {
        moodContainer.innerHTML += `<label><input type="checkbox" name="bulk-mood" value="${m.id}"> ${m.name}</label>`;
    });

    // 入手方法の初期化
    const acqContainer = document.getElementById('bulk-input-acquisition-container');
    acqContainer.innerHTML = '';
    (state.closetMaster.acquisition || []).forEach(a => {
        acqContainer.innerHTML += `<label><input type="checkbox" name="bulk-acquisition" value="${a.id}"> ${a.name}</label>`;
    });

    // フォームのリセット
    document.getElementById('bulk-edit-form').reset();
    
    // すべての項目を一旦非表示に
    ['large-category', 'middle-category', 'small-category', 'storage', 'color', 'mood', 'acquisition', 'remarks', 'usage'].forEach(field => {
        document.getElementById(`bulk-field-${field}`).style.display = 'none';
        document.getElementById(`bulk-check-${field}`).checked = false;
    });

    document.getElementById('bulk-edit-message').textContent = `${state.selectedItems.size}件の備品を更新します。変更したい項目にチェックを入れてください。`;
    modal.style.display = 'flex';
}

function handleBulkLargeCategoryChange() {
    const largeId = document.getElementById('bulk-input-large-category').value;
    const middleSelect = document.getElementById('bulk-input-middle-category');
    const smallSelect = document.getElementById('bulk-input-small-category');

    if (middleSelect) {
        middleSelect.innerHTML = '<option value="">（空欄にする）</option>';
        if (largeId) {
            const middleList = state.closetMaster.middle.filter(x => String(x.large_category_id) === String(largeId));
            middleList.forEach(m => {
                middleSelect.innerHTML += `<option value="${m.id}">${m.name}</option>`;
            });
        }
    }

    if (smallSelect) {
        smallSelect.innerHTML = '<option value="">（空欄にする）</option>';
        if (largeId) {
            const smallList = state.closetMaster.small.filter(x => String(x.large_category_id) === String(largeId));
            smallList.forEach(s => {
                smallSelect.innerHTML += `<option value="${s.id}">${s.name}</option>`;
            });
        }
    }
}

function closeBulkEditModal() {
    document.getElementById('bulk-edit-modal').style.display = 'none';
}

function toggleBulkField(field) {
    const isChecked = document.getElementById(`bulk-check-${field}`).checked;
    document.getElementById(`bulk-field-${field}`).style.display = isChecked ? 'block' : 'none';
}

async function submitBulkEdit() {
    if (!state.selectedItems || state.selectedItems.size === 0) return;
    
    const count = state.selectedItems.size;
    if (!confirm(`${count}件のアイテムを更新します。よろしいですか？`)) {
        return;
    }
    
    try {
        const indicator = document.getElementById('sync-indicator');
        if (indicator) indicator.classList.remove('hidden');
        
        currentMember = getCurrentMember();
        
        const updateLarge = document.getElementById('bulk-check-large-category')?.checked;
        const updateMiddle = document.getElementById('bulk-check-middle-category')?.checked;
        const updateSmall = document.getElementById('bulk-check-small-category')?.checked;
        
        const updateStorage = document.getElementById('bulk-check-storage').checked;
        const updateColor = document.getElementById('bulk-check-color').checked;
        const updateMood = document.getElementById('bulk-check-mood').checked;
        const updateAcquisition = document.getElementById('bulk-check-acquisition').checked;
        const updateRemarks = document.getElementById('bulk-check-remarks').checked;
        const updateUsage = document.getElementById('bulk-check-usage').checked;

        // 値の取得
        const largeVal = document.getElementById('bulk-input-large-category')?.value;
        const middleVal = document.getElementById('bulk-input-middle-category')?.value;
        const smallVal = document.getElementById('bulk-input-small-category')?.value;
        
        const storageVal = document.getElementById('bulk-input-storage').value;
        const colorMode = document.querySelector('input[name="bulk-mode-color"]:checked')?.value;
        const moodMode = document.querySelector('input[name="bulk-mode-mood"]:checked')?.value;
        const acqMode = document.querySelector('input[name="bulk-mode-acquisition"]:checked')?.value;
        const remarksMode = document.querySelector('input[name="bulk-mode-remarks"]:checked')?.value;
        const usageMode = document.querySelector('input[name="bulk-mode-usage"]:checked')?.value;
        
        const selectedColors = Array.from(document.querySelectorAll('input[name="bulk-color"]:checked')).map(cb => cb.value);
        const selectedMoods = Array.from(document.querySelectorAll('input[name="bulk-mood"]:checked')).map(cb => cb.value);
        const selectedAcqs = Array.from(document.querySelectorAll('input[name="bulk-acquisition"]:checked')).map(cb => cb.value);
        
        const remarksVal = document.getElementById('bulk-input-remarks').value;
        const usageVal = document.getElementById('bulk-input-usage').value;

        const targetIds = Array.from(state.selectedItems);
        
        for (const itemId of targetIds) {
            // 現在のアイテム情報を取得（追記や関連テーブルの操作に必要）
            const item = await window.closetApi.fetchItemWithRelations(itemId);
            if (!item) continue;
            
            // 1. itemsテーブル自体の更新用ペイロード
            let itemPayload = {};
            let hasPayload = false;
            
            if (updateLarge) {
                itemPayload.large_category_id = largeVal ? largeVal : null;
                // 大項目を更新する場合、安全のため、明示的に指定されていなければ中・小項目をリセットする
                if (!updateMiddle) itemPayload.middle_category_id = null;
                if (!updateSmall) itemPayload.small_category_id = null;
                hasPayload = true;
            }
            if (updateMiddle) {
                itemPayload.middle_category_id = middleVal ? middleVal : null;
                hasPayload = true;
            }
            if (updateSmall) {
                itemPayload.small_category_id = smallVal ? smallVal : null;
                hasPayload = true;
            }
            
            if (updateStorage) {
                itemPayload.storage_box_id = storageVal ? storageVal : null;
                hasPayload = true;
            }
            
            if (updateRemarks) {
                if (remarksMode === 'append' && remarksVal) {
                    const currentRemarks = item.remarks || '';
                    itemPayload.remarks = currentRemarks ? `${currentRemarks}\n${remarksVal}` : remarksVal;
                } else {
                    itemPayload.remarks = remarksVal;
                }
                hasPayload = true;
            }
            
            if (updateUsage) {
                if (usageMode === 'append' && usageVal) {
                    const currentUsage = item.usage_history || '';
                    itemPayload.usage_history = currentUsage ? `${currentUsage}\n${usageVal}` : usageVal;
                } else {
                    itemPayload.usage_history = usageVal;
                }
                hasPayload = true;
            }
            
            if (hasPayload) {
                itemPayload.updated_by = currentMember?.id || null;
                itemPayload.updated_at = new Date().toISOString();
                await window.closetApi.updateItem(itemId, itemPayload);
            }
            
            // 2. 関連テーブルの更新
            if (updateColor) {
                await processBulkRelationUpdate(itemId, 'item_colors', 'color_id', colorMode, selectedColors, item.item_colors);
            }
            if (updateMood) {
                await processBulkRelationUpdate(itemId, 'item_moods', 'mood_id', moodMode, selectedMoods, item.item_moods);
            }
            if (updateAcquisition) {
                await processBulkRelationUpdate(itemId, 'item_acquisition_methods', 'acquisition_method_id', acqMode, selectedAcqs, item.item_acquisition_methods);
            }
        }
        
        alert(`${count}件の更新が完了しました。`);
        closeBulkEditModal();
        clearBulkSelection();
        await loadClosetItems();
        
    } catch (error) {
        console.error("一括更新エラー:", error);
        alert('更新中にエラーが発生しました。');
    } finally {
        const indicator = document.getElementById('sync-indicator');
        if (indicator) indicator.classList.add('hidden');
    }
}

// 関連テーブルの置き換え・追加・削除ロジック
async function processBulkRelationUpdate(itemId, tableName, columnIdName, mode, selectedIds, currentRelations) {
    if (mode === 'replace') {
        // すべて削除して新規追加
        if (tableName === 'item_colors') await window.closetApi.deleteAllColors(itemId);
        if (tableName === 'item_moods') await window.closetApi.deleteAllMoods(itemId);
        if (tableName === 'item_acquisition_methods') await window.closetApi.deleteAllAcquisitions(itemId);
        
        if (selectedIds.length > 0) {
            const rows = selectedIds.map(id => ({ item_id: itemId, [columnIdName]: id }));
            if (tableName === 'item_colors') await window.closetApi.insertColors(rows);
            if (tableName === 'item_moods') await window.closetApi.insertMoods(rows);
            if (tableName === 'item_acquisition_methods') await window.closetApi.insertAcquisitions(rows);
        }
    } else if (mode === 'add') {
        // 既存にないものだけ追加
        const existingIds = (currentRelations || []).map(r => String(r[columnIdName]));
        const toAdd = selectedIds.filter(id => !existingIds.includes(String(id)));
        
        if (toAdd.length > 0) {
            const rows = toAdd.map(id => ({ item_id: itemId, [columnIdName]: id }));
            if (tableName === 'item_colors') await window.closetApi.insertColors(rows);
            if (tableName === 'item_moods') await window.closetApi.insertMoods(rows);
            if (tableName === 'item_acquisition_methods') await window.closetApi.insertAcquisitions(rows);
        }
    } else if (mode === 'remove') {
        // 選択されたものを削除
        if (selectedIds.length > 0) {
            if (tableName === 'item_colors') await window.closetApi.deleteSpecificColors(itemId, selectedIds);
            if (tableName === 'item_moods') await window.closetApi.deleteSpecificMoods(itemId, selectedIds);
            if (tableName === 'item_acquisition_methods') await window.closetApi.deleteSpecificAcquisitions(itemId, selectedIds);
        }
    }
}

