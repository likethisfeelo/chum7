import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { AppEnv, ok, fail } from '@chum7/api-kit';
import { startCharacterSchema, nextCharacterSchema, themeSchema } from '../schemas';
import {
  MYTHOLOGY_CHARACTERS,
  MythologyLine,
  SLOTS_PER_CHARACTER,
} from '../domain/character-constants';
import { buildPendingSlotFill } from '../domain/character-slot';
import {
  buildMythologyProgress,
  countCompletedByLine,
  buildCollectionView,
  pickNextCharacterType,
} from '../domain/views';
import {
  getCharacterState,
  updateCharacterState,
  getCharacter,
  listCharacters,
  createCharacter,
  updateCharacterProgress,
} from '../repo/characters';

export const charactersRoutes = new Hono<AppEnv>();

// GET /g/characters/me/status  (레거시 GET /characters/me/status)
charactersRoutes.get('/me/status', async (c) => {
  const { userId } = c.get('authUser')!;
  const state = await getCharacterState(userId);

  if (!state?.onboardingDone) {
    return ok(c, {
      onboardingDone: false,
      activeMythology: null,
      activeCharacter: null,
      mythologyProgress: buildMythologyProgress({}),
      completedMythologies: [],
    });
  }

  let activeCharacter = null;
  if (state.activeCharacterId) {
    const rec = await getCharacter(userId, state.activeCharacterId);
    if (rec) {
      activeCharacter = {
        characterId: rec.characterId,
        mythologyLine: rec.mythologyLine,
        characterType: rec.characterType,
        filledCount: rec.filledCount ?? 0,
        totalSlots: SLOTS_PER_CHARACTER,
        slots: rec.slots ?? [],
        status: rec.status,
      };
    }
  }

  const allCharacters = await listCharacters(userId);
  return ok(c, {
    onboardingDone: true,
    activeMythology: state.activeMythology ?? null,
    activeCharacter,
    mythologyProgress: buildMythologyProgress(countCompletedByLine(allCharacters)),
    completedMythologies: state.completedMythologies ?? [],
    themeOverride: state.themeOverride ?? null,
  });
});

// POST /g/characters/me/start  (레거시 POST /characters/me/start — 온보딩 첫 캐릭터)
charactersRoutes.post('/me/start', async (c) => {
  const { userId } = c.get('authUser')!;
  const parsed = startCharacterSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return fail(c, 400, 'INVALID_INPUT', '입력값이 올바르지 않습니다', {
      details: parsed.error.flatten(),
    });
  }
  const mythologyLine = parsed.data.mythologyLine as MythologyLine;

  const state = await getCharacterState(userId);
  if (state?.onboardingDone) {
    return fail(c, 409, 'ALREADY_ONBOARDED', '이미 온보딩을 완료했어요');
  }

  const characterId = randomUUID();
  const characterType = MYTHOLOGY_CHARACTERS[mythologyLine][0];
  const now = new Date().toISOString();

  await createCharacter({
    characterId,
    userId,
    mythologyLine,
    characterType,
    slots: [],
    filledCount: 0,
    status: 'in_progress',
    createdAt: now,
  });
  await updateCharacterState(userId, {
    activeMythology: mythologyLine,
    activeCharacterId: characterId,
    onboardingDone: true,
    updatedAt: now,
  });

  return ok(c, {
    characterId,
    mythologyLine,
    characterType,
    filledCount: 0,
    totalSlots: SLOTS_PER_CHARACTER,
  });
});

// POST /g/characters/me/next  (레거시 POST /characters/me/next — 다음 캐릭터 선택)
charactersRoutes.post('/me/next', async (c) => {
  const { userId } = c.get('authUser')!;
  const parsed = nextCharacterSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return fail(c, 400, 'INVALID_INPUT', '입력값이 올바르지 않습니다');

  const state = await getCharacterState(userId);
  if (!state) return fail(c, 404, 'USER_NOT_FOUND', '사용자 정보를 찾을 수 없습니다');

  // 현재 캐릭터가 완성 상태인지 확인
  if (state.activeCharacterId) {
    const current = await getCharacter(userId, state.activeCharacterId);
    if (
      current?.status === 'in_progress' &&
      (current.filledCount ?? 0) < SLOTS_PER_CHARACTER
    ) {
      return fail(c, 409, 'CURRENT_CHARACTER_INCOMPLETE', '현재 캐릭터를 먼저 완성해주세요');
    }
  }

  const targetMythology = (parsed.data.mythologyLine ?? state.activeMythology) as MythologyLine;
  const completedMythologies = state.completedMythologies ?? [];

  // 다른 세계관으로 전환하려면 현재 세계관이 완성되어야 함
  if (targetMythology !== state.activeMythology) {
    if (!completedMythologies.includes(state.activeMythology as string)) {
      return fail(
        c, 403, 'MYTHOLOGY_NOT_COMPLETED',
        '현재 세계관을 완성해야 다른 세계관으로 이동할 수 있어요',
      );
    }
  }

  // 선택한 캐릭터 타입 결정 (없으면 해당 세계관에서 아직 완성 안 한 첫 캐릭터)
  const allCharacters = await listCharacters(userId);
  const completedTypes = new Set(
    allCharacters
      .filter((ch) => ch.status === 'complete' && ch.mythologyLine === targetMythology)
      .map((ch) => ch.characterType),
  );
  const characterType = pickNextCharacterType(targetMythology, completedTypes, parsed.data.characterType);

  const characterId = randomUUID();
  const now = new Date().toISOString();

  await createCharacter({
    characterId,
    userId,
    mythologyLine: targetMythology,
    characterType,
    slots: [],
    filledCount: 0,
    status: 'in_progress',
    createdAt: now,
  });
  await updateCharacterState(userId, {
    activeMythology: targetMythology,
    activeCharacterId: characterId,
    updatedAt: now,
  });

  // pendingSlotFills 소급 적용: 대기 구간에 쌓인 챌린지 완주를 새 캐릭터 슬롯에 반영
  const pendingCount = state.pendingSlotFills ?? 0;
  let filledCount = 0;
  if (pendingCount > 0) {
    const badgeIds = Array.from(
      { length: Math.min(pendingCount, SLOTS_PER_CHARACTER) },
      () => randomUUID(),
    );
    const pendingFill = buildPendingSlotFill(pendingCount, now, badgeIds);
    filledCount = pendingFill.filledCount;

    if (pendingFill.isComplete) {
      await updateCharacterProgress(userId, characterId, {
        slots: pendingFill.slots,
        filledCount: pendingFill.filledCount,
        status: 'complete',
        completedAt: now,
      });
      await updateCharacterState(userId, {
        activeCharacterId: null,
        pendingSlotFills: 0,
        updatedAt: now,
      });
    } else {
      await updateCharacterProgress(userId, characterId, {
        slots: pendingFill.slots,
        filledCount: pendingFill.filledCount,
      });
      await updateCharacterState(userId, { pendingSlotFills: 0 });
    }
  }

  return ok(c, {
    characterId,
    mythologyLine: targetMythology,
    characterType,
    filledCount,
    totalSlots: SLOTS_PER_CHARACTER,
  });
});

// GET /g/characters/me/collection  (레거시 GET /characters/me/collection)
charactersRoutes.get('/me/collection', async (c) => {
  const { userId } = c.get('authUser')!;
  const characters = await listCharacters(userId);
  return ok(c, buildCollectionView(characters));
});

// PUT /g/characters/me/theme  (레거시 PUT /characters/me/theme — 테마 오버라이드)
charactersRoutes.put('/me/theme', async (c) => {
  const { userId } = c.get('authUser')!;
  const parsed = themeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return fail(c, 400, 'INVALID_INPUT', '입력값이 올바르지 않습니다');

  const { mythology } = parsed.data;

  // null 이면 themeOverride 초기화 (세계관 검증 불필요)
  if (mythology !== null) {
    const state = await getCharacterState(userId);
    const completedMythologies = state?.completedMythologies ?? [];
    if (!completedMythologies.includes(mythology)) {
      return fail(c, 403, 'MYTHOLOGY_NOT_COMPLETED', '완성한 세계관만 테마로 적용할 수 있어요');
    }
  }

  await updateCharacterState(userId, {
    themeOverride: mythology,
    updatedAt: new Date().toISOString(),
  });

  return ok(c, { themeOverride: mythology });
});
