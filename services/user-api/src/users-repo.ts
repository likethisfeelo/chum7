import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tableName } from '@chum7/api-kit';

/**
 * users 테이블 (도메인 단일 테이블): PK `USER#<userId>`, SK 엔티티 프리픽스.
 *  - PROFILE           프로필 본문
 *  - NOTIF#<ts>#<id>   인앱 알림 (notification-worker가 기록)
 *  - PUSH#<endpointId> 웹 푸시 구독
 */
const SK_PROFILE = 'PROFILE';

export interface UserProfile {
  userId: string;
  email: string;
  name: string;
  profileImageUrl: string | null;
  identityPhrase: string;
  level: number;
  exp: number;
  animalIcon: string;
  stats: {
    completedChallenges: number;
    totalVerifications: number;
    consecutiveDays: number;
    averageCompletionRate: number;
  };
  createdAt: string;
  updatedAt: string;
}

const ANIMAL_ICONS = ['🐶', '🐱', '🐰', '🦊', '🐻', '🐼', '🐨', '🦁', '🐯', '🐸'];

export function newUserProfile(userId: string, email: string, name: string): UserProfile {
  const now = new Date().toISOString();
  return {
    userId,
    email,
    name,
    profileImageUrl: null,
    identityPhrase: '',
    level: 1,
    exp: 0,
    animalIcon: ANIMAL_ICONS[Math.floor(Math.random() * ANIMAL_ICONS.length)]!,
    stats: {
      completedChallenges: 0,
      totalVerifications: 0,
      consecutiveDays: 0,
      averageCompletionRate: 0,
    },
    createdAt: now,
    updatedAt: now,
  };
}

export async function putProfile(profile: UserProfile): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName('USERS_TABLE'),
      Item: { pk: `USER#${profile.userId}`, sk: SK_PROFILE, ...profile },
    }),
  );
}

export async function getProfile(userId: string): Promise<UserProfile | undefined> {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName('USERS_TABLE'),
      Key: { pk: `USER#${userId}`, sk: SK_PROFILE },
    }),
  );
  return result.Item as UserProfile | undefined;
}
