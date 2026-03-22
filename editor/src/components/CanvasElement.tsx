import type { AdElement } from '../types';

interface Props {
  element: AdElement;
  isSelected: boolean;
  onClick: (id: string) => void;
}

export function CanvasElement({ element, isSelected, onClick }: Props) {
  const { styles, type, content, id } = element;

  const baseStyle: React.CSSProperties = {
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
    backgroundImage: styles.backgroundImage,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    opacity: styles.opacity ? parseFloat(styles.opacity) : 1,
    zIndex: element.zIndex,
    cursor: 'pointer',
    overflow: 'hidden',
  };

  const selectionStyle: React.CSSProperties = isSelected
    ? { outline: '2px solid #3b82f6', outlineOffset: '1px' }
    : {};

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick(id);
  };

  if (type === 'image') {
    return (
      <img
        key={id}
        src={content}
        alt=""
        style={{ ...baseStyle, ...selectionStyle, objectFit: 'cover' }}
        onClick={handleClick}
        draggable={false}
      />
    );
  }

  return (
    <div
      key={id}
      style={{ ...baseStyle, ...selectionStyle }}
      onClick={handleClick}
    >
      {content || null}
    </div>
  );
}
