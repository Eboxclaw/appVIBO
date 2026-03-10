// LeapPromptExecutor.kt — Leap as a native Koog model provider
// Implements Koog's PromptExecutor interface.
// Koog calls execute() / executeStreaming() here — unaware it's on-device.
// Wraps tauri-plugin-leap-ai invoke() calls internally.
// No event bus needed for model calls — this is all in-process Kotlin.

package com.vibo.app

import ai.koog.prompt.executor.clients.LLMClient
import ai.koog.prompt.executor.model.PromptExecutor
import ai.koog.prompt.executor.model.LLMMessage
import ai.koog.prompt.executor.model.LLMResponse
import ai.koog.prompt.executor.model.LLMStreamChunk
import android.app.Activity
import android.util.Log
import app.tauri.plugin.JSObject
import app.tauri.plugin.PluginManager
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class LeapPromptExecutor(private val activity: Activity) : PromptExecutor {

    private val TAG = "LeapPromptExecutor"

    // ── Single-shot completion ─────────────────────────────────────────────────
    // Koog calls this for tool-use turns and structured output.
    // Bridges to tauri-plugin-leap-ai generate command.

    override suspend fun execute(
        messages: List<LLMMessage>,
        model: String,
        temperature: Double?,
        maxTokens: Int?,
    ): LLMResponse = suspendCancellableCoroutine { cont ->

        val prompt = buildPrompt(messages)

        val args = JSObject().apply {
            put("prompt", prompt)
            put("max_tokens", maxTokens ?: 512)
            put("temperature", temperature ?: 0.7)
            put("stream", false)
        }

        try {
            // invoke plugin:leap-ai|generate synchronously
            // tauri-plugin-leap-ai handles the native llama.cpp bridge
            PluginManager.invoke("plugin:leap-ai|generate", args) { result ->
                if (result.isSuccess) {
                    val text = result.data?.getString("text") ?: ""
                    cont.resume(LLMResponse.Text(text))
                } else {
                    val err = result.error ?: "leap generate failed"
                    Log.e(TAG, "execute failed: $err")
                    cont.resumeWithException(RuntimeException(err))
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "execute exception: ${e.message}")
            cont.resumeWithException(e)
        }
    }

    // ── Streaming completion ───────────────────────────────────────────────────
    // Koog calls this for conversational turns where token-by-token is needed.
    // Listens to leap-ai:token events emitted by the Rust plugin.

    override fun executeStreaming(
        messages: List<LLMMessage>,
        model: String,
        temperature: Double?,
        maxTokens: Int?,
    ): Flow<LLMStreamChunk> = callbackFlow {

        val prompt = buildPrompt(messages)

        val args = JSObject().apply {
            put("prompt", prompt)
            put("max_tokens", maxTokens ?: 512)
            put("temperature", temperature ?: 0.7)
            put("stream", true)
        }

        // Listen for streaming tokens from tauri-plugin-leap-ai
        val tokenListener = PluginManager.listen("leap-ai:token") { event ->
            val token = event.data?.getString("token") ?: ""
            if (token.isNotEmpty()) {
                trySend(LLMStreamChunk.Token(token))
            }
        }

        val doneListener = PluginManager.listen("leap-ai:done") {
            trySend(LLMStreamChunk.Done)
            close()
        }

        val errorListener = PluginManager.listen("leap-ai:error") { event ->
            val err = event.data?.getString("error") ?: "streaming error"
            close(RuntimeException(err))
        }

        // Start generation
        PluginManager.invoke("plugin:leap-ai|generate", args) { result ->
            if (!result.isSuccess) {
                close(RuntimeException(result.error ?: "failed to start stream"))
            }
        }

        awaitClose {
            PluginManager.unlisten("leap-ai:token", tokenListener)
            PluginManager.unlisten("leap-ai:done", doneListener)
            PluginManager.unlisten("leap-ai:error", errorListener)
        }
    }

    // ── Prompt builder ─────────────────────────────────────────────────────────
    // Converts Koog's LLMMessage list into a single string prompt.
    // LFM2-350M-Extract uses ChatML format for tool use.

    private fun buildPrompt(messages: List<LLMMessage>): String {
        return buildString {
            messages.forEach { msg ->
                when (msg) {
                    is LLMMessage.System -> append("<|system|>\n${msg.content}\n")
                    is LLMMessage.User   -> append("<|user|>\n${msg.content}\n")
                    is LLMMessage.Assistant -> append("<|assistant|>\n${msg.content}\n")
                    else -> append(msg.content).append("\n")
                }
            }
            append("<|assistant|>\n")
        }
    }

    // ── Model info ─────────────────────────────────────────────────────────────

    override val defaultModel: String = "LFM2-350M-Extract"

    override fun supportsStreaming(): Boolean = true

    override fun supportsFunctionCalling(): Boolean = true
}
