import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { FiArrowLeft } from 'react-icons/fi';
import { Loading } from '@/shared/components/Loading';
import { EmptyState } from '@/shared/components/EmptyState';
import toast from 'react-hot-toast';

export const MyRecordsPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedExtraIds, setSelectedExtraIds] = useState<string[]>([]);
  const [failedPublishIds, setFailedPublishIds] = useState<string[]>([]);
  const [isBulkPublishing, setIsBulkPublishing] = useState(false);
  const [pendingVisibilityId, setPendingVisibilityId] = useState<string | null>(null);

  const { data: myExtraFeedPage, isFetching: isFetchingExtra } = useQuery({
    queryKey: ['verifications', 'mine-extra'],
    queryFn: async () => {
      const response = await apiClient.get('/verifications?mine=true&isExtra=true&limit=10');
      return {
        verifications: response.data.data.verifications || [],
        nextToken: response.data.data.nextToken || null,
      };
    },
  });

  const [extraItems, setExtraItems] = useState<any[]>([]);
  const [extraNextToken, setExtraNextToken] = useState<string | null>(null);
  const initialLoadDone = extraItems.length > 0;

  useEffect(() => {
    if (!myExtraFeedPage) return;
    if (!initialLoadDone) {
      // 첫 로드: 전체 교체
      setExtraItems(myExtraFeedPage.verifications);
      setExtraNextToken(myExtraFeedPage.nextToken);
    } else {
      // 재조회(visibility 변경 후): 기존 아이템의 isPersonalOnly 상태만 업데이트 (페이지네이션 유지)
      const updatedMap = new Map(myExtraFeedPage.verifications.map((v: any) => [v.verificationId, v]));
      setExtraItems((prev) => prev.map((item) => updatedMap.get(item.verificationId) ?? item));
    }
  }, [myExtraFeedPage]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const privateIds = extraItems.filter((item: any) => item.isPersonalOnly).map((item: any) => item.verificationId);
    setSelectedExtraIds((prev) => prev.filter((id) => privateIds.includes(id)));
    setFailedPublishIds((prev) => prev.filter((id) => privateIds.includes(id)));
  }, [extraItems]);

  const privateExtraItems = useMemo(
    () => extraItems.filter((item: any) => item.isPersonalOnly),
    [extraItems],
  );

  const selectedPrivateCount = useMemo(
    () => selectedExtraIds.filter((id) => privateExtraItems.some((item: any) => item.verificationId === id)).length,
    [selectedExtraIds, privateExtraItems],
  );

  const loadMoreMutation = useMutation({
    mutationFn: async () => {
      if (!extraNextToken) return null;
      const response = await apiClient.get(`/verifications?mine=true&isExtra=true&limit=10&nextToken=${encodeURIComponent(extraNextToken)}`);
      return {
        verifications: response.data.data.verifications || [],
        nextToken: response.data.data.nextToken || null,
      };
    },
    onSuccess: (data) => {
      if (!data) return;
      setExtraItems((prev) => [...prev, ...data.verifications]);
      setExtraNextToken(data.nextToken);
    },
    onError: () => {
      toast.error('추가 기록을 더 불러오지 못했어요');
    }
  });

  const visibilityMutation = useMutation({
    mutationFn: async (verificationId: string) => {
      setPendingVisibilityId(verificationId);
      await apiClient.patch(`/verifications/${verificationId}/visibility`, { isPersonalOnly: false });
      return verificationId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verifications', 'mine-extra'] });
      queryClient.invalidateQueries({ queryKey: ['verifications', 'public'] });
      toast.success('추가 기록을 공개 피드로 전환했어요 🌍');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || '공개 전환에 실패했습니다');
    },
    onSettled: () => {
      setPendingVisibilityId(null);
    }
  });

  const publishBatch = async (targetIds: string[]) => {
    setIsBulkPublishing(true);
    const results = await Promise.allSettled(
      targetIds.map((verificationId) => apiClient.patch(`/verifications/${verificationId}/visibility`, { isPersonalOnly: false })),
    );

    const successIds = results
      .map((result, idx) => (result.status === 'fulfilled' ? targetIds[idx] : null))
      .filter((id): id is string => Boolean(id));

    const failIds = results
      .map((result, idx) => (result.status === 'rejected' ? targetIds[idx] : null))
      .filter((id): id is string => Boolean(id));

    queryClient.invalidateQueries({ queryKey: ['verifications', 'mine-extra'] });
    queryClient.invalidateQueries({ queryKey: ['verifications', 'public'] });
    setFailedPublishIds(failIds);
    setSelectedExtraIds((prev) => prev.filter((id) => failIds.includes(id)));
    setIsBulkPublishing(false);

    return { successCount: successIds.length, failCount: failIds.length };
  };

  const handlePublishAll = async () => {
    const pendingItems = extraItems.filter((item: any) => item.isPersonalOnly);
    if (pendingItems.length === 0) {
      toast('이미 모든 추가 기록이 공개 상태예요.', { icon: 'ℹ️' });
      return;
    }
    const confirmed = window.confirm(`비공개 추가 기록 ${pendingItems.length}건을 모두 공개할까요?`);
    if (!confirmed) return;
    const { successCount, failCount } = await publishBatch(pendingItems.map((item: any) => item.verificationId));
    if (failCount === 0) {
      toast.success(`${successCount}건의 추가 기록을 공개 전환했어요 🌍`);
    } else {
      toast.error(`${successCount}건 성공, ${failCount}건 실패. 실패 항목을 선택해 재시도할 수 있어요.`);
    }
  };

  const handlePublishSelected = async () => {
    const targetIds = selectedExtraIds.filter((id) => privateExtraItems.some((item: any) => item.verificationId === id));
    if (targetIds.length === 0) {
      toast('공개할 항목을 먼저 선택해주세요.', { icon: 'ℹ️' });
      return;
    }
    const confirmed = window.confirm(`선택한 추가 기록 ${targetIds.length}건을 공개할까요?`);
    if (!confirmed) return;
    const { successCount, failCount } = await publishBatch(targetIds);
    if (failCount === 0) {
      toast.success(`선택한 ${successCount}건을 공개 전환했어요 🌍`);
    } else {
      toast.error(`${successCount}건 성공, ${failCount}건 실패. 실패 항목만 남겨두었습니다.`);
    }
  };

  const handleRetryFailed = async () => {
    if (failedPublishIds.length === 0) {
      toast('재시도할 실패 항목이 없어요.', { icon: 'ℹ️' });
      return;
    }
    const { successCount, failCount } = await publishBatch(failedPublishIds);
    if (failCount === 0) {
      toast.success(`실패 항목 ${successCount}건 재시도에 성공했어요 ✅`);
    } else {
      toast.error(`재시도 결과: ${successCount}건 성공, ${failCount}건 실패`);
    }
  };

  return (
    <div className="min-h-screen pb-20">
      <div className="sticky top-0 glass-header px-6 py-4 flex items-center gap-4 z-10">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-gray-900">내 추가기록</h1>
      </div>

      <div className="p-6 space-y-4">
        {isFetchingExtra && extraItems.length === 0 ? (
          <Loading />
        ) : extraItems.length === 0 ? (
          <EmptyState icon="📝" title="추가 기록이 없어요" description="인증 시 추가 기록을 남기면 여기에 표시돼요" />
        ) : (
          <>
            <div className="bg-white rounded-2xl p-4 border border-gray-200 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">추가 인증 기록</p>
                  <p className="text-xs text-gray-500 mt-0.5">추가 인증은 기본적으로 나만 보기로 저장되며, 여기서 공개 전환할 수 있어요.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePublishSelected}
                    disabled={isBulkPublishing || selectedPrivateCount === 0}
                    className="px-3 py-1.5 text-xs rounded-lg border border-primary-200 text-primary-700 bg-white disabled:opacity-50"
                  >
                    선택 공개({selectedPrivateCount})
                  </button>
                  <button
                    type="button"
                    onClick={handlePublishAll}
                    disabled={isBulkPublishing || privateExtraItems.length === 0}
                    className="px-3 py-1.5 text-xs rounded-lg border border-primary-200 text-primary-700 bg-primary-50 disabled:opacity-50"
                  >
                    {isBulkPublishing ? '전환 중...' : '전체 공개'}
                  </button>
                </div>
              </div>

              {failedPublishIds.length > 0 && (
                <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                  <p className="text-xs text-red-700">공개 전환 실패 {failedPublishIds.length}건이 있어요.</p>
                  <button
                    type="button"
                    onClick={handleRetryFailed}
                    disabled={isBulkPublishing}
                    className="px-2.5 py-1 text-xs rounded-md border border-red-300 text-red-700 bg-white disabled:opacity-50"
                  >
                    실패 항목 재시도
                  </button>
                </div>
              )}

              <div className="space-y-2">
                {extraItems.map((item: any) => (
                  <div key={item.verificationId} className="border border-gray-100 rounded-xl p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-start gap-2">
                      {item.isPersonalOnly ? (
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selectedExtraIds.includes(item.verificationId)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedExtraIds((prev) => Array.from(new Set([...prev, item.verificationId])));
                            } else {
                              setSelectedExtraIds((prev) => prev.filter((id) => id !== item.verificationId));
                            }
                          }}
                        />
                      ) : (
                        <span className="mt-1 text-[10px] text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">공개</span>
                      )}
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Day {item.day} · 📝 추가 기록</p>
                        <p className="text-xs text-gray-500 truncate">{item.todayNote || '소감 없음'}</p>
                      </div>
                    </div>

                    {item.isPersonalOnly ? (
                      <button
                        type="button"
                        onClick={() => visibilityMutation.mutate(item.verificationId)}
                        className="px-3 py-1.5 text-xs rounded-lg bg-primary-600 text-white disabled:opacity-50"
                        disabled={visibilityMutation.isPending && pendingVisibilityId === item.verificationId}
                      >
                        {visibilityMutation.isPending && pendingVisibilityId === item.verificationId ? '전환 중...' : '피드 공개'}
                      </button>
                    ) : (
                      <span className="px-3 py-1.5 text-xs rounded-lg bg-green-50 text-green-700 border border-green-200">공개됨</span>
                    )}
                  </div>
                ))}
              </div>

              {extraNextToken && (
                <button
                  type="button"
                  onClick={() => loadMoreMutation.mutate()}
                  disabled={loadMoreMutation.isPending || isFetchingExtra}
                  className="w-full py-2 text-sm rounded-xl border border-gray-200 text-gray-700 disabled:opacity-50"
                >
                  {loadMoreMutation.isPending ? '불러오는 중...' : '추가 기록 더보기'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
