function initProfileEvents() {

    const saveProfileBtn = document.getElementById('save-profile-btn');

    if (saveProfileBtn) {

        saveProfileBtn.onclick = async () => {

            if (!state.currentProfileMemberId) {
                alert('メンバーを選択してください。');
                return;
            }

            const profileData = {

                member_id: state.currentProfileMemberId,

                full_name: document.getElementById('profile-name').value,

                reading: document.getElementById('profile-reading').value,

                birth_year:
                    document.getElementById('profile-birth-year').value || null,

                birth_month:
                    document.getElementById('profile-birth-month').value || null,

                birth_day:
                    document.getElementById('profile-birth-day').value || null,

                area:
                    document.getElementById('profile-area').value,

                transportation:
                    document.getElementById('profile-transportation').value,

                daily_life:
                    document.getElementById('profile-daily-life').value,

                hobbies: document.getElementById('profile-hobbies').value,

                favorite_food: document.getElementById('profile-favorite-food').value,

                talk_to_me_about: document.getElementById('profile-talk').value,

                message: document.getElementById('profile-message').value

            };

            const { error } = await db
                .from('self_profiles')
                .upsert(profileData);

            if (error) {
                alert(error.message);
                return;
            }

            alert('保存しました');

            document.getElementById('profile-form')
                .classList.add('hidden');

            await loadCloud();

        };
    }
}

function renderSelfProfiles() {

    const container = document.getElementById('profile-list');

    if (!container) return;

    container.innerHTML = '';

    const members = [...state.members].sort((a, b) => {
        const pa = state.selfProfiles.find(
            p => String(p.member_id) === String(a.id)
        );
        const pb = state.selfProfiles.find(
            p => String(p.member_id) === String(b.id)
        );

        return new Date(pb?.updated_at || 0) - new Date(pa?.updated_at || 0);
    });

    members.forEach(member => {

        const profile = state.selfProfiles.find(
            p => String(p.member_id) === String(member.id)
        );
        const updatedDate = profile?.updated_at
        ? new Date(profile.updated_at).toLocaleDateString('ja-JP')
        : '';
        if (profile) {

            container.innerHTML += `
                <div class="card" style="margin-top:15px;padding:22px;">

                    <div style="
                        display:flex;
                        justify-content:space-between;
                        align-items:flex-start;
                        margin-bottom:4px;">

                        <div style="flex:1; min-width:0;">

                            <div style="
                                font-size:1.35rem;
                                font-weight:700;
                                color:var(--pink-accent);">

                                👤 ${profile.full_name || member.name}

                            </div>

                            <div style="
                                color:#777;
                                font-size:0.9rem;
                                margin-top:4px;">

                                ${profile.reading || ''}

                            </div>

                        </div>

                        <div style="
                            display:flex;
                            flex-direction:column;
                            align-items:flex-end;
                            margin-left:12px;
                            flex-shrink:0;">

                            <button
                                class="edit-profile-btn"
                                data-member-id="${member.id}"
                                title="編集"
                                style="
                                    background:none;
                                    border:none;
                                    color:#d98bb3;
                                    font-size:0.9rem;
                                    cursor:pointer;
                                    padding:4px 6px;
                                    margin-bottom:4px;">

                                <i class="fa-solid fa-pen"></i>

                            </button>

                            <div style="
                                font-size:0.72rem;
                                color:#999;
                                white-space:nowrap;">

                                🕒 ${updatedDate}

                            </div>

                        </div>

                    </div>

                    <hr style="border:none;border-top:1px solid #f6d5e5;margin:18px 0;">

                    <div style="margin-bottom:10px;">
                        🎂 ${
                            profile.birth_month && profile.birth_day
                                ? (
                                    (profile.birth_year
                                        ? profile.birth_year + '年'
                                        : '') +
                                    profile.birth_month + '月' +
                                    profile.birth_day + '日'
                                )
                                : ''
                        }
                    </div>

                    <div style="margin-bottom:10px;">
                        📍 ${profile.area || ''}
                    </div>

                    <div>
                        🚃 ${profile.transportation || ''}
                    </div>

                    <hr style="border:none;border-top:1px solid #f6d5e5;margin:18px 0;">

                    <div style="margin-bottom:10px;">
                        💼 ${profile.daily_life || ''}
                    </div>

                    <div style="margin-bottom:10px;">
                        🎵 ${profile.hobbies || ''}
                    </div>

                    <div>
                        🍙 ${profile.favorite_food || ''}
                    </div>

                    <hr style="border:none;border-top:1px solid #f6d5e5;margin:18px 0;">

                    <div style="font-weight:600;color:var(--pink-accent);margin-bottom:6px;">
                        💬 話せる話題
                    </div>

                    <div style="white-space:pre-wrap;margin-bottom:18px;">${(profile.talk_to_me_about || '').trim()}</div>

                    <div style="font-weight:600;color:var(--pink-accent);margin-bottom:6px;">
                        🩷 ひとこと
                    </div>

                    <div style="
                        white-space:pre-wrap;
                        background:#fff6fa;
                        border-radius:12px;
                        padding:12px;
                        margin-bottom:18px;">${(profile.message || '').trim()}</div>
                    
                </div>
            `;

        } else {

            container.innerHTML += `
                <div class="card" style="margin-top:15px;">

                    <div><strong>メンバー名：</strong>${member.name}</div>

                    <div style="margin:15px 0;color:#888;">

                        まだ自己紹介は登録されていません。

                    </div>

                    <button
                        class="edit-profile-btn puffy-btn"
                        data-member-id="${member.id}">

                        <i class="fa-solid fa-plus"></i> 新規作成

                    </button>

                </div>
            `;
        }

    });
    document.querySelectorAll('.edit-profile-btn').forEach(btn => {

        btn.onclick = () => {

            const memberId = btn.dataset.memberId;

            const profile = state.selfProfiles.find(
                p => String(p.member_id) === String(memberId)
            );

            document.getElementById('profile-form')
                .classList.remove('hidden');

            const member = state.members.find(
                m => String(m.id) === String(memberId)
            );

            document.getElementById('profile-member-name').value =
                member ? member.name : '';

            state.currentProfileMemberId = memberId;

            document.getElementById('profile-name').value =
                profile?.full_name || '';

            document.getElementById('profile-reading').value =
                profile?.reading || '';

            document.getElementById('profile-birth-year').value =
                profile?.birth_year || '';

            document.getElementById('profile-birth-month').value =
                profile?.birth_month || '';

            document.getElementById('profile-birth-day').value =
                profile?.birth_day || '';

            document.getElementById('profile-area').value =
                profile?.area || '';

            document.getElementById('profile-transportation').value =
                profile?.transportation || '';

            document.getElementById('profile-daily-life').value =
                profile?.daily_life || '';

            document.getElementById('profile-hobbies').value =
                profile?.hobbies || '';

            document.getElementById('profile-favorite-food').value =
                profile?.favorite_food || '';

            document.getElementById('profile-talk').value =
                profile?.talk_to_me_about || '';

            document.getElementById('profile-message').value =
                profile?.message || '';

            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });

        };

    });

}

function initializeBirthdaySelects() {

    const month = document.getElementById('profile-birth-month');
    const day = document.getElementById('profile-birth-day');

    if (!month || !day) return;

    month.innerHTML = '<option value="">月</option>';

    for (let i = 1; i <= 12; i++) {
        month.innerHTML += `<option value="${i}">${i}月</option>`;
    }

    day.innerHTML = '<option value="">日</option>';

    for (let i = 1; i <= 31; i++) {
        day.innerHTML += `<option value="${i}">${i}日</option>`;
    }

}

