import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiCheckCircle, FiClock, FiXCircle, FiRefreshCw } from 'react-icons/fi';
import { Loading } from '@/shared/components/Loading';
import { EmptyState } from '@/shared/components/EmptyState';
import { QuestSubmitSheet } from '@/features/quest/components/QuestSubmitSheet';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

const STATUS_LABEL: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  pending: {
    label: '심사중',
    cls: 'bg-yellow-100 text-yellow-700',
    icon: <FiClock className="w-3 h-3" />,
  },
  approved: {
    label: '승인',
    cls: 'bg-green-100 text-green-700',
    icon: <FiCheckCircle className="w-3 h-3" />,
  },
  auto_approved: {
    label: '자동승인',
    cls: 'bg-green-100 text-green-700',
    icon: <FiCheckCircle className="w-3 h-3" />,
  },
  rejected: {
    label: '거절됨',
    cls: 'bg-red-100 text-red-700',
    icon: <FiXCircle className="w-3 h-3" />,
  },
};

const formatDate = (iso: string) =>
  format(new Date(iso), 'M월 d일 HH:mm', { locale: ko });

export const MyQuestSubmissionsPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const questId = searchParams.get('questId');

  const [includeHistory, setIncludeHistory] = useState(false);
  const [resubmitQuest, setResubmitQuest]   = useState<any | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['my-quest-submissions', includeHistory, questId],
    queryFn: async () => {
      const params = new URLSearchParams({ includeHistory: String(includeHistory) });
      if (questId) params.set('questId', questId);
      const res = await apiClient.get(`/quests/my-submissions?${params}`);
      return res.data.data;
    },
  });

  const submissions: any[] = data?.submissions ?? [];

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
            <h1 className="text-xl font-bold text-gray-900">내 퀘스트 제출 내역</h1>
            <p className="text-xs text-gray-500">{data?.total ?? 0}건</p>
          </div>
        </div>

        {/* 현재 상태 / 전체 이력 토글 */}
        <div className="flex gap-2 px-4 pb-3">
          <button
            onClick={() => setIncludeHistory(false)}
            className={`flex-1 py-2 text-sm font-medium rounded-xl transition-all ${
              !includeHistory ? 'bg-primary-500 text-white shadow-sm' : 'bg-gray-100 text-gray-600'
            }`}
          >
            현재 상태
          </button>
          <button
            onClick={() => setIncludeHistory(true)}
            className={`flex-1 py-2 text-sm font-medium rounded-xl transition-all ${
              includeHistory ? 'bg-primary-500 text-white shadow-sm' : 'bg-gray-100 text-gray-600'
            }`}
          >
            전체 이력
          </button>
        </div>
      </div>

      {/* 설명 배너 (전체 이력 모드) */}
      {includeHistory && (
        <div className="mx-4 mt-4 p-3 bg-blue-50 border border-blue-200 rounded-xl">
          <p className="text-xs text-blue-700">
            재제출 포함 모든 시도를 보여줍니다. 거절 후 재제출한 경우 여러 번의 시도가 표시됩니다.
          </p>
        </div>
      )}

      {/* 제출 목록 */}
      <div className="p-4 space-y-3">
        {isLoading ? (
          <Loading />
        ) : submissions.length === 0 ? (
          <EmptyState
            icon="📋"
            title="제출 내역이 없어요"
            description="퀘스트를 완료하고 포인트를 받아보세요"
          />
        ) : (
          submissions.map((sub, index) => {
            const badge      = STATUS_LABEL[sub.status];
            const isRejected = sub.status === 'rejected';

            return (
              <motion.div
                key={sub.submissionId}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"
              >
                {/* 퀘스트 제목 + 상태 */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-2xl flex-shrink-0">{sub.quest?.icon || '📋'}</span>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 line-clamp-1">
                        {sub.quest?.title ?? `퀘스트 #${sub.questId.slice(-4)}`}
                      </p>
                      <p className="text-xs text-gray-400">{formatDate(sub.createdAt)}</p>
                    </div>
                  </div>

                  {badge && (
                    <span className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${badge.cls}`}>
                      {badge.icon} {badge.label}
                    </span>
                  )}
                </div>

                {/* 시도 번호 + 포인트 */}
                <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                  {includeHistory && sub.attemptNumber > 1 && (
                    <span className="flex items-center gap-1 text-primary-600 font-medium">
                      <FiRefreshCw className="w-3 h-3" /> {sub.attemptNumber}번째 시도
                    </span>
                  )}
                  {(sub.status === 'approved' || sub.status === 'auto_approved') && (
                    <span className="text-green-700 font-medium">🏆 +{sub.quest?.rewardPoints ?? 0}pt</span>
                  )}
                </div>

                {/* 제출 내용 미리보기 */}
                {sub.content?.imageUrl && (
                  <img
                    src={sub.content.imageUrl}
                    alt="제출 사진"
                    className="w-full h-40 object-cover rounded-xl mb-3"
                  />
                )}
                {sub.content?.videoUrl && (
                  <video
                    src={sub.content.videoUrl}
                    controls
                    className="w-full h-40 object-cover rounded-xl mb-3"
                  />
                )}
                {sub.content?.linkUrl && (
                  <a
                    href={sub.content.linkUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-sm text-blue-600 underline truncate mb-3"
                  >
                    {sub.content.linkUrl}
                  </a>
                )}
                {sub.content?.textContent && (
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3 mb-3 line-clamp-3">
                    {sub.content.textContent}
                  </p>
                )}
                {sub.content?.note && (
                  <p className="text-xs text-gray-400 italic mb-3">"{sub.content.note}"</p>
                )}

                {/* 거절 사유 */}
                {isRejected && sub.reviewNote && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-3">
                    <p className="text-xs font-semibold text-red-700 mb-0.5">거절 사유</p>
                    <p className="text-xs text-red-600">{sub.reviewNote}</p>
                    {sub.reviewedAt && (
                      <p className="text-xs text-red-400 mt-1">{formatDate(sub.reviewedAt)}</p>
                    )}
                  </div>
                )}

                {/* 재제출 버튼 (거절된 경우, 현재 상태 모드에서만) */}
                {isRejected && !includeHistory && (
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setResubmitQuest({ ...sub.quest, questId: sub.questId, mySubmission: sub })}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1 bg-red-50 text-red-600 border border-red-200"
                  >
                    <FiRefreshCw className="w-4 h-4" /> 재제출하기
                  </motion.button>
                )}
              </motion.div>
            );
          })
        )}
      </div>

      {/* 재제출 시트 */}
      <QuestSubmitSheet
        isOpen={!!resubmitQuest}
        onClose={() => setResubmitQuest(null)}
        quest={resubmitQuest}
        onSuccess={() => refetch()}
      />
    </div>
  );
};
