import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import LinkExt from '@tiptap/extension-link';
import ImageExt from '@tiptap/extension-image';
import Heading from '@tiptap/extension-heading';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import '../styles/tiptap.css';

/**
 * 챌린지 보드 블록 렌더러 (공용).
 * — ChallengeBoardPage에서 추출: 보드 페이지와 피드의 "챌린지 보드 안내" 아코디언이 함께 사용.
 * 블록 형태: rich-text(TipTap JSON) · video(url) · 레거시 text/image/link/quote.
 */

// ─── YouTube 유틸 ──────────────────────────────────────────────────────────────

const getYouTubeId = (url: string) => {
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/)([^&?\s]{11})/);
  return m?.[1] ?? null;
};
const isYouTubeUrl = (url: string) => /youtu\.?be/.test(url);

// ─── 영상 렌더러 ───────────────────────────────────────────────────────────────

export const VideoBlock = ({ url }: { url: string }) => {
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

// ─── 레거시 블록 뷰어 (text / image / link / quote) ──────────────────────────

export const LegacyBlockViewer = ({ blocks }: { blocks: any[] }) => (
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

// ─── TipTap 확장 + 읽기 전용 뷰어 ────────────────────────────────────────────

export const TIPTAP_EXTENSIONS = [
  StarterKit.configure({ heading: false }),
  Heading.configure({ levels: [1, 2, 3] }),
  Underline,
  LinkExt.configure({ openOnClick: true, autolink: true, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
  ImageExt.configure({ HTMLAttributes: { class: 'rounded-xl max-w-full' } }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Placeholder.configure({ placeholder: '챌린지에 필요한 정보, 가이드, 링크 등을 자유롭게 작성하세요...' }),
];

export const RichTextViewer = ({ content }: { content: any }) => {
  const viewEditor = useEditor({ extensions: TIPTAP_EXTENSIONS, content, editable: false, immediatelyRender: false });
  return <EditorContent editor={viewEditor} />;
};

// ─── 통합 블록 뷰어 (읽기 전용) ──────────────────────────────────────────────

export const BoardBlocksViewer = ({ blocks }: { blocks: any[] }) => {
  const safeBlocks = Array.isArray(blocks) ? blocks : [];
  const richBlock = safeBlocks.find((b: any) => b.type === 'rich-text');
  const videoBlocks = safeBlocks.filter((b: any) => b.type === 'video');
  const legacyBlocks = safeBlocks.filter((b: any) => !['rich-text', 'video'].includes(b.type));

  return (
    <div>
      {richBlock && (
        <div className="tiptap-viewer mb-4">
          <RichTextViewer content={richBlock.content} />
        </div>
      )}
      {videoBlocks.length > 0 && (
        <div className="space-y-3 mb-4">
          {videoBlocks.map((b: any) => <VideoBlock key={b.id} url={b.url} />)}
        </div>
      )}
      {legacyBlocks.length > 0 && <LegacyBlockViewer blocks={legacyBlocks} />}
    </div>
  );
};

// ─── 콘텐츠 유무 판정 ─────────────────────────────────────────────────────────
// 미등록 오탐 수정의 핵심: rich-text(TipTap JSON)·video·image·link 블록도 콘텐츠로 인식한다.

const tipTapNodeHasContent = (node: any): boolean => {
  if (!node) return false;
  if (typeof node.text === 'string' && node.text.trim().length > 0) return true;
  if (node.type === 'image' && node.attrs?.src) return true;
  return Array.isArray(node.content) && node.content.some(tipTapNodeHasContent);
};

export const blockHasContent = (block: any): boolean => {
  if (!block) return false;
  switch (block.type) {
    case 'rich-text':
      return tipTapNodeHasContent(block.content);
    case 'image':
    case 'video':
    case 'link':
      return typeof block.url === 'string' && block.url.trim().length > 0;
    default:
      // text / quote / 기타 레거시 블록
      return typeof block.content === 'string' && block.content.trim().length > 0;
  }
};

export const hasBoardContent = (blocks: any): boolean =>
  Array.isArray(blocks) && blocks.some(blockHasContent);

// ─── 미리보기 텍스트 추출 (접힌 상태 요약용) ─────────────────────────────────

const collectTipTapText = (node: any): string => {
  if (!node) return '';
  if (typeof node.text === 'string') return node.text;
  if (!Array.isArray(node.content)) return '';
  return node.content.map(collectTipTapText).join(' ');
};

export const extractBoardPreviewText = (blocks: any[]): string | null => {
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (block?.type === 'rich-text') {
      const text = collectTipTapText(block.content).replace(/\s+/g, ' ').trim();
      if (text) return text;
    } else if (typeof block?.content === 'string' && block.content.trim()) {
      return block.content.trim();
    }
  }
  return null;
};
