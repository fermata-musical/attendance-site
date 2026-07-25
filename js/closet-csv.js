// js/closet-csv.js

// ----------------------------------------------------
// CSVパース処理
// ----------------------------------------------------
function parseCSV(text) {
    const lines = [];
    let currentLine = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (inQuotes) {
            if (char === '"') {
                if (nextChar === '"') {
                    currentField += '"';
                    i++; // skip next quote
                } else {
                    inQuotes = false;
                }
            } else {
                currentField += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                currentLine.push(currentField);
                currentField = '';
            } else if (char === '\r') {
                // ignore \r
            } else if (char === '\n') {
                currentLine.push(currentField);
                lines.push(currentLine);
                currentLine = [];
                currentField = '';
            } else {
                currentField += char;
            }
        }
    }

    currentLine.push(currentField);
    if (currentLine.length > 0 || currentField !== '') {
        lines.push(currentLine);
    }

    // Filter out empty lines
    return lines.filter(line => line.join('').trim() !== '');
}

// ----------------------------------------------------
// テンプレートダウンロード
// ----------------------------------------------------
function downloadCsvTemplate() {
    const headers = [
        "名称", "大項目", "中項目", "小項目", "サイズ", 
        "保管場所", "状態", "購入日", "購入金額", "最終使用日", 
        "備考", "使用履歴", "色", "雰囲気", "入手方法",
        "セット登録", "セット数量"
    ];
    
    // BOM付きUTF-8で文字化け防止
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const csvContent = headers.join(',') + '\n';
    
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "closet_template.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ----------------------------------------------------
// マスタデータ出力（将来的な拡張用）
// ----------------------------------------------------
function downloadMasterCsv(type) {
    let headers = [];
    let rows = [];
    let filename = 'master.csv';

    if (type === 'storage') {
        headers = ["箱のコード", "保管場所名"];
        filename = 'storage_master.csv';
        if (state.closetMaster && state.closetMaster.storage) {
            rows = state.closetMaster.storage.map(s => [s.box_code || '', s.location || '']);
        }
    } else if (type === 'colors') {
        headers = ["色名"];
        filename = 'colors_master.csv';
        if (state.closetMaster && state.closetMaster.colors) {
            rows = state.closetMaster.colors.map(c => [c.name || '']);
        }
    } else if (type === 'moods') {
        headers = ["雰囲気名"];
        filename = 'moods_master.csv';
        if (state.closetMaster && state.closetMaster.moods) {
            rows = state.closetMaster.moods.map(m => [m.name || '']);
        }
    }

    if (headers.length === 0) return;

    // ヘッダーとデータを結合（カンマエスケープ等の簡易処理）
    const escapeCsv = (str) => `"${String(str).replace(/"/g, '""')}"`;
    const csvContent = [
        headers.map(escapeCsv).join(','),
        ...rows.map(row => row.map(escapeCsv).join(','))
    ].join('\n');

    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ----------------------------------------------------
// CSV読み込み・プレビュー処理
// ----------------------------------------------------
let parsedCsvDataList = []; // 検証済みの登録データ
let hasCsvError = false;

document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('csv-file-input');
    if (fileInput) {
        fileInput.addEventListener('change', handleCsvFileSelect);
    }
});

function handleCsvFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        const text = event.target.result;
        processCsvText(text);
    };
    reader.readAsText(file); // UTF-8前提
}

function resetCsvImport() {
    document.getElementById('csv-file-input').value = '';
    document.getElementById('csv-preview-area').style.display = 'none';
    parsedCsvDataList = [];
    hasCsvError = false;
}

function processCsvText(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) {
        showCsvError("データがありません。1行目にヘッダー、2行目以降にデータを入力してください。");
        return;
    }

    const headers = rows[0].map(h => h.trim());
    const dataRows = rows.slice(1);

    parsedCsvDataList = [];
    hasCsvError = false;
    let errors = [];

    // プレビュー表示用
    const previewHead = document.getElementById('csv-preview-head');
    const previewBody = document.getElementById('csv-preview-body');
    previewHead.innerHTML = '<th>No.</th>' + headers.map(h => `<th>${escapeHtml(h)}</th>`).join('') + '<th>状態</th>';
    previewBody.innerHTML = '';

    // マスタ検索用ヘルパー
    const findMaster = (arr, name) => arr.find(item => item.name === name);

    dataRows.forEach((row, index) => {
        const rowNumber = index + 2; // 1-indexed (header is 1)
        let rowErrors = [];
        
        // ヘッダー名から値を取得する関数
        const getVal = (headerName) => {
            const idx = headers.indexOf(headerName);
            return (idx !== -1 && idx < row.length) ? row[idx].trim() : '';
        };

        const name = getVal("名称");
        // 管理番号はCSVからは読み込まず、サーバー側での自動採番に任せる
        const largeName = getVal("大項目");
        const middleName = getVal("中項目");
        const smallName = getVal("小項目");
        const size = getVal("サイズ");
        const storageStr = getVal("保管場所");
        const statusName = getVal("状態");
        const purchaseDate = getVal("購入日");
        const purchasePrice = getVal("購入金額");
        const lastUsedDate = getVal("最終使用日");
        const remarks = getVal("備考");
        const usageHistory = getVal("使用履歴");
        
        const colorsStr = getVal("色");
        const moodsStr = getVal("雰囲気");
        const acqStr = getVal("入手方法");

        const setRegisterStr = getVal("セット登録");
        const setQuantityStr = getVal("セット数量");

        const isSetItem = setRegisterStr === "1" || setRegisterStr.toUpperCase() === "TRUE" || setRegisterStr === "あり" || setRegisterStr === "はい";
        let setQuantity = 1;
        if (isSetItem) {
            setQuantity = parseInt(setQuantityStr, 10);
            if (isNaN(setQuantity) || setQuantity < 2) {
                rowErrors.push("セット登録の場合は、セット数量に2以上の数値を入力してください");
            }
        }

        // 必須チェック
        if (!name) rowErrors.push("名称は必須です");
        if (!largeName) rowErrors.push("大項目は必須です");

        // マスタ変換
        let large_id = null;
        if (largeName) {
            const m = findMaster(state.closetMaster.large, largeName);
            if (m) large_id = m.id;
            else rowErrors.push(`大項目「${largeName}」が存在しません`);
        }

        let middle_id = null;
        if (middleName) {
            const m = findMaster(state.closetMaster.middle, middleName);
            if (m) middle_id = m.id;
            else rowErrors.push(`中項目「${middleName}」が存在しません`);
        }

        let small_id = null;
        if (smallName) {
            const m = findMaster(state.closetMaster.small, smallName);
            if (m) small_id = m.id;
            else rowErrors.push(`小項目「${smallName}」が存在しません`);
        }

        let storage_box_id = null;
        if (storageStr) {
            const m = state.closetMaster.storage.find(s => s.box_code === storageStr || s.location === storageStr);
            if (m) storage_box_id = m.id;
            else rowErrors.push(`保管場所「${storageStr}」が存在しません`);
        }

        let item_status_id = null;
        if (statusName) {
            const m = findMaster(state.closetMaster.statuses, statusName);
            if (m) item_status_id = m.id;
            else rowErrors.push(`状態「${statusName}」が存在しません`);
        } else {
            const m = findMaster(state.closetMaster.statuses, "通常");
            if (m) item_status_id = m.id;
        }

        // タグ類（カンマ区切り）
        const parseTags = (str, masterArray, typeName) => {
            if (!str) return [];
            const names = str.split(',').map(s => s.trim()).filter(s => s);
            const ids = [];
            for (let n of names) {
                const m = findMaster(masterArray, n);
                if (m) {
                    ids.push(m.id);
                } else {
                    rowErrors.push(`${typeName}「${n}」が存在しません`);
                }
            }
            return ids;
        };

        const colorIds = parseTags(colorsStr, state.closetMaster.colors, "色");
        const moodIds = parseTags(moodsStr, state.closetMaster.moods, "雰囲気");
        const acqIds = parseTags(acqStr, state.closetMaster.acquisition, "入手方法");

        // 購入金額（数値変換）
        let priceNum = null;
        if (purchasePrice) {
            const num = parseInt(purchasePrice.replace(/[^0-9-]/g, ''), 10);
            if (!isNaN(num)) priceNum = num;
        }

        if (rowErrors.length > 0) {
            hasCsvError = true;
            errors.push(`${rowNumber}行目: ${rowErrors.join('、 ')}`);
        }

        const payload = {
            name,
            large_category_id: large_id,
            middle_category_id: middle_id,
            small_category_id: small_id,
            size: size || null,
            storage_box_id: storage_box_id,
            status_id: item_status_id,
            purchase_date: purchaseDate || null,
            purchase_price: priceNum,
            last_used_date: lastUsedDate || null,
            remarks: remarks || null,
            usage_history: usageHistory || null,
            is_set_item: isSetItem,
            parent_item_number: null,
            set_child_no: null,
            set_quantity: isSetItem ? setQuantity : 1,
            created_by: window.currentMember ? window.currentMember.id : null,
            updated_by: window.currentMember ? window.currentMember.id : null
        };

        parsedCsvDataList.push({
            payload,
            colorIds,
            moodIds,
            acqIds
        });

        // プレビューHTML
        const tr = document.createElement('tr');
        if (rowErrors.length > 0) tr.style.backgroundColor = '#f9e2e2';
        
        let tdHtml = `<td>${rowNumber}</td>`;
        headers.forEach((h, idx) => {
            const val = idx < row.length ? row[idx] : '';
            tdHtml += `<td>${escapeHtml(val)}</td>`;
        });
        
        if (rowErrors.length > 0) {
            tdHtml += `<td style="color:#d9534f; font-weight:bold;">エラーあり</td>`;
        } else {
            tdHtml += `<td style="color:green;">OK</td>`;
        }
        
        tr.innerHTML = tdHtml;
        previewBody.appendChild(tr);
    });

    document.getElementById('csv-preview-area').style.display = 'block';
    
    const errorContainer = document.getElementById('csv-error-message');
    const executeBtn = document.getElementById('btn-execute-csv');
    
    if (hasCsvError) {
        errorContainer.style.display = 'block';
        errorContainer.innerHTML = '<strong>エラーが見つかりました（登録できません）</strong><br>' + errors.join('<br>');
        executeBtn.disabled = true;
        executeBtn.style.opacity = '0.5';
        executeBtn.style.cursor = 'not-allowed';
    } else {
        errorContainer.style.display = 'none';
        executeBtn.disabled = false;
        executeBtn.style.opacity = '1';
        executeBtn.style.cursor = 'pointer';
    }
}

function showCsvError(msg) {
    document.getElementById('csv-preview-area').style.display = 'block';
    document.getElementById('csv-preview-table').parentElement.style.display = 'none';
    const errorContainer = document.getElementById('csv-error-message');
    errorContainer.style.display = 'block';
    errorContainer.innerHTML = escapeHtml(msg);
    document.getElementById('btn-execute-csv').disabled = true;
    document.getElementById('btn-execute-csv').style.opacity = '0.5';
}

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ----------------------------------------------------
// 一括登録実行
// ----------------------------------------------------
async function executeCsvImport() {
    if (hasCsvError || parsedCsvDataList.length === 0) return;

    if (!confirm(`${parsedCsvDataList.length}件のアイテムを登録します。よろしいですか？`)) {
        return;
    }

    const btn = document.getElementById('btn-execute-csv');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 登録中...';

    try {
        for (let i = 0; i < parsedCsvDataList.length; i++) {
            const data = parsedCsvDataList[i];
            
            // 1. アイテム登録
            let targetItemIds = [];
            
            if (data.payload.is_set_item) {
                const tempPayload = { ...data.payload, is_set_item: false, parent_item_number: null, set_child_no: null };
                const firstItem = await window.closetApi.insertItem(tempPayload);
                const parentNumber = firstItem.item_number;
                
                const updatedFirst = await window.closetApi.updateItem(firstItem.id, {
                    is_set_item: true,
                    parent_item_number: parentNumber,
                    item_number: `${parentNumber}-01`,
                    set_child_no: 1,
                    set_quantity: data.payload.set_quantity
                });
                targetItemIds.push(updatedFirst.id);
                
                for (let j = 2; j <= data.payload.set_quantity; j++) {
                    const branchNoStr = j.toString().padStart(2, '0');
                    const newItem = await window.closetApi.insertItem({
                        ...data.payload,
                        is_set_item: true,
                        parent_item_number: parentNumber,
                        item_number: `${parentNumber}-${branchNoStr}`,
                        set_child_no: j,
                        set_quantity: data.payload.set_quantity
                    });
                    targetItemIds.push(newItem.id);
                }
            } else {
                const insertedItem = await window.closetApi.insertItem(data.payload);
                targetItemIds.push(insertedItem.id);
            }
            
            // 2. 中間テーブル登録
            for (const itemId of targetItemIds) {
                if (data.colorIds.length > 0) {
                    const rows = data.colorIds.map(id => ({ item_id: itemId, color_id: id }));
                    await window.closetApi.insertColors(rows);
                }
                if (data.moodIds.length > 0) {
                    const rows = data.moodIds.map(id => ({ item_id: itemId, mood_id: id }));
                    await window.closetApi.insertMoods(rows);
                }
                if (data.acqIds.length > 0) {
                    const rows = data.acqIds.map(id => ({ item_id: itemId, acquisition_method_id: id }));
                    await window.closetApi.insertAcquisitions(rows);
                }
            }
        }
        
        alert(`一括登録が完了しました！`);
        resetCsvImport();
        
        // リロード (initializeCloset() は closet.js にある想定)
        if (typeof initializeCloset === 'function') {
            await initializeCloset();
        }
        
    } catch (err) {
        console.error("CSV一括登録エラー:", err);
        alert(`登録中にエラーが発生しました。\n${err.message}`);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> この内容で登録する';
    }
}
