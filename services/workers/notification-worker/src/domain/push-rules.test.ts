import {
  bypassesQuietHours,
  buildPushPayload,
  decidePush,
  deepLinkFor,
  isPushChannelEnabled,
  isWithinQuietHours,
  minutesOfDayInSeoul,
  parseHm,
} from './push-rules';

// KST 특정 시각의 UTC Date 생성 (KST = UTC+9, DST 없음)
function kst(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const utcHour = ((h ?? 0) - 9 + 24) % 24;
  return new Date(Date.UTC(2026, 6, 21, utcHour, m ?? 0, 0));
}

describe('parseHm', () => {
  it('parses HH:MM to minutes', () => {
    expect(parseHm('22:00')).toBe(1320);
    expect(parseHm('08:30')).toBe(510);
    expect(parseHm('0:05')).toBe(5);
  });

  it('rejects invalid values', () => {
    expect(parseHm('24:00')).toBeNull();
    expect(parseHm('12:60')).toBeNull();
    expect(parseHm('abc')).toBeNull();
    expect(parseHm(undefined)).toBeNull();
    expect(parseHm(2200)).toBeNull();
  });
});

describe('minutesOfDayInSeoul', () => {
  it('converts UTC now to Asia/Seoul minutes of day', () => {
    expect(minutesOfDayInSeoul(kst('23:15'))).toBe(23 * 60 + 15);
    expect(minutesOfDayInSeoul(kst('07:59'))).toBe(7 * 60 + 59);
    expect(minutesOfDayInSeoul(kst('12:00'))).toBe(720);
  });
});

describe('isWithinQuietHours', () => {
  it('기본 22:00~08:00 (자정 넘는 구간)', () => {
    expect(isWithinQuietHours(parseHm('22:00')!, undefined)).toBe(true);
    expect(isWithinQuietHours(parseHm('03:00')!, undefined)).toBe(true);
    expect(isWithinQuietHours(parseHm('07:59')!, undefined)).toBe(true);
    expect(isWithinQuietHours(parseHm('08:00')!, undefined)).toBe(false);
    expect(isWithinQuietHours(parseHm('21:59')!, undefined)).toBe(false);
  });

  it('enabled=false 이면 항상 false', () => {
    expect(isWithinQuietHours(parseHm('23:00')!, { enabled: false })).toBe(false);
  });

  it('자정을 넘지 않는 사용자 지정 구간', () => {
    const quiet = { start: '13:00', end: '15:00', enabled: true };
    expect(isWithinQuietHours(parseHm('14:00')!, quiet)).toBe(true);
    expect(isWithinQuietHours(parseHm('15:00')!, quiet)).toBe(false);
    expect(isWithinQuietHours(parseHm('12:59')!, quiet)).toBe(false);
  });

  it('start === end 이면 구간 없음', () => {
    expect(isWithinQuietHours(600, { start: '10:00', end: '10:00' })).toBe(false);
  });

  it('형식이 틀린 시각은 기본값으로 대체', () => {
    expect(isWithinQuietHours(parseHm('23:00')!, { start: 'oops', end: 'bad' })).toBe(true);
  });
});

describe('isPushChannelEnabled', () => {
  it('설정이 없으면 기본 ON', () => {
    expect(isPushChannelEnabled(undefined, 'cheer')).toBe(true);
    expect(isPushChannelEnabled({}, 'commerce')).toBe(true);
  });

  it('push_category_* 채널 토글이 최우선', () => {
    expect(isPushChannelEnabled({ push_category_cheer: false, category_cheer: true }, 'cheer')).toBe(false);
    expect(isPushChannelEnabled({ push_category_cheer: true, category_cheer: false }, 'cheer')).toBe(true);
  });

  it('채널 토글이 없으면 카테고리 토글을 따른다', () => {
    expect(isPushChannelEnabled({ category_cheer: false }, 'cheer')).toBe(false);
  });

  it("워커 'social' 카테고리는 설정 키 feed_social에 매핑", () => {
    expect(isPushChannelEnabled({ category_feed_social: false }, 'social')).toBe(false);
    expect(isPushChannelEnabled({ push_category_feed_social: false }, 'social')).toBe(false);
  });
});

describe('bypassesQuietHours', () => {
  it('응원은 기본으로 방해금지를 우회한다', () => {
    expect(bypassesQuietHours(undefined, 'cheer')).toBe(true);
    expect(bypassesQuietHours({}, 'cheer')).toBe(true);
  });

  it('cheerBypassQuietHours=false 이면 우회하지 않는다', () => {
    expect(bypassesQuietHours({ cheerBypassQuietHours: false }, 'cheer')).toBe(false);
  });

  it('응원 외 카테고리는 우회 없음', () => {
    expect(bypassesQuietHours(undefined, 'social')).toBe(false);
    expect(bypassesQuietHours({ cheerBypassQuietHours: true }, 'commerce')).toBe(false);
  });
});

describe('decidePush', () => {
  it('채널 OFF → 미발송', () => {
    expect(decidePush({ category: 'cheer', settings: { category_cheer: false }, now: kst('12:00') }))
      .toEqual({ send: false, reason: 'channel_off' });
  });

  it('방해금지 시간대의 social → 미발송', () => {
    expect(decidePush({ category: 'social', settings: undefined, now: kst('23:00') }))
      .toEqual({ send: false, reason: 'quiet_hours' });
  });

  it('방해금지 시간대의 cheer → 기본 우회로 발송', () => {
    expect(decidePush({ category: 'cheer', settings: undefined, now: kst('23:00') }))
      .toEqual({ send: true, reason: 'ok' });
  });

  it('cheer 우회 옵션 OFF → 방해금지 적용', () => {
    expect(
      decidePush({ category: 'cheer', settings: { cheerBypassQuietHours: false }, now: kst('23:00') }),
    ).toEqual({ send: false, reason: 'quiet_hours' });
  });

  it('낮 시간대 기본 설정 → 발송', () => {
    expect(decidePush({ category: 'commerce', settings: {}, now: kst('12:00') }))
      .toEqual({ send: true, reason: 'ok' });
  });

  it('방해금지 해제 시 밤에도 발송', () => {
    expect(
      decidePush({ category: 'social', settings: { quietHours: { enabled: false } }, now: kst('23:30') }),
    ).toEqual({ send: true, reason: 'ok' });
  });
});

describe('deepLinkFor / buildPushPayload', () => {
  it('실존 라우트에 매핑된다', () => {
    expect(deepLinkFor('cheer.delivered')).toBe('/today');
    expect(deepLinkFor('comment.created')).toBe('/plaza');
    expect(deepLinkFor('follow.requested')).toBe('/personal-feed/notifications');
    expect(deepLinkFor('feed.invite_link_used')).toBe('/personal-feed/notifications');
    expect(deepLinkFor('order.paid')).toBe('/my');
    expect(deepLinkFor('shipment.updated')).toBe('/my');
    expect(deepLinkFor('unknown.event')).toBe('/');
  });

  it('페이로드 계약: title/body/category/deepLink', () => {
    expect(
      buildPushPayload({ message: '응원이 도착했어요!', category: 'cheer', eventType: 'cheer.delivered' }),
    ).toEqual({
      title: 'CHME',
      body: '응원이 도착했어요!',
      category: 'cheer',
      deepLink: '/today',
    });
  });
});
