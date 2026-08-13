import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiRefreshCw } from 'react-icons/fi';
import { Button } from '@/shared/components/Button';
import { Textarea } from '@/shared/components/Textarea';
import { Loading } from '@/shared/components/Loading';
import toast from 'react-hot-toast';
import { getRemainingRemedyCount, getRemedyLabel, getRemedyType } from '@/features/challenge/utils/flowPolicy';
import { haptic } from '@/shared/utils/haptics';
import {
  computeTodayChallengeDay,
  durationDaysOf,
  missedDaysOf,
  remedyPolicyOf,
} from '@/features/challenge/utils/remedyStatus';

type RemedyMediaType = 'image' | 'text' | 'link' | 'video';

const TYPE_META: Record<RemedyMediaType, { label: string; emoji: string }> = {
  image: { label: '사진', emoji: '📸' },
  text: { label: '텍스트', emoji: '✍️' },
  link: { label: '링크', emoji: '🔗' },
  video: { label: '영상', emoji: '🎥' },
};

const MAX_REMEDY_IMAGES = 5;
const MAX_VIDEO_SEC = 60;

/** presigned PUT 업로드 (InlineVerificationForm 패턴 축약) */
async function uploadViaPresign(
  file: File,
  meta: { challengeId: string; userChallengeId: string; mediaKind: 'image' | 'video'; videoDurationSec?: number },
): Promise<string> {
  const { data: up } = await apiClient.post('/c/verifications/upload-url', {
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    challengeId: meta.challengeId,
    userChallengeId: meta.userChallengeId,
    mediaKind: meta.mediaKind,
    ...(meta.mediaKind === 'video'
      ? { videoDurationSec: meta.videoDurationSec, trimStartSec: 0, trimEndSec: meta.videoDurationSec }
      : {}),
  });
  const res = await fetch(up.data.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!res.ok) throw new Error(`UPLOAD_PUT_FAILED_${res.status}`);
  return up.data.fileUrl as string;
}

function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const duration = Number(video.duration || 0);
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('VIDEO_DURATION_READ_FAILED'));
    };
    video.src = url;
  });
}

export const RemedyPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userChallengeId = searchParams.get('userChallengeId');
  const dayFromQuery = searchParams.get('day');
  const queryClient = useQueryClient();

  const [selectedDay, setSelectedDay] = useState<number>(Number(dayFromQuery || 0));
  // 입력 부담 최소화 — 오늘의 실천만 필수 (회고·다짐 필드 제거)
  const [formData, setFormData] = useState({
    todayNote: '',
    practiceAt: new Date().toISOString().slice(0, 16),
  });
  // 인증 형식 — 챌린지가 허용한 방식만 (일반 인증과 동일 계약. 서버도 검증한다)
  const [selectedType, setSelectedType] = useState<RemedyMediaType>('text');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [linkUrl, setLinkUrl] = useState('');

  const { data: myChallengesData, isLoading: isLoadingChallenges } = useQuery({
    queryKey: ['my-challenges', 'remedy-page'],
    queryFn: async () => {
      // status=all — 종료 유예(마지막 날 보완) 중인 참여도 조회되어야 한다
      const response = await apiClient.get('/c/challenges/my?status=all');
      return response.data.data;
    },
  });

  const currentChallenge = useMemo(
    () => (myChallengesData?.challenges || []).find((item: any) => item.userChallengeId === userChallengeId),
    [myChallengesData?.challenges, userChallengeId],
  );

  // 지나간 날짜 중 미완료·미보완분 — 서버 저장 currentDay는 갱신 지연이 있어
  // 시작일 기준 KST 달력 계산(missedDaysOf)을 쓴다 (진행현황 그리드와 동일 기준)
  // Day 번호를 그대로 쓴다 — progress 항목으로 되돌리면 '한 번도 제출하지 않은 날'은
  // 항목이 없어 통째로 사라져 선택지가 0개가 된다(서버는 제출이 있었던 날만 항목 생성).
  const failedDays = useMemo(() => missedDaysOf(currentChallenge), [currentChallenge]);

  // 챌린지가 허용한 인증 방식 — 보완도 일반 인증과 같은 형식 제약을 따른다
  const allowedTypes = useMemo<RemedyMediaType[]>(() => {
    const raw = currentChallenge?.challenge?.allowedVerificationTypes;
    const list = Array.isArray(raw) && raw.length > 0 ? raw : ['image', 'text', 'link', 'video'];
    return (['image', 'text', 'link', 'video'] as RemedyMediaType[]).filter((t) => list.includes(t));
  }, [currentChallenge]);

  // 허용 목록이 로드되면 첫 번째 허용 방식을 기본 선택 (텍스트 미허용 챌린지 대응)
  useEffect(() => {
    if (allowedTypes.length > 0 && !allowedTypes.includes(selectedType)) {
      setSelectedType(allowedTypes[0]);
    }
  }, [allowedTypes, selectedType]);

  // 정책은 참여 레코드가 아닌 챌린지 META에서 폴백 해석 (참여 레벨 값은 대부분 null)
  const remedyPolicy = remedyPolicyOf(currentChallenge);
  const remainingRemedy = getRemainingRemedyCount(remedyPolicy, currentChallenge?.progress || []);
  const remedyType = getRemedyType(remedyPolicy);
  const durationDays = durationDaysOf(currentChallenge);
  const todayDay = currentChallenge ? computeTodayChallengeDay(currentChallenge) : 1;
  // last_day 정책은 마지막 날에만 서버 창이 열린다 — 미리 막아 헛제출을 방지
  const lastDayLocked = remedyType === 'last_day' && todayDay !== durationDays;
  const canSubmitRemedy =
    remedyType !== 'disabled' && !lastDayLocked && (remainingRemedy === null || remainingRemedy > 0);

  const remedyMutation = useMutation({
    mutationFn: async (data: any) => {
      const challengeId = currentChallenge?.challengeId ?? currentChallenge?.challenge?.challengeId;
      const uploadMeta = { challengeId: String(challengeId), userChallengeId: String(userChallengeId) };

      // 형식별 콘텐츠 준비 — 사진/영상은 presigned PUT 업로드 후 URL 첨부
      const content: Record<string, unknown> = {};
      if (selectedType === 'image') {
        const urls: string[] = [];
        for (const file of imageFiles) {
          urls.push(await uploadViaPresign(file, { ...uploadMeta, mediaKind: 'image' }));
        }
        content.imageUrls = urls;
        content.imageUrl = urls[0];
      } else if (selectedType === 'video' && videoFile) {
        const duration = Math.min(await readVideoDuration(videoFile), MAX_VIDEO_SEC);
        content.videoUrl = await uploadViaPresign(videoFile, {
          ...uploadMeta,
          mediaKind: 'video',
          videoDurationSec: Math.round(duration),
        });
      } else if (selectedType === 'link') {
        content.linkUrl = linkUrl.trim();
      }

      const response = await apiClient.post('/c/verifications/remedy', {
        ...data,
        verificationType: selectedType,
        ...content,
      });
      return response.data;
    },
    onSuccess: (data) => {
      haptic('success'); // 지원 기기(Android·앱 셸)에서 완료 진동
      queryClient.invalidateQueries({ queryKey: ['my-challenges'] });
      const remaining = data?.data?.remainingRemedyDays;
      if (remaining !== undefined && remaining !== null) {
        toast.success(`${data.message || '보완 인증 완료! 💪'} · 남은 보완 ${remaining}회`);
      } else {
        toast.success(data.message || '보완 인증 완료! 💪');
      }
      navigate('/me');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '보완 인증에 실패했습니다');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedDay) {
      toast.error('보완할 Day를 선택해주세요');
      return;
    }

    // 형식별 필수 콘텐츠 검증 (서버 MISSING_CONTENT 선제 차단)
    if (selectedType === 'text' && !formData.todayNote.trim()) {
      toast.error('오늘의 실천을 작성해주세요');
      return;
    }
    if (selectedType === 'image' && imageFiles.length === 0) {
      toast.error('사진을 1장 이상 첨부해주세요');
      return;
    }
    if (selectedType === 'video' && !videoFile) {
      toast.error('영상을 첨부해주세요');
      return;
    }
    if (selectedType === 'link' && !/^https:\/\//i.test(linkUrl.trim())) {
      toast.error('https:// 로 시작하는 링크를 입력해주세요');
      return;
    }

    remedyMutation.mutate({
      userChallengeId,
      originalDay: selectedDay,
      ...(formData.todayNote.trim() ? { todayNote: formData.todayNote.trim() } : {}),
      practiceAt: new Date(formData.practiceAt).toISOString(),
    });
  };

  if (isLoadingChallenges) {
    return <Loading fullScreen />;
  }

  if (!currentChallenge) {
    return (
      <div className="min-h-screen p-6 text-center text-gray-600">
        <p>유효한 챌린지 참여 정보를 찾을 수 없습니다.</p>
        <button onClick={() => navigate('/me')} className="mt-4 px-4 py-2 rounded-xl bg-primary-600 text-white">ME로 이동</button>
      </div>
    );
  }

  // 종료된 챌린지는 보완 불가 — 기간이 끝나면 점수·완주가 확정된다 (서버도 동일하게 막는다)
  if (computeTodayChallengeDay(currentChallenge) > durationDays) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <p className="text-4xl mb-3">🏁</p>
        <p className="text-base font-semibold text-gray-800">이미 종료된 챌린지예요</p>
        <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
          보완은 챌린지가 진행 중일 때만 할 수 있어요.
          <br />
          다음 챌린지에서 다시 이어가요.
        </p>
        <button
          onClick={() => navigate('/me')}
          className="mt-6 px-5 py-2.5 rounded-full bg-primary-600 text-white text-sm font-semibold"
        >
          내 챌린지로
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 glass-header px-6 py-4 flex items-center gap-4 z-10">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight">보완 인증하기</h1>
          {/* 여러 챌린지 동시 진행 시 어떤 챌린지의 보완인지 명시 */}
          <p className="text-xs text-gray-500 truncate">
            {currentChallenge.challenge?.badgeIcon || '🎯'} {currentChallenge.challenge?.title || '챌린지'}
          </p>
        </div>
      </div>

      <div className="p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl p-6 border border-purple-200 mb-6"
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="w-12 h-12 bg-purple-200 rounded-full flex items-center justify-center">
              <FiRefreshCw className="w-6 h-6 text-purple-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-purple-500 truncate">
                {currentChallenge.challenge?.badgeIcon || '🎯'} {currentChallenge.challenge?.title || '챌린지'}
              </p>
              <h3 className="font-bold text-purple-900 mb-1">보완 기회</h3>
              <p className="text-sm text-purple-700">
                {remedyType === 'last_day'
                  ? `마지막 날(Day ${durationDays})에 지난 인증을 한 번에 복구할 수 있어요.`
                  : '지나간 날 중 놓친 인증을 언제든 복구할 수 있어요.'}
              </p>
            </div>
          </div>
          <div className="space-y-2 text-sm text-purple-700">
            <p>정책: <span className="font-semibold">{getRemedyLabel(remedyPolicy)}</span></p>
            <p>남은 보완 횟수: <span className="font-semibold">{remainingRemedy === null ? '제한 없음' : `${remainingRemedy}회`}</span></p>
            <p>보완 점수: 기본 점수의 70%</p>
          </div>
        </motion.div>

        {!canSubmitRemedy && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 mb-4">
            {lastDayLocked
              ? `이 챌린지는 마지막 날(Day ${durationDays})에 보완 창이 열려요. 오늘은 Day ${todayDay} — 오늘의 인증에 집중해요!`
              : '현재 정책에서는 보완 인증을 진행할 수 없습니다.'}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">보완할 Day 선택</label>
            <div className="flex flex-wrap gap-2">
              {failedDays.map((day: number) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={`px-3 py-2 rounded-lg text-sm border ${selectedDay === day ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 border-gray-200'}`}
                >
                  Day {day}
                </button>
              ))}
            </div>
            {failedDays.length === 0 && <p className="text-xs text-gray-500 mt-2">보완 가능한 실패 Day가 없습니다.</p>}
          </div>

          {/* 인증 형식 — 챌린지 허용 방식만 (2개 이상일 때만 선택 칩 노출) */}
          {allowedTypes.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">인증 방식</label>
              <div className="flex flex-wrap gap-2">
                {allowedTypes.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSelectedType(t)}
                    className={`px-3 py-2 rounded-lg text-sm border ${
                      selectedType === t
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-white text-gray-700 border-gray-200'
                    }`}
                  >
                    {TYPE_META[t].emoji} {TYPE_META[t].label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 형식별 콘텐츠 입력 */}
          {selectedType === 'image' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">사진 첨부 📸 (최대 {MAX_REMEDY_IMAGES}장)</label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []).slice(0, MAX_REMEDY_IMAGES);
                  setImageFiles(files);
                }}
                className="w-full text-sm text-gray-600 file:mr-3 file:px-4 file:py-2 file:rounded-xl file:border-0 file:bg-purple-100 file:text-purple-700 file:text-sm file:font-semibold"
              />
              {imageFiles.length > 0 && (
                <div className="mt-2 flex gap-2 flex-wrap">
                  {imageFiles.map((f, i) => (
                    <div key={`${f.name}-${i}`} className="relative">
                      <img src={URL.createObjectURL(f)} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                      <button
                        type="button"
                        onClick={() => setImageFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-800 text-white text-[10px] flex items-center justify-center"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedType === 'video' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">영상 첨부 🎥 (최대 {MAX_VIDEO_SEC}초)</label>
              <input
                type="file"
                accept="video/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0] ?? null;
                  if (!file) { setVideoFile(null); return; }
                  try {
                    const duration = await readVideoDuration(file);
                    if (duration > MAX_VIDEO_SEC + 1) {
                      toast.error(`영상은 ${MAX_VIDEO_SEC}초 이하만 올릴 수 있어요`);
                      e.target.value = '';
                      return;
                    }
                  } catch {
                    // 길이 판독 실패 시 서버 검증에 맡긴다
                  }
                  setVideoFile(file);
                }}
                className="w-full text-sm text-gray-600 file:mr-3 file:px-4 file:py-2 file:rounded-xl file:border-0 file:bg-purple-100 file:text-purple-700 file:text-sm file:font-semibold"
              />
              {videoFile && <p className="text-xs text-gray-500 mt-1.5">🎬 {videoFile.name}</p>}
            </div>
          )}

          {selectedType === 'link' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">링크 🔗</label>
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https:// 로 시작하는 인증 링크"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          )}

          <Textarea
            label={selectedType === 'text' ? '오늘의 실천 ✨' : '한 줄 메모 (선택)'}
            value={formData.todayNote}
            onChange={(e) => setFormData({ ...formData, todayNote: e.target.value })}
            placeholder="오늘은 어떻게 다시 실천했나요?"
            rows={selectedType === 'text' ? 4 : 2}
            required={selectedType === 'text'}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">실천 시각 (내 로컬 시간) ⏰</label>
            <input
              type="datetime-local"
              value={formData.practiceAt}
              onChange={(e) => setFormData({ ...formData, practiceAt: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            />
            <p className="text-xs text-gray-500 mt-1">현재 시각 기준 4시간 이내만 제출할 수 있어요.</p>
          </div>

          <Button type="submit" fullWidth size="lg" loading={remedyMutation.isPending} disabled={!canSubmitRemedy || failedDays.length === 0}>
            다시 연결하기 ✨
          </Button>
        </form>

        {remedyType === 'last_day' && (
          <p className="text-xs text-gray-500 text-center mt-4">
            💡 이 챌린지는 마지막 날(Day {durationDays})에만 보완할 수 있어요
          </p>
        )}
      </div>
    </div>
  );
};
