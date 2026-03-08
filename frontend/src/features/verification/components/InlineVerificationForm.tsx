import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion, AnimatePresence } from 'framer-motion';
import { FiCamera, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';

interface InlineVerificationFormProps {
  userChallenge: any;
  allowedVerificationTypes?: string[];
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

export const InlineVerificationForm = ({
  userChallenge,
  allowedVerificationTypes,
  onSuccess,
}: InlineVerificationFormProps) => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [isExpanded, setIsExpanded] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    todayNote: '',
    tomorrowPromise: '',
    completedAt: toLocalDateTimeInputValue(new Date()),
  });
  const [extraVisibilityPrompt, setExtraVisibilityPrompt] = useState<{ verificationId: string } | null>(null);

  const allowsMedia =
    !allowedVerificationTypes ||
    allowedVerificationTypes.length === 0 ||
    allowedVerificationTypes.some((t) => t === 'image' || t === 'video');

  const acceptAttr = (() => {
    if (!allowedVerificationTypes || allowedVerificationTypes.length === 0) return 'image/*,video/*';
    const types = [];
    if (allowedVerificationTypes.includes('image')) types.push('image/*');
    if (allowedVerificationTypes.includes('video')) types.push('video/*');
    return types.join(',') || 'image/*,video/*';
  })();

  const handleFocus = () => setIsExpanded(true);

  const handleCollapse = () => {
    setIsExpanded(false);
    setMediaFile(null);
    setMediaPreview(null);
    setFormData({ todayNote: '', tomorrowPromise: '', completedAt: toLocalDateTimeInputValue(new Date()) });
    setExtraVisibilityPrompt(null);
  };

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      toast.error('이미지 또는 영상 파일만 업로드할 수 있어요.');
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
          challengeId,
        });

        const uploadResp = await fetch(uploadData.data.uploadUrl, {
          method: 'PUT',
          body: mediaFile,
          headers: { 'Content-Type': mediaFile.type },
        });

        if (!uploadResp.ok) throw new Error(`UPLOAD_PUT_FAILED_${uploadResp.status}`);
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
        toast('응원권 1장을 획득했어요 🎟', { icon: '🎉' });
      }

      if (payload.isExtra && payload.verificationId) {
        setExtraVisibilityPrompt({ verificationId: payload.verificationId });
        return;
      }

      handleCollapse();
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

  const makeExtraPublic = async () => {
    if (!extraVisibilityPrompt?.verificationId) {
      handleCollapse();
      if (onSuccess) onSuccess(null);
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
      handleCollapse();
      if (onSuccess) onSuccess(null);
    }
  };

  const safeDay = Math.max(1, Number(userChallenge.currentDay || 1));
  const badgeIcon = userChallenge.challenge?.badgeIcon || '🎯';

  return (
    <div className="relative">
      {/* 기본 상태: 한 줄 입력창 */}
      {!isExpanded && (
        <div className="flex items-center gap-3">
          <span className="text-2xl flex-shrink-0">{badgeIcon}</span>
          <div
            className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-400 cursor-text select-none hover:border-primary-300 hover:bg-primary-50 transition-colors"
            onClick={handleFocus}
          >
            오늘의 인증을 남겨보세요... (Day {safeDay})
          </div>
          {allowsMedia && (
            <button
              type="button"
              onClick={() => { setIsExpanded(true); setTimeout(() => fileInputRef.current?.click(), 100); }}
              className="p-2 rounded-full text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
            >
              <FiCamera className="w-5 h-5" />
            </button>
          )}
        </div>
      )}

      {/* 확장 상태: 전체 폼 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.form
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4 shadow-sm"
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">{badgeIcon}</span>
                <div>
                  <p className="text-sm font-semibold text-gray-900 leading-tight">{userChallenge.challenge?.title}</p>
                  <p className="text-xs text-primary-600">Day {safeDay} / 7</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCollapse}
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>

            {/* 오늘의 소감 (항상 표시) */}
            <div>
              <textarea
                ref={textareaRef}
                autoFocus
                value={formData.todayNote}
                onChange={(e) => setFormData({ ...formData, todayNote: e.target.value })}
                className="w-full px-3 py-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-400 text-sm"
                placeholder="오늘 어떻게 실천했나요? 느낀 점을 나눠주세요 ✍️"
                rows={3}
                required
              />
            </div>

            {/* 사진/영상 업로드 (허용된 경우만) */}
            {allowsMedia && (
              <div>
                {mediaPreview ? (
                  <div className="relative">
                    {mediaFile?.type.startsWith('video/') ? (
                      <video src={mediaPreview} controls className="w-full h-40 object-cover rounded-xl" />
                    ) : (
                      <img src={mediaPreview} alt="Preview" className="w-full h-40 object-cover rounded-xl" />
                    )}
                    <button
                      type="button"
                      onClick={() => { setMediaFile(null); setMediaPreview(null); }}
                      className="absolute top-2 right-2 w-7 h-7 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70"
                    >
                      <FiX className="w-3 h-3" />
                    </button>
                  </div>
                ) : null}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={acceptAttr}
                  capture="environment"
                  onChange={handleMediaSelect}
                  className="hidden"
                />
              </div>
            )}

            {/* 실천 시간 */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">실천한 시간 ⏰</label>
              <input
                type="datetime-local"
                value={formData.completedAt}
                onChange={(e) => setFormData({ ...formData, completedAt: e.target.value })}
                max={toLocalDateTimeInputValue(new Date())}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </div>

            {/* 내일의 다짐 */}
            <div>
              <textarea
                value={formData.tomorrowPromise}
                onChange={(e) => setFormData({ ...formData, tomorrowPromise: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl resize-none text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                placeholder="내일의 다짐 🌅 (선택)"
                rows={2}
              />
            </div>

            {/* Extra 공개 전환 프롬프트 */}
            {extraVisibilityPrompt && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                <p className="text-xs text-amber-800">추가 기록(Extra)이 저장되었습니다. 지금 공개 피드로 전환할까요?</p>
                <div className="flex gap-2">
                  <button type="button" onClick={makeExtraPublic} className="px-3 py-1.5 text-xs rounded-lg bg-amber-600 text-white">
                    지금 공개
                  </button>
                  <button type="button" onClick={() => { handleCollapse(); if (onSuccess) onSuccess(null); }} className="px-3 py-1.5 text-xs rounded-lg border border-amber-300 text-amber-700 bg-white">
                    나중에
                  </button>
                </div>
              </div>
            )}

            {/* 하단 액션 바 */}
            <div className="flex items-center justify-between pt-1 border-t border-gray-100">
              <div className="flex items-center gap-1">
                {allowsMedia && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 rounded-full text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                    title="사진/영상 첨부"
                  >
                    <FiCamera className="w-5 h-5" />
                  </button>
                )}
              </div>
              <motion.button
                whileTap={{ scale: 0.97 }}
                type="submit"
                disabled={verificationMutation.isPending || !formData.todayNote.trim()}
                className="px-5 py-2 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                {verificationMutation.isPending ? '제출 중...' : '인증하기 🎉'}
              </motion.button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
};
