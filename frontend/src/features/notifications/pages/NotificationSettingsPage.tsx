import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { notificationSettingsApi, NotificationSettings, QuietHours } from '../api/notificationSettingsApi';
import { getPushSupport, isPushSubscribed, subscribeToPush, unsubscribeFromPush } from '../push';

const DEFAULT_QUIET_HOURS: QuietHours = { start: '22:00', end: '08:00', enabled: true };

const CATEGORIES = [
  { key: 'category_challenge', label: '챌린지', description: '챌린지 완료, 실패, 참가 요청 관련' },
  { key: 'category_quest', label: '퀘스트', description: '퀘스트 승인, 거절, 만료 관련' },
  { key: 'category_cheer', label: '응원', description: '응원 수신 알림' },
  { key: 'category_feed_social', label: '피드 소셜', description: '팔로우 요청, 수락, 초대 링크 사용' },
  { key: 'category_feed_badge', label: '피드 뱃지', description: '뱃지 획득, 리더 뱃지 갱신' },
  { key: 'category_bulletin', label: '게시판', description: '게시판 댓글 알림' },
  { key: 'category_challenge_board', label: '챌린지 가이드', description: '챌린지 가이드 댓글 알림' },
  { key: 'category_plaza', label: '광장', description: '광장 댓글 알림' },
] as const;

const TYPE_GROUPS: { groupLabel: string; types: { key: string; label: string }[] }[] = [
  {
    groupLabel: '챌린지 세부',
    types: [
      { key: 'type_challenge_completed', label: '챌린지 완료' },
      { key: 'type_challenge_failed', label: '챌린지 실패' },
      { key: 'type_challenge_preparing', label: '챌린지 준비중' },
      { key: 'type_challenge_start_confirmation_required', label: '시작 확인 필요' },
      { key: 'type_challenge_start_delayed', label: '시작 지연' },
      { key: 'type_join_request_approved', label: '참가 요청 승인' },
      { key: 'type_join_request_rejected', label: '참가 요청 거절' },
    ],
  },
  {
    groupLabel: '퀘스트 세부',
    types: [
      { key: 'type_quest_submission_approved', label: '퀘스트 제출 승인' },
      { key: 'type_quest_submission_rejected', label: '퀘스트 제출 거절' },
      { key: 'type_quest_proposal_expired', label: '퀘스트 제안 만료' },
      { key: 'type_new_quest_available', label: '새 퀘스트 등록' },
    ],
  },
  {
    groupLabel: '피드 소셜 세부',
    types: [
      { key: 'type_feed_follow_request', label: '팔로우 요청 수신' },
      { key: 'type_feed_follow_accepted', label: '팔로우 요청 수락됨' },
      { key: 'type_feed_invite_link_used', label: '초대 링크 사용됨' },
    ],
  },
  {
    groupLabel: '피드 뱃지 세부',
    types: [
      { key: 'type_feed_badge_granted', label: '뱃지 획득' },
      { key: 'type_feed_leader_badge_updated', label: '리더 뱃지 갱신' },
    ],
  },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-blue-500' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export function NotificationSettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['notification-settings'],
    queryFn: notificationSettingsApi.getSettings,
  });

  const mutation = useMutation({
    mutationFn: (updates: Partial<NotificationSettings>) =>
      notificationSettingsApi.updateSettings(updates),
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ['notification-settings'] });
      const prev = queryClient.getQueryData<NotificationSettings>(['notification-settings']);
      queryClient.setQueryData<NotificationSettings>(['notification-settings'], (old) =>
        old ? ({ ...old, ...updates } as NotificationSettings) : old,
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['notification-settings'], ctx.prev);
      }
    },
  });

  const toggle = (key: string, value: boolean) => {
    mutation.mutate({ [key]: value });
  };

  // ── 푸시 구독 상태 (브라우저 구독 기준) ──
  const pushSupport = getPushSupport();
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    isPushSubscribed().then(setPushOn);
  }, []);

  const togglePush = async (next: boolean) => {
    if (pushBusy) return;
    setPushBusy(true);
    if (next) {
      const result = await subscribeToPush();
      if (result.ok) {
        setPushOn(true);
        toast.success('푸시 알림을 켰어요 🔔');
      } else if (result.reason === 'permission-denied') {
        toast.error('브라우저 알림 권한이 차단되어 있어요. 브라우저 설정에서 허용해주세요');
      } else {
        toast.error('푸시 알림 설정에 실패했어요');
      }
    } else {
      const done = await unsubscribeFromPush();
      if (done) {
        setPushOn(false);
        toast('푸시 알림을 껐어요', { icon: '🔕' });
      } else {
        toast.error('푸시 알림 해제에 실패했어요');
      }
    }
    setPushBusy(false);
  };

  if (isLoading || !settings) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 glass-header flex items-center gap-3 px-4 py-3">
        <button onClick={() => navigate(-1)} className="text-gray-600 hover:text-gray-900">
          ←
        </button>
        <h1 className="text-lg font-semibold">알림 설정</h1>
      </div>

      <div className="mx-auto max-w-lg px-4 py-6 space-y-6">
        {/* 푸시 알림 (PRODUCT_SPEC §4.10) */}
        <section className="rounded-xl bg-white shadow-sm">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold text-gray-800">푸시 알림</h2>
            <p className="text-xs text-gray-500 mt-0.5">응원이 실천 시각에 맞춰 도착해요</p>
          </div>
          <div className="divide-y">
            {pushSupport === 'needs-install' ? (
              <div className="px-4 py-3">
                <p className="text-sm text-gray-700">📲 홈 화면에 추가하면 알림을 받을 수 있어요</p>
                <p className="text-xs text-gray-500 mt-1">
                  공유 버튼 → &lsquo;홈 화면에 추가&rsquo;로 설치한 뒤 다시 설정해주세요
                </p>
              </div>
            ) : pushSupport === 'unsupported' ? (
              <div className="px-4 py-3">
                <p className="text-sm text-gray-500">이 브라우저는 푸시 알림을 지원하지 않아요</p>
              </div>
            ) : (
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">푸시 알림 받기</p>
                  <p className="text-xs text-gray-500">이 기기로 알림을 보내드려요</p>
                </div>
                <Toggle checked={pushOn} onChange={togglePush} />
              </div>
            )}

            {/* 방해금지 시간 */}
            {(() => {
              const quiet = settings.quietHours ?? DEFAULT_QUIET_HOURS;
              return (
                <>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">방해금지 시간</p>
                      <p className="text-xs text-gray-500">설정한 시간에는 푸시를 보내지 않아요</p>
                    </div>
                    <Toggle
                      checked={quiet.enabled !== false}
                      onChange={(v) => mutation.mutate({ quietHours: { ...quiet, enabled: v } })}
                    />
                  </div>
                  {quiet.enabled !== false && (
                    <div className="flex items-center gap-2 px-4 py-3">
                      <input
                        type="time"
                        value={quiet.start}
                        onChange={(e) =>
                          mutation.mutate({ quietHours: { ...quiet, start: e.target.value } })
                        }
                        className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                      />
                      <span className="text-sm text-gray-500">부터</span>
                      <input
                        type="time"
                        value={quiet.end}
                        onChange={(e) =>
                          mutation.mutate({ quietHours: { ...quiet, end: e.target.value } })
                        }
                        className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                      />
                      <span className="text-sm text-gray-500">까지</span>
                    </div>
                  )}
                </>
              );
            })()}

            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-800">응원은 방해금지에도 받기</p>
                <p className="text-xs text-gray-500">응원은 내 실천 시각에 도착하는 게 핵심이에요</p>
              </div>
              <Toggle
                checked={settings.cheerBypassQuietHours !== false}
                onChange={(v) => mutation.mutate({ cheerBypassQuietHours: v })}
              />
            </div>
          </div>
        </section>

        {/* 카테고리 단위 */}
        <section className="rounded-xl bg-white shadow-sm">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold text-gray-800">카테고리별 알림</h2>
            <p className="text-xs text-gray-500 mt-0.5">카테고리를 끄면 해당 알림이 모두 차단됩니다</p>
          </div>
          <div className="divide-y">
            {CATEGORIES.map(({ key, label, description }) => (
              <div key={key} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">{label}</p>
                  <p className="text-xs text-gray-500">{description}</p>
                </div>
                <Toggle
                  checked={settings[key] !== false}
                  onChange={(v) => toggle(key, v)}
                />
              </div>
            ))}
          </div>
        </section>

        {/* 타입 단위 세부 설정 */}
        {TYPE_GROUPS.map(({ groupLabel, types }) => (
          <section key={groupLabel} className="rounded-xl bg-white shadow-sm">
            <div className="border-b px-4 py-3">
              <h2 className="font-semibold text-gray-800">{groupLabel}</h2>
            </div>
            <div className="divide-y">
              {types.map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between px-4 py-3">
                  <p className="text-sm text-gray-700">{label}</p>
                  <Toggle
                    checked={settings[key] !== false}
                    onChange={(v) => toggle(key, v)}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
