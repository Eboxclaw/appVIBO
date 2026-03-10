plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "com.vibo.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.vibo.app"
        minSdk = 31          // hard floor — LFM inference requires API 31+
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        // ONNX Runtime needs this to include native .so libs
        ndk {
            abiFilters += listOf("arm64-v8a", "x86_64")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isMinifyEnabled = false
            applicationIdSuffix = ".debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    // APK assets — ONNX model files live here, copied to filesDir at runtime
    sourceSets {
        getByName("main") {
            assets.srcDirs("src/main/assets")
        }
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
            excludes += "META-INF/versions/9/previous-compilation-data.bin"
        }
        // Keep ONNX native libs uncompressed so they can be mmap'd
        jniLibs {
            useLegacyPackaging = false
        }
    }
}

dependencies {
    // ── Tauri Android runtime ─────────────────────────────────────────────────
    implementation("app.tauri:tauri-android:2.+")

    // ── Koog agent framework (JetBrains KMP) ──────────────────────────────────
    // Provides: AIAgent, AIAgentService, PromptExecutor, Tool, ToolDescriptor
    implementation("ai.koog:koog-agents:0.+")

    // ── ONNX Runtime (for all-MiniLM-L6-v2 embeddings) ───────────────────────
    implementation("com.microsoft.onnxruntime:onnxruntime-android:1.17.3")

    // ── Kotlin stdlib + coroutines ────────────────────────────────────────────
    implementation("org.jetbrains.kotlin:kotlin-stdlib:1.9.+")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.+")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.+")

    // ── AndroidX ──────────────────────────────────────────────────────────────
    implementation("androidx.core:core-ktx:1.12.+")
    implementation("androidx.appcompat:appcompat:1.6.+")
    implementation("androidx.biometric:biometric:1.2.+")

    // FLAG 1 FIX: WorkManager for background-triggered agent tasks.
    // Android 14+ forbids startForegroundService() from background.
    // AgentWorker.kt uses this for DailyMaintenance and SyncRequest jobs.
    implementation("androidx.work:work-runtime-ktx:2.9.+")

    // ── URL encoding helper (used in oauth.rs — Kotlin side not needed,       //
    //    but useful for any Kotlin-side URL building)                          //
    implementation("io.ktor:ktor-client-android:2.+")

    // ── Testing ───────────────────────────────────────────────────────────────
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
}

// NOTE: tauri-plugin-leap-ai self-registers on the Rust/Cargo side.
// Its Android bridge (Leap SDK KMP) is included transitively via the
// tauri-android dependency — no explicit dep needed here.
