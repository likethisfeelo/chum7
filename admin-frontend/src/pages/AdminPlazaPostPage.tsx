import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

type AdminPost = {
  plazaPostId: string;
  createdAt?: string;
  content?: string | null;
  imageUrl?: string | null;
  challengeCategory?: string | null;
  hashtag?: string | null;
  isActive: boolean;
};

const CATEGORY_LABEL = new Map<string, string>(CATEGORIES.map((c) => [c.slug, c.label]));

export const AdminPlazaPostPage = () => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [uploading, setUploading] = useState(false);

  const qc = useQueryClient();
  const invalidateList = () => {
    qc.invalidateQueries({ queryKey: ['admin-plaza-posts'] });
    qc.invalidateQueries({ queryKey: ['admin-plaza-logs'] });
  };

  const { data: posts = [], isLoading: listLoading, isError: listError } = useQuery({
    queryKey: ['admin-plaza-posts'],
    queryFn: async () => {
      const res = await apiClient.get('/s/plaza-admin/posts');
      return res.data.data.posts as AdminPost[];
    },
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['admin-plaza-logs'],
    queryFn: async () => {
      const res = await apiClient.get('/s/plaza-admin/logs');
      return res.data.data.logs as Array<{
        action: string;
        actorId: string;
        plazaPostId: string;
        authorId?: string | null;
        contentPreview?: string | null;
        at: string;
      }>;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (body: typeof EMPTY_FORM) => {
      const payload: Record<string, string> = { content: body.content };
      if (body.title) payload.title = body.title;
      if (body.imageUrl) payload.imageUrl = body.imageUrl;
      if (body.category) payload.challengeCategory = body.category;
      if (body.hashtag) payload.hashtag = body.hashtag;
      const res = await apiClient.post('/s/plaza-admin/posts', payload);
      return res.data.data as AdminPost;
    },
    onSuccess: () => {
      setForm(EMPTY_FORM);
      setFormError('');
      setSuccessMsg('마당에 게시되었습니다.');
      setTimeout(() => setSuccessMsg(''), 3000);
      invalidateList();
    },
    onError: () => setFormError('게시에 실패했습니다. 권한(admins/operators)과 입력값을 확인하세요.'),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ plazaPostId, next }: { plazaPostId: string; next: boolean }) => {
      await apiClient.patch(`/s/plaza-admin/posts/${plazaPostId}/${next ? 'activate' : 'deactivate'}`);
    },
    onSuccess: () => {
      setSuccessMsg('노출 상태를 변경했습니다.');
      setTimeout(() => setSuccessMsg(''), 3000);
      invalidateList();
    },
    onError: () => setFormError('노출 상태 변경에 실패했습니다.'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (plazaPostId: string) => {
      await apiClient.delete(`/s/plaza-admin/posts/${plazaPostId}`);
    },
    onSuccess: () => {
      setSuccessMsg('게시물을 삭제했습니다.');
      setTimeout(() => setSuccessMsg(''), 3000);
      invalidateList();
    },
    onError: () => setFormError('삭제에 실패했습니다.'),
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

      {/* 게시물 관리 */}
      <div className="mt-8">
        <h2 className="text-base font-semibold text-gray-800 mb-3">게시한 마당 글 관리</h2>

        {listLoading && <p className="text-sm text-gray-500">불러오는 중...</p>}
        {listError && <p className="text-sm text-red-500">목록을 불러오지 못했습니다.</p>}
        {!listLoading && posts.length === 0 && (
          <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-6 text-center text-sm text-gray-400">
            아직 게시한 마당 글이 없습니다.
          </div>
        )}

        <div className="space-y-3">
          {posts.map((post) => {
            const busy =
              (toggleMutation.isPending && toggleMutation.variables?.plazaPostId === post.plazaPostId) ||
              (deleteMutation.isPending && deleteMutation.variables === post.plazaPostId);
            return (
              <div
                key={post.plazaPostId}
                className={`bg-white border rounded-xl p-4 flex gap-3 ${
                  post.isActive ? 'border-gray-200' : 'border-gray-200 opacity-60'
                }`}
              >
                {post.imageUrl && (
                  <img
                    src={post.imageUrl}
                    alt=""
                    className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        post.isActive ? 'text-green-700 bg-green-100' : 'text-gray-500 bg-gray-100'
                      }`}
                    >
                      {post.isActive ? '노출 중' : '숨김'}
                    </span>
                    {post.challengeCategory && (
                      <span className="text-[11px] text-gray-500">
                        {CATEGORY_LABEL.get(post.challengeCategory) ?? post.challengeCategory}
                      </span>
                    )}
                    {post.hashtag && <span className="text-[11px] text-primary-600">#{post.hashtag}</span>}
                  </div>
                  <p className="text-sm text-gray-800 line-clamp-2 whitespace-pre-wrap">
                    {post.content || <span className="text-gray-400">(본문 없음)</span>}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    {post.createdAt ? new Date(post.createdAt).toLocaleString('ko-KR') : ''}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() =>
                        toggleMutation.mutate({ plazaPostId: post.plazaPostId, next: !post.isActive })
                      }
                      disabled={busy}
                      className="py-1 px-2.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                    >
                      {post.isActive ? '숨기기' : '다시 노출'}
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('이 게시물을 완전히 삭제할까요? 되돌릴 수 없습니다.')) {
                          deleteMutation.mutate(post.plazaPostId);
                        }
                      }}
                      disabled={busy}
                      className="py-1 px-2.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-500 disabled:opacity-50"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 게시/삭제 로그 — 누가 올리고 누가 지웠는지 */}
      <div className="mt-8">
        <h2 className="text-base font-semibold text-gray-800 mb-3">게시/삭제 로그</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-gray-400">로그가 없습니다.</p>
        ) : (
          <div className="space-y-1.5">
            {logs.map((log, i) => (
              <div key={`${log.plazaPostId}-${log.at}-${i}`} className="text-xs text-gray-600 flex items-center gap-2 border-b border-gray-100 pb-1.5">
                <span className={`font-semibold px-1.5 py-0.5 rounded ${log.action === 'delete' ? 'text-red-600 bg-red-50' : 'text-emerald-600 bg-emerald-50'}`}>
                  {log.action === 'delete' ? '삭제' : '게시'}
                </span>
                <span className="text-gray-400">{new Date(log.at).toLocaleString('ko-KR')}</span>
                <span className="truncate">
                  실행 {log.actorId?.slice(0, 8)}
                  {log.action === 'delete' && log.authorId ? ` · 원게시 ${log.authorId.slice(0, 8)}` : ''}
                  {log.contentPreview ? ` · "${log.contentPreview}"` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
