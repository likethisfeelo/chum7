import {
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  InitiateAuthCommand,
  ResendConfirmationCodeCommand,
  SignUpCommand,
} from '@aws-sdk/client-cognito-identity-provider';

export const cognito = new CognitoIdentityProviderClient({});

export function clientId(): string {
  const value = process.env.USER_POOL_CLIENT_ID;
  if (!value) throw new Error('Missing USER_POOL_CLIENT_ID');
  return value;
}

export {
  ConfirmForgotPasswordCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  InitiateAuthCommand,
  ResendConfirmationCodeCommand,
  SignUpCommand,
};

interface IdTokenPayload {
  sub?: string;
  email_verified?: boolean | string;
}

export function parseIdTokenPayload(idToken?: string): IdTokenPayload | null {
  if (!idToken) return null;
  try {
    const payload = idToken.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as IdTokenPayload;
  } catch {
    return null;
  }
}

export function isEmailVerified(payload: IdTokenPayload | null): boolean {
  if (!payload || payload.email_verified === undefined) return true;
  return payload.email_verified === true || payload.email_verified === 'true';
}

/** Cognito 예외 → (status, error code, message) 매핑 — 기존 핸들러 계약 승계 */
export function mapCognitoError(error: { name?: string }):
  | { status: number; code: string; message: string; data?: unknown }
  | null {
  switch (error.name) {
    case 'NotAuthorizedException':
      return { status: 401, code: 'INVALID_CREDENTIALS', message: '이메일 또는 비밀번호가 올바르지 않습니다' };
    case 'UserNotConfirmedException':
      return {
        status: 403,
        code: 'USER_NOT_CONFIRMED',
        message: '이메일 인증이 완료되지 않았습니다. 메일함을 확인해주세요',
        data: { needsEmailVerification: true },
      };
    case 'UserNotFoundException':
      return { status: 404, code: 'USER_NOT_FOUND', message: '존재하지 않는 사용자입니다' };
    case 'UsernameExistsException':
      return { status: 409, code: 'EMAIL_ALREADY_EXISTS', message: '이미 가입된 이메일입니다' };
    case 'InvalidParameterException':
      return {
        status: 400,
        code: 'INVALID_PARAMETER',
        message: '요청 값이 올바르지 않습니다',
      };
    case 'CodeMismatchException':
      return { status: 400, code: 'INVALID_CONFIRMATION_CODE', message: '인증 코드가 올바르지 않습니다' };
    case 'ExpiredCodeException':
      return { status: 400, code: 'EXPIRED_CONFIRMATION_CODE', message: '인증 코드가 만료되었습니다. 새 코드를 요청해주세요' };
    case 'LimitExceededException':
      return { status: 429, code: 'TOO_MANY_REQUESTS', message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요' };
    default:
      return null;
  }
}
