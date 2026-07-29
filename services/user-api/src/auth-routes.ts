import { Hono } from 'hono';
import {
  confirmForgotPasswordSchema,
  confirmSignUpSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resendConfirmationSchema,
} from '@chum7/contracts';
import { AppEnv, fail, ok } from '@chum7/api-kit';
import {
  clientId,
  cognito,
  ConfirmForgotPasswordCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  InitiateAuthCommand,
  isEmailVerified,
  mapCognitoError,
  parseIdTokenPayload,
  ResendConfirmationCodeCommand,
  SignUpCommand,
} from './cognito';
import { getProfile, newUserProfile, putProfile } from './users-repo';

/**
 * /auth/* — 퍼블릭 라우트 (JWT authorizer 없음).
 * 기존 backend/services/auth/{register,login,refresh-token} 핸들러의 계약을 승계한다.
 */
export const authRoutes = new Hono<AppEnv>();

/**
 * GET /auth/social/config — 프론트가 소셜 로그인 팝업의 authorize URL을 구성하는 데 필요한
 * 공개 값(Hosted UI 도메인·clientId·활성 제공자). 시크릿은 노출하지 않는다.
 * providers가 비어 있으면 프론트는 소셜 버튼을 숨긴다(롤아웃 전 안전).
 */
authRoutes.get('/social/config', (c) => {
  const hostedUiDomain = process.env.COGNITO_HOSTED_UI_DOMAIN || '';
  const providers = (process.env.SOCIAL_LOGIN_PROVIDERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return ok(c, {
    enabled: Boolean(hostedUiDomain) && providers.length > 0,
    hostedUiDomain,
    clientId: process.env.USER_POOL_CLIENT_ID || '',
    providers,
    scopes: ['openid', 'email', 'profile'],
  });
});

authRoutes.post('/register', async (c) => {
  const body = await c.req.json().catch(() => ({}));

  // Cognito 예외를 의미 있는 메시지로 매핑 — 재발송/확인/가입 전 분기를 한 try로 감싼다
  // (기존엔 재발송·확인 분기가 try 밖이라 Cognito 에러가 그대로 500 "서버 오류"로 노출됐다)
  try {
    if (body.action === 'resendConfirmation') {
      const input = resendConfirmationSchema.parse(body);
      await cognito.send(
        new ResendConfirmationCodeCommand({ ClientId: clientId(), Username: input.email }),
      );
      return ok(c, undefined, '인증 코드를 다시 발송했습니다. 메일함을 확인해주세요.');
    }

    if (typeof body.confirmationCode === 'string') {
      const input = confirmSignUpSchema.parse(body);
      await cognito.send(
        new ConfirmSignUpCommand({
          ClientId: clientId(),
          Username: input.email,
          ConfirmationCode: input.confirmationCode,
        }),
      );
      return ok(c, undefined, '이메일 인증이 완료되었습니다. 로그인해주세요.');
    }

    const input = registerSchema.parse(body);
    const signUpResult = await cognito.send(
      new SignUpCommand({
        ClientId: clientId(),
        Username: input.email,
        Password: input.password,
        UserAttributes: [
          { Name: 'email', Value: input.email },
          { Name: 'name', Value: input.name },
        ],
      }),
    );
    const userId = signUpResult.UserSub;
    if (!userId) {
      return fail(c, 500, 'SIGNUP_FAILED', '회원가입 처리에 실패했습니다');
    }
    await putProfile(newUserProfile(userId, input.email, input.name));
    return ok(
      c,
      { userId, email: input.email, needsEmailVerification: true },
      '가입 확인 메일을 발송했습니다. 이메일 인증 후 로그인해주세요.',
      201,
    );
  } catch (error) {
    const mapped = mapCognitoError(error as { name?: string });
    if (mapped) return fail(c, mapped.status, mapped.code, mapped.message, { data: mapped.data });
    throw error; // ZodError 등은 api-kit onError가 처리(400)
  }
});

authRoutes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));

  try {
    if (body.action === 'forgotPassword') {
      const input = forgotPasswordSchema.parse(body);
      await cognito.send(new ForgotPasswordCommand({ ClientId: clientId(), Username: input.email }));
      return ok(c, undefined, '비밀번호 재설정 인증 코드를 이메일로 발송했습니다');
    }

    if (body.action === 'confirmForgotPassword') {
      const input = confirmForgotPasswordSchema.parse(body);
      await cognito.send(
        new ConfirmForgotPasswordCommand({
          ClientId: clientId(),
          Username: input.email,
          ConfirmationCode: input.confirmationCode,
          Password: input.newPassword,
        }),
      );
      return ok(c, undefined, '비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.');
    }

    const input = loginSchema.parse(body);
    const authResult = await cognito.send(
      new InitiateAuthCommand({
        ClientId: clientId(),
        AuthFlow: 'USER_PASSWORD_AUTH',
        AuthParameters: { USERNAME: input.email, PASSWORD: input.password },
      }),
    );

    if (!authResult.AuthenticationResult) {
      return fail(c, 401, 'AUTHENTICATION_FAILED', '로그인에 실패했습니다');
    }

    const idToken = authResult.AuthenticationResult.IdToken;
    const tokenPayload = parseIdTokenPayload(idToken);
    const userId = tokenPayload?.sub;
    if (!userId) {
      return fail(c, 500, 'INVALID_IDENTITY_TOKEN', '사용자 식별 정보 확인에 실패했습니다');
    }
    if (!isEmailVerified(tokenPayload)) {
      return fail(c, 403, 'EMAIL_NOT_VERIFIED', '이메일 인증이 완료되지 않았습니다. 메일함에서 인증을 완료해주세요', {
        data: { email: input.email, needsEmailVerification: true },
      });
    }

    const user = await getProfile(userId);
    if (!user) {
      return fail(c, 409, 'USER_PROFILE_NOT_READY', '계정 정보 동기화가 필요합니다. 다시 회원가입을 진행해주세요');
    }

    return ok(
      c,
      {
        tokens: {
          accessToken: authResult.AuthenticationResult.AccessToken,
          refreshToken: authResult.AuthenticationResult.RefreshToken,
          idToken,
          expiresIn: authResult.AuthenticationResult.ExpiresIn,
        },
        user: {
          userId: user.userId,
          email: user.email,
          name: user.name,
          profileImageUrl: user.profileImageUrl,
          animalIcon: user.animalIcon,
          level: user.level,
          exp: user.exp,
        },
      },
      '로그인 성공',
    );
  } catch (error) {
    const mapped = mapCognitoError(error as { name?: string });
    if (mapped) return fail(c, mapped.status, mapped.code, mapped.message, { data: mapped.data });
    throw error;
  }
});

authRoutes.post('/refresh', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const input = refreshSchema.parse(body);
  try {
    const authResult = await cognito.send(
      new InitiateAuthCommand({
        ClientId: clientId(),
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        AuthParameters: { REFRESH_TOKEN: input.refreshToken },
      }),
    );
    if (!authResult.AuthenticationResult) {
      return fail(c, 401, 'REFRESH_FAILED', '토큰 갱신에 실패했습니다');
    }
    return ok(c, {
      accessToken: authResult.AuthenticationResult.AccessToken,
      idToken: authResult.AuthenticationResult.IdToken,
      expiresIn: authResult.AuthenticationResult.ExpiresIn,
    });
  } catch (error) {
    if ((error as { name?: string }).name === 'NotAuthorizedException') {
      return fail(c, 401, 'INVALID_REFRESH_TOKEN', '유효하지 않은 리프레시 토큰입니다');
    }
    throw error;
  }
});
