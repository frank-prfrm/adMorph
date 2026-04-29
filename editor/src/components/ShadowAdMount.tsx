import { useEffect, useRef, useState } from 'react';

export interface RoleBox {
  role: string;
  rect: { left: number; top: number; width: number; height: number };
}

interface Props {
  html: string;
  /** Native ad dimensions; the host div is sized to this and content lives at 1:1 inside. */
  width: number;
  height: number;
  /** Original screenshot for filling data-image-source="preserve" boxes. */
  screenshotBase64?: string;
  /** Bubble up the layout-derived role boxes so detection view can overlay them. */
  onRolesMeasured?: (boxes: RoleBox[]) => void;
}

/**
 * Mount LLM-generated HTML inside a shadow DOM at the ad's native size.
 * After layout, queries `[data-role]` descendants and reports their
 * bounding rects so we can overlay browser-accurate detection boxes.
 *
 * Elements with `data-image-source="preserve"` are filled from the
 * original screenshot using their measured rect — ad photos survive
 * because we crop the source pixels in place.
 */
export function ShadowAdMount({ html, width, height, screenshotBase64, onRolesMeasured }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [, force] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    shadow.innerHTML = html;

    // Defer one frame so layout has settled before measuring.
    const raf = requestAnimationFrame(() => {
      const adRoot = shadow.querySelector('.ad-root') as HTMLElement | null;
      const baseRect = (adRoot ?? host).getBoundingClientRect();

      // Fill preserve boxes from the original screenshot crop.
      if (screenshotBase64) {
        const preserves = shadow.querySelectorAll<HTMLElement>('[data-image-source="preserve"]');
        preserves.forEach((el) => {
          const r = el.getBoundingClientRect();
          const left = r.left - baseRect.left;
          const top = r.top - baseRect.top;
          // background-position/size derive the source crop from the same
          // (left,top,width,height) rectangle in the original screenshot.
          el.style.backgroundImage = `url("data:image/jpeg;base64,${screenshotBase64}")`;
          el.style.backgroundSize = `${width}px ${height}px`;
          el.style.backgroundPosition = `-${left}px -${top}px`;
          el.style.backgroundRepeat = 'no-repeat';
        });
      }

      // Report measured role boxes to the parent.
      if (onRolesMeasured) {
        const nodes = shadow.querySelectorAll<HTMLElement>('[data-role]');
        const boxes: RoleBox[] = Array.from(nodes).map((el) => {
          const r = el.getBoundingClientRect();
          return {
            role: el.getAttribute('data-role') ?? '',
            rect: {
              left: r.left - baseRect.left,
              top: r.top - baseRect.top,
              width: r.width,
              height: r.height,
            },
          };
        });
        onRolesMeasured(boxes);
      }
      force((n) => n + 1);
    });

    return () => cancelAnimationFrame(raf);
  }, [html, width, height, screenshotBase64, onRolesMeasured]);

  return (
    <div
      ref={hostRef}
      style={{ width, height, position: 'absolute', inset: 0, overflow: 'hidden' }}
    />
  );
}
