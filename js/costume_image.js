// js/costume_image.js
// Handles the independent image selection, preview, and form submission for the "衣裳イメージ" tab.
// This file is deliberately isolated and does not touch the existing handleImageSelect() logic.

/**
 * Preview selected image files.
 * @param {Event} event - The file input change event.
 */
function handleCostumeImageSelect(event) {
    const input = event.target;
    const block = input.closest(".costume-item-block");

    if (block) {
        block.selectedImages = Array.from(input.files);
    }

    const previewContainer = document.getElementById("costume-image-preview");
    previewContainer.innerHTML = "";

    const files = input.files;
    if (!files) return;
  Array.from(files).forEach((file) => {
    if (!file.type.startsWith('image/')) return; // skip non‑image files
    const reader = new FileReader();
    reader.onload = function (e) {
      const img = document.createElement('img');
      img.src = e.target.result;
      img.alt = file.name;
      img.style.maxWidth = '150px';
      img.style.maxHeight = '150px';
      img.style.objectFit = 'cover';
      img.style.borderRadius = '8px';
      img.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
      previewContainer.appendChild(img);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Submit the costume image form.
 * For now we only log the selected files to the console, per the specification.
 */
async function submitCostumeImage() {

    console.log("submitCostumeImage 実行");


    const select = document.getElementById("costume-member-select");
    const option = select.options[select.selectedIndex];

    console.log("選択option", option);
    console.log("roleId", option.dataset.roleId);
    console.log("roleName", option.dataset.roleName);
    console.log("memberName", option.dataset.memberName);
    console.log("groupName", option.dataset.groupName);
    const projectData = {
        member_id: select.value,
        role_id: option.dataset.roleId,
        cast_name: option.dataset.roleName,
        member_name: option.dataset.memberName,
        group_name: option.dataset.groupName,
        costume_name: document.getElementById("costume-name").value,
        cast_comment: document.getElementById("costume-cast-comment").value,
        staff_comment: document.getElementById("costume-staff-comment").value
    };
    console.log("登録データ", projectData);

    const { data: project, error } = await db
        .from("costume_image_projects")
        .insert([projectData])
        .select()
        .single();

    if (error) {
        console.error(error);
        alert("登録に失敗しました");
        return;
    }

    const imageUrls = [];
    const itemBlocks = document.querySelectorAll(".costume-item-block");
    const itemDataList = [];

    for (const block of itemBlocks) {

        const itemImages = [];

        if (block.selectedImages) {

            for (const file of block.selectedImages) {

                const filePath = `costume-images/${crypto.randomUUID()}_${file.name}`;

                const { error: uploadError } = await db.storage
                    .from("costume-images")
                    .upload(filePath, file);

                if (uploadError) {
                    console.error("画像アップロードエラー", uploadError);
                    alert("画像アップロードに失敗しました");
                    return;
                }

                const { data: urlData } = db.storage
                    .from("costume-images")
                    .getPublicUrl(filePath);

                itemImages.push(urlData.publicUrl);
            }
        }

        itemDataList.push({
            project_id: project.id,
            large_category: block.querySelector(".costume-item-category").value,
            images: itemImages,
            urls: [
                {
                    title: block.querySelector(".costume-item-url-title").value,
                    url: block.querySelector(".costume-item-url").value
                }
            ]
        });
    }

    const { error: itemError } = await db
        .from("costume_image_items")
        .insert(itemDataList);

    if (itemError) {
        console.error("個別項目エラー", JSON.stringify(itemError, null, 2));
        alert("個別項目の登録に失敗しました");
        return;
    }

    alert("登録しました");
    resetCostumeForm();
}

/**
 * Reset the form – clear the file input and the preview area.
 */
function resetCostumeForm() {
    const input = document.getElementById("costume-item-images");
    const preview = document.getElementById("costume-image-preview");

    if (input) {
        input.value = "";
    }

    if (preview) {
        preview.innerHTML = "";
    }

    window.selectedCostumeImages = [];
}

function addCostumeItem() {
    const container = document.getElementById("costume-items-container");
    const first = container.querySelector(".costume-item-block");
    const clone = first.cloneNode(true);

    clone.selectedImages = [];

    clone.querySelectorAll("input").forEach(input => {
        input.value = "";
    });

    clone.querySelectorAll("select").forEach(select => {
        select.value = "";
    });

    container.appendChild(clone);
}

async function renderCostumeImageList() {
    const container = document.getElementById("costume-image-list-container");

    container.innerHTML = "";

    const { data: projects, error: projectError } = await db
        .from("costume_image_projects")
        .select("*")
        .order("created_at", { ascending: false });

    if (projectError) {
        console.error(projectError);
        return;
    }

    const { data: items, error: itemError } = await db
        .from("costume_image_items")
        .select("*");

    if (itemError) {
        console.error(itemError);
        return;
    }

    const data = projects.map(project => ({
        ...project,
        costume_image_items: items.filter(item =>
            item.project_id === project.id
        )
    }));

    console.log("一覧取得結果", data);

    console.log(JSON.stringify(data, null, 2));
    console.log("1件目", data[0]);

    console.log(JSON.stringify(data, null, 2));

    console.log(JSON.stringify(data, null, 2));

    data.forEach(project => {
        const div = document.createElement("div");

        div.className = "card";

        div.innerHTML = `
            <div class="costume-comment">
                <h4>【キャストコメント】</h4>
                <p>${project.cast_comment || ""}</p>
            </div>

            <div class="costume-comment">
                <h4>【衣裳担当コメント】</h4>
                <p>${project.staff_comment || ""}</p>
            </div>

            <div class="costume-items-grid">
                ${project.costume_image_items.map(item => `
                    <div class="costume-item-display">

                        <h4>
                            ${item.large_category}
                        </h4>

                        <div class="costume-item-images">
                            ${item.images.map(image => `
                                <img
                                    src="${image}"
                                    onclick="openCostumeImageModal('${image}')"
                                    class="costume-list-image">
                            `).join("")}
                        </div>

                        ${
                            item.urls && item.urls.length
                            ? `
                            <div class="costume-item-links">
                                ${item.urls.map(u => `
                                    <a href="${u.url}" target="_blank">
                                        ${u.title || "リンク"}
                                    </a>
                                `).join("")}
                            </div>
                            `
                            : ""
                        }

                    </div>
                `).join("")}
            </div>

            <div class="costume-actions">

                <button
                    class="icon-btn"
                    onclick="editCostumeImage('${project.id}')"
                    title="編集">
                    <i class="fa-solid fa-pen"></i>
                </button>

                <button
                    class="icon-btn"
                    onclick="deleteCostumeImage('${project.id}')"
                    title="削除">
                    <i class="fa-solid fa-trash"></i>
                </button>

            </div>
        `;
        container.appendChild(div);
    });
}

window.handleCostumeImageSelect = handleCostumeImageSelect;
window.submitCostumeImage = submitCostumeImage;
window.resetCostumeForm = resetCostumeForm;
window.addCostumeItem = addCostumeItem;
window.renderCostumeImageList = renderCostumeImageList;

// -----------------------------
// 衣裳イメージ サブタブ
// -----------------------------
document.addEventListener("DOMContentLoaded", () => {
    const buttons = document.querySelectorAll(".costume-subtab");

    buttons.forEach(button => {
        button.addEventListener("click", async () => {
            buttons.forEach(btn => btn.classList.remove("active"));
            button.classList.add("active");

            document
                .querySelectorAll(".costume-tab-content")
                .forEach(tab => {
                    tab.style.display = "none";
                });

            const target = button.dataset.costumeTab;

            document.getElementById("costume-" + target).style.display = "block";

            if (target === "list") {
                await renderCostumeImageList();
            }

            if (target === "entry") {
                await loadCostumeMemberSelect();
            }

            if (target === "admin") {
                document.getElementById("cast-edit-area").style.display = "none";
                await renderCostumeCastList();
            }
        });
    });

    document.getElementById("cancel-cast-btn").addEventListener("click", () => {
        document.getElementById("cast-edit-area").style.display = "none";
    });

    document.getElementById("update-cast-btn").addEventListener("click", updateCostumeCast);

    document.getElementById("add-cast-btn").addEventListener("click", () => {
        document.getElementById("cast-edit-area").style.display = "block";
        document.getElementById("edit-cast-id").value = "";
        document.getElementById("edit-sort-order").value = "";
        document.getElementById("edit-role-id").value = "";
        document.getElementById("edit-role-name").value = "";
        document.getElementById("edit-member-id").value = "";
        document.getElementById("edit-member-name").value = "";
        document.getElementById("edit-group-name").value = "";
    });
});

async function updateCostumeCast() {
    const id = document.getElementById("edit-cast-id").value;

    const updates = {
        sort_order: Number(document.getElementById("edit-sort-order").value),
        role_id: Number(document.getElementById("edit-role-id").value),
        role_name: document.getElementById("edit-role-name").value,
        member_id: document.getElementById("edit-member-id").value,
        member_name: document.getElementById("edit-member-name").value,
        group_name: document.getElementById("edit-group-name").value
    };

    let error;

    if (id) {
        ({ error } = await db
            .from("costume_casts")
            .update(updates)
            .eq("id", id));
    } else {
        ({ error } = await db
            .from("costume_casts")
            .insert([updates]));
    }

    if (error) {
        console.error(error);
        return;
    }

    document.getElementById("cast-edit-area").style.display = "none";

    document.getElementById("edit-cast-id").value = "";
    document.getElementById("edit-sort-order").value = "";
    document.getElementById("edit-role-id").value = "";
    document.getElementById("edit-role-name").value = "";
    document.getElementById("edit-member-id").value = "";
    document.getElementById("edit-member-name").value = "";
    document.getElementById("edit-group-name").value = "";

    await renderCostumeCastList();

    document.getElementById("cast-edit-area").style.display = "none";
}

// -----------------------------
// 配役一覧表示
// -----------------------------

async function renderCostumeCastList() {

    const tbody = document.querySelector("#costume-admin-cast-list tbody");

    if (!tbody) return;

    tbody.innerHTML = "";

    const { data, error } = await db
        .from("costume_casts")
        .select("*")
        .order("sort_order");

    console.log("costume_casts:", data);
    console.log("costume_casts error:", error);

    if (error) {

        console.error(error);

        tbody.innerHTML = `
            <tr>
                <td colspan="8">
                    データ取得に失敗しました
                </td>
            </tr>
        `;

        return;

    }

    data.forEach(row => {

        tbody.insertAdjacentHTML("beforeend", `
            <tr data-id="${row.id}">
                <td>${row.sort_order ?? ""}</td>
                <td>${row.role_id ?? ""}</td>
                <td>${row.role_name ?? ""}</td>
                <td>${row.member_id ?? ""}</td>
                <td>${row.member_name ?? ""}</td>
                <td>${row.group_name ?? ""}</td>
                <td>
                    <button
                        class="icon-btn edit-cast-btn"
                        title="編集"
                        data-id="${row.id}">

                        <i class="fa-solid fa-pen"></i>

                    </button>
                </td>
                <td>

                    <button
                        class="icon-btn delete-cast-btn"
                        title="削除"
                        data-id="${row.id}">

                        <i class="fa-solid fa-trash"></i>

                    </button>
                </td>
            </tr>
        `);
    });

    tbody.querySelectorAll(".edit-cast-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            editCostumeCast(btn.dataset.id);
        });
    });

    tbody.querySelectorAll(".delete-cast-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            deleteCostumeCast(btn.dataset.id);
        });
    });

}

async function editCostumeCast(id) {

    const { data, error } = await db
        .from("costume_casts")
        .select("*")
        .eq("id", id)
        .single();

    if (error) {
        console.error(error);
        return;
    }

    const editArea = document.getElementById("cast-edit-area");

    if (!editArea) return;

    editArea.style.display = "block";

    document.getElementById("edit-sort-order").value = data.sort_order ?? "";
    document.getElementById("edit-role-id").value = data.role_id ?? "";
    document.getElementById("edit-role-name").value = data.role_name ?? "";
    document.getElementById("edit-member-id").value = data.member_id ?? "";
    document.getElementById("edit-member-name").value = data.member_name ?? "";
    document.getElementById("edit-group-name").value = data.group_name ?? "";

    document.getElementById("edit-cast-id").value = id;
}

async function deleteCostumeCast(id) {

    if (!confirm("この配役を削除しますか？")) return;

    const { error } = await db
        .from("costume_casts")
        .delete()
        .eq("id", id);

    if (error) {
        console.error(error);
        return;
    }

    await renderCostumeCastList();
}

// -----------------------------
// 氏名プルダウン
// -----------------------------

async function loadCostumeMemberSelect() {
    console.log("loadCostumeMemberSelect 実行");

    const select = document.getElementById("costume-member-select");

    if (!select) return;

    const { data, error } = await db
        .from("costume_casts")
        .select("*")
        .order("sort_order");

    console.log("costume_casts取得結果", data);
    console.log("costume_casts取得エラー", error);

    if (error) {
        console.error(error);
        return;
    }

    select.innerHTML = `
        <option value="">選択してください</option>
    `;

    data.forEach(row => {
        select.insertAdjacentHTML(
            "beforeend",
            `
            <option
                value="${row.id}"
                data-role-id="${row.role_id}"
                data-role-name="${row.role_name}"
                data-member-name="${row.member_name}"
                data-group-name="${row.group_name}">
                ${row.role_id}｜${row.role_name}｜${row.member_name}｜${row.group_name}
            </option>
            `
        );
    });

}

function openCostumeImageModal(src) {
    const modal = document.getElementById("costume-image-modal");
    const img = document.getElementById("costume-image-modal-img");

    img.src = src;
    modal.style.display = "flex";
}

function closeCostumeImageModal() {
    const modal = document.getElementById("costume-image-modal");
    modal.style.display = "none";
}

document.addEventListener("DOMContentLoaded", () => {
    const close = document.getElementById("costume-image-modal-close");

    if (close) {
        close.addEventListener("click", closeCostumeImageModal);
    }
});

window.openCostumeImageModal = openCostumeImageModal;