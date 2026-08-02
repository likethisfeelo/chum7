import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { resolveMediaUrl } from '@/shared/utils/mediaUrl';
import { challengeApi } from '../api/challengeApi';

// 챌린지 대표 이미지 선택/업로드 (생성·수정 공용). value=CloudFront URL | null.
export function CoverImagePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 업로드할 수 있어요');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('이미지는 10MB 이내만 가능해요');
      return;
    }
    setUploading(true);
    try {
      const url = await challengeApi.uploadCoverImage(file);
      onChange(url);
    } catch {
      toast.error('이미지 업로드에 실패했어요. 다시 시도해주세요.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {value ? (
        <div className="relative rounded-2xl overflow-hidden border border-gray-200">
          <img src={resolveMediaUrl(value)} alt="대표 이미지" className="w-full h-40 object-cover" />
          <div className="absolute top-2 right-2 flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="text-xs font-medium bg-white/90 text-gray-800 rounded-full px-3 py-1.5 shadow-sm disabled:opacity-50"
            >
              {uploading ? '업로드 중…' : '변경'}
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-xs font-medium bg-black/60 text-white rounded-full px-3 py-1.5"
            >
              삭제
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full h-40 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 hover:border-primary-300 hover:text-primary-500 transition-colors disabled:opacity-60"
        >
          {uploading ? (
            <span className="text-sm">업로드 중…</span>
          ) : (
            <>
              <span className="text-2xl">🖼️</span>
              <span className="text-sm mt-1 font-medium">대표 이미지 추가 (선택)</span>
              <span className="text-[11px] mt-0.5 text-gray-400">권장 가로형 4:3 (예: 1200×900) · 없으면 색 카드</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
