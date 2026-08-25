// ========================================
// image-manager.js
// 共通画像管理 (汎用化版)
// ========================================

let selectedImages = [];
let deletedImages = [];

// プレビューコンテナのID
const PREVIEW_CONTAINER_ID = "entry-image-preview";

async function handleImageSelect(event, maxCount = 5, maxSizeMB = 0) {
    const files = Array.from(event.target.files);

    // 容量制限チェック
    if (maxSizeMB > 0) {
        let currentSize = selectedImages.reduce((sum, f) => sum + (f.size || f.file_size || 0), 0);
        let newSize = files.reduce((sum, f) => sum + f.size, 0);
        if (currentSize + newSize > maxSizeMB * 1024 * 1024) {
            alert(`合計容量が制限（${maxSizeMB}MB）を超えています。別のファイルを選択するか、減らしてください。`);
            event.target.value = "";
            return;
        }
    }

    for (let file of files) {
        if (maxCount > 0 && selectedImages.length >= maxCount) {
            break;
        }

        // HEIC画像の変換処理
    if (file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')) {
        try {
            if (typeof heic2any === 'undefined') {
                throw new Error("heic2any library is not loaded.");
            }

            const convertedBlob = await heic2any({
                blob: file,
                toType: "image/jpeg",
                quality: 0.8
            });

            const newFileName = file.name.replace(/\.heic$/i, '.jpg');

            const convertedFile = new File(
                [convertedBlob],
                newFileName,
                { type: "image/jpeg" }
            );

            const resizedFile = await resizeImage(convertedFile);

            selectedImages.push(resizedFile);

        } catch (err) {
            console.error("HEIC変換エラー:", err);
            alert(`${file.name}の変換に失敗しました。JPEG等をお試しください。`);
        }

    } else {

        const resizedFile = await resizeImage(file);

        selectedImages.push(resizedFile);

    }
    }

    renderImagePreview();

    // 同じ画像を再選択できるようにする
    event.target.value = "";
}

function renderImagePreview(bucketName = 'item-images') {
    const preview = document.getElementById(PREVIEW_CONTAINER_ID);
    if (!preview) return;

    preview.innerHTML = "";

    selectedImages.forEach((file, index) => {
        const reader = new FileReader();

        const createPreviewElement = (srcUrl, fileType, fileName) => {
            const div = document.createElement("div");
            div.style.position = "relative";
            div.style.display = "inline-block";
            div.title = fileName || '';
            
            let contentHtml = '';
            if (fileType === 'application/pdf' || (fileName && fileName.toLowerCase().endsWith('.pdf'))) {
                const shortName = fileName ? (fileName.length > 15 ? fileName.substring(0, 15) + '...' : fileName) : 'PDF';
                contentHtml = `
                    <div style="width:120px; height:120px; display:flex; flex-direction:column; align-items:center; justify-content:center; background:var(--bg-soft, #f0f0f0); border-radius:8px; border:1px solid var(--border-dusty, #ccc);">
                        <i class="fa-solid fa-file-pdf" style="font-size:2.5rem; color:#e25241;"></i>
                        <span style="font-size:0.7rem; color:var(--text-sub, #555); text-align:center; word-break:break-all; padding:0 5px; margin-top:10px; max-height:2.8em; overflow:hidden;">
                            ${shortName}
                        </span>
                    </div>
                `;
            } else {
                contentHtml = `
                    <img src="${srcUrl}" style="width:120px; height:120px; object-fit:cover; border-radius:8px; border:1px solid #ccc;">
                `;
            }

            div.innerHTML = `
                ${contentHtml}
                <button
                    type="button"
                    onclick="removeImage(${index})"
                    style="
                        position:absolute;
                        top:2px;
                        right:2px;
                        width:22px;
                        height:22px;
                        border:none;
                        border-radius:50%;
                        background:red;
                        color:white;
                        cursor:pointer;
                    ">
                    ×
                </button>
            `;
            return div;
        };

        if (file.isExisting) {
            // file.bucketName があればそれを使う、なければ引数の bucketName (互換性用)
            const targetBucket = file.bucketName || bucketName;
            const previewEl = createPreviewElement(getImageUrl(file.storage_path, targetBucket), file.mime_type, file.file_name);
            preview.appendChild(previewEl);
        } else {
            if (file.type === 'application/pdf') {
                const previewEl = createPreviewElement('', file.type, file.name);
                preview.appendChild(previewEl);
            } else {
                reader.onload = function (e) {
                    const previewEl = createPreviewElement(e.target.result, file.type, file.name);
                    preview.appendChild(previewEl);
                };
                reader.readAsDataURL(file);
            }
        }
    });
}

function removeImage(index) {
    const image = selectedImages[index];

    if (image?.isExisting) {
        deletedImages.push(image.storage_path);
    }

    selectedImages.splice(index, 1);
    renderImagePreview();
}

function clearSelectedImages() {
    selectedImages = [];
    deletedImages = [];

    const preview = document.getElementById(PREVIEW_CONTAINER_ID);
    if (preview) {
        preview.innerHTML = "";
    }
}

/**
 * 汎用画像アップロード処理
 * @param {string} targetId - 紐付ける親データのID (例: item_id, memo_id)
 * @param {Object} config - { bucket, table, foreignKey, hasMetadata }
 */
async function uploadImages(targetId, config) {
    const uploadedPaths = [];

    for (let i = 0; i < selectedImages.length; i++) {
        const imageFile = selectedImages[i];

        if (imageFile.isExisting) {
            // 既存画像の場合はレコードを再登録する (storageにはすでに存在する)
            const orderCol = config.orderColumn || 'sort_order';
            const insertData = {
                [config.foreignKey]: targetId,
                storage_path: imageFile.storage_path,
                [orderCol]: i + 1
            };
            
            if (config.hasMetadata) {
                insertData.file_name = imageFile.file_name || '';
                insertData.file_size = imageFile.file_size || 0;
                insertData.mime_type = imageFile.mime_type || '';
            }

            const { error: imageInsertError } = await db
                .from(config.table)
                .insert([insertData]);

            if (imageInsertError) {
                console.error("既存画像のDB再登録エラー:", imageInsertError);
                await rollbackUploadedImages(uploadedPaths, config.bucket);
                throw new Error("既存画像のDB登録エラー: " + imageInsertError.message);
            }
        } else {
            // 新規画像のアップロード
            const fileExt = imageFile.name.split('.').pop();
            const fileName = `${targetId}-${Date.now()}-${i}.${fileExt}`;

            const { error: uploadError } = await db.storage
                .from(config.bucket)
                .upload(fileName, imageFile);

            if (uploadError) {
                console.error("画像アップロードエラー:", uploadError);
                await rollbackUploadedImages(uploadedPaths, config.bucket);
                throw new Error("画像アップロードエラー: " + uploadError.message);
            }

            // ロールバック用に記録
            uploadedPaths.push(fileName);

            // DBへ登録
            const orderCol = config.orderColumn || 'sort_order';
            const insertData = {
                [config.foreignKey]: targetId,
                storage_path: fileName,
                [orderCol]: i + 1
            };
            
            if (config.hasMetadata) {
                insertData.file_name = imageFile.name;
                insertData.file_size = imageFile.size;
                insertData.mime_type = imageFile.type;
            }

            const { error: imageInsertError } = await db
                .from(config.table)
                .insert([insertData]);

            if (imageInsertError) {
                console.error("画像データ登録エラー:", imageInsertError);
                // DB登録失敗時はロールバック
                await rollbackUploadedImages(uploadedPaths, config.bucket);
                throw new Error("画像データ登録エラー: " + imageInsertError.message);
            }
        }
    }

    console.log("deletedImages =", deletedImages);

    if (deletedImages.length === 0) {
        console.error("削除対象画像が0件です");
        alert("削除対象画像が0件です");
    }

    // 編集時に削除された既存画像をStorageから削除
    if (deletedImages.length > 0) {

        console.log("削除対象 =", JSON.stringify(deletedImages));

        const { data, error } = await db.storage
            .from(config.bucket)
            .remove(deletedImages);

        console.log("Storage remove data =", data);
        console.log("Storage remove error =", error);

        if (error) {
            console.error("Storage画像削除エラー:", error);
            alert("Storage削除エラー: " + error.message);
        } else {
            console.log("Storage画像削除成功");
            alert("Storage削除成功");
        }

        deletedImages = [];
    }
}

/**
 * アップロード済み画像をStorageから削除する（エラー時のロールバック処理）
 */
async function rollbackUploadedImages(paths, bucketName) {
    if (!paths || paths.length === 0) return;
    
    console.warn("ロールバック処理を実行します。対象:", paths);
    const { error } = await db.storage.from(bucketName).remove(paths);
    if (error) {
        console.error("ロールバック（Storage削除）に失敗しました:", error);
    } else {
        console.log("ロールバック完了");
    }
}

/**
 * 対象の画像データをDBから取得する汎用関数
 */
async function getImages(targetId, config) {
    const orderCol = config.orderColumn || 'sort_order';
    const { data, error } = await db
        .from(config.table)
        .select('*')
        .eq(config.foreignKey, targetId)
        .order(orderCol);

    if (error) {
        console.error(error);
        return [];
    }
    return data;
}

/**
 * Storageパスから公開URLを取得する汎用関数
 * @param {string} storagePath - Storage内のパス
 * @param {string} bucketName - バケット名 (デフォルト: 'item-images')
 * @param {Object} transformOptions - SupabaseのTransformオプション (例: { width: 200, height: 200 })
 */
function getImageUrl(storagePath, bucketName = 'item-images', transformOptions = null) {
    if (!storagePath) return '';
    
    let options = undefined;
    if (transformOptions) {
        options = { transform: transformOptions };
    }
    
    const { data } = db.storage
        .from(bucketName)
        .getPublicUrl(storagePath, options);
        
    return data.publicUrl;
}

// ==========================================
// closet.js 用の互換ラッパー関数
// ==========================================
async function saveItemImages(itemId, isEdit) {
    const config = {
        bucket: 'item-images',
        table: 'item_images',
        foreignKey: 'item_id',
        orderColumn: 'image_order',
        hasMetadata: false
    };

    if (isEdit) {

        // 現在DBに登録されている画像を取得
        const { data: oldImages, error: fetchError } = await db
            .from(config.table)
            .select('storage_path')
            .eq(config.foreignKey, itemId);

        if (fetchError) {
            throw fetchError;
        }

        // 編集後も残す画像
        const keepPaths = selectedImages
            .filter(img => img.isExisting)
            .map(img => img.storage_path);

        // Storageから削除すべき画像
        const deletePaths = (oldImages || [])
            .map(img => img.storage_path)
            .filter(path => !keepPaths.includes(path));

        // Storage削除
        if (deletePaths.length > 0) {
            const { error: storageError } = await db.storage
                .from(config.bucket)
                .remove(deletePaths);

            if (storageError) {
                console.error('Storage削除エラー', storageError);
            }
        }

        // DBの画像レコード削除
        await db
            .from(config.table)
            .delete()
            .eq(config.foreignKey, itemId);
    }

    // 汎用アップロード処理を呼び出し
    await uploadImages(itemId, config);
}

async function getItemImages(itemId) {
    const config = {
        table: 'item_images',
        foreignKey: 'item_id',
        orderColumn: 'image_order'
    };

    return await getImages(itemId, config);
}