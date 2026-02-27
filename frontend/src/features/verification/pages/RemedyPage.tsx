import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiRefreshCw } from 'react-icons/fi';
import { Button } from '@/shared/components/Button';
import { Textarea } from '@/shared/components/Textarea';
import toast from 'react-hot-toast';

export const RemedyPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userChallengeId = searchParams.get('userChallengeId');
  const originalDay = searchParams.get('day');
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    reflectionNote: '',
    todayNote: '',
    tomorrowPromise: '',
    practiceAt: new Date().toISOString().slice(0, 16),
  });

  const remedyMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiClient.post('/verifications/remedy', data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['my-challenges'] });
      toast.success(data.message || '보완 인증 완료! 💪');
      navigate('/me');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '보완 인증에 실패했습니다');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.reflectionNote.length < 10) {
      toast.error('회고를 10자 이상 작성해주세요');
      return;
    }

    remedyMutation.mutate({
      userChallengeId,
      originalDay: parseInt(originalDay || '0'),
      reflectionNote: formData.reflectionNote,
      todayNote: formData.todayNote,
      tomorrowPromise: formData.tomorrowPromise,
      practiceAt: new Date(formData.practiceAt).toISOString(),
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 z-10">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold">Day 6 보완하기</h1>
      </div>

      <div className="p-6">
        {/* 안내 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl p-6 border border-purple-200 mb-6"
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="w-12 h-12 bg-purple-200 rounded-full flex items-center justify-center">
              <FiRefreshCw className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h3 className="font-bold text-purple-900 mb-1">Day 6 보완 기회</h3>
              <p className="text-sm text-purple-700">
                실패는 끝이 아니라 배움의 기회입니다
              </p>
            </div>
          </div>
          <div className="space-y-2 text-sm text-purple-700">
            <p>✅ Day {originalDay}을 다시 실천하세요</p>
            <p>✅ 기본 점수의 70% (7점)를 받아요</p>
            <p>✅ 보너스 응원권 1장을 받아요</p>
          </div>
        </motion.div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Textarea
            label="회고: 왜 실패했나요? 📝"
            value={formData.reflectionNote}
            onChange={(e) => setFormData({ ...formData, reflectionNote: e.target.value })}
            placeholder="솔직하게 되돌아보세요. 어떤 이유로 인증을 놓쳤나요?"
            rows={4}
            required
            helperText="최소 10자 이상 작성해주세요"
          />

          <Textarea
            label="오늘의 실천 ✨"
            value={formData.todayNote}
            onChange={(e) => setFormData({ ...formData, todayNote: e.target.value })}
            placeholder="오늘은 어떻게 다시 실천했나요?"
            rows={4}
            required
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">실천 시각 (내 로컬 시간) ⏰</label>
            <input
              type="datetime-local"
              value={formData.practiceAt}
              onChange={(e) => setFormData({ ...formData, practiceAt: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            />
            <p className="text-xs text-gray-500 mt-1">현재 시각 기준 4시간 이내만 제출할 수 있어요.</p>
          </div>

          <Textarea
            label="다짐 (선택)"
            value={formData.tomorrowPromise}
            onChange={(e) => setFormData({ ...formData, tomorrowPromise: e.target.value })}
            placeholder="앞으로 어떻게 할 건가요?"
            rows={3}
          />

          <Button
            type="submit"
            fullWidth
            size="lg"
            loading={remedyMutation.isPending}
          >
            다시 연결하기 ✨
          </Button>
        </form>

        <p className="text-xs text-gray-500 text-center mt-4">
          💡 보완 인증은 Day 6에만 가능합니다
        </p>
      </div>
    </div>
  );
};
