// frontend/src/features/cheer/components/CheerTicketCard.tsx
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { FiHeart, FiClock } from 'react-icons/fi';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface CheerTicket {
  ticketId: string;
  source: string;
  delta: number;
  challengeTitle: string;
  expiresAt: string;
  status: string;
}

interface CheerTicketCardProps {
  tickets: CheerTicket[];
}

const sourceLabels: Record<string, string> = {
  early_completion: '일찍 완료',
  streak_3: '3일 연속',
  remedy: 'Day 6 보완',
  complete: '챌린지 완주',
};

export const CheerTicketCard = ({ tickets }: CheerTicketCardProps) => {
  const navigate = useNavigate();
  const availableTickets = tickets.filter(t => t.status === 'available');

  if (availableTickets.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-gray-600 mb-1">보유 응원권</p>
          <p className="text-2xl font-bold text-gray-900">
            {availableTickets.length}장 🎟
          </p>
        </div>
        <div className="w-14 h-14 bg-gradient-to-br from-primary-100 to-primary-200 rounded-full flex items-center justify-center">
          <FiHeart className="w-7 h-7 text-primary-600" />
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {availableTickets.slice(0, 3).map((ticket) => (
          <div
            key={ticket.ticketId}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
          >
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">
                {sourceLabels[ticket.source] || ticket.source}
              </p>
              <p className="text-xs text-gray-500">
                {ticket.challengeTitle} · 델타 {ticket.delta}분
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <FiClock className="w-3 h-3" />
                {format(new Date(ticket.expiresAt), 'MM/dd HH:mm', { locale: ko })}
              </p>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => navigate('/cheer/use-ticket')}
        className="w-full py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-semibold rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all"
      >
        응원권 사용하기
      </button>

      <p className="text-xs text-gray-500 text-center mt-3">
        💡 응원권은 내일까지 사용할 수 있어요
      </p>
    </motion.div>
  );
};

// frontend/src/shared/components/BottomSheet.tsx
import { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX } from 'react-icons/fi';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxHeight?: string;
}

export const BottomSheet = ({
  isOpen,
  onClose,
  title,
  children,
  maxHeight = '90vh',
}: BottomSheetProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40"
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 overflow-hidden"
            style={{ maxHeight }}
          >
            {/* 드래그 핸들 */}
            <div className="w-full flex justify-center pt-3 pb-2">
              <div className="w-12 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* 헤더 */}
            {title && (
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">{title}</h2>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* 컨텐츠 */}
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(90vh - 100px)' }}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// frontend/src/shared/components/Loading.tsx
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

// frontend/src/shared/components/EmptyState.tsx
import { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState = ({ icon, title, description, action }: EmptyStateProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 px-6 text-center"
    >
      {icon && (
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-4xl">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-gray-600 mb-6 max-w-sm">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="px-6 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-semibold rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all"
        >
          {action.label}
        </button>
      )}
    </motion.div>
  );
};

// frontend/src/shared/components/ProgressBar.tsx
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
