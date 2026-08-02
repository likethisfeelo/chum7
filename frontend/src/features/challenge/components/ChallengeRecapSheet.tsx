import { useNavigate } from 'react-router-dom';
import { BottomSheet } from '@/shared/components/BottomSheet';
import { resolveMediaUrl } from '@/shared/utils/mediaUrl';
import { useRecapStore, markRecapSeen } from '../recapStore';
import {
  getChallengeDisplayMeta,
  isFailedChallengeState,
  resolveChallengeBucket,
} from '../utils/challengeLifecycle';

// 챌린지 종료 리캡 — 완주/미달성/중도포기 모두에게 다정한 회고. App에 전역 마운트.
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2.5">
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className="text-base font-bold text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}

export function ChallengeRecapSheet() {
  const navigate = useNavigate();
  const { isOpen, recap, close } = useRecapStore();

  if (!recap) return null;

  const item = recap;
  const ch = item.challenge ?? {};

  const handleClose = () => {
    if (item.challengeId) markRecapSeen(String(item.challengeId));
    close();
  };

  const bucket = resolveChallengeBucket(item);
  const failed = isFailedChallengeState(item);
  const gaveUp = bucket === 'gave_up';
  const completed = !failed && !gaveUp && bucket === 'completed';

  const meta = getChallengeDisplayMeta(item);
  const duration = meta.durationDays;
  const completedDays = Number(item.completedDays ?? meta.participatedDays ?? 0);
  const identity: string = ch.identityKeyword || ch.badgeName || '';

  const headline = completed
    ? '🎉 완주했어요!'
    : gaveUp
      ? '잠시 멈췄지만, 괜찮아요'
      : '끝까지 함께해줘서 고마워요';

  const encourage = completed
    ? '스스로와의 약속을 지켜냈어요. 이 마음, 오래 기억해요.'
    : gaveUp
      ? '시작한 것만으로 이미 충분히 용감했어요.\n다음엔 더 가벼운 마음으로 다시 만나요.'
      : `${duration}일 중 ${completedDays}일, 충분히 잘했어요.\n완벽하지 않아도 괜찮아요. 여전히 포기하지 마요.`;

  const progress: any[] = Array.isArray(item.progress) ? item.progress : [];
  const dayDone = (d: number) => {
    const p = progress.find((x) => Number(x?.day) === d);
    return p && ['success', 'completed', 'remedy'].includes(String(p.status).toLowerCase());
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={handleClose} maxHeight="92vh">
      <div className="px-6 pb-8">
        {ch.coverImageUrl && (
          <div className="-mx-6 -mt-2 mb-4 h-36 overflow-hidden">
            <img
              src={resolveMediaUrl(ch.coverImageUrl)}
              alt=""
              className="w-full h-full object-cover object-bottom"
            />
          </div>
        )}

        <div className="text-center">
          <div className="text-5xl leading-none">{ch.badgeIcon || '🌱'}</div>
          {ch.title && <p className="mt-2 text-xs font-semibold text-gray-400">{ch.title}</p>}
          <h2 className="mt-1 text-2xl font-extrabold text-gray-900">{headline}</h2>
          {identity && (
            <p className="mt-3 text-lg font-bold text-primary-600">"나는 {identity}이다."</p>
          )}
          <p className="mt-3 text-sm text-gray-600 leading-relaxed whitespace-pre-line px-1">
            {encourage}
          </p>
        </div>

        {/* 나의 진행 캘린더 */}
        <div className="mt-6">
          <p className="text-xs font-semibold text-gray-500 mb-2">나의 {duration}일</p>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: duration }, (_, i) => i + 1).map((d) => {
              const done = dayDone(d);
              return (
                <div
                  key={d}
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${
                    done ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-300'
                  }`}
                >
                  {done ? '✓' : d}
                </div>
              );
            })}
          </div>
        </div>

        {/* 스탯 */}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Stat label="함께한 일수" value={`${completedDays}/${duration}일`} />
          <Stat label="최고 연속" value={`${item.consecutiveDays ?? 0}일`} />
          <Stat label="받은 응원" value={`✦ ${item.cheerScore ?? 0}`} />
          <Stat label="감사" value={`● ${item.thankScore ?? 0}`} />
        </div>

        {/* CTA */}
        <div className="mt-6 space-y-2">
          <button
            type="button"
            onClick={() => {
              handleClose();
              navigate('/challenges');
            }}
            className="w-full py-3.5 rounded-2xl bg-primary-600 text-white font-bold text-sm"
          >
            새로운 챌린지 찾기 →
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="w-full py-3 rounded-2xl bg-gray-100 text-gray-600 font-medium text-sm"
          >
            닫기
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
