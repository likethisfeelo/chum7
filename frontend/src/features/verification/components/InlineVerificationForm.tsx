import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { motion, AnimatePresence } from "framer-motion";
import { FiCamera, FiFileText, FiLink, FiVideo, FiX } from "react-icons/fi";
import toast from "react-hot-toast";

interface InlineVerificationFormProps {
  userChallenge: any;
  allowedVerificationTypes?: string[];
  onSuccess?: (data: any) => void;
  openVideoPickerSignal?: number;
}

type VerificationType = "text" | "image" | "video" | "link";

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024;

const ALL_TYPES: VerificationType[] = ["text", "image", "video", "link"];


// KST(UTC+9) 기준 오늘 날짜를 UTC midnight Date로 반환
function getKstDateOnly(): Date {
  const now = new Date();
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
}

function parseChallengeStartDate(userChallenge: any): Date | null {
  const start =
    userChallenge?.challenge?.actualStartAt ||
    userChallenge?.challenge?.startConfirmedAt ||
    userChallenge?.startDate ||
    userChallenge?.challenge?.startDate ||
    userChallenge?.challenge?.startAt;
  if (!start || typeof start !== "string") return null;

  // YYYY-MM-DD 형식 → KST 자정 기준으로 해석
  const dateOnlyMatch = start.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, y, m, d] = dateOnlyMatch;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  }

  // ISO 형식 → KST로 변환
  const parsed = new Date(start);
  if (Number.isNaN(parsed.getTime())) return null;
  const kstMs = parsed.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
}

function getChallengeDay(userChallenge: any): number {
  const startDate = parseChallengeStartDate(userChallenge);
  if (!startDate) return Math.max(1, Number(userChallenge.currentDay || 1));

  const today = getKstDateOnly();
  const diffMs = today.getTime() - startDate.getTime();
  const elapsed = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(1, elapsed + 1);
}

function toIsoFromLocalDateTime(localDateTime: string): string {
  if (!localDateTime) return new Date().toISOString();
  const parsed = new Date(localDateTime);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function toLocalDateTimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getSuccessToastMessage(payload: any): string {
  if (payload?.isExtra) return payload.message || "추가 기록이 저장되었어요 📝";
  if (payload?.type === "remedy")
    return payload.message || "보완 인증이 완료되었어요 💪";
  return payload?.message || "핵심 인증이 완료됐어요 ✅";
}

function extractApiErrorMessage(error: any): string {
  const apiMessage = error?.response?.data?.message;
  const details = error?.response?.data?.details;
  if (Array.isArray(details) && details.length > 0) {
    const first = details[0];
    if (first?.path?.length && first?.message) {
      return `입력값 오류(${first.path.join(".")}): ${first.message}`;
    }
  }
  if (
    typeof error?.message === "string" &&
    error.message.startsWith("UPLOAD_PUT_FAILED_")
  ) {
    return "파일 업로드에 실패했습니다. 네트워크 상태를 확인해주세요.";
  }
  return apiMessage || "인증에 실패했습니다";
}

async function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = Number(video.duration || 0);
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("VIDEO_DURATION_READ_FAILED"));
    };
    video.src = url;
  });
}

async function uploadFileWithProgress(
  uploadUrl: string,
  file: File,
  onProgress: (value: number) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const progress = Math.min(
        100,
        Math.round((event.loaded / event.total) * 100),
      );
      onProgress(progress);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      reject(new Error(`UPLOAD_PUT_FAILED_${xhr.status}`));
    };

    xhr.onerror = () => reject(new Error("UPLOAD_PUT_FAILED_NETWORK"));
    xhr.onabort = () => reject(new Error("UPLOAD_PUT_ABORTED"));

    xhr.send(file);
  });
}

export const InlineVerificationForm = ({
  userChallenge,
  allowedVerificationTypes,
  onSuccess,
  openVideoPickerSignal,
}: InlineVerificationFormProps) => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaPreviewUrlRef = useRef<string | null>(null);

  const availableTypes = useMemo(() => {
    if (!allowedVerificationTypes || allowedVerificationTypes.length === 0)
      return ALL_TYPES;
    const filtered = ALL_TYPES.filter((t) =>
      allowedVerificationTypes.includes(t),
    );
    return filtered.length ? filtered : ALL_TYPES;
  }, [allowedVerificationTypes]);

  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedType, setSelectedType] = useState<VerificationType>(
    availableTypes[0],
  );
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [videoDurationSec, setVideoDurationSec] = useState<number | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [formData, setFormData] = useState({
    todayNote: "",
    completedAt: toLocalDateTimeInputValue(new Date()),
  });
  const [extraVisibilityPrompt, setExtraVisibilityPrompt] = useState<{
    verificationId: string;
  } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(
    null,
  );
  const [cachedUploadUrl, setCachedUploadUrl] = useState<string | undefined>(
    undefined,
  );
  const [cachedUploadObjectKey, setCachedUploadObjectKey] = useState<
    string | undefined
  >(undefined);
  const [trimStartSec, setTrimStartSec] = useState<number>(0);
  const [trimEndSec, setTrimEndSec] = useState<number>(0);

  const acceptsFile = selectedType === "image" || selectedType === "video";

  useEffect(() => {
    if (!availableTypes.includes(selectedType)) {
      setSelectedType(availableTypes[0]);
    }
  }, [availableTypes, selectedType]);

  useEffect(() => {
    if (!openVideoPickerSignal) return;
    if (!availableTypes.includes("video")) return;

    setIsExpanded(true);
    setSelectedType("video");
    setTimeout(() => fileInputRef.current?.click(), 80);
  }, [openVideoPickerSignal, availableTypes]);

  useEffect(
    () => () => {
      if (mediaPreviewUrlRef.current) {
        URL.revokeObjectURL(mediaPreviewUrlRef.current);
        mediaPreviewUrlRef.current = null;
      }
    },
    [],
  );

  const acceptAttr = selectedType === "video" ? "video/*" : "image/*";

  const handleFocus = () => setIsExpanded(true);

  const resetMedia = () => {
    if (mediaPreviewUrlRef.current) {
      URL.revokeObjectURL(mediaPreviewUrlRef.current);
      mediaPreviewUrlRef.current = null;
    }
    setMediaFile(null);
    setMediaPreview(null);
    setVideoDurationSec(null);
    setTrimStartSec(0);
    setTrimEndSec(0);
    setUploadErrorMessage(null);
    setCachedUploadUrl(undefined);
    setCachedUploadObjectKey(undefined);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCollapse = () => {
    setIsExpanded(false);
    resetMedia();
    setLinkUrl("");
    setSelectedType(availableTypes[0]);
    setFormData({
      todayNote: "",
      completedAt: toLocalDateTimeInputValue(new Date()),
    });
    setExtraVisibilityPrompt(null);
    setUploadProgress(0);
  };

  const handleTypeChange = (next: VerificationType) => {
    setSelectedType(next);
    resetMedia();
    if (next !== "link") setLinkUrl("");
  };

  const handleMediaSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (selectedType === "image" && !file.type.startsWith("image/")) {
      toast.error("사진 인증에서는 이미지 파일만 업로드할 수 있어요.");
      return;
    }

    if (
      selectedType === "image" &&
      (file.type === "image/heic" ||
        file.type === "image/heif" ||
        file.type === "image/heic-sequence" ||
        file.type === "image/heif-sequence" ||
        file.name.toLowerCase().endsWith(".heic") ||
        file.name.toLowerCase().endsWith(".heif"))
    ) {
      toast.error(
        "HEIC/HEIF 이미지는 피드에서 표시되지 않을 수 있어요. 카메라 설정에서 JPEG 형식으로 변경하거나 다른 파일을 선택해주세요.",
        { duration: 5000 },
      );
      return;
    }

    if (selectedType === "image" && file.size > MAX_IMAGE_SIZE_BYTES) {
      toast.error("이미지는 10MB 이내만 업로드할 수 있어요.");
      return;
    }

    if (selectedType === "video" && !file.type.startsWith("video/")) {
      toast.error("영상 인증에서는 영상 파일만 업로드할 수 있어요.");
      return;
    }

    if (selectedType === "video" && file.size > MAX_VIDEO_SIZE_BYTES) {
      toast.error("영상은 500MB 이내만 업로드할 수 있어요.");
      return;
    }

    if (selectedType === "video") {
      try {
        const duration = await readVideoDuration(file);
        if (duration > 60) {
          if (fileInputRef.current) fileInputRef.current.value = "";
          toast.error("영상은 60초 이내만 업로드할 수 있어요.");
          return;
        }
        setVideoDurationSec(duration);
        setTrimStartSec(0);
        setTrimEndSec(Math.min(duration, 60));
      } catch {
        toast.error("영상 길이를 확인할 수 없습니다. 다시 시도해주세요.");
        return;
      }
    }

    setUploadErrorMessage(null);

    const previewUrl = URL.createObjectURL(file);
    if (mediaPreviewUrlRef.current) {
      URL.revokeObjectURL(mediaPreviewUrlRef.current);
    }
    mediaPreviewUrlRef.current = previewUrl;
    setMediaFile(file);
    setMediaPreview(previewUrl);
  };

  const verificationMutation = useMutation({
    mutationFn: async (payload?: { performedAtLocal?: string }) => {
      let uploadedUrl: string | undefined = cachedUploadUrl;
      let uploadedObjectKey: string | undefined = cachedUploadObjectKey;

      if (acceptsFile && mediaFile && !uploadedUrl) {
        setUploadErrorMessage(null);
        const challengeId =
          userChallenge.challengeId ?? userChallenge.challenge?.challengeId;
        const { data: uploadData } = await apiClient.post(
          "/verifications/upload-url",
          {
            fileName: mediaFile.name,
            fileType: mediaFile.type,
            fileSize: mediaFile.size,
            challengeId,
            userChallengeId: userChallenge.userChallengeId,
            ...(selectedType === "video"
              ? {
                  mediaKind: "video",
                  trimStartSec,
                  trimEndSec,
                  videoDurationSec,
                }
              : { mediaKind: "image" }),
          },
        );

        setUploadProgress(1);
        await uploadFileWithProgress(
          uploadData.data.uploadUrl,
          mediaFile,
          setUploadProgress,
        );
        uploadedUrl = uploadData.data.fileUrl;
        uploadedObjectKey = uploadData.data.key;
        setCachedUploadUrl(uploadedUrl);
        setCachedUploadObjectKey(uploadedObjectKey);
      }

      const response = await apiClient.post("/verifications", {
        userChallengeId: userChallenge.userChallengeId,
        day: getChallengeDay(userChallenge),
        verificationType: selectedType,
        ...(selectedType === "image" && uploadedUrl
          ? { imageUrl: uploadedUrl }
          : {}),
        ...(selectedType === "video" && uploadedUrl
          ? {
              videoUrl: uploadedUrl,
              videoDurationSec,
              trimStartSec,
              trimEndSec,
              videoObjectKey: uploadedObjectKey,
            }
          : {}),
        ...(selectedType === "link" && linkUrl.trim()
          ? { linkUrl: linkUrl.trim() }
          : {}),
        ...(formData.todayNote.trim()
          ? { todayNote: formData.todayNote.trim() }
          : {}),
        performedAt: toIsoFromLocalDateTime(
          payload?.performedAtLocal || formData.completedAt,
        ),
        isPublic: true,
        isAnonymous: true,
      });

      return response.data;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ["my-challenges"] });

      const payload = data?.data || {};
      const feedback = [
        payload?.scoreEarned !== undefined ? `+${payload.scoreEarned}점` : null,
        payload?.consecutiveDays ? `연속 ${payload.consecutiveDays}일` : null,
        payload?.delta !== null && payload?.delta !== undefined
          ? `델타 ${payload.delta}분`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");

      toast.success(
        feedback
          ? `${getSuccessToastMessage(payload)} (${feedback})`
          : getSuccessToastMessage(payload),
      );

      if (payload?.newBadges?.length) {
        toast(`새 뱃지: ${payload.newBadges.join(", ")}`, { icon: "🏅" });
      }
      if (payload?.cheerOpportunity?.cheerTicketGranted) {
        toast("응원권 1장을 획득했어요 🎟", { icon: "🎉" });
      }

      if (selectedType === "video") {
        toast("영상 메타데이터 검증이 잠시 후 완료됩니다.", { icon: "🎬" });
      }

      setUploadProgress(0);
      setCachedUploadUrl(undefined);
      setCachedUploadObjectKey(undefined);

      if (payload.isExtra && payload.verificationId) {
        setExtraVisibilityPrompt({ verificationId: payload.verificationId });
        return;
      }

      handleCollapse();
      if (onSuccess) onSuccess(data);
    },
    onError: (error: any) => {
      setUploadProgress(0);
      const message = extractApiErrorMessage(error);
      if (
        typeof error?.message === "string" &&
        error.message.startsWith("UPLOAD_PUT_FAILED_")
      ) {
        // S3 upload itself failed — clear the cache so retry re-uploads
        setCachedUploadUrl(undefined);
        setCachedUploadObjectKey(undefined);
        setUploadErrorMessage(message);
      }
      toast.error(message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const nowLocalDateTime = toLocalDateTimeInputValue(new Date());
    setFormData((prev) => ({ ...prev, completedAt: nowLocalDateTime }));

    if (selectedType === "image" && !mediaFile) {
      toast.error("사진을 첨부해주세요.");
      return;
    }

    if (selectedType === "video") {
      if (!mediaFile) {
        toast.error("영상을 첨부해주세요.");
        return;
      }
      if ((videoDurationSec || 0) > 60) {
        toast.error("영상은 60초 이내만 업로드할 수 있어요.");
        return;
      }
    }

    if (selectedType === "link" && !linkUrl.trim()) {
      toast.error("링크를 입력해주세요.");
      return;
    }

    if (selectedType === "link" && !linkUrl.trim().startsWith("https://")) {
      toast.error("링크는 https 형식만 허용됩니다.");
      return;
    }

    verificationMutation.mutate({ performedAtLocal: nowLocalDateTime });
  };

  const handleRetryUpload = () => {
    if (verificationMutation.isPending) return;
    const nowLocalDateTime = toLocalDateTimeInputValue(new Date());
    setFormData((prev) => ({ ...prev, completedAt: nowLocalDateTime }));
    verificationMutation.mutate({ performedAtLocal: nowLocalDateTime });
  };

  const makeExtraPublic = async () => {
    if (!extraVisibilityPrompt?.verificationId) {
      handleCollapse();
      if (onSuccess) onSuccess(null);
      return;
    }
    try {
      await apiClient.patch(
        `/verifications/${extraVisibilityPrompt.verificationId}/visibility`,
        { isPersonalOnly: false },
      );
      toast.success("추가 기록을 공개 피드로 전환했어요 🌍");
      queryClient.invalidateQueries({
        queryKey: ["verifications", "mine-extra"],
      });
      queryClient.invalidateQueries({ queryKey: ["verifications", "public"] });
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "공개 전환에 실패했습니다");
    } finally {
      handleCollapse();
      if (onSuccess) onSuccess(null);
    }
  };

  const safeDay = getChallengeDay(userChallenge);
  const badgeIcon = userChallenge.challenge?.badgeIcon || "🎯";

  return (
    <div className="relative">
      {!isExpanded && (
        <div className="flex items-center gap-3">
          <span className="text-2xl flex-shrink-0">{badgeIcon}</span>
          <div
            className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-400 cursor-text select-none hover:border-primary-300 hover:bg-primary-50 transition-colors"
            onClick={handleFocus}
          >
            오늘의 인증을 남겨보세요... (Day {safeDay})
          </div>
          {availableTypes.some((t) => t === "image" || t === "video") && (
            <button
              type="button"
              onClick={() => {
                setIsExpanded(true);
                const defaultMediaType = availableTypes.includes("image")
                  ? "image"
                  : availableTypes.includes("video")
                    ? "video"
                    : availableTypes[0];
                setSelectedType(defaultMediaType);
                setTimeout(() => fileInputRef.current?.click(), 100);
              }}
              className="p-2 rounded-full text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
            >
              <FiCamera className="w-5 h-5" />
            </button>
          )}
        </div>
      )}

      <AnimatePresence>
        {isExpanded && (
          <motion.form
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">{badgeIcon}</span>
                <div>
                  <p className="text-sm font-semibold text-gray-900 leading-tight">
                    {userChallenge.challenge?.title}
                  </p>
                  <p className="text-xs text-primary-600">Day {safeDay} / {userChallenge.durationDays || userChallenge.challenge?.durationDays || 7}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCollapse}
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>

            <div>
              <textarea
                value={formData.todayNote}
                onChange={(e) =>
                  setFormData({ ...formData, todayNote: e.target.value })
                }
                className="w-full px-3 py-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-400 text-sm"
                placeholder="소감(선택)을 남겨보세요 ✍️"
                rows={3}
              />
            </div>

            {selectedType === "link" && (
              <div>
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                  required
                />
              </div>
            )}

            {acceptsFile && (
              <div>
                {mediaPreview ? (
                  <div className="relative">
                    {selectedType === "video" ? (
                      <video
                        src={mediaPreview}
                        controls
                        className="w-full h-40 object-cover rounded-xl"
                      />
                    ) : (
                      <img
                        src={mediaPreview}
                        alt="Preview"
                        className="w-full h-40 object-cover rounded-xl"
                      />
                    )}
                    <button
                      type="button"
                      onClick={resetMedia}
                      className="absolute top-2 right-2 w-7 h-7 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70"
                    >
                      <FiX className="w-3 h-3" />
                    </button>
                  </div>
                ) : null}
                {selectedType === "video" && videoDurationSec !== null && (
                  <div className="mt-2 space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <p className="text-xs text-gray-600">
                      영상 길이: {videoDurationSec.toFixed(1)}초 · 트림
                      범위(미리보기): {trimStartSec.toFixed(1)}s ~{" "}
                      {trimEndSec.toFixed(1)}s
                    </p>
                    <label className="block text-[11px] text-gray-500">
                      시작점
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, videoDurationSec - 0.1)}
                      step={0.1}
                      value={trimStartSec}
                      onChange={(e) => {
                        const nextStart = Number(e.target.value);
                        const maxEnd = Math.min(
                          videoDurationSec,
                          nextStart + 60,
                        );
                        setTrimStartSec(nextStart);
                        setTrimEndSec((prev) =>
                          Math.max(nextStart + 0.1, Math.min(prev, maxEnd)),
                        );
                      }}
                      className="w-full"
                    />
                    <label className="block text-[11px] text-gray-500">
                      끝점
                    </label>
                    <input
                      type="range"
                      min={Math.min(videoDurationSec, trimStartSec + 0.1)}
                      max={Math.min(videoDurationSec, trimStartSec + 60)}
                      step={0.1}
                      value={trimEndSec}
                      onChange={(e) => setTrimEndSec(Number(e.target.value))}
                      className="w-full"
                    />
                    <p className="text-[11px] text-gray-500">
                      선택 구간: {(trimEndSec - trimStartSec).toFixed(1)}초
                      (최대 60초)
                    </p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={acceptAttr}
                  capture="environment"
                  onChange={handleMediaSelect}
                  className="hidden"
                />
              </div>
            )}

            {verificationMutation.isPending &&
            acceptsFile &&
            mediaFile &&
            uploadProgress > 0 ? (
              <div className="space-y-1">
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  업로드 중... {uploadProgress}%
                </p>
              </div>
            ) : null}

            {uploadErrorMessage &&
            acceptsFile &&
            mediaFile &&
            !verificationMutation.isPending ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
                <p className="text-xs text-red-700">{uploadErrorMessage}</p>
                <button
                  type="button"
                  onClick={handleRetryUpload}
                  className="px-3 py-1.5 text-xs rounded-lg border border-red-300 text-red-700 bg-white"
                >
                  업로드 재시도
                </button>
              </div>
            ) : null}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                실천한 시간 ⏰
              </label>
              <input
                type="datetime-local"
                value={formData.completedAt}
                onChange={(e) =>
                  setFormData({ ...formData, completedAt: e.target.value })
                }
                max={toLocalDateTimeInputValue(new Date())}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </div>

            {extraVisibilityPrompt && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                <p className="text-xs text-amber-800">
                  추가 기록(Extra)이 저장되었습니다. 지금 공개 피드로
                  전환할까요?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={makeExtraPublic}
                    className="px-3 py-1.5 text-xs rounded-lg bg-amber-600 text-white"
                  >
                    지금 공개
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleCollapse();
                      if (onSuccess) onSuccess(null);
                    }}
                    className="px-3 py-1.5 text-xs rounded-lg border border-amber-300 text-amber-700 bg-white"
                  >
                    나중에
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-1 border-t border-gray-100">
              <div className="flex items-center gap-1">
                {availableTypes.map((type) => {
                  const isActive = selectedType === type;
                  const Icon =
                    type === "text"
                      ? FiFileText
                      : type === "image"
                        ? FiCamera
                        : type === "video"
                          ? FiVideo
                          : FiLink;
                  const title =
                    type === "text"
                      ? "텍스트"
                      : type === "image"
                        ? "사진"
                        : type === "video"
                          ? "영상"
                          : "링크";

                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        handleTypeChange(type);
                        if (type === "image" || type === "video") {
                          setTimeout(() => fileInputRef.current?.click(), 50);
                        }
                      }}
                      className={`p-2 rounded-full transition-colors ${
                        isActive
                          ? "text-primary-700 bg-primary-50 border border-primary-200"
                          : "text-gray-400 hover:text-primary-600 hover:bg-primary-50 border border-transparent"
                      }`}
                      title={`${title} 인증`}
                    >
                      <Icon className="w-5 h-5" />
                    </button>
                  );
                })}
              </div>
              <motion.button
                whileTap={{ scale: 0.97 }}
                type="submit"
                disabled={
                  verificationMutation.isPending ||
                  (acceptsFile && uploadProgress > 0 && uploadProgress < 100)
                }
                className="px-5 py-2 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                {verificationMutation.isPending ? "제출 중..." : "인증하기 🎉"}
              </motion.button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
};
