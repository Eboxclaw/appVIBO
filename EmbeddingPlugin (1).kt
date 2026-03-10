// EmbeddingPlugin.kt — ONNX Runtime + all-MiniLM-L6-v2
// Produces 384-float embeddings for notes and vault entries.
// CRITICAL: Copy APK assets → context.filesDir BEFORE loading ONNX model.
//           ONNX Runtime cannot read from compressed APK assets directly.
// Results forwarded to velesdb via Rust invoke() for vector storage.
// embed_text  → single string → 384 floats
// embed_batch → list of strings → list of 384-float arrays

package com.vibo.app

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.app.Activity
import android.util.Log
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileOutputStream
import java.nio.LongBuffer

@TauriPlugin(name = "EmbeddingPlugin")
class EmbeddingPlugin(private val activity: Activity) : Plugin(activity) {

    private val TAG = "EmbeddingPlugin"
    private val scope = CoroutineScope(Dispatchers.Default)

    private var ortEnv: OrtEnvironment? = null
    private var session: OrtSession? = null
    private var tokenizer: SimpleTokenizer? = null
    private var modelReady = false

    // ── Model loading ──────────────────────────────────────────────────────────
    // Called by OnboardingWizard on first launch.
    // Copies APK assets → filesDir, then loads ONNX session.

    @Command
    fun loadModel(invoke: Invoke) {
        scope.launch {
            try {
                ensureModelFiles()
                val modelFile = File(activity.filesDir, "models/all-MiniLM-L6-v2.onnx")
                val tokenizerFile = File(activity.filesDir, "models/tokenizer.json")

                ortEnv = OrtEnvironment.getEnvironment()
                val sessionOptions = OrtSession.SessionOptions().apply {
                    setIntraOpNumThreads(2) // conservative — don't starve UI thread
                    setOptimizationLevel(OrtSession.SessionOptions.OptLevel.BASIC_OPT)
                }
                session = ortEnv!!.createSession(modelFile.absolutePath, sessionOptions)
                tokenizer = SimpleTokenizer(tokenizerFile)
                modelReady = true

                Log.d(TAG, "ONNX model loaded successfully")
                invoke.resolve(JSObject().apply { put("ready", true) })
            } catch (e: Exception) {
                Log.e(TAG, "loadModel failed: ${e.message}")
                invoke.reject("Failed to load embedding model: ${e.message}")
            }
        }
    }

    // ── Single embedding ───────────────────────────────────────────────────────

    @Command
    fun embedText(invoke: Invoke) {
        if (!modelReady) { invoke.reject("model not loaded"); return }

        val args = invoke.parseArgs(EmbedTextArgs::class.java)
        scope.launch {
            try {
                val vector = embed(args.text)
                val jsArray = JSArray().apply { vector.forEach { put(it) } }
                invoke.resolve(JSObject().apply {
                    put("note_id", args.note_id)
                    put("vector", jsArray)
                    put("dims", vector.size)
                })
            } catch (e: Exception) {
                invoke.reject("embed failed: ${e.message}")
            }
        }
    }

    // ── Batch embedding ────────────────────────────────────────────────────────
    // Used for bulk vault indexing at first unlock.

    @Command
    fun embedBatch(invoke: Invoke) {
        if (!modelReady) { invoke.reject("model not loaded"); return }

        val args = invoke.parseArgs(EmbedBatchArgs::class.java)
        scope.launch {
            try {
                val results = JSArray()
                args.items.forEachIndexed { i, item ->
                    val vector = embed(item.text)
                    val jsVector = JSArray().apply { vector.forEach { put(it) } }
                    results.put(JSObject().apply {
                        put("note_id", item.note_id)
                        put("vector", jsVector)
                    })
                }
                invoke.resolve(JSObject().apply { put("results", results) })
            } catch (e: Exception) {
                invoke.reject("batch embed failed: ${e.message}")
            }
        }
    }

    // ── Core embedding logic ───────────────────────────────────────────────────

    private fun embed(text: String): FloatArray {
        val sess = session ?: throw IllegalStateException("session not loaded")
        val env = ortEnv ?: throw IllegalStateException("env not loaded")
        val tok = tokenizer ?: throw IllegalStateException("tokenizer not loaded")

        // Tokenize
        val encoded = tok.encode(text, maxLength = 128)
        val seqLen = encoded.inputIds.size.toLong()

        // Build ONNX input tensors
        val inputIdsTensor = OnnxTensor.createTensor(
            env,
            LongBuffer.wrap(encoded.inputIds.toLongArray()),
            longArrayOf(1, seqLen)
        )
        val attentionMaskTensor = OnnxTensor.createTensor(
            env,
            LongBuffer.wrap(encoded.attentionMask.toLongArray()),
            longArrayOf(1, seqLen)
        )
        val tokenTypeIdsTensor = OnnxTensor.createTensor(
            env,
            LongBuffer.wrap(LongArray(seqLen.toInt()) { 0L }),
            longArrayOf(1, seqLen)
        )

        val inputs = mapOf(
            "input_ids"      to inputIdsTensor,
            "attention_mask" to attentionMaskTensor,
            "token_type_ids" to tokenTypeIdsTensor,
        )

        val output = sess.run(inputs)

        // last_hidden_state shape: [1, seq_len, 384]
        // Mean-pool over sequence dimension → [384]
        @Suppress("UNCHECKED_CAST")
        val hidden = (output[0].value as Array<Array<FloatArray>>)[0]
        val dims = hidden[0].size
        val pooled = FloatArray(dims)
        hidden.forEach { token -> token.forEachIndexed { d, v -> pooled[d] += v } }
        val scale = hidden.size.toFloat()
        pooled.forEachIndexed { i, v -> pooled[i] = v / scale }

        // L2 normalise
        val norm = Math.sqrt(pooled.sumOf { (it * it).toDouble() }).toFloat()
        if (norm > 0f) pooled.forEachIndexed { i, v -> pooled[i] = v / norm }

        return pooled
    }

    // ── Asset copy: APK → filesDir ─────────────────────────────────────────────
    // ONNX Runtime cannot read from compressed APK assets.
    // Must copy to app's private filesDir before loading.

    private fun ensureModelFiles() {
        val modelDir = File(activity.filesDir, "models")
        modelDir.mkdirs()

        val files = listOf(
            "all-MiniLM-L6-v2.onnx",
            "tokenizer.json",
            "special_tokens_map.json",
        )

        files.forEach { filename ->
            val dest = File(modelDir, filename)
            if (!dest.exists()) {
                Log.d(TAG, "Copying asset $filename → filesDir")
                activity.assets.open("models/$filename").use { input ->
                    FileOutputStream(dest).use { output ->
                        input.copyTo(output)
                    }
                }
            }
        }
    }
}

// ── Simple tokenizer wrapper ───────────────────────────────────────────────────
// Wraps HuggingFace tokenizer.json. In production use tokenizers-android
// or a pre-built JNI wrapper. This stub shows the interface contract.

class SimpleTokenizer(private val tokenizerFile: File) {

    data class Encoding(
        val inputIds: List<Long>,
        val attentionMask: List<Long>,
    )

    // TODO: integrate tokenizers-android JNI library for full BPE tokenization.
    // Stub implementation for compilation — replace before shipping.
    fun encode(text: String, maxLength: Int = 128): Encoding {
        // Naive whitespace tokenization as placeholder
        // Real impl: load tokenizer.json vocab + BPE merge rules
        val words = text.lowercase().split(Regex("\\s+")).take(maxLength - 2)
        val ids = mutableListOf<Long>(101L) // [CLS]
        words.forEach { ids.add(it.hashCode().toLong().and(0xFFFF).plus(1000)) }
        ids.add(102L) // [SEP]
        val mask = LongArray(ids.size) { 1L }.toList()
        return Encoding(ids, mask)
    }
}

// ── Argument data classes ──────────────────────────────────────────────────────

data class EmbedTextArgs(val note_id: String, val text: String)
data class EmbedItem(val note_id: String, val text: String)
data class EmbedBatchArgs(val items: List<EmbedItem>)
