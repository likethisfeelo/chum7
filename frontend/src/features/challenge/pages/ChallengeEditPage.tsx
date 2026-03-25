import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { FiArrowLeft } from 'react-icons/fi';
import { Loading } from '@/shared/components/Loading';
import toast from 'react-hot-toast';

function toLocalDateTimeInputValue(isoStr?: string): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localToISO(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export const ChallengeEditPage = () => {
  const { challengeId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: challenge, isLoading } = useQuery({
    queryKey: ['challenge', challengeId],
    queryFn: async () => {
      const response = await apiClient.get(`/challenges/${challengeId}`);
      return response.data.data;
    },
  });

  const [form, setForm] = useState<{
    title: string;
    description: string;
    targetTime: string;
    badgeIcon: string;
    badgeName: string;
    identityKeyword: string;
    recruitingEndAt: string;
    challengeStartAt: string;
    maxParticipants: string;
  } | null>(null);

  // challenge 로드 후 한 번만 초기화
  if (challenge && form === null) {
    setForm({
      title: challenge.title || '',
      description: challenge.description || '',
      targetTime: challenge.targetTime || '',
      badgeIcon: challenge.badgeIcon || '',
      badgeName: challenge.badgeName || '',
      identityKeyword: challenge.identityKeyword || '',
      recruitingEndAt: toLocalDateTimeInputValue(challenge.recruitingEndAt),
      challengeStartAt: toLocalDateTimeInputValue(challenge.challengeStartAt),
      maxParticipants: challenge.maxParticipants != null ? String(challenge.maxParticipants) : '',
    });
  }

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const payload: Record<string, unknown> = {};
      if (form.title.trim()) payload.title = form.title.trim();
      if (form.description.trim()) payload.description = form.description.trim();
      if (form.targetTime) payload.targetTime = form.targetTime;
      if (form.badgeIcon) payload.badgeIcon = form.badgeIcon;
      if (form.badgeName.trim()) payload.badgeName = form.badgeName.trim();
      if (form.identityKeyword.trim()) payload.identityKeyword = form.identityKeyword.trim();
      if (form.recruitingEndAt) payload.recruitingEndAt = localToISO(form.recruitingEndAt);
      if (form.challengeStartAt) payload.challengeStartAt = localToISO(form.challengeStartAt);
      payload.maxParticipants = form.maxParticipants ? parseInt(form.maxParticipants, 10) : null;
      return apiClient.patch(`/challenges/${challengeId}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['my-created-challenges'] });
      toast.success('챌린지가 수정됐어요 ✅');
      navigate(`/challenges/${challengeId}`, { replace: true });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || '수정에 실패했습니다');
    },
  });

  if (isLoading || form === null) return <Loading fullScreen />;
  if (!challenge) return <div className="p-6 text-center text-gray-500">챌린지를 찾을 수 없습니다</div>;

  const lifecycle = String(challenge.lifecycle || '');
  const isEditable = lifecycle === 'draft' || lifecycle === 'recruiting';

  if (!isEditable) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-6">
          <p className="text-gray-500 mb-4">{lifecycle} 상태에서는 수정할 수 없어요</p>
          <button onClick={() => navigate(-1)} className="text-primary-600 text-sm underline">돌아가기</button>
        </div>
      </div>
    );
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => f ? { ...f, [key]: e.target.value } : f);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-4 flex items-center gap-3 z-10">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-bold text-gray-900">챌린지 수정</h1>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">챌린지 제목 <span className="text-red-500">*</span></label>
          <input
            value={form.title}
            onChange={set('title')}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            placeholder="제목을 입력하세요"
            maxLength={60}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">설명 <span className="text-red-500">*</span></label>
          <textarea
            value={form.description}
            onChange={set('description')}
            rows={5}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            placeholder="챌린지를 소개해주세요"
            maxLength={2000}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">목표 시간 (HH:MM)</label>
          <input
            value={form.targetTime}
            onChange={set('targetTime')}
            placeholder="07:00"
            pattern="\d{2}:\d{2}"
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">뱃지 아이콘</label>
            <input
              value={form.badgeIcon}
              onChange={set('badgeIcon')}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm text-center text-2xl"
              maxLength={4}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">뱃지 이름</label>
            <input
              value={form.badgeName}
              onChange={set('badgeName')}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              maxLength={30}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">정체성 키워드</label>
          <input
            value={form.identityKeyword}
            onChange={set('identityKeyword')}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            placeholder="나는 ___ 사람"
            maxLength={30}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">모집 마감일</label>
          <input
            type="datetime-local"
            value={form.recruitingEndAt}
            onChange={set('recruitingEndAt')}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">챌린지 시작일</label>
          <input
            type="datetime-local"
            value={form.challengeStartAt}
            onChange={set('challengeStartAt')}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">최대 참여 인원 (비워두면 무제한)</label>
          <input
            type="number"
            min={1}
            max={1000}
            value={form.maxParticipants}
            onChange={set('maxParticipants')}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            placeholder="무제한"
          />
        </div>

        <button
          onClick={() => updateMutation.mutate()}
          disabled={updateMutation.isPending || !form.title.trim() || form.description.trim().length < 10}
          className="w-full py-4 rounded-2xl bg-primary-500 text-white font-semibold text-base disabled:opacity-40 hover:bg-primary-600 transition-colors"
        >
          {updateMutation.isPending ? '저장 중...' : '저장하기'}
        </button>
      </div>
    </div>
  );
};
