import { apiClient } from '@/lib/api-client';

export type OrderStatus = 'awaiting_deposit' | 'paid' | 'rejected' | 'canceled' | 'expired';
export type OrderMethod = 'coupon' | 'manual_deposit' | 'ticket';

export interface Ticket {
  ticketId: string;
  challengeId: string;
  challengeTitle?: string | null;
  leaderId: string;
  userId: string;
  status: 'offered' | 'consumed' | 'revoked';
  createdAt: string;
  consumedAt?: string | null;
}

export interface TicketRequest {
  challengeId: string;
  userId: string;
  message?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  rejectReason?: string | null;
}

export interface GiftCatalogItem {
  giftId: string;
  challengeId: string;
  name: string;
  description?: string | null;
  type: 'digital' | 'physical';
  createdAt: string;
}

export interface Voucher {
  voucherId: string;
  challengeId: string;
  challengeTitle?: string | null;
  leaderId: string;
  userId: string;
  giftName: string;
  giftDescription?: string | null;
  type: 'digital' | 'physical';
  status: 'issued' | 'claimed' | 'shipped' | 'delivered' | 'expired';
  createdAt: string;
  expiresAt: string;
  claimedAt?: string | null;
  recipient?: { name: string; phone: string; address: string } | null;
  shippedAt?: string | null;
  trackingInfo?: string | null;
  deliveredAt?: string | null;
}

export interface LeaderGiftStatus {
  catalog: GiftCatalogItem[];
  completers: Array<{ userId: string; score?: number }>;
  vouchers: Voucher[];
}

export interface LeaderTicketStatus {
  quota: { total: number; issued: number; remaining: number };
  batches: Array<{ batchId: string; total: number; issued: number; createdAt: string }>;
  tickets: Ticket[];
  requests: TicketRequest[];
  pendingRequests: number;
}
export type PricingType = 'free' | 'paid_fee' | 'paid_deposit';

export interface Order {
  orderId: string;
  userId: string;
  challengeId: string;
  challengeTitle: string | null;
  amount: number;
  pricingType: PricingType;
  method: OrderMethod;
  status: OrderStatus;
  couponCode?: string | null;
  depositorName?: string | null;
  paidAt?: string | null;
  createdAt: string;
}

export interface CreateOrderResult {
  order: Order;
  guide?: {
    message: string;
    expiresInHours: number;
  };
}

export interface Coupon {
  code: string;
  challengeId: string; // 'ANY' 허용
  status: 'active' | 'redeemed' | 'revoked';
  expiresAt?: string | null;
  memo?: string | null;
  createdAt: string;
  redeemedAt?: string | null;
}

/** 챌린지가 결제(주문)를 요구하는지 판정 */
export const isPaidChallenge = (challenge?: {
  pricingType?: string;
  price?: number;
} | null): boolean => {
  if (!challenge) return false;
  if (challenge.pricingType === 'paid_fee' || challenge.pricingType === 'paid_deposit') return true;
  return Number(challenge.price ?? 0) > 0;
};

export const ORDER_STATUS_META: Record<OrderStatus, { label: string; badgeClass: string }> = {
  awaiting_deposit: { label: '입금 대기', badgeClass: 'bg-amber-100 text-amber-700' },
  paid: { label: '결제 완료', badgeClass: 'bg-green-100 text-green-700' },
  rejected: { label: '거절됨', badgeClass: 'bg-red-100 text-red-700' },
  canceled: { label: '취소됨', badgeClass: 'bg-gray-100 text-gray-500' },
  expired: { label: '기한 만료', badgeClass: 'bg-gray-100 text-gray-500' },
};

export const commerceApi = {
  createOrder: async (params: {
    challengeId: string;
    method: OrderMethod;
    couponCode?: string;
    depositorName?: string;
  }): Promise<CreateOrderResult> => {
    const res = await apiClient.post('/pay/orders', params);
    return res.data.data as CreateOrderResult;
  },

  getMyOrders: async (): Promise<{ orders: Order[]; total: number }> => {
    const res = await apiClient.get('/pay/orders/my');
    return res.data.data ?? { orders: [], total: 0 };
  },

  getOrder: async (orderId: string): Promise<Order | null> => {
    const res = await apiClient.get(`/pay/orders/${orderId}`);
    return (res.data.data?.order ?? null) as Order | null;
  },

  cancelOrder: async (orderId: string): Promise<{ orderId: string; status: OrderStatus }> => {
    const res = await apiClient.post(`/pay/orders/${orderId}/cancel`);
    return res.data.data;
  },

  getMyCoupons: async (): Promise<{ coupons: Coupon[]; total: number }> => {
    const res = await apiClient.get('/pay/orders/coupons/my');
    return res.data.data ?? { coupons: [], total: 0 };
  },

  // ── 유료 조인 티켓 ──────────────────────────────────────────────────────
  getMyTickets: async (): Promise<{ tickets: Ticket[]; total: number }> => {
    const res = await apiClient.get('/pay/tickets/my');
    return res.data.data ?? { tickets: [], total: 0 };
  },

  getMyTicketRequest: async (challengeId: string): Promise<TicketRequest | null> => {
    const res = await apiClient.get(`/pay/tickets/my/request/${challengeId}`);
    return (res.data.data?.request ?? null) as TicketRequest | null;
  },

  requestTicket: async (challengeId: string, message?: string) => {
    const res = await apiClient.post('/pay/tickets/request', { challengeId, ...(message ? { message } : {}) });
    return res.data.data;
  },

  useTicket: async (ticketId: string): Promise<{ orderId: string; ticketId: string; status: string }> => {
    const res = await apiClient.post(`/pay/tickets/${ticketId}/use`);
    return res.data.data;
  },

  getLeaderTicketStatus: async (challengeId: string): Promise<LeaderTicketStatus> => {
    const res = await apiClient.get(`/pay/tickets/leader/${challengeId}`);
    return res.data.data as LeaderTicketStatus;
  },

  grantTicket: async (challengeId: string, toUserId: string, fromRequest?: boolean) => {
    const res = await apiClient.post(`/pay/tickets/leader/${challengeId}/grant`, {
      toUserId,
      ...(fromRequest ? { fromRequest: true } : {}),
    });
    return res.data.data;
  },

  rejectTicketRequest: async (challengeId: string, userId: string, reason?: string) => {
    const res = await apiClient.post(`/pay/tickets/leader/${challengeId}/requests/${userId}/reject`, reason ? { reason } : {});
    return res.data.data;
  },

  // ── 완주 선물 교환권 ────────────────────────────────────────────────────
  getMyVouchers: async (): Promise<{ vouchers: Voucher[]; total: number }> => {
    const res = await apiClient.get('/pay/gifts/my');
    return res.data.data ?? { vouchers: [], total: 0 };
  },

  claimVoucher: async (
    voucherId: string,
    recipient?: { name: string; phone: string; address: string },
  ) => {
    const res = await apiClient.post(`/pay/gifts/${voucherId}/claim`, recipient ?? {});
    return res.data;
  },

  confirmVoucherReceipt: async (voucherId: string) => {
    const res = await apiClient.post(`/pay/gifts/${voucherId}/confirm-receipt`);
    return res.data;
  },

  getLeaderGiftStatus: async (challengeId: string): Promise<LeaderGiftStatus> => {
    const res = await apiClient.get(`/pay/gifts/leader/${challengeId}`);
    return res.data.data as LeaderGiftStatus;
  },

  addGiftCatalogItem: async (
    challengeId: string,
    params: { name: string; description?: string; type: 'digital' | 'physical' },
  ) => {
    const res = await apiClient.post(`/pay/gifts/leader/${challengeId}/catalog`, params);
    return res.data.data;
  },

  deleteGiftCatalogItem: async (challengeId: string, giftId: string) => {
    const res = await apiClient.delete(`/pay/gifts/leader/${challengeId}/catalog/${giftId}`);
    return res.data.data;
  },

  sendGift: async (
    challengeId: string,
    params: { toUserId: string; giftId?: string; name?: string; description?: string; type?: 'digital' | 'physical'; expiresAt?: string },
  ) => {
    const res = await apiClient.post(`/pay/gifts/leader/${challengeId}/send`, params);
    return res.data;
  },

  sendGiftBatch: async (challengeId: string, params: { giftId: string; userIds: string[]; expiresAt?: string }) => {
    const res = await apiClient.post(`/pay/gifts/leader/${challengeId}/send-batch`, params);
    return res.data;
  },

  editVoucher: async (
    challengeId: string,
    voucherId: string,
    patch: { giftName?: string; giftDescription?: string; expiresAt?: string },
  ) => {
    const res = await apiClient.patch(`/pay/gifts/leader/${challengeId}/vouchers/${voucherId}`, patch);
    return res.data;
  },

  shipVoucher: async (challengeId: string, voucherId: string, trackingInfo?: string) => {
    const res = await apiClient.post(`/pay/gifts/leader/${challengeId}/vouchers/${voucherId}/ship`, trackingInfo ? { trackingInfo } : {});
    return res.data;
  },
};
