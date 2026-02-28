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

function toLocalDateTimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}


function isLikelyCorsOrPreflightError(error: any): boolean {
  const status = error?.response?.status;
  if (status === 403) return true;
  const message = String(error?.message || '').toLowerCase();
  return message.includes('failed to fetch') || message.includes('networkerror') || message.includes('cors');
}


const CHALLENGE_TYPE_LABEL: Record<string, string> = {
  leader_only: '리더 퀘스트',
  personal_only: '개인 퀘스트',
  leader_personal: '리더+개인',
  mixed: '혼합형',
};

function getChallengeTypeLabel(userChallenge: any): string {
  const key = String(userChallenge?.challenge?.challengeType || userChallenge?.challenge?.type || '').toLowerCase();
  return CHALLENGE_TYPE_LABEL[key] || '일반 챌린지';
}

function getVerificationGuide(userChallenge: any): string {
  const key = String(userChallenge?.challenge?.challengeType || userChallenge?.challenge?.type || '').toLowerCase();
  if (key === 'leader_only') return '리더가 제시한 공통 퀘스트 실천 내용을 중심으로 인증해요.';
  if (key === 'personal_only') return '개인 퀘스트 실천 흐름을 구체적으로 기록해요.';
  if (key === 'leader_personal' || key === 'mixed') return '공통/개인 퀘스트 중 오늘 수행한 항목을 명확히 적어주세요.';
  return '오늘 핵심 실천을 먼저 인증하고, 추가 실천은 추가 기록으로 남길 수 있어요.';
}


function getSuccessToastMessage(payload: any): string {
  if (payload?.isExtra) return payload.message || '추가 기록이 저장되었어요 📝';
  if (payload?.type === 'remedy') return payload.message || '보완 인증이 완료되었어요 💪';
  return payload?.message || '핵심 인증이 완료됐어요 ✅';
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
    completedAt: toLocalDateTimeInputValue(new Date()),
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
        const isTestWeb = typeof window !== 'undefined' && window.location.origin.includes('test.chum7.com');
        if (isTestWeb) {
          toast.error('현재 TEST 웹에서는 S3 업로드 CORS 설정 이슈로 이미지 업로드를 건너뜁니다. 텍스트 인증만 먼저 제출됩니다.');
        } else {
          try {
            const challengeId = userChallenge.challengeId ?? userChallenge.challenge?.challengeId;
            const { data: uploadData } = await apiClient.post('/verifications/upload-url', {
              fileName: imageFile.name,
              fileType: imageFile.type,
              challengeId,
            });

            const uploadResp = await fetch(uploadData.data.uploadUrl, {
              method: 'PUT',
              body: imageFile,
              headers: { 'Content-Type': imageFile.type },
            });

            if (!uploadResp.ok) {
              throw new Error(`UPLOAD_PUT_FAILED_${uploadResp.status}`);
            }

            imageUrl = uploadData.data.fileUrl;
          } catch (uploadError: any) {
            if (isLikelyCorsOrPreflightError(uploadError)) {
              toast.error('이미지 업로드가 브라우저 CORS 제한으로 실패했습니다. 이미지 없이 인증을 계속 제출합니다.');
            } else {
              throw uploadError;
            }
          }
        }
      }

      const response = await apiClient.post('/verifications', {
        userChallengeId: userChallenge.userChallengeId,
        day: Math.max(1, Number(userChallenge.currentDay || 1)),
        imageUrl,
        todayNote: formData.todayNote,
        tomorrowPromise: formData.tomorrowPromise,
        performedAt: toIsoFromLocalDateTime(formData.completedAt),
        isPublic: true,
        isAnonymous: true,
      });

      return response.data;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['my-challenges'] });

      const payload = data?.data || {};
      if (payload.isExtra) {
        toast.success(getSuccessToastMessage(payload));
        if (payload.notice) {
          toast(payload.notice, { icon: 'ℹ️' });
        }

        const shouldMakePublic = window.confirm('추가 기록을 피드에 공개할까요? (챌린지 기간 내 전환 가능)');
        if (shouldMakePublic && payload.verificationId) {
          try {
            await apiClient.patch(`/verifications/${payload.verificationId}/visibility`, { isPersonalOnly: false });
            toast.success('추가 기록을 공개 피드로 전환했어요 🌍');
          } catch (visibilityError: any) {
            toast.error(visibilityError?.response?.data?.message || '공개 전환에 실패했습니다');
          }
        }
      } else {
        toast.success(getSuccessToastMessage(payload));
      }
      setImageFile(null);
      setImagePreview(null);
      setFormData({
        todayNote: '',
        tomorrowPromise: '',
        completedAt: toLocalDateTimeInputValue(new Date()),
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
  const safeDay = Math.max(1, Number(userChallenge.currentDay || 1));

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="오늘의 인증 📸">
      <form onSubmit={handleSubmit} className="px-6 pb-8 space-y-5">
        <div className="flex items-center gap-3 p-4 bg-primary-50 rounded-2xl">
          <span className="text-3xl">{userChallenge.challenge?.badgeIcon || '🎯'}</span>
          <div>
            <p className="font-bold text-gray-900">{userChallenge.challenge?.title}</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-sm text-primary-600">Day {safeDay} / 7</p>
              <span className="px-2 py-0.5 text-[11px] rounded-full bg-primary-100 text-primary-700">{getChallengeTypeLabel(userChallenge)}</span>
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
          💡 {getVerificationGuide(userChallenge)}
        </p>

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
          <label className="block text-sm font-medium text-gray-700 mb-2">실천한 시간 ⏰</label>
          <p className="text-xs text-gray-500 mb-2">실제로 습관을 실천한 시간을 선택해주세요 (현재 시각 기준 4시간 이내).</p>
          <input
            type="datetime-local"
            value={formData.completedAt}
            onChange={(e) => setFormData({ ...formData, completedAt: e.target.value })}
            max={toLocalDateTimeInputValue(new Date())}
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
