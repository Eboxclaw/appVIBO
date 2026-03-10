// lfm.ts — Streaming event listeners for Leap AI token output
// Wraps Tauri's listen() for leap-ai:token / done / error events.
// Used by ChatAssistant.tsx and any component that renders streamed output.
// Koog's internal model calls do NOT use this — they go through
// LeapPromptExecutor.kt which handles its own event streaming in Kotlin.

import { listen, type UnlistenFn } from '@tauri-apps/api/event'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StreamCallbacks {
  onToken: (token: string) => void
  onDone: (fullText: string) => void
  onError: (error: string) => void
}

export interface DownloadProgressPayload {
  model_id: string
  bytes_downloaded: number
  bytes_total: number
  percent: number
  done: boolean
}

// ── Chat streaming ─────────────────────────────────────────────────────────────
// Call before invoking plugin:leap-ai|generate with stream: true.
// Returns an unsubscribe function — call it when component unmounts.

export async function listenToStream(callbacks: StreamCallbacks): Promise<UnlistenFn> {
  const unlistenToken = await listen<string>('leap-ai:token', event => {
    callbacks.onToken(event.payload)
  })

  const unlistenDone = await listen<string>('leap-ai:done', event => {
    callbacks.onDone(event.payload)
    // Auto-cleanup token listener once done fires
    unlistenToken()
  })

  const unlistenError = await listen<string>('leap-ai:error', event => {
    callbacks.onError(event.payload)
    unlistenToken()
  })

  // Return a single cleanup fn that kills all three listeners
  return () => {
    unlistenToken()
    unlistenDone()
    unlistenError()
  }
}

// ── Provider streaming (cloud fallback) ───────────────────────────────────────
// providers.rs emits llm-delta / llm-done when routing cloud calls.
// Same pattern — returns single cleanup fn.

export async function listenToProviderStream(callbacks: StreamCallbacks): Promise<UnlistenFn> {
  const unlistenDelta = await listen<string>('llm-delta', event => {
    callbacks.onToken(event.payload)
  })

  const unlistenDone = await listen<string>('llm-done', event => {
    callbacks.onDone(event.payload)
    unlistenDelta()
  })

  return () => {
    unlistenDelta()
    unlistenDone()
  }
}

// ── Model download progress ────────────────────────────────────────────────────
// Used by OnboardingWizard.tsx when pulling LFM2-350M-Extract at first launch.

export async function listenToDownloadProgress(
  onProgress: (payload: DownloadProgressPayload) => void,
  onComplete: () => void,
): Promise<UnlistenFn> {
  const unlisten = await listen<DownloadProgressPayload>('leap-ai:download-progress', event => {
    onProgress(event.payload)
    if (event.payload.done) {
      onComplete()
    }
  })
  return unlisten
}

// ── Agent events ──────────────────────────────────────────────────────────────
// KoogTauriPlugin.kt emits these via the event bus.
// AgentsView.tsx subscribes to show live agent status.

export interface AgentEventPayload {
  agent: string
  task?: string
  result?: string
  error?: string
}

export async function listenToAgentEvents(handlers: {
  onStarted?: (payload: AgentEventPayload) => void
  onDone?: (payload: AgentEventPayload) => void
  onFailed?: (payload: AgentEventPayload) => void
}): Promise<UnlistenFn> {
  const unlistens: UnlistenFn[] = []

  if (handlers.onStarted) {
    unlistens.push(
      await listen<AgentEventPayload>('agent:started', e => handlers.onStarted!(e.payload))
    )
  }
  if (handlers.onDone) {
    unlistens.push(
      await listen<AgentEventPayload>('agent:done', e => handlers.onDone!(e.payload))
    )
  }
  if (handlers.onFailed) {
    unlistens.push(
      await listen<AgentEventPayload>('agent:failed', e => handlers.onFailed!(e.payload))
    )
  }

  return () => unlistens.forEach(u => u())
}

// ── Embed request completion ───────────────────────────────────────────────────
// EmbeddingPlugin.kt emits embed-complete after vectorising a note.
// sri.rs / storage.rs listen internally; TSX can optionally watch too.

export async function listenToEmbedComplete(
  onComplete: (noteId: string) => void,
): Promise<UnlistenFn> {
  return listen<{ note_id: string }>('embed-complete', event => {
    onComplete(event.payload.note_id)
  })
}

// ── Hook: useStream ───────────────────────────────────────────────────────────
// React hook that manages a streaming session with auto-cleanup on unmount.
// Import in ChatAssistant.tsx for clean lifecycle management.

import { useEffect, useRef, useState, useCallback } from 'react'
import { leap } from './leapClient'

export interface UseStreamOptions {
  conversationId?: string
  maxTokens?: number
  temperature?: number
}

export function useStream(opts: UseStreamOptions = {}) {
  const [output, setOutput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const unlistenRef = useRef<UnlistenFn | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => { unlistenRef.current?.() }
  }, [])

  const send = useCallback(async (prompt: string) => {
    // Kill previous stream if still running
    unlistenRef.current?.()

    setOutput('')
    setError(null)
    setStreaming(true)

    unlistenRef.current = await listenToStream({
      onToken: token => setOutput((prev: string) => prev + token),
      onDone: _full => setStreaming(false),
      onError: err => { setError(err); setStreaming(false) },
    })

    try {
      await leap.generateStream({
        prompt,
        max_tokens: opts.maxTokens ?? 1024,
        temperature: opts.temperature ?? 0.7,
        stream: true,
        conversation_id: opts.conversationId,
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setStreaming(false)
      unlistenRef.current?.()
    }
  }, [opts.conversationId, opts.maxTokens, opts.temperature])

  const stop = useCallback(() => {
    unlistenRef.current?.()
    setStreaming(false)
  }, [])

  return { output, streaming, error, send, stop }
}
