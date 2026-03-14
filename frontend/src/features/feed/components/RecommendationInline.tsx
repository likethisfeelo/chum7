import { Link } from 'react-router-dom';
import type { Recommendation } from '@/features/feed/hooks/usePlazaReactions';

interface Props {
  postId: string;
  recommendations: Recommendation[];
  onDismiss: (postId: string, item: Recommendation) => void;
}

export function RecommendationInline({ postId, recommendations, onDismiss }: Props) {
  if (recommendations.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-primary-200 bg-primary-50 p-3">
      <p className="text-xs font-semibold text-primary-700 mb-2">관심 가질 만한 챌린지</p>
      <div className="space-y-2">
        {recommendations.map((item) => (
          <div key={item.id} className="rounded-lg border border-primary-100 bg-white px-3 py-2">
            <p className="text-sm font-semibold text-gray-900">{item.title}</p>
            <p className="text-xs text-gray-600 mt-0.5">{item.reason}</p>
            <div className="mt-2 flex items-center gap-3">
              {item.challengeId && (
                <Link to={`/challenges/${item.challengeId}`} className="text-xs text-primary-700 underline">
                  챌린지 보기
                </Link>
              )}
              <button
                type="button"
                className="text-xs text-gray-500 underline"
                onClick={() => { void onDismiss(postId, item); }}
              >
                닫기
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
