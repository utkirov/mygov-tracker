package uz.turonproject.liveupdate

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import androidx.annotation.RequiresApi
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val CHANNEL_ID = "live-progress"

// Notification.EXTRA_REQUEST_PROMOTED_ONGOING — set as a raw extra so the code
// doesn't depend on the exact SDK stub that introduced the builder method.
private const val EXTRA_REQUEST_PROMOTED_ONGOING = "android.requestPromotedOngoing"

/**
 * Android 16 "Live Updates": an ongoing ProgressStyle notification that the
 * system can promote. Nothing OS 4 mirrors promoted progress notifications on
 * the Glyph lights (Glyph Progress), so this is how the app reaches Glyph from
 * the background. Older Android shows a normal notification with a bar.
 */
class LiveUpdateModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val manager: NotificationManager
    get() = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  override fun definition() = ModuleDefinition {
    Name("LiveUpdate")

    Function("isPromotionSupported") {
      Build.VERSION.SDK_INT >= 36
    }

    Function("show") { id: Int, title: String, text: String, progress: Int, max: Int, indeterminate: Boolean ->
      show(id, title, text, progress, max, indeterminate)
    }

    Function("end") { id: Int ->
      manager.cancel(id)
    }
  }

  private fun ensureChannel() {
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    // DEFAULT importance: promoted notifications must not be silent/minimised,
    // and the bar updates shouldn't buzz (setOnlyAlertOnce below).
    val channel = NotificationChannel(CHANNEL_ID, "Ход проверки и загрузки", NotificationManager.IMPORTANCE_DEFAULT)
    channel.setSound(null, null)
    channel.enableVibration(false)
    manager.createNotificationChannel(channel)
  }

  @SuppressLint("DiscouragedApi")
  private fun smallIcon(): Int {
    val res = context.resources
    val icon = res.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (icon != 0) icon else context.applicationInfo.icon
  }

  @SuppressLint("MissingPermission")
  private fun show(id: Int, title: String, text: String, progress: Int, max: Int, indeterminate: Boolean) {
    ensureChannel()
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
    val contentIntent = launch?.let {
      PendingIntent.getActivity(context, id, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val safeMax = if (max > 0) max else 100
    val safeProgress = progress.coerceIn(0, safeMax)

    val builder = Notification.Builder(context, CHANNEL_ID)
      .setSmallIcon(smallIcon())
      .setContentTitle(title)
      .setContentText(text)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setCategory(Notification.CATEGORY_PROGRESS)
    contentIntent?.let { builder.setContentIntent(it) }

    if (Build.VERSION.SDK_INT >= 36) {
      builder.setStyle(progressStyle(safeProgress, safeMax, indeterminate))
      builder.extras.putBoolean(EXTRA_REQUEST_PROMOTED_ONGOING, true)
    } else {
      builder.setProgress(safeMax, safeProgress, indeterminate)
    }
    manager.notify(id, builder.build())
  }

  @RequiresApi(36)
  private fun progressStyle(progress: Int, max: Int, indeterminate: Boolean): Notification.ProgressStyle {
    return Notification.ProgressStyle()
      .setProgressSegments(listOf(Notification.ProgressStyle.Segment(max)))
      .setProgress(progress)
      .setProgressIndeterminate(indeterminate)
  }
}
