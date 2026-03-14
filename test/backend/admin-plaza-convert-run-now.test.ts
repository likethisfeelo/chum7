import { APIGatewayProxyEvent } from "aws-lambda";

const runConvertMock = jest.fn();

jest.mock("../../backend/services/plaza/convert-verifications/index", () => ({
  handler: (...args: any[]) => runConvertMock(...args),
}));

function buildEvent(groups: unknown = "admins"): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: "POST",
    isBase64Encoded: false,
    path: "/admin/plaza/convert/run-now",
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: "",
    requestContext: {
      accountId: "",
      apiId: "",
      protocol: "",
      httpMethod: "POST",
      identity: {} as any,
      path: "",
      stage: "",
      requestId: "",
      requestTimeEpoch: 0,
      resourceId: "",
      resourcePath: "",
      authorizer: {
        jwt: {
          claims: {
            sub: "admin-1",
            "cognito:groups": groups as any,
          },
          scopes: [],
        },
      } as any,
    },
  } as APIGatewayProxyEvent;
}

describe("admin plaza convert run-now handler", () => {
  beforeEach(() => {
    runConvertMock.mockReset();
  });

  it("returns FORBIDDEN for unauthorized group", async () => {
    const { handler } = await import("../../backend/services/admin/plaza/convert-run-now/index");
    const res = await handler(buildEvent("participants"));

    expect(res.statusCode).toBe(403);
    expect(runConvertMock).not.toHaveBeenCalled();
  });

  it("runs convert handler for authorized manager", async () => {
    runConvertMock.mockResolvedValueOnce({ success: true, converted: 7 });

    const { handler } = await import("../../backend/services/admin/plaza/convert-run-now/index");
    const res = await handler(buildEvent('["managers"]'));

    expect(res.statusCode).toBe(200);
    expect(runConvertMock).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(res.body);
    expect(parsed.success).toBe(true);
    expect(parsed.data.converted).toBe(7);
  });

  it("returns INTERNAL_SERVER_ERROR when convert handler throws", async () => {
    runConvertMock.mockRejectedValueOnce(new Error("boom"));

    const { handler } = await import("../../backend/services/admin/plaza/convert-run-now/index");
    const res = await handler(buildEvent("admins"));

    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toBe("INTERNAL_SERVER_ERROR");
  });
});
