import { apiClient } from '@/lib/api-client';

export type OrderStatus = 'awaiting_deposit' | 'paid' | 'rejected' | 'canceled' | 'expired';
export type OrderMethod = 'coupon' | 'manual_deposit';
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
};
