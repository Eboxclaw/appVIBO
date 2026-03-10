# ViBo — Final Architecture & Roadmap
_Version 4 — March 2026 — Source verified_

---

## The Core Insight That Defines Everything

Koog has a `PromptExecutor` abstract interface with `execute()` and
`executeStreaming()` methods. You can implement it with any backend.

This means:
- Write `LeapPromptExecutor : PromptExecutor`
- It wraps `tauri-plugin-leap-ai` calls internally
- Koog uses Leap as a native provider — same as OpenAI or Anthropic
- Leap and Koog are unified in one Kotlin plugin
- No event bus needed for model calls — it's all in-process Kotlin

The event bus is still needed for Koog tools → Rust (vault, kanban,
storage, google). But the model layer is now clean and native.

---

## What Is Definitively Confirmed

| Fact | Source |
|---|---|
| `tauri-plugin-leap-ai` is a real Rust crate on crates.io | docs.rs/crate/tauri-plugin-leap-ai/0.1.1 |
| It has android/ and ios/ folders, handles native bridges | docs.rs source tree |
| Desktop uses llama-cpp-2 as optional feature | Cargo.toml deps |
| Koog `PromptExecutor` is implementable with any backend | docs.koog.ai |
| Koog has built-in PII log redaction | brightcoding.dev audit |
| Koog has `AIAgentService` for multi-agent management | koog releases 0.5.0 |
| Koog has persistence + checkpointing (survives Android kill) | JetBrains blog |
| Koog supports Ollama natively (desktop fallback) | docs.koog.ai/llm-providers |
| Koog `maxAgentIterations` controls loop runaway | docs.koog.ai |
| LFM2-350M-Extract is optimized for tool use | liquid4all/cookbook |
| Koog Android target added in recent release | koog releases |

---

## Architecture — Final

```
┌──────────────────────────────────────────────────────────────┐
│  React TSX (Tauri WebView)                                   │
│  NoteEditor · Kanban · Graph · Agents · Chat · Settings      │
│                                                              │
│  invoke('note_create', ...)          ← notes/vault           │
│  invoke('plugin:leap-ai|generate')   ← direct chat UI only  │
│  listen('leap-ai:token', ...)        ← streaming UI tokens  │
│  invoke('sri_route', prompt)         ← SRI before agents    │
└─────────────────────┬────────────────────────────────────────┘
                      │ Tauri IPC
┌─────────────────────▼────────────────────────────────────────┐
│  Rust Core — security gatekeeper, data, routing              │
│                                                              │
│  notes.rs        kanban.rs       storage.rs                  │
│  vault.rs        graph.rs        sri.rs                      │
│  providers.rs    google.rs       oauth.rs                    │
│  event_system.rs scheduler.rs   main.rs                      │
└──────────┬──────────────────────────────┬────────────────────┘
           │ Official plugins              │ Event bus (tool calls only)
           │                              │ trigger('tool-request', ...)
┌──────────▼───────────────┐  ┌──────────▼──────────────────┐
│  tauri-plugin-leap-ai    │  │  KoogTauriPlugin.kt         │
│  (official Liquid AI)    │  │  @TauriPlugin               │
│                          │  │                             │
│  Exposes to Rust/TSX:    │  │  LeapPromptExecutor.kt      │
│  download_model          │  │  implements PromptExecutor  │
│  load_model              │  │  wraps tauri-plugin-leap-ai │
│  generate (streaming)    │  │  → Koog uses Leap natively  │
│  create_conversation     │  │                             │
│  unload_model            │  │  AIAgentService             │
│                          │  │  manages all running agents │
│  Mobile: Leap SDK KMP    │  │                             │
│  Desktop: llama-cpp-2    │  │  Agents (all use Leap via   │
│                          │  │  LeapPromptExecutor):       │
│  tauri-plugin-velesdb    │  │  · ResearchAgent            │
│  · vector store          │  │  · TaggerAgent              │
│  · knowledge graph       │  │  · SummaryAgent             │
│  · 70µs search           │  │  · EmbeddingAgent           │
│  · BM25 + vector hybrid  │  │  · PlannerAgent             │
│                          │  │                             │
│  tauri-plugin-biometric  │  │  Tools → event bus → Rust   │
│  tauri-plugin-sql        │  │  maxAgentIterations = 10    │
│  tauri-plugin-fs         │  │                             │
│  tauri-plugin-http       │  │  AgentForegroundService.kt  │
└──────────────────────────┘  │  (only for tasks >15s)      │
                              │                             │
                              │  Cloud fallback via Koog    │
                              │  MultiLLMPromptExecutor:    │
                              │  Leap local → Rust proxy    │
                              │  → Anthropic/OpenRouter/Kimi│
                              └─────────────────────────────┘
```

### Rules that never change
1. All network calls go through Rust — no exceptions, ever
2. API keys never in Kotlin or TSX — Rust keystore only
3. Leap called via `LeapPromptExecutor` inside Koog — unified model layer
4. Koog tools call Rust through event bus (trigger/listen) — not invoke()
5. Agent memory routes through Rust `storage.rs` — not Koog's own SQLite
6. Vectors live in velesdb — not sqlite-vec, not raw SQLite
7. Encrypted notes = vault.rs / Normal notes = notes.rs — never mixed
8. Model format = GGUF
9. Tor = Arti crate inside providers.rs — no binary sidecar (Phase 3)
10. ForegroundService = only tasks >15s
11. Koog loop limit = maxAgentIterations = 10

---

## Why This Is Better Than Every Previous Version

### Leap as Koog provider (not parallel)
Old: Koog and Leap sat side by side, both in Kotlin, unclear how they
connected. Now: `LeapPromptExecutor` implements Koog's `PromptExecutor`.
Koog calls it exactly like it calls OpenAI. Clean, typed, testable.

### Cloud escalation is native Koog
Koog's `MultiLLMPromptExecutor` supports fallbacks natively. When Leap
confidence is low or task too complex, Koog switches providers
automatically. The Rust `providers.rs` is still the HTTP layer — Koog
asks Rust for the cloud call, Rust routes via Tor, returns result.
This is the correct separation.

### PII scrubbing is already in Koog
Koog has pluggable log redaction. We still scrub in Rust before cloud
calls, but Koog's own logging is clean by default.

### AIAgentService replaces our custom orchestration
Manages multiple running agents with lifecycle control. No need to
build custom agent management.

### Checkpointing survives Android kills
Koog persistence checkpoints mid-task. If Android kills the process,
agent resumes from last checkpoint. ForegroundService is still needed
for tasks >15s but it's a backup, not the primary safety mechanism.

---

## Communication Patterns

```
TSX → Rust:                invoke('command_name', args)
TSX → Leap (chat UI):      invoke('plugin:leap-ai|generate', args)
Rust → TSX (stream):       app.emit('leap-ai:token', token)

Koog → Leap (agent model): LeapPromptExecutor.execute(prompt)
                           [direct Kotlin call, in-process, no IPC]

Koog tool → Rust:          trigger('tool-request', { tool, args })
Rust → Koog (tool result): emit('tool-result', { result })

Koog cloud escalation:     MultiLLMPromptExecutor
                           → trigger('cloud-request', { provider, messages })
                           → Rust providers.rs → Tor → cloud API
                           → emit('cloud-result', response)
```

---

## Models

| Model | Size | Purpose | When |
|---|---|---|---|
| LFM2-350M-Extract | ~350MB | Agent tool use, structured output | Phase 1 default |
| LFM2-1.2B-Extract | ~1.2GB | Better reasoning, upgrade path | Phase 2 |
| all-MiniLM-L6-v2 | 22MB | Embeddings, SRI | Phase 1, bundled in APK |
| Anthropic / OpenRouter / Kimi | — | Cloud escalation | Phase 3 |

---

## Complete File List — Fresh Repo

```
vibo/
│
├── package.json
├── tailwind.config.ts
├── vite.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── index.html
├── components.json
├── CODEX.md                         AI assistant guide (write fresh)
├── README.md
│
├── src/                             React TSX frontend
│   ├── main.tsx
│   ├── App.tsx                      route switching, auth gate
│   ├── App.css
│   ├── index.css
│   │
│   ├── lib/
│   │   ├── types.ts                 Note, Card, Agent, Provider types
│   │   ├── store.tsx                Zustand — invoke() only, no localStorage
│   │   ├── tauriClient.ts           typed invoke() wrappers for Rust commands
│   │   ├── leapClient.ts            typed wrappers for plugin:leap-ai commands
│   │   ├── lfm.ts                   listen() to leap-ai:token/done/error
│   │   ├── crypto.ts                invoke() wrappers for vault ops
│   │   ├── wiki-links.ts            pure MD parser, no changes needed
│   │   ├── models.ts                provider config types
│   │   └── utils.ts
│   │
│   ├── hooks/
│   │   ├── use-mobile.tsx
│   │   └── use-toast.ts
│   │
│   └── components/
│       ├── ui/                      shadcn — all as-is
│       ├── NoteEditor.tsx           MD editor + wikilinks
│       ├── NotebookView.tsx         note list + SRI search
│       ├── KanbanView.tsx           boards from .md files
│       ├── KnowledgeGraph.tsx       from velesdb graph data
│       ├── AgentsView.tsx           agent status + task queue
│       ├── ChatAssistant.tsx        streaming via leapClient.ts
│       ├── DashboardView.tsx
│       ├── LockScreen.tsx           biometric / passkey unlock
│       ├── OnboardingWizard.tsx     PIN + model download + ONNX unpack
│       ├── SettingsView.tsx         providers, Tor, accounts
│       ├── CommandPalette.tsx
│       ├── AppSidebar.tsx
│       ├── BottomNav.tsx
│       ├── NavLink.tsx
│       ├── NewNoteDialog.tsx
│       └── settings/
│           ├── CloudProvidersSection.tsx
│           └── LocalModelsSection.tsx
│
├── src-tauri/
│   ├── Cargo.toml
│   ├── build.rs                     minimal — no NDK needed
│   ├── tauri.conf.json              Android + iOS + desktop targets
│   ├── capabilities/
│   │   └── default.json
│   │
│   └── src/
│       ├── main.rs                  plugin init + command registration
│       │
│       ├── notes.rs                 MD CRUD, wikilinks, backlinks,
│       │                            frontmatter, daily notes, snapshots,
│       │                            search, tags, orphans
│       │                            22 commands — Obsidian compatible
│       │
│       ├── kanban.rs                boards as .md
│       │                            each card = task.md
│       │                            columns, move, subtasks, calendar links
│       │                            16 commands
│       │
│       ├── storage.rs               SQLite via tauri-plugin-sql:
│       │                            · notes_index
│       │                            · kanban_index
│       │                            · routing_signals
│       │                            · semantic_cache
│       │                            · agent_memory  ← Koog memory here
│       │                            · distillations
│       │                            vectors live in velesdb NOT here
│       │
│       ├── vault.rs                 AES-256-GCM encrypted notes
│       │                            Argon2id key derivation
│       │                            #[cfg(target_os="android")] → 15MB
│       │                            #[cfg(not(target_os="android"))] → 64MB
│       │                            biometric unlock via plugin
│       │
│       ├── graph.rs                 wikilink edge index → feeds velesdb
│       │
│       ├── sri.rs                   Semantic Routing Intelligence:
│       │                            1. routing_signals regex    ~1ms
│       │                            2. semantic_cache lookup    ~5ms
│       │                            3. velesdb vector search   ~70µs
│       │                            → SriDecision {
│       │                                action, confidence,
│       │                                can_parallelize,
│       │                                escalate_cloud
│       │                              }
│       │
│       ├── event_system.rs          Event enum + dispatcher:
│       │                            NoteCreated  → embed + tag jobs
│       │                            NoteEdited   → re-embed job
│       │                            KanbanMoved  → calendar check
│       │                            UserPrompt   → SRI → Koog
│       │                            DailyMaint.  → distillation run
│       │                            SyncRequest  → google sync
│       │
│       ├── scheduler.rs             Priority queue:
│       │                            HIGH / MEDIUM / LOW / IDLE
│       │                            enforces task time limits
│       │                            Android Doze safe
│       │
│       ├── providers.rs             Anthropic, OpenRouter, Kimi, Ollama
│       │                            streaming SSE
│       │                            PII scrubber before cloud calls
│       │                            Arti crate for Tor (Phase 3)
│       │                            API keys from vault SQLite
│       │                            Called by Koog via event bus for cloud
│       │
│       ├── google.rs                Calendar read/write
│       │                            Gmail read-only
│       │                            Drive read-only
│       │                            Direct API — no MCP
│       │
│       └── oauth.rs                 OAuth2 tokens in encrypted SQLite
│                                    refresh logic, scope management
│                                    Google (Phase 1)
│                                    Proton (Phase 4)
│                                    iCloud (Phase 4)
│
├── android/
│   └── app/src/main/
│       ├── AndroidManifest.xml      permissions:
│       │                            INTERNET
│       │                            FOREGROUND_SERVICE
│       │                            FOREGROUND_SERVICE_DATA_SYNC
│       │                            USE_BIOMETRIC
│       │                            USE_FINGERPRINT
│       │                            POST_NOTIFICATIONS
│       │
│       └── kotlin/com/vibo/app/
│           │
│           ├── MainActivity.kt      extends TauriActivity
│           │                        registers KoogTauriPlugin
│           │                        registers EmbeddingPlugin
│           │                        (leap/biometric/velesdb self-register
│           │                         via Rust Cargo side)
│           │
│           ├── KoogTauriPlugin.kt   @TauriPlugin
│           │                        · instantiates LeapPromptExecutor
│           │                        · instantiates AIAgentService
│           │                        · registers all Koog agents + tools
│           │                        · event bus bridge to Rust
│           │                        · starts/stops AgentForegroundService
│           │
│           ├── LeapPromptExecutor.kt implements PromptExecutor
│           │                        · wraps tauri-plugin-leap-ai invoke()
│           │                        · execute() → plugin:leap-ai|generate
│           │                        · executeStreaming() → LeapEvent stream
│           │                        · Koog uses Leap as native provider
│           │
│           ├── AgentForegroundService.kt
│           │                        Android Service for tasks >15s
│           │                        START_STICKY
│           │                        PRIORITY_LOW notification
│           │                        explicit STOP_SERVICE action
│           │
│           └── EmbeddingPlugin.kt   ONNX Runtime + all-MiniLM-L6-v2
│                                    · copy APK assets → context.filesDir
│                                      on first launch before loading
│                                    · embed_text → 384 floats
│                                    · embed_batch → bulk vault indexing
│                                    · result → velesdb via invoke()
│
├── android/app/build.gradle.kts
│   dependencies:
│     koog-agents (ai.koog:koog-agents)
│     onnxruntime-android:1.17.3
│     (leap: handled by tauri-plugin-leap-ai Rust side)
│
├── assets/
│   └── models/
│       ├── all-MiniLM-L6-v2.onnx   22MB — download HuggingFace before build
│       ├── tokenizer.json
│       └── special_tokens_map.json
│       NOTE: LFM2-350M-Extract.gguf downloaded at onboarding via plugin
│             not bundled in APK
│
└── docs/
    ├── CODEX.md                     AI assistant guide — rewrite fresh
    ├── ARCHITECTURE.md              this file
    ├── API.md                       all Tauri command signatures
    └── AGENTS.md                    agent types, tools, escalation rules
```

---

## Cargo.toml

```toml
[dependencies]
tauri                  = { version = "^2.10", features = ["protocol-asset"] }
tauri-plugin-leap-ai   = "0.1.1"
tauri-plugin-velesdb   = "*"
tauri-plugin-sql       = { features = ["sqlite"] }
tauri-plugin-fs        = "*"
tauri-plugin-http      = "*"
tauri-plugin-biometric = "*"
serde                  = { version = "^1.0", features = ["derive"] }
serde_json             = "^1.0"
tokio                  = { version = "^1", features = ["full"] }
aes-gcm                = "^0.10"
argon2                 = "^0.5"
reqwest                = { version = "^0.12", features = ["json", "stream"] }
# Phase 3 only — add when ready:
# arti-client           = "^0.23"
```

---

## Phase 1 — Android MVP (Full Focus)

**Deliverable: Notes + Kanban + Biometrics + Local LFM + SRI + Google**

```
STEP 1 — Scaffold
  tauri init (React/Vite)
  Cargo.toml with all Phase 1 deps
  tauri.conf.json — Android target, permissions
  capabilities/default.json
  android/app/build.gradle.kts — Koog + ONNX deps
  AndroidManifest.xml — all permissions

STEP 2 — Rust data layer
  notes.rs       full Obsidian-compatible MD CRUD
  kanban.rs      board + task.md per card
  storage.rs     SQLite index + agent_memory table
  vault.rs       AES-256-GCM + Argon2id, mobile/desktop params
  graph.rs       wikilink edges → velesdb

STEP 3 — Register in main.rs
  All note_* commands
  All kanban_* commands
  All storage_* commands
  All vault_* commands
  tauri_plugin_leap_ai::init()
  tauri_plugin_velesdb::init()
  tauri_plugin_biometric::init()
  tauri_plugin_sql::Builder::default().build()

STEP 4 — Frontend data layer
  types.ts
  tauriClient.ts     typed invoke() wrappers
  leapClient.ts      typed plugin:leap-ai wrappers
  store.tsx          Zustand, invoke() only
  lfm.ts             listen() to streaming events
  crypto.ts          vault invoke wrappers

STEP 5 — SRI + vectors
  sri.rs             3-step routing pipeline
  EmbeddingPlugin.kt ONNX + APK-to-filesDir unpack
  event_system.rs    NoteCreated → enqueue embed job
  scheduler.rs       priority queue active

STEP 6 — Android agent layer
  LeapPromptExecutor.kt   PromptExecutor wrapping leap plugin
  KoogTauriPlugin.kt      @TauriPlugin — AIAgentService + all tools
  AgentForegroundService.kt
  MainActivity.kt         register KoogTauriPlugin + EmbeddingPlugin
  Event bus wiring        trigger/listen registered in main.rs

STEP 7 — Onboarding (real calls, no mocks)
  OnboardingWizard.tsx:
    PIN setup       → invoke('vault_init', { pin })
    ONNX check      → EmbeddingPlugin filesDir check on load()
    LFM download    → invoke('plugin:leap-ai|download_model', { model })
    Google OAuth    → invoke('oauth_start', { provider: 'google' })

STEP 8 — Lock screen
  LockScreen.tsx → tauri-plugin-biometric
  vault.rs unlock on success
  App state gated behind auth

STEP 9 — Google integration
  google.rs       Calendar R/W + Gmail read + Drive read
  oauth.rs        encrypted token storage + refresh
  SettingsView    Google login flow end-to-end

STEP 10 — Build and test
  cargo check
  tauri android build
  Physical device: Android API 31+, 3GB+ RAM
  Test: note create → embed → SRI search → retrieve
  Test: agent task → ForegroundService → complete → stop
  Test: vault lock → biometric → unlock
  Test: Google calendar read via agent tool
```

---

## Phases 2–6

### Phase 2 — Agents end-to-end
- All Koog agents live (Research, Tagger, Summary, Planner)
- `AIAgentService` managing concurrent agents
- Agent memory persists → storage.rs → distillation pipeline
- Koog checkpointing tested (kill app mid-task, confirm resume)
- Kanban ↔ Calendar sync via agent

### Phase 3 — Cloud + Privacy
- Arti crate in providers.rs (replace reqwest direct)
- PII scrubber pipeline before all cloud calls in Rust
- `MultiLLMPromptExecutor` in Koog: Leap → cloud fallback
- All provider API keys via vault SQLite
- Proton Calendar + Mail OAuth (read-only)

### Phase 4 — iOS + Desktop
- iOS: tauri-plugin-leap-ai has ios/ folder — verify + test
- Desktop: tauri-plugin-leap-ai uses llama-cpp-2 feature flag
- iCloud Calendar read via OAuth
- BGTaskScheduler for iOS background (equivalent of ForegroundService)
- Ollama as desktop fallback if llama-cpp-2 not enabled

### Phase 5 — Knowledge & Training
- Knowledge distillation UI (distillations table → MD export)
- Unsloth fine-tuning pipeline
- LFM2-350M-Extract → LFM2-1.2B-Extract upgrade in onboarding

### Phase 6 — Ecosystem
- QLoRA / skills marketplace
- MCP integrations:
  - Public services (no auth) → Koog MCP client directly
  - Auth services → Local Tool → event bus → Rust
- Community plugin system

---

## Files NOT To Write

| File | Why |
|---|---|
| `LeapPlugin.kt` (old version) | tauri-plugin-leap-ai handles native bridge |
| `TauriIpc.kt` | replaced by event bus |
| `agent_runtime.rs` | Koog + AIAgentService is the runtime |
| `model_manager.rs` | plugin manages lifecycle |
| `agents/*.rs` (Rust) | agents are Kotlin/Koog |
| Separate `NoteTool.kt`, `KanbanTool.kt`, etc. | merged into KoogTauriPlugin.kt |
| `capabilities/kanban.rs`, `capabilities/vault.rs` | were duplicates |
| `core/crypto.rs`, `core/storage.rs` | were duplicates |
| `training.rs` | Phase 5, not now |

---

## Hard Constraints — Never Break

```
Android min SDK:          API 31
Android min RAM:          3GB+ (LFM inference)
LFM model format:         GGUF
Default agent model:      LFM2-350M-Extract (tool use optimized)
ONNX files:               copy APK assets → context.filesDir before ONNX loads
Argon2id params:          15MB mobile / 64MB desktop — #[cfg] enforced
ForegroundService:        only tasks >15s
Koog loop limit:          maxAgentIterations = 10
Koog memory:              event bus → storage.rs agent_memory table
                          NOT Koog's own SQLite
Leap model download:      via plugin invoke — not manual HTTP
All cloud HTTP calls:     through Rust providers.rs — never Kotlin directly
Vector storage:           tauri-plugin-velesdb — not sqlite-vec
Tor:                      Arti crate in providers.rs Phase 3 — never binary
```
