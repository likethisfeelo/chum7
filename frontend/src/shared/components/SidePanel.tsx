import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX } from 'react-icons/fi';

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** 패널 최대 너비 (기본 380px — 좁은 창에서는 화면의 92%) */
  maxWidth?: number;
}

/**
 * 우측에서 밀려 나오는 패널.
 * 바텀시트는 창 높이가 낮으면(데스크톱 좁은 창·PWA 창) 본문이 위로 말려 올라가
 * 아래쪽만 겨우 보이는 문제가 있어, 목록형 콘텐츠는 이 패널을 쓴다.
 * 높이는 항상 화면 전체를 쓰고 본문만 스크롤한다.
 *
 * 반드시 document.body 로 포털한다 — backdrop-filter/transform 을 가진 조상
 * (glass-header·glass-card 등)은 position:fixed 의 기준 박스가 되어, 그 안에서
 * 렌더하면 패널이 헤더 크기의 작은 박스로 갇힌다.
 */
export const SidePanel = ({ isOpen, onClose, title, children, maxWidth = 380 }: SidePanelProps) => {
  // ESC 로 닫기 + 열려 있는 동안 배경 스크롤 잠금
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

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

          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            // 높이 전체 + flex 컬럼 — 헤더 고정, 본문만 스크롤 (짧은 창에서도 안 잘림)
            className="fixed top-0 right-0 bottom-0 z-50 flex flex-col bg-white shadow-2xl"
            style={{ width: `min(92vw, ${maxWidth}px)` }}
          >
            {title && (
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                <h2 className="text-base font-bold text-gray-900">{title}</h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="닫기"
                  className="rounded-full p-2 transition-colors hover:bg-gray-100"
                >
                  <FiX className="h-5 w-5" />
                </button>
              </div>
            )}

            {/* min-h-0 이 있어야 flex 자식이 실제로 스크롤된다 */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
};
