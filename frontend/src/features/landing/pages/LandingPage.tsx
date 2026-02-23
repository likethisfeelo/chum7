import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

const FEATURES = [
  { icon: '🎯', title: '7일 챌린지', desc: '짧고 강렬한 7일간의 도전으로 습관을 만들어요' },
  { icon: '📸', title: '매일 인증', desc: '사진과 소감으로 오늘의 실천을 기록해요' },
  { icon: '💖', title: '응원 시스템', desc: '서로 응원하며 함께 성장해요' },
  { icon: '🏆', title: '뱃지 획득', desc: '챌린지 완주로 정체성 뱃지를 얻어요' },
];

const CATEGORIES = [
  { icon: '🏃', name: '건강', color: 'bg-red-100 text-red-600' },
  { icon: '📚', name: '습관', color: 'bg-teal-100 text-teal-600' },
  { icon: '💡', name: '자기계발', color: 'bg-blue-100 text-blue-600' },
  { icon: '🎨', name: '창의성', color: 'bg-orange-100 text-orange-600' },
  { icon: '🤝', name: '관계', color: 'bg-green-100 text-green-600' },
  { icon: '🧘', name: '마음챙김', color: 'bg-purple-100 text-purple-600' },
];

export const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* 헤더 */}
      <header className="fixed top-0 left-0 right-0 bg-white/90 backdrop-blur-sm z-10 px-6 py-4 flex items-center justify-between max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-primary-600">CHME</h1>
        <button
          onClick={() => navigate('/login')}
          className="px-4 py-2 text-sm font-semibold text-primary-600 border border-primary-300 rounded-full hover:bg-primary-50 transition-colors"
        >
          로그인
        </button>
      </header>

      {/* 히어로 섹션 */}
      <section className="pt-20 pb-16 px-6 bg-gradient-to-br from-primary-50 via-white to-orange-50">
        <div className="max-w-md mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="w-24 h-24 bg-gradient-to-br from-primary-400 to-primary-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
              <span className="text-5xl">🌍</span>
            </div>
            <h2 className="text-4xl font-bold text-gray-900 mb-4 leading-tight">
              7일이면<br />
              <span className="text-primary-600">충분해요</span>
            </h2>
            <p className="text-lg text-gray-600 mb-8 leading-relaxed">
              짧고 강렬한 챌린지로<br />
              새로운 나를 만들어보세요
            </p>

            <div className="flex flex-col gap-3">
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/register')}
                className="w-full py-4 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-bold text-lg rounded-2xl shadow-md hover:from-primary-600 hover:to-primary-700 transition-all"
              >
                무료로 시작하기 🚀
              </motion.button>
              <button
                onClick={() => navigate('/login')}
                className="w-full py-4 bg-white text-gray-700 font-semibold text-lg rounded-2xl border-2 border-gray-200 hover:bg-gray-50 transition-all"
              >
                이미 계정이 있어요
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 카테고리 섹션 */}
      <section className="py-12 px-6 bg-white">
        <div className="max-w-md mx-auto">
          <h3 className="text-xl font-bold text-gray-900 mb-6 text-center">
            다양한 챌린지를 탐색해보세요
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {CATEGORIES.map((cat, index) => (
              <motion.div
                key={cat.name}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                className={`${cat.color} rounded-2xl p-4 text-center`}
              >
                <div className="text-3xl mb-2">{cat.icon}</div>
                <p className="text-sm font-semibold">{cat.name}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 기능 소개 */}
      <section className="py-12 px-6 bg-gray-50">
        <div className="max-w-md mx-auto">
          <h3 className="text-xl font-bold text-gray-900 mb-6 text-center">
            이런 게 달라요
          </h3>
          <div className="space-y-4">
            {FEATURES.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white rounded-2xl p-5 flex items-start gap-4 shadow-sm"
              >
                <div className="w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
                  {feature.icon}
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">{feature.title}</h4>
                  <p className="text-sm text-gray-600">{feature.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 하단 CTA */}
      <section className="py-16 px-6 bg-gradient-to-br from-primary-500 to-primary-700 text-center">
        <div className="max-w-md mx-auto">
          <h3 className="text-2xl font-bold text-white mb-3">
            오늘부터 시작해볼까요?
          </h3>
          <p className="text-white/80 mb-6">
            7일 뒤의 나를 상상해보세요
          </p>
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/register')}
            className="px-8 py-4 bg-white text-primary-600 font-bold text-lg rounded-2xl shadow-md hover:bg-gray-50 transition-all"
          >
            무료로 시작하기 🎉
          </motion.button>
        </div>
      </section>
    </div>
  );
};
