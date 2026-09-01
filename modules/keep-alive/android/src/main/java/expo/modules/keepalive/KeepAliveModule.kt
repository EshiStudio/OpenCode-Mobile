package expo.modules.keepalive

import android.content.Context
import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class KeepAliveModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KeepAlive")

    Function("start") { title: String, body: String ->
      send(KeepAliveService.ACTION_START, title, body)
    }

    Function("update") { title: String, body: String ->
      send(KeepAliveService.ACTION_UPDATE, title, body)
    }

    Function("stop") {
      send(KeepAliveService.ACTION_STOP, null, null)
    }
  }

  private fun send(action: String, title: String?, body: String?): Boolean {
    val context: Context = appContext.reactContext ?: return false
    val intent = Intent(context, KeepAliveService::class.java).apply {
      this.action = action
      title?.let { putExtra(KeepAliveService.EXTRA_TITLE, it) }
      body?.let { putExtra(KeepAliveService.EXTRA_BODY, it) }
    }
    return try {
      // Android 12+ refuses a background start outright, and the run this
      // service exists for is always begun from a foreground tap — so a
      // refusal here means the app is already backgrounded and the OS is
      // deciding the process's fate anyway. Reporting false lets the caller
      // fall back to the background-fetch watch rather than crash.
      if (action != KeepAliveService.ACTION_STOP && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      true
    } catch (e: Exception) {
      false
    }
  }
}
