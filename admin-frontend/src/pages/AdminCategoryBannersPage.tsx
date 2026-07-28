import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

const CATEGORIES = [
  { slug: 'all',            label: '✨ 전체 (All)' },
  { slug: 'selflove',        label: '💗 Selflove' },
  { slug: 'attitude',   label: '🔥 Attitude' },
  { slug: 'discipline',         label: '⚡ Discipline' },
  { slug: 'explore',    label: '🧭 Explore' },
  { slug: 'create',   label: '🎨 Create' },
  { slug: 'build',  label: '🏗️ Build' },
  { slug: 'expand',        label: '🌱 Expand' },
  { slug: 'impact',        label: '🚀 Impact' },
] as const;

type CategorySlug = typeof CATEGORIES[number]['slug'];

type Banner = {
  slug: string;
  bannerId: string;
  imageUrl: string | null;
  tagline: string | null;
  description: string | null;
  isActive: string; // 'true' | 'false'
  createdAt: string;
};

const EMPTY_FORM = { imageUrl: '', tagline: '', description: '' };

export const AdminCategoryBannersPage = () => {
  const [selectedSlug, setSelectedSlug] = useState<CategorySlug>('all');
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [uploading, setUploading] = useState(false);

  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-category-banners', selectedSlug],
    queryFn: async () => {
      const res = await apiClient.get(`/adm/category-banners/${selectedSlug}`);
      return res.data.data.banners as Banner[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (body: typeof EMPTY_FORM) => {
      const payload: Record<string, string> = {};
      if (body.imageUrl)    payload.imageUrl    = body.imageUrl;
      if (body.tagline)     payload.tagline     = body.tagline;
      if (body.description) payload.description = body.description;
      const res = await apiClient.post(`/adm/category-banners/${selectedSlug}`, payload);
      return res.data.data as Banner;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-category-banners', selectedSlug] });
      setForm(EMPTY_FORM);
      setFormError('');
      setSuccessMsg('배너가 등록되었습니다.');
      setTimeout(() => setSuccessMsg(''), 3000);
    },
    onError: () => setFormError('등록에 실패했습니다.'),
  });

  const activateMutation = useMutation({
    mutationFn: async (bannerId: string) => {
      await apiClient.put(`/adm/category-banners/${selectedSlug}/${bannerId}/activate`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-category-banners', selectedSlug] });
      setSuccessMsg('메인 배너로 지정되었습니다.');
      setTimeout(() => setSuccessMsg(''), 3000);
    },
  });

  // 파일 선택 → presigned PUT 로 S3 업로드 → imageUrl 에 CloudFront URL 반영
  const handleFileUpload = async (file: File) => {
    if (!/^image\/(jpeg|jpg|png|webp|gif)$/.test(file.type)) {
      setFormError('JPG·PNG·WEBP·GIF 이미지만 업로드할 수 있어요.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFormError('이미지는 10MB 이하만 업로드할 수 있어요.');
      return;
    }
    setUploading(true);
    setFormError('');
    try {
      const presign = await apiClient.post('/adm/category-banners/upload-url', {
        contentType: file.type,
        fileSize: file.size,
      });
      const { uploadUrl, fileUrl } = presign.data.data as { uploadUrl: string; fileUrl: string };
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!put.ok) throw new Error('upload failed');
      setForm((f) => ({ ...f, imageUrl: fileUrl }));
      setSuccessMsg('이미지가 업로드되었습니다. 아래에서 내용을 확인 후 등록하세요.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch {
      setFormError('이미지 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.imageUrl && !form.tagline && !form.description) {
      setFormError('이미지 URL, 태그라인, 설명 중 하나 이상 입력해주세요.');
      return;
    }
    createMutation.mutate(form);
  };

  const selectedCategory = CATEGORIES.find((c) => c.slug === selectedSlug)!;
  const banners = data ?? [];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">카테고리 배너 관리</h1>
        <p className="text-sm text-gray-500 mt-1">카테고리별 배너를 등록하고 메인에 표시될 배너를 지정하세요.</p>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.slug}
            onClick={() => { setSelectedSlug(cat.slug); setFormError(''); setSuccessMsg(''); }}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              selectedSlug === cat.slug
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Banner List */}
        <div>
          <h2 className="text-base font-semibold text-gray-800 mb-3">
            {selectedCategory.label} 배너 목록
          </h2>

          {isLoading && <p className="text-sm text-gray-500">불러오는 중...</p>}
          {isError && <p className="text-sm text-red-500">목록을 불러오지 못했습니다.</p>}

          {!isLoading && banners.length === 0 && (
            <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-6 text-center text-sm text-gray-400">
              등록된 배너가 없습니다.
            </div>
          )}

          <div className="space-y-3">
            {banners.map((banner) => (
              <div
                key={banner.bannerId}
                className={`bg-white border rounded-xl p-4 ${
                  banner.isActive === 'true' ? 'border-green-400 ring-1 ring-green-300' : 'border-gray-200'
                }`}
              >
                {banner.isActive === 'true' && (
                  <span className="inline-block text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full mb-2">
                    ✅ 메인 표시 중
                  </span>
                )}

                {banner.imageUrl && (
                  <img
                    src={banner.imageUrl}
                    alt="banner preview"
                    className="w-full h-32 object-cover rounded-lg mb-2"
                  />
                )}

                <p className="text-sm font-semibold text-gray-800 truncate">
                  {banner.tagline || <span className="text-gray-400 font-normal">태그라인 없음</span>}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                  {banner.description || '설명 없음'}
                </p>
                {banner.imageUrl && (
                  <p className="text-xs text-gray-400 mt-1 truncate">{banner.imageUrl}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">{new Date(banner.createdAt).toLocaleString('ko-KR')}</p>

                {banner.isActive !== 'true' && (
                  <button
                    onClick={() => activateMutation.mutate(banner.bannerId)}
                    disabled={activateMutation.isPending}
                    className="mt-3 w-full py-1.5 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50"
                  >
                    메인 배너로 지정
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Add Banner Form */}
        <div>
          <h2 className="text-base font-semibold text-gray-800 mb-3">새 배너 등록</h2>
          <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">배너 이미지 업로드</label>
              <label
                className={`flex flex-col items-center justify-center w-full border-2 border-dashed rounded-lg py-4 text-sm cursor-pointer transition-colors ${
                  uploading
                    ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-wait'
                    : 'border-gray-300 text-gray-500 hover:border-gray-400 hover:bg-gray-50'
                }`}
              >
                <span className="text-lg mb-0.5">🖼️</span>
                {uploading ? '업로드 중…' : '클릭해서 이미지 선택 (JPG·PNG·WEBP·GIF, 최대 10MB)'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  disabled={uploading}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                    e.target.value = '';
                  }}
                />
              </label>
              <p className="text-[11px] text-gray-400 mt-1">업로드하면 서버(S3)에 저장되고 아래 URL이 자동으로 채워져요.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">이미지 URL <span className="text-gray-400">(직접 입력도 가능)</span></label>
              <input
                type="url"
                value={form.imageUrl}
                onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                placeholder="https://..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
              {form.imageUrl && (
                <img
                  src={form.imageUrl}
                  alt="preview"
                  className="mt-2 w-full h-28 object-cover rounded-lg"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">태그라인 <span className="text-gray-400">(최대 100자)</span></label>
              <input
                type="text"
                value={form.tagline}
                onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
                maxLength={100}
                placeholder="짧고 강렬한 한 줄 메시지"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">설명 <span className="text-gray-400">(최대 300자)</span></label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                maxLength={300}
                rows={3}
                placeholder="카테고리를 설명하는 문장"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 resize-none"
              />
            </div>

            {formError && <p className="text-xs text-red-500">{formError}</p>}
            {successMsg && <p className="text-xs text-green-600 font-medium">{successMsg}</p>}

            <button
              type="submit"
              disabled={createMutation.isPending}
              className="w-full py-2.5 rounded-lg text-sm font-semibold bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {createMutation.isPending ? '등록 중...' : '배너 등록'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
