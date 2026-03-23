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

  const deleteMutation = useMutation({
    mutationFn: () => personalFeedApi.deleteFeedHandle(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personal-feed-profile', 'me'] });
      setInput('');
      setEditing(false);
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
              <div className="flex gap-2">
                <button
                  onClick={() => { setEditing(true); setInput(profile.feedHandle!); }}
                  className="text-xs text-primary-600 font-semibold hover:text-primary-700"
                >
                  변경
                </button>
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="text-xs text-red-400 font-semibold hover:text-red-600"
                >
                  삭제
                </button>
              </div>
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
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4 flex items-center gap-3">
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
