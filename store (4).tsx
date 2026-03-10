// store.tsx — Zustand global state
// invoke() only — never localStorage, never sessionStorage.
// State is derived from Rust on mount, not persisted in the browser.
// Vault unlock delegates to crypto.ts — no duplicate biometric logic here.

import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { vaultUnlockBiometric } from './crypto'
import type {
  Note,
  NoteStub,
  KanbanBoard,
  KanbanCard,
  VaultStatus,
  Provider,
  CalendarEvent,
  OAuthStatus,
  AgentTask,
  AgentType,
  AgentStatus,
  ToastMessage,
  AppRoute,
} from './types'

// ── Slice interfaces ──────────────────────────────────────────────────────────

interface AuthSlice {
  vaultStatus: VaultStatus | null
  authChecked: boolean
  checkVaultStatus: () => Promise<void>
  unlockWithPin: (pin: string) => Promise<boolean>
  unlockWithBiometric: () => Promise<boolean>
  lock: () => Promise<void>
}

interface NotesSlice {
  notes: NoteStub[]
  activeNote: Note | null
  notesLoading: boolean
  searchResults: NoteStub[]
  loadNotes: (folder?: string) => Promise<void>
  openNote: (filename: string) => Promise<void>
  closeNote: () => void
  createNote: (title: string, content?: string, tags?: string[], folder?: string) => Promise<Note>
  saveNote: (filename: string, content: string) => Promise<void>
  deleteNote: (filename: string) => Promise<void>
  searchNotes: (query: string) => Promise<void>
}

interface KanbanSlice {
  boards: KanbanBoard[]
  activeBoard: string | null
  boardCards: KanbanCard[]
  kanbanLoading: boolean
  loadBoards: () => Promise<void>
  openBoard: (name: string) => Promise<void>
  createBoard: (name: string, columns?: string[]) => Promise<void>
  createCard: (board: string, title: string, column: string, description?: string) => Promise<KanbanCard>
  moveCard: (board: string, cardId: string, column: string) => Promise<void>
  deleteCard: (board: string, cardId: string) => Promise<void>
}

interface ProvidersSlice {
  providers: Provider[]
  loadProviders: () => Promise<void>
  saveProvider: (name: string, baseUrl: string, providerType: string, apiKey?: string) => Promise<void>
  deleteProvider: (name: string) => Promise<void>
}

interface GoogleSlice {
  googleStatus: OAuthStatus | null
  calendarEvents: CalendarEvent[]
  checkGoogleStatus: () => Promise<void>
  connectGoogle: () => Promise<void>
  disconnectGoogle: () => Promise<void>
  loadCalendarEvents: () => Promise<void>
}

interface AgentsSlice {
  agentTasks: AgentTask[]
  runningAgents: string[]
  dispatchAgent: (agent: AgentType, task: string, expectedDurationSecs?: number) => Promise<void>
  stopAgent: () => Promise<void>
}

interface UISlice {
  route: AppRoute
  sidebarOpen: boolean
  commandPaletteOpen: boolean
  toasts: ToastMessage[]
  navigate: (route: AppRoute) => void
  toggleSidebar: () => void
  openCommandPalette: () => void
  closeCommandPalette: () => void
  addToast: (toast: Omit<ToastMessage, 'id'>) => void
  removeToast: (id: string) => void
}

type Store =
  AuthSlice &
  NotesSlice &
  KanbanSlice &
  ProvidersSlice &
  GoogleSlice &
  AgentsSlice &
  UISlice

// ── Store ─────────────────────────────────────────────────────────────────────

export const useStore = create<Store>((set, get) => ({

  // ── Auth ───────────────────────────────────────────────────────────────────

  vaultStatus: null,
  authChecked: false,

  checkVaultStatus: async () => {
    try {
      const status = await invoke<VaultStatus>('vault_status')
      set({ vaultStatus: status, authChecked: true })
    } catch {
      set({ authChecked: true })
    }
  },

  unlockWithPin: async (pin: string) => {
    const ok = await invoke<boolean>('vault_unlock_pin', { pin })
    if (ok) {
      const status = await invoke<VaultStatus>('vault_status')
      set({ vaultStatus: status })
    }
    return ok
  },

  // Delegates to crypto.ts — single source of truth for biometric flow
  unlockWithBiometric: async () => {
    const ok = await vaultUnlockBiometric()
    if (ok) {
      const status = await invoke<VaultStatus>('vault_status')
      set({ vaultStatus: status })
    }
    return ok
  },

  lock: async () => {
    await invoke<void>('vault_lock')
    set({ vaultStatus: { unlocked: false, note_count: 0 } })
  },

  // ── Notes ──────────────────────────────────────────────────────────────────

  notes: [],
  activeNote: null,
  notesLoading: false,
  searchResults: [],

  loadNotes: async (folder?: string) => {
    set({ notesLoading: true })
    try {
      const notes = await invoke<NoteStub[]>('note_list', { folder: folder ?? null })
      set({ notes })
    } finally {
      set({ notesLoading: false })
    }
  },

  openNote: async (filename: string) => {
    const note = await invoke<Note>('note_read', { filename })
    set({ activeNote: note })
  },

  closeNote: () => set({ activeNote: null }),

  createNote: async (title: string, content?: string, tags?: string[], folder?: string) => {
    const note = await invoke<Note>('note_create', {
      title,
      content: content ?? null,
      tags: tags ?? null,
      folder: folder ?? null,
    })
    await get().loadNotes()
    return note
  },

  saveNote: async (filename: string, content: string) => {
    const updated = await invoke<Note>('note_write', { filename, content })
    set({ activeNote: updated })
  },

  deleteNote: async (filename: string) => {
    await invoke<void>('note_delete', { filename })
    const id = filename.replace(/\.md$/, '')
    set(s => ({ notes: s.notes.filter(n => n.id !== id) }))
    if (get().activeNote?.id === id) set({ activeNote: null })
  },

  searchNotes: async (query: string) => {
    if (!query.trim()) { set({ searchResults: [] }); return }
    const results = await invoke<Array<{ stub: NoteStub }>>('note_search', { query, limit: 20 })
    set({ searchResults: results.map(r => r.stub) })
  },

  // ── Kanban ─────────────────────────────────────────────────────────────────

  boards: [],
  activeBoard: null,
  boardCards: [],
  kanbanLoading: false,

  loadBoards: async () => {
    set({ kanbanLoading: true })
    try {
      const boards = await invoke<KanbanBoard[]>('kanban_board_list')
      set({ boards })
    } finally {
      set({ kanbanLoading: false })
    }
  },

  openBoard: async (name: string) => {
    set({ activeBoard: name, kanbanLoading: true })
    try {
      const cards = await invoke<KanbanCard[]>('kanban_board_get', { name })
      set({ boardCards: cards })
    } finally {
      set({ kanbanLoading: false })
    }
  },

  createBoard: async (name: string, columns?: string[]) => {
    await invoke<void>('kanban_board_create', { name, columns: columns ?? null })
    await get().loadBoards()
  },

  createCard: async (board: string, title: string, column: string, description?: string) => {
    const card = await invoke<KanbanCard>('kanban_card_create', {
      board, title, column,
      description: description ?? null,
      priority: null,
      due_date: null,
      tags: null,
      note_links: null,
    })
    set(s => ({ boardCards: [...s.boardCards, card] }))
    return card
  },

  moveCard: async (board: string, cardId: string, column: string) => {
    const updated = await invoke<KanbanCard>('kanban_card_move', {
      board, card_id: cardId, new_column: column,
    })
    set(s => ({ boardCards: s.boardCards.map(c => c.id === cardId ? updated : c) }))
  },

  deleteCard: async (board: string, cardId: string) => {
    await invoke<void>('kanban_card_delete', { board, card_id: cardId })
    set(s => ({ boardCards: s.boardCards.filter(c => c.id !== cardId) }))
  },

  // ── Providers ──────────────────────────────────────────────────────────────

  providers: [],

  loadProviders: async () => {
    const providers = await invoke<Provider[]>('providers_list')
    set({ providers })
  },

  saveProvider: async (name: string, baseUrl: string, providerType: string, apiKey?: string) => {
    await invoke<void>('providers_save', {
      name, base_url: baseUrl, provider_type: providerType,
      api_key: apiKey ?? null,
    })
    await get().loadProviders()
  },

  deleteProvider: async (name: string) => {
    await invoke<void>('providers_delete', { name })
    await get().loadProviders()
  },

  // ── Google ─────────────────────────────────────────────────────────────────

  googleStatus: null,
  calendarEvents: [],

  checkGoogleStatus: async () => {
    const status = await invoke<OAuthStatus>('oauth_status', { provider: 'google' })
    set({ googleStatus: status })
  },

  connectGoogle: async () => {
    const url = await invoke<string>('oauth_start', { provider: 'google' })
    // Opens in system browser; deep-link callback hits oauth::oauth_callback via AndroidManifest intent-filter
    await invoke('plugin:shell|open', { path: url })
  },

  disconnectGoogle: async () => {
    await invoke<void>('oauth_revoke', { provider: 'google' })
    set({ googleStatus: { provider: 'google', connected: false, expires_at: null, scope: null } })
  },

  loadCalendarEvents: async () => {
    const events = await invoke<CalendarEvent[]>('google_calendar_list')
    set({ calendarEvents: events })
  },

  // ── Agents ─────────────────────────────────────────────────────────────────

  agentTasks: [],
  runningAgents: [],

  dispatchAgent: async (agent: AgentType, task: string, expectedDurationSecs = 10) => {
    const id = crypto.randomUUID()
    const newTask: AgentTask = {
      id, agent, task,
      status: 'running',
      result: null,
      error: null,
      started: new Date().toISOString(),
      completed: null,
      expected_duration_secs: expectedDurationSecs,
    }
    set(s => ({
      agentTasks: [newTask, ...s.agentTasks],
      runningAgents: [...s.runningAgents, id],
    }))
    try {
      const res = await invoke<{ result: string }>('plugin:KoogPlugin|startAgent', {
        agentType: agent, task, expectedDurationSecs,
      })
      const doneStatus: AgentStatus = 'done'
      set(s => ({
        agentTasks: s.agentTasks.map(t =>
          t.id === id ? { ...t, status: doneStatus, result: res.result, completed: new Date().toISOString() } : t
        ),
        runningAgents: s.runningAgents.filter(r => r !== id),
      }))
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : String(e)
      const failedStatus: AgentStatus = 'failed'
      set(s => ({
        agentTasks: s.agentTasks.map(t =>
          t.id === id ? { ...t, status: failedStatus, error, completed: new Date().toISOString() } : t
        ),
        runningAgents: s.runningAgents.filter(r => r !== id),
      }))
    }
  },

  stopAgent: async () => {
    await invoke<void>('plugin:KoogPlugin|stopAgent')
    const failedStatus: AgentStatus = 'failed'
    set(s => ({
      runningAgents: [],
      agentTasks: s.agentTasks.map(t =>
        t.status === 'running'
          ? { ...t, status: failedStatus, error: 'stopped by user', completed: new Date().toISOString() }
          : t
      ),
    }))
  },

  // ── UI ─────────────────────────────────────────────────────────────────────

  route: 'dashboard' as AppRoute,
  sidebarOpen: true,
  commandPaletteOpen: false,
  toasts: [],

  navigate: (route: AppRoute) => set({ route }),
  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),

  addToast: (toast: Omit<ToastMessage, 'id'>) => {
    const id = crypto.randomUUID()
    set(s => ({ toasts: [...s.toasts, { ...toast, id }] }))
    setTimeout(() => get().removeToast(id), toast.duration ?? 4000)
  },

  removeToast: (id: string) =>
    set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}))
