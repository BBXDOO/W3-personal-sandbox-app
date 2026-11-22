package com.w3personalsandbox.app;

import android.app.Activity;
import android.content.Intent;
import android.content.ComponentName;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Base64;
import android.webkit.WebView;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Native-only authenticated loopback transport. API credentials never enter JavaScript. */
final class TerminalTransport {
    static final int PERMISSION_REQUEST = 1203;
    private static final String PERMISSION = "com.termux.permission.RUN_COMMAND";
    private final Activity activity;
    private final WebView webView;
    private final ExecutorService requests = Executors.newSingleThreadExecutor();
    private final String token;
    private volatile boolean disposed;
    private final AtomicBoolean preparing = new AtomicBoolean();

    TerminalTransport(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        android.content.SharedPreferences prefs = activity.getSharedPreferences("terminal", 0);
        String saved = prefs.getString("token", null);
        if (saved == null) {
            saved = UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", "");
            prefs.edit().putString("token", saved).apply();
        }
        token = saved;
    }

    String status() {
        JSONObject result = new JSONObject();
        try {
            result.put("installed", activity.getPackageManager().getLaunchIntentForPackage("com.termux") != null);
            result.put("permission", Build.VERSION.SDK_INT < 23 || activity.checkSelfPermission(PERMISSION) == PackageManager.PERMISSION_GRANTED);
            result.put("supportsRunCommand", supportsRunCommand());
        } catch (Exception ignored) { }
        return result.toString();
    }

    private boolean supportsRunCommand() {
        try {
            activity.getPackageManager().getServiceInfo(new ComponentName("com.termux", "com.termux.app.RunCommandService"), 0);
            activity.getPackageManager().getPermissionInfo(PERMISSION, 0);
            return true;
        } catch (PackageManager.NameNotFoundException unavailable) { return false; }
    }

    private String setupCommand() throws Exception {
        String source;
        String template;
        try (InputStream input = activity.getAssets().open("terminal/server.py")) {
            source = Base64.encodeToString(readBytes(input, 100000), Base64.DEFAULT);
        }
        try (InputStream input = activity.getAssets().open("terminal/bootstrap.py")) {
            template = new String(readBytes(input, 20000), StandardCharsets.UTF_8);
        }
        return "python - <<'W3_SANDBOX_SETUP'\n"
            + template.replace("__W3_TOKEN__", token).replace("__W3_SOURCE__", source)
            + "\nW3_SANDBOX_SETUP\n";
    }

    void copySetupAndOpenTermux() {
        activity.runOnUiThread(() -> {
            try {
                ClipData clip = ClipData.newPlainText("W3 Terminal setup", setupCommand());
                if (Build.VERSION.SDK_INT >= 33) {
                    android.os.PersistableBundle extras = new android.os.PersistableBundle();
                    extras.putBoolean(android.content.ClipDescription.EXTRA_IS_SENSITIVE, true);
                    clip.getDescription().setExtras(extras);
                }
                ((ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE)).setPrimaryClip(clip);
                notifySetup("คัดลอกแล้ว: วางคำสั่งใน Termux แล้วกด Enter จากนั้นกลับมากดเชื่อมต่อ คำสั่งมีรหัสเชื่อมต่อส่วนตัวของเครื่องนี้");
                openTermux();
            } catch (Exception error) {
                notifySetup("คัดลอกคำสั่งเริ่มบริการไม่สำเร็จ: " + error.getMessage());
            }
        });
    }

    void openTermux() {
        activity.runOnUiThread(() -> {
            Intent intent = activity.getPackageManager().getLaunchIntentForPackage("com.termux");
            if (intent == null) notifySetup("ไม่พบ Termux โปรดติดตั้งและเปิดแอป Termux ก่อน");
            else activity.startActivity(intent);
        });
    }

    void permissionDenied() {
        notifySetup("ยังไม่ได้รับสิทธิ์ Run commands in Termux โปรดอนุญาตในหน้าสิทธิ์เพิ่มเติมของแอป Sandbox แล้วกดเตรียม session อีกครั้ง");
    }

    void prepare() {
        activity.runOnUiThread(() -> {
            if (activity.getPackageManager().getLaunchIntentForPackage("com.termux") == null) {
                notifySetup("ไม่พบ Termux โปรดติดตั้งและเปิดแอป Termux ก่อน");
                return;
            }
            if (!supportsRunCommand()) {
                copySetupAndOpenTermux();
                return;
            }
            if (Build.VERSION.SDK_INT >= 23 && activity.checkSelfPermission(PERMISSION) != PackageManager.PERMISSION_GRANTED) {
                activity.requestPermissions(new String[]{PERMISSION}, PERMISSION_REQUEST);
                return;
            }
            if (preparing.compareAndSet(false, true)) requests.execute(this::startServer);
        });
    }

    private void startServer() {
        try {
            // Reopening the panel reuses the authenticated service and its running sessions.
            exchange("GET", "/health", "{}");
            preparing.set(false);
            notifyReady();
            return;
        } catch (Exception unavailable) { /* Start the packaged backend through Termux. */ }
        try {
            String script = setupCommand();
            Intent intent = new Intent("com.termux.RUN_COMMAND");
            intent.setClassName("com.termux", "com.termux.app.RunCommandService");
            intent.putExtra("com.termux.RUN_COMMAND_PATH", "/data/data/com.termux/files/usr/bin/bash");
            intent.putExtra("com.termux.RUN_COMMAND_ARGUMENTS", new String[]{"-s"});
            intent.putExtra("com.termux.RUN_COMMAND_STDIN", script);
            // A background command receives stdin through a pipe, without echoing
            // bootstrap credentials into a visible terminal transcript.
            intent.putExtra("com.termux.RUN_COMMAND_BACKGROUND", true);
            intent.putExtra("com.termux.RUN_COMMAND_COMMAND_LABEL", "W3 Sandbox Terminal");
            activity.runOnUiThread(() -> {
                try {
                    activity.startService(intent);
                    notifySetup("ส่งคำขอสร้าง session แล้ว รอครู่หนึ่งแล้วกดเชื่อมต่อ หากยังไม่พร้อม ให้ตรวจ allow-external-apps และ Python ใน Termux");
                    openTermux();
                    requests.execute(this::waitForServer);
                } catch (Exception error) {
                    preparing.set(false);
                    notifySetup("เริ่ม Termux ไม่สำเร็จ ตรวจสิทธิ์ Run commands in Termux และ allow-external-apps");
                }
            });
        } catch (Exception error) {
            preparing.set(false);
            notifySetup("เตรียมบริการ Terminal ไม่สำเร็จ: " + error.getMessage());
        }
    }

    private void waitForServer() {
        long deadline = System.currentTimeMillis() + 8000;
        try {
            while (!disposed && System.currentTimeMillis() < deadline) {
                try {
                    exchange("GET", "/health", "{}");
                    notifyReady();
                    return;
                } catch (Exception unavailable) { Thread.sleep(250); }
            }
            notifySetup("บริการยังไม่ตอบกลับ ตรวจ Python, allow-external-apps และสิทธิ์ Termux แล้วกดเตรียม session อีกครั้ง");
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        } finally { preparing.set(false); }
    }

    private void notifyReady() {
        JSONObject result = new JSONObject();
        try { result.put("message", "Termux พร้อมใช้งาน"); result.put("ready", true); }
        catch (Exception ignored) { }
        emit("w3-terminal-setup", result);
    }

    void request(String id, String method, String path, String body) {
        if (id.length() > 80 || body.length() > 131072) return;
        requests.execute(() -> {
            JSONObject result = new JSONObject();
            try {
                if (!("GET".equals(method) || "POST".equals(method))
                    || !path.matches("/(health|sessions|sessions/[a-f0-9]{32}/(input|resize|close|output(?:\\?offset=[0-9]+)?))"))
                    throw new IllegalArgumentException("Unsupported terminal request");
                result.put("body", exchange(method, path, body));
                result.put("ok", true);
            } catch (Exception error) {
                try { result.put("ok", false); result.put("error", error.getMessage()); }
                catch (Exception ignored) { }
            }
            try { result.put("id", id); } catch (Exception ignored) { }
            emit("w3-terminal-response", result);
        });
    }

    private JSONObject exchange(String method, String path, String body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL("http://127.0.0.1:8766" + path).openConnection();
        connection.setConnectTimeout(2000);
        connection.setReadTimeout(4000);
        connection.setInstanceFollowRedirects(false);
        connection.setRequestMethod(method);
        connection.setRequestProperty("Authorization", "Bearer " + token);
        try {
            if ("POST".equals(method)) {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                try (java.io.OutputStream out = connection.getOutputStream()) {
                    out.write(body.getBytes(StandardCharsets.UTF_8));
                }
            }
            int status = connection.getResponseCode();
            try (InputStream input = status >= 400 ? connection.getErrorStream() : connection.getInputStream()) {
                if (input == null) throw new IllegalStateException("Terminal HTTP " + status);
                JSONObject result = new JSONObject(new String(readBytes(input, 262144), StandardCharsets.UTF_8));
                if (status < 200 || status >= 300) throw new IllegalStateException(result.optString("error", "Terminal HTTP " + status));
                if ("/health".equals(path) && (!"w3-terminal".equals(result.optString("service")) || result.optInt("protocol") != 1))
                    throw new IllegalStateException("Incompatible terminal service");
                return result;
            }
        } finally { connection.disconnect(); }
    }

    private static byte[] readBytes(InputStream input, int limit) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = input.read(buffer)) != -1) {
            if (output.size() + count > limit) throw new IllegalStateException("Terminal response too large");
            output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }

    private void notifySetup(String message) {
        JSONObject result = new JSONObject();
        try { result.put("message", message); } catch (Exception ignored) { }
        emit("w3-terminal-setup", result);
    }

    private void emit(String event, JSONObject result) {
        String js = "window.dispatchEvent(new CustomEvent(" + JSONObject.quote(event) + ",{detail:" + result + "}));";
        activity.runOnUiThread(() -> { if (!disposed && !activity.isFinishing()) webView.evaluateJavascript(js, null); });
    }

    void dispose() { disposed = true; requests.shutdownNow(); }
}
