"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prodConfig = void 0;
exports.prodConfig = {
    stage: 'prod',
    region: 'ap-northeast-2',
    account: '532393804562', // ✅ 하드코딩 (환경변수 의존 제거)
    domain: {
        root: 'chum7.com',
        api: 'api.chum7.com',
        cdn: 'www.chum7.com',
        app: 'www.chum7.com',
        admin: 'admin.chum7.com',
    },
    s3: {
        staticBucket: 'chme-prod-static', // ✅ 실제 버킷명 (chum7 아님!)
        uploadsBucket: 'chum7-prod-uploads', // ✅ 실제 버킷명
    },
    cognito: {
        userPoolName: 'chum7-prod-users', // ✅ 실제 User Pool 이름 (chme 아님!)
        callbackUrls: [
            'https://www.chum7.com/callback',
            'https://admin.chum7.com/callback',
        ],
        logoutUrls: [
            'https://www.chum7.com',
            'https://admin.chum7.com',
        ],
    },
    cloudfront: {
        distributionId: 'EUM1ULUXR9NQZ', // ✅ 실제 Distribution ID
    },
    dynamodb: {
        billingMode: 'PAY_PER_REQUEST',
    },
    sns: {
        topicName: 'chum7-prod-notifications',
    },
    eventBridge: {
        schedulerName: 'chum7-prod-cheer-scheduler',
    },
    lambda: {
        timeout: 30,
        memorySize: 256,
    },
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInByb2QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBR2EsUUFBQSxVQUFVLEdBQWdCO0lBQ3JDLEtBQUssRUFBRSxNQUFNO0lBQ2IsTUFBTSxFQUFFLGdCQUFnQjtJQUN4QixPQUFPLEVBQUUsY0FBYyxFQUFFLHNCQUFzQjtJQUUvQyxNQUFNLEVBQUU7UUFDTixJQUFJLEVBQUUsV0FBVztRQUNqQixHQUFHLEVBQUUsZUFBZTtRQUNwQixHQUFHLEVBQUUsZUFBZTtRQUNwQixHQUFHLEVBQUUsZUFBZTtRQUNwQixLQUFLLEVBQUUsaUJBQWlCO0tBQ3pCO0lBRUQsRUFBRSxFQUFFO1FBQ0YsWUFBWSxFQUFFLGtCQUFrQixFQUFFLHVCQUF1QjtRQUN6RCxhQUFhLEVBQUUsb0JBQW9CLEVBQUUsV0FBVztLQUNqRDtJQUVELE9BQU8sRUFBRTtRQUNQLFlBQVksRUFBRSxrQkFBa0IsRUFBRSwrQkFBK0I7UUFDakUsWUFBWSxFQUFFO1lBQ1osZ0NBQWdDO1lBQ2hDLGtDQUFrQztTQUNuQztRQUNELFVBQVUsRUFBRTtZQUNWLHVCQUF1QjtZQUN2Qix5QkFBeUI7U0FDMUI7S0FDRjtJQUVELFVBQVUsRUFBRTtRQUNWLGNBQWMsRUFBRSxlQUFlLEVBQUUsdUJBQXVCO0tBQ3pEO0lBRUQsUUFBUSxFQUFFO1FBQ1IsV0FBVyxFQUFFLGlCQUFpQjtLQUMvQjtJQUVELEdBQUcsRUFBRTtRQUNILFNBQVMsRUFBRSwwQkFBMEI7S0FDdEM7SUFFRCxXQUFXLEVBQUU7UUFDWCxhQUFhLEVBQUUsNEJBQTRCO0tBQzVDO0lBRUQsTUFBTSxFQUFFO1FBQ04sT0FBTyxFQUFFLEVBQUU7UUFDWCxVQUFVLEVBQUUsR0FBRztLQUNoQjtDQUNGLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBpbmZyYS9jb25maWcvcHJvZC50c1xyXG5pbXBvcnQgeyBJbmZyYUNvbmZpZyB9IGZyb20gJy4vZGV2JztcclxuXHJcbmV4cG9ydCBjb25zdCBwcm9kQ29uZmlnOiBJbmZyYUNvbmZpZyA9IHtcclxuICBzdGFnZTogJ3Byb2QnLFxyXG4gIHJlZ2lvbjogJ2FwLW5vcnRoZWFzdC0yJyxcclxuICBhY2NvdW50OiAnNTMyMzkzODA0NTYyJywgLy8g4pyFIO2VmOuTnOy9lOuUqSAo7ZmY6rK967OA7IiYIOydmOyhtCDsoJzqsbApXHJcbiAgXHJcbiAgZG9tYWluOiB7XHJcbiAgICByb290OiAnY2h1bTcuY29tJyxcclxuICAgIGFwaTogJ2FwaS5jaHVtNy5jb20nLFxyXG4gICAgY2RuOiAnd3d3LmNodW03LmNvbScsXHJcbiAgICBhcHA6ICd3d3cuY2h1bTcuY29tJyxcclxuICAgIGFkbWluOiAnYWRtaW4uY2h1bTcuY29tJyxcclxuICB9LFxyXG4gIFxyXG4gIHMzOiB7XHJcbiAgICBzdGF0aWNCdWNrZXQ6ICdjaG1lLXByb2Qtc3RhdGljJywgLy8g4pyFIOyLpOygnCDrsoTtgrfrqoUgKGNodW03IOyVhOuLmCEpXHJcbiAgICB1cGxvYWRzQnVja2V0OiAnY2h1bTctcHJvZC11cGxvYWRzJywgLy8g4pyFIOyLpOygnCDrsoTtgrfrqoVcclxuICB9LFxyXG4gIFxyXG4gIGNvZ25pdG86IHtcclxuICAgIHVzZXJQb29sTmFtZTogJ2NodW03LXByb2QtdXNlcnMnLCAvLyDinIUg7Iuk7KCcIFVzZXIgUG9vbCDsnbTrpoQgKGNobWUg7JWE64uYISlcclxuICAgIGNhbGxiYWNrVXJsczogW1xyXG4gICAgICAnaHR0cHM6Ly93d3cuY2h1bTcuY29tL2NhbGxiYWNrJyxcclxuICAgICAgJ2h0dHBzOi8vYWRtaW4uY2h1bTcuY29tL2NhbGxiYWNrJyxcclxuICAgIF0sXHJcbiAgICBsb2dvdXRVcmxzOiBbXHJcbiAgICAgICdodHRwczovL3d3dy5jaHVtNy5jb20nLFxyXG4gICAgICAnaHR0cHM6Ly9hZG1pbi5jaHVtNy5jb20nLFxyXG4gICAgXSxcclxuICB9LFxyXG4gIFxyXG4gIGNsb3VkZnJvbnQ6IHtcclxuICAgIGRpc3RyaWJ1dGlvbklkOiAnRVVNMVVMVVhSOU5RWicsIC8vIOKchSDsi6TsoJwgRGlzdHJpYnV0aW9uIElEXHJcbiAgfSxcclxuICBcclxuICBkeW5hbW9kYjoge1xyXG4gICAgYmlsbGluZ01vZGU6ICdQQVlfUEVSX1JFUVVFU1QnLFxyXG4gIH0sXHJcbiAgXHJcbiAgc25zOiB7XHJcbiAgICB0b3BpY05hbWU6ICdjaHVtNy1wcm9kLW5vdGlmaWNhdGlvbnMnLFxyXG4gIH0sXHJcbiAgXHJcbiAgZXZlbnRCcmlkZ2U6IHtcclxuICAgIHNjaGVkdWxlck5hbWU6ICdjaHVtNy1wcm9kLWNoZWVyLXNjaGVkdWxlcicsXHJcbiAgfSxcclxuICBcclxuICBsYW1iZGE6IHtcclxuICAgIHRpbWVvdXQ6IDMwLFxyXG4gICAgbWVtb3J5U2l6ZTogMjU2LFxyXG4gIH0sXHJcbn07Il19