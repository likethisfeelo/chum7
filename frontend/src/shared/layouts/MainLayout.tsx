import { ReactNode } from 'react';
import { BottomNav } from '@/shared/components/BottomNav';
import { SideNav } from '@/shared/layouts/SideNav';

interface MainLayoutProps {
  children: ReactNode;
}

export const MainLayout = ({ children }: MainLayoutProps) => {
  return (
    <div className="min-h-screen">
      <SideNav />
      {/* lg에서 SideNav 너비(w-60 = 240px)만큼 오프셋 */}
      <div className="lg:ml-60">
        <div className="max-w-md md:max-w-2xl lg:max-w-4xl mx-auto relative">
          <main className="pb-20 lg:pb-10">
            {children}
          </main>
          <BottomNav />
        </div>
      </div>
    </div>
  );
};
