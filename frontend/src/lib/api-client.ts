import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'https://dev.chum7.com';

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - 토큰 추가
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (userTimezone) {
      config.headers['x-user-timezone'] = userTimezone;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - 에러 처리
const AUTH_EXCLUDED_PATHS = ['/auth/login', '/auth/register', '/auth/refresh-token'];

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const requestUrl: string = originalRequest?.url || '';
    const isAuthExcluded = AUTH_EXCLUDED_PATHS.some((path) => requestUrl.includes(path));

    if (error.response?.status === 401 && !originalRequest?._retry && !isAuthExcluded) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const { data } = await axios.post(`${API_URL}/auth/refresh-token`, {
          refreshToken,
        });

        localStorage.setItem('accessToken', data.data.accessToken);

        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        localStorage.clear();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);
