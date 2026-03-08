import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  all: { label: '전체', cls: 'bg-slate-100 text-slate-700' },
  pending: { label: '심사중', cls: 'bg-yellow-100 text-yellow-800' },
  approved: { label: '승인', cls: 'bg-green-100 text-green-800' },
  auto_approved: { label: '자동승인', cls: 'bg-green-100 text-green-800' },
  rejected: { label: '거절됨', cls: 'bg-red-100 text-red-800' },
};

const SCOPE_LABEL: Record<string, { label: string; cls: string }> = {
  leader: { label: '리더 퀘스트', cls: 'bg-indigo-100 text-indigo-700' },
  personal: { label: '개인 퀘스트', cls: 'bg-emerald-100 text-emerald-700' },
  mixed: { label: '혼합 퀘스트', cls: 'bg-purple-100 text-purple-700' },
};

const FILTER_TABS = ['all', 'pending', 'approved', 'rejected'] as const;
type FilterTab = typeof FILTER_TABS[number];
type ScopeFilter = 'all' | 'leader' | 'personal' | 'mixed';

const formatDate = (iso?: string) => {
  if (!iso) return '-';
  return format(new Date(iso), 'M월 d일 HH:mm', { locale: ko });
};

const shortText = (text?: string, limit = 36) => {
  if (!text) return '-';
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length > limit ? `${compact.slice(0, limit)}…` : compact;
};

const mediaSummary = (content: any) => {
  const chips: string[] = [];
  if (content?.imageUrl) chips.push('사진');
  if (content?.videoUrl) chips.push('영상');
  if (content?.linkUrl) chips.push('링크');
  if (!chips.length) return '없음';
  return chips.join(' · ');
};

function isVideoUrl(url: string): boolean {
  const lower = String(url || '').toLowerCase();
  return lower.includes('.mp4') || lower.includes('.webm') || lower.includes('.mov') || lower.includes('.m4v');
}

function resolveMediaUrl(url: string): string {
  if (!url) return '';

  const raw = String(url).trim();
  if (!raw) return '';

  const cloudfrontBase = (import.meta.env.VITE_CLOUDFRONT_URL || '').replace(/\/+$/, '');
  const normalizedPath = raw.replace(/^\/+/, '');

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    if (!cloudfrontBase) return raw;

    try {
      const parsed = new URL(raw);
      if (parsed.pathname.startsWith('/uploads/')) {
        return `${cloudfrontBase}${parsed.pathname}`;
      }
      return raw;
    } catch {
      return raw;
    }
  }

  if (normalizedPath.startsWith('uploads/')) {
    return cloudfrontBase
      ? `${cloudfrontBase}/${normalizedPath}`
      : `/${normalizedPath}`;
  }

  return cloudfrontBase
    ? `${cloudfrontBase}/uploads/${normalizedPath}`
    : `/uploads/${normalizedPath}`;
}

export const AdminQuestSubmissionsPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialChallengeId = searchParams.get('challengeId') ?? 'all';

  const [statusFilter, setStatusFilter] = useState<FilterTab>('all');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [challengeFilter, setChallengeFilter] = useState(initialChallengeId);
  const [reviewing, setReviewing] = useState<{ id: string; action: 'approve' | 'reject' } | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState<any | null>(null);

  const { data: challengeData } = useQuery({
    queryKey: ['admin-quest-submissions-challenges'],
    queryFn: async () => {
      try {
        const mine = await apiClient.get('/admin/challenges/mine');
        const myChallenges = mine.data?.data?.challenges ?? [];
        if (Array.isArray(myChallenges) && myChallenges.length > 0) return myChallenges;
      } catch {
        // fallback below
      }

      const res = await apiClient.get('/challenges?sortBy=latest&limit=200');
      return res.data?.data?.challenges ?? [];
    },
    retry: false,
  });

  const challengeOptions = useMemo(() => {
    const map = new Map<string, string>();
    (challengeData ?? []).forEach((challenge: any) => {
      if (challenge?.challengeId) map.set(challenge.challengeId, challenge.title ?? '제목 없음');
    });
    return Array.from(map.entries()).map(([challengeId, title]) => ({ challengeId, title }));
  }, [challengeData]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin-quest-submissions', statusFilter, challengeFilter, scopeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ status: statusFilter });
      if (challengeFilter !== 'all') params.set('challengeId', challengeFilter);
      if (scopeFilter !== 'all') params.set('questScope', scopeFilter);
      const res = await apiClient.get(`/admin/quests/submissions?${params}`);
      return res.data.data;
    },
    retry: false,
  });

  const { data: verificationMonitor } = useQuery({
    queryKey: ['admin-verification-monitor', challengeFilter],
    queryFn: async () => {
      const res = await apiClient.get('/verifications?limit=40');
      let items = res.data?.data?.verifications ?? [];
      if (challengeFilter !== 'all') {
        items = items.filter((item: any) => item.challengeId === challengeFilter);
      }
      return items;
    },
    retry: false,
  });

  const [submissions, setSubmissions] = useState<any[]>([]);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const summary = data?.summary || { byStatus: {}, byScope: {} };

  useEffect(() => {
    setSubmissions(data?.submissions ?? []);
    setNextToken(data?.nextToken ?? null);
  }, [data]);

  const loadMoreMutation = useMutation({
    mutationFn: async () => {
      if (!nextToken) return null;
      const params = new URLSearchParams({ status: statusFilter, nextToken });
      if (challengeFilter !== 'all') params.set('challengeId', challengeFilter);
      if (scopeFilter !== 'all') params.set('questScope', scopeFilter);
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
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-900 transition-colors">← 뒤로</button>
          <h1 className="text-2xl font-bold text-gray-900">퀘스트 제출물 심사</h1>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <p className="text-xs text-gray-500">전체</p>
          <p className="text-xl font-bold text-gray-900">{submissions.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <p className="text-xs text-gray-500">승인</p>
          <p className="text-xl font-bold text-emerald-600">{(summary.byStatus?.approved || 0) + (summary.byStatus?.auto_approved || 0)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <p className="text-xs text-gray-500">심사중</p>
          <p className="text-xl font-bold text-amber-600">{summary.byStatus?.pending || 0}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <p className="text-xs text-gray-500">거절</p>
          <p className="text-xl font-bold text-rose-600">{summary.byStatus?.rejected || 0}</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-5 space-y-4">
        <div className="flex gap-2">
          {FILTER_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                statusFilter === tab ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {STATUS_LABEL[tab]?.label ?? tab}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">챌린지 선택</label>
            <select
              value={challengeFilter}
              onChange={(e) => setChallengeFilter(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm"
            >
              <option value="all">전체 챌린지</option>
              {challengeOptions.map((challenge) => (
                <option key={challenge.challengeId} value={challenge.challengeId}>
                  {challenge.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">퀘스트 구분</label>
            <select
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value as ScopeFilter)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm"
            >
              <option value="all">전체</option>
              <option value="leader">리더 퀘스트</option>
              <option value="personal">개인 퀘스트</option>
              <option value="mixed">혼합 퀘스트</option>
            </select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">로딩 중...</div>
      ) : submissions.length === 0 ? (
        (verificationMonitor?.length ? (
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
              퀘스트 제출물은 없지만, 최근 인증 게시물 모니터링 목록을 표시합니다.
            </div>
            {verificationMonitor.map((v: any) => (
              <div key={v.verificationId} className="bg-white border border-gray-200 rounded-2xl p-4">
                <p className="text-sm font-semibold text-gray-900">인증 게시물 #{String(v.verificationId).slice(0, 8)}</p>
                <p className="text-xs text-gray-500 mt-1">Day {v.day} · {formatDate(v.performedAt || v.createdAt)}</p>
                {v.imageUrl && (isVideoUrl(v.imageUrl) ? (
                  <video src={resolveMediaUrl(v.imageUrl)} controls className="w-full h-48 object-cover rounded-xl mt-3 bg-black" />
                ) : (
                  <img src={resolveMediaUrl(v.imageUrl)} alt="인증 이미지" className="w-full h-48 object-cover rounded-xl mt-3" />
                ))}
                {v.todayNote && <p className="text-sm text-gray-700 mt-3 whitespace-pre-wrap">{v.todayNote}</p>}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">📭</p>
            <p>{STATUS_LABEL[statusFilter]?.label} 제출물이 없습니다</p>
          </div>
        ))
      ) : (
        <div className="space-y-3">
          {submissions.map((sub) => {
            const badge = STATUS_LABEL[sub.status];
            const scopeBadge = SCOPE_LABEL[sub.quest?.questScope || 'leader'];
            const isReviewOpen = reviewing?.id === sub.submissionId;

            return (
              <div key={sub.submissionId} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <div className="p-4 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto] gap-3 items-center">
                  <button
                    type="button"
                    onClick={() => setSelectedSubmission(sub)}
                    className="text-left hover:bg-gray-50 rounded-lg p-2 -m-2"
                  >
                    <p className="font-semibold text-gray-900">{sub.quest?.title ?? `퀘스트 #${sub.questId?.slice(-6)}`}</p>
                    <p className="text-xs text-gray-500 mt-0.5">제출 ID: {sub.submissionId?.slice(0, 8)}...</p>
                    <p className="text-xs text-gray-500 mt-1">요약: {shortText(sub.content?.textContent || sub.content?.note)}</p>
                  </button>

                  <div>
                    <p className="text-xs text-gray-500">제출일시</p>
                    <p className="text-sm font-medium text-gray-800">{formatDate(sub.createdAt)}</p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500">퀘스트 구분</p>
                    <span className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${scopeBadge?.cls || 'bg-gray-100 text-gray-700'}`}>
                      {scopeBadge?.label || '미지정'}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500">사진/영상 여부</p>
                    <p className="text-sm text-gray-800">{mediaSummary(sub.content)}</p>
                    {badge && <span className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>{badge.label}</span>}
                  </div>

                  {sub.status === 'pending' ? (
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => { setReviewing({ id: sub.submissionId, action: 'approve' }); setReviewNote(''); }}
                        className="px-3 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700"
                      >
                        승인
                      </button>
                      <button
                        onClick={() => { setReviewing({ id: sub.submissionId, action: 'reject' }); setReviewNote(''); }}
                        className="px-3 py-2 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700"
                      >
                        거절
                      </button>
                    </div>
                  ) : <div />}
                </div>

                {isReviewOpen && (
                  <div className={`px-4 pb-4 pt-3 border-t ${reviewing?.action === 'approve' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    {reviewing?.action === 'reject' && (
                      <textarea
                        value={reviewNote}
                        onChange={e => setReviewNote(e.target.value)}
                        placeholder="거절 사유를 입력해주세요 (10자 이상)"
                        rows={3}
                        className="w-full px-3 py-2 border border-red-300 rounded-xl resize-none text-sm mb-2"
                      />
                    )}
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setReviewing(null)}
                        className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-300"
                      >
                        취소
                      </button>
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
                        className={`px-4 py-2 text-white text-sm font-semibold rounded-xl disabled:opacity-50 ${reviewing?.action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                      >
                        {reviewMutation.isPending ? '처리 중...' : '확인'}
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

      {selectedSubmission && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setSelectedSubmission(null)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">제출물 상세</h2>
              <button onClick={() => setSelectedSubmission(null)} className="text-gray-500 hover:text-gray-900">✕</button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-700"><span className="font-semibold">퀘스트:</span> {selectedSubmission.quest?.title ?? selectedSubmission.questId}</p>
              <p className="text-sm text-gray-700"><span className="font-semibold">제출일:</span> {formatDate(selectedSubmission.createdAt)}</p>
              <p className="text-sm text-gray-700"><span className="font-semibold">상태:</span> {STATUS_LABEL[selectedSubmission.status]?.label ?? selectedSubmission.status}</p>

              {selectedSubmission.content?.imageUrl && (
                <a href={resolveMediaUrl(selectedSubmission.content.imageUrl)} target="_blank" rel="noreferrer">
                  <img src={resolveMediaUrl(selectedSubmission.content.imageUrl)} alt="제출 이미지" className="w-full max-h-80 rounded-xl object-cover" />
                </a>
              )}
              {selectedSubmission.content?.videoUrl && (
                <video controls src={resolveMediaUrl(selectedSubmission.content.videoUrl)} className="w-full max-h-80 rounded-xl bg-black" />
              )}
              {selectedSubmission.content?.linkUrl && (
                <a href={selectedSubmission.content.linkUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline break-all block">
                  {selectedSubmission.content.linkUrl}
                </a>
              )}
              {selectedSubmission.content?.textContent && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedSubmission.content.textContent}</p>
                </div>
              )}
              {selectedSubmission.content?.note && (
                <p className="text-xs text-gray-500 italic">"{selectedSubmission.content.note}"</p>
              )}
            </div>

            {selectedSubmission.status === 'pending' && (
              <div className="p-5 border-t border-gray-100 space-y-3">
                {(() => {
                  const activeReview = reviewing?.id === selectedSubmission.submissionId ? reviewing : null;
                  return (
                    <>
                      {activeReview?.action === 'reject' && (
                        <textarea
                          value={reviewNote}
                          onChange={(e) => setReviewNote(e.target.value)}
                          placeholder="거절 사유를 입력해주세요 (10자 이상)"
                          rows={3}
                          className="w-full px-3 py-2 border border-red-300 rounded-xl resize-none text-sm"
                        />
                      )}
                      <div className="flex gap-2 justify-end">
                        {activeReview ? (
                          <>
                            <button
                              onClick={() => { setReviewing(null); setReviewNote(''); }}
                              className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-semibold rounded-xl"
                            >
                              취소
                            </button>
                            <button
                              onClick={() => {
                                if (activeReview.action === 'reject' && reviewNote.trim().length < 10) {
                                  alert('거절 사유를 10자 이상 입력해주세요');
                                  return;
                                }
                                reviewMutation.mutate({
                                  submissionId: activeReview.id,
                                  action: activeReview.action,
                                  note: reviewNote,
                                });
                                setSelectedSubmission(null);
                              }}
                              disabled={reviewMutation.isPending}
                              className={`px-4 py-2 text-white text-sm font-semibold rounded-xl disabled:opacity-50 ${activeReview.action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                            >
                              {reviewMutation.isPending ? '처리 중...' : '확인'}
                            </button>
                          </>
                          <>
                            <button
                              onClick={() => { setReviewing({ id: selectedSubmission.submissionId, action: 'approve' }); setReviewNote(''); }}
                              className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700"
                            >
                              승인
                            </button>
                            <button
                              onClick={() => { setReviewing({ id: selectedSubmission.submissionId, action: 'reject' }); setReviewNote(''); }}
                              className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700"
                            >
                              거절
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
