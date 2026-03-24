import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { characterApi, MythologyLine } from '../api/characterApi';

const MYTHOLOGY_OPTIONS: Array<{
  line: MythologyLine;
  name: string;
  emoji: string;
  desc: string;
  characters: string[];
  bg: string;
  accent: string;
}> = [
  {
    line: 'korean',
    name: '한국 신화',
    emoji: '🐻',
    desc: '단군 신화와 함께하는 변화의 이야기',
    characters: ['웅녀', '호랑이', '이무기', '도깨비', '봉황'],
    bg: 'from-green-50 to-emerald-50',
    accent: 'border-green-400 bg-green-400',
  },
  {
    line: 'greek',
    name: '그리스 신화',
    emoji: '⚡',
    desc: '지혜와 용기로 써내려가는 영웅의 서사',
    characters: ['아테나', '페넬로페', '프로메테우스'],
    bg: 'from-yellow-50 to-amber-50',
    accent: 'border-yellow-400 bg-yellow-400',
  },
  {
    line: 'norse',
    name: '북유럽 신화',
    emoji: '🌩️',
    desc: '거대한 세계수 아래 펼쳐지는 모험',
    characters: ['이그드라실', '발키리', '토르'],
    bg: 'from-blue-50 to-sky-50',
    accent: 'border-blue-400 bg-blue-400',
  },
];

export function MythologyOnboardingPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<MythologyLine | null>(null);

  const startMutation = useMutation({
    mutationFn: (line: MythologyLine) => characterApi.start(line),
    onSuccess: () => {
      navigate('/me', { replace: true });
    },
  });

  const handleConfirm = () => {
    if (!selected) return;
    startMutation.mutate(selected);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <div className="px-5 pt-14 pb-6 text-center">
        <div className="text-4xl mb-3">✨</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">나의 첫 세계관을 선택해요</h1>
        <p className="text-sm text-gray-500 leading-relaxed">
          챌린지를 완주하면 캐릭터를 조금씩 완성해요.<br />
          세계관의 캐릭터를 모두 완성하면 테마 스킨이 열려요.
        </p>
      </div>

      {/* 세계관 카드 */}
      <div className="flex-1 px-4 space-y-3 pb-8">
        {MYTHOLOGY_OPTIONS.map((opt) => (
          <button
            key={opt.line}
            onClick={() => setSelected(opt.line)}
            className={`w-full text-left rounded-2xl border-2 p-4 transition-all ${
              selected === opt.line
                ? 'border-gray-800 shadow-md'
                : 'border-gray-200 bg-white'
            } bg-gradient-to-br ${opt.bg}`}
          >
            <div className="flex items-start gap-3">
              <div className="text-3xl">{opt.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-gray-900 text-base">{opt.name}</span>
                  <span className="text-xs text-gray-500">{opt.characters.length}개 캐릭터</span>
                </div>
                <p className="text-sm text-gray-600 mb-2">{opt.desc}</p>
                <div className="flex flex-wrap gap-1">
                  {opt.characters.map((char) => (
                    <span
                      key={char}
                      className="text-xs px-2 py-0.5 rounded-full bg-white/70 text-gray-700 border border-gray-200"
                    >
                      {char}
                    </span>
                  ))}
                </div>
              </div>
              <div
                className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 transition-all ${
                  selected === opt.line
                    ? opt.accent
                    : 'border-gray-300'
                }`}
              />
            </div>
          </button>
        ))}
      </div>

      {/* 하단 버튼 */}
      <div className="px-4 pb-8 safe-area-bottom">
        <button
          onClick={handleConfirm}
          disabled={!selected || startMutation.isPending}
          className="w-full py-4 rounded-2xl bg-primary-500 text-white font-semibold text-base disabled:opacity-40 transition-opacity"
        >
          {startMutation.isPending ? '시작하는 중...' : '이 세계관으로 시작하기'}
        </button>
        {startMutation.isError && (
          <p className="text-center text-sm text-red-500 mt-2">
            오류가 발생했어요. 다시 시도해주세요.
          </p>
        )}
      </div>
    </div>
  );
}
