# ViBo — Consolidated Architecture & Roadmap
_Version 5 — March 2026 — Source of truth_

---

## What This Document Is

A single reference covering exactly what has been built, how the pieces
connect, what still needs to happen, and every hard constraint that must
never be broken. When you bring in existing TSX files, use the frontend
integration section to understand what to change.

---

## Architecture in One Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  React TSX (Tauri WebView)                                  │
│  NoteEditor · Kanban · Graph · Agents · Chat · Settings     │
│                                                             │
│  src/lib/tauriClient.ts  — typed invoke() for all Rust cmds │
│  src/lib/leapClient.ts   — typed invoke() for Leap plugin   │
│  src/lib/lfm.ts          — listen() for streaming tokens    │
│  src/lib/crypto.ts       — vault invoke wrappers            │
│  src/lib/store.tsx       — Zustand, invoke() only           │
│  src/lib/types.ts        — mirrors Rust structs exactly     │
└──────────────────┬──────────────────────────────────────────┘
                   │ Tauri IPC (invoke / emit)
┌──────────────────▼──────────────────────────────────────────┐
│  Rust Core  src-tauri/src/                                  │
│                                                             │
│  main.rs         — plugin init, all command registration    │
│  notes.rs        — 21 commands, Obsidian MD CRUD            │
│  kanban.rs       — 16 commands, boards as .md files         │
│  vault.rs        — AES-256-GCM, Argon2id, biometric unlock  │
│  storage.rs      — SQLite: notes_index, kanban_index,       │
│                    routing_signals, semantic_cache,          │
│                    agent_memory, distillations               │
│  graph.rs        — wikilink edge index → velesdb            │
│  sri.rs          — Semantic Routing Intelligence            │
│  event_system.rs — Koog tool-request → Rust dispatcher      │
│  scheduler.rs    — Priority queue, Android Doze safe        │
│  providers.rs    — Anthropic/OpenRouter/Kimi/Ollama SSE     │
│  google.rs       — Calendar R/W, Gmail R, Drive R           │
│  oauth.rs        — OAuth2 tokens in encrypted SQLite        │
└──────┬───────────────────────────────────┬───────────────────┘
       │ Official Tauri plugins             │ Event bus (tools only)
       │                                   │ trigger('tool-request')
┌──────▼──────────────────┐   ┌────────────▼──────────────────┐
│  tauri-plugin-leap-ai   │   │  KoogTauriPlugin.kt           │
│  tauri-plugin-velesdb   │   │  LeapPromptExecutor.kt        │
│  tauri-plugin-sql       │   │  AgentForegroundService.kt    │
│  tauri-plugin-fs        │   │  AgentWorker.kt  ← NEW        │
│  tauri-plugin-http      │   │  EmbeddingPlugin.kt           │
│  tauri-plugin-biometric │   │  MainActivity.kt              │
└─────────────────────────┘   └───────────────────────────────┘
```

---

## Every File — What It Does

### Rust (`src-tauri/src/`)

| File | Commands | Notes |
|---|---|---|
| `main.rs` | — | Plugin init + all command registration |
| `notes.rs` | 21 | Obsidian-compatible MD CRUD, wikilinks, backlinks, frontmatter, daily notes, snapshots, search, tags, orphans |
| `kanban.rs` | 16 | board + task.md per card, columns, subtasks, calendar links, Obsidian Kanban format |
| `vault.rs` | 11 | AES-256-GCM, Argon2id, 15MB mobile / 64MB desktop `#[cfg]`, biometric unlock, key zeroed on lock |
| `storage.rs` | 12 | SQLite schema, SRI steps 1+2, agent memory, distillations |
| `graph.rs` | 4 | Wikilink edges in SQLite, feeds velesdb |
| `sri.rs` | 3 | Thin wrapper over storage_sri_route + velesdb embed store |
| `event_system.rs` | — | Tool dispatcher: routes Koog `tool-request` events to correct Rust module |
| `scheduler.rs` | — | Priority queue state (HIGH/MEDIUM/LOW/IDLE) |
| `providers.rs` | 8 | Anthropic + OpenRouter + Kimi + Ollama, SSE streaming, PII scrubber, keystore |
| `google.rs` | 8 | Calendar R/W, Gmail read, Drive read |
| `oauth.rs` | 5 | OAuth2 token storage, Google refresh, `get_valid_token()` public helper |

### Android Kotlin (`android/app/src/main/kotlin/com/vibo/app/`)

| File | Role |
|---|---|
| `MainActivity.kt` | extends TauriActivity, registers `KoogTauriPlugin` and `EmbeddingPlugin` |
| `KoogTauriPlugin.kt` | @TauriPlugin, `AIAgentService`, all tool definitions, event bus bridge, `startAgent`/`stopAgent` commands |
| `LeapPromptExecutor.kt` | implements `PromptExecutor`, wraps `plugin:leap-ai\|generate`, RAM check, `kv_cache_type = q4_0` |
| `AgentForegroundService.kt` | For user-initiated tasks > 15s only. Async cleanup on `Dispatchers.IO` |
| `AgentWorker.kt` | WorkManager worker for background-triggered tasks (DailyMaintenance, SyncRequest) |
| `EmbeddingPlugin.kt` | ONNX Runtime, all-MiniLM-L6-v2, copies APK assets → filesDir before load |

### Config

| File | Purpose |
|---|---|
| `.cargo/config.toml` | 16KB page alignment for all Android targets |
| `android/app/build.gradle.kts` | Koog, ONNX, WorkManager, Kotlin deps |
| `android/app/src/main/AndroidManifest.xml` | All permissions, ForegroundService, WorkManager provider |
| `src-tauri/Cargo.toml` | All Phase 1 Rust deps |
| `src-tauri/tauri.conf.json` | Android + iOS + Desktop targets |
| `src-tauri/capabilities/default.json` | Strict plugin permission scopes |

### Frontend (`src/`)

| File | Role |
|---|---|
| `lib/types.ts` | All shared types — mirrors Rust structs exactly |
| `lib/store.tsx` | Zustand state, invoke() only, no localStorage |
| `lib/tauriClient.ts` | Typed wrappers for every Rust command |
| `lib/leapClient.ts` | Typed wrappers for plugin:leap-ai commands |
| `lib/lfm.ts` | `listen()` wrappers for streaming, `useStream` hook |
| `lib/crypto.ts` | Vault invoke wrappers, `requireUnlocked()`, `keystoreSet/Get` |

---

## Communication Patterns — Exactly

```
TSX action          → invoke('command_name', args)        → Rust module
TSX chat UI         → invoke('plugin:leap-ai|generate')   → Leap plugin
Leap streaming      → listen('leap-ai:token')             → lfm.ts / useStream
Cloud streaming     → listen('llm-delta')                 → lfm.ts / listenToProviderStream

Koog → model        → LeapPromptExecutor.execute()         [in-process, no IPC]
Koog tool           → trigger('tool-request', payload)    → event_system.rs dispatcher
Rust → Koog result  → emit('tool-result', payload)        → KoogTauriPlugin listener

Background job      → AgentWorker (WorkManager)           → Rust event emit
User-init > 15s     → AgentForegroundService              → KoogTauriPlugin.startAgent
```

---

## Fixes Applied (Flags from Security Audit)

### ✅ Flag 1 — Android 14+ ForegroundService from background
**Problem:** `startForegroundService()` from background throws
`ForegroundServiceStartNotAllowedException` on API 34+.

**Fix:** Split execution path:
- `AgentForegroundService` → only for user-initiated tasks where app is
  guaranteed foregrounded (@Command handler = user action)
- `AgentWorker.kt` (WorkManager) → all background-triggered tasks:
  `DailyMaintenance`, `SyncRequest`, scheduled syncs
- `build.gradle.kts`: added `androidx.work:work-runtime-ktx`
- `AndroidManifest.xml`: added WorkManager provider declaration

### ✅ Flag 2 — ANR from synchronous model cleanup
**Problem:** Any blocking call in `onDestroy()` on the main thread
causes Android to throw an Application Not Responding error.

**Fix:** `AgentForegroundService.onDestroy()` now uses
`CoroutineScope(SupervisorJob() + Dispatchers.IO).launch { }` for all
teardown. `runBlocking` is never used anywhere in the codebase.

### ✅ Flag 3 — KV cache memory ballooning
**Problem:** LFM2-350M-Extract weights ≈ 350MB. Default f16 KV cache
at runtime can add another 300–400MB, silently killing the app on 3GB
devices before inference completes.

**Fix:** `LeapPromptExecutor.kt` passes `kv_cache_type = "q4_0"` in
every `generate` call (both single-shot and streaming). Also adds
`hasEnoughRam()` pre-flight check: requires 500MB free before loading.
If RAM is insufficient, escalates to cloud instead of OOMing.

### ✅ Flag 4 — DNS leaks with Tor (NON-ISSUE for ViBo)
**Reviewer concern:** SOCKS5 proxies don't intercept DNS.

**Why this doesn't apply:** ViBo uses the **Arti crate** (not a SOCKS5
proxy sidecar). Arti resolves hostnames natively through the Tor network
via `TorAddr` — the system resolver is never consulted. There is no DNS
leak. Phase 3 note: use `TorAddr::from_str()` not `SocketAddr`; never
resolve hostnames before passing them to Arti.

### ✅ Flag 5 — 16KB memory page alignment
**Problem:** Google mandates 16KB ELF alignment for API 35+ and Play
Store submissions. Rust NDK builds default to 4096-byte alignment.
Missing this = crash on Pixel 9+ and Play Store rejection.

**Fix:** `.cargo/config.toml` at repo root passes
`-Wl,-z,max-page-size=16384` for all three Android targets.
Zero architectural impact.

---

## Hard Constraints — Never Break

```
Android min SDK:          API 31
Android min RAM:          3GB+ (LFM inference)
Model format:             GGUF
Default agent model:      LFM2-350M-Extract (tool-use optimised)
KV cache type:            q4_0  ← NEVER f16 on Android
Page alignment:           16384 bytes (all Android targets)
ONNX files:               copy APK assets → context.filesDir before load
Argon2id params:          15MB mobile / 64MB desktop — #[cfg] enforced
ForegroundService:        user-initiated tasks > 15s ONLY
WorkManager:              all background-triggered tasks
Koog loop limit:          maxAgentIterations = 10
Agent memory:             event bus → storage.rs agent_memory (NOT Koog SQLite)
Vector storage:           tauri-plugin-velesdb ONLY (not sqlite-vec)
API keys:                 vault SQLite via providers.rs keystore — never SharedPrefs
All cloud HTTP:           through Rust providers.rs — never Kotlin directly
Tor:                      Arti crate in providers.rs Phase 3 — never SOCKS5 sidecar
Tool return payloads:     flat + minimal JSON — strip nested metadata before
                          returning to Koog (LLMs eat context fast)
```

---

## Frontend Integration Guide (When You Bring Existing TSX)

### What you can keep as-is
Any component that is purely presentational (styling, layout, animation)
needs zero changes. Bring it in as-is.

### What needs to change

**1. Data fetching**
Replace any `fetch()`, `axios`, `localStorage`, or `useState` seeded
from constants with `invoke()` calls via `tauriClient.ts`.

```ts
// ❌ Before
const [notes, setNotes] = useState(MOCK_NOTES)

// ✅ After
const { notes, loadNotes } = useStore()
useEffect(() => { loadNotes() }, [])
```

**2. Streaming chat**
Replace any mock streaming or `fetch()` SSE with `useStream` from `lfm.ts`.

```ts
// ✅ After
const { output, streaming, send } = useStream({ maxTokens: 1024 })
```

**3. Auth gates**
Your app must check `vaultStatus.unlocked` before rendering anything
sensitive. `App.tsx` should gate on `authChecked` and `unlocked`.

```ts
const { vaultStatus, authChecked, checkVaultStatus } = useStore()
useEffect(() => { checkVaultStatus() }, [])
if (!authChecked) return <SplashScreen />
if (!vaultStatus?.unlocked) return <LockScreen />
```

**4. Settings / API keys**
Replace any hardcoded keys or env vars with `keystoreGet`/`keystoreSet`
from `crypto.ts`. Never write a key to component state.

**5. Kanban DnD**
If you have a drag-and-drop Kanban, wire drop events to `moveCard()` in
the store, which calls `kanban_card_move` in Rust.

**6. File paths**
Never construct file paths in TSX. All path logic lives in Rust.
If a component needs a path, read it from the `Note` or `KanbanCard`
object returned by invoke().

### Checklist per component

- [ ] No raw `fetch()` or `axios` — replaced with `tauriClient.ts`
- [ ] No `localStorage`/`sessionStorage` — replaced with `invoke()`
- [ ] No hardcoded mock data
- [ ] No API keys or secrets in component code
- [ ] Streaming uses `useStream` from `lfm.ts`
- [ ] Vault-protected content checks `vaultStatus.unlocked`
- [ ] Error states handle Rust `Err(String)` from invoke()

---

## Phases

### Phase 1 — Android MVP (current)
Notes + Kanban + Vault + Biometric + Local LFM + SRI + Google
All Rust files ✅ | All Kotlin files ✅ | All lib/ TS files ✅
Frontend components: bring existing TSX → apply integration checklist

### Phase 2 — Agents end-to-end
- All Koog agents live (Research, Tagger, Summary, Planner)
- AIAgentService managing concurrent agents
- Agent memory → distillation pipeline active
- Koog checkpointing tested (kill app mid-task → confirm resume)
- Kanban ↔ Calendar sync via agent

### Phase 3 — Cloud + Privacy
- Arti crate in providers.rs (replace reqwest for cloud calls)
- `MultiLLMPromptExecutor`: Leap local → cloud fallback
- All provider API keys via vault SQLite
- Use `TorAddr::from_str()` — never resolve before passing to Arti

### Phase 4 — iOS + Desktop
- iOS: tauri-plugin-leap-ai has ios/ — verify + test
- Desktop: llama-cpp-2 feature flag on tauri-plugin-leap-ai
- BGTaskScheduler for iOS background (WorkManager equivalent)
- Ollama as desktop fallback

### Phase 5 — Knowledge & Training
- Distillation UI (distillations table → MD export)
- LFM2-350M-Extract → LFM2-1.2B-Extract upgrade in onboarding

### Phase 6 — Ecosystem
- MCP: public services → Koog MCP client directly
- Auth MCP services → local tool → event bus → Rust
- QLoRA skills marketplace

---

## Models

| Model | Size | Purpose | When |
|---|---|---|---|
| LFM2-350M-Extract | ~350MB | Agent tool use, structured output | Phase 1 — downloaded at onboarding |
| all-MiniLM-L6-v2 | 22MB | Embeddings, SRI | Phase 1 — bundled in APK assets/ |
| LFM2-1.2B-Extract | ~1.2GB | Better reasoning | Phase 5 upgrade |
| Anthropic / OpenRouter / Kimi | — | Cloud escalation | Phase 3 |

---

## Files NOT to Write

| File | Why |
|---|---|
| `model_manager.rs` | plugin manages lifecycle |
| `agent_runtime.rs` | Koog + AIAgentService is the runtime |
| `agents/*.rs` | agents are Kotlin/Koog only |
| `LeapPlugin.kt` (old) | tauri-plugin-leap-ai handles native bridge |
| `TauriIpc.kt` | replaced by event bus |
| Separate `NoteTool.kt`, `KanbanTool.kt` | merged into KoogTauriPlugin.kt |
| `training.rs` | Phase 5 |
| `core/crypto.rs`, `core/storage.rs` | were duplicates |
