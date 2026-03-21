import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const MAX_LENGTH = 30;

interface ThankYouMessageModalProps {
  isOpen: boolean;
  autoThankedCount: number;
  autoThankedCheerIds: string[];
  onClose: () => void;
}

export const ThankYouMessageModal = ({
  isOpen,
  autoThankedCount,
  autoThankedCheerIds,
  onClose,
}: ThankYouMessageModalProps) => {
  const [message, setMessage] = useState('');

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post('/cheers/thank-message', {
        cheerIds: autoThankedCheerIds,
        message: message.trim(),
      });
    },
    onSuccess: () => {
      toast.success('감사 메시지를 보냈어요 💝');
      setMessage('');
      onClose();
    },
    onError: () => {
      toast.error('메시지 전송 중 오류가 발생했습니다');
    },
  });

  const handleClose = () => {
    setMessage('');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-md bg-white rounded-t-3xl p-6 pb-8"
          >
            {/* 핸들바 */}
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

            <div className="text-center mb-5">
              <div className="text-4xl mb-3">💝</div>
              <h2 className="text-lg font-bold text-gray-900">감사가 전달됐어요!</h2>
              <p className="text-sm text-gray-500 mt-1">
                응원해 준 <span className="font-semibold text-rose-500">{autoThankedCount}명</span>에게
                감사를 보냈어요.
              </p>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4 mb-5">
              <label className="block text-xs font-semibold text-gray-600 mb-2">
                감사 메시지 추가 <span className="font-normal text-gray-400">(선택, 전원에게 전달)</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MAX_LENGTH))}
                placeholder="예: 덕분에 힘이 났어요! 감사해요 🙏"
                className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-rose-300"
                rows={2}
              />
              <p className={`text-right text-xs mt-1 ${message.length >= MAX_LENGTH ? 'text-rose-400 font-semibold' : 'text-gray-400'}`}>
                {message.length} / {MAX_LENGTH}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-600 text-sm font-semibold"
              >
                닫기
              </button>
              <button
                onClick={() => sendMessageMutation.mutate()}
                disabled={!message.trim() || sendMessageMutation.isPending}
                className="flex-1 py-3 rounded-2xl bg-rose-500 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {sendMessageMutation.isPending ? '전송 중...' : '메시지 보내기 💝'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
