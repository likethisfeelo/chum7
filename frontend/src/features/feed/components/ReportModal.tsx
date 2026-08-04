import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { reportApi, type ReportTarget } from '@/features/feed/api/reportApi';

const REASONS: Array<{ key: string; label: string }> = [
  { key: 'spam', label: '스팸/광고' },
  { key: 'harassment', label: '욕설/괴롭힘' },
  { key: 'sexual', label: '음란물/선정성' },
  { key: 'violence', label: '폭력/위협' },
  { key: 'hate', label: '혐오 발언' },
  { key: 'misinfo', label: '허위정보' },
  { key: 'other', label: '기타' },
];

const TARGET_LABEL: Record<ReportTarget['targetType'], string> = {
  verification: '인증',
  plaza: '마당 게시물',
  comment: '댓글',
};

export function ReportModal({
  target,
  onClose,
  mode = 'report',
}: {
  target: ReportTarget;
  onClose: () => void;
  /** 'deletion' = 마당에서 내려달라는 삭제 요청(사유 deletion_request 고정) — 신고와 분리된 동작 */
  mode?: 'report' | 'deletion';
}) {
  const isDeletion = mode === 'deletion';
  const [reason, setReason] = useState(isDeletion ? 'deletion_request' : '');
  const [detail, setDetail] = useState('');

  const mutation = useMutation({
    mutationFn: () => reportApi.submit({ ...target, reason, detail: detail.trim() || undefined }),
    onSuccess: () => {
      toast.success(isDeletion ? '삭제 요청을 접수했어요. 관리자가 검토해요.' : '신고가 접수됐어요. 검토 후 조치할게요.');
      onClose();
    },
    onError: () => toast.error(isDeletion ? '삭제 요청에 실패했어요.' : '신고 접수에 실패했어요.'),
  });

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4"
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-sm bg-white rounded-t-3xl md:rounded-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {isDeletion ? (
          <>
            <h3 className="text-base font-bold text-gray-900">🗑️ 마당에서 내려달라 요청</h3>
            <p className="text-xs text-gray-400 mt-1">
              인증 취소와는 별개예요. 이 게시물을 마당(광장)에서 내려달라고 관리자에게 요청합니다.
            </p>
          </>
        ) : (
          <>
            <h3 className="text-base font-bold text-gray-900">🚩 {TARGET_LABEL[target.targetType]} 신고</h3>
            <p className="text-xs text-gray-400 mt-1">신고 사유를 선택해주세요. 접수된 내용은 관리자가 검토합니다.</p>
          </>
        )}

        {!isDeletion && (
          <div className="mt-4 space-y-1.5">
            {REASONS.map((r) => (
              <label
                key={r.key}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm ${
                  reason === r.key ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-200 text-gray-700'
                }`}
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={r.key}
                  checked={reason === r.key}
                  onChange={() => setReason(r.key)}
                />
                {r.label}
              </label>
            ))}
          </div>
        )}

        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder={isDeletion ? '요청 사유 (선택)' : '상세 내용 (선택)'}
          className="mt-3 w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-red-300 resize-none"
        />

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold"
          >
            취소
          </button>
          <button
            type="button"
            disabled={!reason || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            {mutation.isPending ? '접수 중...' : isDeletion ? '삭제 요청하기' : '신고하기'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 신고 버튼 — 자체 모달 상태 관리. 카드/댓글 액션바에 드롭. */
export function ReportButton({
  target,
  className,
  label,
}: {
  target: ReportTarget;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title="신고"
        aria-label="신고"
        className={className ?? 'text-gray-300 hover:text-red-500 transition-colors'}
      >
        {label ? `🚩 ${label}` : '🚩'}
      </button>
      {open && <ReportModal target={target} onClose={() => setOpen(false)} />}
    </>
  );
}
