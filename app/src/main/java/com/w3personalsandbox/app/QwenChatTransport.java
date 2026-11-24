package com.w3personalsandbox.app;

import android.app.Activity;
import android.webkit.WebView;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class QwenChatTransport {
    private final Activity activity;
    private final WebView webView;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private QwenClient active;
    private String activeId;
    private volatile boolean disposed;
    QwenChatTransport(Activity activity, WebView webView) { this.activity = activity; this.webView = webView; }
    synchronized void send(String id, String body) {
        if (disposed || !id.matches("[a-f0-9-]{36}")) return;
        if (active != null) { emit(id, "error", "กำลังตอบข้อความก่อนหน้าอยู่"); return; }
        QwenClient client = new QwenClient(); active = client; activeId = id;
        worker.execute(() -> {
            client.run(body, (type, text) -> {
                if (type.equals("done") || type.equals("error")) clear(client);
                emit(id, type, text);
            });
            clear(client);
        });
    }
    private synchronized void clear(QwenClient client) { if (active == client) { active = null; activeId = null; } }
    synchronized void cancel(String id) {
        if (active != null && id.equals(activeId)) { QwenClient client = active; active = null; activeId = null; client.cancel(); }
    }
    private void emit(String id, String type, String text) {
        try {
            JSONObject event = new JSONObject().put("id", id).put("type", type).put("text", text);
            activity.runOnUiThread(() -> { if (!disposed && !activity.isFinishing()) webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('w3-qwen-chat',{detail:" + event + "}));", null); });
        } catch (Exception ignored) { }
    }
    synchronized void dispose() { disposed = true; if (active != null) active.cancel(); worker.shutdownNow(); }
}
