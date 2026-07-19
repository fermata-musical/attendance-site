// 衣装管理用スクリプト (closet.js)

let currentEditingItemId = null;

// ページロード時の初期化処理
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOMContentLoaded");

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

    // 大項目の変更イベント
    const largeCatSelect = document.getElementById('entry-large-category');
    if (largeCatSelect) {
        largeCatSelect.addEventListener('change', handleLargeCategoryChange);
    }

    // ログイン完了を監視して衣装データを自動取得
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

// マスタデータ取得
async function loadClosetMasterData() {
    console.log("loadClosetMasterData start");

    if (!window.db) return;
    try {
        const [
            largeRes, middleRes, smallRes, storageRes,
            colorsRes, acqRes, moodsRes, statusRes
        ] = await Promise.all([
            db.from('category_large').select('*').order('sort_order', { ascending: true }),
            db.from('category_middle').select('*').order('sort_order', { ascending: true }),
            db.from('category_small').select('*').order('sort_order', { ascending: true }),
            db.from('storage_boxes').select('*').order('sort_order', { ascending: true }),
            db.from('colors').select('*').order('id', { ascending: true }),
            db.from('acquisition_methods').select('*').order('sort_order', { ascending: true }),
            db.from('moods').select('*').order('sort_order', { ascending: true }),
            db.from('item_statuses').select('*').order('sort_order', { ascending: true })
        ]);

        console.log("largeRes", largeRes);
        console.log("middleRes", middleRes);
        console.log("smallRes", smallRes);
        console.log("storageRes", storageRes);
        console.log("colorsRes", colorsRes);
        console.log("acqRes", acqRes);
        console.log("moodsRes", moodsRes);

        if (typeof state === 'undefined') window.state = {};
        state.closetMaster = {
            large: largeRes.data || [],
            middle: middleRes.data || [],
            small: smallRes.data || [],
            storage: storageRes.data || [],
            colors: colorsRes.data || [],
            acquisition: acqRes.data || [],
            moods: moodsRes.data || [],
            statuses: statusRes.data || []
        };

        populateDropdown('entry-large-category', state.closetMaster.large, 'id', 'name');
        populateDropdown('entry-middle-category', state.closetMaster.middle, 'id', 'name');
        populateDropdown('entry-small-category', state.closetMaster.small, 'id', 'name');
        populateDropdown('entry-storage', state.closetMaster.storage, 'id', 'location');
        populateDropdown('closet-search-category', state.closetMaster.large, 'id', 'name');

        populateCheckboxes('entry-color-container', state.closetMaster.colors, 'color', 'id', 'name');
        populateCheckboxes('entry-acquisition-container', state.closetMaster.acquisition, 'acquisition', 'id', 'name');
        populateCheckboxes('entry-mood-container', state.closetMaster.moods, 'mood', 'id', 'name');

        populateDropdown(
            'entry-status',
            state.closetMaster.statuses,
            'id',
            'name'
        );

        handleLargeCategoryChange();

        handleLargeCategoryChange();
    } catch (error) {
        console.error('マスタデータ取得エラー', error);
    }
}

function populateDropdown(elementId, data, valKey, textKey) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = '<option value="">選択</option>';
    data.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item[valKey];
        opt.textContent = item[textKey];
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

function handleLargeCategoryChange() {
    const largeCatSelect = document.getElementById('entry-large-category');
    const middleSelect = document.getElementById('entry-middle-category');
    const wrapper = document.getElementById('middle-category-wrapper');

    if (!largeCatSelect || !wrapper) return;

    const selectedId = largeCatSelect.value;
    const selectedOption = largeCatSelect.options[largeCatSelect.selectedIndex];

    // 中項目の表示制御
    if (selectedOption && selectedOption.text === '衣裳') {
        wrapper.style.display = 'block';
    } else {
        wrapper.style.display = 'none';
        if (middleSelect) middleSelect.value = '';
    }

    // 小項目を大項目で絞り込み
    const smallList = state.closetMaster.small.filter(
        x => x.large_category_id === selectedId
    );

    populateDropdown(
        'entry-small-category',
        smallList,
        'id',
        'name'
    );
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
        
        // items テーブルからデータ取得（画像パスと中間テーブルも同時に取得）
        const { data, error } = await db.from('items').select(`
            *,
            created_by_member:members!items_created_by_fkey (
                name
            ),
            updated_by_member:members!items_updated_by_fkey (
                name
            )
            item_images ( storage_path, image_order ),
            item_colors ( color_id ),
            item_acquisition_methods ( acquisition_method_id ),
            item_moods ( mood_id )
        `).order('item_number');
        
        if (error) throw error;
        
        if (typeof state !== 'undefined') {
            state.closetItems = data;
        }

        // お気に入り一覧取得
        currentMember = getCurrentMember();

        if (currentMember?.id) {

            const { data: favorites } = await db
                .from('item_favorites')
                .select('item_id')
                .eq('member_id', currentMember.id);

            state.favoriteItems = (favorites || []).map(f => f.item_id);

        } else {

            state.favoriteItems = [];

        }

        renderClosetItems();
    } catch (error) {
        console.error("衣装データ取得エラー:", error);
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
        container.innerHTML = '<p style="color: var(--text-sub);">登録されている衣装がありません。</p>';
        return;
    }
    
    const nameFilter = document.getElementById('closet-search-name')?.value.toLowerCase() || '';
    const numberFilter = document.getElementById('closet-search-number')?.value.toLowerCase() || '';
    const categoryFilter = document.getElementById('closet-search-category')?.value || '';
    
    const filteredItems = items.filter(item => {
        const matchName = !nameFilter || (item.name && item.name.toLowerCase().includes(nameFilter));
        const matchNumber = !numberFilter ||
                    (item.item_number && item.item_number.toLowerCase().includes(numberFilter));
        const matchCategory = !categoryFilter || (item.large_category_id === categoryFilter);
        
        return matchName && matchNumber && matchCategory;
    });

    if (filteredItems.length === 0) {
        container.innerHTML = '<p style="color: var(--text-sub);">条件に一致する衣装がありません。</p>';
        return;
    }
    
    filteredItems.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.padding = '15px';
        card.style.border = '1px solid var(--border-dusty)';
        
        let imageUrl = 'images/no-image.png';
        if (item.item_images && item.item_images.length > 0) {
            imageUrl = getImageUrl(item.item_images[0].storage_path);
        }

        const storageBox = state.closetMaster?.storage?.find(s => s.id === item.storage_box_id);
        const storageText = storageBox ? storageBox.location : '-';

        const isFavorite = state.favoriteItems?.includes(item.id);

        card.innerHTML = `
            <div style="text-align: center; margin-bottom: 10px;">
                <img src="${imageUrl}" alt="衣装写真" style="width: 100%; height: 150px; object-fit: contain; border-radius: 8px; background: #f5f5f5;">
            </div>
            <div style="font-weight: bold; margin-bottom: 8px; font-size: 1.1rem; color: var(--text-main);">
                ${item.name || '名称未設定'}
            </div>
            <div style="font-size: 0.85rem; color: var(--text-sub); margin-bottom: 4px;">
                <i class="fa-solid fa-barcode"></i> 管理番号: ${item.item_number || '-'}
            </div>
            <div style="font-size: 0.85rem; color: var(--text-sub); margin-bottom: 4px;">
                <i class="fa-solid fa-ruler"></i> サイズ: ${item.size || '-'}
            </div>
            <div style="font-size: 0.85rem; color: var(--text-sub);">
                <i class="fa-solid fa-box-open"></i> 保管場所: ${storageText}
            </div>
            <div style="margin-top:15px; display:flex; justify-content:flex-end; gap:8px;">

                <button
                    class="icon-btn-sm"
                    title="お気に入り"
                    onclick="toggleFavorite('${item.id}')"
                    ${!currentMember?.id ? 'disabled' : ''}>

                    <i class="${isFavorite ? 'fa-solid' : 'fa-regular'} fa-star"></i>

                </button>

                <button
                    class="icon-btn-sm"
                    title="編集"
                    onclick="editClosetItem('${item.id}')">
                    <i class="fa-solid fa-pen"></i>
                </button>

                <button
                    class="icon-btn-sm"
                    title="削除"
                    onclick="deleteClosetItem('${item.id}')">
                    <i class="fa-solid fa-trash"></i>
                </button>

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

// 新規衣装データまたは更新データの保存
async function submitClosetEntry() {
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
    
    const isSetItem = document.getElementById('entry-is-set').checked;
    let parentItemNumber = null;
    let setChildNo = null;
    let setQuantity = null;

    if (isSetItem) {
        parentItemNumber = document.getElementById('entry-parent-number').value.trim();
        setChildNo = parseInt(document.getElementById('entry-child-number').value, 10);
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
            parent_item_number: isSetItem ? parentItemNumber : null,
            set_child_no: isSetItem && !isNaN(setChildNo) ? setChildNo : null,
            set_quantity: isSetItem && !isNaN(setQuantity) ? setQuantity : 1
        };

        let insertedItem;

        if (currentEditingItemId) {
            // 更新処理
            const { data: updateData, error: updateError } = await db.from('items')
                .update(itemDataPayload)
                .eq('id', currentEditingItemId)
                .select()
                .single();

            if (updateError) throw updateError;

            insertedItem = updateData;

            // 中間テーブルの既存データを削除
            await db.from('item_colors').delete().eq('item_id', currentEditingItemId);
            await db.from('item_acquisition_methods').delete().eq('item_id', currentEditingItemId);
            await db.from('item_moods').delete().eq('item_id', currentEditingItemId);

        } else {
            // 新規登録処理
            const { data: insertData, error: insertError } = await db.from('items')
                .insert([itemDataPayload])
                .select()
                .single();

            if (insertError) throw insertError;

            insertedItem = insertData;
        }
        
        // 中間テーブルへInsert
        const checkedColors = Array.from(document.querySelectorAll('input[name="color"]:checked')).map(cb => cb.value);
        const checkedAcqs = Array.from(document.querySelectorAll('input[name="acquisition"]:checked')).map(cb => cb.value);
        const checkedMoods = Array.from(document.querySelectorAll('input[name="mood"]:checked')).map(cb => cb.value);
        
        if (checkedColors.length > 0) {
            await db.from('item_colors').insert(checkedColors.map(id => ({ item_id: insertedItem.id, color_id: id })));
        }
        if (checkedAcqs.length > 0) {
            await db.from('item_acquisition_methods').insert(checkedAcqs.map(id => ({ item_id: insertedItem.id, acquisition_method_id: id })));
        }
        if (checkedMoods.length > 0) {
            await db.from('item_moods').insert(checkedMoods.map(id => ({ item_id: insertedItem.id, mood_id: id })));
        }
        
        await saveItemImages(
            insertedItem.id,
            currentEditingItemId !== null
        );
        alert(currentEditingItemId ? '衣装を更新しました！' : '衣装を登録しました！');

        // 作成者・更新者名を取得するため再取得
        const { data: latestItem } = await db
        .from('items')
        .select(`
            *,
            created_by_member:members!items_created_by_fkey(name),
            updated_by_member:members!items_updated_by_fkey(name)
        `)
        .eq('id', insertedItem.id)
        .single();

        if (latestItem) {
            insertedItem = latestItem;
        }

        // 登録情報を表示
        document.getElementById('item-info-panel').style.display = 'block';

        if (!insertedItem) {
            console.error('登録データ取得失敗');
            return;
        }

        // 編集状態を解除（フォーム内容は維持）
        currentEditingItemId = null;

        document.getElementById('info-management-number').textContent =
            insertedItem.management_number || '-';

        document.getElementById('info-created-by').textContent =
            insertedItem.created_by_member?.name || insertedItem.created_by || '-';

       document.getElementById('info-updated-by').textContent =
            insertedItem.updated_by_member?.name || insertedItem.updated_by || '-';

        document.getElementById('info-created-at').textContent =
            insertedItem.created_at
                ? new Date(insertedItem.created_at).toLocaleString('ja-JP')
                : '-';

        document.getElementById('info-updated-at').textContent =
            insertedItem.updated_at
                ? new Date(insertedItem.updated_at).toLocaleString('ja-JP')
                : '-';

        // フォームのリセットと状態の初期化
        resetClosetEntryForm(false);

        // データを再取得して一覧を更新
        await loadClosetItems();

        // 登録タブを表示したままにする
        const entryTabBtn = document.querySelector('[data-tab="closet-entry"]');
        if (entryTabBtn) entryTabBtn.click();

    } catch (error) {
        console.error("衣装保存エラー:", error);
        alert(error.message || JSON.stringify(error));
    } finally {
        const indicator = document.getElementById('sync-indicator');
        if (indicator) indicator.classList.add('hidden');
    }
}

// フォームをリセットし、新規登録状態に戻す
function resetClosetEntryForm(clearInfo = true) {
    currentEditingItemId = null;

    if (clearInfo) {
        // 管理情報を非表示
        document.getElementById('item-info-panel').style.display = 'none';
        document.getElementById('info-management-number').textContent = '-';
        document.getElementById('info-created-by').textContent = '-';
        document.getElementById('info-created-at').textContent = '-';
        document.getElementById('info-updated-by').textContent = '-';
        document.getElementById('info-updated-at').textContent = '-';
    }

    const form = document.getElementById('closet-entry-form');
    if (form) form.reset();

    clearSelectedImages();
    
    // チェックボックスもリセット
    document.querySelectorAll('#closet-entry-form input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
    });
    
    toggleSetItemFields();
    handleLargeCategoryChange();
    
    // UIを「登録」に戻す
    const headerTitle = document.querySelector('#closet-entry .section-header h2');
    if (headerTitle) headerTitle.innerHTML = '<i class="fa-solid fa-square-plus"></i> 衣装登録';
    
    const submitBtn = document.querySelector('#closet-entry-form button[type="submit"]');
    if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> 登録する';
}

// アイテムの編集
function editClosetItem(id) {
    const item = state.closetItems.find(i => i.id === id);
    if (!item) return;

    currentEditingItemId = id;

    // 管理情報を表示
    document.getElementById('item-info-panel').style.display = 'block';
    document.getElementById('info-management-number').textContent = item.management_number || '-';
    document.getElementById('info-created-by').textContent =
        item.created_by_name || item.created_by || '-';

    document.getElementById('info-created-at').textContent =
        item.created_at
            ? new Date(item.created_at).toLocaleString('ja-JP')
            : '-';

    document.getElementById('info-updated-by').textContent =
        item.updated_by_name || item.updated_by || '-';

    document.getElementById('info-updated-at').textContent =
        item.updated_at ? new Date(item.updated_at).toLocaleString('ja-JP') : '-';

    // フォームに値をセット
    document.getElementById('entry-name').value = item.name || '';
    document.getElementById('entry-large-category').value = item.large_category_id || '';
    
    // 大項目の変更に伴う中項目の表示制御を適用
    handleLargeCategoryChange();
    
    document.getElementById('entry-middle-category').value = item.middle_category_id || '';
    document.getElementById('entry-small-category').value = item.small_category_id || '';
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
    
    document.getElementById('entry-is-set').checked = !!item.is_set_item;
    document.getElementById('entry-parent-number').value = item.parent_item_number || '';
    document.getElementById('entry-child-number').value = item.set_child_no || '';
    document.getElementById('entry-set-quantity').value = item.set_quantity || '1';
    
    toggleSetItemFields();

    // 一旦チェックボックスをすべてクリア（セット品以外）
    document.querySelectorAll('#closet-entry-form input[type="checkbox"]').forEach(cb => {
        if (cb.id !== 'entry-is-set') cb.checked = false;
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
    if (headerTitle) headerTitle.innerHTML = '<i class="fa-solid fa-pen"></i> 衣装編集';
    
    const submitBtn = document.querySelector('#closet-entry-form button[type="submit"]');
    if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 更新する';

    // 登録タブへ切り替え
    const entryTabBtn = document.querySelector('[data-tab="closet-entry"]');
    if (entryTabBtn) entryTabBtn.click();
}

// アイテムの削除
async function deleteClosetItem(id) {
    if (!confirm('この衣装を削除しますか？\n※関連する画像データや中間データも削除されます。')) {
        return;
    }

    try {
        const indicator = document.getElementById('sync-indicator');
        if (indicator) indicator.classList.remove('hidden');

        // 中間テーブルや画像の外部キーにCASCADEがない場合を想定し明示的に削除
        const item = state.closetItems.find(i => i.id === id);
        
        await db.from('item_colors').delete().eq('item_id', id);
        await db.from('item_acquisition_methods').delete().eq('item_id', id);
        await db.from('item_moods').delete().eq('item_id', id);

        if (item && item.item_images && item.item_images.length > 0) {
            await db.from('item_images').delete().eq('item_id', id);
        }

        const { error } = await db.from('items').delete().eq('id', id);
        if (error) throw error;

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

        await db
            .from('item_favorites')
            .insert({
                member_id: currentMember.id,
                item_id: itemId
            });

        state.favoriteItems.push(itemId);

    }

    renderClosetItems();
}