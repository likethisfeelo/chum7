import { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX } from 'react-icons/fi';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxHeight?: string;
}

export const BottomSheet = ({
  isOpen,
  onClose,
  title,
  children,
  maxHeight = '90vh',
}: BottomSheetProps) => {
  // document.body 포털 필수 — backdrop-filter/transform 을 가진 조상(glass-header·
  // glass-card 등)은 position:fixed 의 기준 박스가 되어, 그 안에서 렌더하면 시트가
  // 조상 크기의 작은 박스에 갇힌다.
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40"
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            // flex 컬럼 — 핸들/타이틀은 고정, 본문만 스크롤.
            // (과거엔 본문 높이를 calc(90vh-100px)로 고정해, 창이 낮으면 시트가 화면 위로
            //  밀려 올라가며 아래쪽만 보이는 문제가 있었다)
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 overflow-hidden flex flex-col"
            style={{ maxHeight }}
          >
            <div className="w-full flex justify-center pt-3 pb-2 flex-shrink-0">
              <div className="w-12 h-1 bg-gray-300 rounded-full" />
            </div>

            {title && (
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                <h2 className="text-lg font-bold text-gray-900">{title}</h2>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* min-h-0 이 있어야 flex 자식이 실제로 스크롤된다 */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
};
