import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './app/App';
import { initInstallPrompt } from './shared/pwa/installPrompt';
import './styles/index.css';

// PWA 설치 프롬프트(beforeinstallprompt)를 앱 시작 시점부터 붙잡아 둔다.
initInstallPrompt();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            borderRadius: '12px',
            fontFamily: 'inherit',
          },
        }}
      />
    </QueryClientProvider>
  </React.StrictMode>
);
