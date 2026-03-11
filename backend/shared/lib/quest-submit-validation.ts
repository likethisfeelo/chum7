export function validateQuestSubmissionContent(quest: any, content: any): string | null {
  switch (quest.verificationType) {
    case 'image':
      if (!content.imageUrl?.trim()) return '이미지 URL이 필요합니다';
      break;
    case 'video':
      if (!content.videoUrl?.trim()) return '영상 URL이 필요합니다';
      if (content.videoDurationSec === undefined) return '영상 길이 정보가 필요합니다';
      if (!Number.isFinite(content.videoDurationSec) || content.videoDurationSec < 0) {
        return '영상 길이 정보가 올바르지 않습니다';
      }
      {
        const maxDurationSeconds = quest.verificationConfig?.maxDurationSeconds ?? 60;
        if (content.videoDurationSec > maxDurationSeconds) {
          return `영상은 ${maxDurationSeconds}초 이내로 제출해 주세요`;
        }
      }
      break;
    case 'link': {
      const linkUrl = content.linkUrl?.trim();
      if (!linkUrl) return 'URL이 필요합니다';
      if (quest.verificationConfig?.linkPattern) {
        try {
          const regex = new RegExp(quest.verificationConfig.linkPattern);
          if (!regex.test(linkUrl)) return 'URL 형식이 올바르지 않습니다';
        } catch {
          // invalid regex, skip
        }
      }
      break;
    }
    case 'text': {
      if (!content.textContent?.trim()) return '내용을 입력해 주세요';
      const maxChars = quest.verificationConfig?.maxChars ?? 2000;
      if (content.textContent.trim().length > maxChars) {
        return `내용은 ${maxChars}자 이내로 작성해 주세요`;
      }
      break;
    }
  }
  return null;
}


export function normalizeQuestSubmissionContent(content: any): Record<string, any> {
  const normalized: Record<string, any> = {};

  if (typeof content?.imageUrl === 'string') normalized.imageUrl = content.imageUrl.trim();
  if (typeof content?.videoUrl === 'string') normalized.videoUrl = content.videoUrl.trim();
  if (typeof content?.thumbnailUrl === 'string') normalized.thumbnailUrl = content.thumbnailUrl.trim();
  if (typeof content?.linkUrl === 'string') normalized.linkUrl = content.linkUrl.trim();
  if (typeof content?.textContent === 'string') normalized.textContent = content.textContent.trim();
  if (typeof content?.note === 'string') normalized.note = content.note.trim();
  if (content?.videoDurationSec !== undefined) normalized.videoDurationSec = content.videoDurationSec;

  return normalized;
}
