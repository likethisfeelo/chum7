import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(8, '비밀번호는 최소 8자 이상이어야 합니다')
  .regex(/[A-Z]/, '비밀번호에 대문자가 포함되어야 합니다')
  .regex(/[a-z]/, '비밀번호에 소문자가 포함되어야 합니다')
  .regex(/[0-9]/, '비밀번호에 숫자가 포함되어야 합니다');

export const registerSchema = z.object({
  email: z.string().email('유효한 이메일 주소를 입력해주세요'),
  password: passwordSchema,
  name: z.string().min(2, '이름은 최소 2자 이상이어야 합니다').max(50),
});

export const confirmSignUpSchema = z.object({
  email: z.string().email('유효한 이메일 주소를 입력해주세요'),
  confirmationCode: z.string().trim().length(6, '인증 코드는 6자리입니다'),
});

export const resendConfirmationSchema = z.object({
  action: z.literal('resendConfirmation'),
  email: z.string().email('유효한 이메일 주소를 입력해주세요'),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const forgotPasswordSchema = z.object({
  action: z.literal('forgotPassword'),
  email: z.string().email(),
});

export const confirmForgotPasswordSchema = z.object({
  action: z.literal('confirmForgotPassword'),
  email: z.string().email(),
  confirmationCode: z.string().trim().length(6, '인증 코드는 6자리입니다'),
  newPassword: passwordSchema,
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;

export interface AuthTokens {
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn?: number;
}
