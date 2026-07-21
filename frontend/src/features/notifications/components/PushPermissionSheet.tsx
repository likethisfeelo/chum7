import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { subscribeToPush } from '../push';
import { markPushPromptShown, usePushPromptStore } from '../pushPromptStore';

/**
 * 푸시 권한 요청 바텀시트 (PRODUCT_SPEC §4.10) — 첫 응원 예약 완료 직후 노출.
 * "응원이 도착하면 알려드릴까요?" [알림 받기] / [나중에]
 * iOS 미설치 사용자는 구독 대신 홈 화면 추가 안내를 보여준다.
 */
export function PushPermissionSheet() {
  const { open, needsInstall, closeSheet } = usePushPromptStore();
  const [subscribing, setSubscribing] = useState(false);

  const dismiss = () => {
    markPushPromptShown();
    closeSheet();
  };

  const accept = async () => {
    if (subscribing) return;
    setSubscribing(true);
    const result = await subscribeToPush();
    setSubscribing(false);
    markPushPromptShown();
    closeSheet();

    if (result.ok) {
      toast.success('응원이 도착하면 알려드릴게요! 🔔');
    } else if (result.reason === 'permission-denied') {
      toast('브라우저 설정에서 언제든 알림을 켤 수 있어요', { icon: '🔕' });
    } else if (result.reason === 'needs-install') {
      toast('홈 화면에 추가하면 알림을 받을 수 있어요', { icon: '📲' });
    } else {
      toast.error('알림 설정에 실패했어요. 알림 설정에서 다시 시도해주세요');
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismiss}
            className="fixed inset-0 z-40 bg-black/40"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-lg rounded-t-3xl bg-white p-6 pb-8 shadow-xl"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-300" />
            <div className="text-center">
              <p className="text-3xl">💌</p>
              <h2 className="mt-2 text-lg font-bold text-gray-900">
                응원이 도착하면 알려드릴까요?
              </h2>
              {needsInstall ? (
                <p className="mt-2 text-sm text-gray-600">
                  홈 화면에 추가하면 알림을 받을 수 있어요.
                  <br />
                  공유 버튼 → &lsquo;홈 화면에 추가&rsquo;를 눌러 설치해보세요.
                </p>
              ) : (
                <p className="mt-2 text-sm text-gray-600">
                  동료의 응원이 내 실천 시각에 맞춰 도착해요.
                  <br />
                  놓치지 않게 푸시 알림으로 알려드릴게요.
                </p>
              )}
            </div>

            <div className="mt-6 space-y-2">
              {!needsInstall && (
                <button
                  type="button"
                  onClick={accept}
                  disabled={subscribing}
                  className="w-full rounded-2xl bg-gradient-to-r from-primary-500 to-primary-600 py-3.5 font-bold text-white transition-all disabled:opacity-50"
                >
                  {subscribing ? '설정 중...' : '알림 받기'}
                </button>
              )}
              <button
                type="button"
                onClick={dismiss}
                className="w-full rounded-2xl py-3 text-sm font-medium text-gray-500 hover:bg-gray-50"
              >
                {needsInstall ? '확인했어요' : '나중에'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
