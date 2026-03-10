// AgentForegroundService.kt — Keeps long agent tasks alive on Android
// Only started for tasks expected to take > 15 seconds.
// Uses FOREGROUND_SERVICE_DATA_SYNC type (API 34+).
// START_STICKY so OS restarts it if killed — Koog checkpointing handles resume.
// Explicit ACTION_STOP intent kills it cleanly when agent completes.

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

class AgentForegroundService : Service() {

    companion object {
        const val ACTION_STOP = "com.vibo.app.STOP_AGENT_SERVICE"
        private const val CHANNEL_ID = "vibo_agent_channel"
        private const val NOTIFICATION_ID = 1001
        private const val TAG = "AgentForegroundService"
    }

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

        // START_STICKY: if OS kills us, restart with last intent
        // Koog checkpointing means the agent resumes from last saved state
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "AgentForegroundService destroyed")
    }

    // ── Notification ───────────────────────────────────────────────────────────

    private fun buildNotification(agentType: String, task: String): Notification {
        // Stop intent — tapping the notification action kills the service
        val stopIntent = PendingIntent.getService(
            this,
            0,
            Intent(this, AgentForegroundService::class.java).apply {
                action = ACTION_STOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Tap notification → open app
        val openIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("ViBo $agentType")
            .setContentText(task.take(80))
            .setSmallIcon(android.R.drawable.ic_menu_info_details)
            .setPriority(NotificationCompat.PRIORITY_LOW) // non-intrusive
            .setOngoing(true)
            .setContentIntent(openIntent)
            .addAction(
                android.R.drawable.ic_menu_close_clear_cancel,
                "Stop",
                stopIntent
            )
            .build()
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "ViBo Agent Tasks",
            NotificationManager.IMPORTANCE_LOW // silent — no sound/vibrate
        ).apply {
            description = "Shows when ViBo agents are running background tasks"
            setShowBadge(false)
        }
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(channel)
    }
}
