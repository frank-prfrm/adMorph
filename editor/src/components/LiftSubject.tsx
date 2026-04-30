import { useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  SamModel,
  AutoProcessor,
  RawImage,
  Tensor,
  type SamProcessor,
} from '@huggingface/transformers';

const MODEL_ID = 'Xenova/slimsam-77-uniform';

type ModelBundle = {
  model: SamModel;
  processor: SamProcessor;
};

interface SamImageInputs {
  pixel_values: Tensor;
  original_sizes: [number, number][];
  reshaped_input_sizes: [number, number][];
}

interface SamImageEmbeddings {
  image_embeddings: Tensor;
  image_positional_embeddings: Tensor;
}

// Module-level singleton — load the model once across all LiftSubject instances.
let modelPromise: Promise<ModelBundle> | null = null;
function loadModel(): Promise<ModelBundle> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const model = (await SamModel.from_pretrained(MODEL_ID)) as SamModel;
      const processor = (await AutoProcessor.from_pretrained(MODEL_ID)) as unknown as SamProcessor;
      return { model, processor };
    })();
  }
  return modelPromise;
}

type Stage =
  | { kind: 'loading-model' }
  | { kind: 'encoding' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

interface Props {
  adId: string;
  screenshotBase64: string;
  displayWidth: number;
  displayHeight: number;
}

export function LiftSubject({ adId, screenshotBase64, displayWidth, displayHeight }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: 'loading-model' });
  const [maskUrl, setMaskUrl] = useState<string | null>(null);
  const [pressed, setPressed] = useState(false);
  const [pressNormalized, setPressNormalized] = useState<{ x: number; y: number } | null>(null);

  const bundleRef = useRef<ModelBundle | null>(null);
  const imageInputsRef = useRef<SamImageInputs | null>(null);
  const imageEmbeddingsRef = useRef<SamImageEmbeddings | null>(null);
  const inFlightRef = useRef(false);

  // Load model + encode this ad's screenshot.
  useEffect(() => {
    let cancelled = false;
    setStage({ kind: 'loading-model' });
    setMaskUrl(null);

    (async () => {
      try {
        const bundle = await loadModel();
        if (cancelled) return;
        bundleRef.current = bundle;
        setStage({ kind: 'encoding' });

        const image = await RawImage.fromURL(`data:image/jpeg;base64,${screenshotBase64}`);
        const inputs = (await bundle.processor(image)) as SamImageInputs;
        if (cancelled) return;
        imageInputsRef.current = inputs;
        const embeddings = await bundle.model.get_image_embeddings({ pixel_values: inputs.pixel_values });
        if (cancelled) return;
        imageEmbeddingsRef.current = embeddings;
        setStage({ kind: 'ready' });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[LiftSubject ${adId}] model/encode failed:`, err);
        setStage({ kind: 'error', message: msg });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [adId, screenshotBase64]);

  const segmentAt = async (xNorm: number, yNorm: number) => {
    const bundle = bundleRef.current;
    const inputs = imageInputsRef.current;
    const embeddings = imageEmbeddingsRef.current;
    if (!bundle || !inputs || !embeddings) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const reshaped = inputs.reshaped_input_sizes[0] as [number, number]; // [h, w]
      const px = xNorm * reshaped[1];
      const py = yNorm * reshaped[0];

      const inputPoints = new Tensor('float32', new Float32Array([px, py]), [1, 1, 1, 2]);
      const inputLabels = new Tensor('int64', new BigInt64Array([1n]), [1, 1, 1]);

      const out = await bundle.model({
        ...embeddings,
        input_points: inputPoints,
        input_labels: inputLabels,
      });

      const masks = await bundle.processor.post_process_masks(
        out.pred_masks,
        inputs.original_sizes,
        inputs.reshaped_input_sizes,
      );

      const iou = await out.iou_scores.data();
      let bestIdx = 0;
      let bestScore = -Infinity;
      for (let i = 0; i < iou.length; i++) {
        if (iou[i] > bestScore) {
          bestScore = iou[i];
          bestIdx = i;
        }
      }

      const maskTensor = masks[0][0]; // [num_masks, h, w]
      const maskImage = await rawImageFromMaskSlice(maskTensor, bestIdx);
      const url = maskImage.toCanvas().toDataURL('image/png');
      setMaskUrl(url);
    } catch (err) {
      console.warn(`[LiftSubject ${adId}] segmentation failed:`, err);
    } finally {
      inFlightRef.current = false;
    }
  };

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (stage.kind !== 'ready') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xNorm = (e.clientX - rect.left) / rect.width;
    const yNorm = (e.clientY - rect.top) / rect.height;
    if (xNorm < 0 || xNorm > 1 || yNorm < 0 || yNorm > 1) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    setPressed(true);
    setPressNormalized({ x: xNorm, y: yNorm });
    void segmentAt(xNorm, yNorm);
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setPressed(false);
  };

  const handlePointerCancel = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setPressed(false);
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: displayWidth,
        height: displayHeight,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'none',
        cursor: stage.kind === 'ready' ? 'crosshair' : 'default',
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <img
        src={`data:image/jpeg;base64,${screenshotBase64}`}
        draggable={false}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          pointerEvents: 'none',
          position: 'absolute',
          inset: 0,
          zIndex: 1,
        }}
      />

      {maskUrl && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            opacity: pressed ? 0.55 : 0.7,
            background: '#38bdf8',
            maskImage: `url(${maskUrl})`,
            WebkitMaskImage: `url(${maskUrl})`,
            maskSize: '100% 100%',
            WebkitMaskSize: '100% 100%',
            maskRepeat: 'no-repeat',
            WebkitMaskRepeat: 'no-repeat',
            mixBlendMode: 'screen',
            filter: pressed ? 'drop-shadow(0 0 12px #38bdf8)' : 'none',
            zIndex: 2,
            transition: 'opacity 120ms ease-out',
          }}
        />
      )}

      {pressed && pressNormalized && (
        <div
          style={{
            position: 'absolute',
            left: `${pressNormalized.x * 100}%`,
            top: `${pressNormalized.y * 100}%`,
            transform: 'translate(-50%, -50%)',
            width: 14,
            height: 14,
            borderRadius: '50%',
            border: '2px solid #38bdf8',
            background: 'rgba(56,189,248,0.9)',
            boxShadow: '0 0 0 2px rgba(0,0,0,0.6)',
            pointerEvents: 'none',
            zIndex: 3,
          }}
        />
      )}

      <StageBanner stage={stage} hasMask={!!maskUrl} />
    </div>
  );
}

function StageBanner({ stage, hasMask }: { stage: Stage; hasMask: boolean }) {
  let text = '';
  let bg = 'rgba(15, 23, 42, 0.85)';
  let color = '#cbd5e1';
  if (stage.kind === 'loading-model') {
    text = 'Loading lift-subject model… (one-time download, then cached)';
  } else if (stage.kind === 'encoding') {
    text = 'Encoding image…';
  } else if (stage.kind === 'error') {
    text = `Error: ${stage.message}`;
    bg = 'rgba(127, 29, 29, 0.95)';
    color = '#fecaca';
  } else if (stage.kind === 'ready') {
    text = hasMask
      ? 'Press a different spot to lift another subject'
      : 'Press and hold a subject to lift it';
  }
  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '4px 12px',
        borderRadius: 999,
        background: bg,
        color,
        fontSize: 11,
        fontWeight: 500,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        maxWidth: 'calc(100% - 32px)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        zIndex: 11,
      }}
    >
      {text}
    </div>
  );
}

/**
 * Pick out a single mask slice (by best-iou index) from a [num_masks, h, w]
 * boolean tensor, and convert to a white-on-black RGBA RawImage suitable
 * for use as a CSS mask-image source.
 */
async function rawImageFromMaskSlice(maskTensor: Tensor, idx: number): Promise<RawImage> {
  const [num, h, w] = maskTensor.dims as number[];
  if (idx < 0 || idx >= num) throw new Error(`mask index ${idx} out of range (0..${num - 1})`);
  const sliceData = maskTensor.data as Uint8Array | Int8Array | boolean[] | Float32Array;
  const offset = idx * h * w;
  const rgba = new Uint8ClampedArray(h * w * 4);
  for (let p = 0; p < h * w; p++) {
    const v = Number((sliceData as ArrayLike<number | boolean>)[offset + p]) ? 255 : 0;
    const i = p * 4;
    rgba[i] = v;
    rgba[i + 1] = v;
    rgba[i + 2] = v;
    rgba[i + 3] = 255;
  }
  return new RawImage(new Uint8ClampedArray(rgba), w, h, 4);
}
