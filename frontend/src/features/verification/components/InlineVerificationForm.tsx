import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion, AnimatePresence } from 'framer-motion';
import { FiCamera, FiFileText, FiLink, FiVideo, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';

interface InlineVerificationFormProps {
  userChallenge: any;
  allowedVerificationTypes?: string[];
  onSuccess?: (data: any) => void;
}

type VerificationType = 'text' | 'image' | 'video' | 'link';

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;

const ALL_TYPES: VerificationType[] = ['text', 'image', 'video', 'link'];

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
  if (typeof error?.message === 'string' && error.message.startsWith('UPLOAD_PUT_FAILED_')) {
    return '파일 업로드에 실패했습니다. 네트워크 상태를 확인해주세요.';
  }
  return apiMessage || '인증에 실패했습니다';
}

async function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const duration = Number(video.duration || 0);
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('VIDEO_DURATION_READ_FAILED'));
    };
    video.src = url;
  });
}

export const InlineVerificationForm = ({
  userChallenge,
  allowedVerificationTypes,
  onSuccess,
}: InlineVerificationFormProps) => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaPreviewUrlRef = useRef<string | null>(null);

  const availableTypes = useMemo(() => {
    if (!allowedVerificationTypes || allowedVerificationTypes.length === 0) return ALL_TYPES;
    const filtered = ALL_TYPES.filter((t) => allowedVerificationTypes.includes(t));
    return filtered.length ? filtered : ALL_TYPES;
  }, [allowedVerificationTypes]);

  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedType, setSelectedType] = useState<VerificationType>(availableTypes[0]);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [videoDurationSec, setVideoDurationSec] = useState<number | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [formData, setFormData] = useState({
    todayNote: '',
    completedAt: toLocalDateTimeInputValue(new Date()),
  });
  const [extraVisibilityPrompt, setExtraVisibilityPrompt] = useState<{ verificationId: string } | null>(null);

  const acceptsFile = selectedType === 'image' || selectedType === 'video';

  useEffect(() => {
    if (!availableTypes.includes(selectedType)) {
      setSelectedType(availableTypes[0]);
    }
  }, [availableTypes, selectedType]);

  useEffect(() => () => {
    if (mediaPreviewUrlRef.current) {
      URL.revokeObjectURL(mediaPreviewUrlRef.current);
      mediaPreviewUrlRef.current = null;
    }
  }, []);

  const acceptAttr = selectedType === 'video' ? 'video/*' : 'image/*';

  const handleFocus = () => setIsExpanded(true);

  const resetMedia = () => {
    if (mediaPreviewUrlRef.current) {
      URL.revokeObjectURL(mediaPreviewUrlRef.current);
      mediaPreviewUrlRef.current = null;
    }
    setMediaFile(null);
    setMediaPreview(null);
    setVideoDurationSec(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCollapse = () => {
    setIsExpanded(false);
    resetMedia();
    setLinkUrl('');
    setSelectedType(availableTypes[0]);
    setFormData({ todayNote: '', completedAt: toLocalDateTimeInputValue(new Date()) });
    setExtraVisibilityPrompt(null);
  };

  const handleTypeChange = (next: VerificationType) => {
    setSelectedType(next);
    resetMedia();
    if (next !== 'link') setLinkUrl('');
  };

  const handleMediaSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (selectedType === 'image' && !file.type.startsWith('image/')) {
      toast.error('사진 인증에서는 이미지 파일만 업로드할 수 있어요.');
      return;
    }

    if (selectedType === 'image' && file.size > MAX_IMAGE_SIZE_BYTES) {
      toast.error('이미지는 10MB 이내만 업로드할 수 있어요.');
      return;
    }

    if (selectedType === 'video' && !file.type.startsWith('video/')) {
      toast.error('영상 인증에서는 영상 파일만 업로드할 수 있어요.');
      return;
    }

    if (selectedType === 'video' && file.size > MAX_VIDEO_SIZE_BYTES) {
      toast.error('영상은 50MB 이내만 업로드할 수 있어요.');
      return;
    }

    if (selectedType === 'video') {
      try {
        const duration = await readVideoDuration(file);
        if (duration > 60) {
          if (fileInputRef.current) fileInputRef.current.value = '';
          toast.error('영상은 60초 이내만 업로드할 수 있어요.');
          return;
        }
        setVideoDurationSec(duration);
      } catch {
        toast.error('영상 길이를 확인할 수 없습니다. 다시 시도해주세요.');
        return;
      }
    }

    const previewUrl = URL.createObjectURL(file);
    if (mediaPreviewUrlRef.current) {
      URL.revokeObjectURL(mediaPreviewUrlRef.current);
    }
    mediaPreviewUrlRef.current = previewUrl;
    setMediaFile(file);
    setMediaPreview(previewUrl);
  };

  const verificationMutation = useMutation({
    mutationFn: async (payload?: { performedAtLocal?: string }) => {
      let uploadedUrl: string | undefined;

      if (acceptsFile && mediaFile) {
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

        if (!uploadResp.ok) throw new Error(`UPLOAD_PUT_FAILED_${uploadResp.status}`);
        uploadedUrl = uploadData.data.fileUrl;
      }

      const response = await apiClient.post('/verifications', {
        userChallengeId: userChallenge.userChallengeId,
        day: Math.max(1, Number(userChallenge.currentDay || 1)),
        verificationType: selectedType,
        ...(selectedType === 'image' && uploadedUrl ? { imageUrl: uploadedUrl } : {}),
        ...(selectedType === 'video' && uploadedUrl ? { videoUrl: uploadedUrl, videoDurationSec } : {}),
        ...(selectedType === 'link' && linkUrl.trim() ? { linkUrl: linkUrl.trim() } : {}),
        ...(formData.todayNote.trim() ? { todayNote: formData.todayNote.trim() } : {}),
        performedAt: toIsoFromLocalDateTime(payload?.performedAtLocal || formData.completedAt),
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

    const nowLocalDateTime = toLocalDateTimeInputValue(new Date());
    setFormData((prev) => ({ ...prev, completedAt: nowLocalDateTime }));

    if (selectedType === 'image' && !mediaFile) {
      toast.error('사진을 첨부해주세요.');
      return;
    }

    if (selectedType === 'video') {
      if (!mediaFile) {
        toast.error('영상을 첨부해주세요.');
        return;
      }
      if ((videoDurationSec || 0) > 60) {
        toast.error('영상은 60초 이내만 업로드할 수 있어요.');
        return;
      }
    }

    if (selectedType === 'link' && !linkUrl.trim()) {
      toast.error('링크를 입력해주세요.');
      return;
    }

    if (selectedType === 'link' && !linkUrl.trim().startsWith('https://')) {
      toast.error('링크는 https 형식만 허용됩니다.');
      return;
    }

    verificationMutation.mutate({ performedAtLocal: nowLocalDateTime });
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
      {!isExpanded && (
        <div className="flex items-center gap-3">
          <span className="text-2xl flex-shrink-0">{badgeIcon}</span>
          <div
            className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-400 cursor-text select-none hover:border-primary-300 hover:bg-primary-50 transition-colors"
            onClick={handleFocus}
          >
            오늘의 인증을 남겨보세요... (Day {safeDay})
          </div>
          {availableTypes.some((t) => t === 'image' || t === 'video') && (
            <button
              type="button"
              onClick={() => {
                setIsExpanded(true);
                const defaultMediaType = availableTypes.includes('image') ? 'image' : availableTypes.includes('video') ? 'video' : availableTypes[0];
                setSelectedType(defaultMediaType);
                setTimeout(() => fileInputRef.current?.click(), 100);
              }}
              className="p-2 rounded-full text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
            >
              <FiCamera className="w-5 h-5" />
            </button>
          )}
        </div>
      )}

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

            <div>
              <textarea
                value={formData.todayNote}
                onChange={(e) => setFormData({ ...formData, todayNote: e.target.value })}
                className="w-full px-3 py-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-400 text-sm"
                placeholder="소감(선택)을 남겨보세요 ✍️"
                rows={3}
              />
            </div>

            {selectedType === 'link' && (
              <div>
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                  required
                />
              </div>
            )}

            {acceptsFile && (
              <div>
                {mediaPreview ? (
                  <div className="relative">
                    {selectedType === 'video' ? (
                      <video src={mediaPreview} controls className="w-full h-40 object-cover rounded-xl" />
                    ) : (
                      <img src={mediaPreview} alt="Preview" className="w-full h-40 object-cover rounded-xl" />
                    )}
                    <button
                      type="button"
                      onClick={resetMedia}
                      className="absolute top-2 right-2 w-7 h-7 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70"
                    >
                      <FiX className="w-3 h-3" />
                    </button>
                  </div>
                ) : null}
                {selectedType === 'video' && videoDurationSec !== null && (
                  <p className="mt-1 text-xs text-gray-500">영상 길이: {videoDurationSec.toFixed(1)}초 (최대 60초)</p>
                )}
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

            <div className="flex items-center justify-between pt-1 border-t border-gray-100">
              <div className="flex items-center gap-1">
                {availableTypes.map((type) => {
                  const isActive = selectedType === type;
                  const Icon = type === 'text' ? FiFileText : type === 'image' ? FiCamera : type === 'video' ? FiVideo : FiLink;
                  const title = type === 'text' ? '텍스트' : type === 'image' ? '사진' : type === 'video' ? '영상' : '링크';

                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleTypeChange(type)}
                      className={`p-2 rounded-full transition-colors ${
                        isActive
                          ? 'text-primary-700 bg-primary-50 border border-primary-200'
                          : 'text-gray-400 hover:text-primary-600 hover:bg-primary-50 border border-transparent'
                      }`}
                      title={`${title} 인증`}
                    >
                      <Icon className="w-5 h-5" />
                    </button>
                  );
                })}
                {acceptsFile && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 rounded-full text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                    title={selectedType === 'video' ? '영상 첨부' : '사진 첨부'}
                  >
                    <FiCamera className="w-5 h-5" />
                  </button>
                )}
              </div>
              <motion.button
                whileTap={{ scale: 0.97 }}
                type="submit"
                disabled={verificationMutation.isPending}
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
