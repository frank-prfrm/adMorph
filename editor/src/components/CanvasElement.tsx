import { useEffect, useRef } from 'react';
import type { AdElement } from '../types';

interface Props {
  element: AdElement;
  isSelected: boolean;
  isEditing: boolean;
  onClick: (id: string) => void;
  onDoubleClick: (id: string) => void;
  onEditCommit: (id: string, content: string) => void;
  onImageSwap: (id: string, dataUrl: string) => void;
}

export function CanvasElement({
  element,
  isSelected,
  isEditing,
  onClick,
  onDoubleClick,
  onEditCommit,
  onImageSwap,
}: Props) {
  const { styles, type, content, id } = element;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLDivElement>(null);

  // When edit mode activates, set content via ref and focus
  useEffect(() => {
    if (!isEditing || !editRef.current) return;
    editRef.current.innerText = content;
    editRef.current.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editRef.current);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  const base: React.CSSProperties = {
    position: 'absolute',
    top: styles.top,
    left: styles.left,
    width: styles.width,
    height: styles.height,
    backgroundColor: styles.backgroundColor,
    color: styles.color,
    fontSize: styles.fontSize,
    fontFamily: styles.fontFamily,
    fontWeight: styles.fontWeight,
    borderRadius: styles.borderRadius,
    // image type renders via <img> tag — don't also apply backgroundImage or you get ghosting
    backgroundImage: type === 'image' ? undefined : styles.backgroundImage,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    opacity: styles.opacity ? parseFloat(styles.opacity) : 1,
    zIndex: element.zIndex,
    overflow: 'hidden',
  };

  const ring: React.CSSProperties = isSelected
    ? { outline: '2px solid #3b82f6', outlineOffset: '1px' }
    : {};

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onImageSwap(id, reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ── Image element ──────────────────────────────────────────────────────────
  if (type === 'image') {
    return (
      <div
        style={{ ...base, ...ring, cursor: 'pointer', padding: 0 }}
        onClick={(e) => { e.stopPropagation(); onClick(id); }}
      >
        <img
          src={content}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }}
          draggable={false}
        />
        {isSelected && (
          <>
            <button
              style={{
                position: 'absolute', bottom: 4, right: 4,
                background: 'rgba(15,23,42,0.85)', color: '#e2e8f0',
                border: '1px solid rgba(148,163,184,0.3)', borderRadius: 4,
                padding: '2px 8px', cursor: 'pointer', fontSize: 11, lineHeight: '16px',
                backdropFilter: 'blur(4px)',
              }}
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            >
              Swap image
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
          </>
        )}
      </div>
    );
  }

  // ── Inline text editing ────────────────────────────────────────────────────
  if (isEditing) {
    return (
      <div
        ref={editRef}
        contentEditable
        suppressContentEditableWarning
        style={{ ...base, cursor: 'text', outline: '2px solid #3b82f6', outlineOffset: '1px', userSelect: 'text' }}
        onBlur={(e) => onEditCommit(id, e.currentTarget.innerText)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') editRef.current?.blur();
          e.stopPropagation();
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  // ── Default: text / button / container ────────────────────────────────────
  return (
    <div
      style={{ ...base, ...ring, cursor: 'pointer' }}
      onClick={(e) => { e.stopPropagation(); onClick(id); }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(id); }}
      title={type === 'text' || type === 'button' ? 'Double-click to edit text' : undefined}
    >
      {content || null}
    </div>
  );
}
