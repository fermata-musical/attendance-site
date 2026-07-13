
// --- クラウド同期ロジック (Supabase版) ---

async function loadCloud() {
    if (!db) return;
    try {
        $('sync-indicator').classList.remove('hidden');
        
        // 各種データの並列取得
        const [
            mRes,
            pRes,
            aRes,
            vRes,
            locRes,
            menuRes,
            memoRes,
            reactionRes,
            commentRes,
            commentReactionRes,
            catRes,
            castRes,
            profileRes
        ] = await Promise.all([
            db.from('members').select('*'),
            db.from('practices').select('*').order('sort_order', { ascending: true }),
            db.from('attendance').select('*'),
            db.from('visibility_settings').select('*'),
            db.from('places').select('*').order('sort_order', { ascending: true }),
            db.from('menus').select('*').order('sort_order', { ascending: true }),
            db.from('rehearsal_memos').select('*').order('updated_at', { ascending: false }),
            db.from('memo_reactions').select('*'),
            db.from('memo_comments').select('*').order('created_at', { ascending: true }),
            db.from('memo_comment_reactions').select('*'),
            db.from('memo_categories').select('*').order('sort_order', { ascending: true }),
            db.from('cast_master').select('*').order('sort_order', { ascending: true }),
            db.from('self_profiles').select('*')

        ]);

        if (mRes.error) throw mRes.error;
        if (pRes.error) throw pRes.error;
        if (aRes.error) throw aRes.error;

        if (castRes && castRes.data) {
            state.castMaster = castRes.data;
        } else if (castRes && castRes.error) {
            console.warn("cast_master取得エラー:", castRes.error);
        }

        if (profileRes && profileRes.data) {
            state.selfProfiles = profileRes.data;
        } else if (profileRes && profileRes.error) {
            console.warn("self_profiles取得エラー:", profileRes.error);
        }

        // メンバー情報
        state.members = mRes.data;

        // 一覧を描画
        renderSelfProfiles();

        const member = state.members.find(
            m => String(m.id) === String(state.currentMember)
        );

        const memberNameInput =
            document.getElementById('profile-member-name');

        if (memberNameInput) {
            memberNameInput.value = member ? member.name : '';
        }

        // 稽古日程
        const groups = {};
        pRes.data.forEach(p => {
            const key = `${p.date}_${p.place}`;

            if (!groups[key]) {
                groups[key] = {
                    date: p.date,
                    location: p.place,
                    notice: p.notice || '',
                    slots: []
                };
            }

            groups[key].slots.push({
                id: p.id,
                start: p.start_time,
                end: p.end_time,
                menu: p.menu
            });
        });
        state.rehearsals = Object.values(groups).map(group => {
            const validSlots = group.slots.filter(s => s.start || s.end || s.menu);
            const emptySlots = group.slots.filter(s => !(s.start || s.end || s.menu));

            // 過去のバグで蓄積したゴーストデータを物理削除する処理
            if (validSlots.length > 0 && emptySlots.length > 0) {
                // 有効データがあるのに空データもある場合、空データは完全なゴミ
                emptySlots.forEach(s => {
                    db.from('practices').delete().eq('id', s.id).then();
                });
                group.slots = validSlots;
            } else if (validSlots.length === 0 && emptySlots.length > 1) {
                // 有効データがなく、空データが複数ある場合、1つ残して他はゴミ
                const keep = emptySlots[0];
                const trash = emptySlots.slice(1);
                trash.forEach(s => {
                    db.from('practices').delete().eq('id', s.id).then();
                });
                group.slots = [keep];
            }
            return group;
        });

        // 出欠情報
        state.attendance = {};
        aRes.data.forEach(a => {
            if (!state.attendance[a.member_id]) state.attendance[a.member_id] = {};
            state.attendance[a.member_id][a.practice_id] = { id: a.id, status: a.status, note: a.note };
        });

        // 閲覧制限設定
        if (!vRes.error && vRes.data) {
            const vis = {};
            vRes.data.forEach(v => {
                vis[v.tab_name] = v.is_locked ? 'protected' : 'public';
            });
            state.settings.visibility = vis;
        }

        // 場所リストの同期
        if (locRes.data && locRes.data.length > 0) {
            state.settings.locations = locRes.data.map(d => d.name);
        }

        // メニューリストの同期
        if (menuRes.data && menuRes.data.length > 0) {
            state.settings.menus = menuRes.data.map(d => d.name);
        }

        // 稽古メモ
        if (memoRes.data) {
            state.memos = memoRes.data;
        }

        if (reactionRes.data) {
            state.reactions = reactionRes.data;
        }

        if (commentRes.data) {
            state.memoComments = commentRes.data;
        }

        if (commentReactionRes.data) {
            state.commentReactions = commentReactionRes.data;
        }

        // メモ区分
        if (catRes.data) {
            state.settings.memoCategories = catRes.data;
        }

        if (state.auth.isLoggedIn) { 
            refreshAdminViewList();
            isLocked = false; 
            renderTab(document.querySelector('.nav-tab.active')?.dataset.tab || 'attendance-input'); 
            updateLockIcons(); // 鍵アイコンを更新
            setupSelectEventListeners();
            isLocked = true;
        }
    } catch (error) { 
        console.error("Supabase読み込みエラー:", error); 
    } finally { 
        $('sync-indicator').classList.add('hidden'); 
    }
}


function saveLocal() {
    const json = JSON.stringify(state);
    localStorage.setItem(CONFIG.STORAGE_KEY, json);
}
