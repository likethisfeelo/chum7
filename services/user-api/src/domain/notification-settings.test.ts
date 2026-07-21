import {
  DEFAULT_QUIET_HOURS,
  DEFAULT_SETTINGS,
  mergeWithDefaults,
  parseQuietHours,
  pickSettingUpdates,
} from './notification-settings';

describe('pickSettingUpdates', () => {
  it('허용된 카테고리/타입 boolean 키만 추출한다', () => {
    const updates = pickSettingUpdates({
      category_challenge: false,
      type_cheer_received: true,
      category_unknown: false, // 화이트리스트 밖
      type_not_a_type: true, // 화이트리스트 밖
      category_quest: 'false', // boolean 아님
      whatever: 1,
    });
    expect(updates).toEqual({ category_challenge: false, type_cheer_received: true });
  });

  it('유효한 키가 없으면 빈 객체', () => {
    expect(pickSettingUpdates({})).toEqual({});
    expect(pickSettingUpdates({ foo: true })).toEqual({});
  });
});

describe('push 확장 키 (PRODUCT_SPEC §4.10)', () => {
  it('quietHours / cheerBypassQuietHours / push_category_* 를 추출한다', () => {
    const updates = pickSettingUpdates({
      quietHours: { start: '23:00', end: '07:00', enabled: true },
      cheerBypassQuietHours: false,
      push_category_cheer: false,
      push_category_unknown: false, // 화이트리스트 밖
    });
    expect(updates).toEqual({
      quietHours: { start: '23:00', end: '07:00', enabled: true },
      cheerBypassQuietHours: false,
      push_category_cheer: false,
    });
  });

  it('형식이 틀린 quietHours 는 무시한다', () => {
    expect(pickSettingUpdates({ quietHours: { start: '25:00', end: '08:00', enabled: true } })).toEqual({});
    expect(pickSettingUpdates({ quietHours: 'night' })).toEqual({});
  });

  it('parseQuietHours 검증 규칙', () => {
    expect(parseQuietHours({ start: '22:00', end: '08:00', enabled: true })).toEqual(DEFAULT_QUIET_HOURS);
    expect(parseQuietHours({ start: '8:30', end: '10:00', enabled: false }))
      .toEqual({ start: '8:30', end: '10:00', enabled: false });
    expect(parseQuietHours({ start: '22:00', end: '08:00' })).toBeNull();
    expect(parseQuietHours(null)).toBeNull();
  });

  it('기본값 병합에 방해금지 기본이 포함된다', () => {
    const merged = mergeWithDefaults(undefined);
    expect(merged.quietHours).toEqual({ start: '22:00', end: '08:00', enabled: true });
    expect(merged.cheerBypassQuietHours).toBe(true);
  });
});

describe('mergeWithDefaults', () => {
  it('저장값이 없으면 기본값 전체', () => {
    expect(mergeWithDefaults(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('저장값이 기본값을 덮어쓴다', () => {
    const merged = mergeWithDefaults({ category_cheer: false, type_cheer_received: false });
    expect(merged.category_cheer).toBe(false);
    expect(merged.type_cheer_received).toBe(false);
    expect(merged.category_challenge).toBe(true);
  });
});
