import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// challenge-api CHALLENGE_CATEGORIES / social-api interest-area 라벨맵과 동일한 8종
const CATEGORIES = [
  { slug: '', label: '카테고리 없음 (전체 마당에만 노출)' },
  { slug: 'selflove', label: '💗 건강 (selflove)' },
  { slug: 'discipline', label: '⚡ 습관 (discipline)' },
  { slug: 'create', label: '🎨 자기계발 (create)' },
  { slug: 'explore', label: '🧭 창작 (explore)' },
  { slug: 'build', label: '🏗️ 관계 (build)' },
  { slug: 'attitude', label: '🔥 마음챙김 (attitude)' },
  { slug: 'expand', label: '🌱 확장 (expand)' },
  { slug: 'impact', label: '🚀 임팩트 (impact)' },
] as const;

const EMPTY_FORM = { content: '', title: '', imageUrl: '', category: '', hashtag: '' };

type CreatedPost = { plazaPostId: string; createdAt?: string };

export const AdminPlazaPostPage = () => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [uploading, setUploading] = useState(false);
  const [created, setCreated] = useState<CreatedPost | null>(null);

  const createMutation = useMutation({
    mutationFn: async (body: typeof EMPTY_FORM) => {
      const payload: Record<string, string> = { content: body.content };
      if (body.title) payload.title = body.title;
      if (body.imageUrl) payload.imageUrl = body.imageUrl;
      if (body.category) payload.challengeCategory = body.category;
      if (body.hashtag) payload.hashtag = body.hashtag;
      const res = await apiClient.post('/s/plaza-admin/posts', payload);
      return res.data.data as CreatedPost;
    },
    onSuccess: (post) => {
      setForm(EMPTY_FORM);
      setFormError('');
      setCreated(post);
      setSuccessMsg('마당에 게시되었습니다.');
      setTimeout(() => setSuccessMsg(''), 3000);
    },
    onError: () => setFormError('게시에 실패했습니다. 권한(admins/operators)과 입력값을 확인하세요.'),
  });

  const deactivateMutation = useMutation({
    mutationFn: async (plazaPostId: string) => {
      await apiClient.patch(`/s/plaza-admin/posts/${plazaPostId}/deactivate`);
    },
    onSuccess: () => {
      setCreated(null);
      setSuccessMsg('게시물을 내렸습니다.');
      setTimeout(() => setSuccessMsg(''), 3000);
    },
    onError: () => setFormError('게시물 내리기에 실패했습니다.'),
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
      const presign = await apiClient.post('/s/plaza-admin/upload-url', {
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
      setSuccessMsg('이미지가 업로드되었습니다. 내용을 확인 후 게시하세요.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch {
      setFormError('이미지 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.content.trim()) {
      setFormError('본문을 입력해주세요.');
      return;
    }
    setFormError('');
    createMutation.mutate(form);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">마당 게시물 작성</h1>
        <p className="text-sm text-gray-500 mt-1">
          운영자 명의로 마당(광장) 피드에 게시물을 올립니다. 게시물에는 <b>운영자</b> 배지가 표시됩니다.
        </p>
      </div>

      {created && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-blue-800">방금 게시한 글</p>
          <p className="text-xs text-blue-600 mt-1 break-all">ID: {created.plazaPostId}</p>
          <button
            onClick={() => deactivateMutation.mutate(created.plazaPostId)}
            disabled={deactivateMutation.isPending}
            className="mt-3 py-1.5 px-3 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-500 disabled:opacity-50"
          >
            {deactivateMutation.isPending ? '내리는 중…' : '이 게시물 내리기'}
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            본문 <span className="text-red-500">*</span> <span className="text-gray-400">(최대 2000자)</span>
          </label>
          <textarea
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            maxLength={2000}
            rows={5}
            placeholder="마당 피드에 노출될 내용을 입력하세요."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            제목 <span className="text-gray-400">(선택, 최대 100자)</span>
          </label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            maxLength={100}
            placeholder="카드 상단에 표시될 제목 (미입력 가능)"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">카테고리 <span className="text-gray-400">(선택)</span></label>
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 bg-white"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.slug || 'none'} value={cat.slug}>
                {cat.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-gray-400 mt-1">카테고리를 지정하면 해당 카테고리 탭에도 노출됩니다.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">해시태그 <span className="text-gray-400">(선택, 최대 30자)</span></label>
          <input
            type="text"
            value={form.hashtag}
            onChange={(e) => setForm((f) => ({ ...f, hashtag: e.target.value }))}
            maxLength={30}
            placeholder="예: 이벤트 (# 없이 입력)"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">이미지 업로드 <span className="text-gray-400">(선택)</span></label>
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
          {form.imageUrl && (
            <img
              src={form.imageUrl}
              alt="preview"
              className="mt-2 w-full h-40 object-cover rounded-lg"
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          )}
        </div>

        {formError && <p className="text-xs text-red-500">{formError}</p>}
        {successMsg && <p className="text-xs text-green-600 font-medium">{successMsg}</p>}

        <button
          type="submit"
          disabled={createMutation.isPending || uploading}
          className="w-full py-2.5 rounded-lg text-sm font-semibold bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {createMutation.isPending ? '게시 중...' : '마당에 게시'}
        </button>
      </form>
    </div>
  );
};
