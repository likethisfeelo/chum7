export type VerificationType = 'text' | 'image' | 'video' | 'link';

const ALLOWED_TYPES = new Set<VerificationType>(['text', 'image', 'video', 'link']);

export function resolveVerificationType(input: {
  verificationType?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  linkUrl?: string | null;
}): VerificationType {
  const explicit = typeof input.verificationType === 'string' ? input.verificationType.trim() : '';
  if (explicit && ALLOWED_TYPES.has(explicit as VerificationType)) {
    return explicit as VerificationType;
  }

  const linkUrl = typeof input.linkUrl === 'string' ? input.linkUrl.trim() : '';
  const videoUrl = typeof input.videoUrl === 'string' ? input.videoUrl.trim() : '';
  const imageUrl = typeof input.imageUrl === 'string' ? input.imageUrl.trim() : '';

  if (linkUrl) return 'link';
  if (videoUrl) return 'video';
  if (imageUrl && /\.(mp4|webm|mov)(\?|$)/i.test(imageUrl)) return 'video';
  if (imageUrl) return 'image';
  return 'text';
}
