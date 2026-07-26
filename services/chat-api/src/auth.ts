import { CognitoJwtVerifier } from 'aws-jwt-verify';

/**
 * WebSocket $connect 토큰 검증 — WebSocket API에는 HTTP API의 JWT authorizer가 없으므로
 * 여기서 직접 Cognito 토큰을 검증한다. 프론트는 브라우저 WebSocket이 헤더를 못 붙이므로
 * 쿼리스트링 `?token=` 으로 토큰을 전달한다.
 *
 * 프론트가 저장하는 accessToken 은 실제로 aud=clientId 인 **idToken** 이다
 * (api-client 주석 참고) → tokenUse 'id' 로 검증한다.
 */
let verifier: ReturnType<typeof CognitoJwtVerifier.create> | undefined;

function getVerifier() {
  const userPoolId = process.env.USER_POOL_ID;
  const clientId = process.env.USER_POOL_CLIENT_ID;
  if (!userPoolId || !clientId) throw new Error('COGNITO_ENV_MISSING');
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({ userPoolId, tokenUse: 'id', clientId });
  }
  return verifier;
}

/** 토큰이 유효하면 userId(sub)를 반환, 아니면 throw. */
export async function verifyToken(token: string): Promise<{ userId: string }> {
  const payload = await getVerifier().verify(token);
  return { userId: payload.sub };
}
