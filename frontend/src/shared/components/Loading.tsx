import { motion } from 'framer-motion';

export const Loading = ({ fullScreen = false }: { fullScreen?: boolean }) => {
  const containerClass = fullScreen
    ? 'fixed inset-0 flex items-center justify-center bg-white z-50'
    : 'flex items-center justify-center py-12';

  return (
    <div className={containerClass}>
      <div className="flex flex-col items-center gap-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full"
        />
        <p className="text-sm text-gray-600">로딩 중...</p>
      </div>
    </div>
  );
};
