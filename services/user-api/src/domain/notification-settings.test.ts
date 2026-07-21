import {
  DEFAULT_SETTINGS,
  mergeWithDefaults,
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
