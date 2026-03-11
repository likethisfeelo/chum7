export type VerificationType = 'text' | 'image' | 'video' | 'link';

export function inferVerificationType(input: {
  verificationType?: VerificationType;
  linkUrl?: string | null;
  videoUrl?: string | null;
  imageUrl?: string | null;
}): VerificationType {
  if (input.verificationType) return input.verificationType;

  const linkUrl = input.linkUrl?.trim();
  const videoUrl = input.videoUrl?.trim();
  const imageUrl = input.imageUrl?.trim();

  if (linkUrl) return 'link';
  if (videoUrl) return 'video';
  if (imageUrl) return 'image';
  return 'text';
}
