import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FiArrowLeft, FiEdit2, FiCheck, FiX, FiLink, FiImage, FiAlignLeft, FiAlignCenter, FiAlignRight, FiVideo, FiTrash2, FiCornerDownRight } from 'react-icons/fi';
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

// ─── YouTube 유틸 ──────────────────────────────────────────────────────────────

const getYouTubeId = (url: string) => {
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/)([^&?\s]{11})/);
  return m?.[1] ?? null;
};
const isYouTubeUrl = (url: string) => /youtu\.?be/.test(url);

// ─── 영상 렌더러 ───────────────────────────────────────────────────────────────

const VideoBlock = ({ url }: { url: string }) => {
  const ytId = isYouTubeUrl(url) ? getYouTubeId(url) : null;
  if (ytId) {
    return (
      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black">
        <iframe
          src={`https://www.youtube.com/embed/${ytId}`}
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  return (
    <video
      src={url}
      controls
      className="w-full rounded-xl bg-black"
      style={{ maxHeight: '360px' }}
    />
  );
};

// ─── 에디터 툴바 ───────────────────────────────────────────────────────────────

const ToolBtn = ({ active, onClick, children, title }: {
  active?: boolean; onClick: () => void; children: React.ReactNode; title?: string;
}) => (
  <button type="button" title={title} onClick={onClick}
    className={`px-2 py-1.5 rounded text-sm font-medium transition-colors ${active ? 'bg-primary-100 text-primary-700' : 'text-gray-600 hover:bg-gray-100'}`}>
    {children}
  </button>
);
const Sep = () => <span className="w-px h-5 bg-gray-200 self-center mx-0.5" />;

const EditorToolbar = ({ editor, onAddVideo }: { editor: Editor; onAddVideo: () => void }) => {
  const [linkUrl, setLinkUrl] = useState('');
  const [showLink, setShowLink] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [showImage, setShowImage] = useState(false);

  const applyLink = () => {
    const url = linkUrl.trim();
    if (!url) return;
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.startsWith('http') ? url : `https://${url}` }).run();
    setLinkUrl(''); setShowLink(false);
  };
  const insertImage = () => {
    const url = imageUrl.trim();
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
    setImageUrl(''); setShowImage(false);
  };

  return (
    <div className="border border-gray-200 rounded-xl p-2 mb-2 bg-gray-50">
      <div className="flex flex-wrap items-center gap-0.5">
        <ToolBtn active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="제목 1">H1</ToolBtn>
        <ToolBtn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="제목 2">H2</ToolBtn>
        <ToolBtn active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="제목 3">H3</ToolBtn>
        <Sep />
        <ToolBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="굵게"><strong>B</strong></ToolBtn>
        <ToolBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="기울임"><em>I</em></ToolBtn>
        <ToolBtn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="밑줄"><u>U</u></ToolBtn>
        <Sep />
        <ToolBtn active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="왼쪽"><FiAlignLeft className="w-4 h-4" /></ToolBtn>
        <ToolBtn active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="가운데"><FiAlignCenter className="w-4 h-4" /></ToolBtn>
        <ToolBtn active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="오른쪽"><FiAlignRight className="w-4 h-4" /></ToolBtn>
        <Sep />
        <ToolBtn active={editor.isActive('link')} onClick={() => { setShowImage(false); setShowLink((v) => !v); }} title="링크"><FiLink className="w-4 h-4" /></ToolBtn>
        <ToolBtn active={false} onClick={() => { setShowLink(false); setShowImage((v) => !v); }} title="이미지 URL"><FiImage className="w-4 h-4" /></ToolBtn>
        <ToolBtn active={false} onClick={onAddVideo} title="영상 추가 (YouTube / MP4)"><FiVideo className="w-4 h-4" /></ToolBtn>
        {editor.isActive('link') && (
          <ToolBtn active={false} onClick={() => editor.chain().focus().unsetLink().run()}>
            <span className="text-xs text-red-500">링크 해제</span>
          </ToolBtn>
        )}
      </div>
      {showLink && (
        <div className="flex gap-2 mt-2">
          <input autoFocus value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyLink()} placeholder="https://example.com" className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-primary-400" />
          <button type="button" onClick={applyLink} className="px-3 py-1.5 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600">추가</button>
          <button type="button" onClick={() => { setShowLink(false); setLinkUrl(''); }} className="px-2 py-1.5 text-sm bg-gray-200 rounded-lg hover:bg-gray-300"><FiX className="w-4 h-4" /></button>
        </div>
      )}
      {showImage && (
        <div className="flex gap-2 mt-2">
          <input autoFocus value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && insertImage()} placeholder="이미지 URL (https://...)" className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-primary-400" />
          <button type="button" onClick={insertImage} className="px-3 py-1.5 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600">삽입</button>
          <button type="button" onClick={() => { setShowImage(false); setImageUrl(''); }} className="px-2 py-1.5 text-sm bg-gray-200 rounded-lg hover:bg-gray-300"><FiX className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
};

// ─── 레거시 블록 뷰어 ─────────────────────────────────────────────────────────

const LegacyBlockViewer = ({ blocks }: { blocks: any[] }) => (
  <div className="space-y-3">
    {blocks.map((block: any) => {
      if (block.type === 'image') return <img key={block.id} src={block.url} alt="board" className="w-full rounded-xl border border-gray-100" />;
      if (block.type === 'video') return <VideoBlock key={block.id} url={block.url} />;
      if (block.type === 'link') return (
        <a key={block.id} href={block.url} target="_blank" rel="noreferrer" className="block text-sm text-blue-600 underline break-all hover:text-blue-800">{block.label || block.url}</a>
      );
      return (
        <div key={block.id} className={`rounded-xl p-3 ${block.type === 'quote' ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-100'}`}>
          {block.type === 'quote' && <p className="text-xs text-amber-700 mb-1">💬 {block.authorName || '익명'}</p>}
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{block.content}</p>
        </div>
      );
    })}
  </div>
);

// ─── TipTap 읽기 전용 뷰어 ────────────────────────────────────────────────────

const TIPTAP_EXTENSIONS = [
  StarterKit.configure({ heading: false }),
  Heading.configure({ levels: [1, 2, 3] }),
  Underline,
  LinkExt.configure({ openOnClick: true, autolink: true, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
  ImageExt.configure({ HTMLAttributes: { class: 'rounded-xl max-w-full' } }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Placeholder.configure({ placeholder: '챌린지에 필요한 정보, 가이드, 링크 등을 자유롭게 작성하세요...' }),
];

const RichTextViewer = ({ content }: { content: any }) => {
  const viewEditor = useEditor({ extensions: TIPTAP_EXTENSIONS, content, editable: false, immediatelyRender: false });
  return <EditorContent editor={viewEditor} />;
};

// ─── 댓글 반응 버튼 ───────────────────────────────────────────────────────────

const EMOJIS = ['❤️', '🔥', '👏'] as const;
type ReactionEmoji = typeof EMOJIS[number];

const ReactionBar = ({ comment, onReact }: {
  comment: any;
  onReact: (commentId: string, emoji: ReactionEmoji, action: 'add' | 'remove') => void;
}) => (
  <div className="flex items-center gap-1.5 mt-2">
    {EMOJIS.map((emoji) => {
      const count = comment.reactions?.[emoji] ?? 0;
      const reacted = comment.myReactions?.includes(emoji);
      return (
        <button
          key={emoji}
          type="button"
          onClick={() => onReact(comment.commentId, emoji, reacted ? 'remove' : 'add')}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors ${
            reacted ? 'bg-primary-100 text-primary-700 border border-primary-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-transparent'
          }`}
        >
          <span>{emoji}</span>
          {count > 0 && <span>{count}</span>}
        </button>
      );
    })}
  </div>
);

// ─── 댓글 아이템 ──────────────────────────────────────────────────────────────

const CommentItem = ({ comment, isReply = false, onReact, onReply }: {
  comment: any;
  isReply?: boolean;
  onReact: (commentId: string, emoji: ReactionEmoji, action: 'add' | 'remove') => void;
  onReply?: (commentId: string, anonId: string) => void;
}) => (
  <div className={`rounded-xl border bg-gray-50 p-3 ${isReply ? 'border-primary-100 bg-primary-50/30 ml-4' : 'border-gray-100'}`}>
    <div className="flex items-center justify-between mb-1">
      <span className={`text-xs font-medium ${comment.isRevealed ? 'text-primary-600' : 'text-gray-500'}`}>
        {comment.isRevealed ? '🔓 ' : ''}{comment.dailyAnonymousId || '익명-000'}
      </span>
      <div className="flex items-center gap-1.5">
        {comment.isQuoted && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">인용됨</span>}
        <span className="text-[10px] text-gray-300">
          {new Date(comment.createdAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
        </span>
      </div>
    </div>
    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{comment.content}</p>
    <div className="flex items-center justify-between">
      <ReactionBar comment={comment} onReact={onReact} />
      {!isReply && onReply && (
        <button
          type="button"
          onClick={() => onReply(comment.commentId, comment.dailyAnonymousId)}
          className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-primary-600 transition-colors mt-1"
        >
          <FiCornerDownRight className="w-3 h-3" />
          답글
        </button>
      )}
    </div>
  </div>
);

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────

export const ChallengeBoardPage = () => {
  const { challengeId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [comment, setComment] = useState('');
  const [replyTo, setReplyTo] = useState<{ commentId: string; anonId: string } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [videoBlocks, setVideoBlocks] = useState<{ id: string; url: string }[]>([]);
  const [showVideoInput, setShowVideoInput] = useState(false);
  const [videoInputUrl, setVideoInputUrl] = useState('');
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: TIPTAP_EXTENSIONS,
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    editable: false,
  });

  // ── 데이터 쿼리
  const { data: boardData, isLoading: isBoardLoading } = useQuery({
    queryKey: ['challenge-board-page', challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => { const r = await apiClient.get(`/challenge-board/${challengeId}`); return r.data; },
  });

  const { data: challengeData } = useQuery({
    queryKey: ['challenge', challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => { const r = await apiClient.get(`/challenges/${challengeId}`); return r.data.data; },
  });

  const { data: commentsData, isLoading: isCommentsLoading } = useQuery({
    queryKey: ['challenge-board-page-comments', challengeId],
    enabled: Boolean(challengeId),
    queryFn: async () => { const r = await apiClient.get(`/challenge-board/${challengeId}/comments?limit=100`); return r.data; },
  });

  // ── 편집 모드 시작: 현재 보드 내용 로드
  useEffect(() => {
    if (!editor) return;
    if (isEditing) {
      const richBlock = (boardData?.blocks ?? []).find((b: any) => b.type === 'rich-text');
      editor.commands.setContent(richBlock?.content ?? { type: 'doc', content: [{ type: 'paragraph' }] });
      editor.setEditable(true);
      editor.commands.focus();
      // 영상 블록 로드
      const vBlocks = (boardData?.blocks ?? []).filter((b: any) => b.type === 'video')
        .map((b: any) => ({ id: b.id, url: b.url }));
      setVideoBlocks(vBlocks);
    } else {
      editor.setEditable(false);
    }
  }, [isEditing, editor, boardData]);

  // ── 자동저장: 편집 중 콘텐츠 변경 시 3초 debounce 후 백그라운드 저장
  useEffect(() => {
    if (!isEditing || !editor) return;
    const triggerAutoSave = () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      setAutoSaveStatus('idle');
      autoSaveTimerRef.current = setTimeout(async () => {
        setAutoSaveStatus('saving');
        try {
          const json = editor.getJSON();
          const blocks = [
            { id: crypto.randomUUID(), type: 'rich-text', content: json },
            ...videoBlocks.map((v) => ({ id: v.id, type: 'video', url: v.url })),
          ];
          await apiClient.post(`/challenge-board/${challengeId}`, { blocks });
          queryClient.invalidateQueries({ queryKey: ['challenge-board-page', challengeId] });
          setAutoSaveStatus('saved');
        } catch {
          setAutoSaveStatus('idle');
        }
      }, 3000);
    };
    editor.on('update', triggerAutoSave);
    return () => {
      editor.off('update', triggerAutoSave);
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [isEditing, editor, videoBlocks, challengeId, queryClient]);

  // ── 영상 추가
  const addVideoBlock = () => {
    const url = videoInputUrl.trim();
    if (!url) return;
    if (videoBlocks.length >= 10) { toast.error('영상은 최대 10개까지 추가할 수 있습니다'); return; }
    setVideoBlocks((prev) => [...prev, { id: crypto.randomUUID(), url }]);
    setVideoInputUrl('');
    setShowVideoInput(false);
  };

  // ── 보드 저장
  const saveMutation = useMutation({
    mutationFn: async () => {
      const json = editor?.getJSON();
      const blocks = [
        { id: crypto.randomUUID(), type: 'rich-text', content: json },
        ...videoBlocks.map((v) => ({ id: v.id, type: 'video', url: v.url })),
      ];
      await apiClient.post(`/challenge-board/${challengeId}`, { blocks });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenge-board-page', challengeId] });
      setIsEditing(false);
      toast.success('보드가 저장되었습니다');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '저장에 실패했습니다'),
  });

  // ── 댓글 등록
  const submitCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      await apiClient.post(`/challenge-board/${challengeId}/comments`, {
        content,
        ...(replyTo ? { parentCommentId: replyTo.commentId } : {}),
      });
    },
    onSuccess: () => {
      setComment(''); setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ['challenge-board-page-comments', challengeId] });
      queryClient.invalidateQueries({ queryKey: ['challenge-board-comments', challengeId] });
      toast.success('댓글이 등록되었어요');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || '댓글 등록에 실패했습니다'),
  });

  // ── 반응 토글 (낙관적 업데이트)
  const reactMutation = useMutation({
    mutationFn: async ({ commentId, emoji, action }: { commentId: string; emoji: string; action: 'add' | 'remove' }) => {
      await apiClient.post(`/challenge-board/${challengeId}/comments/${commentId}/react`, { emoji, action });
    },
    onMutate: async ({ commentId, emoji, action }) => {
      await queryClient.cancelQueries({ queryKey: ['challenge-board-page-comments', challengeId] });
      const prev = queryClient.getQueryData(['challenge-board-page-comments', challengeId]);
      queryClient.setQueryData(['challenge-board-page-comments', challengeId], (old: any) => {
        if (!old?.comments) return old;
        return {
          ...old,
          comments: old.comments.map((c: any) => {
            if (c.commentId !== commentId) return c;
            const delta = action === 'add' ? 1 : -1;
            const myReactions = action === 'add'
              ? [...(c.myReactions ?? []), emoji]
              : (c.myReactions ?? []).filter((e: string) => e !== emoji);
            return {
              ...c,
              reactions: { ...c.reactions, [emoji]: Math.max(0, (c.reactions?.[emoji] ?? 0) + delta) },
              myReactions,
            };
          }),
        };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx: any) => {
      if (ctx?.prev) queryClient.setQueryData(['challenge-board-page-comments', challengeId], ctx.prev);
      toast.error('반응 처리에 실패했습니다');
    },
  });

  const handleReact = (commentId: string, emoji: ReactionEmoji, action: 'add' | 'remove') => {
    reactMutation.mutate({ commentId, emoji, action });
  };

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
  const richBlock = blocks.find((b) => b.type === 'rich-text');
  const viewVideoBlocks = blocks.filter((b) => b.type === 'video');
  const legacyBlocks = blocks.filter((b) => !['rich-text', 'video'].includes(b.type));
  const isEmpty = blocks.length === 0;

  // 댓글 그루핑: root 댓글 + replies
  const allComments: any[] = commentsData?.comments ?? [];
  const rootComments = allComments.filter((c) => !c.parentCommentId);
  const repliesMap: Record<string, any[]> = {};
  allComments.filter((c) => c.parentCommentId).forEach((c) => {
    if (!repliesMap[c.parentCommentId]) repliesMap[c.parentCommentId] = [];
    repliesMap[c.parentCommentId].push(c);
  });

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      {/* 헤더 */}
      <div className="sticky top-0 glass-header px-4 py-3 flex items-center gap-3 z-10">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1">챌린지 보드</h1>
        {isLeader && !isEditing && (
          <button onClick={() => setIsEditing(true)} className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors">
            <FiEdit2 className="w-4 h-4" />편집
          </button>
        )}
        {isEditing && (
          <div className="hidden md:flex items-center gap-2">
            {autoSaveStatus === 'saving' && <span className="text-xs text-gray-400">저장 중...</span>}
            {autoSaveStatus === 'saved' && <span className="text-xs text-emerald-600">✓ 자동저장됨</span>}
            <button onClick={() => setIsEditing(false)} className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
              <FiX className="w-4 h-4" />취소
            </button>
            <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-600 disabled:opacity-50">
              <FiCheck className="w-4 h-4" />{saveMutation.isPending ? '저장 중...' : '저장'}
            </button>
          </div>
        )}
      </div>

      {isLeader && (
        <div className="md:hidden px-4 py-2 bg-amber-50 border-b border-amber-100">
          <p className="text-xs text-amber-700">✏️ 보드 편집은 태블릿 이상 화면에서 가능합니다</p>
        </div>
      )}

      <div className="p-4 lg:p-6 lg:grid lg:grid-cols-3 lg:gap-6 lg:items-start">

        {/* ── 보드 섹션 ── */}
        <section className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm mb-4 lg:mb-0">
          <div className="p-5">
            <h2 className="font-bold text-gray-900 mb-4">보드</h2>

            {isEditing ? (
              <div className="tiptap-editor">
                <EditorToolbar editor={editor!} onAddVideo={() => setShowVideoInput((v) => !v)} />
                <EditorContent editor={editor} />

                {/* 영상 URL 입력 */}
                {showVideoInput && (
                  <div className="flex gap-2 mt-3">
                    <input
                      autoFocus
                      value={videoInputUrl}
                      onChange={(e) => setVideoInputUrl(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addVideoBlock()}
                      placeholder="YouTube URL 또는 MP4 URL"
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-primary-400"
                    />
                    <button type="button" onClick={addVideoBlock} className="px-3 py-2 text-sm bg-primary-500 text-white rounded-xl hover:bg-primary-600">추가</button>
                    <button type="button" onClick={() => { setShowVideoInput(false); setVideoInputUrl(''); }} className="px-2 py-2 text-sm bg-gray-200 rounded-xl hover:bg-gray-300"><FiX className="w-4 h-4" /></button>
                  </div>
                )}

                {/* 추가된 영상 목록 */}
                {videoBlocks.length > 0 && (
                  <div className="mt-4 space-y-3">
                    <p className="text-xs font-medium text-gray-500">추가된 영상 ({videoBlocks.length}/10)</p>
                    {videoBlocks.map((v) => (
                      <div key={v.id} className="relative">
                        <VideoBlock url={v.url} />
                        <button
                          type="button"
                          onClick={() => setVideoBlocks((prev) => prev.filter((x) => x.id !== v.id))}
                          className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full hover:bg-black/70"
                        >
                          <FiTrash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 mt-4 items-center">
                  {autoSaveStatus === 'saving' && <span className="text-xs text-gray-400 mr-1">저장 중...</span>}
                  {autoSaveStatus === 'saved' && <span className="text-xs text-emerald-600 mr-1">✓ 자동저장됨</span>}
                  <button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
                    className="flex-1 py-2.5 text-sm font-semibold text-white bg-primary-500 rounded-xl hover:bg-primary-600 disabled:opacity-50">
                    {saveMutation.isPending ? '저장 중...' : '저장하기'}
                  </button>
                  <button type="button" onClick={() => setIsEditing(false)}
                    className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <>
                {richBlock && (
                  <div className="tiptap-viewer mb-4">
                    <RichTextViewer content={richBlock.content} />
                  </div>
                )}
                {viewVideoBlocks.length > 0 && (
                  <div className="space-y-3 mb-4">
                    {viewVideoBlocks.map((b: any) => <VideoBlock key={b.id} url={b.url} />)}
                  </div>
                )}
                {legacyBlocks.length > 0 && <LegacyBlockViewer blocks={legacyBlocks} />}
                {isEmpty && (
                  <p className="text-sm text-gray-400 text-center py-8">
                    {isLeader ? '편집 버튼을 눌러 보드를 작성해보세요.' : '아직 보드가 작성되지 않았습니다.'}
                  </p>
                )}
              </>
            )}
          </div>
        </section>

        {/* ── 댓글 섹션 ── */}
        <section className="lg:col-span-1 bg-white rounded-2xl border border-gray-100 shadow-sm lg:sticky lg:top-20">
          <div className="p-5">
            <h3 className="font-bold text-gray-900 mb-4">
              댓글
              {allComments.length > 0 && <span className="ml-1.5 text-sm font-normal text-gray-400">({allComments.length})</span>}
            </h3>

            {/* 답글 대상 표시 */}
            {replyTo && (
              <div className="flex items-center justify-between mb-2 px-3 py-1.5 bg-primary-50 rounded-lg border border-primary-100">
                <span className="text-xs text-primary-700"><FiCornerDownRight className="inline w-3 h-3 mr-1" />{replyTo.anonId}에게 답글</span>
                <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-gray-600"><FiX className="w-3.5 h-3.5" /></button>
              </div>
            )}

            {/* 댓글 입력 */}
            <form onSubmit={handleCommentSubmit} className="space-y-2 mb-4">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={replyTo ? '답글을 입력하세요...' : '응원이나 질문을 남겨보세요 (익명)'}
                className="w-full min-h-[72px] px-3 py-2.5 text-sm rounded-xl border border-gray-200 resize-none outline-none focus:border-primary-400 transition-colors"
                maxLength={1000}
              />
              <button type="submit" disabled={submitCommentMutation.isPending || !comment.trim()}
                className="w-full py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50 hover:bg-primary-700 transition-colors">
                {submitCommentMutation.isPending ? '등록 중...' : replyTo ? '답글 등록' : '댓글 등록'}
              </button>
            </form>

            {/* 댓글 목록 (root + replies) */}
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {rootComments.map((c: any) => (
                <div key={c.commentId}>
                  <CommentItem
                    comment={c}
                    onReact={handleReact}
                    onReply={(id, anonId) => { setReplyTo({ commentId: id, anonId }); setComment(''); }}
                  />
                  {(repliesMap[c.commentId] ?? []).map((reply: any) => (
                    <div key={reply.commentId} className="mt-1.5">
                      <CommentItem comment={reply} isReply onReact={handleReact} />
                    </div>
                  ))}
                </div>
              ))}
              {rootComments.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">첫 댓글을 남겨보세요.</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
