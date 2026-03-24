import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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

function MythologyTab({
  line,
  status,
  completedTypes,
}: {
  line: MythologyLine;
  status: CharacterStatus;
  completedTypes: Set<string>;
}) {
  const meta = MYTHOLOGY_META[line];
  const progress = status.mythologyProgress?.[line];
  const isCompleted = progress?.isCompleted;

  return (
    <div className="space-y-2">
      {isCompleted && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-primary-50 border border-primary-200">
          <span className="text-lg">🎉</span>
          <span className="text-sm font-medium text-primary-700">세계관 완성! 테마 스킨이 해금됐어요.</span>
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
  const [activeTab, setActiveTab] = useState<MythologyLine>('korean');

  const { data: status, isLoading } = useQuery({
    queryKey: ['character', 'status'],
    queryFn: () => characterApi.getStatus(),
  });

  const { data: collection } = useQuery({
    queryKey: ['character', 'collection'],
    queryFn: () => characterApi.getCollection(),
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

  return (
    <div className="min-h-screen bg-bg-app">
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-4 pt-12 pb-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 text-gray-600"
        >
          ←
        </button>
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
            {status.activeCharacter.filledCount >= SLOTS_PER_CHARACTER && (
              <div className="mt-3 p-3 rounded-xl bg-primary-50 text-center">
                <p className="text-sm text-primary-700 font-medium">캐릭터 완성! 🎉</p>
                <p className="text-xs text-primary-600 mt-0.5">다음 캐릭터를 선택해요.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-center">
            <p className="text-sm text-gray-500">현재 진행 중인 캐릭터가 없어요.</p>
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
    </div>
  );
}
