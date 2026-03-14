import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { handler as runPlazaConvertHandler } from "../../../plaza/convert-verifications/index";

const ALLOWED_GROUPS = new Set(["admins", "productowners", "managers"]);

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
    },
    body: JSON.stringify(body),
  };
}

function parseGroups(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).map((g) => g.trim()).filter(Boolean);
  if (typeof raw !== "string") return [];

  const value = raw.trim();
  if (!value) return [];

  if (value.startsWith("[") && value.endsWith("]")) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).map((g) => g.trim()).filter(Boolean);
    } catch {
      // fall through to delimiter parsing
    }
  }

  return value
    .split(/[,:]/)
    .map((g) => g.replace(/[\[\]"']/g, "").trim())
    .filter(Boolean);
}

function isAuthorized(event: APIGatewayProxyEvent): boolean {
  const groups = parseGroups(event.requestContext.authorizer?.jwt?.claims["cognito:groups"]);
  return groups.some((group) => ALLOWED_GROUPS.has(group));
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!isAuthorized(event)) {
      return response(403, { error: "FORBIDDEN", message: "관리자 권한이 필요합니다." });
    }

    const runResult = await runPlazaConvertHandler({} as any);

    return response(200, {
      success: true,
      message: "광장 변환을 즉시 실행했습니다.",
      data: runResult,
    });
  } catch (error: any) {
    console.error("admin/plaza/convert-run-now error", error);
    return response(500, { error: "INTERNAL_SERVER_ERROR", message: "작업 실행 중 오류가 발생했습니다." });
  }
};
