// 配役マスターの削除
window.deleteCastMasterRecord = async (id, btn) => {
    if (id.startsWith('new_')) {
        btn.closest('.cast-master-row').remove();
        return;
    }

    if (confirm('この配役設定を削除しますか？\n（保存するまでデータベースからは削除されません）')) {
        btn.closest('.cast-master-row').remove();
        isDirty = true;
    }
};


// 配役マスターの保存
window.saveCastMasterFromDOM = async () => {
    if (!db) return;

    const list = $('admin-cast-list');
    if (!list) return;

    const rows = list.querySelectorAll('.cast-master-row');
    const dataList = [];
    let hasError = false;

    // 現在DOM上に並んでいる順番に基づいて、0から順に sort_order を付与する
    rows.forEach((row, index) => {
        const id = row.dataset.id;
        const name = row.querySelector('.cast-name-select').value;
        const group = row.querySelector('.cast-group-select').value;
        const role = row.querySelector('.cast-role-input').value.trim();
        const sort_order = index;

        if (!name || !role) {
            hasError = true;
            row.style.borderColor = 'red';
        } else {
            row.style.borderColor = 'var(--border-dusty)';

            if (group === '全組') {

                ['A', 'B', 'C'].forEach(g => {
                    dataList.push({
                        id: crypto.randomUUID(),
                        name,
                        group: g,
                        role,
                        sort_order
                    });
                });

            } else {

                dataList.push({
                    id: id.startsWith('new_') ? crypto.randomUUID() : id,
                    name,
                    group,
                    role,
                    sort_order
                });

            }
        }
});