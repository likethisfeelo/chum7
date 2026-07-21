import { Hono } from 'hono';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

export interface AuthUser {
  userId: string;
  email?: string;
  /** Cognito 그룹 (admins / operators / creators) */
  groups: string[];
}

export interface AppEnv {
  Variables: {
    requestId: string;
    authUser?: AuthUser;
  };
  Bindings: {
    /** hono/aws-lambda 어댑터가 주입하는 원본 이벤트 */
    event: unknown;
    lambdaContext?: unknown;
  };
}

export type ApiContext = Context<AppEnv>;

/** 성공 응답 — 기존 envelope { success, message?, data? } 계약 유지 */
export function ok(c: ApiContext, data?: unknown, message?: string, status = 200) {
  return c.json({ success: true, ...(message ? { message } : {}), ...(data !== undefined ? { data } : {}) }, status as never);
}

/** 실패 응답 — 기존 envelope { error, message, details?, data? } 계약 유지 */
export function fail(
  c: ApiContext,
  status: number,
  error: string,
  message: string,
  extra?: { details?: unknown; data?: unknown },
) {
  return c.json({ error, message, ...(extra ?? {}) }, status as never);
}

interface JwtClaims {
  sub?: string;
  email?: string;
  'cognito:groups'?: string | string[];
  [key: string]: unknown;
}

function extractClaims(event: unknown): JwtClaims | undefined {
  const anyEvent = event as {
    requestContext?: { authorizer?: { jwt?: { claims?: JwtClaims } } };
  };
  return anyEvent?.requestContext?.authorizer?.jwt?.claims;
}

function parseGroups(claims: JwtClaims): string[] {
  const raw = claims['cognito:groups'];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    // API GW v2는 그룹을 "[admins operators]" 형태 문자열로 전달할 수 있다
    return raw.replace(/^\[|\]$/g, '').split(/[\s,]+/).filter(Boolean);
  }
  return [];
}

/** JWT authorizer 클레임을 컨텍스트에 주입. 클레임이 없으면 401 (프록시 라우트에 authorizer가 있는 것이 전제) */
export function requireAuth() {
  return async (c: ApiContext, next: () => Promise<void>) => {
    const claims = extractClaims(c.env.event);
    if (!claims?.sub) {
      throw new HTTPException(401, { message: 'UNAUTHORIZED' });
    }
    c.set('authUser', {
      userId: claims.sub,
      email: typeof claims.email === 'string' ? claims.email : undefined,
      groups: parseGroups(claims),
    });
    await next();
  };
}

/** 특정 Cognito 그룹 보유를 요구 (admin-api 영역 격리용) */
export function requireGroup(...allowed: string[]) {
  return async (c: ApiContext, next: () => Promise<void>) => {
    const user = c.get('authUser');
    if (!user) throw new HTTPException(401, { message: 'UNAUTHORIZED' });
    if (!user.groups.some((g) => allowed.includes(g))) {
      throw new HTTPException(403, { message: 'FORBIDDEN' });
    }
    await next();
  };
}

export interface CreateApiOptions {
  /** 서비스명 — 구조화 로그의 service 필드 */
  service: string;
}

/**
 * Hono 앱 팩토리 — requestId·구조화 로깅·에러→envelope 매핑을 표준화한다.
 * CORS는 API Gateway 레벨에서 처리하므로 여기서 헤더를 만들지 않는다.
 */
export function createApi(options: CreateApiOptions) {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    const requestId =
      c.req.header('x-request-id') ?? Math.random().toString(36).slice(2, 12);
    c.set('requestId', requestId);
    const startedAt = Date.now();
    await next();
    console.log(
      JSON.stringify({
        level: 'info',
        service: options.service,
        requestId,
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs: Date.now() - startedAt,
      }),
    );
  });

  app.onError((err, c) => {
    const requestId = c.get('requestId');
    if (err instanceof z.ZodError) {
      return c.json(
        { error: 'VALIDATION_ERROR', message: '입력값이 올바르지 않습니다', details: err.errors },
        400,
      );
    }
    if (err instanceof HTTPException) {
      const code = err.status === 401 ? 'UNAUTHORIZED' : err.status === 403 ? 'FORBIDDEN' : 'HTTP_ERROR';
      return c.json({ error: code, message: err.message }, err.status);
    }
    console.error(
      JSON.stringify({
        level: 'error',
        service: options.service,
        requestId,
        name: (err as Error).name,
        message: (err as Error).message,
        stack: (err as Error).stack,
      }),
    );
    return c.json({ error: 'INTERNAL_SERVER_ERROR', message: '서버 오류가 발생했습니다' }, 500);
  });

  app.notFound((c) =>
    c.json({ error: 'NOT_FOUND', message: '요청한 리소스를 찾을 수 없습니다' }, 404),
  );

  return app;
}
