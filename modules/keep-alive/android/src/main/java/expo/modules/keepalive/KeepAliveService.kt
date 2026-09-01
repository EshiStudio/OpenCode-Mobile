package expo.modules.keepalive

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat

/**
 * Keeps the app's process alive, and its CPU awake, while the agent is mid-run.
 *
 * Without this the phone is free to freeze the process the moment the screen
 * goes off: a local run's fetch never resumes, and a server run's event stream
 * is dropped, so the answer only surfaces whenever Android next feels like
 * granting a background fetch — which in Doze can be an hour or more. A
 * foreground service is the only thing Android promises to leave running, and
 * the price it charges is the visible notification, which doubles as the
 * progress line and as the way back into the conversation.
 */
class KeepAliveService : Service() {
  companion object {
    const val ACTION_START = "expo.modules.keepalive.START"
    const val ACTION_UPDATE = "expo.modules.keepalive.UPDATE"
    const val ACTION_STOP = "expo.modules.keepalive.STOP"
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"

    private const val CHANNEL_ID = "keep-alive"
    private const val NOTIFICATION_ID = 0x0C0DE

    // A run that has gone this long is a runaway, and holding the CPU past it
    // would be a battery bug rather than a feature. The service stays up; only
    // the wake lock lapses, which is what an idle-but-connected app looks like.
    private const val WAKE_LOCK_TIMEOUT_MS = 3L * 60L * 60L * 1000L
  }

  private var wakeLock: PowerManager.WakeLock? = null
  private var title: String = "OpenCode"

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      release()
      stopForegroundCompat()
      stopSelf()
      return START_NOT_STICKY
    }

    intent?.getStringExtra(EXTRA_TITLE)?.takeIf { it.isNotEmpty() }?.let { title = it }
    val body = intent?.getStringExtra(EXTRA_BODY).orEmpty()

    // Even an UPDATE has to go through startForeground: Android gives a service
    // started with startForegroundService only a few seconds to promote itself,
    // and an update that arrived first would otherwise let that window lapse.
    promote(body)
    acquire()
    // Restarting after the system kills us would bring back a notification with
    // no run behind it, so let the kill be final.
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    release()
    super.onDestroy()
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    // Swiping the app away is an explicit "I'm done" — outliving that would
    // leave an un-dismissable notification for a process nobody can return to.
    release()
    stopForegroundCompat()
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  private fun promote(body: String) {
    ensureChannel()

    val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    val pending = launch?.let {
      PendingIntent.getActivity(
        this,
        0,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setSmallIcon(android.R.drawable.stat_notify_sync)
      .setContentIntent(pending)
      .setOngoing(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Работа в фоне",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Показывается, пока агент отвечает с выключенным экраном."
      setShowBadge(false)
      enableVibration(false)
      setSound(null, null)
    }
    manager.createNotificationChannel(channel)
  }

  private fun acquire() {
    if (wakeLock?.isHeld == true) return
    val power = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "opencode:keep-alive").apply {
      setReferenceCounted(false)
      acquire(WAKE_LOCK_TIMEOUT_MS)
    }
  }

  private fun release() {
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
  }

  @Suppress("DEPRECATION")
  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      stopForeground(true)
    }
  }
}
