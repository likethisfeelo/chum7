import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { characterApi, MythologyLine, CharacterStatus } from '../api/characterApi';

const MYTHOLOGY_META: Record<MythologyLine, { name: string; emoji: string; characters: string[] }> = {
  korean: { name: '한국 신화', emoji: '🐻', characters: ['웅녀', '호랑이', '이무기', '도깨비', '봉황'] },
  greek:  { name: '그리스 신화', emoji: '⚡', characters: ['아테나', '페넬로페', '프로메테우스'] },
  norse:  { name: '북유럽 신화', emoji: '🌩️', characters: ['이그드라실', '발키리', '토르'] },
};

const SLOTS_PER_CHARACTER = 7;

function SlotGrid({ filledCount }: { filledCount: number }) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {Array.from({ length: SLOTS_PER_CHARACTER }).map((_, i) => (
        <div
          key={i}
          className={`aspect-square rounded-lg border-2 transition-all ${
            i < filledCount
              ? 'border-primary-400 bg-primary-100'
              : 'border-gray-200 bg-gray-50'
          }`}
        >
          {i < filledCount && (
            <div className="w-full h-full flex items-center justify-center text-primary-500 text-xs font-bold">
              ✓
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** 다음 캐릭터 선택 모달 */
function NextCharacterModal({
  status,
  completedTypesByLine,
  onClose,
  onSelect,
  isPending,
}: {
  status: CharacterStatus;
  completedTypesByLine: Record<MythologyLine, Set<string>>;
  onClose: () => void;
  onSelect: (mythology: MythologyLine, characterType: string) => void;
  isPending: boolean;
}) {
  const [tab, setTab] = useState<MythologyLine>(status.activeMythology ?? 'korean');
  const completedMythologies = status.completedMythologies ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div className="bg-white w-full max-w-md rounded-t-2xl p-5 pb-8 safe-area-bottom">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">다음 캐릭터 선택</h3>
          <button onClick={onClose} className="text-gray-400 text-xl font-light">✕</button>
        </div>

        {/* 세계관 탭 */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-4">
          {(['korean', 'greek', 'norse'] as MythologyLine[]).map((line) => {
            const meta = MYTHOLOGY_META[line];
            const currentLineCompleted = completedMythologies.includes(line);
            // 현재 세계관이 아닌 경우 접근하려면 현재 세계관이 완성되어야 함
            const currentMythologyCompleted = status.activeMythology != null && completedMythologies.includes(status.activeMythology);
            const isAccessible = line === status.activeMythology || currentMythologyCompleted;
            return (
              <button
                key={line}
                onClick={() => isAccessible && setTab(line)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  tab === line
                    ? 'bg-white shadow-sm text-gray-900'
                    : isAccessible
                    ? 'text-gray-500'
                    : 'text-gray-300 cursor-not-allowed'
                }`}
              >
                {meta.emoji}{' '}
                {currentLineCompleted ? '✓' : ''}
                {meta.name.replace(' 신화', '')}
              </button>
            );
          })}
        </div>

        {/* 캐릭터 목록 */}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {MYTHOLOGY_META[tab].characters.map((char) => {
            const isDone = completedTypesByLine[tab]?.has(char);
            return (
              <button
                key={char}
                onClick={() => !isPending && onSelect(tab, char)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50 text-left hover:border-primary-300 hover:bg-primary-50 transition-all"
              >
                <span className="text-2xl">{isDone ? '✨' : '🔮'}</span>
                <div className="flex-1">
                  <div className="font-medium text-gray-900 text-sm">{char}</div>
                  {isDone && <div className="text-xs text-primary-600">이미 완성 · 재도전 가능</div>}
                </div>
                <span className="text-primary-400 text-lg">→</span>
              </button>
            );
          })}
        </div>

        {isPending && (
          <p className="text-center text-sm text-gray-400 mt-3">처리 중...</p>
        )}
      </div>
    </div>
  );
}

function MythologyTab({
  line,
  status,
  completedTypes,
  onThemeApply,
  isThemeApplying,
}: {
  line: MythologyLine;
  status: CharacterStatus;
  completedTypes: Set<string>;
  onThemeApply: (line: MythologyLine | null) => void;
  isThemeApplying: boolean;
}) {
  const meta = MYTHOLOGY_META[line];
  const progress = status.mythologyProgress?.[line];
  const isCompleted = progress?.isCompleted;
  const isCurrentTheme = (status.themeOverride ?? status.activeMythology) === line;

  return (
    <div className="space-y-2">
      {isCompleted && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-primary-50 border border-primary-200">
          <div className="flex items-center gap-2">
            <span className="text-lg">🎉</span>
            <span className="text-sm font-medium text-primary-700">세계관 완성! 테마 해금</span>
          </div>
          <button
            onClick={() => onThemeApply(isCurrentTheme ? null : line)}
            disabled={isThemeApplying}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${
              isCurrentTheme
                ? 'bg-primary-500 text-white'
                : 'border border-primary-400 text-primary-600 bg-white hover:bg-primary-50'
            }`}
          >
            {isCurrentTheme ? '✓ 적용 중' : '테마 적용'}
          </button>
        </div>
      )}
      {meta.characters.map((char) => {
        const isDone = completedTypes.has(char);
        const isActive =
          status.activeCharacter?.characterType === char &&
          status.activeCharacter?.mythologyLine === line;
        return (
          <div
            key={char}
            className={`flex items-center gap-3 p-3 rounded-xl border ${
              isDone
                ? 'border-primary-200 bg-primary-50'
                : isActive
                ? 'border-gray-300 bg-white shadow-sm'
                : 'border-gray-100 bg-gray-50'
            }`}
          >
            <span className="text-2xl">{isDone ? '✨' : isActive ? '⚡' : '🔮'}</span>
            <div className="flex-1">
              <div className="font-medium text-gray-900 text-sm">{char}</div>
              {isActive && status.activeCharacter && (
                <div className="text-xs text-gray-500 mt-0.5">
                  진행 중 {status.activeCharacter.filledCount}/{SLOTS_PER_CHARACTER}
                </div>
              )}
            </div>
            {isDone && <span className="text-xs text-primary-600 font-medium">완성</span>}
            {!isDone && !isActive && <span className="text-xs text-gray-400">미시작</span>}
          </div>
        );
      })}
    </div>
  );
}

export function CharacterViewerPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<MythologyLine>('korean');
  const [showNextModal, setShowNextModal] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ['character', 'status'],
    queryFn: () => characterApi.getStatus(),
  });

  const { data: collection } = useQuery({
    queryKey: ['character', 'collection'],
    queryFn: () => characterApi.getCollection(),
  });

  const nextMutation = useMutation({
    mutationFn: ({ mythology, characterType }: { mythology: MythologyLine; characterType: string }) =>
      characterApi.next({ mythologyLine: mythology, characterType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['character'] });
      setShowNextModal(false);
    },
  });

  const themeMutation = useMutation({
    mutationFn: (mythology: MythologyLine | null) => characterApi.setTheme(mythology),
    onSuccess: (_, mythology) => {
      queryClient.invalidateQueries({ queryKey: ['character', 'status'] });
      document.body.setAttribute('data-theme', mythology ?? '');
    },
  });

  if (isLoading || !status) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">불러오는 중...</div>
      </div>
    );
  }

  const completedTypesByLine: Record<MythologyLine, Set<string>> = {
    korean: new Set(),
    greek: new Set(),
    norse: new Set(),
  };
  for (const c of collection?.completed ?? []) {
    completedTypesByLine[c.mythologyLine]?.add(c.characterType);
  }

  const isCharacterComplete =
    status.activeCharacter?.filledCount != null &&
    status.activeCharacter.filledCount >= SLOTS_PER_CHARACTER;

  return (
    <div className="min-h-screen bg-bg-app">
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-4 pt-12 pb-4">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-gray-600">←</button>
        <h1 className="text-xl font-bold text-gray-900">캐릭터</h1>
      </div>

      <div className="px-4 space-y-5 pb-20">
        {/* 현재 캐릭터 */}
        {status.activeCharacter ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-xs text-gray-400 uppercase tracking-wide">진행 중</span>
                <h2 className="text-lg font-bold text-gray-900">{status.activeCharacter.characterType}</h2>
                <span className="text-xs text-gray-500">
                  {MYTHOLOGY_META[status.activeCharacter.mythologyLine]?.emoji}{' '}
                  {MYTHOLOGY_META[status.activeCharacter.mythologyLine]?.name}
                </span>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-primary-500">
                  {status.activeCharacter.filledCount}
                </div>
                <div className="text-xs text-gray-400">/ {SLOTS_PER_CHARACTER}</div>
              </div>
            </div>
            <SlotGrid filledCount={status.activeCharacter.filledCount} />
            {isCharacterComplete && (
              <div className="mt-3 p-3 rounded-xl bg-primary-50 text-center">
                <p className="text-sm text-primary-700 font-medium">캐릭터 완성! 🎉</p>
                <button
                  onClick={() => setShowNextModal(true)}
                  className="mt-2 px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-full"
                >
                  다음 캐릭터 선택하기
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <p className="text-sm text-gray-500 text-center">현재 진행 중인 캐릭터가 없어요.</p>
            <button
              onClick={() => setShowNextModal(true)}
              className="mt-3 w-full py-2.5 bg-primary-500 text-white text-sm font-medium rounded-xl"
            >
              캐릭터 선택하기
            </button>
          </div>
        )}

        {/* 세계관 진행 현황 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <h3 className="font-bold text-gray-900 mb-3">세계관 진행 현황</h3>

          {/* 탭 */}
          <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-xl">
            {(['korean', 'greek', 'norse'] as MythologyLine[]).map((line) => {
              const meta = MYTHOLOGY_META[line];
              const prog = status.mythologyProgress?.[line];
              return (
                <button
                  key={line}
                  onClick={() => setActiveTab(line)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeTab === line
                      ? 'bg-white shadow-sm text-gray-900'
                      : 'text-gray-500'
                  }`}
                >
                  {meta.emoji} {meta.name.replace(' 신화', '')}
                  {prog && (
                    <span className={`ml-1 text-xs ${prog.isCompleted ? 'text-primary-500' : 'text-gray-400'}`}>
                      {prog.completed}/{prog.total}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <MythologyTab
            line={activeTab}
            status={status}
            completedTypes={completedTypesByLine[activeTab]}
            onThemeApply={(line) => themeMutation.mutate(line)}
            isThemeApplying={themeMutation.isPending}
          />
        </div>

        {/* 완성 컬렉션 */}
        {(collection?.completed.length ?? 0) > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <h3 className="font-bold text-gray-900 mb-3">완성 컬렉션</h3>
            <div className="grid grid-cols-2 gap-2">
              {collection!.completed.map((c) => (
                <div
                  key={c.characterId}
                  className="flex items-center gap-2 p-3 rounded-xl border border-gray-100 bg-gray-50"
                >
                  <span className="text-xl">✨</span>
                  <div>
                    <div className="text-sm font-medium text-gray-900">{c.characterType}</div>
                    <div className="text-xs text-gray-400">
                      {MYTHOLOGY_META[c.mythologyLine]?.emoji} × {c.count}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 다음 캐릭터 선택 모달 */}
      {showNextModal && (
        <NextCharacterModal
          status={status}
          completedTypesByLine={completedTypesByLine}
          onClose={() => setShowNextModal(false)}
          onSelect={(mythology, characterType) => nextMutation.mutate({ mythology, characterType })}
          isPending={nextMutation.isPending}
        />
      )}
    </div>
  );
}
