import { useAdStore } from '../store';
import type { AdElementStyles } from '../types';

export function Sidebar() {
  const elements = useAdStore((s) => s.elements);
  const selectedId = useAdStore((s) => s.selectedId);
  const updateElement = useAdStore((s) => s.updateElement);
  const selectElement = useAdStore((s) => s.selectElement);

  const selected = elements.find((el) => el.id === selectedId) ?? null;

  const updateStyle = (key: keyof AdElementStyles, value: string | number) => {
    if (!selected) return;
    updateElement(selected.id, { styles: { ...selected.styles, [key]: value } });
  };

  const updateContent = (value: string) => {
    if (!selected) return;
    updateElement(selected.id, { content: value });
  };

  return (
    <aside className="w-72 bg-slate-900 border-l border-slate-700 flex flex-col overflow-hidden">
      <header className="px-4 py-3 border-b border-slate-700">
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
          Properties
        </h2>
      </header>

      {!selected ? (
        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm px-4 text-center">
          Click an element on the canvas to edit its properties.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Element info */}
          <div>
            <label className="field-label">Element</label>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded font-mono">
                {selected.type}
              </span>
              <span className="text-xs text-slate-500 font-mono">{selected.id}</span>
            </div>
          </div>

          {/* Content (text / image src) */}
          {(selected.type === 'text' || selected.type === 'button') && (
            <Field label="Content">
              <textarea
                className="input resize-none h-20"
                value={selected.content}
                onChange={(e) => updateContent(e.target.value)}
              />
            </Field>
          )}

          {selected.type === 'image' && (
            <Field label="Image URL">
              <input
                className="input"
                value={selected.content}
                onChange={(e) => updateContent(e.target.value)}
              />
            </Field>
          )}

          {/* Typography */}
          <Field label="Font Size">
            <input
              className="input"
              value={selected.styles.fontSize}
              onChange={(e) => updateStyle('fontSize', e.target.value)}
            />
          </Field>

          <Field label="Font Weight">
            <select
              className="input"
              value={selected.styles.fontWeight ?? '400'}
              onChange={(e) => updateStyle('fontWeight', e.target.value)}
            >
              {['100', '200', '300', '400', '500', '600', '700', '800', '900', 'bold', 'normal'].map(
                (w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                )
              )}
            </select>
          </Field>

          {/* Colors */}
          <Field label="Text Color">
            <ColorInput
              value={selected.styles.color}
              onChange={(v) => updateStyle('color', v)}
            />
          </Field>

          <Field label="Background Color">
            <ColorInput
              value={selected.styles.backgroundColor}
              onChange={(v) => updateStyle('backgroundColor', v)}
            />
          </Field>

          {/* Shape */}
          <Field label="Border Radius">
            <input
              className="input"
              value={selected.styles.borderRadius}
              onChange={(e) => updateStyle('borderRadius', e.target.value)}
            />
          </Field>

          {/* Dimensions (read-only) */}
          <div>
            <label className="field-label">Dimensions (read-only)</label>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 font-mono bg-slate-800 rounded p-2">
              <span>W: {Math.round(selected.styles.width)}px</span>
              <span>H: {Math.round(selected.styles.height)}px</span>
              <span>X: {Math.round(selected.styles.left)}px</span>
              <span>Y: {Math.round(selected.styles.top)}px</span>
            </div>
          </div>

          <button
            className="w-full text-xs text-slate-400 hover:text-slate-200 mt-2 py-1"
            onClick={() => selectElement(null)}
          >
            Deselect
          </button>
        </div>
      )}

      {/* Element list */}
      <div className="border-t border-slate-700">
        <header className="px-4 py-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Layers
          </span>
          <span className="text-xs text-slate-600">{elements.length}</span>
        </header>
        <ul className="max-h-40 overflow-y-auto">
          {[...elements].reverse().map((el) => (
            <li
              key={el.id}
              className={`px-4 py-1.5 text-xs cursor-pointer flex items-center gap-2 hover:bg-slate-800 ${
                el.id === selectedId ? 'bg-slate-800 text-blue-400' : 'text-slate-400'
              }`}
              onClick={() => selectElement(el.id)}
            >
              <span className="w-16 shrink-0 font-mono text-slate-600">{el.type}</span>
              <span className="truncate">{el.content || el.id}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Try to extract a usable hex value from css color strings for the color picker
  const getHex = (cssColor: string): string => {
    const match = cssColor.match(/#[0-9a-fA-F]{3,8}/);
    return match ? match[0] : '#000000';
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent p-0"
        value={getHex(value)}
        onChange={(e) => onChange(e.target.value)}
      />
      <input
        className="input flex-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
