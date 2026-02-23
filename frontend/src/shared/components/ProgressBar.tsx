import { motion } from 'framer-motion';

interface ProgressBarProps {
  current: number;
  total: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const ProgressBar = ({
  current,
  total,
  showLabel = true,
  size = 'md',
}: ProgressBarProps) => {
  const percentage = Math.round((current / total) * 100);

  const heightClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  };

  return (
    <div className="w-full">
      <div className={`relative ${heightClasses[size]} bg-gray-200 rounded-full overflow-hidden`}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="absolute h-full bg-gradient-to-r from-primary-400 to-primary-600"
        />
      </div>
      {showLabel && (
        <p className="text-xs text-gray-600 mt-1 text-right">
          {current}/{total} ({percentage}%)
        </p>
      )}
    </div>
  );
};
