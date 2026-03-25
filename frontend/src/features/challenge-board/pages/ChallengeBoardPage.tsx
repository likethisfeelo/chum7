import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FiArrowLeft, FiEdit2, FiCheck, FiX, FiLink, FiImage, FiAlignLeft, FiAlignCenter, FiAlignRight } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { Loading } from '@/shared/components/Loading';
import { useAuthStore } from '@/stores/authStore';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import LinkExt from '@tiptap/extension-link';
import ImageExt from '@tiptap/extension-image';
import Heading from '@tiptap/extension-heading';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import '../styles/tiptap.css';

// ─── 툴바 ─────────────────────────────────────────────────────────────────────

const ToolBtn = ({
  active, onClick, children, title,
}: { active?: boolean; onClick: () => void; children: React.ReactNode; title?: string }) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    className={`px-2 py-1.5 rounded text-sm font-medium transition-colors ${
      active ? 'bg-primary-100 text-primary-700' : 'text-gray-600 hover:bg-gray-100'
    }`}
  >
    {children}
  </button>
);

const Divider = () => <span className="w-px h-5 bg-gray-200 self-center mx-0.5" />;

const EditorToolbar = ({ editor }: { editor: Editor }) => {
  const [linkUrl, setLinkUrl] = useState('');
  const [showLink, setShowLink] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [showImage, setShowImage] = useState(false);

  const applyLink = () => {
    const url = linkUrl.trim();
    if (!url) return;
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.startsWith('http') ? url : `https://${url}` }).run();
    setLinkUrl('');
    setShowLink(false);
  };

  const insertImage = () => {
    const url = imageUrl.trim();
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
    setImageUrl('');
    setShowImage(false);
  };

  return (
    <div className="border border-gray-200 rounded-xl p-2 mb-2 bg-gray-50">
      <div className="flex flex-wrap items-center gap-0.5">
        {/* 헤딩 */}
        <ToolBtn active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="제목 1">H1</ToolBtn>
        <ToolBtn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="제목 2">H2</ToolBtn>
        <ToolBtn active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="제목 3">H3</ToolBtn>

        <Divider />

        {/* 서식 */}
        <ToolBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="굵게 (Ctrl+B)"><strong>B</strong></ToolBtn>
        <ToolBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="기울임 (Ctrl+I)"><em>I</em></ToolBtn>
        <ToolBtn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="밑줄 (Ctrl+U)"><u>U</u></ToolBtn>

        <Divider />

        {/* 정렬 */}
        <ToolBtn active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="왼쪽 정렬"><FiAlignLeft className="w-4 h-4" /></ToolBtn>
        <ToolBtn active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="가운데 정렬"><FiAlignCenter className="w-4 h-4" /></ToolBtn>
        <ToolBtn active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="오른쪽 정렬"><FiAlignRight className="w-4 h-4" /></ToolBtn>

        <Divider />

        {/* 링크 / 이미지 */}
        <ToolBtn active={editor.isActive('link')} onClick={() => { setShowImage(false); setShowLink((v) => !v); }} title="링크 삽입">
          <FiLink className="w-4 h-4" />
        </ToolBtn>
        <ToolBtn active={false} onClick={() => { setShowLink(false); setShowImage((v) => !v); }} title="이미지 URL 삽입">
          <FiImage className="w-4 h-4" />
        </ToolBtn>

        {/* 링크 해제 */}
        {editor.isActive('link') && (
          <ToolBtn active={false} onClick={() => editor.chain().focus().unsetLink().run()} title="링크 해제">
            <span className="text-xs text-red-500">링크 해제</span>
          </ToolBtn>
        )}
      </div>

      {/* 링크 입력 */}
      {showLink && (
        <div className="flex gap-2 mt-2">
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyLink()}
            placeholder="https://example.com"
            className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-primary-400"
          />
          <button type="button" onClick={applyLink} className="px-3 py-1.5 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600">추가</button>
          <button type="button" onClick={() => { setShowLink(false); setLinkUrl(''); }} className="px-3 py-1.5 text-sm bg-gray-200 rounded-lg hover:bg-gray-300"><FiX className="w-4 h-4" /></button>
        </div>
      )}

      {/* 이미지 URL 입력 */}
      {showImage && (
        <div className="flex gap-2 mt-2">
          <input
            autoFocus
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && insertImage()}
            placeholder="이미지 URL (https://...)"
            className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-primary-400"
          />
          <button type="button" onClick={insertImage} className="px-3 py-1.5 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600">삽입</button>
          <button type="button" onClick={() => { setShowImage(false); setImageUrl(''); }} className="px-3 py-1.5 text-sm bg-gray-200 rounded-lg hover:bg-gray-300"><FiX className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
};

// ─── 기존 블록 뷰어 (레거시 호환) ────────────────────────────────────────────

const LegacyBlockViewer = ({ blocks }: { blocks: any[] }) => (
  <div className="space-y-3">
    {blocks.map((block: any) => {
      if (block.type === 'image') {
        return <img key={block.id} src={block.url} alt="board" className="w-full rounded-xl border border-gray-100" />;
      }
      if (block.type === 'link') {
        return (
          <a key={block.id} href={block.url} target="_blank" rel="noreferrer" className="block text-sm text-blue-600 underline break-all hover:text-blue-800">
            {block.label || block.url}
          </a>
        );
      }
      return (
        <div key={block.id} className={`rounded-xl p-3 ${block.type === 'quote' ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-100'}`}>
          {block.type === 'quote' && <p className="text-xs text-amber-700 mb-1">💬 {block.authorName || '익명'}</p>}
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{block.content}</p>
        </div>
      );
    })}
  </div>
);

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────

const TIPTAP_EXTENSIONS = [
  StarterKit.configure({ heading: false }),
  Heading.configure({ levels: [1, 2, 3] }),
  Underline,
  LinkExt.configure({
    openOnClick: true,
    autolink: true,
    HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
  }),
  ImageExt.configure({ HTMLAttributes: { class: 'rounded-xl max-w-full' } }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Placeholder.configure({ placeholder: '챌린지에 필요한 정보, 가이드, 링크 등을 자유롭게 작성하세요...' }),
];

export const ChallengeBoardPage = () => {
  const { challengeId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [comment, setComment] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // ── TipTap 에디터 인스턴스 (항상 생성, editable 전환)
  const editor = useEditor({
    extensions: TIPTAP_EXTENSIONS,
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    editable: false,
  });

  // ── 데이터 쿼리
  const { data: boardData, isLoading: isBoardLoading } = useQuery({
    queryKey: ['challenge-board-page', challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const res = await apiClient.get(`/challenge-board/${challengeId}`);
      return res.data;
    },
  });

  const { data: challengeData } = useQuery({
    queryKey: ['challenge', challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const res = await apiClient.get(`/challenges/${challengeId}`);
      return res.data.data;
    },
  });

  const { data: commentsData, isLoading: isCommentsLoading } = useQuery({
    queryKey: ['challenge-board-page-comments', challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => {
      const res = await apiClient.get(`/challenge-board/${challengeId}/comments?limit=50`);
      return res.data;
    },
  });

  // ── 편집 시작: 에디터에 현재 보드 내용 로드
  useEffect(() => {
    if (!editor) return;
    if (isEditing) {
      const richBlock = (boardData?.blocks ?? []).find((b: any) => b.type === 'rich-text');
      editor.commands.setContent(
        richBlock?.content ?? { type: 'doc', content: [{ type: 'paragraph' }] }
      );
      editor.setEditable(true);
      editor.commands.focus();
    } else {
      editor.setEditable(false);
    }
  }, [isEditing, editor, boardData]);

  // ── 보드 저장
  const saveMutation = useMutation({
    mutationFn: async () => {
      const json = editor?.getJSON();
      const blocks = [{ id: crypto.randomUUID(), type: 'rich-text', content: json }];
      await apiClient.post(`/challenge-board/${challengeId}`, { blocks });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenge-board-page', challengeId] });
      setIsEditing(false);
      toast.success('보드가 저장되었습니다');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || '저장에 실패했습니다');
    },
  });

  // ── 댓글 등록
  const submitCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiClient.post(`/challenge-board/${challengeId}/comments`, { content });
      return res.data;
    },
    onSuccess: () => {
      setComment('');
      queryClient.invalidateQueries({ queryKey: ['challenge-board-page-comments', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['challenge-board-comments', challengeId] });
      toast.success('댓글이 등록되었어요');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || '댓글 등록에 실패했습니다');
    },
  });

  const handleCommentSubmit = (e: FormEvent) => {
    e.preventDefault();
    const content = comment.trim();
    if (!content) return;
    submitCommentMutation.mutate(content);
  };

  if (!challengeId) return <div className="p-6 text-sm text-gray-500">challengeId가 필요합니다.</div>;
  if (isBoardLoading || isCommentsLoading) return <Loading fullScreen />;

  const isLeader = challengeData?.createdBy === user?.userId;
  const blocks: any[] = boardData?.blocks ?? [];
  const hasRichText = blocks.some((b) => b.type === 'rich-text');
  const legacyBlocks = blocks.filter((b) => b.type !== 'rich-text');
  const richBlock = blocks.find((b) => b.type === 'rich-text');
  const isEmpty = blocks.length === 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-0">
      {/* 헤더 */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 z-10">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1">챌린지 보드</h1>
        {/* 리더 편집 버튼 (tablet+ 전용) */}
        {isLeader && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
          >
            <FiEdit2 className="w-4 h-4" />
            편집
          </button>
        )}
        {isEditing && (
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={() => { setIsEditing(false); }}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              <FiX className="w-4 h-4" />
              취소
            </button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-600 disabled:opacity-50"
            >
              <FiCheck className="w-4 h-4" />
              {saveMutation.isPending ? '저장 중...' : '저장'}
            </button>
          </div>
        )}
      </div>

      {/* 모바일: 리더 안내 (편집은 태블릿+만) */}
      {isLeader && (
        <div className="md:hidden px-4 py-2 bg-amber-50 border-b border-amber-100">
          <p className="text-xs text-amber-700">✏️ 보드 편집은 태블릿 이상 화면에서 가능합니다</p>
        </div>
      )}

      {/* 본문: 모바일 스택 / 데스크탑 2컬럼 */}
      <div className="p-4 lg:p-6 lg:grid lg:grid-cols-3 lg:gap-6 lg:items-start">

        {/* ── 보드 섹션 (lg: col-span-2) ─────────────────────── */}
        <section className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm mb-4 lg:mb-0">
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">보드</h2>
              {/* 편집 중 모바일 저장 버튼 숨김 (tablet+만) */}
            </div>

            {/* 에디터 or 뷰어 */}
            {isEditing ? (
              /* 편집 모드 (md+에서만 진입 가능) */
              <div className="tiptap-editor">
                <EditorToolbar editor={editor!} />
                <EditorContent editor={editor} />
                {/* 저장/취소 버튼 (에디터 하단에도 표시) */}
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    className="flex-1 py-2.5 text-sm font-semibold text-white bg-primary-500 rounded-xl hover:bg-primary-600 disabled:opacity-50"
                  >
                    {saveMutation.isPending ? '저장 중...' : '저장하기'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              /* 뷰어 모드 */
              <>
                {/* rich-text 블록 (TipTap 뷰어) */}
                {hasRichText && editor && (
                  <div className="tiptap-viewer">
                    <RichTextViewer content={richBlock.content} />
                  </div>
                )}
                {/* 레거시 블록 */}
                {legacyBlocks.length > 0 && <LegacyBlockViewer blocks={legacyBlocks} />}
                {/* 빈 상태 */}
                {isEmpty && (
                  <p className="text-sm text-gray-400 text-center py-8">
                    {isLeader ? '편집 버튼을 눌러 보드를 작성해보세요.' : '아직 보드가 작성되지 않았습니다.'}
                  </p>
                )}
              </>
            )}
          </div>
        </section>

        {/* ── 댓글 섹션 (lg: col-span-1, sticky) ──────────────── */}
        <section className="lg:col-span-1 bg-white rounded-2xl border border-gray-100 shadow-sm lg:sticky lg:top-20">
          <div className="p-5">
            <h3 className="font-bold text-gray-900 mb-4">
              댓글
              {(commentsData?.comments?.length ?? 0) > 0 && (
                <span className="ml-1.5 text-sm font-normal text-gray-400">({commentsData.comments.length})</span>
              )}
            </h3>

            {/* 댓글 입력 */}
            <form onSubmit={handleCommentSubmit} className="space-y-2 mb-4">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="응원이나 질문을 남겨보세요 (익명)"
                className="w-full min-h-[72px] px-3 py-2.5 text-sm rounded-xl border border-gray-200 resize-none outline-none focus:border-primary-400 transition-colors"
                maxLength={1000}
              />
              <button
                type="submit"
                disabled={submitCommentMutation.isPending || !comment.trim()}
                className="w-full py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50 hover:bg-primary-700 transition-colors"
              >
                {submitCommentMutation.isPending ? '등록 중...' : '댓글 등록'}
              </button>
            </form>

            {/* 댓글 목록 */}
            <div className="space-y-2 max-h-[400px] lg:max-h-[500px] overflow-y-auto">
              {(commentsData?.comments ?? []).map((item: any) => (
                <div key={item.commentId} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-gray-500">{item.dailyAnonymousId || '익명-000'}</span>
                    <div className="flex items-center gap-1.5">
                      {item.isQuoted && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">인용됨</span>
                      )}
                      <span className="text-[10px] text-gray-300">
                        {new Date(item.createdAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{item.content}</p>
                </div>
              ))}
              {(!commentsData?.comments || commentsData.comments.length === 0) && (
                <p className="text-sm text-gray-400 text-center py-4">첫 댓글을 남겨보세요.</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

// ─── TipTap 읽기 전용 뷰어 ────────────────────────────────────────────────────

const RichTextViewer = ({ content }: { content: any }) => {
  const viewEditor = useEditor({
    extensions: TIPTAP_EXTENSIONS,
    content,
    editable: false,
    immediatelyRender: false,
  });

  return <EditorContent editor={viewEditor} />;
};
