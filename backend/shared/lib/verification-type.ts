export type VerificationType = 'text' | 'image' | 'video' | 'link';

export function inferVerificationType(input: {
  verificationType?: VerificationType;
  linkUrl?: string;
  videoUrl?: string;
  imageUrl?: string;
}): VerificationType {
  if (input.verificationType) return input.verificationType;
  if (input.linkUrl) return 'link';
  if (input.videoUrl) return 'video';
  if (input.imageUrl) return 'image';
  return 'text';
}
