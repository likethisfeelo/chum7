"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_apigatewayv2_1 = require("aws-cdk-lib/aws-apigatewayv2");
const aws_apigatewayv2_authorizers_1 = require("aws-cdk-lib/aws-apigatewayv2-authorizers");
class ApiStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { stage, userPoolId, userPoolClientId } = props;
        const corsConfig = {
            allowOrigins: stage === 'prod'
                ? ['https://www.chum7.com']
                : ['*'],
            allowMethods: [
                aws_apigatewayv2_1.CorsHttpMethod.GET,
                aws_apigatewayv2_1.CorsHttpMethod.POST,
                aws_apigatewayv2_1.CorsHttpMethod.PUT,
                aws_apigatewayv2_1.CorsHttpMethod.DELETE,
                aws_apigatewayv2_1.CorsHttpMethod.OPTIONS,
            ],
            allowHeaders: ['Content-Type', 'Authorization'],
            maxAge: aws_cdk_lib_1.Duration.days(1),
        };
        this.apiGateway = new aws_apigatewayv2_1.HttpApi(this, 'ApiGateway', {
            apiName: `chme-${stage}-api`,
            corsPreflight: corsConfig,
        });
        this.cognitoAuthorizer = new aws_apigatewayv2_authorizers_1.HttpJwtAuthorizer('CognitoAuthorizer', `https://cognito-idp.${this.region}.amazonaws.com/${userPoolId}`, { jwtAudience: [userPoolClientId] });
        new aws_cdk_lib_1.CfnOutput(this, 'ApiUrl', { value: this.apiGateway.apiEndpoint });
    }
}
exports.ApiStack = ApiStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBpLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYXBpLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDZDQUFxRTtBQUVyRSxtRUFJc0M7QUFDdEMsMkZBQTZFO0FBUTdFLE1BQWEsUUFBUyxTQUFRLG1CQUFLO0lBSWpDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBb0I7UUFDNUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFFdEQsTUFBTSxVQUFVLEdBQXlCO1lBQ3ZDLFlBQVksRUFDVixLQUFLLEtBQUssTUFBTTtnQkFDZCxDQUFDLENBQUMsQ0FBQyx1QkFBdUIsQ0FBQztnQkFDM0IsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDO1lBQ1gsWUFBWSxFQUFFO2dCQUNaLGlDQUFjLENBQUMsR0FBRztnQkFDbEIsaUNBQWMsQ0FBQyxJQUFJO2dCQUNuQixpQ0FBYyxDQUFDLEdBQUc7Z0JBQ2xCLGlDQUFjLENBQUMsTUFBTTtnQkFDckIsaUNBQWMsQ0FBQyxPQUFPO2FBQ3ZCO1lBQ0QsWUFBWSxFQUFFLENBQUMsY0FBYyxFQUFFLGVBQWUsQ0FBQztZQUMvQyxNQUFNLEVBQUUsc0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1NBQ3pCLENBQUM7UUFFRixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksMEJBQU8sQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFO1lBQ2hELE9BQU8sRUFBRSxRQUFRLEtBQUssTUFBTTtZQUM1QixhQUFhLEVBQUUsVUFBVTtTQUMxQixDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsaUJBQWlCLEdBQUcsSUFBSSxnREFBaUIsQ0FDNUMsbUJBQW1CLEVBQ25CLHVCQUF1QixJQUFJLENBQUMsTUFBTSxrQkFBa0IsVUFBVSxFQUFFLEVBQ2hFLEVBQUUsV0FBVyxFQUFFLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxDQUNwQyxDQUFDO1FBRUYsSUFBSSx1QkFBUyxDQUFDLElBQUksRUFBRSxRQUFRLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO0lBQ3hFLENBQUM7Q0FDRjtBQXRDRCw0QkFzQ0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTdGFjaywgU3RhY2tQcm9wcywgRHVyYXRpb24sIENmbk91dHB1dCB9IGZyb20gJ2F3cy1jZGstbGliJztcclxuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XHJcbmltcG9ydCB7XHJcbiAgSHR0cEFwaSxcclxuICBDb3JzSHR0cE1ldGhvZCxcclxuICBDb3JzUHJlZmxpZ2h0T3B0aW9ucyxcclxufSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheXYyJztcclxuaW1wb3J0IHsgSHR0cEp3dEF1dGhvcml6ZXIgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheXYyLWF1dGhvcml6ZXJzJztcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgQXBpU3RhY2tQcm9wcyBleHRlbmRzIFN0YWNrUHJvcHMge1xyXG4gIHN0YWdlOiBzdHJpbmc7XHJcbiAgdXNlclBvb2xJZDogc3RyaW5nO1xyXG4gIHVzZXJQb29sQ2xpZW50SWQ6IHN0cmluZztcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIEFwaVN0YWNrIGV4dGVuZHMgU3RhY2sge1xyXG4gIHB1YmxpYyByZWFkb25seSBhcGlHYXRld2F5OiBIdHRwQXBpO1xyXG4gIHB1YmxpYyByZWFkb25seSBjb2duaXRvQXV0aG9yaXplcjogSHR0cEp3dEF1dGhvcml6ZXI7XHJcblxyXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBBcGlTdGFja1Byb3BzKSB7XHJcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcclxuXHJcbiAgICBjb25zdCB7IHN0YWdlLCB1c2VyUG9vbElkLCB1c2VyUG9vbENsaWVudElkIH0gPSBwcm9wcztcclxuXHJcbiAgICBjb25zdCBjb3JzQ29uZmlnOiBDb3JzUHJlZmxpZ2h0T3B0aW9ucyA9IHtcclxuICAgICAgYWxsb3dPcmlnaW5zOlxyXG4gICAgICAgIHN0YWdlID09PSAncHJvZCdcclxuICAgICAgICAgID8gWydodHRwczovL3d3dy5jaHVtNy5jb20nXVxyXG4gICAgICAgICAgOiBbJyonXSxcclxuICAgICAgYWxsb3dNZXRob2RzOiBbXHJcbiAgICAgICAgQ29yc0h0dHBNZXRob2QuR0VULFxyXG4gICAgICAgIENvcnNIdHRwTWV0aG9kLlBPU1QsXHJcbiAgICAgICAgQ29yc0h0dHBNZXRob2QuUFVULFxyXG4gICAgICAgIENvcnNIdHRwTWV0aG9kLkRFTEVURSxcclxuICAgICAgICBDb3JzSHR0cE1ldGhvZC5PUFRJT05TLFxyXG4gICAgICBdLFxyXG4gICAgICBhbGxvd0hlYWRlcnM6IFsnQ29udGVudC1UeXBlJywgJ0F1dGhvcml6YXRpb24nXSxcclxuICAgICAgbWF4QWdlOiBEdXJhdGlvbi5kYXlzKDEpLFxyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLmFwaUdhdGV3YXkgPSBuZXcgSHR0cEFwaSh0aGlzLCAnQXBpR2F0ZXdheScsIHtcclxuICAgICAgYXBpTmFtZTogYGNobWUtJHtzdGFnZX0tYXBpYCxcclxuICAgICAgY29yc1ByZWZsaWdodDogY29yc0NvbmZpZyxcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuY29nbml0b0F1dGhvcml6ZXIgPSBuZXcgSHR0cEp3dEF1dGhvcml6ZXIoXHJcbiAgICAgICdDb2duaXRvQXV0aG9yaXplcicsXHJcbiAgICAgIGBodHRwczovL2NvZ25pdG8taWRwLiR7dGhpcy5yZWdpb259LmFtYXpvbmF3cy5jb20vJHt1c2VyUG9vbElkfWAsXHJcbiAgICAgIHsgand0QXVkaWVuY2U6IFt1c2VyUG9vbENsaWVudElkXSB9LFxyXG4gICAgKTtcclxuXHJcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsICdBcGlVcmwnLCB7IHZhbHVlOiB0aGlzLmFwaUdhdGV3YXkuYXBpRW5kcG9pbnQgfSk7XHJcbiAgfVxyXG59XHJcbiJdfQ==