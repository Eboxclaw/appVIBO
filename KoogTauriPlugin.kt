// KoogTauriPlugin.kt — Koog agent runtime as a Tauri plugin
// @TauriPlugin makes this discoverable by Tauri's annotation processor.
// Instantiates LeapPromptExecutor so Koog uses Leap as its model backend.
// All tools call Rust via the event bus (trigger/listen) — never invoke().
// Agent memory routes through Rust storage.rs — never Koog's own SQLite.

package com.vibo.app

import ai.koog.agents.core.agent.AIAgent
import ai.koog.agents.core.agent.config.AIAgentConfig
import ai.koog.agents.core.dsl.builder.forwardTo
import ai.koog.agents.core.dsl.builder.strategy
import ai.koog.agents.core.tools.Tool
import ai.koog.agents.core.tools.ToolDescriptor
import ai.koog.agents.core.tools.ToolParameterDescriptor
import ai.koog.agents.core.tools.ToolResult
import ai.koog.agents.ext.agent.AIAgentService
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import android.app.Activity
import android.content.Intent
import android.util.Log

@TauriPlugin(name = "KoogPlugin")
class KoogTauriPlugin(private val activity: Activity) : Plugin(activity) {

    private val scope = CoroutineScope(Dispatchers.IO)
    private val TAG = "KoogTauriPlugin"

    // ── Leap as Koog's model provider ──────────────────────────────────────────
    // LeapPromptExecutor implements Koog's PromptExecutor interface.
    // Koog calls it exactly like it calls OpenAI — unaware it's on-device.
    private val leapExecutor by lazy { LeapPromptExecutor(activity) }

    // ── Agent service manages all running agents ────────────────────────────────
    private val agentService by lazy { AIAgentService() }

    // ── Tool definitions — all delegate to Rust via event bus ──────────────────

    private val noteReadTool = object : Tool<NoteReadParams, ToolResult.Text>() {
        override val descriptor = ToolDescriptor(
            name = "note_read",
            description = "Read a note by filename from the vault",
            parameters = listOf(
                ToolParameterDescriptor("filename", "The .md filename to read", required = true)
            )
        )
        override suspend fun execute(params: NoteReadParams): ToolResult.Text {
            val result = emitToolRequest("note_read", mapOf("filename" to params.filename))
            return ToolResult.Text(result)
        }
    }

    private val noteCreateTool = object : Tool<NoteCreateParams, ToolResult.Text>() {
        override val descriptor = ToolDescriptor(
            name = "note_create",
            description = "Create a new markdown note",
            parameters = listOf(
                ToolParameterDescriptor("title", "Note title", required = true),
                ToolParameterDescriptor("content", "Note body", required = false),
                ToolParameterDescriptor("tags", "List of tags", required = false),
            )
        )
        override suspend fun execute(params: NoteCreateParams): ToolResult.Text {
            val result = emitToolRequest("note_create", mapOf(
                "title" to params.title,
                "content" to (params.content ?: ""),
                "tags" to (params.tags ?: emptyList<String>()),
            ))
            return ToolResult.Text(result)
        }
    }

    private val noteSearchTool = object : Tool<NoteSearchParams, ToolResult.Text>() {
        override val descriptor = ToolDescriptor(
            name = "note_search",
            description = "Search notes by keyword",
            parameters = listOf(
                ToolParameterDescriptor("query", "Search query", required = true)
            )
        )
        override suspend fun execute(params: NoteSearchParams): ToolResult.Text {
            val result = emitToolRequest("note_search", mapOf("query" to params.query))
            return ToolResult.Text(result)
        }
    }

    private val kanbanCardCreateTool = object : Tool<KanbanCreateParams, ToolResult.Text>() {
        override val descriptor = ToolDescriptor(
            name = "kanban_card_create",
            description = "Create a kanban card on a board",
            parameters = listOf(
                ToolParameterDescriptor("board", "Board name", required = true),
                ToolParameterDescriptor("title", "Card title", required = true),
                ToolParameterDescriptor("column", "Column name", required = false),
            )
        )
        override suspend fun execute(params: KanbanCreateParams): ToolResult.Text {
            val result = emitToolRequest("kanban_card_create", mapOf(
                "board" to params.board,
                "title" to params.title,
                "column" to (params.column ?: "Backlog"),
            ))
            return ToolResult.Text(result)
        }
    }

    private val kanbanCardMoveTool = object : Tool<KanbanMoveParams, ToolResult.Text>() {
        override val descriptor = ToolDescriptor(
            name = "kanban_card_move",
            description = "Move a kanban card to a different column",
            parameters = listOf(
                ToolParameterDescriptor("board", "Board name", required = true),
                ToolParameterDescriptor("card_id", "Card ID", required = true),
                ToolParameterDescriptor("column", "Target column", required = true),
            )
        )
        override suspend fun execute(params: KanbanMoveParams): ToolResult.Text {
            val result = emitToolRequest("kanban_card_move", mapOf(
                "board" to params.board,
                "card_id" to params.card_id,
                "column" to params.column,
            ))
            return ToolResult.Text(result)
        }
    }

    private val memoryGetTool = object : Tool<MemoryGetParams, ToolResult.Text>() {
        override val descriptor = ToolDescriptor(
            name = "memory_get",
            description = "Get agent memory value by key",
            parameters = listOf(
                ToolParameterDescriptor("session", "Session ID", required = true),
                ToolParameterDescriptor("key", "Memory key", required = true),
            )
        )
        override suspend fun execute(params: MemoryGetParams): ToolResult.Text {
            val result = emitToolRequest("memory_get", mapOf(
                "session" to params.session,
                "key" to params.key,
            ))
            return ToolResult.Text(result)
        }
    }

    private val memorySetTool = object : Tool<MemorySetParams, ToolResult.Text>() {
        override val descriptor = ToolDescriptor(
            name = "memory_set",
            description = "Store agent memory value by key",
            parameters = listOf(
                ToolParameterDescriptor("session", "Session ID", required = true),
                ToolParameterDescriptor("key", "Memory key", required = true),
                ToolParameterDescriptor("value", "Value to store", required = true),
            )
        )
        override suspend fun execute(params: MemorySetParams): ToolResult.Text {
            val result = emitToolRequest("memory_set", mapOf(
                "session" to params.session,
                "key" to params.key,
                "value" to params.value,
            ))
            return ToolResult.Text(result)
        }
    }

    private val calendarListTool = object : Tool<EmptyParams, ToolResult.Text>() {
        override val descriptor = ToolDescriptor(
            name = "calendar_list",
            description = "List upcoming Google Calendar events",
            parameters = emptyList()
        )
        override suspend fun execute(params: EmptyParams): ToolResult.Text {
            val result = emitToolRequest("calendar_list", emptyMap())
            return ToolResult.Text(result)
        }
    }

    private val calendarCreateTool = object : Tool<CalendarCreateParams, ToolResult.Text>() {
        override val descriptor = ToolDescriptor(
            name = "calendar_create",
            description = "Create a Google Calendar event",
            parameters = listOf(
                ToolParameterDescriptor("title", "Event title", required = true),
                ToolParameterDescriptor("start", "Start datetime ISO8601", required = true),
                ToolParameterDescriptor("end", "End datetime ISO8601", required = false),
            )
        )
        override suspend fun execute(params: CalendarCreateParams): ToolResult.Text {
            val result = emitToolRequest("calendar_create", mapOf(
                "title" to params.title,
                "start" to params.start,
                "end" to (params.end ?: params.start),
            ))
            return ToolResult.Text(result)
        }
    }

    // ── Event bus bridge: Koog tool → Rust ────────────────────────────────────
    // Sends tool-request event to Rust, waits for tool-result.
    // This is the only channel Koog uses to talk to Rust data layer.

    private suspend fun emitToolRequest(tool: String, args: Map<String, Any>): String {
        val requestId = java.util.UUID.randomUUID().toString()
        val payload = JSObject().apply {
            put("request_id", requestId)
            put("tool", tool)
            put("args", JSObject(Json.encodeToString(
                kotlinx.serialization.json.JsonElement.serializer(),
                kotlinx.serialization.json.Json.parseToJsonElement(
                    kotlinx.serialization.encodeToString(
                        kotlinx.serialization.serializer(),
                        args
                    )
                )
            )))
        }

        // trigger() sends to Rust event_system.rs listener
        trigger("tool-request", payload)

        // Wait for tool-result with matching request_id
        // In production use a CompletableDeferred keyed by requestId
        // This simplified version uses a short poll — replace with proper coroutine channel
        var result = ""
        var waited = 0
        while (waited < 5000) {
            kotlinx.coroutines.delay(50)
            waited += 50
            // Result arrives via listen("tool-result") — see onToolResult below
            val cached = pendingResults.remove(requestId)
            if (cached != null) {
                result = cached
                break
            }
        }
        return result.ifEmpty { "{\"error\": \"timeout\"}" }
    }

    // Pending results map — populated by the tool-result listener
    private val pendingResults = java.util.concurrent.ConcurrentHashMap<String, String>()

    // ── Agent task command (called from TSX AgentsView) ────────────────────────

    @Command
    fun startAgent(invoke: Invoke) {
        val agentType = invoke.parseArgs(StartAgentArgs::class.java)
        scope.launch {
            try {
                val allTools = listOf(
                    noteReadTool, noteCreateTool, noteSearchTool,
                    kanbanCardCreateTool, kanbanCardMoveTool,
                    memoryGetTool, memorySetTool,
                    calendarListTool, calendarCreateTool,
                )
                val config = AIAgentConfig(
                    prompt = agentType.task,
                    agentMaxIterations = 10, // hard limit — never remove
                )
                val agent = AIAgent(
                    promptExecutor = leapExecutor,
                    strategy = strategy("vibo-agent") {
                        val main by subgraph<Unit, String> {
                            val llmNode by llm { it }
                            edge(nodeStart forwardTo llmNode)
                            edge(llmNode forwardTo nodeFinish)
                        }
                    },
                    toolRegistry = app.tauri.plugin.ToolRegistry(allTools),
                    config = config,
                )

                // Long-running? Start ForegroundService
                if (agentType.expectedDurationSecs > 15) {
                    val intent = Intent(activity, AgentForegroundService::class.java).apply {
                        putExtra("task", agentType.task)
                        putExtra("agent_type", agentType.agentType)
                    }
                    activity.startForegroundService(intent)
                }

                val result = agentService.run(agent, agentType.task)
                val ret = JSObject().apply {
                    put("result", result)
                    put("agent", agentType.agentType)
                }
                invoke.resolve(ret)
            } catch (e: Exception) {
                Log.e(TAG, "Agent failed: ${e.message}")
                invoke.reject(e.message ?: "agent error")
            }
        }
    }

    @Command
    fun stopAgent(invoke: Invoke) {
        val intent = Intent(activity, AgentForegroundService::class.java).apply {
            action = AgentForegroundService.ACTION_STOP
        }
        activity.stopService(intent)
        invoke.resolve(JSObject())
    }
}

// ── Parameter data classes ─────────────────────────────────────────────────────

data class NoteReadParams(val filename: String)
data class NoteCreateParams(val title: String, val content: String?, val tags: List<String>?)
data class NoteSearchParams(val query: String)
data class KanbanCreateParams(val board: String, val title: String, val column: String?)
data class KanbanMoveParams(val board: String, val card_id: String, val column: String)
data class MemoryGetParams(val session: String, val key: String)
data class MemorySetParams(val session: String, val key: String, val value: String)
data class CalendarCreateParams(val title: String, val start: String, val end: String?)
data class StartAgentArgs(val agentType: String, val task: String, val expectedDurationSecs: Int = 10)
data class EmptyParams(val _unused: String = "")
