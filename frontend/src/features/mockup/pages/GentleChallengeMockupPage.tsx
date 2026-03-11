import React from 'react';

const challengeCards = [
  { title: '독서 20분', detail: '오늘의 문장 1개 기록', done: true },
  { title: '명상 10분', detail: '호흡 30회 세기', done: false },
  { title: '감사 3줄', detail: '사소한 장면 3개 떠올리기', done: false },
];

const feedItems = [
  {
    text: '퇴근 후 12분만 앉아 호흡했어요. 완벽하지 않아도 괜찮더라고요.',
    time: '어제 21:40',
    reactions: { cheer: 24, thanks: 12 },
  },
  {
    text: '책 7쪽 읽고 멈췄지만, 오늘의 마음은 조금 덜 흔들렸어요.',
    time: '어제 23:03',
    reactions: { cheer: 31, thanks: 19 },
  },
];

const ScreenFrame = ({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) => (
  <section className="relative w-full max-w-[330px] rounded-[28px] border border-[#d8cec3] bg-[#f8f2ea] p-4 shadow-[0_18px_40px_-25px_rgba(63,49,44,0.5)]">
    <div className="mb-4 rounded-2xl bg-[#f3ebe2] p-3">
      <p className="text-[11px] font-semibold tracking-[0.16em] text-[#866f5f]">{subtitle}</p>
      <h2 className="mt-1 text-lg font-semibold text-[#322a25]">{title}</h2>
    </div>
    <div className="space-y-3">{children}</div>
  </section>
);

export const GentleChallengeMockupPage = () => {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_10%,#f9f6f2_0%,#efe6da_45%,#e9ddcf_100%)] px-4 py-8 text-[#322a25]">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 rounded-3xl border border-[#ded3c8] bg-[#f7f1e8]/90 p-6 backdrop-blur">
          <p className="text-xs tracking-[0.2em] text-[#927b69]">7-DAY GENTLE CHALLENGE APP MOCKUP</p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight">하루결: 반익명 느슨한 성장 앱</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#5d4f45]">
            30대 이상의 문과 감성을 기준으로 설계한 실제 목업입니다. 익명 응원과 감사 중심 상호작용, 하루 뒤 공개, 그리고
            점진적 프로필 노출 UX를 화면에 반영했습니다.
          </p>
        </header>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <ScreenFrame title="온보딩" subtitle="SCREEN 01">
            <div className="rounded-2xl border border-[#e0d3c8] bg-[#fbf8f3] p-3">
              <p className="text-xs text-[#6e5e52]">오늘 마음에 가까운 단어</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-[#e7d7ca] px-3 py-1">차분함</span>
                <span className="rounded-full bg-[#f0e4d8] px-3 py-1">복잡함</span>
                <span className="rounded-full bg-[#f0e4d8] px-3 py-1">기대감</span>
              </div>
            </div>
            <div className="rounded-2xl border border-[#e0d3c8] bg-[#fbf8f3] p-3">
              <p className="text-xs text-[#6e5e52]">기본 공개 설정</p>
              <p className="mt-1 text-sm font-medium">익명 + 하루 뒤 공개 (D+1)</p>
            </div>
            <button className="h-11 w-full rounded-xl bg-[#7c9888] text-sm font-medium text-white transition hover:bg-[#698574]">
              조용히 시작하기
            </button>
          </ScreenFrame>

          <ScreenFrame title="오늘의 챌린지" subtitle="SCREEN 02">
            {challengeCards.map((card) => (
              <article key={card.title} className="rounded-2xl border border-[#ddcfc3] bg-[#fcf8f2] p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">{card.title}</h3>
                    <p className="mt-1 text-xs text-[#6a5c51]">{card.detail}</p>
                  </div>
                  <div
                    className={`mt-0.5 size-6 rounded-full border ${
                      card.done ? 'border-[#7c9888] bg-[#7c9888]' : 'border-[#c9b7a9] bg-transparent'
                    }`}
                  />
                </div>
              </article>
            ))}
            <button className="h-11 w-full rounded-xl bg-[#c19b84] text-sm font-semibold text-white transition hover:bg-[#af886f]">
              오늘 기록 남기기
            </button>
          </ScreenFrame>

          <ScreenFrame title="기록 작성" subtitle="SCREEN 03">
            <div className="rounded-2xl border border-[#e2d5ca] bg-[#fefbf6] p-3">
              <p className="text-xs text-[#6e5e52]">오늘 나에게 남기는 한 문장</p>
              <p className="mt-2 rounded-xl bg-[#f5eee6] p-3 text-sm leading-6 text-[#43362f]">
                오늘은 완벽하진 않았지만, 멈추지 않았다는 사실이 마음을 조금 단단하게 해준다.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-[#decfc3] bg-[#fbf6ef] p-2">공개: 익명 유지</div>
              <div className="rounded-xl border border-[#decfc3] bg-[#fbf6ef] p-2">노출: Lv1</div>
            </div>
            <div className="rounded-xl border border-dashed border-[#c6b09f] p-3 text-xs text-[#69594e]">
              예약 공개: 내일 오전 9:00
            </div>
          </ScreenFrame>

          <ScreenFrame title="하루 뒤 피드" subtitle="SCREEN 04">
            {feedItems.map((item) => (
              <article key={item.text} className="rounded-2xl border border-[#e2d5ca] bg-[#fffdf8] p-3">
                <div className="flex items-center justify-between text-[11px] text-[#7a695d]">
                  <span>익명 · 독서/명상 챌린저</span>
                  <span>{item.time}</span>
                </div>
                <p className="mt-2 text-sm leading-6">{item.text}</p>
                <div className="mt-3 flex gap-2 text-xs">
                  <button className="rounded-full bg-[#e7d9cc] px-3 py-1.5">응원 {item.reactions.cheer}</button>
                  <button className="rounded-full bg-[#f1e5da] px-3 py-1.5">감사 {item.reactions.thanks}</button>
                </div>
              </article>
            ))}
          </ScreenFrame>

          <ScreenFrame title="7일 회고" subtitle="SCREEN 05">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-[#f2e7db] p-2">
                <p className="text-[11px] text-[#715f52]">완료율</p>
                <p className="text-base font-semibold">78%</p>
              </div>
              <div className="rounded-xl bg-[#e5efe9] p-2">
                <p className="text-[11px] text-[#5d675f]">연속일</p>
                <p className="text-base font-semibold">6일</p>
              </div>
              <div className="rounded-xl bg-[#efe6f2] p-2">
                <p className="text-[11px] text-[#6b6071]">응원받음</p>
                <p className="text-base font-semibold">43</p>
              </div>
            </div>
            <div className="rounded-2xl border border-[#decfc3] bg-[#fdf9f4] p-3">
              <p className="text-xs text-[#6f5f53]">이번 주 나의 문장</p>
              <p className="mt-2 text-sm leading-6">
                너무 멀리 가지 않아도 된다. 오늘의 나를 부드럽게 데리고 가면, 내일의 나가 그걸 기억한다.
              </p>
            </div>
            <button className="h-11 w-full rounded-xl border border-[#b89c88] bg-transparent text-sm font-semibold text-[#614f43] transition hover:bg-[#efe5dc]">
              다음 7일 이어가기
            </button>
          </ScreenFrame>
        </div>
      </div>
    </main>
  );
};
