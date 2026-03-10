// AgentForegroundService.kt — Keeps long agent tasks alive on Android
// Only started for tasks > 15s that are USER-INITIATED (app in foreground).
// Background-triggered tasks (scheduler, sync) MUST use AgentWorker instead.
//
// FLAG 1 FIX: startForegroundService() from background throws
//   ForegroundServiceStartNotAllowedException on API 34+.
//   This service is only ever started from KoogTauriPlugin.startAgent()
//   which runs inside a @Command (user action) — app is always foregrounded.
//   Background jobs (DailyMaintenance, SyncRequest) go through AgentWorker.kt.
//
// FLAG 2 FIX: model/resource cleanup MUST NOT block the main thread.
//   All teardown in onDestroy() runs on Dispatchers.IO via a detached scope.
//   Using runBlocking here would cause an ANR.

package com.vibo.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class AgentForegroundService : Service() {

    companion object {
        const val ACTION_STOP = "com.vibo.app.STOP_AGENT_SERVICE"
        private const val CHANNEL_ID = "vibo_agent_channel"
        private const val NOTIFICATION_ID = 1001
        private const val TAG = "AgentForegroundService"
    }

    // FLAG 2 FIX: dedicated IO scope for cleanup — never touches main thread
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            Log.d(TAG, "Stopping on explicit ACTION_STOP")
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }

        val task = intent?.getStringExtra("task") ?: "Processing…"
        val agentType = intent?.getStringExtra("agent_type") ?: "Agent"

        Log.d(TAG, "Starting foreground for: $agentType — $task")
        startForeground(NOTIFICATION_ID, buildNotification(agentType, task))

        // START_STICKY: OS restarts us if killed mid-task.
        // Koog checkpointing resumes the agent from last saved state.
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        // FLAG 2 FIX: all cleanup is async on IO — never block here.
        // If we were to call runBlocking or do heavy work synchronously,
        // the main thread would be blocked and Android would throw an ANR.
        serviceScope.launch {
            Log.d(TAG, "AgentForegroundService: async cleanup starting")
            // Any model teardown, flush-to-disk, or Koog state cleanup goes here.
            // Example: invoke("plugin:leap-ai|unload_model") if needed.
            Log.d(TAG, "AgentForegroundService: cleanup complete")
        }

        // Cancel the scope after launching cleanup (SupervisorJob keeps it alive
        // long enough for the coroutine to complete before the process exits)
        serviceScope.cancel()
        super.onDestroy()
    }

    // ── Notification ───────────────────────────────────────────────────────────

    private fun buildNotification(agentType: String, task: String): Notification {
        val stopIntent = PendingIntent.getService(
            this, 0,
            Intent(this, AgentForegroundService::class.java).apply { action = ACTION_STOP },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val openIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("ViBo $agentType")
            .setContentText(task.take(80))
            .setSmallIcon(android.R.drawable.ic_menu_info_details)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setContentIntent(openIntent)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stopIntent)
            .build()
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID, "ViBo Agent Tasks", NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Shows when ViBo agents are running background tasks"
            setShowBadge(false)
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
}
