const LINK_GROUPS = {
    "フェルマータ": [
        "共有フォルダ",
        "稽古動画"
    ],
    "ミュージカル動画": [   
        "YouTubeミュージカル_フル",
        "YouTubeミュージカル_部分的なシーン",

    ],
    "一般": [   
        "映画・ミュージカル脚本",
        "YouTube舞台メイク",
        "ハンドメイドの参考",
        "衣裳・ウィッグ・メイク",
        "発声・演技"
    ]
};

window.updateLinkGroupOptions = () => {

    const category = document.getElementById('link-category').value;
    const groupSelect = document.getElementById('link-group');

    groupSelect.innerHTML = '';

    (LINK_GROUPS[category] || []).forEach(group => {

        const option = document.createElement('option');
        option.value = group;
        option.textContent = group;

        groupSelect.appendChild(option);

    });

};

window.renderLinks = () => {

    const container = document.getElementById('links-container');
    if (!container) return;

    const data = state.links;

    const categories = ['フェルマータ', 'ミュージカル動画','一般']
        .filter(category => data.some(x => x.category === category));

    container.innerHTML = '';

    categories.forEach(category => {

        const card = document.createElement('div');
        card.className = 'card';

        const categoryTitle = document.createElement('h2');
        categoryTitle.textContent = category;
        card.appendChild(categoryTitle);

        const groups = [...new Set(
            data
                .filter(x => x.category === category)
                .map(x => (x.group_name ?? x.group) || '')
        )];

        groups.forEach(group => {

            if (group) {

                const groupArea = document.createElement('div');
                groupArea.className = 'link-group-header';

                const groupTitle = document.createElement('h3');
                groupTitle.textContent = group;
                groupTitle.className = 'link-group-title';

                groupArea.appendChild(groupTitle);

                card.appendChild(groupArea);
            }

            const list = document.createElement('div');
            list.className = 'link-list';
            list.style.display = 'flex';
            list.style.flexDirection = 'column';
            list.style.gap = '2px';

            data
                .filter(x =>
                    x.category === category &&
                    ((x.group_name ?? x.group) || '') === group
                )
                .sort((a, b) =>
                    (a.title || '').localeCompare(
                        b.title || '',
                        'ja',
                        { sensitivity: 'base' }
                    )
                )
                .forEach(link => {

                    const item = document.createElement('a');
                    item.className = 'link-item';

                    item.innerHTML = `
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">

                            <div style="flex:1;">
                                <div class="link-title">
                                    ${link.title}
                                </div>
                                ${link.description ? `<div class="link-description">${link.description}</div>` : ''}
                            </div>

                            <div style="display:flex; gap:6px;">

                                <button class="icon-btn-sm favorite-link-btn ${link.favorite ? 'active' : ''}" title="お気に入り">
                                    <i class="fa-solid fa-star"></i>
                                </button>

                                <button class="icon-btn-sm edit-link-btn" title="編集">
                                    <i class="fa-solid fa-pen"></i>
                                </button>

                                <button class="icon-btn-sm delete-link-btn" title="削除">
                                    <i class="fa-solid fa-trash"></i>
                                </button>

                            </div>

                        </div>
                    `;

                    if (link.url) {
                        item.href = link.url;
                        item.target = '_blank';
                        item.rel = 'noopener noreferrer';
                    } else {
                        item.href = '#';
                        item.onclick = (e) => e.preventDefault();
                    }

                    item.querySelector('.edit-link-btn').onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        showLinkForm(link);
                    };

                    item.querySelector('.favorite-link-btn').onclick = async (e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        const { error } = await db
                            .from('links')
                            .update({
                                favorite: !link.favorite
                            })
                            .eq('id', link.id);

                        if (error) {
                            alert(error.message);
                            return;
                        }

                        // ローカルデータだけ更新
                        link.favorite = !link.favorite;

                        renderLinks();
                    };

                    item.querySelector('.delete-link-btn').onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteLink(link.id);
                    };

                    list.appendChild(item);

                });

            card.appendChild(list);

        });

        container.appendChild(card);

    });

};

window.showLinkForm = (link = null) => {

    const area = document.getElementById('link-form-area');
    if (!area) return;

    const cancelBtn = document.getElementById('cancel-link-btn');

    if (cancelBtn) {
        cancelBtn.onclick = () => {
            area.classList.add('hidden');
        };
    }

    // フォームを表示
    area.classList.remove('hidden');

    // キャンセルボタンは編集時のみ表示
    if (cancelBtn) {
        cancelBtn.classList.remove('hidden');
    }

    if (!link) {

        document.getElementById('link-category').value = 'フェルマータ';
        updateLinkGroupOptions();
        document.getElementById('link-group').value = '共有フォルダ';
        document.getElementById('link-title').value = '';
        document.getElementById('link-description').value = '';
        document.getElementById('link-url').value = '';
        document.getElementById('edit-link-id').value = '';

        return;
    }

    document.getElementById('edit-link-id').value = link.id || '';
    document.getElementById('link-category').value = link.category || '';
    updateLinkGroupOptions();
    document.getElementById('link-group').value = link.group_name ?? link.group ?? '';
    document.getElementById('link-title').value = link.title || '';
    document.getElementById('link-description').value = link.description || '';
    document.getElementById('link-url').value = link.url || '';

};

window.saveLink = async () => {

    const editId = document.getElementById('edit-link-id').value;

    const link = {
        category: document.getElementById('link-category').value.trim(),
        group: document.getElementById('link-group').value.trim(),
        title: document.getElementById('link-title').value.trim(),
        description: document.getElementById('link-description').value.trim(),
        url: document.getElementById('link-url').value.trim()
    };

    if (!link.category) {
        alert('カテゴリーを入力してください。');
        return;
    }

    if (!link.title) {
        alert('タイトルを入力してください。');
        return;
    }

    let error;

    if (editId) {

        ({ error } = await db
            .from('links')
            .update({
                category: link.category,
                group_name: link.group,
                title: link.title,
                description: link.description,
                url: link.url
            })
            .eq('id', editId));

    } else {

        const nextOrder =
            Math.max(
                0,
                ...state.links.map(x => x.display_order ?? x.displayOrder ?? 0)
            ) + 1;

        ({ error } = await db
            .from('links')
            .insert({
                category: link.category,
                group_name: link.group,
                title: link.title,
                description: link.description,
                url: link.url,
                display_order: nextOrder
            }));

    }

    if (error) {
        console.error(error);
        alert(JSON.stringify(error, null, 2));
        return;
    }

    await loadCloud();

    renderLinks();

    document.getElementById('link-form-area').classList.add('hidden');

};

window.deleteLink = async (id) => {

    if (!confirm('このリンクを削除しますか？')) return;

    const { error } = await db
        .from('links')
        .delete()
        .eq('id', id);

    if (error) {
        console.error(error);
        alert(error.message);
        return;
    }

    await loadCloud();

    renderLinks();

};

window.moveLink = async (id, direction) => {

    const list = [...state.links]
        .sort((a, b) =>
            (a.display_order ?? a.displayOrder) -
            (b.display_order ?? b.displayOrder)
        );

    const index = list.findIndex(x => x.id === id);

    if (index < 0) return;

    const targetIndex = index + direction;

    if (targetIndex < 0 || targetIndex >= list.length) return;

    const current = list[index];
    const target = list[targetIndex];

    const currentOrder = current.display_order ?? current.displayOrder;
    const targetOrder = target.display_order ?? target.displayOrder;

    let { error } = await db
        .from('links')
        .update({ display_order: targetOrder })
        .eq('id', current.id);

    if (error) {
        alert(error.message);
        return;
    }

    ({ error } = await db
        .from('links')
        .update({ display_order: currentOrder })
        .eq('id', target.id));

    if (error) {
        alert(error.message);
        return;
    }

    await loadCloud();

    renderLinks();

};

document.getElementById('link-category').addEventListener('change', updateLinkGroupOptions);