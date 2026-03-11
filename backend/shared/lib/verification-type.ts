export type VerificationType = 'text' | 'image' | 'video' | 'link';

const ALLOWED_TYPES = new Set<VerificationType>(['text', 'image', 'video', 'link']);

export function inferVerificationType(input: {
  verificationType?: VerificationType | string | null;
  linkUrl?: string | null;
  videoUrl?: string | null;
  imageUrl?: string | null;
}): VerificationType {
  const explicitType = typeof input.verificationType === 'string' ? input.verificationType.trim() : '';
  if (explicitType && ALLOWED_TYPES.has(explicitType as VerificationType)) {
    return explicitType as VerificationType;
  }

  const linkUrl = input.linkUrl?.trim();
  const videoUrl = input.videoUrl?.trim();
  const imageUrl = input.imageUrl?.trim();

  if (linkUrl) return 'link';
  if (videoUrl) return 'video';
  if (imageUrl) return 'image';
  return 'text';
}
