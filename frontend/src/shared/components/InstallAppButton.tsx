import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FiDownload, FiX, FiShare } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useInstallPrompt } from '@/shared/hooks/useInstallPrompt';

const APP_ICON = '/icons/icon-512.png';

/**
 * 홈 화면 바로가기(앱) 설치 버튼.
 * - Android/데스크톱 Chromium: 네이티브 설치 프롬프트 즉시 실행.
 * - iOS Safari 등 프롬프트 미지원: 수동 안내 바텀시트 노출.
 * - 이미 앱으로 실행 중이면 렌더링하지 않음.
 */
export function InstallAppButton({ className = '' }: { className?: string }) {
  const { canInstall, standalone, ios, promptInstall } = useInstallPrompt();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [iconError, setIconError] = useState(false);

  // 이미 설치되어 앱으로 실행 중이면 버튼 숨김
  if (standalone) return null;

  const handleClick = async () => {
    if (canInstall) {
      const accepted = await promptInstall();
      if (accepted) {
        toast.success('홈 화면에 CHUM 7 앱이 추가됐어요! 🎉');
      } else {
        // 사용자가 취소했거나 프롬프트가 닫힘 — 수동 안내는 생략
      }
      return;
    }
    // 네이티브 프롬프트 불가(iOS 등) → 수동 안내
    setSheetOpen(true);
  };

  return (
    <>
      <button
        onClick={handleClick}
        aria-label="앱 설치 (홈 화면에 추가)"
        title="홈 화면에 추가"
        className={`w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:border-primary-300 hover:text-primary-600 transition-colors ${className}`}
      >
        <FiDownload size={17} />
      </button>

      {sheetOpen &&
        createPortal(
          <AnimatePresence>
            <motion.div
              className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSheetOpen(false)}
            >
              <motion.div
                className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-8"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {iconError ? (
                      <div className="w-14 h-14 rounded-2xl shadow-sm bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-2xl">
                        🙌
                      </div>
                    ) : (
                      <img
                        src={APP_ICON}
                        alt="CHUM 7"
                        onError={() => setIconError(true)}
                        className="w-14 h-14 rounded-2xl shadow-sm object-cover"
                      />
                    )}
                    <div>
                      <h3 className="font-bold text-gray-900 text-base">홈 화면에 추가</h3>
                      <p className="text-xs text-gray-500 mt-0.5">앱처럼 한 번에 열 수 있어요</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSheetOpen(false)}
                    aria-label="닫기"
                    className="p-1.5 rounded-full text-gray-400 hover:bg-gray-100"
                  >
                    <FiX size={18} />
                  </button>
                </div>

                {ios ? (
                  <ol className="space-y-3 text-sm text-gray-700">
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center">
                        1
                      </span>
                      <span className="flex items-center gap-1.5">
                        Safari 하단의 공유 버튼
                        <FiShare className="inline text-primary-600" size={15} />을 눌러요.
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center">
                        2
                      </span>
                      <span>
                        메뉴에서 <b>&lsquo;홈 화면에 추가&rsquo;</b>를 선택해요.
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center">
                        3
                      </span>
                      <span>
                        우측 상단 <b>&lsquo;추가&rsquo;</b>를 누르면 완료!
                      </span>
                    </li>
                  </ol>
                ) : (
                  <ol className="space-y-3 text-sm text-gray-700">
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center">
                        1
                      </span>
                      <span>브라우저 우측 상단의 메뉴(⋮)를 열어요.</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center">
                        2
                      </span>
                      <span>
                        <b>&lsquo;앱 설치&rsquo;</b> 또는 <b>&lsquo;홈 화면에 추가&rsquo;</b>를 선택하면 완료!
                      </span>
                    </li>
                  </ol>
                )}

                <button
                  onClick={() => setSheetOpen(false)}
                  className="mt-6 w-full py-3 rounded-2xl bg-gray-900 text-white text-sm font-semibold"
                >
                  확인
                </button>
              </motion.div>
            </motion.div>
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
