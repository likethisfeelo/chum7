export function validateQuestSubmissionContent(quest: any, content: any): string | null {
  switch (quest.verificationType) {
    case 'image':
      if (!content.imageUrl) return '이미지 URL이 필요합니다';
      break;
    case 'video':
      if (!content.videoUrl) return '영상 URL이 필요합니다';
      if (content.videoDurationSec === undefined) return '영상 길이 정보가 필요합니다';
      {
        const maxDurationSeconds = quest.verificationConfig?.maxDurationSeconds ?? 60;
        if (content.videoDurationSec > maxDurationSeconds) {
          return `영상은 ${maxDurationSeconds}초 이내로 제출해 주세요`;
        }
      }
      break;
    case 'link':
      if (!content.linkUrl) return 'URL이 필요합니다';
      if (quest.verificationConfig?.linkPattern) {
        try {
          const regex = new RegExp(quest.verificationConfig.linkPattern);
          if (!regex.test(content.linkUrl)) return 'URL 형식이 올바르지 않습니다';
        } catch {
          // invalid regex, skip
        }
      }
      break;
    case 'text': {
      if (!content.textContent) return '내용을 입력해 주세요';
      const maxChars = quest.verificationConfig?.maxChars ?? 2000;
      if (content.textContent.length > maxChars) {
        return `내용은 ${maxChars}자 이내로 작성해 주세요`;
      }
      break;
    }
  }
  return null;
}
