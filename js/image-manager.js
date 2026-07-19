// ========================================
// image-manager.js
// 共通画像管理
// ========================================

let selectedImages = [];

function handleImageSelect(event) {
    const files = Array.from(event.target.files);

    files.forEach(file => {
        if (selectedImages.length < 5) {
            selectedImages.push(file);
        }
    });

    renderImagePreview();

    // 同じ画像を再選択できるようにする
    event.target.value = "";
}

function renderImagePreview() {
    const preview = document.getElementById("entry-image-preview");
    if (!preview) return;

    preview.innerHTML = "";

    selectedImages.forEach((file, index) => {

        const reader = new FileReader();

        reader.onload = function (e) {

            const div = document.createElement("div");

            div.style.position = "relative";
            div.style.display = "inline-block";

            div.innerHTML = `
                <img
                    src="${e.target.result}"
                    style="
                        width:120px;
                        height:120px;
                        object-fit:cover;
                        border-radius:8px;
                        border:1px solid #ccc;
                    ">

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

            preview.appendChild(div);
        };

        if (file.isExisting) {

            const div = document.createElement("div");

            div.style.position = "relative";
            div.style.display = "inline-block";

            div.innerHTML = `
                <img
                    src="${getImageUrl(file.storage_path)}"
                    style="
                        width:120px;
                        height:120px;
                        object-fit:cover;
                        border-radius:8px;
                        border:1px solid #ccc;
                    ">

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

            preview.appendChild(div);

        } else {

            reader.readAsDataURL(file);

        }

    });

}

function removeImage(index) {
    selectedImages.splice(index, 1);
    renderImagePreview();
}

function clearSelectedImages() {
    selectedImages = [];

    const preview = document.getElementById("entry-image-preview");
    if (preview) {
        preview.innerHTML = "";
    }
}

async function uploadSelectedImages(itemId) {
    for (let i = 0; i < selectedImages.length; i++) {

        const imageFile = selectedImages[i];

        if (imageFile.isExisting) {

            await db
                .from('item_images')
                .insert([{
                    item_id: itemId,
                    storage_path: imageFile.storage_path,
                    image_order: i + 1
                }]);

            continue;
        }

        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${itemId}-${Date.now()}-${i}.${fileExt}`;

        const { error: uploadError } = await db.storage
            .from('item-images')
            .upload(fileName, imageFile);

        if (uploadError) {
            console.error("画像アップロードエラー:", uploadError);
            alert(JSON.stringify(uploadError));
            continue;
        }

        const { error: imageInsertError } = await db
            .from('item_images')
            .insert([{
                item_id: itemId,
                storage_path: fileName,
                image_order: i + 1
            }]);

        if (imageInsertError) {
            console.error("画像データ登録エラー:", imageInsertError);
            alert(JSON.stringify(imageInsertError));
        }
    }
}

async function getItemImages(itemId) {

    const { data, error } = await db
        .from('item_images')
        .select('*')
        .eq('item_id', itemId)
        .order('image_order');

    if (error) {
        console.error(error);
        return [];
    }

    return data;

}

function getImageUrl(storagePath) {

    console.log("storagePath:", storagePath);

    const { data } = db.storage
        .from('item-images')
        .getPublicUrl(storagePath);

    console.log("publicUrl:", data.publicUrl);

    return data.publicUrl;

}

async function saveItemImages(itemId, isEdit) {

    if (!isEdit) {
        await uploadSelectedImages(itemId);
        return;
    }

        await db.from('item_images')
            .delete()
            .eq('item_id', itemId);

        await uploadSelectedImages(itemId);

    }