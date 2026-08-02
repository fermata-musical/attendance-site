let editingProjectId = null;

function handleCostumeImageSelect(event) {
    const input = event.target;
    const block = input.closest(".costume-item-block");

    if (!block) return;

    if (!block.selectedImages) {
        block.selectedImages = [];
    }

    const previewContainer = block.querySelector(".costume-image-preview");

    Array.from(input.files).forEach(file => {

        if (!file.type.startsWith("image/")) return;

        block.selectedImages.push(file);

        const reader = new FileReader();

        reader.onload = e => {

            const wrapper = document.createElement("div");
            wrapper.className = "costume-preview-item";
            wrapper.style.position = "relative";
            wrapper.style.display = "inline-block";
            wrapper.style.margin = "4px";

            const img = document.createElement("img");
            img.src = e.target.result;
            img.alt = file.name;
            img.style.maxWidth = "150px";
            img.style.maxHeight = "150px";
            img.style.objectFit = "cover";
            img.style.borderRadius = "8px";
            img.style.boxShadow = "0 2px 6px rgba(0,0,0,.15)";

            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = "×";
            btn.style.position = "absolute";
            btn.style.top = "4px";
            btn.style.right = "4px";
            btn.style.width = "24px";
            btn.style.height = "24px";
            btn.style.border = "none";
            btn.style.borderRadius = "50%";
            btn.style.background = "#e53935";
            btn.style.color = "#fff";
            btn.style.cursor = "pointer";

            btn.onclick = () => {
                const index = block.selectedImages.indexOf(file);

                if (index !== -1) {
                    block.selectedImages.splice(index, 1);
                }

                wrapper.remove();
            };

            wrapper.appendChild(img);
            wrapper.appendChild(btn);
            previewContainer.appendChild(wrapper);

        };

        reader.readAsDataURL(file);

    });

    input.value = "";
}

async function submitCostumeImage() {

    console.log("submitCostumeImage 実行");

    if (editingProjectId) {
        return updateCostumeImage();
    }

    const select = document.getElementById("costume-member-select");
    const option = select.options[select.selectedIndex];

    if (!select.value) {
        alert("使用者を選択してください");
        return;
    }

    const projectData = {
        member_id: select.value,
        role_id: option.dataset.roleId,
        cast_name: option.dataset.roleName,
        member_name: option.dataset.memberName,
        group_name: option.dataset.groupName,
        scene: document.getElementById("costume-scene").value,
        costume_name: document.getElementById("costume-scene").value,
        cast_comment: document.getElementById("costume-cast-comment").value,
        staff_comment: document.getElementById("costume-staff-comment").value
    };

    const { data: project, error } = await db
        .from("costume_image_projects")
        .insert(projectData)
        .select()
        .single();

    if (error) {
        console.error(error);
        alert("登録に失敗しました");
        return;
    }

    const itemBlocks = document.querySelectorAll(".costume-item-block");
    const itemDataList = [];

    for (const block of itemBlocks) {

        let itemImages = JSON.parse(
            block.dataset.existingImages || "[]"
        );

        if (block.selectedImages && block.selectedImages.length > 0) {

            for (const file of block.selectedImages || []) {

                const ext =
                    file.name.substring(
                        file.name.lastIndexOf(".") + 1
                    );

                const filePath =
                    `${crypto.randomUUID()}.${ext}`;

                const { error: uploadError } = await db.storage
                    .from("costume-images")
                    .upload(filePath, file);

                if (uploadError) {
                    console.error(uploadError);
                    alert(
                        "画像アップロードに失敗しました。\n\n" +
                        JSON.stringify(uploadError, null, 2)
                    );
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
    console.log("itemBlocks数", itemBlocks.length);
    console.log("itemDataList", itemDataList);

    const { data: insertedItems, error: itemError } = await db
        .from("costume_image_items")
        .insert(itemDataList)
        .select();

    console.log("登録結果", insertedItems);

    if (itemError) {
        console.error(itemError);
        alert("個別項目の登録に失敗しました");
        return;
    }

    editingProjectId = null;

    const saveBtn = document.querySelector('#costume-entry button[type="submit"]');
    if (saveBtn) {
        saveBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> 登録する';
    }

    resetCostumeForm();

    await loadCostumeMemberSelect();
    await renderCostumeImageList();

    document.querySelector('[data-costume-tab="list"]').click();

    alert("登録しました");
}
/**
 * Reset the form – clear the file input and the preview area.
 */
function resetCostumeForm() {

    document.getElementById("costume-member-select").value = "";
    const costumeName = document.getElementById("costume-name");
    if (costumeName) {
        costumeName.value = "";
    }
    document.getElementById("costume-cast-comment").value = "";
    document.getElementById("costume-staff-comment").value = "";

    const container = document.getElementById("costume-items-container");
    const first = container.querySelector(".costume-item-block");

    container.innerHTML = "";

    const block = first.cloneNode(true);

    block.selectedImages = [];
    block.removeAttribute("data-project-item-id");
    block.removeAttribute("data-existing-images");
    block.removeAttribute("data-original-images");

    block.querySelectorAll("input").forEach(input => input.value = "");
    block.querySelectorAll("select").forEach(select => select.value = "");

    const preview = block.querySelector(".costume-image-preview");
    if (preview) {
        preview.innerHTML = "";
    }

    container.appendChild(block);

    updateCostumeItemMoveButtons();

    window.selectedCostumeImages = [];
}

function addCostumeItem() {
    const container = document.getElementById("costume-items-container");
    const first = container.querySelector(".costume-item-block");
    const clone = first.cloneNode(true);

    clone.selectedImages = [];

    clone.removeAttribute("data-project-item-id");
    clone.dataset.existingImages = "[]";
    clone.dataset.originalImages = "[]";

    clone.querySelectorAll("input").forEach(input => {
        input.value = "";
    });

    clone.querySelectorAll("select").forEach(select => {
        select.value = "";
    });

    const preview = clone.querySelector(".costume-image-preview");
    if (preview) {
        preview.innerHTML = "";
    }

    container.appendChild(clone);

    updateCostumeItemMoveButtons();
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

    const { data: casts, error: castError } = await db
        .from("costume_casts")
        .select("*");

    if (castError) {
        console.error(castError);
        return;
    }

    const { data: items, error: itemError } = await db
        .from("costume_image_items")
        .select("*");

    if (itemError) {
        console.error(itemError);
        return;
    }

    let data = projects.map(project => {

        const cast = casts.find(c => c.id === project.member_id);

        return {
            ...project,
            sort_order: cast?.sort_order ?? 9999,
            role_id: cast?.role_id ?? project.role_id,
            member_name: cast?.member_name ?? project.member_name,
            role_name: cast?.role_name ?? project.cast_name,
            group_name: cast?.group_name ?? project.group_name,
            costume_image_items: items.filter(item =>
                item.project_id === project.id
            )
        };

    });

    const selectedScenes = Array.from(
        document.querySelectorAll(".scene-filter:checked")
    ).map(el => el.value);

    if (selectedScenes.length > 0) {

        data = data.filter(project => {

            if (selectedScenes.includes("城と村")) {
                return (
                    project.scene === "城_魔法にかかっている" ||
                    project.scene === "城_魔法がとけた" ||
                    project.scene === "村"
                );
            }

            return selectedScenes.includes(project.scene);

        });

    }

    const sortMode =
        document.getElementById("costume-sort-select")?.value || "display-order";

    switch (sortMode) {

        case "display-order":
            data.sort((a, b) =>
                (a.sort_order ?? 9999) - (b.sort_order ?? 9999)
            );
            break;

        case "member-name":
            data.sort((a, b) =>
                (a.member_name || "").localeCompare(
                    b.member_name || "",
                    "ja"
                )
            );
            break;

        case "role-id":
            data.sort((a, b) =>
                (a.role_id ?? 9999) - (b.role_id ?? 9999)
            );
            break;

        default:
            data.sort((a, b) =>
                (a.sort_order ?? 9999) - (b.sort_order ?? 9999)
            );
            break;
    }

    console.log("一覧取得結果", data);

    data.forEach(project => {
        console.log(project.role_id, project.costume_image_items.length);
    });

    console.log(JSON.stringify(data, null, 2));
    console.log("1件目", data[0]);

    console.log(JSON.stringify(data, null, 2));

    console.log(JSON.stringify(data, null, 2));

    data.forEach(project => {
        const div = document.createElement("div");

        div.className = "card";
        div.dataset.projectId = project.id;

        div.innerHTML = `
            <div class="costume-info">

                <h3>
                    ${project.role_id || ""} /
                    ${project.cast_name || ""} /
                    ${project.member_name || ""} /
                    ${project.group_name || ""}
                </h3>

            </div>

            <div class="costume-comment">
                <h4>【シーン】</h4>
                <p>${project.costume_name || ""}</p>
            </div>

            <div class="costume-comment">
                <h4>【キャストコメント】</h4>
                <p>${project.cast_comment || ""}</p>
            </div>

            <div class="costume-comment staff-comment">
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
                                ${item.urls
                                    .filter(u => (u.title || "").trim() || (u.url || "").trim())
                                    .map(u => `
                                        <a
                                            href="${u.url}"
                                            target="_blank"
                                            rel="noopener noreferrer">
                                            ${u.title || u.url}
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
                    onclick="moveCostumeImageOrder('${project.id}', 'up')"
                    title="上へ">
                    <i class="fa-solid fa-arrow-up"></i>
                </button>

                <button
                    class="icon-btn"
                    onclick="moveCostumeImageOrder('${project.id}', 'down')"
                    title="下へ">
                    <i class="fa-solid fa-arrow-down"></i>
                </button>

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

async function editCostumeImage(projectId) {

    resetCostumeForm();

    editingProjectId = projectId;

    const submitBtn = document.querySelector(
        '#costume-entry button[type="submit"]'
    );

    if (submitBtn) {
        submitBtn.innerHTML =
            '<i class="fa-solid fa-floppy-disk"></i> 更新する';
    }

    const { data: project, error } = await db
        .from("costume_image_projects")
        .select("*")
        .eq("id", projectId)
        .single();

    if (project) {
        editingProjectId = project.id;
    }

    if (error) {
        console.error(error);
        alert("取得できませんでした");
        return;
    }

    const { data: items } = await db
        .from("costume_image_items")
        .select("*")
        .eq("project_id", projectId);

    console.log("編集対象 items =", items);
    console.log("件数 =", items?.length);

    // resetCostumeForm();

    document.querySelector('[data-costume-tab="entry"]').click();

    await new Promise(resolve => requestAnimationFrame(resolve));
    await new Promise(resolve => requestAnimationFrame(resolve));

    await loadCostumeMemberSelect();

    const memberSelect = document.getElementById("costume-member-select");
    memberSelect.value = project.member_id;
    memberSelect.dispatchEvent(new Event("change"));

    await new Promise(resolve => setTimeout(resolve, 50));

    document.getElementById("costume-scene").value = project.costume_name || "";
    document.getElementById("costume-cast-comment").value = project.cast_comment || "";
    document.getElementById("costume-staff-comment").value = project.staff_comment || "";

    const fileInput = document.getElementById("costume-item-images");
    if (fileInput) {
        fileInput.value = "";
    }

    window.selectedCostumeImages = [];

    document.querySelectorAll(".costume-item-block").forEach((block, index) => {
        if (index > 0) {
            block.remove();
        }
    });

    const container = document.getElementById("costume-items-container");
    const original = container.querySelector(".costume-item-block").cloneNode(true);

    original.removeAttribute("data-project-item-id");
    original.removeAttribute("data-existing-images");
    original.selectedImages = [];

    container.innerHTML = "";

    if (items.length === 0) {
        container.appendChild(original);
        original.dataset.existingImages = "[]";
    }

    items.forEach(item => {
        const block = original.cloneNode(true);

        block.dataset.existingImages = JSON.stringify(item.images || []);
        block.dataset.originalImages = JSON.stringify(item.images || []);
        block.selectedImages = [];

        block.querySelector(".costume-item-category").value = item.large_category || "";
        block.querySelector(".costume-item-url-title").value = item.urls?.[0]?.title || "";
        block.querySelector(".costume-item-url").value = item.urls?.[0]?.url || "";
        block.selectedImages = [];
        block.dataset.projectItemId = item.id;
        block.dataset.existingImages = JSON.stringify(item.images || []);
        block.dataset.originalImages = JSON.stringify(item.images || []);

        const input = block.querySelector('input[type="file"]');
        if (input) {
            input.value = "";
        }

        const preview = block.querySelector(".costume-image-preview");

        if (preview && item.images) {
            preview.innerHTML = "";

            item.images.forEach((image, index) => {
                preview.insertAdjacentHTML(
                    "beforeend",
                    `
                    <div class="costume-preview-item" style="position:relative;display:inline-block;margin:4px;">
                        <img
                            src="${image}"
                            onclick="openCostumeImageModal('${image}')"
                            style="max-width:150px;max-height:150px;object-fit:cover;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,.15);cursor:pointer;">

                        <button
                            type="button"
                            class="costume-image-delete-btn"
                            data-index="${index}"
                            style="position:absolute;top:4px;right:4px;width:24px;height:24px;border:none;border-radius:50%;background:#e53935;color:#fff;cursor:pointer;">
                            ×
                        </button>
                    </div>
                    `
                );
            });

            preview.querySelectorAll(".costume-image-delete-btn").forEach(btn => {
                btn.onclick = () => {
                    const index = Number(btn.dataset.index);

                    item.images.splice(index, 1);
                    block.dataset.existingImages = JSON.stringify(item.images);

                    btn.parentElement.remove();
                };
            });
        }

        container.appendChild(block);
    });

    const saveBtn = document.querySelector('#costume-entry button[type="submit"]');

    if (saveBtn) {
        saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 更新する';
    }

    updateCostumeItemMoveButtons();

    await renderCostumeImageList();

    console.log(project);
    console.log(items);
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
                <td>
                    <div class="cast-order-buttons">
                        <button
                            class="icon-btn"
                            title="上へ"
                            onclick="moveCostumeCastOrder('${row.id}', 'up')">
                            ↑
                        </button>

                        <button
                            class="icon-btn"
                            title="下へ"
                            onclick="moveCostumeCastOrder('${row.id}', 'down')">
                            ↓
                        </button>
                    </div>
                </td>
                <td>${row.sort_order ?? ""}</td>
                <td>${row.role_id ?? ""}</td>
                <td>${row.role_name ?? ""}</td>
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

    const scrollY = window.scrollY;

    await renderCostumeCastList();

    window.scrollTo(0, scrollY);
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
window.editCostumeImage = editCostumeImage;
window.updateCostumeImage = updateCostumeImage;
window.deleteCostumeImage = deleteCostumeImage;

async function updateCostumeImage() {

    const select = document.getElementById("costume-member-select");
    const option = select.options[select.selectedIndex];

    const projectData = {
        member_id: select.value,
        role_id: option.dataset.roleId,
        cast_name: option.dataset.roleName,
        member_name: option.dataset.memberName,
        group_name: option.dataset.groupName,
        costume_name: document.getElementById("costume-scene").value,
        cast_comment: document.getElementById("costume-cast-comment").value,
        staff_comment: document.getElementById("costume-staff-comment").value
    };

    const { error } = await db
        .from("costume_image_projects")
        .update(projectData)
        .eq("id", editingProjectId);

    if (error) {
        console.error(error);
        alert("更新に失敗しました");
        return;
    }

    const { data: oldItems } = await db
        .from("costume_image_items")
        .select("id")
        .eq("project_id", editingProjectId);

    console.log("取得したoldItems", oldItems);

    const keepIds = [];

    const itemBlocks = document.querySelectorAll(".costume-item-block");

    console.log("itemBlocks数", itemBlocks.length);

    for (const block of itemBlocks) {

        let itemImages = JSON.parse(
            block.dataset.existingImages || "[]"
        );

        console.log("保持画像", itemImages);
        const input = block.querySelector('input[type="file"]');

        console.log("選択ファイル数", input?.files?.length);

        if (block.selectedImages && block.selectedImages.length > 0) {

            for (const file of block.selectedImages) {

                const ext =
                    file.name.substring(
                        file.name.lastIndexOf(".") + 1
                    );

                const filePath =
                    `${crypto.randomUUID()}.${ext}`;
                const { error: uploadError } = await db.storage
                    .from("costume-images")
                    .upload(filePath, file);

                if (uploadError) {
                    console.error(uploadError);
                    alert(
                        "画像アップロードに失敗しました。\n\n" +
                        JSON.stringify(uploadError, null, 2)
                    );
                    return;
                }

                const { data: urlData } = db.storage
                    .from("costume-images")
                    .getPublicUrl(filePath);

                itemImages.push(urlData.publicUrl);
            }
        }

        block.dataset.existingImages = JSON.stringify(itemImages);

        const itemData = {
            project_id: editingProjectId,
            large_category: block.querySelector(".costume-item-category").value,
            images: itemImages,
            urls: [
                {
                    title: block.querySelector(".costume-item-url-title").value,
                    url: block.querySelector(".costume-item-url").value
                }
            ]
        };
        console.log("更新itemData", itemData);

        const itemId = block.dataset.projectItemId || block.getAttribute("data-project-item-id");

        console.log("更新対象itemId", itemId);

        if (!itemId) {
            console.log("新規個別項目です");
        }
        console.log("block data", block.dataset);
        console.log("existingImages", block.dataset.existingImages);
        console.log("itemId type", typeof itemId);
        if (itemId) {

            keepIds.push(itemId);

            console.log("keepIds追加", keepIds);

            const { error: updateError } = await db
                .from("costume_image_items")
                .update(itemData)
                .eq("id", itemId);
            if (updateError) {
                console.error(updateError);
                alert("個別項目の更新に失敗しました");
                return;
            }

        } else {

            console.log("新規追加itemData", itemData);

            const { data: inserted, error: insertError } = await db
                .from("costume_image_items")
                .insert(itemData)
                .select("id")
                .single();

            if (insertError) {
                console.error(insertError);
                alert("個別項目の追加に失敗しました");
                return;
            }

            keepIds.push(inserted.id);

        }

    }

    console.log("oldItems", oldItems);
    console.log("keepIds", keepIds);

    const deleteIds = (oldItems || [])
        .map(x => x.id)
        .filter(id => !keepIds.includes(id));

    console.log("削除対象deleteIds", deleteIds);

    if (deleteIds.length > 0) {

        console.log("削除実行対象", deleteIds);

        const { error: deleteError } = await db
            .from("costume_image_items")
            .delete()
            .in("id", deleteIds);

        if (deleteError) {
            console.error(deleteError);
            alert("個別項目の削除に失敗しました");
            return;
        }

    }

    console.log("最終keepIds", keepIds);
    console.log("最終oldItems", oldItems);

    editingProjectId = null;

    const saveBtn = document.querySelector('#costume-entry button[type="submit"]');
    if (saveBtn) {
        saveBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> 登録する';
    }

    resetCostumeForm();

    console.log("更新完了前 editingProjectId", editingProjectId);

    await loadCostumeMemberSelect();
    await renderCostumeImageList();

    document.querySelector('[data-costume-tab="list"]').click();

    alert("更新しました");
}

async function deleteCostumeImage(projectId) {

    console.log("削除対象projectId =", projectId);

    const { data: checkProject } = await db
        .from("costume_image_projects")
        .select("id")
        .eq("id", projectId);

    console.log("DB確認", checkProject);

    if (!confirm("この衣裳イメージを削除しますか？")) {
        return;
    }

    const { data: items, error: itemError } = await db
        .from("costume_image_items")
        .select("*")
        .eq("project_id", projectId);

    if (itemError) {
        console.error(itemError);
        alert("衣裳データの取得に失敗しました");
        return;
    }

    if (items) {

        for (const item of items) {

            if (!item.images) continue;

            for (const image of item.images) {

                const path = image.split("/costume-images/")[1];

                if (!path) continue;

                await db.storage
                    .from("costume-images")
                    .remove([path]);

            }

        }

    }

    const { data: deletedItems, error: deleteItemError } = await db
        .from("costume_image_items")
        .delete()
        .eq("project_id", projectId)
        .select();

    console.log("削除した個別項目", deletedItems);

    if (deleteItemError) {
        console.error("deleteItemError", deleteItemError);
        alert(JSON.stringify(deleteItemError));
        return;
    }

    const { data: deletedProject, error: deleteProjectError } = await db
        .from("costume_image_projects")
        .delete()
        .eq("id", projectId)
        .select();

    console.log("削除した共通項目", deletedProject);

    if (deleteProjectError) {
        console.error("deleteProjectError", deleteProjectError);
        alert(JSON.stringify(deleteProjectError));
        return;
    }

    if (editingProjectId === projectId) {
        editingProjectId = null;
    }

    resetCostumeForm();

    const saveBtn = document.querySelector(
        '#costume-entry button[type="submit"]'
    );

    if (saveBtn) {
        saveBtn.innerHTML =
            '<i class="fa-solid fa-cloud-arrow-up"></i> 登録する';
    }

    await renderCostumeImageList();

    document
        .querySelector('[data-costume-tab="list"]')
        .click();

    alert("削除しました");

}

function cancelCostumeEdit() {

    editingProjectId = null;

    const saveBtn = document.querySelector(
        '#costume-entry button[type="submit"]'
    );

    if (saveBtn) {
        saveBtn.innerHTML =
            '<i class="fa-solid fa-cloud-arrow-up"></i> 登録する';
    }

    resetCostumeForm();

    document
        .querySelector('[data-costume-tab="list"]')
        .click();

}

function moveCostumeImageOrder(projectId, direction) {
    const container = document.getElementById("costume-image-list-container");
    const cards = Array.from(container.querySelectorAll(".card"));
    const index = cards.findIndex(card => card.dataset.projectId === projectId);

    if (index === -1) {
        return;
    }

    if (direction === "up" && index > 0) {
        container.insertBefore(cards[index], cards[index - 1]);
    }

    if (direction === "down" && index < cards.length - 1) {
        container.insertBefore(cards[index + 1], cards[index]);
    }

    saveCostumeImageOrder();
}

function saveCostumeImageOrder() {
    const container = document.getElementById("costume-image-list-container");
    const order = Array.from(container.querySelectorAll(".card"))
        .map(card => card.dataset.projectId);

    localStorage.setItem(
        "costumeImageOrder",
        JSON.stringify(order)
    );
}

document
    .getElementById("costume-sort-select")
    ?.addEventListener("change", function() {

        localStorage.setItem(
            "costumeSortMode",
            this.value
        );

        renderCostumeImageList();
    });

async function moveCostumeCastOrder(id, direction) {

    const currentScroll = document.documentElement.scrollTop;

    const { data } = await db
        .from("costume_casts")
        .select("*")
        .order("sort_order");

    const index = data.findIndex(row => row.id === id);

    if (direction === "up" && index > 0) {
        const current = data[index];
        const previous = data[index - 1];

        await db
            .from("costume_casts")
            .update({
                sort_order: previous.sort_order
            })
            .eq("id", current.id);

        await db
            .from("costume_casts")
            .update({
                sort_order: current.sort_order
            })
            .eq("id", previous.id);
    }

    if (direction === "down" && index < data.length - 1) {
        const current = data[index];
        const next = data[index + 1];

        await db
            .from("costume_casts")
            .update({
                sort_order: next.sort_order
            })
            .eq("id", current.id);

        await db
            .from("costume_casts")
            .update({
                sort_order: current.sort_order
            })
            .eq("id", next.id);
    }

    await renderCostumeCastList();

    setTimeout(() => {
        document.documentElement.scrollTop = currentScroll;
    }, 0);
}

window.moveCostumeCastOrder = moveCostumeCastOrder;

function moveCostumeItem(button, direction) {
    const block = button.closest(".costume-item-block");

    if (!block) return;

    if (direction === "up") {
        const previous = block.previousElementSibling;

        if (previous) {
            block.parentNode.insertBefore(block, previous);
        }
    } else {
        const next = block.nextElementSibling;

        if (next) {
            block.parentNode.insertBefore(next, block);
        }
    }
}

window.moveCostumeItem = moveCostumeItem;

function updateCostumeItemMoveButtons() {

    return;

    const blocks = document.querySelectorAll(".costume-item-block");
    const area = document.getElementById("costume-item-move-buttons");

    if (!area) return;

    const active = document.activeElement;
    const current = active
        ? active.closest(".costume-item-block")
        : null;

    const index = current
        ? Array.from(blocks).indexOf(current)
        : 0;

    area.innerHTML = `
        <button
            type="button"
            class="icon-btn"
            onclick="moveCostumeItemByIndex(${index}, 'up')"
            ${index === 0 ? "disabled" : ""}>
            ↑
        </button>

        <button
            type="button"
            class="icon-btn"
            onclick="moveCostumeItemByIndex(${index}, 'down')"
            ${index === blocks.length - 1 ? "disabled" : ""}>
            ↓
        </button>
    `;

}

window.moveCostumeItem = moveCostumeItem;

function deleteCostumeItem(button) {
    const block = button.closest(".costume-item-block");

    if (!block) return;

    const container = document.getElementById("costume-items-container");

    if (container.querySelectorAll(".costume-item-block").length === 1) {
        alert("個別項目は1つ以上必要です。");
        return;
    }

    if (!confirm("この個別項目を削除しますか？")) {
        return;
    }

    block.remove();
}

window.deleteCostumeItem = deleteCostumeItem;

document.addEventListener("change", (e) => {
    if (e.target.classList.contains("scene-filter")) {
        renderCostumeImageList();
    }
});

window.handleCostumeImageSelect = handleCostumeImageSelect;
window.submitCostumeImage = submitCostumeImage;
window.resetCostumeForm = resetCostumeForm;
window.addCostumeItem = addCostumeItem;
window.renderCostumeImageList = renderCostumeImageList;

// -----------------------------
// 衣裳イメージ サブタブ
// -----------------------------