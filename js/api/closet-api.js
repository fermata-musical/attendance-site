// js/api/closet-api.js

/**
 * 衣装管理に関するSupabaseとの通信処理（API）をまとめたファイルです。
 * グローバル変数 `window.closetApi` として公開します。
 */
window.closetApi = {
    // ----------------------------------------------------
    // マスタデータの取得
    // ----------------------------------------------------
    fetchMasterData: async function() {
        if (!window.db) throw new Error("Supabase client (db) is not initialized.");

        const [
            largeRes, middleRes, smallRes, storageRes,
            colorsRes, acqRes, moodsRes, statusRes
        ] = await Promise.all([
            db.from('category_large').select('*').order('sort_order', { ascending: true }),
            db.from('category_middle').select('*').order('sort_order', { ascending: true }),
            db.from('category_small').select('*').order('sort_order', { ascending: true }),
            db.from('storage_boxes').select('*').order('sort_order', { ascending: true }),
            db.from('colors').select('*').order('id', { ascending: true }),
            db.from('acquisition_methods').select('*').order('sort_order', { ascending: true }),
            db.from('moods').select('*').order('sort_order', { ascending: true }),
            db.from('item_statuses').select('*').order('sort_order', { ascending: true })
        ]);

        return {
            large: largeRes.data || [],
            middle: middleRes.data || [],
            small: smallRes.data || [],
            storage: storageRes.data || [],
            colors: colorsRes.data || [],
            acquisition: acqRes.data || [],
            moods: moodsRes.data || [],
            statuses: statusRes.data || []
        };
    },

    // ----------------------------------------------------
    // 衣装アイテム一覧の取得
    // ----------------------------------------------------
    fetchItems: async function() {
        if (!window.db) throw new Error("Supabase client (db) is not initialized.");

        const { data, error } = await db.from('items').select(`
            *,
            item_images ( storage_path, image_order ),
            item_colors ( color_id ),
            item_acquisition_methods ( acquisition_method_id ),
            item_moods ( mood_id ),
            next_production_items ( usable, comment ),
            created_by_member:members!items_created_by_fkey ( name ),
            updated_by_member:members!items_updated_by_fkey ( name )
        `).order('item_number');

        if (error) {
            throw error;
        }
        return data || [];
    },

    // ----------------------------------------------------
    // ログインユーザーのお気に入りアイテムID一覧の取得
    // ----------------------------------------------------
    fetchFavoriteItemIds: async function(memberId) {
        if (!window.db) throw new Error("Supabase client (db) is not initialized.");
        if (!memberId) return [];

        const { data, error } = await db
            .from('item_favorites')
            .select('item_id')
            .eq('member_id', memberId);
        
        if (error) throw error;
        return (data || []).map(f => f.item_id);
    },

    // ----------------------------------------------------
    // アイテムの基本操作（CRUD）
    // ----------------------------------------------------
    insertItem: async function(payload) {
        if (!window.db) throw new Error("Supabase is not initialized.");
        const { data, error } = await db.from('items').insert([payload]).select().single();
        if (error) throw error;
        return data;
    },

    updateItem: async function(id, payload) {
        if (!window.db) throw new Error("Supabase is not initialized.");
        const { data, error } = await db.from('items').update(payload).eq('id', id).select().single();
        if (error) throw error;
        return data;
    },

    deleteItem: async function(id) {
        if (!window.db) throw new Error("Supabase is not initialized.");
        const { error } = await db.from('items').delete().eq('id', id);
        if (error) throw error;
    },

    deleteItemsByParentNumber: async function(parentNumber) {
        if (!window.db) throw new Error("Supabase is not initialized.");
        const { error } = await db.from('items').delete().eq('parent_item_number', parentNumber);
        if (error) throw error;
    },

    fetchFirstSetItem: async function(parentNumber) {
        if (!window.db) throw new Error("Supabase is not initialized.");
        const { data, error } = await db.from('items').select('*').eq('parent_item_number', parentNumber).eq('set_child_no', 1).single();
        if (error) throw error;
        return data;
    },

    fetchSetItems: async function(parentNumber) {
        if (!window.db) throw new Error("Supabase is not initialized.");
        const { data, error } = await db.from('items').select('*').eq('parent_item_number', parentNumber).order('set_child_no');
        if (error) throw error;
        return data;
    },

    // ----------------------------------------------------
    // セット品のRPC操作
    // ----------------------------------------------------
    rpcRegisterSetItems: async function(payloads) {
        if (!window.db) throw new Error("Supabase is not initialized.");
        const { data, error } = await db.rpc('register_set_items', { p_items: payloads });
        if (error) throw error;
        return data; // returns parentNumber
    },

    rpcAddSetItems: async function(parentNumber, addCount) {
        if (!window.db) throw new Error("Supabase is not initialized.");
        const { error } = await db.rpc('add_set_items', { p_parent_item_number: parentNumber, p_add_count: addCount });
        if (error) throw error;
    },

    rpcReduceSetItems: async function(parentNumber, keepIds) {
        if (!window.db) throw new Error("Supabase is not initialized.");
        const { error } = await db.rpc('reduce_set_items', { p_parent_item_number: parentNumber, p_keep_item_ids: keepIds });
        if (error) throw error;
    },

    // ----------------------------------------------------
    // 関連テーブル（属性・タグなど）の操作
    // ----------------------------------------------------
    deleteItemRelations: async function(itemId) {
        if (!window.db) throw new Error("Supabase is not initialized.");
        await db.from('item_colors').delete().eq('item_id', itemId);
        await db.from('item_acquisition_methods').delete().eq('item_id', itemId);
        await db.from('item_moods').delete().eq('item_id', itemId);
    },

    deleteSpecificColors: async function(itemId, colorIds) {
        if (!window.db || colorIds.length === 0) return;
        await db.from('item_colors').delete().eq('item_id', itemId).in('color_id', colorIds);
    },

    deleteSpecificMoods: async function(itemId, moodIds) {
        if (!window.db || moodIds.length === 0) return;
        await db.from('item_moods').delete().eq('item_id', itemId).in('mood_id', moodIds);
    },

    deleteSpecificAcquisitions: async function(itemId, acqIds) {
        if (!window.db || acqIds.length === 0) return;
        await db.from('item_acquisition_methods').delete().eq('item_id', itemId).in('acquisition_method_id', acqIds);
    },

    deleteAllColors: async function(itemId) {
        if (!window.db) return;
        await db.from('item_colors').delete().eq('item_id', itemId);
    },

    deleteAllMoods: async function(itemId) {
        if (!window.db) return;
        await db.from('item_moods').delete().eq('item_id', itemId);
    },

    deleteAllAcquisitions: async function(itemId) {
        if (!window.db) return;
        await db.from('item_acquisition_methods').delete().eq('item_id', itemId);
    },

    insertColors: async function(rows) {
        if (!window.db || rows.length === 0) return;
        const { error } = await db.from('item_colors').insert(rows);
        if (error) throw error;
    },

    insertAcquisitions: async function(rows) {
        if (!window.db || rows.length === 0) return;
        const { error } = await db.from('item_acquisition_methods').insert(rows);
        if (error) throw error;
    },

    insertMoods: async function(rows) {
        if (!window.db || rows.length === 0) return;
        const { error } = await db.from('item_moods').insert(rows);
        if (error) throw error;
    },

    deleteItemImages: async function(itemId) {
        if (!window.db) throw new Error("Supabase is not initialized.");
        await db.from('item_images').delete().eq('item_id', itemId);
    },

    upsertNextProductionItems: async function(upsertRows) {
        if (!window.db || upsertRows.length === 0) return;
        const { error } = await db.from('next_production_items').upsert(upsertRows, { onConflict: 'item_id' });
        if (error) throw error;
    },
    
    fetchItemWithRelations: async function(id) {
        if (!window.db) throw new Error("Supabase is not initialized.");
        const { data, error } = await db.from('items').select(`
            *,
            created_by_member:members!items_created_by_fkey(name),
            updated_by_member:members!items_updated_by_fkey(name)
        `).eq('id', id).single();
        if (error) throw error;
        return data;
    }
};
