import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loading } from '@/shared/components/Loading';
import { personalFeedApi, FollowRequestItem, FollowerItem, InviteLink, BlockedItem, FeedProfile } from '../api/personalFeedApi';

// ─── 핸들 설정 섹션 ───────────────────────────────────────────────────
function HandleSection({ profile }: { profile: FeedProfile }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(profile.feedHandle ?? '');
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (handle: string) => personalFeedApi.updateFeedHandle(handle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personal-feed-profile', 'me'] });
      setEditing(false);
      setError(null);
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setError(err?.response?.data?.message ?? '핸들 저장에 실패했어요');
    },
  });

  const handleUrl = profile.feedHandle
    ? `${window.location.origin}/personal-feed/@${profile.feedHandle}`
    : null;

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <h3 className="text-sm font-semibold text-gray-700">피드 핸들</h3>
        <p className="text-xs text-gray-400 mt-0.5">고유 주소를 설정하면 @handle 형식으로 공유할 수 있어요</p>
      </div>
      <div className="px-4 pb-4">
        {editing ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">@</span>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="my_handle"
                maxLength={20}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-400"
              />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <p className="text-[11px] text-gray-400">영문 소문자로 시작, 영숫자·_ 사용 가능, 3~20자</p>
            <div className="flex gap-2">
              <button
                onClick={() => saveMutation.mutate(input)}
                disabled={saveMutation.isPending || input.length < 3}
                className="px-4 py-1.5 bg-primary-500 text-white text-xs font-semibold rounded-full hover:bg-primary-600 disabled:opacity-50 transition-colors"
              >
                {saveMutation.isPending ? '저장 중...' : '저장'}
              </button>
              <button
                onClick={() => { setEditing(false); setInput(profile.feedHandle ?? ''); setError(null); }}
                className="px-4 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        ) : profile.feedHandle ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-mono text-gray-800">@{profile.feedHandle}</span>
              <button
                onClick={() => { setEditing(true); setInput(profile.feedHandle!); }}
                className="text-xs text-primary-600 font-semibold hover:text-primary-700"
              >
                변경
              </button>
            </div>
            {handleUrl && (
              <button
                onClick={() => navigator.clipboard.writeText(handleUrl)}
                className="text-[11px] text-gray-400 hover:text-primary-500 transition-colors text-left truncate w-full"
              >
                🔗 {handleUrl}
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-sm text-primary-600 font-semibold hover:text-primary-700 transition-colors"
          >
            + 핸들 설정하기
          </button>
        )}
      </div>
    </div>
  );
}

// ─── 공개 프로필(리더 모객 페이지) 섹션 ────────────────────────────────
//  /p/@handle 로 누구나(비로그인 포함) 볼 수 있는 랜딩: 소개 + 대표 게시물(≤6) +
//  리더/매니저 챌린지. 대표 게시물은 내 프로필 피드에서 공개 인증만 선택 가능.
function PublicProfileSection({ profile }: { profile: FeedProfile }) {
  const queryClient = useQueryClient();
  const saved = profile.publicProfile;
  const [enabled, setEnabled] = useState(saved?.enabled === true);
  const [displayName, setDisplayName] = useState(saved?.displayName ?? '');
  const [bio, setBio] = useState(saved?.bio ?? '');
  const [featuredIds, setFeaturedIds] = useState<string[]>(
    Array.isArray(saved?.featuredIds) ? saved!.featuredIds.slice(0, 6) : [],
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // 대표 게시물 후보 — 내 프로필 피드(비공개 포함 전량, 선택은 공개만 허용)
  const { data: myFeed, isLoading: feedLoading } = useQuery({
    queryKey: ['my-profile-feed-picker'],
    enabled: pickerOpen,
    queryFn: () => personalFeedApi.getMyVerifications(),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      personalFeedApi.updatePublicProfile({
        enabled,
        displayName: displayName.trim() || null,
        bio: bio.trim() || null,
        featuredIds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personal-feed-profile', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['public-profile'] });
    },
  });

  const toggleFeatured = (verificationId: string) => {
    setFeaturedIds((prev) =>
      prev.includes(verificationId)
        ? prev.filter((id) => id !== verificationId)
        : prev.length >= 6
          ? prev
          : [...prev, verificationId],
    );
  };

  const publicUrl = profile.feedHandle ? `${window.location.origin}/p/@${profile.feedHandle}` : null;

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">공개 프로필 (모집 랜딩)</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            소개·대표 게시물·내가 여는 챌린지를 누구나 볼 수 있는 페이지로 공유해요
          </p>
        </div>
        <button
          onClick={() => setEnabled((v) => !v)}
          aria-pressed={enabled}
          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
            enabled ? 'bg-primary-500' : 'bg-gray-200'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      <div className="px-4 pb-4 space-y-3">
        {!profile.feedHandle && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            공개 프로필 주소는 @핸들 기반이에요. 위에서 핸들을 먼저 설정해주세요.
          </p>
        )}

        {enabled && (
          <>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={30}
              placeholder={`공개용 이름 (비우면 가입명 "${profile.displayName}" 사용)`}
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-primary-400"
            />
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="소개 — 어떤 챌린지를 열고 있는지, 나는 어떤 사람인지 알려주세요"
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-primary-400 resize-none"
            />

            {/* 대표 게시물 선택 */}
            <div>
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                className="text-xs font-semibold text-primary-600 hover:text-primary-700"
              >
                ✨ 대표 게시물 선택 ({featuredIds.length}/6) {pickerOpen ? '접기 ▲' : '펼치기 ▼'}
              </button>
              {pickerOpen && (
                <div className="mt-2">
                  {feedLoading ? (
                    <Loading />
                  ) : (myFeed?.items ?? []).length === 0 ? (
                    <p className="text-xs text-gray-400">아직 인증 게시물이 없어요</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-1.5">
                      {(myFeed?.items ?? []).map((v) => {
                        const isPublicPost = v.isPublic !== false && !v.scoreCancelled;
                        const selected = featuredIds.includes(v.verificationId);
                        return (
                          <button
                            key={v.verificationId}
                            type="button"
                            disabled={!isPublicPost}
                            onClick={() => toggleFeatured(v.verificationId)}
                            className={`relative aspect-square rounded-lg overflow-hidden border-2 text-left ${
                              selected ? 'border-primary-500' : 'border-transparent'
                            } ${!isPublicPost ? 'opacity-35' : ''}`}
                            title={!isPublicPost ? '비공개/취소된 인증은 선택할 수 없어요' : v.todayNote ?? ''}
                          >
                            {v.imageUrl ? (
                              <img src={v.imageUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-gray-50 p-1">
                                <p className="text-[9px] text-gray-500 line-clamp-4">{v.todayNote || '📝'}</p>
                              </div>
                            )}
                            {selected && (
                              <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-primary-500 text-white text-[9px] font-bold flex items-center justify-center">
                                {featuredIds.indexOf(v.verificationId) + 1}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-[10px] text-gray-400 mt-1">공개 인증만 선택할 수 있어요 (최대 6개, 누른 순서대로 표시)</p>
                </div>
              )}
            </div>
          </>
        )}

        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="w-full py-2 rounded-xl bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-colors"
        >
          {saveMutation.isPending ? '저장 중...' : '공개 프로필 저장'}
        </button>

        {enabled && publicUrl && (
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                navigator.clipboard.writeText(publicUrl).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                })
              }
              className="flex-1 text-[11px] text-gray-500 hover:text-primary-600 transition-colors text-left truncate"
            >
              🔗 {publicUrl} {copied ? '· 복사됨!' : ''}
            </button>
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-semibold text-primary-600 flex-shrink-0"
            >
              미리보기 →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 팔로우 요청 섹션 ─────────────────────────────────────────────────
function FollowRequestsSection() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['feed-follow-requests'],
    queryFn: () => personalFeedApi.getFollowRequests(),
  });

  const acceptMutation = useMutation({
    mutationFn: (followId: string) => personalFeedApi.acceptFollowRequest(followId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feed-follow-requests'] }),
  });

  const rejectMutation = useMutation({
    mutationFn: (followId: string) => personalFeedApi.rejectFollowRequest(followId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feed-follow-requests'] }),
  });

  const requests = data?.requests ?? [];

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <h3 className="text-sm font-semibold text-gray-700">
          팔로우 요청 {requests.length > 0 ? `(${requests.length})` : ''}
        </h3>
      </div>
      {isLoading ? (
        <div className="px-4 pb-4"><Loading /></div>
      ) : requests.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-gray-400">받은 팔로우 요청이 없어요</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {requests.map((req: FollowRequestItem) => (
            <li key={req.followId} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-700">익명의 사용자</p>
                <p className="text-xs text-gray-400">{new Date(req.createdAt).toLocaleDateString('ko-KR')}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => acceptMutation.mutate(req.followId)}
                  disabled={acceptMutation.isPending}
                  className="px-3 py-1 text-xs font-semibold rounded-full bg-primary-500 text-white hover:bg-primary-600 transition-colors"
                >
                  수락
                </button>
                <button
                  onClick={() => rejectMutation.mutate(req.followId)}
                  disabled={rejectMutation.isPending}
                  className="px-3 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  거절
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── 팔로워 목록 섹션 ─────────────────────────────────────────────────
function FollowersSection() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['feed-followers'],
    queryFn: () => personalFeedApi.getFollowers(),
  });

  const removeMutation = useMutation({
    mutationFn: (followerId: string) => personalFeedApi.removeFollower(followerId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feed-followers'] }),
  });

  const followers = data?.followers ?? [];

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <h3 className="text-sm font-semibold text-gray-700">
          팔로워 {followers.length > 0 ? `(${followers.length})` : ''}
        </h3>
      </div>
      {isLoading ? (
        <div className="px-4 pb-4"><Loading /></div>
      ) : followers.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-gray-400">아직 팔로워가 없어요</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {followers.map((f: FollowerItem) => (
            <li key={f.followId} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-700">익명의 팔로워</p>
                <p className="text-xs text-gray-400">
                  {new Date(f.createdAt).toLocaleDateString('ko-KR')} 팔로우
                </p>
              </div>
              <button
                onClick={() => removeMutation.mutate(f.followerId)}
                disabled={removeMutation.isPending}
                className="px-3 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                해제
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── 초대 링크 섹션 ───────────────────────────────────────────────────
function InviteLinksSection() {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['feed-invite-links'],
    queryFn: () => personalFeedApi.getInviteLinks(),
  });

  const createMutation = useMutation({
    mutationFn: () => personalFeedApi.createInviteLink(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feed-invite-links'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (linkId: string) => personalFeedApi.deleteInviteLink(linkId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feed-invite-links'] }),
  });

  const links = data?.links ?? [];

  const handleCopy = (token: string) => {
    const url = `${window.location.origin}/personal-feed/invite/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h3 className="text-sm font-semibold text-gray-700">초대 링크</h3>
        <button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors"
        >
          {createMutation.isPending ? '생성 중...' : '+ 새 링크'}
        </button>
      </div>
      {isLoading ? (
        <div className="px-4 pb-4"><Loading /></div>
      ) : links.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-gray-400">초대 링크를 만들어 팔로우 요청을 받을 수 있어요</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {links.map((link: InviteLink) => (
            <li key={link.inviteLinkId} className="px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-mono text-gray-500 truncate max-w-[180px]">
                  .../{link.token}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCopy(link.token)}
                    className="text-xs text-primary-600 hover:text-primary-700 font-semibold"
                  >
                    {copied === link.token ? '복사됨!' : '복사'}
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(link.inviteLinkId)}
                    disabled={deleteMutation.isPending}
                    className="text-xs text-red-400 hover:text-red-600 font-semibold"
                  >
                    삭제
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-gray-400">
                사용 {link.usedCount}회
                {link.maxUses != null ? ` / 최대 ${link.maxUses}회` : ''}
                {link.expiresAt ? ` · ${new Date(link.expiresAt).toLocaleDateString('ko-KR')} 만료` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── 차단 목록 섹션 ───────────────────────────────────────────────────
function BlockedUsersSection() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['feed-blocked'],
    queryFn: () => personalFeedApi.getBlockedList(),
  });

  const unblockMutation = useMutation({
    mutationFn: (userId: string) => personalFeedApi.unblockUser(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feed-blocked'] }),
  });

  const blocked = data?.blocked ?? [];

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <h3 className="text-sm font-semibold text-gray-700">
          차단 목록 {blocked.length > 0 ? `(${blocked.length})` : ''}
        </h3>
      </div>
      {isLoading ? (
        <div className="px-4 pb-4"><Loading /></div>
      ) : blocked.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-gray-400">차단한 사용자가 없어요</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {blocked.map((b: BlockedItem) => (
            <li key={b.blockId} className="flex items-center justify-between px-4 py-3">
              <p className="text-sm font-medium text-gray-700">차단된 사용자</p>
              <button
                onClick={() => unblockMutation.mutate(b.blockedUserId)}
                disabled={unblockMutation.isPending}
                className="px-3 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                차단 해제
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── 메인 설정 페이지 ─────────────────────────────────────────────────
export function FeedSettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['personal-feed-profile', 'me'],
    queryFn: () => personalFeedApi.getProfile('me'),
  });

  const settingsMutation = useMutation({
    mutationFn: (settings: { isPublic?: boolean; tab02Public?: boolean }) =>
      personalFeedApi.updateFeedSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personal-feed-profile', 'me'] });
    },
  });

  if (isLoading) return <Loading />;

  const isPublic = profile?.feedSettings.isPublic ?? false;
  const tab02Public = profile?.feedSettings.tab02Public ?? false;

  return (
    <div className="min-h-screen">
      {/* 헤더 */}
      <div className="glass-header px-4 pt-12 pb-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-gray-500 hover:text-gray-800 text-xl"
        >
          ←
        </button>
        <h1 className="text-base font-bold text-gray-800">피드 설정</h1>
      </div>

      <div className="p-4 space-y-4">
        {/* 핸들 설정 */}
        {profile && <HandleSection profile={profile} />}

        {/* 공개 프로필(모집 랜딩) */}
        {profile && <PublicProfileSection profile={profile} />}

        {/* 공개 설정 */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <h3 className="text-sm font-semibold text-gray-700">공개 설정</h3>
          </div>
          <div className="divide-y divide-gray-50">
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-700">업적 탭 공개</p>
                <p className="text-xs text-gray-400 mt-0.5">업적/뱃지 통계를 모든 방문자에게 공개</p>
              </div>
              <button
                onClick={() => settingsMutation.mutate({ isPublic: !isPublic })}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  isPublic ? 'bg-primary-500' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    isPublic ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-700">챌린지 탭 공개</p>
                <p className="text-xs text-gray-400 mt-0.5">팔로잉 상태면 누구나 챌린지 목록 열람 가능</p>
              </div>
              <button
                onClick={() => settingsMutation.mutate({ tab02Public: !tab02Public })}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  tab02Public ? 'bg-primary-500' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    tab02Public ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* 팔로우 요청 */}
        <FollowRequestsSection />

        {/* 팔로워 목록 */}
        <FollowersSection />

        {/* 초대 링크 */}
        <InviteLinksSection />

        {/* 차단 목록 */}
        <BlockedUsersSection />

        {/* 알림 설정 링크 */}
        <button
          onClick={() => navigate('/notifications/settings')}
          className="w-full bg-white rounded-2xl shadow-sm px-4 py-4 flex items-center justify-between text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <span>알림 설정</span>
          <span className="text-gray-400">→</span>
        </button>
      </div>
    </div>
  );
}
