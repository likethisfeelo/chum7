import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import {
  BoardBlocksViewer,
  extractBoardPreviewText,
  hasBoardContent,
} from './BoardBlocksViewer';

/**
 * 챌린지 가이드 아코디언 (PC·모바일 동일).
 * — 헤더 클릭 시 별도 페이지 이동 대신 아래로 인라인 확장(아코디언)해 보드 블록 전체를 보여준다.
 * — 📌 고정 토글: localStorage(boardGuide:pinned:<challengeId>)에 저장, 재방문 시 펼침 복원.
 * — 콘텐츠 소스: /s/board (본 보드) → 비어 있으면 /public/board/:id/preview (프리뷰 보드) 폴백.
 * — 기존 전체보기 페이지(/challenge-board/:id)는 확장 영역 안의 보조 링크로 유지.
 */

const pinStorageKey = (challengeId: string) => `boardGuide:pinned:${challengeId}`;

const readPinned = (challengeId: string): boolean => {
  try {
    return localStorage.getItem(pinStorageKey(challengeId)) === '1';
  } catch {
    return false;
  }
};

export const BoardGuideSection = ({
  challengeId,
  openSignal,
}: {
  challengeId: string;
  /** 값이 바뀌면(0→1→2…) 가이드를 강제로 펼친다 — 헤더 확성기 클릭 연동 */
  openSignal?: number;
}) => {
  const navigate = useNavigate();
  const [pinned, setPinned] = useState(() => readPinned(challengeId));
  const [open, setOpen] = useState(() => readPinned(challengeId));
  // 접힘 애니메이션을 위해 한 번 펼친 콘텐츠는 마운트 유지
  const [mounted, setMounted] = useState(() => readPinned(challengeId));

  const expanded = open || pinned;

  useEffect(() => {
    if (expanded) setMounted(true);
  }, [expanded]);

  // 외부 신호로 강제 펼침 (초기 0은 무시)
  useEffect(() => {
    if (openSignal && openSignal > 0) {
      setOpen(true);
      setMounted(true);
    }
  }, [openSignal]);

  // 챌린지 전환 시 고정 상태 재복원
  useEffect(() => {
    const restored = readPinned(challengeId);
    setPinned(restored);
    setOpen(restored);
    setMounted(restored);
  }, [challengeId]);

  const { data: boardData, isLoading } = useQuery({
    queryKey: ['challenge-board', challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const response = await apiClient.get(`/s/board/${challengeId}`);
      return response.data;
    },
  });

  const boardBlocks: any[] = boardData?.blocks ?? [];
  const boardHasContent = hasBoardContent(boardBlocks);

  // 본 보드가 비어 있으면 퍼블릭 프리뷰 보드로 폴백 (system-prefill 자동 생성분은 제외)
  const { data: previewData } = useQuery({
    queryKey: ['challenge-board-preview', challengeId],
    enabled: Boolean(challengeId) && Boolean(boardData) && !boardHasContent,
    queryFn: async () => {
      const response = await apiClient.get(`/public/board/${challengeId}/preview`);
      return response.data;
    },
  });

  const blocks: any[] = useMemo(() => {
    if (boardHasContent) return boardBlocks;
    if (previewData && previewData.updatedBy !== 'system-prefill' && hasBoardContent(previewData.blocks)) {
      return previewData.blocks;
    }
    return [];
  }, [boardHasContent, boardBlocks, previewData]);

  const hasContent = blocks.length > 0;
  const realText = isLoading ? null : extractBoardPreviewText(blocks);
  const imageBlocks = useMemo(
    () => (blocks as any[]).filter((b) => b?.type === 'image' && b?.url),
    [blocks],
  );

  // 접힌 프리뷰 텍스트가 3줄을 넘어 잘렸는지 감지 → '전체보기에서 확인하세요' 노출
  const textRef = useRef<HTMLParagraphElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  useEffect(() => {
    const el = textRef.current;
    setIsTruncated(el ? el.scrollHeight > el.clientHeight + 1 : false);
  }, [realText, expanded]);

  const togglePinned = () => {
    setPinned((prev) => {
      const next = !prev;
      try {
        if (next) localStorage.setItem(pinStorageKey(challengeId), '1');
        else localStorage.removeItem(pinStorageKey(challengeId));
      } catch {
        // localStorage 사용 불가 환경 — 세션 내 상태만 유지
      }
      if (next) setOpen(true);
      return next;
    });
  };

  const handleHeaderClick = () => {
    if (pinned) return; // 고정 중에는 항상 펼침 유지
    setOpen((prev) => !prev);
  };

  return (
    <section className="glass-card rounded-2xl overflow-hidden">
      {/* 헤더 — 클릭 시 인라인 확장 토글 */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleHeaderClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleHeaderClick();
          }
        }}
        aria-expanded={expanded}
        className="w-full text-left p-5 cursor-pointer hover:bg-white/40 transition-colors"
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="font-bold text-gray-900">챌린지 가이드</h3>
          <div className="flex items-center gap-1.5">
            {expanded && (
              <button
                type="button"
                title={pinned ? '고정 해제' : '항상 펼쳐두기'}
                onClick={(e) => {
                  e.stopPropagation();
                  togglePinned();
                }}
                className={[
                  'flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold transition-colors select-none',
                  pinned
                    ? 'bg-primary-100 text-primary-700 border border-primary-200'
                    : 'bg-white/60 text-gray-500 border border-gray-200 hover:text-primary-600',
                ].join(' ')}
              >
                <span aria-hidden>📌</span>
                {pinned ? '고정됨' : '고정'}
              </button>
            )}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className={`text-gray-400 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>
        {/* 접힌 상태 요약 — 텍스트 3줄(+전체보기 안내) · 이미지 4열 축소 썸네일(클릭 시 전체보기) */}
        {!expanded &&
          (isLoading ? (
            <p className="text-sm text-gray-400">안내를 불러오는 중...</p>
          ) : !hasContent ? (
            <p className="text-sm text-gray-500">아직 챌린지 가이드가 등록되지 않았습니다.</p>
          ) : (
            <div>
              {realText && (
                <p ref={textRef} className="text-sm text-gray-700 line-clamp-3">
                  {realText}
                </p>
              )}
              {(isTruncated || imageBlocks.length > 0) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/challenge-board/${challengeId}`);
                  }}
                  className="mt-1 text-xs font-semibold text-primary-600 hover:text-primary-800 transition-colors"
                >
                  전체보기에서 확인하세요 →
                </button>
              )}
              {imageBlocks.length > 0 && (
                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  {imageBlocks.slice(0, 4).map((b: any, i: number) => (
                    <button
                      key={b.id ?? i}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/challenge-board/${challengeId}`);
                      }}
                      className="relative aspect-square rounded-lg overflow-hidden bg-gray-100"
                    >
                      <img src={b.url} alt="" className="w-full h-full object-cover" />
                      {i === 3 && imageBlocks.length > 4 && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-sm font-bold">
                          +{imageBlocks.length - 4}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
      </div>

      {/* 확장 영역 — grid-rows 트랜지션으로 부드러운 높이 애니메이션 */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden min-h-0">
          {mounted && (
            <div className="px-5 pb-5 border-t border-white/50 pt-4">
              {isLoading ? (
                <p className="text-sm text-gray-400 py-4 text-center">안내를 불러오는 중...</p>
              ) : hasContent ? (
                <BoardBlocksViewer blocks={blocks} />
              ) : (
                <p className="text-sm text-gray-400 py-4 text-center">
                  아직 챌린지 가이드가 등록되지 않았습니다.
                </p>
              )}
              <div className="mt-3 pt-3 border-t border-white/50 flex justify-end">
                <button
                  type="button"
                  onClick={() => navigate(`/challenge-board/${challengeId}`)}
                  className="text-xs font-semibold text-primary-600 hover:text-primary-800 transition-colors"
                >
                  가이드 전체 보기 →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
