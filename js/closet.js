// 衣装管理用スクリプト (closet.js)

let currentEditingItemId = null;

// ページロード時の初期化処理
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOMContentLoaded");
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
            colorsRes, acqRes, moodsRes
        ] = await Promise.all([
            db.from('category_large').select('*').order('sort_order', { ascending: true }),
            db.from('category_middle').select('*').order('sort_order', { ascending: true }),
            db.from('category_small').select('*').order('sort_order', { ascending: true }),
            db.from('storage_boxes').select('*').order('sort_order', { ascending: true }),
            db.from('colors').select('*').order('id', { ascending: true }),
            db.from('acquisition_methods').select('*').order('sort_order', { ascending: true }),
            db.from('moods').select('*').order('sort_order', { ascending: true })
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
            moods: moodsRes.data || []
        };

        populateDropdown('entry-large-category', state.closetMaster.large, 'id', 'name');
        populateDropdown('entry-middle-category', state.closetMaster.middle, 'id', 'name');
        populateDropdown('entry-small-category', state.closetMaster.small, 'id', 'name');
        populateDropdown('entry-storage', state.closetMaster.storage, 'id', 'location');
        populateDropdown('closet-search-category', state.closetMaster.large, 'id', 'name');

        populateCheckboxes('entry-color-container', state.closetMaster.colors, 'color', 'id', 'name');
        populateCheckboxes('entry-acquisition-container', state.closetMaster.acquisition, 'acquisition', 'id', 'name');
        populateCheckboxes('entry-mood-container', state.closetMaster.moods, 'mood', 'id', 'name');

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
            item_images ( storage_path, image_order ),
            item_colors ( color_id ),
            item_acquisition_methods ( acquisition_method_id ),
            item_moods ( mood_id )
        `);
        
        if (error) throw error;
        
        if (typeof state !== 'undefined') {
            state.closetItems = data;
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
            const path = item.item_images[0].storage_path;
            const { data: publicUrlData } = db.storage.from('item_images').getPublicUrl(path);
            if (publicUrlData) {
                imageUrl = publicUrlData.publicUrl;
            }
        }

        const storageBox = state.closetMaster?.storage?.find(s => s.id === item.storage_box_id);
        const storageText = storageBox ? storageBox.location : '-';
        
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
            <div style="margin-top: 15px; display: flex; gap: 8px;">
                <button onclick="editClosetItem('${item.id}')" class="puffy-btn pink puffy-btn-sm" style="flex: 1;"><i class="fa-solid fa-pen"></i> 編集</button>
                <button onclick="deleteClosetItem('${item.id}')" class="puffy-btn gray puffy-btn-sm" style="flex: 1;"><i class="fa-solid fa-trash"></i> 削除</button>
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
                .select();
            if (updateError) throw updateError;
            insertedItem = updateData[0];
            
            // 中間テーブルの既存データを削除
            await db.from('item_colors').delete().eq('item_id', currentEditingItemId);
            await db.from('item_acquisition_methods').delete().eq('item_id', currentEditingItemId);
            await db.from('item_moods').delete().eq('item_id', currentEditingItemId);

        } else {
            // 新規登録処理
            const { data: insertData, error: insertError } = await db.from('items')
                .insert([itemDataPayload])
                .select();
            if (insertError) throw insertError;
            insertedItem = insertData[0];
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
        
        // 画像ファイルのアップロード処理（画像が選択されている場合のみ）
        const imageFile = document.getElementById('entry-image').files[0];
        if (imageFile && insertedItem) {
            const fileExt = imageFile.name.split('.').pop();
            const fileName = `${insertedItem.id}-${Date.now()}.${fileExt}`;
            
            const { error: uploadError } = await db.storage
                .from('item_images')
                .upload(fileName, imageFile);
                
            if (uploadError) {
                console.error("画像アップロードエラー:", uploadError);
                alert('アイテムは保存されましたが、画像のアップロードに失敗しました。');
            } else {
                const { error: imageInsertError } = await db.from('item_images').insert([{
                    item_id: insertedItem.id,
                    storage_path: fileName,
                    image_order: 1
                }]);
                if (imageInsertError) {
                    console.error("画像データ登録エラー:", imageInsertError);
                }
            }
        }

        alert(currentEditingItemId ? '衣装を更新しました！' : '衣装を登録しました！');
        
        // フォームのリセットと状態の初期化
        resetClosetEntryForm();
        
        // データを再取得して一覧を更新
        await loadClosetItems();

        // 一覧タブに戻る
        const listTabBtn = document.querySelector('[data-tab="closet-list"]');
        if (listTabBtn) listTabBtn.click();

    } catch (error) {
        console.error("衣装保存エラー:", error);
        alert(error.message || JSON.stringify(error));
    } finally {
        const indicator = document.getElementById('sync-indicator');
        if (indicator) indicator.classList.add('hidden');
    }
}

// フォームをリセットし、新規登録状態に戻す
function resetClosetEntryForm() {
    currentEditingItemId = null;
    const form = document.getElementById('closet-entry-form');
    if (form) form.reset();
    
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

    // フォームに値をセット
    document.getElementById('entry-name').value = item.name || '';
    document.getElementById('entry-large-category').value = item.large_category_id || '';
    
    // 大項目の変更に伴う中項目の表示制御を適用
    handleLargeCategoryChange();
    
    document.getElementById('entry-middle-category').value = item.middle_category_id || '';
    document.getElementById('entry-small-category').value = item.small_category_id || '';
    document.getElementById('entry-size').value = item.size || '';
    document.getElementById('entry-storage').value = item.storage_box_id || '';
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
