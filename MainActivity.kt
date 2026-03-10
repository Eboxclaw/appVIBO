// MainActivity.kt — Tauri Android entry point
// Extends TauriActivity. Registers Kotlin-side plugins.
// tauri-plugin-leap-ai, tauri-plugin-biometric, tauri-plugin-sql,
// tauri-plugin-fs, tauri-plugin-http all self-register via Rust/Cargo.
// We only manually register our two custom Kotlin plugins here.

package com.vibo.app

import android.os.Bundle
import app.tauri.plugin.TauriActivity

class MainActivity : TauriActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
    }

    // Tauri 2.x registers plugins via the plugin() call in Rust main.rs.
    // Custom Kotlin @TauriPlugin classes are registered by annotating them —
    // the annotation processor generates the glue. We reference them here
    // so the compiler includes them in the build.
    //
    // KoogTauriPlugin  → agent runtime, Leap executor, event bus bridge
    // EmbeddingPlugin  → ONNX MiniLM embeddings
    //
    // Both are discovered automatically by Tauri's plugin annotation processor
    // when the app Activity is initialised. No manual registration call needed
    // in Tauri 2.x — the @TauriPlugin annotation handles it.
}
