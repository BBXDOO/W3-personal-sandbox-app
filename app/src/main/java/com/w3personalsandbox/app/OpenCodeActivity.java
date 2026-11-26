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
import android.webkit.WebView;
import android.webkit.WebViewClient;

public final class OpenCodeActivity extends Activity {
    private static final String PAIR_COMMAND =
        "proot-distro login debian -- bash -lc 'exec \"$HOME/.opencode/bin/opencode\" pair'";
    private static final String DEFAULT_ADDRESS = "http://127.0.0.1:49374/";
    private WebView browser;
    private boolean pageFailed;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);

        Button back = new Button(this);
        back.setText("‹ Sandbox");
        back.setOnClickListener(view -> finish());
        layout.addView(back);

        TextView status = new TextView(this);
        status.setText("OpenCode · ยังไม่ได้เชื่อมต่อ");
        layout.addView(status);

        LinearLayout setup = new LinearLayout(this);
        setup.setOrientation(LinearLayout.VERTICAL);
        layout.addView(setup);

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

        Button reconnect = new Button(this);
        reconnect.setText("ตั้งค่าการเชื่อมต่อ");
        reconnect.setOnClickListener(view -> setup.setVisibility(View.VISIBLE));
        layout.addView(reconnect, 2);

        connect.setOnClickListener(view -> {
            String input = address.getText().toString().trim();
            Uri uri = Uri.parse(input.isEmpty() ? DEFAULT_ADDRESS : input);
            if (!isLocalOpenCode(uri)) {
                status.setText("ใช้ลิงก์ http://127.0.0.1 จาก OpenCode บนเครื่องนี้");
                return;
            }
            int port = uri.getPort();
            pageFailed = false;
            browser.setWebViewClient(new WebViewClient() {
                @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    Uri target = request.getUrl();
                    return !isLocalOpenCode(target) || target.getPort() != port;
                }
                @Override public void onPageFinished(WebView view, String url) {
                    if (!pageFailed) status.setText("OpenCode · หากขึ้นหน้าให้เข้าสู่ระบบ ให้วางลิงก์จับคู่ใหม่");
                }
                @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    if (request.isForMainFrame()) {
                        pageFailed = true;
                        status.setText("เปิด OpenCode ไม่สำเร็จ · ตรวจว่า OpenCode ทำงานอยู่ใน Termux");
                        setup.setVisibility(View.VISIBLE);
                    }
                }
            });
            status.setText("กำลังเปิด OpenCode…");
            setup.setVisibility(View.GONE);
            browser.setVisibility(View.VISIBLE);
            address.setText("");
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
