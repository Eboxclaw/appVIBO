// types.ts — Shared type definitions for ViBo
// All types mirror their Rust counterparts exactly.
// These are the shapes returned by invoke() calls.
// Never define business logic here — pure data contracts only.

// ── Notes ─────────────────────────────────────────────────────────────────────

export interface Note {
  id: string
  title: string
  path: string
  content: string
  frontmatter: Record<string, unknown>
  tags: string[]
  links: string[]
  backlinks: string[]
  created: string
  modified: string
  word_count: number
}

export interface NoteStub {
  id: string
  title: string
  path: string
  tags: string[]
  modified: string
  word_count: number
}

export interface SearchResult {
  stub: NoteStub
  excerpt: string
  score: number
}

export interface VaultStats {
  total_notes: number
  total_words: number
  total_tags: number
  total_links: number
}

// ── Vault (encrypted notes) ───────────────────────────────────────────────────

export interface VaultNote {
  id: string
  title: string
  content: string
  tags: string[]
  created: string
  modified: string
}

export interface VaultStatus {
  unlocked: boolean
  note_count: number
}

// ── Kanban ────────────────────────────────────────────────────────────────────

export type Priority = 'low' | 'medium' | 'high' | 'urgent'

export interface Subtask {
  id: string
  title: string
  done: boolean
}

export interface KanbanCard {
  id: string
  title: string
  description: string
  column: string
  board: string
  priority: Priority
  due_date: string | null
  tags: string[]
  subtasks: Subtask[]
  note_links: string[]
  calendar_event_id: string | null
  created: string
  modified: string
  path: string
}

export interface KanbanBoard {
  name: string
  columns: string[]
  path: string
  card_count: number
}

// ── Graph ─────────────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string
  title: string
  tag_count: number
  link_count: number
}

export interface GraphEdge {
  source: string
  target: string
  weight: number
}

// ── SRI ───────────────────────────────────────────────────────────────────────

export interface SriDecision {
  action: string
  tool: string | null
  confidence: number
  can_parallelize: boolean
  escalate_cloud: boolean
  matched_notes: string[]
  cached_response: string | null
}

// ── Providers ─────────────────────────────────────────────────────────────────

export type ProviderType = 'anthropic' | 'openrouter' | 'kimi' | 'ollama' | 'openai'

export interface Provider {
  name: string
  base_url: string
  provider_type: ProviderType
  has_key: boolean
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// ── Google ────────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  description: string | null
  location: string | null
}

export interface GmailMessage {
  id: string
  subject: string
  from: string
  snippet: string
  date: string
}

export interface DriveFile {
  id: string
  name: string
  mime_type: string
  modified: string
}

// ── OAuth ─────────────────────────────────────────────────────────────────────

export interface OAuthStatus {
  provider: string
  connected: boolean
  expires_at: number | null
  scope: string | null
}

// ── Agents ────────────────────────────────────────────────────────────────────

export type AgentType =
  | 'ResearchAgent'
  | 'TaggerAgent'
  | 'SummaryAgent'
  | 'EmbeddingAgent'
  | 'PlannerAgent'
  | 'DistillationAgent'

export type AgentStatus = 'idle' | 'running' | 'done' | 'failed'

export interface AgentTask {
  id: string
  agent: AgentType
  task: string
  status: AgentStatus
  result: string | null
  error: string | null
  started: string
  completed: string | null
  expected_duration_secs: number
}

// ── Distillations ─────────────────────────────────────────────────────────────

export type DistillationType = 'tag_cluster' | 'temporal' | 'semantic'

export interface Distillation {
  id: string
  distillation_type: DistillationType
  content_md: string
  source_ids: string[]
  created: string
}

// ── App state helpers ─────────────────────────────────────────────────────────

// NOTE: must be `type` not `interface` — union of string literals
export type AppRoute =
  | 'notebook'
  | 'kanban'
  | 'graph'
  | 'agents'
  | 'chat'
  | 'settings'
  | 'vault'
  | 'dashboard'

export interface ToastMessage {
  id: string
  type: 'info' | 'success' | 'error' | 'warning'
  title: string
  message?: string
  duration?: number
}
