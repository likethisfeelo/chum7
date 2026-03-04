import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion } from 'framer-motion';
import { FiCamera, FiX, FiLink, FiFileText } from 'react-icons/fi';
import { BottomSheet } from '@/shared/components/BottomSheet';
import toast from 'react-hot-toast';

interface QuestSubmitSheetProps {
  isOpen: boolean;
  onClose: () => void;
  quest: any;
  onSuccess?: () => void;
}

export const QuestSubmitSheet = ({ isOpen, onClose, quest, onSuccess }: QuestSubmitSheetProps) => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [imageFile, setImageFile]       = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [linkUrl, setLinkUrl]           = useState('');
  const [textContent, setTextContent]   = useState('');
  const [note, setNote]                 = useState('');

  const resetForm = () => {
    setImageFile(null);
    setImagePreview(null);
    setLinkUrl('');
    setTextContent('');
    setNote('');
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      let content: Record<string, string> = {};

      if (quest.verificationType === 'image') {
        if (!imageFile) throw new Error('이미지를 선택해주세요');

        const challengeId = quest.challengeId ?? quest.challenge?.challengeId;
        if (!challengeId) throw new Error('챌린지 정보가 없어 업로드할 수 없습니다');

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
        content = { imageUrl: uploadData.data.fileUrl };

      } else if (quest.verificationType === 'link') {
        if (!linkUrl.trim()) throw new Error('URL을 입력해주세요');
        content = { linkUrl: linkUrl.trim() };

      } else if (quest.verificationType === 'text') {
        if (!textContent.trim()) throw new Error('내용을 입력해주세요');
        content = { textContent: textContent.trim() };
      }

      if (note.trim()) content.note = note.trim();

      const res = await apiClient.post(`/quests/${quest.questId}/submit`, { content });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quests'] });
      queryClient.invalidateQueries({ queryKey: ['my-quest-submissions'] });
      toast.success(
        quest.approvalRequired
          ? '제출 완료! 관리자 검토 후 포인트가 지급됩니다 📝'
          : '제출 완료! 포인트가 지급되었습니다 🎉',
      );
      resetForm();
      onClose();
      onSuccess?.();
    },
    onError: (err: any) => {
      const code = err.response?.data?.error;
      if (code === 'ALREADY_SUBMITTED') {
        toast.error('이미 제출한 퀘스트입니다');
      } else {
        toast.error(err.response?.data?.message || '제출에 실패했습니다');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitMutation.mutate();
  };

  if (!quest) return null;

  const isResubmit = quest.mySubmission?.status === 'rejected';
  const maxChars   = quest.verificationConfig?.maxChars ?? 2000;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={isResubmit ? '퀘스트 재제출 🔄' : '퀘스트 제출 📝'}
    >
      <form onSubmit={handleSubmit} className="px-6 pb-8 space-y-5">
        {/* 퀘스트 정보 */}
        <div className="flex items-center gap-3 p-4 bg-primary-50 rounded-2xl">
          <span className="text-3xl">{quest.icon || '📋'}</span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 line-clamp-1">{quest.title}</p>
            <p className="text-sm text-primary-600">🏆 {quest.rewardPoints}pt</p>
          </div>
        </div>

        {/* 거절 사유 (재제출 시) */}
        {isResubmit && quest.mySubmission?.reviewNote && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
            <p className="text-sm font-semibold text-red-700 mb-1">거절 사유</p>
            <p className="text-sm text-red-600">{quest.mySubmission.reviewNote}</p>
          </div>
        )}

        {/* 인증 방식별 UI */}
        {quest.verificationType === 'image' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              인증 사진 📸 <span className="text-red-500">*</span>
            </label>
            {imagePreview ? (
              <div className="relative">
                <img src={imagePreview} alt="미리보기" className="w-full h-48 object-cover rounded-2xl" />
                <button
                  type="button"
                  onClick={() => { setImageFile(null); setImagePreview(null); }}
                  className="absolute top-2 right-2 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-white"
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
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleImageSelect} className="hidden" />
          </div>
        )}

        {quest.verificationType === 'link' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <FiLink className="inline w-4 h-4 mr-1" />URL 입력 <span className="text-red-500">*</span>
            </label>
            {quest.verificationConfig?.linkExample && (
              <p className="text-xs text-gray-400 mb-2">예시: {quest.verificationConfig.linkExample}</p>
            )}
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>
        )}

        {quest.verificationType === 'text' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <FiFileText className="inline w-4 h-4 mr-1" />내용 입력 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              maxLength={maxChars}
              rows={5}
              placeholder="내용을 입력해주세요"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            />
            <p className="text-xs text-gray-400 text-right mt-1">{textContent.length} / {maxChars}</p>
          </div>
        )}

        {/* 한 줄 메모 (공통, 선택) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            한 줄 메모 ✍️ (선택)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="짧은 소감을 남겨보세요"
            className="w-full px-4 py-3 border border-gray-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <motion.button
          whileTap={{ scale: 0.98 }}
          type="submit"
          disabled={submitMutation.isPending}
          className="w-full py-4 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-bold text-lg rounded-2xl hover:from-primary-600 hover:to-primary-700 transition-all disabled:opacity-50"
        >
          {submitMutation.isPending ? '제출 중...' : isResubmit ? '재제출하기 🔄' : '제출하기 🚀'}
        </motion.button>
      </form>
    </BottomSheet>
  );
};
