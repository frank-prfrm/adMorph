### Phase 2 — LLM Provider Strategy
- Implement `LLMProvider` interface and three provider classes
- `OllamaProvider` uses `llava` (multimodal) — sends DOM + base64 screenshot, returns `RefinedAd` JSON
- Prompt the model to return only valid JSON matching the `RefinedAd` shape
- Factory reads settings and returns the correct provider
- `/api/refine-ad` route handler calls the factory and returns `RefinedAd` to client
- Wire real `window.postMessage` listener for the Chrome Extension payload

### Phase 3 — Settings & State Persistence
- **Settings Panel UI** with provider radio selector and conditional config fields per provider
- **Status indicator** (green/red/yellow pulsing dot) polling `healthCheck()` every 15s
- `useSettings` hook with `useEffect` wired to sync to Supabase when enabled
- Supabase fields in the panel (disabled/locked until auth is implemented)

### Phase 4 — Canvas & Editor
- `AdStage` component renders `AdElement[]` using absolute `%`-based positioning
- Click-to-select layers with selection highlight
- Selected element inspector panel (shows JSON)
- Undo/redo via `useReducer`

### Phase 5 — Mutation API
- Sidebar textarea for natural language instructions
- `POST /api/mutate-ad` sends `{ instruction, current: RefinedAd }` → returns new `RefinedAd`
- Canvas updates; version increments
- Mutation history log

---

## Notes
- Ollama default: `http://localhost:11434`
- For GPU offload on 4070 Ti Super: start Ollama with `OLLAMA_GPU_LAYERS=999`
- All providers must strip markdown code fences from LLM responses before JSON parsing
- Low temperature (0.1) for `refineAd`, slightly higher (0.3) for `mutateAd`