import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

// 커머스 v0 쿠폰(입장권) 콘솔 — /pay/admin/coupons (슈퍼어드민 admins 전용)
type Coupon = {
  code: string;
  challengeId: string; // 'ANY' 허용
  issuedToUserId?: string | null;
  status: 'active' | 'redeemed' | 'revoked' | 'expired';
  expiresAt?: string | null;
  memo?: string | null;
  createdBy: string;
  createdAt: string;
  redeemedByUserId?: string | null;
  redeemedAt?: string | null;
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active:   { label: '활성',   cls: 'bg-green-100 text-green-700' },
  redeemed: { label: '사용됨', cls: 'bg-blue-100 text-blue-700' },
  revoked:  { label: '회수됨', cls: 'bg-gray-200 text-gray-600' },
  expired:  { label: '만료',   cls: 'bg-red-100 text-red-700' },
};

const formatDate = (iso?: string | null) => {
  if (!iso) return '-';
  try { return format(new Date(iso), 'yy.MM.dd HH:mm', { locale: ko }); } catch { return iso; }
};

const CopyButton = ({ text, label }: { text: string; label?: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="px-2 py-1 rounded-lg border border-gray-300 text-xs text-gray-600 hover:bg-gray-100"
      title="클립보드 복사"
    >
      {copied ? '복사됨 ✓' : (label ?? '복사')}
    </button>
  );
};

const INITIAL_FORM = {
  anyChallenge: false,
  challengeId: '',
  issuedToUserId: '',
  count: 1,
  expiresAt: '',
  memo: '',
};

export const AdminCommerceCouponsPage = () => {
  const qc = useQueryClient();
  const [form, setForm] = useState(INITIAL_FORM);
  const [formError, setFormError] = useState('');
  const [issued, setIssued] = useState<Coupon[]>([]);

  const { data: coupons, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin-commerce-coupons'],
    queryFn: async () => {
      const res = await apiClient.get('/pay/admin/coupons');
      return (res.data?.data?.coupons ?? []) as Coupon[];
    },
    retry: false,
  });

  const issueMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        challengeId: form.anyChallenge ? 'ANY' : form.challengeId.trim(),
        count: Number(form.count),
      };
      if (form.issuedToUserId.trim()) payload.issuedToUserId = form.issuedToUserId.trim();
      if (form.expiresAt) payload.expiresAt = new Date(form.expiresAt).toISOString();
      if (form.memo.trim()) payload.memo = form.memo.trim();
      const res = await apiClient.post('/pay/admin/coupons', payload);
      return (res.data?.data?.coupons ?? []) as Coupon[];
    },
    onSuccess: (newCoupons) => {
      setIssued(newCoupons);
      setFormError('');
      qc.invalidateQueries({ queryKey: ['admin-commerce-coupons'] });
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.message || '쿠폰 발급에 실패했습니다');
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (code: string) => {
      await apiClient.post(`/pay/admin/coupons/${encodeURIComponent(code)}/revoke`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-commerce-coupons'] }),
    onError: (err: any) => {
      alert(err?.response?.data?.message || '쿠폰 회수에 실패했습니다');
    },
  });

  const handleIssue = () => {
    if (!form.anyChallenge && !form.challengeId.trim()) return setFormError('챌린지 ID를 입력하거나 전체 챌린지(ANY)를 선택해주세요');
    const count = Number(form.count);
    if (!Number.isInteger(count) || count < 1 || count > 50) return setFormError('발급 수량은 1~50 사이여야 합니다');
    setFormError('');
    issueMutation.mutate();
  };

  const handleRevoke = (coupon: Coupon) => {
    if (!window.confirm(`쿠폰 ${coupon.code}을(를) 회수할까요?\n회수된 쿠폰은 다시 사용할 수 없습니다.`)) return;
    revokeMutation.mutate(coupon.code);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">쿠폰(입장권) 관리</h1>
        <p className="text-sm text-gray-500 mt-1">유료 챌린지 입장권 쿠폰을 발급·회수합니다. (슈퍼어드민 전용)</p>
      </div>

      {/* 발급 폼 */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <h2 className="font-bold text-gray-900">쿠폰 발급</h2>
        {formError && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{formError}</div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">챌린지 ID</label>
            <input
              value={form.challengeId}
              onChange={(e) => setForm((p) => ({ ...p, challengeId: e.target.value }))}
              disabled={form.anyChallenge}
              placeholder="특정 챌린지 한정 쿠폰"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm disabled:bg-gray-100"
            />
            <label className="mt-2 flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.anyChallenge}
                onChange={(e) => setForm((p) => ({ ...p, anyChallenge: e.target.checked }))}
                className="rounded"
              />
              전체 챌린지 공용 (ANY)
            </label>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">지정 사용자 ID (선택)</label>
            <input
              value={form.issuedToUserId}
              onChange={(e) => setForm((p) => ({ ...p, issuedToUserId: e.target.value }))}
              placeholder="지정 시 해당 사용자만 사용 가능"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">발급 수량 (1~50)</label>
            <input
              type="number"
              min={1}
              max={50}
              value={form.count}
              onChange={(e) => setForm((p) => ({ ...p, count: Number(e.target.value) }))}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">만료일 (선택 — 없으면 무기한)</label>
            <input
              type="datetime-local"
              value={form.expiresAt}
              onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">메모 (선택, 최대 200자)</label>
            <input
              value={form.memo}
              maxLength={200}
              onChange={(e) => setForm((p) => ({ ...p, memo: e.target.value }))}
              placeholder="예: 얼리버드 프로모션"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleIssue}
          disabled={issueMutation.isPending}
          className="px-4 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-50"
        >
          {issueMutation.isPending ? '발급 중...' : '쿠폰 발급'}
        </button>
      </div>

      {/* 발급 결과 */}
      {issued.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-emerald-900">발급 완료 · {issued.length}장</h2>
            <CopyButton text={issued.map((c) => c.code).join('\n')} label="코드 전체 복사" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {issued.map((c) => (
              <div key={c.code} className="flex items-center justify-between bg-white border border-emerald-200 rounded-xl px-3 py-2">
                <span className="font-mono text-sm font-semibold text-gray-900">{c.code}</span>
                <CopyButton text={c.code} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 전체 쿠폰 테이블 */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="p-4 flex items-center justify-between border-b border-gray-100">
          <h2 className="font-bold text-gray-900">전체 쿠폰 {coupons ? `(${coupons.length})` : ''}</h2>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 disabled:opacity-50"
          >
            {isFetching ? '갱신 중...' : '새로고침'}
          </button>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">쿠폰 목록을 불러오는 중...</div>
        ) : (coupons?.length ?? 0) === 0 ? (
          <div className="p-8 text-center text-gray-400">발급된 쿠폰이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">코드</th>
                  <th className="text-left px-4 py-3 font-semibold">챌린지</th>
                  <th className="text-left px-4 py-3 font-semibold">지정 사용자</th>
                  <th className="text-left px-4 py-3 font-semibold">상태</th>
                  <th className="text-left px-4 py-3 font-semibold">만료일</th>
                  <th className="text-left px-4 py-3 font-semibold">발급일</th>
                  <th className="text-left px-4 py-3 font-semibold">메모</th>
                  <th className="text-right px-4 py-3 font-semibold">액션</th>
                </tr>
              </thead>
              <tbody>
                {(coupons ?? []).map((c) => {
                  const badge = STATUS_BADGE[c.status] ?? { label: c.status, cls: 'bg-gray-100 text-gray-700' };
                  return (
                    <tr key={c.code} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-900 whitespace-nowrap">
                        {c.code} <CopyButton text={c.code} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">
                        {c.challengeId === 'ANY' ? <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-sans">전체(ANY)</span> : c.challengeId.slice(0, 12)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">{c.issuedToUserId ? c.issuedToUserId.slice(0, 12) : '미지정'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${badge.cls}`}>{badge.label}</span>
                        {c.status === 'redeemed' && c.redeemedAt && (
                          <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(c.redeemedAt)}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{c.expiresAt ? formatDate(c.expiresAt) : '무기한'}</td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDate(c.createdAt)}</td>
                      <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate" title={c.memo ?? undefined}>{c.memo || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        {c.status === 'active' && (
                          <button
                            type="button"
                            onClick={() => handleRevoke(c)}
                            disabled={revokeMutation.isPending}
                            className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
                          >
                            회수
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
