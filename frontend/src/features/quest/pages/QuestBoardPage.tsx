import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiCheckCircle, FiClock, FiXCircle, FiChevronRight } from 'react-icons/fi';
import { Loading } from '@/shared/components/Loading';
import { EmptyState } from '@/shared/components/EmptyState';
import { QuestSubmitSheet } from '@/features/quest/components/QuestSubmitSheet';

type StatusFilter = '전체' | '미제출' | '심사중' | '완료';

const STATUS_TABS: StatusFilter[] = ['전체', '미제출', '심사중', '완료'];

// 제출 상태 배지
const SubmissionBadge = ({ submission }: { submission: any | null }) => {
  if (!submission) {
    return (
      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
        미제출
      </span>
    );
  }
  switch (submission.status) {
    case 'pending':
      return (
        <span className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700">
          <FiClock className="w-3 h-3" /> 심사중
        </span>
      );
    case 'approved':
    case 'auto_approved':
      return (
        <span className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700">
          <FiCheckCircle className="w-3 h-3" /> 완료
        </span>
      );
    case 'rejected':
      return (
        <span className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-red-100 text-red-700">
          <FiXCircle className="w-3 h-3" /> 재제출 필요
        </span>
      );
    default:
      return null;
  }
};

// 제출 가능 여부
const canSubmit = (submission: any | null): boolean => {
  if (!submission) return true;
  return submission.status === 'rejected';
};

export const QuestBoardPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const challengeId = searchParams.get('challengeId');

  const [activeTab, setActiveTab]   = useState<StatusFilter>('전체');
  const [selectedQuest, setSelectedQuest] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['quests', challengeId, activeTab],
    queryFn: async () => {
      const params = new URLSearchParams({ status: 'active' });
      if (challengeId) params.set('challengeId', challengeId);
      const res = await apiClient.get(`/quests?${params}`);
      return res.data.data;
    },
  });

  const allQuests: any[] = data?.quests ?? [];

  const filtered = allQuests.filter((q) => {
    const status = q.mySubmission?.status ?? null;
    switch (activeTab) {
      case '미제출': return !status || status === 'rejected';
      case '심사중': return status === 'pending';
      case '완료':   return status === 'approved' || status === 'auto_approved';
      default:       return true;
    }
  });

  const counts = {
    전체:   allQuests.length,
    미제출: allQuests.filter(q => !q.mySubmission || q.mySubmission.status === 'rejected').length,
    심사중: allQuests.filter(q => q.mySubmission?.status === 'pending').length,
    완료:   allQuests.filter(q => ['approved','auto_approved'].includes(q.mySubmission?.status)).length,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="sticky top-0 bg-white border-b border-gray-200 z-10">
        <div className="px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <FiArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">퀘스트 보드 📋</h1>
            <p className="text-xs text-gray-500">완료하고 포인트를 모아보세요</p>
          </div>
          <button
            onClick={() => navigate('/quests/my-submissions')}
            className="ml-auto text-sm text-primary-600 font-medium"
          >
            제출 내역
          </button>
        </div>

        {/* 상태 탭 */}
        <div className="flex gap-1 px-4 pb-3">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-sm font-medium rounded-xl transition-all ${
                activeTab === tab
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {tab}
              {counts[tab] > 0 && (
                <span className={`ml-1 text-xs ${activeTab === tab ? 'opacity-80' : 'text-gray-400'}`}>
                  {counts[tab]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 퀘스트 목록 */}
      <div className="p-4 space-y-3">
        {isLoading ? (
          <Loading />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="📋"
            title={activeTab === '전체' ? '퀘스트가 없어요' : `${activeTab} 퀘스트가 없어요`}
            description={activeTab === '미제출' ? '모든 퀘스트를 완료했어요! 🎉' : ''}
          />
        ) : (
          filtered.map((quest, index) => {
            const submittable = canSubmit(quest.mySubmission);
            const isDone      = ['approved','auto_approved'].includes(quest.mySubmission?.status);

            return (
              <motion.div
                key={quest.questId}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className={`bg-white rounded-2xl p-4 shadow-sm border transition-all ${
                  isDone ? 'border-green-100 opacity-80' : 'border-gray-100'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* 아이콘 */}
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 ${
                    isDone ? 'bg-green-50' : 'bg-primary-50'
                  }`}>
                    {quest.icon || '📋'}
                  </div>

                  {/* 내용 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <SubmissionBadge submission={quest.mySubmission} />
                      <span className="text-xs font-bold text-primary-600">🏆 {quest.rewardPoints}pt</span>
                    </div>
                    <h3 className="font-bold text-gray-900 line-clamp-1">{quest.title}</h3>
                    <p className="text-sm text-gray-500 line-clamp-2 mt-0.5">{quest.description}</p>

                    {/* 인증 방식 */}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {(() => {
                        const types: string[] = Array.isArray(quest.allowedVerificationTypes) && quest.allowedVerificationTypes.length > 0
                          ? quest.allowedVerificationTypes
                          : quest.verificationType ? [quest.verificationType] : [];
                        const labels: Record<string, string> = { image: '📸 사진', link: '🔗 URL', text: '✍️ 텍스트', video: '🎥 영상' };
                        return types.map(t => (
                          <span key={t} className="text-xs text-gray-400">{labels[t] ?? t}</span>
                        ));
                      })()}
                      {quest.approvalRequired && (
                        <span className="text-xs text-gray-400">• 관리자 검토</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 제출 버튼 */}
                {!isDone && (
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedQuest(quest)}
                    className={`w-full mt-3 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1 transition-colors ${
                      submittable
                        ? quest.mySubmission?.status === 'rejected'
                          ? 'bg-red-50 text-red-600 border border-red-200'
                          : 'bg-primary-500 text-white'
                        : 'bg-yellow-50 text-yellow-700 border border-yellow-200 cursor-not-allowed'
                    }`}
                    disabled={!submittable}
                  >
                    {quest.mySubmission?.status === 'rejected' ? (
                      <><FiXCircle className="w-4 h-4" /> 재제출하기</>
                    ) : quest.mySubmission?.status === 'pending' ? (
                      <><FiClock className="w-4 h-4" /> 심사 대기중</>
                    ) : (
                      <>제출하기 <FiChevronRight className="w-4 h-4" /></>
                    )}
                  </motion.button>
                )}

                {isDone && (
                  <div className="w-full mt-3 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1 bg-green-50 text-green-700">
                    <FiCheckCircle className="w-4 h-4" /> 완료됨
                  </div>
                )}
              </motion.div>
            );
          })
        )}
      </div>

      {/* 제출 시트 */}
      <QuestSubmitSheet
        isOpen={!!selectedQuest}
        onClose={() => setSelectedQuest(null)}
        quest={selectedQuest}
      />
    </div>
  );
};
