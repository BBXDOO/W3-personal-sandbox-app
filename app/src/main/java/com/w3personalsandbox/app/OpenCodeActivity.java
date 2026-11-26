package com.w3personalsandbox.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public final class OpenCodeActivity extends Activity {
    private static final String PAIR_COMMAND =
        "proot-distro login debian -- bash -lc 'exec \"$HOME/.opencode/bin/opencode\" pair'";
    private static final String DEFAULT_ADDRESS = "http://127.0.0.1:49374/";
    private WebView browser;
    private boolean opening;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(android.view.Gravity.CENTER_VERTICAL);
        layout.addView(header);

        Button back = new Button(this);
        back.setText("‹ Sandbox");
        back.setOnClickListener(view -> finish());
        header.addView(back);

        TextView title = new TextView(this);
        title.setText("OpenCode");
        title.setGravity(android.view.Gravity.CENTER);
        header.addView(title, new LinearLayout.LayoutParams(0, -2, 1));

        Button reconnect = new Button(this);
        reconnect.setText("ตั้งค่า");
        reconnect.setContentDescription("ตั้งค่าการเชื่อมต่อ OpenCode");
        reconnect.setVisibility(View.GONE);
        header.addView(reconnect);

        LinearLayout setup = new LinearLayout(this);
        setup.setOrientation(LinearLayout.VERTICAL);
        int padding = Math.round(16 * getResources().getDisplayMetrics().density);
        setup.setPadding(padding, padding, padding, padding);
        layout.addView(setup);

        TextView status = new TextView(this);
        status.setText("เปิด OpenCode หรือจับคู่ครั้งแรกผ่าน Termux");
        setup.addView(status);

        Button pair = new Button(this);
        pair.setText("คัดลอกคำสั่งจับคู่และเปิด Termux");
        pair.setOnClickListener(view -> {
            Intent termux = getPackageManager().getLaunchIntentForPackage("com.termux");
            if (termux == null) {
                status.setText("เปิด Termux ไม่ได้");
                return;
            }
            getSystemService(ClipboardManager.class).setPrimaryClip(ClipData.newPlainText("OpenCode pair", PAIR_COMMAND));
            status.setText("วางคำสั่งในเซสชันใหม่ของ Termux แล้วนำลิงก์ที่ได้กลับมาวางที่นี่");
            startActivity(termux);
        });
        setup.addView(pair);

        EditText address = new EditText(this);
        address.setSingleLine(true);
        address.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        address.setHint("วางลิงก์จับคู่จาก OpenCode");
        setup.addView(address);

        Button connect = new Button(this);
        connect.setText("เปิดหน้า OpenCode");
        setup.addView(connect);

        browser = new WebView(this);
        browser.getSettings().setJavaScriptEnabled(true);
        browser.getSettings().setDomStorageEnabled(true);
        browser.getSettings().setAllowFileAccess(false);
        browser.getSettings().setAllowContentAccess(false);
        browser.setVisibility(View.GONE);
        layout.addView(browser, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(layout);

        reconnect.setOnClickListener(view -> {
            opening = false;
            browser.stopLoading();
            browser.setVisibility(View.GONE);
            reconnect.setVisibility(View.GONE);
            status.setText("ตั้งค่าการเชื่อมต่อ OpenCode");
            setup.setVisibility(View.VISIBLE);
            connect.setEnabled(true);
        });

        connect.setOnClickListener(view -> {
            String input = address.getText().toString().trim();
            Uri uri = Uri.parse(input.isEmpty() ? getPreferences(MODE_PRIVATE).getString("server", DEFAULT_ADDRESS) : input);
            if (!isLocalOpenCode(uri)) {
                status.setText("ใช้ลิงก์ http://127.0.0.1 จาก OpenCode บนเครื่องนี้");
                return;
            }
            int port = uri.getPort();
            opening = true;
            browser.setWebViewClient(new WebViewClient() {
                @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    Uri target = request.getUrl();
                    return !isLocalOpenCode(target) || target.getPort() != port;
                }
                @Override public void onPageFinished(WebView view, String url) {
                    Uri page = Uri.parse(url);
                    if (!opening || !isLocalOpenCode(page) || page.getPort() != port) return;
                    String path = page.getPath();
                    if (path != null && path.startsWith("/auth/connect/")) {
                        showSetup("ลิงก์จับคู่ใช้ไม่ได้ กรุณาสร้างลิงก์ใหม่จาก Termux");
                        return;
                    }
                    opening = false;
                    getPreferences(MODE_PRIVATE).edit().putString("server", "http://127.0.0.1:" + port + "/").apply();
                    address.setText("");
                    setup.setVisibility(View.GONE);
                    reconnect.setVisibility(View.VISIBLE);
                    browser.setVisibility(View.VISIBLE);
                }
                @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    if (request.isForMainFrame()) showSetup("เชื่อมต่อไม่ได้ ตรวจว่า OpenCode ทำงานอยู่ใน Termux");
                }
                @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse error) {
                    if (!request.isForMainFrame()) return;
                    String path = request.getUrl().getPath();
                    showSetup(path != null && path.startsWith("/auth/connect/")
                        ? "ลิงก์จับคู่หมดอายุหรือถูกใช้แล้ว กรุณาสร้างลิงก์ใหม่จาก Termux"
                        : "เปิดหน้า OpenCode ไม่ได้ (HTTP " + error.getStatusCode() + ")");
                }
                private void showSetup(String message) {
                    opening = false;
                    browser.setVisibility(View.GONE);
                    reconnect.setVisibility(View.GONE);
                    status.setText(message);
                    setup.setVisibility(View.VISIBLE);
                    connect.setEnabled(true);
                }
            });
            status.setText("กำลังเปิด OpenCode…");
            connect.setEnabled(false);
            browser.loadUrl(uri.toString());
        });
    }

    private static boolean isLocalOpenCode(Uri uri) {
        return "http".equals(uri.getScheme()) && "127.0.0.1".equals(uri.getHost())
            && uri.getPort() >= 1024 && uri.getPort() <= 65535
            && uri.getUserInfo() == null;
    }

    @Override protected void onDestroy() {
        browser.stopLoading();
        browser.destroy();
        super.onDestroy();
    }
}
