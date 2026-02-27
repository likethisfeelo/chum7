import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending:      { label: '심사중',    cls: 'bg-yellow-100 text-yellow-800' },
  approved:     { label: '승인',      cls: 'bg-green-100  text-green-800'  },
  auto_approved:{ label: '자동승인',  cls: 'bg-green-100  text-green-800'  },
  rejected:     { label: '거절됨',    cls: 'bg-red-100    text-red-800'    },
};

const FILTER_TABS = ['pending', 'approved', 'rejected'] as const;
type FilterTab = typeof FILTER_TABS[number];

const formatDate = (iso: string) =>
  format(new Date(iso), 'M월 d일 HH:mm', { locale: ko });

export const AdminQuestSubmissionsPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const questId = searchParams.get('questId');

  const [statusFilter, setStatusFilter] = useState<FilterTab>('pending');
  const [reviewing, setReviewing] = useState<{ id: string; action: 'approve' | 'reject' } | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin-quest-submissions', statusFilter, questId],
    queryFn: async () => {
      const params = new URLSearchParams({ status: statusFilter });
      if (questId) params.set('questId', questId);
      const res = await apiClient.get(`/admin/quests/submissions?${params}`);
      return res.data.data;
    },
    retry: false,
  });

  const [submissions, setSubmissions] = useState<any[]>([]);
  const [nextToken, setNextToken] = useState<string | null>(null);

  useEffect(() => {
    setSubmissions(data?.submissions ?? []);
    setNextToken(data?.nextToken ?? null);
  }, [data]);

  const loadMoreMutation = useMutation({
    mutationFn: async () => {
      if (!nextToken) return null;
      const params = new URLSearchParams({ status: statusFilter, nextToken });
      if (questId) params.set('questId', questId);
      const res = await apiClient.get(`/admin/quests/submissions?${params}`);
      return res.data.data;
    },
    onSuccess: (pageData) => {
      if (!pageData) return;
      setSubmissions((prev) => [...prev, ...(pageData.submissions ?? [])]);
      setNextToken(pageData.nextToken ?? null);
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || '제출물을 더 불러오지 못했습니다');
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ submissionId, action, note }: { submissionId: string; action: 'approve' | 'reject'; note: string }) => {
      const res = await apiClient.put(`/admin/quests/submissions/${submissionId}/review`, {
        action,
        reviewNote: note.trim() || undefined,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-quest-submissions'] });
      setReviewing(null);
      setReviewNote('');
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || '처리에 실패했습니다');
    },
  });

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-900 transition-colors">
            ← 뒤로
          </button>
          <h1 className="text-2xl font-bold text-gray-900">퀘스트 제출물 심사</h1>
        </div>
      </div>

      {/* 상태 필터 */}
      <div className="flex gap-2 mb-5">
        {FILTER_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              statusFilter === tab
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {STATUS_LABEL[tab]?.label ?? tab}
          </button>
        ))}
      </div>

      {/* 목록 */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">로딩 중...</div>
      ) : submissions.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">📭</p>
          <p>{STATUS_LABEL[statusFilter]?.label} 제출물이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-4">
          {submissions.map((sub) => {
            const badge = STATUS_LABEL[sub.status];
            const isOpen = reviewing?.id === sub.submissionId;

            return (
              <div key={sub.submissionId} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                {/* 카드 헤더 */}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <p className="font-bold text-gray-900">
                        {sub.quest?.title ?? `퀘스트 #${sub.questId?.slice(-6)}`}
                      </p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        제출자: <span className="font-medium">{sub.userId?.slice(-8)}</span>
                        {sub.attemptNumber > 1 && (
                          <span className="ml-2 text-primary-600">({sub.attemptNumber}번째 시도)</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(sub.createdAt)}</p>
                    </div>
                    {badge && (
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${badge.cls}`}>
                        {badge.label}
                      </span>
                    )}
                  </div>

                  {/* 제출 내용 */}
                  {sub.content?.imageUrl && (
                    <a href={sub.content.imageUrl} target="_blank" rel="noreferrer">
                      <img
                        src={sub.content.imageUrl}
                        alt="제출 사진"
                        className="w-full max-h-64 object-cover rounded-xl mb-3 cursor-pointer hover:opacity-90 transition-opacity"
                      />
                    </a>
                  )}
                  {sub.content?.linkUrl && (
                    <a
                      href={sub.content.linkUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-sm text-blue-600 underline mb-3 break-all"
                    >
                      {sub.content.linkUrl}
                    </a>
                  )}
                  {sub.content?.textContent && (
                    <div className="bg-gray-50 rounded-xl p-3 mb-3">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{sub.content.textContent}</p>
                    </div>
                  )}
                  {sub.content?.note && (
                    <p className="text-xs text-gray-400 italic mb-3">"{sub.content.note}"</p>
                  )}

                  {/* 이미 심사된 경우 결과 표시 */}
                  {sub.status !== 'pending' && sub.reviewNote && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-3">
                      <p className="text-xs font-semibold text-red-700">거절 사유</p>
                      <p className="text-sm text-red-600 mt-0.5">{sub.reviewNote}</p>
                      <p className="text-xs text-red-400 mt-1">
                        {sub.reviewedAt && formatDate(sub.reviewedAt)}
                      </p>
                    </div>
                  )}

                  {/* 심사 버튼 (pending만) */}
                  {sub.status === 'pending' && (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => { setReviewing({ id: sub.submissionId, action: 'approve' }); setReviewNote(''); }}
                        className="flex-1 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors"
                      >
                        ✓ 승인
                      </button>
                      <button
                        onClick={() => { setReviewing({ id: sub.submissionId, action: 'reject' }); setReviewNote(''); }}
                        className="flex-1 py-2 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 transition-colors"
                      >
                        ✗ 거절
                      </button>
                    </div>
                  )}
                </div>

                {/* 리뷰 입력 패널 */}
                {isOpen && (
                  <div className={`px-5 pb-5 pt-3 border-t ${
                    reviewing?.action === 'approve' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                  }`}>
                    <p className={`text-sm font-semibold mb-2 ${
                      reviewing?.action === 'approve' ? 'text-green-800' : 'text-red-800'
                    }`}>
                      {reviewing?.action === 'approve' ? '✓ 승인 확인' : '✗ 거절 사유 입력'}
                    </p>
                    {reviewing?.action === 'reject' && (
                      <textarea
                        value={reviewNote}
                        onChange={e => setReviewNote(e.target.value)}
                        placeholder="거절 사유를 입력해주세요 (사용자에게 표시됩니다)"
                        rows={3}
                        className="w-full px-3 py-2 border border-red-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-red-400 text-sm mb-3"
                        required
                      />
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (reviewing?.action === 'reject' && reviewNote.trim().length < 10) {
                            alert('거절 사유를 10자 이상 입력해주세요');
                            return;
                          }
                          reviewMutation.mutate({
                            submissionId: reviewing!.id,
                            action: reviewing!.action,
                            note: reviewNote,
                          });
                        }}
                        disabled={reviewMutation.isPending}
                        className={`flex-1 py-2 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 ${
                          reviewing?.action === 'approve'
                            ? 'bg-green-600 hover:bg-green-700'
                            : 'bg-red-600 hover:bg-red-700'
                        }`}
                      >
                        {reviewMutation.isPending ? '처리 중...' : '확인'}
                      </button>
                      <button
                        onClick={() => setReviewing(null)}
                        className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-300 transition-colors"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {nextToken && (
            <button
              type="button"
              onClick={() => loadMoreMutation.mutate()}
              disabled={loadMoreMutation.isPending || isFetching}
              className="w-full py-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 disabled:opacity-50"
            >
              {loadMoreMutation.isPending ? '불러오는 중...' : '제출물 더보기'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
