
let state = {
    auth: { isLoggedIn: false, type: null },
    members: [],
    castMaster: [], // 配役マスター
    selfProfiles: [],
    currentMember: '',
    rehearsals: [], 
    attendance: {}, 
    memos: [],
    links: [],
    reactions: [],
    commentReactions: [],
    memoComments: [],
    memoCommentReactions: [],
    settings: {
        locations: ['段原公民館', '祇園公民館', '宇品公民館', '青崎公民館', '中央公民館', '己斐公民館', '公民館', '八本松地域センター'],
        menus: ['ワークショップダンス基礎', 'ワークショップダンス', 'ワークショップミュージカル', 'ワークショップ', '美女野獣　稽古', '美女野獣　合唱練習'],
        memoCategories: [],
        visibility: {} // localStorageから読み込む
    },
        ui: {
        currentMonth: '',
        statusMonth: '',
        pastMonth: '',
        editingId: null,
        openedMemoComments: [],
        editingCommentId: null,
        adminViewList: [],
        adminSortOrder: 'asc'
    },

    commentReadStatus: {},
    commentUpdatedStatus: {}

};