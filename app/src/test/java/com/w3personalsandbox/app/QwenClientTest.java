package com.w3personalsandbox.app;

import com.sun.net.httpserver.HttpServer;
import org.json.*;
import org.junit.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import static org.junit.Assert.*;

public class QwenClientTest {
    private HttpServer server;
    private QwenClient client;
    private List<String> events;
    private AtomicReference<JSONObject> sent;
    private boolean oldTokens;
    private boolean fallback;
    private boolean broken;
    private boolean reject;
    private String request(String... content) throws Exception {
        JSONArray messages = new JSONArray().put(new JSONObject().put("role", "system").put("content", "ตอบภาษาไทย"));
        for (int i = 0; i < content.length; i++) messages.put(new JSONObject().put("role", i % 2 == 0 ? "user" : "assistant").put("content", content[i]));
        return new JSONObject().put("messages", messages).toString();
    }
    @Before public void setup() throws Exception {
        events = new CopyOnWriteArrayList<>(); sent = new AtomicReference<>();
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/tokenize", exchange -> {
            try {
                JSONObject payload = new JSONObject(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                JSONArray tokens = new JSONArray();
                int count = oldTokens && payload.getString("content").contains("เก่า") ? 1500 : 10;
                for (int i = 0; i < count; i++) tokens.put(i);
                byte[] data = new JSONObject().put("tokens", tokens).toString().getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(fallback ? 404 : 200, data.length); exchange.getResponseBody().write(data);
            } catch (Exception failure) { throw new RuntimeException(failure); } finally { exchange.close(); }
        });
        server.createContext("/v1/chat/completions", exchange -> {
            try {
                sent.set(new JSONObject(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8)));
                if (reject) { exchange.sendResponseHeaders(503, 0); exchange.getResponseBody().write("loading".getBytes(StandardCharsets.UTF_8)); return; }
                exchange.getResponseHeaders().set("Content-Type", "text/event-stream; charset=utf-8");
                exchange.sendResponseHeaders(200, 0);
                String body = "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"hidden\"}}]}\n\n"
                    + "data: {\"choices\":[{\"delta\":{\"content\":\"สวัสดีครับ 🖥\"}}]}\n\n";
                if (!broken) body += "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n";
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                for (byte value : bytes) exchange.getResponseBody().write(value);
            } catch (Exception failure) { throw new RuntimeException(failure); } finally { exchange.close(); }
        });
        server.start(); client = new QwenClient(server.getAddress().getPort());
    }
    @After public void close() { client.cancel(); server.stop(0); }
    private void run(String body) { client.run(body, (type, text) -> events.add(type + ":" + text)); }
    @Test public void thaiStreamAndParameters() throws Exception {
        run(request("สวัสดี"));
        assertTrue(events.toString(), events.contains("delta:สวัสดีครับ 🖥"));
        assertTrue(events.contains("done:")); assertFalse(events.toString().contains("hidden"));
        assertEquals(512, sent.get().getInt("max_tokens")); assertTrue(sent.get().getBoolean("stream"));
        assertFalse(sent.get().getJSONObject("chat_template_kwargs").getBoolean("enable_thinking"));
        assertTrue(sent.get().getJSONArray("messages").getJSONObject(1).getString("content").endsWith("/no_think"));
    }
    @Test public void keepsNewestTurnAndTrimsCompletePairs() throws Exception {
        oldTokens = true; run(request("เก่า", "คำตอบเก่า", "คำถามใหม่"));
        assertTrue(events.toString().contains("context:"));
        JSONArray messages = sent.get().getJSONArray("messages"); assertEquals(2, messages.length());
        assertTrue(messages.getJSONObject(1).getString("content").startsWith("คำถามใหม่"));
    }
    @Test public void oversizedCurrentTurnDoesNotReachCompletion() throws Exception {
        oldTokens = true; run(request("ข้อความเก่าเกินบริบท"));
        assertNull(sent.get()); assertTrue(events.toString().contains("error:"));
    }
    @Test public void tokenizerFallbackSupportsOlderServer() throws Exception {
        fallback = true; run(request("สวัสดี")); assertTrue(events.contains("done:"));
    }
    @Test public void httpErrorDoesNotBecomeAssistantAnswer() throws Exception {
        reject = true; run(request("สวัสดี")); assertTrue(events.toString().contains("HTTP 503")); assertFalse(events.contains("done:"));
    }
    @Test public void interruptedStreamIsNotMarkedComplete() throws Exception {
        broken = true; run(request("สวัสดี")); assertTrue(events.toString().contains("delta:"));
        assertTrue(events.toString().contains("error:")); assertFalse(events.contains("done:"));
    }
    @Test public void cancellationStopsReadingAndSuppressesLateEvents() throws Exception {
        String body = request("สวัสดี");
        client.run(body, (type, text) -> { events.add(type); if (type.equals("delta")) client.cancel(); });
        assertTrue(events.contains("delta")); assertFalse(events.contains("done")); assertFalse(events.contains("error"));
    }
}
