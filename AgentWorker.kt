// AgentWorker.kt — WorkManager worker for background-triggered agent tasks
//
// FLAG 1 FIX: Android 14+ (API 34) throws ForegroundServiceStartNotAllowedException
// if you call startForegroundService() while the app is in the background.
// Background triggers (DailyMaintenance, SyncRequest, scheduled calendar checks)
// MUST use this WorkManager worker instead of AgentForegroundService directly.
//
// WorkManager guarantees:
//   - Survives device reboots (persisted to SQLite by WorkManager)
//   - Respects Android Doze mode and battery optimisation
//   - Can chain tasks (e.g. sync calendar → parse emails → create kanban cards)
//   - Safe to start from ANY app state (foreground, background, not running)
//
// AgentForegroundService is reserved for USER-INITIATED tasks > 15s where
// the app is guaranteed to be in the foreground.

package com.vibo.app

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.ExistingWorkPolicy

class AgentWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    companion object {
        private const val TAG = "AgentWorker"

        // Input data keys
        const val KEY_TASK_TYPE = "task_type"
        const val KEY_TASK_PAYLOAD = "task_payload"

        // Named work tags — prevents duplicate jobs for the same task type
        const val WORK_DAILY_MAINTENANCE = "vibo_daily_maintenance"
        const val WORK_GOOGLE_SYNC = "vibo_google_sync"

        /**
         * Enqueue a daily maintenance run (distillation, re-embed stale notes).
         * Uses KEEP policy — if already queued, don't duplicate.
         */
        fun enqueueDailyMaintenance(context: Context) {
            val request = OneTimeWorkRequestBuilder<AgentWorker>()
                .setInputData(workDataOf(
                    KEY_TASK_TYPE to "daily_maintenance",
                    KEY_TASK_PAYLOAD to "{}",
                ))
                .setConstraints(
                    Constraints.Builder()
                        .setRequiresBatteryNotLow(true)   // don't run on dying battery
                        .build()
                )
                .build()

            WorkManager.getInstance(context)
                .enqueueUniqueWork(WORK_DAILY_MAINTENANCE, ExistingWorkPolicy.KEEP, request)

            Log.d(TAG, "Enqueued daily maintenance work")
        }

        /**
         * Enqueue a Google calendar + Gmail sync.
         * Requires network. Uses REPLACE to always get fresh data.
         */
        fun enqueueGoogleSync(context: Context) {
            val request = OneTimeWorkRequestBuilder<AgentWorker>()
                .setInputData(workDataOf(
                    KEY_TASK_TYPE to "google_sync",
                    KEY_TASK_PAYLOAD to "{}",
                ))
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .build()

            WorkManager.getInstance(context)
                .enqueueUniqueWork(WORK_GOOGLE_SYNC, ExistingWorkPolicy.REPLACE, request)

            Log.d(TAG, "Enqueued Google sync work")
        }
    }

    // FLAG 2 FIX: CoroutineWorker.doWork() runs on Dispatchers.Default by default.
    // All heavy work is already off the main thread. Do NOT call runBlocking here.
    override suspend fun doWork(): Result {
        val taskType = inputData.getString(KEY_TASK_TYPE) ?: return Result.failure()
        val payload  = inputData.getString(KEY_TASK_PAYLOAD) ?: "{}"

        Log.d(TAG, "AgentWorker starting: $taskType")

        return try {
            when (taskType) {
                "daily_maintenance" -> runDailyMaintenance()
                "google_sync"       -> runGoogleSync()
                else -> {
                    Log.w(TAG, "Unknown task type: $taskType")
                    Result.failure()
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "AgentWorker failed: ${e.message}")
            // Result.retry() tells WorkManager to try again with backoff
            Result.retry()
        }
    }

    private suspend fun runDailyMaintenance(): Result {
        // Emit event to Rust scheduler — Rust fires DailyMaintenance event
        // which triggers the distillation pipeline via event_system.rs
        // This is safe from background: we're not starting a ForegroundService,
        // just emitting an event that Rust handles synchronously.
        Log.d(TAG, "Running daily maintenance via Rust event bus")
        // TODO: obtain AppHandle reference via a static holder set in MainActivity
        // AppHandleHolder.handle?.emit("daily-maintenance", null)
        return Result.success()
    }

    private suspend fun runGoogleSync(): Result {
        Log.d(TAG, "Running Google sync via Rust google.rs")
        // TODO: invoke google_calendar_list and google_gmail_list via Rust
        // Results are stored in SQLite — no ForegroundService needed
        return Result.success()
    }
}
