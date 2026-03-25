import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Loading } from '@/shared/components/Loading';
import { EmptyState } from '@/shared/components/EmptyState';
import { getChallengeTypeLabel, getRemainingRemedyCount, getRemedyLabel } from '@/features/challenge/utils/flowPolicy';

type PersonalQuestStatus = 'pending' | 'approved' | 'rejected' | 'revision_pending' | 'expired' | 'disqualified' | 'none';

function statusLabel(status: PersonalQuestStatus): string {
  const labels: Record<PersonalQuestStatus, string> = {
    pending: '검토 대기',
    approved: '승인 완료',
    rejected: '반려(수정 필요)',
    revision_pending: '재검토 대기',
    expired: '만료',
    disqualified: '참여 제한',
    none: '제안 없음',
  };

  return labels[status] ?? '확인 필요';
}


const QA_CHECKLIST = [
  {
    phase: 'PHASE 1',
    items: [
      'ME와 UX 허브에서 진행률/점수/연속일/보완정책이 동일하게 보이는지 확인',
      '보완정책(strict/limited/open)별 라벨과 잔여횟수 계산이 일치하는지 확인',
    ],
  },
  {
    phase: 'PHASE 2 - Flow A',
    items: [
      '챌린지 상세에서 lifecycle별 CTA 문구/비활성 사유가 맞는지 확인',
      'challengeType별 personalGoal/personalTarget 필수/선택 안내가 맞는지 확인',
    ],
  },
  {
    phase: 'PHASE 2 - Flow B/C/D',
    items: [
      'ME에서 개인퀘스트 상태칩(pending/rejected/revision_pending/approved/expired) 분기를 확인',
      'VerificationSheet 성공 피드백(점수/연속일/delta/뱃지/응원권) 및 extra 공개전환 동작 확인',
      'RemedyPage에서 실패 Day 선택, 정책 차단(strict), 제한횟수(limited) 동작 확인',
    ],
  },
];

export const ParticipantFlowPlanPage = () => {
  const navigate = useNavigate();

  const { data: myChallengesData, isLoading: isLoadingChallenges } = useQuery({
    queryKey: ['my-challenges', 'flow-test-hub'],
    queryFn: async () => {
      const response = await apiClient.get('/challenges/my?status=active');
      return response.data.data;
    },
  });

  const challenges = myChallengesData?.challenges || [];

  const personalQuestTargetChallenges = useMemo(
    () => challenges.filter((challenge: any) => Boolean(challenge?.challenge?.personalQuestEnabled)),
    [challenges],
  );

  const { data: proposalMap, isLoading: isLoadingProposals } = useQuery({
    queryKey: ['personal-quest-proposals', personalQuestTargetChallenges.map((c: any) => c.challengeId).join(',')],
    enabled: personalQuestTargetChallenges.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        personalQuestTargetChallenges.map(async (challenge: any) => {
          const response = await apiClient.get(`/challenges/${challenge.challengeId}/personal-quest`);
          return [challenge.challengeId, response.data?.data?.latestProposal || null] as const;
        }),
      );

      return Object.fromEntries(entries) as Record<string, any>;
    },
  });

  const isLoading = isLoadingChallenges || isLoadingProposals;

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-10 glass-header px-6 py-4">
        <button onClick={() => navigate(-1)} className="text-sm text-gray-500 hover:text-gray-700">
          ← 뒤로가기
        </button>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">PHASE 1-2 플로우 테스트 허브</h1>
        <p className="text-sm text-gray-500 mt-1">PHASE 1 공통 기반 점검 후 Flow A~D를 실제 백엔드 연결 페이지에서 순서대로 테스트할 수 있습니다.</p>
      </div>

      <div className="p-6 space-y-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <h2 className="font-bold text-emerald-900">PHASE 1 점검 스냅샷</h2>
          <p className="text-xs text-emerald-800 mt-1">공통 기반(진행도/점수/연속일/정책) 노출이 챌린지별로 일관적인지 먼저 확인한 뒤, 아래 Flow A~D 테스트를 진행하세요.</p>
        </div>

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <h2 className="font-bold text-amber-900">운영자 Admin Docs Hub</h2>
          <p className="text-xs text-amber-800">런북/백필 명령/QA 체크리스트를 Admin 문서 페이지에서 바로 조회할 수 있습니다.</p>
          <button
            onClick={() => navigate('/admin/docs')}
            className="px-3 py-1.5 text-xs rounded-lg border border-amber-300 text-amber-800 bg-white"
          >
            Admin Docs 열기
          </button>
        </section>

        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 space-y-3">
          <h2 className="font-bold text-blue-900">실행용 QA 체크리스트</h2>
          {QA_CHECKLIST.map((group) => (
            <div key={group.phase} className="rounded-xl bg-white/80 border border-blue-100 p-3">
              <p className="text-sm font-semibold text-blue-900">{group.phase}</p>
              <ul className="mt-2 space-y-1 text-xs text-blue-900 list-disc pl-4">
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        {isLoading ? (
          <Loading />
        ) : challenges.length === 0 ? (
          <EmptyState
            icon="🧪"
            title="테스트할 참여 챌린지가 없어요"
            description="모집중 챌린지에 먼저 참여하면 플로우별 기능 테스트를 시작할 수 있어요."
            action={{
              label: '챌린지 둘러보기',
              onClick: () => navigate('/challenges'),
            }}
          />
        ) : (
          challenges.map((item: any) => {
            const challenge = item.challenge || {};
            const proposal = proposalMap?.[item.challengeId] || null;
            const proposalStatus = String(proposal?.status || 'none') as PersonalQuestStatus;
            const failedDays = (item.progress || []).filter((p: any) => p.day <= 5 && p.status !== 'success' && !p.remedied);
            const remainingRemedy = getRemainingRemedyCount(item.remedyPolicy, item.progress || []);

            return (
              <article key={item.userChallengeId} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{challenge.title || '챌린지'}</h2>
                    <p className="text-xs text-gray-500 mt-1">{getChallengeTypeLabel(String(challenge.challengeType || 'leader_personal'))} · {getRemedyLabel(item.remedyPolicy)}</p>
                  </div>
                  <span className="px-2 py-1 rounded-full text-xs font-semibold bg-primary-50 text-primary-700">{String(challenge.lifecycle || item.phase || 'active')}</span>
                </div>

                <div className="grid grid-cols-1 gap-2 text-sm">
                  <div className="rounded-xl bg-gray-50 p-3">
                    <p className="text-gray-500">Flow A · 참여/진입</p>
                    <p className="font-semibold text-gray-900 mt-1">현재 phase: {item.phase} · 시작일: {item.startDate || '-'}</p>
                    <button onClick={() => navigate(`/challenges/${item.challengeId}`)} className="mt-2 px-3 py-1.5 text-xs rounded-lg bg-primary-600 text-white">참여 상세 페이지 열기</button>
                  </div>

                  <div className="rounded-xl bg-gray-50 p-3">
                    <p className="text-gray-500">Flow B · 개인 퀘스트</p>
                    <p className="font-semibold text-gray-900 mt-1">상태: {challenge.personalQuestEnabled ? statusLabel(proposalStatus) : '비활성'}</p>
                    <p className="text-xs text-gray-500 mt-1">{challenge.personalQuestEnabled ? (challenge.personalQuestAutoApprove ? '자동 승인 모드' : '리더 승인 모드') : '개인 퀘스트 미사용 챌린지'}</p>
                    <button onClick={() => navigate('/me')} className="mt-2 px-3 py-1.5 text-xs rounded-lg border border-violet-200 text-violet-700 bg-violet-50">ME에서 제안 상태 테스트</button>
                  </div>

                  <div className="rounded-xl bg-gray-50 p-3">
                    <p className="text-gray-500">Flow C · 일일 인증/extra</p>
                    <p className="font-semibold text-gray-900 mt-1">완료 {item.completedDays || 0}일 · 진행률 {item.progressPercentage || 0}%</p>
                    <p className="text-xs text-gray-500 mt-1">VerificationSheet에서 인증 성공 피드백 + extra 공개 전환 동작 테스트</p>
                    <button onClick={() => navigate('/me')} className="mt-2 px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-700 bg-white">ME에서 인증 테스트</button>
                  </div>

                  <div className="rounded-xl bg-gray-50 p-3">
                    <p className="text-gray-500">Flow D · 레메디</p>
                    <p className="font-semibold text-gray-900 mt-1">실패 Day 후보: {failedDays.length ? failedDays.map((d: any) => d.day).join(', ') : '없음'}</p>
                    <p className="text-xs text-gray-500 mt-1">정책: {getRemedyLabel(item.remedyPolicy)} · 남은 보완: {remainingRemedy === null ? '제한 없음' : `${remainingRemedy}회`}</p>
                    <button
                      onClick={() => navigate(`/verification/remedy?userChallengeId=${item.userChallengeId}`)}
                      className="mt-2 px-3 py-1.5 text-xs rounded-lg border border-purple-200 text-purple-700 bg-purple-50"
                    >
                      레메디 페이지 테스트
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
};
