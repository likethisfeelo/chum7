import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion } from 'framer-motion';
import { FiCamera, FiX } from 'react-icons/fi';
import { BottomSheet } from '@/shared/components/BottomSheet';
import toast from 'react-hot-toast';

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;

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
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    todayNote: '',
    tomorrowPromise: '',
    completedAt: toLocalDateTimeInputValue(new Date()),
  });
  const [submittedPayload, setSubmittedPayload] = useState<any | null>(null);
  const [extraVisibilityPrompt, setExtraVisibilityPrompt] = useState<{ verificationId: string } | null>(null);

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      toast.error('이미지 또는 영상 파일만 업로드할 수 있어요.');
      return;
    }

    if (
      file.type === 'image/heic' ||
      file.type === 'image/heif' ||
      file.type === 'image/heic-sequence' ||
      file.type === 'image/heif-sequence' ||
      file.name.toLowerCase().endsWith('.heic') ||
      file.name.toLowerCase().endsWith('.heif')
    ) {
      toast.error(
        'HEIC/HEIF 이미지는 피드에서 표시되지 않을 수 있어요. 카메라 설정에서 JPEG 형식으로 변경하거나 다른 파일을 선택해주세요.',
        { duration: 5000 },
      );
      return;
    }

    if (file.type.startsWith('image/') && file.size > MAX_IMAGE_SIZE_BYTES) {
      toast.error('이미지는 10MB 이내만 업로드할 수 있어요.');
      return;
    }

    if (file.type.startsWith('video/') && file.size > MAX_VIDEO_SIZE_BYTES) {
      toast.error('영상은 50MB 이내만 업로드할 수 있어요.');
      return;
    }

    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  const verificationMutation = useMutation({
    mutationFn: async () => {
      let imageUrl: string | undefined;

      if (mediaFile) {
        const challengeId = userChallenge.challengeId ?? userChallenge.challenge?.challengeId;
        const { data: uploadData } = await apiClient.post('/verifications/upload-url', {
          fileName: mediaFile.name,
          fileType: mediaFile.type,
          fileSize: mediaFile.size,
          challengeId,
          userChallengeId: userChallenge.userChallengeId,
        });

        const uploadResp = await fetch(uploadData.data.uploadUrl, {
          method: 'PUT',
          body: mediaFile,
          headers: { 'Content-Type': mediaFile.type },
        });

        if (!uploadResp.ok) {
          throw new Error(`UPLOAD_PUT_FAILED_${uploadResp.status}`);
        }

        imageUrl = uploadData.data.fileUrl;
      }

      const response = await apiClient.post('/verifications', {
        userChallengeId: userChallenge.userChallengeId,
        day: Math.max(1, Number(userChallenge.currentDay || 1)),
        ...(imageUrl ? { imageUrl } : {}),
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
      setSubmittedPayload(payload);

      const feedback = [
        payload?.scoreEarned !== undefined ? `+${payload.scoreEarned}점` : null,
        payload?.consecutiveDays ? `연속 ${payload.consecutiveDays}일` : null,
        payload?.delta !== null && payload?.delta !== undefined ? `델타 ${payload.delta}분` : null,
      ].filter(Boolean).join(' · ');

      toast.success(feedback ? `${getSuccessToastMessage(payload)} (${feedback})` : getSuccessToastMessage(payload));

      if (payload?.newBadges?.length) {
        toast(`새 뱃지: ${payload.newBadges.join(', ')}`, { icon: '🏅' });
      }

      if (payload?.cheerOpportunity?.cheerTicketGranted) {
        const cnt = payload.cheerOpportunity.incompleteCount ?? 1;
        toast(`${cnt}명에게 응원을 보냈어요 🎟`, { icon: '🎉' });
      }

      setMediaFile(null);
      setMediaPreview(null);
      setFormData({
        todayNote: '',
        tomorrowPromise: '',
        completedAt: toLocalDateTimeInputValue(new Date()),
      });

      if (payload.isExtra && payload.verificationId) {
        setExtraVisibilityPrompt({ verificationId: payload.verificationId });
        return;
      }

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


  const closeWithReset = () => {
    setExtraVisibilityPrompt(null);
    setSubmittedPayload(null);
    onClose();
  };

  const makeExtraPublic = async () => {
    if (!extraVisibilityPrompt?.verificationId) {
      closeWithReset();
      return;
    }

    try {
      await apiClient.patch(`/verifications/${extraVisibilityPrompt.verificationId}/visibility`, { isPersonalOnly: false });
      toast.success('추가 기록을 공개 피드로 전환했어요 🌍');
      queryClient.invalidateQueries({ queryKey: ['verifications', 'mine-extra'] });
      queryClient.invalidateQueries({ queryKey: ['verifications', 'public'] });
    } catch (error: any) {
      toast.error(error?.response?.data?.message || '공개 전환에 실패했습니다');
    } finally {
      closeWithReset();
    }
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
          <label className="block text-sm font-medium text-gray-700 mb-2">인증 사진/영상 📸</label>
          {mediaPreview ? (
            <div className="relative">
              {mediaFile?.type.startsWith('video/') ? (
                <video src={mediaPreview} controls className="w-full h-48 object-cover rounded-2xl" />
              ) : (
                <img src={mediaPreview} alt="Preview" className="w-full h-48 object-cover rounded-2xl" />
              )}
              <button
                type="button"
                onClick={() => { setMediaFile(null); setMediaPreview(null); }}
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
              <span className="text-sm text-gray-500">사진/영상을 선택하거나 촬영해주세요</span>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            onChange={handleMediaSelect}
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


        {extraVisibilityPrompt && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
            <p className="text-xs text-amber-800">추가 기록(Extra)이 저장되었습니다. 지금 공개 피드로 전환할까요?</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={makeExtraPublic}
                className="px-3 py-1.5 text-xs rounded-lg bg-amber-600 text-white"
              >
                지금 공개
              </button>
              <button
                type="button"
                onClick={closeWithReset}
                className="px-3 py-1.5 text-xs rounded-lg border border-amber-300 text-amber-700 bg-white"
              >
                나중에
              </button>
            </div>
          </div>
        )}

        {submittedPayload && !extraVisibilityPrompt && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            제출 결과: 총점 {submittedPayload.totalScore ?? '-'} · 연속 {submittedPayload.consecutiveDays ?? '-'}일
          </div>
        )}

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
