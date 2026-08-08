import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';

/**
 * CHUM7 서비스 소개 페이지 — /aboutchum7 (비로그인 열람 허용, 공유 가능한 랜딩).
 *  섹션 3개: ① 이런 서비스예요 ② 챌린지에 참여하세요(습관·도전 중심) ③ 챌린지 리더가 되세요.
 *  보상보다 습관·새로운 도전을 앞세우는 톤 유지.
 */

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-40px' },
  transition: { duration: 0.45 },
};

function SectionBadge({ no, label }: { no: string; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-[11px] font-bold text-primary-600 bg-primary-50 border border-primary-100 px-2 py-0.5 rounded-full">
        {no}
      </span>
      <span className="text-[11px] font-semibold text-gray-400 tracking-widest uppercase">{label}</span>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <motion.div {...fadeUp} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="text-2xl mb-2">{icon}</div>
      <h3 className="font-bold text-gray-900 text-sm">{title}</h3>
      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{desc}</p>
    </motion.div>
  );
}

export const AboutChumPage = () => {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const goJoin = () => navigate(isAuthenticated ? '/challenges' : '/register');
  const goLead = () => navigate(isAuthenticated ? '/challenges/new' : '/register');

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* 히어로 */}
      <div className="bg-gradient-to-br from-primary-500 to-primary-700 px-6 pt-14 pb-12 text-center text-white">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
          <p className="text-4xl mb-3">🌱</p>
          <h1 className="text-2xl font-extrabold leading-snug">
            일주일이면, 나는 조금 달라져요
          </h1>
          <p className="mt-3 text-sm text-white/80 leading-relaxed max-w-md mx-auto">
            CHUM7(첨)은 3일·5일·7일 챌린지로
            <br />
            작은 습관과 새로운 도전을 함께 시작하는 곳이에요.
          </p>
        </motion.div>
      </div>

      <div className="max-w-xl mx-auto px-4">
        {/* ── 섹션 1: 이런 서비스예요 ─────────────────────────── */}
        <section className="pt-10">
          <SectionBadge no="01" label="About CHUM7" />
          <motion.h2 {...fadeUp} className="text-lg font-extrabold text-gray-900 leading-snug">
            이 서비스는,
            <br />
            <span className="text-primary-600">일주일짜리 작은 도전</span>을 모아둔 곳이에요
          </motion.h2>
          <motion.p {...fadeUp} className="mt-3 text-sm text-gray-600 leading-relaxed">
            거창한 결심 대신 <b>3일, 5일, 7일</b> 중 부담 없는 길이를 골라요. 챌린지는{' '}
            <b>매주 월요일에 시작</b>되니까, 이번 주를 놓쳐도 다음 주에 다시 첫날이 와요. 매일 사진·글·링크로
            인증을 남기고, 하루를 놓쳤다면 보완 인증으로 완주를 이어갈 수 있어요.
          </motion.p>

          <div className="grid grid-cols-2 gap-3 mt-6">
            <FeatureCard
              icon="📅"
              title="3·5·7일, 매주 월요일"
              desc="짧아서 시작하기 쉽고, 매주 새 기회가 돌아와요. 하루하루 인증하며 완주를 향해 가요."
            />
            <FeatureCard
              icon="🎭"
              title="익명으로 편하게"
              desc="챌린지 안에서는 매일 바뀌는 익명 활동명으로 참여해요. 잘 보이려 애쓰지 않아도 돼요."
            />
            <FeatureCard
              icon="🏡"
              title="마당 — 이중 익명"
              desc="서로의 실천이 모이는 광장이에요. 여기서도 또 다른 익명이라, 진짜 속마음을 나눌 수 있어요."
            />
            <FeatureCard
              icon="🤝"
              title="천천히 친구가 돼요"
              desc="익명으로 활동하다 마음이 맞으면 팔로우하고, 서로 팔로우하면 친구가 되어 피드를 열어요."
            />
            <FeatureCard
              icon="🗺️"
              title="여정"
              desc="완주가 쌓일수록 나만의 세계가 자라나요. 셀프러브·애티튜드 등 7개 영역이 빛으로 채워져요."
            />
            <FeatureCard
              icon="🎁"
              title="완주 보상"
              desc="완주하면 배지와 리캡, 챌린지별 보상이 기다려요. 물론 가장 큰 보상은 달라진 나예요."
            />
          </div>
        </section>

        {/* ── 섹션 2: 챌린지에 참여하세요 ─────────────────────── */}
        <section className="pt-12">
          <SectionBadge no="02" label="Join a Challenge" />
          <motion.h2 {...fadeUp} className="text-lg font-extrabold text-gray-900 leading-snug">
            챌린지에 참여하세요
            <br />
            <span className="text-primary-600">보상보다, 달라지는 하루</span>를 위해서요
          </motion.h2>
          <motion.p {...fadeUp} className="mt-3 text-sm text-gray-600 leading-relaxed">
            물 마시기, 아침 스트레칭, 하루 한 줄 쓰기, 처음 해보는 취미까지 — 대단한 목표가 아니어도 좋아요.
            일주일 동안 같은 도전을 하는 사람들과 서로의 인증을 보며 가면, 혼자보다 훨씬 멀리 가요.
          </motion.p>

          <motion.div {...fadeUp} className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
            {[
              { step: '1', title: '마음에 드는 챌린지 고르기', desc: '관심 있는 영역에서 3·5·7일 챌린지를 골라 참여 신청해요.' },
              { step: '2', title: '월요일, 함께 시작', desc: '같은 날 출발하니까 처음부터 끝까지 페이스가 맞아요.' },
              { step: '3', title: '매일 작게 인증', desc: '사진 한 장, 글 한 줄이면 충분해요. 놓친 날은 보완 인증으로 이어가요.' },
              { step: '4', title: '완주하고 돌아보기', desc: '완주 리캡으로 일주일을 돌아보고, 다음 도전을 골라요.' },
            ].map((s) => (
              <div key={s.step} className="flex items-start gap-3 p-4">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                  {s.step}
                </span>
                <div>
                  <p className="text-sm font-bold text-gray-900">{s.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </motion.div>

          <motion.button
            {...fadeUp}
            type="button"
            onClick={goJoin}
            className="mt-5 w-full py-3.5 rounded-2xl bg-primary-500 text-white font-bold text-sm shadow-md hover:bg-primary-600 transition-colors"
          >
            이번 주 챌린지 둘러보기 →
          </motion.button>
        </section>

        {/* ── 섹션 3: 챌린지 리더가 되세요 ────────────────────── */}
        <section className="pt-12">
          <SectionBadge no="03" label="Become a Leader" />
          <motion.h2 {...fadeUp} className="text-lg font-extrabold text-gray-900 leading-snug">
            챌린지 리더가 되세요
            <br />
            <span className="text-primary-600">내가 아는 좋은 습관</span>을 함께 나눠요
          </motion.h2>
          <motion.p {...fadeUp} className="mt-3 text-sm text-gray-600 leading-relaxed">
            누구나 리더가 될 수 있어요. 내가 지켜온 루틴, 나누고 싶은 취미가 있다면 챌린지를 열어 사람들을
            모아보세요. 운영에 필요한 도구는 CHUM7이 다 준비해 뒀어요.
          </motion.p>

          <div className="grid grid-cols-2 gap-3 mt-6">
            <FeatureCard
              icon="🛠️"
              title="원하는 대로 설계"
              desc="기간(3·5·7일), 인증 형식(사진·글·링크·영상), 보완 정책, 참여자 이름 표시 방식까지 리더가 정해요."
            />
            <FeatureCard
              icon="📊"
              title="운영탭 한눈에"
              desc="참여자 현황과 오늘의 인증 브리핑을 한 화면에서 보고, 매니저를 지정해 함께 운영할 수 있어요."
            />
            <FeatureCard
              icon="🎲"
              title="완주자 추첨·보상"
              desc="완주자 중 랜덤 추첨으로 당첨자를 뽑고, 선물·교환권을 개별 또는 일괄로 보낼 수 있어요."
            />
            <FeatureCard
              icon="📣"
              title="모객은 링크 하나로"
              desc="@핸들 공개 프로필에 내가 여는 챌린지가 모여요. 링크만 공유하면 참여 신청까지 이어져요."
            />
            <FeatureCard
              icon="💬"
              title="함께 달리는 공간"
              desc="챌린지 채팅과 피드에서 참여자들을 응원하고, 인증에 반응하며 분위기를 이끌 수 있어요."
            />
            <FeatureCard
              icon="🔁"
              title="시즌제 운영"
              desc="챌린지가 끝나면 결과를 정리하고, 한 번의 복제로 다음 시즌을 바로 열 수 있어요."
            />
          </div>

          <motion.button
            {...fadeUp}
            type="button"
            onClick={goLead}
            className="mt-5 w-full py-3.5 rounded-2xl bg-gray-900 text-white font-bold text-sm shadow-md hover:bg-gray-700 transition-colors"
          >
            나의 챌린지 열어보기 →
          </motion.button>
        </section>

        {/* 마무리 */}
        <motion.p {...fadeUp} className="mt-12 text-center text-xs text-gray-400 leading-relaxed">
          처음이라는 뜻의 &lsquo;첨&rsquo;, 그리고 7일의 &lsquo;7&rsquo;.
          <br />
          CHUM7에서 처음의 마음으로, 일주일을 함께해요.
        </motion.p>
      </div>

      {/* 하단 고정 CTA */}
      <div className="fixed bottom-0 inset-x-0 z-20 p-4 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent">
        <div className="max-w-xl mx-auto">
          <button
            type="button"
            onClick={goJoin}
            className="w-full py-4 rounded-2xl bg-primary-500 text-white font-bold text-base shadow-lg hover:bg-primary-600 transition-colors"
          >
            {isAuthenticated ? '챌린지 둘러보기 →' : 'CHUM7 시작하기 →'}
          </button>
        </div>
      </div>
    </div>
  );
};
