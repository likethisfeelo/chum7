import { ReactNode } from 'react';
import { BottomNav } from '@/shared/components/BottomNav';

interface MainLayoutProps {
  children: ReactNode;
}

export const MainLayout = ({ children }: MainLayoutProps) => {
  return (
    <div className="min-h-screen max-w-md mx-auto relative" style={{ backgroundColor: 'var(--color-bg-app)' }}>
      <main className="pb-20">
        {children}
      </main>
      <BottomNav />
    </div>
  );
};
