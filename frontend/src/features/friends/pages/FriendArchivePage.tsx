import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  fetchArchiveTimeline,
  fetchRelationshipSummary,
  setArchiveConsent,
} from '../api/friendsApi';

const TYPE_LABEL: Record<string, string> = {
  comment: '댓글',
  reply: '답글',
  reaction: '리액션',
  cheer: '응원',
  co_challenge: '함께 완주',
  plaza_meet: '마당에서 마주침',
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

export const FriendArchivePage = () => {
  const { userId = '' } = useParams();
  const qc = useQueryClient();
  const [timelineConsent, setTimelineConsent] = useState(false);

  const summary = useQuery({
    queryKey: ['relationship-summary', userId],
    queryFn: () => fetchRelationshipSummary(userId),
    enabled: Boolean(userId),
  });

  // 저장된 내 동의값으로 체크박스 초기화
  useEffect(() => {
    if (summary.data) setTimelineConsent(summary.data.myConsent.timeline);
  }, [summary.data]);
  const timeline = useQuery({
    queryKey: ['archive-timeline', userId],
    queryFn: () => fetchArchiveTimeline(userId),
    enabled: Boolean(userId),
    retry: false,
  });

  const consentM = useMutation({
    mutationFn: (v: boolean) => setArchiveConsent(userId, { timeline: v }),
    onSuccess: () => {
      toast.success('타임라인 공개 설정을 저장했어요');
      qc.invalidateQueries({ queryKey: ['archive-timeline', userId] });
    },
    onError: () => toast.error('설정에 실패했어요'),
  });

  const s = summary.data;
  const timelineBlocked =
    (timeline.error as any)?.response?.data?.error === 'TIMELINE_CONSENT_REQUIRED';

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-6">
      <Link to="/friends" className="text-sm text-primary-600">← 친구</Link>
      <h1 className="text-2xl font-bold text-gray-900">우리의 기록</h1>

      {/* 요약 (친구면 자동) */}
      {s && (
        <section className="bg-white rounded-2xl border border-gray-200 p-4 space-y-1 text-sm text-gray-700">
          <p>함께 참여한 챌린지 <b>{s.sharedChallengeCount}</b>개</p>
          <p>서로 남긴 댓글 <b>{s.commentCount}</b>회 · 리액션 <b>{s.reactionCount}</b>회</p>
          <p>주고받은 응원 <b>{s.cheerCount}</b>회 · 마당에서 마주침 <b>{s.plazaMeetCount}</b>회</p>
          {s.firstInteractionAt && (
            <p className="text-gray-500 pt-1">처음 마주친 날: {fmtDate(s.firstInteractionAt)}</p>
          )}
        </section>
      )}

      {/* 타임라인 동의 */}
      <section className="bg-white rounded-2xl border border-gray-200 p-4">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={timelineConsent}
            onChange={(e) => { setTimelineConsent(e.target.checked); consentM.mutate(e.target.checked); }}
          />
          우리 상호작용 타임라인 공개에 동의
        </label>
        <p className="text-xs text-gray-400 mt-1">
          양쪽 모두 동의해야 타임라인이 열려요. 과거 활동의 익명 표기는 그대로 유지돼요.
        </p>
        {s && (
          <p className="text-xs text-gray-400 mt-1">
            친구 동의: {s.counterpartConsent.timeline ? '✅ 동의함' : '⏳ 아직 동의 안 함'}
          </p>
        )}
      </section>

      {/* 타임라인 (양쪽 동의 시) */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-500">타임라인</h2>
        {timelineBlocked ? (
          <p className="text-sm text-gray-400">양쪽이 타임라인 공개에 동의하면 여기에 표시돼요.</p>
        ) : (timeline.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-400">아직 기록이 없어요.</p>
        ) : (
          timeline.data!.map((e) => (
            <div key={e.interactionId} className="bg-white rounded-xl border border-gray-200 p-3 text-sm">
              <span className="text-gray-400 mr-2">{fmtDate(e.occurredAt)}</span>
              <span className="text-gray-800">
                {e.actorIsMine ? '내가' : '친구가'}
                {!e.actorIsMine && e.actorDisplayName && (
                  <span className="text-gray-400"> [{e.actorDisplayName}]</span>
                )}{' '}
                {TYPE_LABEL[e.interactionType] ?? e.interactionType}
              </span>
              {e.contextType && <span className="text-gray-400"> · {e.contextType}</span>}
            </div>
          ))
        )}
      </section>
    </div>
  );
};
