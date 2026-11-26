package br.com.radardetalentos.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {

    private static final String RADAR_PORTAL_URL = "https://radardetalentos.net.br/";
    private static final String NOTIF_CHANNEL_ID = "radar_e2e_alerts";
    private int notifSeq = 1000;

    private FrameLayout rootContainer;
    private WebView webView;
    private ProgressBar topProgressBar;
    private LinearLayout offlineOverlay;

    private int insetTopDp = 0;
    private int insetRightDp = 0;
    private int insetBottomDp = 0;
    private int insetLeftDp = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureEdgeToEdgeWindow();
        buildUserInterface();
        configureWebView();
        setupWindowInsetsBridge();

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            loadRadarPortal();
        }
    }

    private void configureEdgeToEdgeWindow() {
        try {
            Window window = getWindow();
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
            window.setStatusBarColor(Color.TRANSPARENT);
            window.setNavigationBarColor(Color.TRANSPARENT);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                WindowManager.LayoutParams lp = window.getAttributes();
                lp.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                window.setAttributes(lp);
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                window.setStatusBarContrastEnforced(false);
                window.setNavigationBarContrastEnforced(false);
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                window.setDecorFitsSystemWindows(false);
                WindowInsetsController controller = window.getInsetsController();
                if (controller != null) {
                    controller.setSystemBarsAppearance(
                        0,
                        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                            | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                    );
                }
            } else {
                int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
                window.getDecorView().setSystemUiVisibility(flags);
            }
        } catch (Throwable ignored) {
        }
    }

    private void buildUserInterface() {
        rootContainer = new FrameLayout(this);
        rootContainer.setBackgroundColor(Color.parseColor("#0A0414"));
        rootContainer.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#0A0414"));
        webView.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        rootContainer.addView(webView);

        topProgressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        topProgressBar.setMax(100);
        topProgressBar.setIndeterminate(false);
        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dpToPx(3)
        );
        progressParams.gravity = Gravity.TOP;
        topProgressBar.setLayoutParams(progressParams);
        rootContainer.addView(topProgressBar);

        offlineOverlay = createOfflineOverlay();
        offlineOverlay.setVisibility(View.GONE);
        rootContainer.addView(offlineOverlay);

        setContentView(rootContainer);
    }

    private LinearLayout createOfflineOverlay() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setBackgroundColor(Color.parseColor("#0A0414"));
        int pad = dpToPx(28);
        layout.setPadding(pad, pad, pad, pad);
        layout.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        TextView badge = new TextView(this);
        badge.setText("RADAR DE TALENTOS • EDGE-TO-EDGE MOBILE & TABLET");
        badge.setTextColor(Color.parseColor("#D896FF"));
        badge.setTextSize(11f);
        badge.setGravity(Gravity.CENTER);
        layout.addView(badge);

        TextView title = new TextView(this);
        title.setText("Conexão com a Central Indisponível");
        title.setTextColor(Color.parseColor("#F5EEFF"));
        title.setTextSize(20f);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, dpToPx(12), 0, dpToPx(8));
        layout.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText("Verifique sua conexão Wi-Fi ou 4G/5G para sincronizar a telemetria territorial e artística.");
        subtitle.setTextColor(Color.parseColor("#BCA8DC"));
        subtitle.setTextSize(14f);
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setPadding(0, 0, 0, dpToPx(22));
        layout.addView(subtitle);

        Button retryBtn = new Button(this);
        retryBtn.setText("Reconectar ao Radar");
        retryBtn.setTextColor(Color.WHITE);
        retryBtn.setBackgroundColor(Color.parseColor("#9A32EF"));
        retryBtn.setPadding(dpToPx(24), dpToPx(12), dpToPx(24), dpToPx(12));
        retryBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                offlineOverlay.setVisibility(View.GONE);
                loadRadarPortal();
            }
        });
        layout.addView(retryBtn);

        return layout;
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        boolean isTablet = isTabletDevice();
        String baseUa = settings.getUserAgentString();
        settings.setUserAgentString(
            baseUa + " RadarDeTalentosApp/3.0 (" + (isTablet ? "Tablet" : "Mobile") + "; EdgeToEdge)"
        );

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        setupNotificationChannel();
        webView.addJavascriptInterface(new RadarNativeBridge(), "RadarNative");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) {
                    topProgressBar.setVisibility(View.VISIBLE);
                    topProgressBar.setProgress(newProgress);
                } else {
                    topProgressBar.setProgress(100);
                    topProgressBar.setVisibility(View.GONE);
                }
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                offlineOverlay.setVisibility(View.GONE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                CookieManager.getInstance().flush();
                injectEdgeToEdgeInsetsIntoDom();
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                String url = error != null ? error.getUrl() : "";
                if (url != null && (url.contains("34.70.140.94") || url.contains("sslip.io"))) {
                    handler.proceed();
                } else {
                    super.onReceivedSslError(view, handler, error);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri == null) return false;
                String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase() : "";
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    String host = uri.getHost() != null ? uri.getHost().toLowerCase() : "";
                    if (host.contains("34.70.140.94") || host.contains("sslip.io") || host.contains("radardetalentos") || host.contains("localhost")) {
                        return false;
                    }
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (Exception ignored) {
                    }
                    return true;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request != null && request.isForMainFrame()) {
                    offlineOverlay.setVisibility(View.VISIBLE);
                }
            }
        });

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
                try {
                    DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                    request.setMimeType(mimetype);
                    String cookies = CookieManager.getInstance().getCookie(url);
                    if (cookies != null) {
                        request.addRequestHeader("cookie", cookies);
                    }
                    request.addRequestHeader("User-Agent", userAgent);
                    String fileName = URLUtil.guessFileName(url, contentDisposition, mimetype);
                    request.setTitle(fileName);
                    request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
                    DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                    if (dm != null) {
                        dm.enqueue(request);
                        Toast.makeText(getApplicationContext(), "Baixando " + fileName + "...", Toast.LENGTH_SHORT).show();
                    }
                } catch (Exception e) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    } catch (Exception ignored) {
                    }
                }
            }
        });
    }

    private void setupWindowInsetsBridge() {
        rootContainer.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View v, WindowInsets insets) {
                int topPx;
                int rightPx;
                int bottomPx;
                int leftPx;

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    Insets sysInsets = insets.getInsetsIgnoringVisibility(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout()
                    );
                    topPx = sysInsets.top;
                    rightPx = sysInsets.right;
                    bottomPx = sysInsets.bottom;
                    leftPx = sysInsets.left;
                } else {
                    topPx = insets.getSystemWindowInsetTop();
                    rightPx = insets.getSystemWindowInsetRight();
                    bottomPx = insets.getSystemWindowInsetBottom();
                    leftPx = insets.getSystemWindowInsetLeft();
                }

                insetTopDp = pxToDp(topPx);
                insetRightDp = pxToDp(rightPx);
                insetBottomDp = pxToDp(bottomPx);
                insetLeftDp = pxToDp(leftPx);

                FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) topProgressBar.getLayoutParams();
                lp.topMargin = topPx;
                topProgressBar.setLayoutParams(lp);

                injectEdgeToEdgeInsetsIntoDom();
                return insets;
            }
        });
    }

    private void injectEdgeToEdgeInsetsIntoDom() {
        if (webView == null) return;
        boolean tablet = isTabletDevice();
        final String js = "(function(){"
            + "var r=document.documentElement;"
            + "if(!r)return;"
            + "r.style.setProperty('--safe-top','" + insetTopDp + "px');"
            + "r.style.setProperty('--safe-right','" + insetRightDp + "px');"
            + "r.style.setProperty('--safe-bottom','" + insetBottomDp + "px');"
            + "r.style.setProperty('--safe-left','" + insetLeftDp + "px');"
            + "r.setAttribute('data-radar-native-app','edge-to-edge');"
            + "r.setAttribute('data-radar-form-factor','" + (tablet ? "tablet" : "mobile") + "');"
            + "})();";
        webView.post(new Runnable() {
            @Override
            public void run() {
                try {
                    webView.evaluateJavascript(js, null);
                } catch (Throwable ignored) {
                }
            }
        });
    }

    private void loadRadarPortal() {
        if (!isNetworkAvailable()) {
            offlineOverlay.setVisibility(View.VISIBLE);
            return;
        }
        offlineOverlay.setVisibility(View.GONE);
        webView.loadUrl(RADAR_PORTAL_URL);
    }

    private boolean isNetworkAvailable() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return true;
            NetworkInfo activeNetwork = cm.getActiveNetworkInfo();
            return activeNetwork != null && activeNetwork.isConnected();
        } catch (Exception e) {
            return true;
        }
    }

    private boolean isTabletDevice() {
        int screenLayout = getResources().getConfiguration().screenLayout & Configuration.SCREENLAYOUT_SIZE_MASK;
        return screenLayout >= Configuration.SCREENLAYOUT_SIZE_LARGE;
    }

    private int dpToPx(int dp) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(dp * density);
    }

    private int pxToDp(int px) {
        float density = getResources().getDisplayMetrics().density;
        if (density <= 0f) return px;
        return Math.round(px / density);
    }

    private void setupNotificationChannel() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) {
                    NotificationChannel channel = new NotificationChannel(
                        NOTIF_CHANNEL_ID,
                        "Alertas E2E Radar de Talentos",
                        NotificationManager.IMPORTANCE_DEFAULT
                    );
                    channel.setDescription("Notificações em tempo real de talentos em ascensão e prospecção");
                    nm.createNotificationChannel(channel);
                }
            }
        } catch (Throwable ignored) {
        }
    }

    public class RadarNativeBridge {
        @JavascriptInterface
        public void notify(String title, String message) {
            try {
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm == null) return;
                Intent intent = new Intent(MainActivity.this, MainActivity.class);
                intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                    ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                    : PendingIntent.FLAG_UPDATE_CURRENT;
                PendingIntent pi = PendingIntent.getActivity(MainActivity.this, 0, intent, flags);

                Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    ? new Notification.Builder(MainActivity.this, NOTIF_CHANNEL_ID)
                    : new Notification.Builder(MainActivity.this);

                builder.setSmallIcon(R.drawable.ic_launcher)
                    .setContentTitle(title != null && !title.isEmpty() ? title : "Radar de Talentos")
                    .setContentText(message != null ? message : "")
                    .setAutoCancel(true)
                    .setContentIntent(pi);

                nm.notify(++notifSeq, builder.build());
            } catch (Throwable ignored) {
            }
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        configureEdgeToEdgeWindow();
        rootContainer.requestApplyInsets();
        injectEdgeToEdgeInsetsIntoDom();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView != null && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
