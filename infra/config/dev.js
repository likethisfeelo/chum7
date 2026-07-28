"use strict";
// infra/config/dev.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.devConfig = void 0;
exports.devConfig = {
    stage: 'dev',
    region: 'ap-northeast-2',
    account: '532393804562', // ✅ 하드코딩 (환경변수 의존 제거)
    domain: {
        root: 'chum7.com',
        api: 'dev.chum7.com',
        cdn: 'test.chum7.com',
        app: 'test.chum7.com',
        admin: 'admin-dev.chum7.com',
    },
    s3: {
        staticBucket: 'chme-dev', // ✅ 실제 버킷명 (이미 존재)
        uploadsBucket: 'chum7-dev-uploads', // ✅ 실제 버킷명 (이미 존재)
    },
    cognito: {
        userPoolName: 'chum7-dev-users', // ✅ 실제 User Pool 이름
        callbackUrls: [
            'https://test.chum7.com/callback',
            'http://localhost:5173/callback',
            'http://localhost:5174/callback',
        ],
        logoutUrls: [
            'https://test.chum7.com',
            'http://localhost:5173',
            'http://localhost:5174',
        ],
    },
    cloudfront: {
        distributionId: 'ESKW3DS5HUUK9', // ✅ 실제 Distribution ID (오타 수정)
    },
    dynamodb: {
        billingMode: 'PAY_PER_REQUEST',
    },
    sns: {
        topicName: 'chum7-dev-notifications',
    },
    eventBridge: {
        schedulerName: 'chum7-dev-cheer-scheduler',
    },
    lambda: {
        timeout: 30,
        memorySize: 256,
    },
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGV2LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZGV2LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSxzQkFBc0I7OztBQXdDVCxRQUFBLFNBQVMsR0FBZ0I7SUFDcEMsS0FBSyxFQUFFLEtBQUs7SUFDWixNQUFNLEVBQUUsZ0JBQWdCO0lBQ3hCLE9BQU8sRUFBRSxjQUFjLEVBQUUsc0JBQXNCO0lBRS9DLE1BQU0sRUFBRTtRQUNOLElBQUksRUFBRSxXQUFXO1FBQ2pCLEdBQUcsRUFBRSxlQUFlO1FBQ3BCLEdBQUcsRUFBRSxnQkFBZ0I7UUFDckIsR0FBRyxFQUFFLGdCQUFnQjtRQUNyQixLQUFLLEVBQUUscUJBQXFCO0tBQzdCO0lBRUQsRUFBRSxFQUFFO1FBQ0YsWUFBWSxFQUFFLFVBQVUsRUFBRSxtQkFBbUI7UUFDN0MsYUFBYSxFQUFFLG1CQUFtQixFQUFFLG1CQUFtQjtLQUN4RDtJQUVELE9BQU8sRUFBRTtRQUNQLFlBQVksRUFBRSxpQkFBaUIsRUFBRSxvQkFBb0I7UUFDckQsWUFBWSxFQUFFO1lBQ1osaUNBQWlDO1lBQ2pDLGdDQUFnQztZQUNoQyxnQ0FBZ0M7U0FDakM7UUFDRCxVQUFVLEVBQUU7WUFDVix3QkFBd0I7WUFDeEIsdUJBQXVCO1lBQ3ZCLHVCQUF1QjtTQUN4QjtLQUNGO0lBRUQsVUFBVSxFQUFFO1FBQ1YsY0FBYyxFQUFFLGVBQWUsRUFBRSwrQkFBK0I7S0FDakU7SUFFRCxRQUFRLEVBQUU7UUFDUixXQUFXLEVBQUUsaUJBQWlCO0tBQy9CO0lBRUQsR0FBRyxFQUFFO1FBQ0gsU0FBUyxFQUFFLHlCQUF5QjtLQUNyQztJQUVELFdBQVcsRUFBRTtRQUNYLGFBQWEsRUFBRSwyQkFBMkI7S0FDM0M7SUFFRCxNQUFNLEVBQUU7UUFDTixPQUFPLEVBQUUsRUFBRTtRQUNYLFVBQVUsRUFBRSxHQUFHO0tBQ2hCO0NBQ0YsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIGluZnJhL2NvbmZpZy9kZXYudHNcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgSW5mcmFDb25maWcge1xyXG4gIHN0YWdlOiBzdHJpbmc7XHJcbiAgcmVnaW9uOiBzdHJpbmc7XHJcbiAgYWNjb3VudDogc3RyaW5nO1xyXG4gIGRvbWFpbjoge1xyXG4gICAgcm9vdDogc3RyaW5nO1xyXG4gICAgYXBpOiBzdHJpbmc7XHJcbiAgICBjZG46IHN0cmluZztcclxuICAgIGFwcDogc3RyaW5nO1xyXG4gICAgYWRtaW46IHN0cmluZztcclxuICB9O1xyXG4gIHMzOiB7XHJcbiAgICBzdGF0aWNCdWNrZXQ6IHN0cmluZztcclxuICAgIHVwbG9hZHNCdWNrZXQ6IHN0cmluZztcclxuICB9O1xyXG4gIGNvZ25pdG86IHtcclxuICAgIHVzZXJQb29sTmFtZTogc3RyaW5nO1xyXG4gICAgY2FsbGJhY2tVcmxzOiBzdHJpbmdbXTtcclxuICAgIGxvZ291dFVybHM6IHN0cmluZ1tdO1xyXG4gIH07XHJcbiAgY2xvdWRmcm9udDoge1xyXG4gICAgZGlzdHJpYnV0aW9uSWQ6IHN0cmluZztcclxuICB9O1xyXG4gIGR5bmFtb2RiOiB7XHJcbiAgICBiaWxsaW5nTW9kZTogJ1BBWV9QRVJfUkVRVUVTVCcgfCAnUFJPVklTSU9ORUQnO1xyXG4gIH07XHJcbiAgc25zOiB7XHJcbiAgICB0b3BpY05hbWU6IHN0cmluZztcclxuICB9O1xyXG4gIGV2ZW50QnJpZGdlOiB7XHJcbiAgICBzY2hlZHVsZXJOYW1lOiBzdHJpbmc7XHJcbiAgfTtcclxuICBsYW1iZGE6IHtcclxuICAgIHRpbWVvdXQ6IG51bWJlcjtcclxuICAgIG1lbW9yeVNpemU6IG51bWJlcjtcclxuICB9O1xyXG59XHJcblxyXG5leHBvcnQgY29uc3QgZGV2Q29uZmlnOiBJbmZyYUNvbmZpZyA9IHtcclxuICBzdGFnZTogJ2RldicsXHJcbiAgcmVnaW9uOiAnYXAtbm9ydGhlYXN0LTInLFxyXG4gIGFjY291bnQ6ICc1MzIzOTM4MDQ1NjInLCAvLyDinIUg7ZWY65Oc7L2U65SpICjtmZjqsr3rs4DsiJgg7J2Y7KG0IOygnOqxsClcclxuICBcclxuICBkb21haW46IHtcclxuICAgIHJvb3Q6ICdjaHVtNy5jb20nLFxyXG4gICAgYXBpOiAnZGV2LmNodW03LmNvbScsXHJcbiAgICBjZG46ICd0ZXN0LmNodW03LmNvbScsXHJcbiAgICBhcHA6ICd0ZXN0LmNodW03LmNvbScsXHJcbiAgICBhZG1pbjogJ2FkbWluLWRldi5jaHVtNy5jb20nLFxyXG4gIH0sXHJcbiAgXHJcbiAgczM6IHtcclxuICAgIHN0YXRpY0J1Y2tldDogJ2NobWUtZGV2JywgLy8g4pyFIOyLpOygnCDrsoTtgrfrqoUgKOydtOuvuCDsobTsnqwpXHJcbiAgICB1cGxvYWRzQnVja2V0OiAnY2h1bTctZGV2LXVwbG9hZHMnLCAvLyDinIUg7Iuk7KCcIOuyhO2Ct+uqhSAo7J2066+4IOyhtOyerClcclxuICB9LFxyXG4gIFxyXG4gIGNvZ25pdG86IHtcclxuICAgIHVzZXJQb29sTmFtZTogJ2NodW03LWRldi11c2VycycsIC8vIOKchSDsi6TsoJwgVXNlciBQb29sIOydtOumhFxyXG4gICAgY2FsbGJhY2tVcmxzOiBbXHJcbiAgICAgICdodHRwczovL3Rlc3QuY2h1bTcuY29tL2NhbGxiYWNrJyxcclxuICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6NTE3My9jYWxsYmFjaycsXHJcbiAgICAgICdodHRwOi8vbG9jYWxob3N0OjUxNzQvY2FsbGJhY2snLFxyXG4gICAgXSxcclxuICAgIGxvZ291dFVybHM6IFtcclxuICAgICAgJ2h0dHBzOi8vdGVzdC5jaHVtNy5jb20nLFxyXG4gICAgICAnaHR0cDovL2xvY2FsaG9zdDo1MTczJyxcclxuICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6NTE3NCcsXHJcbiAgICBdLFxyXG4gIH0sXHJcbiAgXHJcbiAgY2xvdWRmcm9udDoge1xyXG4gICAgZGlzdHJpYnV0aW9uSWQ6ICdFU0tXM0RTNUhVVUs5JywgLy8g4pyFIOyLpOygnCBEaXN0cmlidXRpb24gSUQgKOyYpO2DgCDsiJjsoJUpXHJcbiAgfSxcclxuICBcclxuICBkeW5hbW9kYjoge1xyXG4gICAgYmlsbGluZ01vZGU6ICdQQVlfUEVSX1JFUVVFU1QnLFxyXG4gIH0sXHJcbiAgXHJcbiAgc25zOiB7XHJcbiAgICB0b3BpY05hbWU6ICdjaHVtNy1kZXYtbm90aWZpY2F0aW9ucycsXHJcbiAgfSxcclxuICBcclxuICBldmVudEJyaWRnZToge1xyXG4gICAgc2NoZWR1bGVyTmFtZTogJ2NodW03LWRldi1jaGVlci1zY2hlZHVsZXInLFxyXG4gIH0sXHJcbiAgXHJcbiAgbGFtYmRhOiB7XHJcbiAgICB0aW1lb3V0OiAzMCxcclxuICAgIG1lbW9yeVNpemU6IDI1NixcclxuICB9LFxyXG59OyJdfQ==