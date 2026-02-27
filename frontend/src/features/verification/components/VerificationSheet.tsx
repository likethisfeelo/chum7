import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion } from 'framer-motion';
import { FiCamera, FiX } from 'react-icons/fi';
import { BottomSheet } from '@/shared/components/BottomSheet';
import toast from 'react-hot-toast';

interface VerificationSheetProps {
  isOpen: boolean;
  onClose: () => void;
  userChallenge: any;
  onSuccess?: (data: any) => void;
}

function toIsoFromLocalDateTime(localDateTime: string): string {
  if (!localDateTime) return new Date().toISOString();
  const parsed = new Date(localDateTime);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function extractApiErrorMessage(error: any): string {
  const apiMessage = error?.response?.data?.message;
  const details = error?.response?.data?.details;

  if (Array.isArray(details) && details.length > 0) {
    const first = details[0];
    if (first?.path?.length && first?.message) {
      return `입력값 오류(${first.path.join('.')}): ${first.message}`;
    }
  }

  return apiMessage || '인증에 실패했습니다';
}

export const VerificationSheet = ({
  isOpen,
  onClose,
  userChallenge,
  onSuccess,
}: VerificationSheetProps) => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    todayNote: '',
    tomorrowPromise: '',
    completedAt: new Date().toISOString().slice(0, 16),
    verificationDate: new Date().toISOString().slice(0, 10),
  });

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 업로드할 수 있어요.');
      return;
    }

    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const verificationMutation = useMutation({
    mutationFn: async () => {
      let imageUrl = '';

      if (imageFile) {
        const challengeId = userChallenge.challengeId ?? userChallenge.challenge?.challengeId;
        const { data: uploadData } = await apiClient.post('/verifications/upload-url', {
          fileName: imageFile.name,
          fileType: imageFile.type,
          challengeId,
        });

        await fetch(uploadData.data.uploadUrl, {
          method: 'PUT',
          body: imageFile,
          headers: { 'Content-Type': imageFile.type },
        });

        imageUrl = uploadData.data.fileUrl;
      }

      const response = await apiClient.post('/verifications', {
        userChallengeId: userChallenge.userChallengeId,
        day: userChallenge.currentDay,
        imageUrl,
        todayNote: formData.todayNote,
        tomorrowPromise: formData.tomorrowPromise,
        performedAt: toIsoFromLocalDateTime(formData.completedAt),
        verificationDate: formData.verificationDate || new Date().toISOString().slice(0, 10),
        isPublic: true,
      });

      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['my-challenges'] });
      toast.success('인증 완료! 오늘도 잘 하셨어요 🎉');
      setImageFile(null);
      setImagePreview(null);
      setFormData({
        todayNote: '',
        tomorrowPromise: '',
        completedAt: new Date().toISOString().slice(0, 16),
        verificationDate: new Date().toISOString().slice(0, 10),
      });
      onClose();
      if (onSuccess) onSuccess(data);
    },
    onError: (error: any) => {
      toast.error(extractApiErrorMessage(error));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.todayNote.trim()) {
      toast.error('오늘의 소감을 입력해주세요');
      return;
    }
    verificationMutation.mutate();
  };

  if (!userChallenge) return null;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="오늘의 인증 📸">
      <form onSubmit={handleSubmit} className="px-6 pb-8 space-y-5">
        <div className="flex items-center gap-3 p-4 bg-primary-50 rounded-2xl">
          <span className="text-3xl">{userChallenge.challenge?.badgeIcon || '🎯'}</span>
          <div>
            <p className="font-bold text-gray-900">{userChallenge.challenge?.title}</p>
            <p className="text-sm text-primary-600">Day {userChallenge.currentDay} / 7</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">인증 사진 📸</label>
          {imagePreview ? (
            <div className="relative">
              <img src={imagePreview} alt="Preview" className="w-full h-48 object-cover rounded-2xl" />
              <button
                type="button"
                onClick={() => { setImageFile(null); setImagePreview(null); }}
                className="absolute top-2 right-2 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-40 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center gap-2 hover:border-primary-400 hover:bg-primary-50 transition-colors"
            >
              <FiCamera className="w-8 h-8 text-gray-400" />
              <span className="text-sm text-gray-500">사진을 선택하거나 찍어주세요</span>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImageSelect}
            className="hidden"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">인증 기준일 📅</label>
          <input
            type="date"
            value={formData.verificationDate}
            onChange={(e) => setFormData({ ...formData, verificationDate: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">실천 시간 ⏰</label>
          <p className="text-xs text-gray-500 mb-2">실제로 실천한 시간을 기록해주세요. 기본값은 현재 시각이며 필요 시 수정할 수 있어요.</p>
          <input
            type="datetime-local"
            value={formData.completedAt}
            onChange={(e) => setFormData({ ...formData, completedAt: e.target.value })}
            max={new Date().toISOString().slice(0, 16)}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">오늘의 소감 ✍️ <span className="text-red-500">*</span></label>
          <textarea
            value={formData.todayNote}
            onChange={(e) => setFormData({ ...formData, todayNote: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="오늘 어떻게 실천했나요? 느낀 점을 나눠주세요"
            rows={4}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">내일의 다짐 🌅 (선택)</label>
          <textarea
            value={formData.tomorrowPromise}
            onChange={(e) => setFormData({ ...formData, tomorrowPromise: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="내일은 어떻게 할 건가요?"
            rows={3}
          />
        </div>

        <motion.button
          whileTap={{ scale: 0.98 }}
          type="submit"
          disabled={verificationMutation.isPending}
          className="w-full py-4 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-bold text-lg rounded-2xl hover:from-primary-600 hover:to-primary-700 transition-all disabled:opacity-50"
        >
          {verificationMutation.isPending ? '제출 중...' : '인증하기 🎉'}
        </motion.button>
      </form>
    </BottomSheet>
  );
};
