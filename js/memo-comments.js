// ========================================
// 稽古メモ コメント機能
// ========================================
let commentReadStatus =
    JSON.parse(localStorage.getItem('commentReadStatus') || '{}');

let commentUpdatedStatus =
    JSON.parse(localStorage.getItem('commentUpdatedStatus') || '{}');

function renderMemoComments(memoId) {

    const comments = state.memoComments.filter(c =>
        String(c.memo_id) === String(memoId)
    );

    return `
        <button
            <button
                class="memo-comment-toggle-btn ${state.ui.openedMemoComments.includes(String(memoId)) ? 'active' : ''}"
                onclick="toggleMemoComments('${memoId}')">

                <i
                    class="fa-regular fa-comment"
                    style="color:var(--pink-accent); margin-right:6px;">
                </i>

                ${comments.length === 0 ? 'コメントを書く' : `コメント（${comments.length}）`}

            </button>

        <div
            id="memo-comments-${memoId}"
            class="${state.ui.openedMemoComments.includes(String(memoId)) ? '' : 'hidden'}">

            <div class="memo-comment-area">

                <textarea
                    id="memo-comment-input-${memoId}"
                    class="cute-input"
                    placeholder="コメントを書く..."
                    rows="3"></textarea>

                <button
                    class="puffy-btn pink"
                    onclick="saveMemoComment('${memoId}')">

                    <i class="fa-solid fa-paper-plane"></i>
                    投稿

                </button>

            </div>

            ${comments.map(c => `
                <div class="memo-comment-item">

                    <div class="memo-comment-header">

                        <strong>${c.author_name}</strong>

                        <div class="memo-comment-actions">

                            <button
                                class="memo-action-btn"
                                onclick="editMemoComment('${c.id}')">
                                <i class="fa-solid fa-pen"></i>
                            </button>

                            <button
                                class="memo-action-btn delete"
                                onclick="deleteMemoComment('${c.id}')">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>

                        </div>

                    </div>

                    ${
                        state.ui.editingCommentId === c.id
                        ? `
                            <textarea
                                id="edit-comment-${c.id}"
                                class="cute-input"
                                rows="3">${c.content}</textarea>

                            <div class="memo-comment-edit-actions">

                                <button
                                    class="puffy-btn pink"
                                    onclick="updateMemoComment('${c.id}')">
                                    保存
                                </button>

                                <button
                                    class="puffy-btn gray"
                                    onclick="cancelEditMemoComment()">
                                    キャンセル
                                </button>

                            </div>
                        `
                        : `
                            <div class="memo-comment-content">${c.content.replace(/\n/g, '<br>')}</div>

                            ${
                                c.content.length > 100 || (c.content.match(/\n/g) || []).length >= 3
                                ? `
                                    <button
                                        class="memo-toggle-btn"
                                        onclick="toggleMemoText(this)">
                                        <i class="fa-solid fa-chevron-down"></i>
                                        続きを読む
                                    </button>
                                `
                                : ''
                            }

                            <div class="memo-reactions" style="
                                display:flex;
                                justify-content:space-between;
                                align-items:center;
                                margin-top:6px;
                            ">

                                <button
                                    class="reaction-btn"
                                    onclick="toggleCommentReaction('${c.id}','heart')"
                                    style="
                                        border:none;
                                        background:transparent;
                                        padding:0;
                                        cursor:pointer;
                                    "
                                >

                                    ${
                                        state.commentReactions.some(x =>
                                            String(x.comment_id) === String(c.id) &&
                                            String(x.member_id) === String(state.currentMember) &&
                                            x.reaction === 'heart'
                                        )
                                        ? '<i class="fa-solid fa-heart" style="color:var(--pink-accent);"></i>'
                                        : '<i class="fa-regular fa-heart" style="color:#cfcfcf;"></i>'
                                    }

                                    <span style="margin-left:2px;font-size:0.7rem;">

                                        ${
                                            state.commentReactions.filter(x =>
                                                String(x.comment_id) === String(c.id) &&
                                                x.reaction === 'heart'
                                            ).length
                                        }

                                    </span>

                                </button>
                                </div>
                        `
                    }

                </div>
            `).join('')}

        </div>
    `;
}

async function refreshMemoComments() {

    const { data, error } = await db
        .from('memo_comments')
        .select('*')
        .order('created_at', { ascending: true });

    if (error) {
        console.error(error);
        return;
    }

    state.memoComments = data;

}

async function refreshCommentReactions() {

    const { data, error } = await db
        .from('memo_comment_reactions')
        .select('*');

    if (error) {
        console.error(error);
        return;
    }

    state.commentReactions = data;

}

function reopenMemoComments() {

    document.querySelectorAll('[id^="memo-comments-"]').forEach(area => {

        if (!area.classList.contains('hidden')) {

            area.classList.remove('hidden');

            area.scrollTop = area.scrollHeight;

        }

    });

}

window.toggleMemoComments = (memoId) => {

    const area = document.getElementById(`memo-comments-${memoId}`);

    if (!area) return;

    const isHidden = area.classList.toggle('hidden');

    if (!isHidden) {

        if (!state.ui.openedMemoComments.includes(String(memoId))) {
            state.ui.openedMemoComments.push(String(memoId));
        }

        markMemoAsRead(memoId);

    } else {

        state.ui.openedMemoComments =
            state.ui.openedMemoComments.filter(id => id !== String(memoId));

    }

};

window.saveMemoComment = async (memoId) => {

    const input = document.getElementById(`memo-comment-input-${memoId}`);

    const content = input.value.trim();

    if (!content) {
        alert('コメントを入力してください。');
        return;
    }

    const author = state.members.find(
        m => String(m.id) === String(state.currentMember)
    )?.name || '不明';

    const { error } = await db
        .from('memo_comments')
        .insert([{
            memo_id: memoId,
            author_id: state.currentMember,
            author_name: author,
            content: content,
            updated_at: new Date().toISOString()
        }]);

    if (error) {
        alert(error.message);
        return;
    }

    await refreshMemoComments();

    memoUpdatedStatus[memoId] = true;

    localStorage.setItem(
        'memoUpdatedStatus',
        JSON.stringify(memoUpdatedStatus)
    );

    input.value = '';

    renderTab(
        document.querySelector('.nav-tab.active')?.dataset.tab || 'attendance-input'
    );

    reopenMemoComments();

    requestAnimationFrame(() => {

        const area = document.getElementById(`memo-comments-${memoId}`);

        if (area) {
            area.scrollTop = area.scrollHeight;
        }

        const textarea = document.getElementById(`memo-comment-input-${memoId}`);

        if (textarea) {
            textarea.focus();
        }

    });

};

window.editMemoComment = (commentId) => {

    state.ui.editingCommentId = commentId;

    renderTab(
        document.querySelector('.nav-tab.active')?.dataset.tab || 'attendance-input'
    );

    requestAnimationFrame(() => {

        const textarea = document.getElementById(`edit-comment-${commentId}`);

        if (textarea) {
            textarea.focus();
            textarea.selectionStart = textarea.value.length;
            textarea.selectionEnd = textarea.value.length;
        }

    });

};

window.cancelEditMemoComment = () => {

    state.ui.editingCommentId = null;

    renderTab(
        document.querySelector('.nav-tab.active')?.dataset.tab || 'attendance-input'
    );

    reopenMemoComments();

};

window.updateMemoComment = async (commentId) => {

    const textarea = document.getElementById(`edit-comment-${commentId}`);

    const content = textarea.value.trim();

    if (!content) {
        alert('コメントを入力してください。');
        return;
    }

    const { error } = await db
        .from('memo_comments')
        .update({
            content: content,
            updated_at: new Date().toISOString()
        })
        .eq('id', commentId);

    if (error) {
        alert(error.message);
        return;
    }

    state.ui.editingCommentId = null;

    await refreshMemoComments();

    renderTab(
        document.querySelector('.nav-tab.active')?.dataset.tab || 'attendance-input'
    );

    reopenMemoComments();
};

window.deleteMemoComment = async (commentId) => {

    const ok = confirm('このコメントを削除しますか？');

    if (!ok) return;

    const { error } = await db
        .from('memo_comments')
        .delete()
        .eq('id', commentId);

    if (error) {
        alert(error.message);
        return;
    }

    await refreshMemoComments();

    renderTab(
        document.querySelector('.nav-tab.active')?.dataset.tab || 'attendance-input'
    );

    reopenMemoComments();

};

window.toggleCommentReaction = async (commentId, reaction) => {

    const existing = state.commentReactions.find(x =>
        String(x.comment_id) === String(commentId) &&
        String(x.member_id) === String(state.currentMember) &&
        x.reaction === reaction
    );

    if (existing) {

        const { error } = await db
            .from('memo_comment_reactions')
            .delete()
            .eq('id', existing.id);

        if (error) {
            alert(error.message);
            return;
        }

    } else {

        const { error } = await db
            .from('memo_comment_reactions')
            .insert([{
                comment_id: commentId,
                member_id: state.currentMember,
                reaction: reaction
            }]);

        if (error) {
            alert(error.message);
            return;
        }

    }

    await refreshCommentReactions();

    renderTab(
        document.querySelector('.nav-tab.active')?.dataset.tab || 'attendance-input'
    );

};

