package com.w3personalsandbox.app;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Fixed local model endpoint. Independent from the authenticated Terminal API. */
final class QwenClient {
    interface Listener { void event(String type, String text); }
    private final String base;
    private volatile HttpURLConnection connection;
    private volatile boolean cancelled;
    QwenClient() { this(8080); }
    QwenClient(int port) { base = "http://127.0.0.1:" + port; }
    void cancel() { cancelled = true; HttpURLConnection current = connection; if (current != null) current.disconnect(); }

    private HttpURLConnection post(String path, JSONObject body) throws Exception {
        if (cancelled) throw new IOException("Cancelled");
        HttpURLConnection current = (HttpURLConnection) new URL(base + path).openConnection();
        connection = current;
        current.setConnectTimeout(3000);
        current.setReadTimeout(180000);
        current.setInstanceFollowRedirects(false);
        current.setRequestMethod("POST");
        current.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        current.setDoOutput(true);
        if (cancelled) { current.disconnect(); throw new IOException("Cancelled"); }
        try (OutputStream out = current.getOutputStream()) { out.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
        return current;
    }

    static String limited(InputStream input) throws Exception {
        if (input == null) return "";
        try (InputStream source = input; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096]; int count;
            while ((count = source.read(buffer)) != -1) {
                if (out.size() + count > 262144) throw new IOException("คำตอบยาวเกินขีดจำกัด");
                out.write(buffer, 0, count);
            }
            return out.toString("UTF-8");
        }
    }

    private int tokens(JSONArray messages, boolean[] tokenizer) throws Exception {
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < messages.length(); i++) text.append(messages.getJSONObject(i).getString("content")).append('\n');
        if (tokenizer[0]) {
            HttpURLConnection current = post("/tokenize", new JSONObject().put("content", text.toString()).put("add_special", false));
            try {
                int status = current.getResponseCode();
                if (status == 200) return new JSONObject(limited(current.getInputStream())).getJSONArray("tokens").length() + messages.length() * 32;
                if (status != 404 && status != 405) throw new IOException("Qwen3 ยังไม่พร้อม โปรดรอโหลดโมเดลแล้วลองอีกครั้ง (HTTP " + status + ")");
                tokenizer[0] = false;
            } finally { current.disconnect(); }
        }
        // Qwen's byte-level tokenizer cannot require more tokens than UTF-8 bytes.
        return text.toString().getBytes(StandardCharsets.UTF_8).length + messages.length() * 32;
    }

    void run(String request, Listener listener) {
        try {
            if (request.length() > 24000) throw new IOException("ข้อความยาวเกินไป กรุณาแบ่งส่ง");
            JSONArray input = new JSONObject(request).getJSONArray("messages");
            if (input.length() < 2 || input.length() > 25 || input.length() % 2 != 0) throw new IOException("ประวัติสนทนาไม่ถูกต้อง");
            JSONArray messages = new JSONArray();
            for (int i = 0; i < input.length(); i++) {
                JSONObject item = input.getJSONObject(i);
                String role = item.getString("role"), content = item.getString("content");
                String expected = i == 0 ? "system" : i % 2 == 1 ? "user" : "assistant";
                if (!expected.equals(role) || content.length() > 8000) throw new IOException("ประวัติสนทนาไม่ถูกต้อง");
                messages.put(new JSONObject().put("role", role).put("content", content));
            }
            JSONObject last = messages.getJSONObject(messages.length() - 1);
            last.put("content", last.getString("content") + "\n/no_think");
            boolean[] tokenizer = {true}; boolean trimmed = false;
            while (tokens(messages, tokenizer) > 1400) {
                if (messages.length() <= 2) throw new IOException("ข้อความนี้ยาวเกินบริบทโมเดล กรุณาแบ่งส่งให้สั้นลง");
                messages.remove(1); messages.remove(1); trimmed = true;
            }
            if (trimmed) listener.event("context", "ใช้บริบทช่วงล่าสุดเพื่อให้พอดีกับโมเดล");
            JSONObject body = new JSONObject().put("messages", messages).put("stream", true).put("max_tokens", 512)
                .put("temperature", 0.7).put("top_p", 0.8).put("top_k", 20)
                .put("chat_template_kwargs", new JSONObject().put("enable_thinking", false));
            HttpURLConnection current = post("/v1/chat/completions", body);
            if (current.getResponseCode() != 200) {
                String detail = limited(current.getErrorStream());
                throw new IOException("Qwen3 ตอบกลับไม่สำเร็จ (HTTP " + current.getResponseCode() + ") " + detail.substring(0, Math.min(400, detail.length())));
            }
            if (current.getContentType() == null || !current.getContentType().toLowerCase(java.util.Locale.ROOT).contains("text/event-stream")) throw new IOException("บริการนี้ไม่ส่งคำตอบแบบแชตที่รองรับ");
            boolean finished = false; int total = 0;
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(current.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while (!cancelled && (line = reader.readLine()) != null) {
                    total += line.length();
                    if (total > 262144 || line.length() > 65536) throw new IOException("คำตอบยาวเกินขีดจำกัด");
                    if (!line.startsWith("data:")) continue;
                    String data = line.substring(5).trim();
                    if (data.equals("[DONE]")) { finished = true; break; }
                    JSONObject chunk = new JSONObject(data);
                    if (chunk.has("error")) throw new IOException("Qwen3 ไม่สามารถตอบข้อความนี้ได้");
                    JSONArray choices = chunk.optJSONArray("choices");
                    if (choices == null || choices.length() == 0) continue;
                    JSONObject choice = choices.getJSONObject(0);
                    JSONObject delta = choice.optJSONObject("delta");
                    if (delta != null && !delta.isNull("content")) {
                        String content = delta.optString("content", "");
                        if (!content.isEmpty()) listener.event("delta", content);
                    }
                    if (!choice.isNull("finish_reason")) {
                        finished = true;
                        if ("length".equals(choice.optString("finish_reason"))) listener.event("limit", "คำตอบถึงความยาวสูงสุดแล้ว");
                    }
                }
            }
            if (!cancelled && !finished) throw new IOException("การเชื่อมต่อขาดก่อนตอบจบ กรุณาลองอีกครั้ง");
            if (!cancelled) listener.event("done", "");
        } catch (java.net.ConnectException error) {
            if (!cancelled) listener.event("error", "ยังเชื่อมต่อ Qwen3 ไม่ได้ กรุณากดเปิด Qwen3 และรอโมเดลโหลดก่อน");
        } catch (java.net.SocketTimeoutException error) {
            if (!cancelled) listener.event("error", "Qwen3 ไม่ตอบกลับภายใน 3 นาที กรุณาลองใหม่");
        } catch (Exception error) {
            if (!cancelled) listener.event("error", error.getMessage() == null ? "เชื่อมต่อ Qwen3 ไม่สำเร็จ" : error.getMessage());
        } finally { HttpURLConnection current = connection; if (current != null) current.disconnect(); }
    }
}
