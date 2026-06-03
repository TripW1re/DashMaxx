/**
 * ConnectDoorDashScreen
 *
 * Opens a WebView to dasher.doordash.com and automatically
 * captures the DoorDash auth token by intercepting API calls.
 *
 * The user logs in normally — we extract the token from
 * intercepted network requests, no DevTools needed.
 *
 * Flow:
 *   1. WebView loads dasher.doordash.com
 *   2. Injected JS intercepts fetch/XHR to api.doordash.com
 *   3. Extracts Authorization header → posts to RN
 *   4. RN receives token → sends to MCP server → starts sync
 *   5. WebView closes, dashboard populates with live data
 */
import React, { useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showToast } from '../components/Toast';
import { THEME } from '../utils/constants';
import { setMcpUrl, setDoorDashToken, syncAllFromDoorDash, checkConnection, startBackgroundSync, getMcpUrl } from '../services/mcpClient';
import { getLocalState, saveToStorage } from '../services/localDb';

// Injected JavaScript that runs in the WebView context
// Monkeypatches fetch and XMLHttpRequest to intercept DoorDash API calls
const INJECTED_JS = `
(function() {
  const TOKEN_PATTERN = /Bearer\\s+([A-Za-z0-9_\\-]+\\.[A-Za-z0-9_\\-]+\\.[A-Za-z0-9_\\-]+)/;

  function tryExtractToken(headers) {
    if (!headers) return null;
    const auth = headers['Authorization'] || headers['authorization'] || headers.get?.('Authorization');
    if (auth) {
      const match = auth.match(TOKEN_PATTERN);
      if (match && match[1]) return match[1];
      if (auth.startsWith('Bearer ')) return auth.substring(7);
    }
    return null;
  }

  function tryExtractFromBody(url, body) {
    if (!body || typeof body !== 'string') return null;
    try {
      const parsed = JSON.parse(body);
      if (parsed.variables?.token) return parsed.variables.token;
    } catch {}
    return null;
  }

  // Intercept fetch
  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (url.includes('api.doordash.com') || url.includes('dasher.doordash.com/api')) {
      const headers = init?.headers || {};
      const token = tryExtractToken(headers) || tryExtractFromBody(url, init?.body);
      if (token) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'TOKEN_CAPTURED',
          token: token,
          url: url,
          timestamp: Date.now()
        }));
      }
    }
    return originalFetch.apply(this, arguments);
  };

  // Intercept XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this._dashMaxxUrl = url;
    this._dashMaxxMethod = method;
    this._dashMaxxHeaders = {};
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
    this._dashMaxxHeaders[header] = value;
    if (this._dashMaxxUrl && this._dashMaxxUrl.includes('api.doordash.com')) {
      const token = tryExtractToken(this._dashMaxxHeaders);
      if (token) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'TOKEN_CAPTURED',
          token: token,
          url: this._dashMaxxUrl,
          timestamp: Date.now()
        }));
      }
    }
    return originalSetRequestHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    if (this._dashMaxxUrl && this._dashMaxxUrl.includes('api.doordash.com')) {
      const token = tryExtractFromBody(this._dashMaxxUrl, body);
      if (token) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'TOKEN_CAPTURED',
          token: token,
          url: this._dashMaxxUrl,
          timestamp: Date.now()
        }));
      }

      // Also check for token in cookies on response
      const originalOnReadyStateChange = this.onreadystatechange;
      const xhr = this;
      this.addEventListener('readystatechange', function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
          const respHeaders = xhr.getAllResponseHeaders();
          if (respHeaders && respHeaders.includes('authorization')) {
            const lines = respHeaders.split('\\n');
            for (const line of lines) {
              const parts = line.split(':');
              if (parts[0].trim().toLowerCase() === 'authorization') {
                const token = parts.slice(1).join(':').trim().replace('Bearer ', '');
                if (token) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'TOKEN_CAPTURED',
                    token: token,
                    url: xhr._dashMaxxUrl,
                    timestamp: Date.now()
                  }));
                }
              }
            }
          }
        }
        if (originalOnReadyStateChange) originalOnReadyStateChange.apply(xhr, arguments);
      });
    }
    return originalSend.apply(this, arguments);
  };

  // Also check cookies periodically for token
  setInterval(function() {
    const cookies = document.cookie || '';
    const cookieMatch = cookies.match(/__dash_token=([^;]+)/) || cookies.match(/dash_token=([^;]+)/);
    if (cookieMatch && cookieMatch[1]) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'TOKEN_CAPTURED',
        token: cookieMatch[1],
        source: 'cookie',
        timestamp: Date.now()
      }));
    }
  }, 2000);

  console.log('[DashMaxx] Token interceptor installed');
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'INTERCEPTOR_READY',
    timestamp: Date.now()
  }));
})();
`;

// Styling injected into the WebView for a native-ish feel
const WEBVIEW_STYLES = `
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<style>
  body { font-family: -apple-system, sans-serif; }
  .login-container { padding: 16px; }
  button, .btn, [data-testid="login-button"] { 
    border-radius: 8px !important;
  }
</style>
`;

export default function ConnectDoorDashScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading, login, capturing, connecting, syncing, done, error
  const [capturedToken, setCapturedToken] = useState(null);
  const [statusMessage, setStatusMessage] = useState('Initializing...');
  const [progress, setProgress] = useState(0);
  const [url, setUrl] = useState('https://dasher.doordash.com');

  // Handle messages from WebView injected JS
  const handleMessage = useCallback(async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      switch (data.type) {
        case 'INTERCEPTOR_READY':
          setStatus('login');
          setStatusMessage('Log in to DoorDash below — we\'ll capture your session automatically');
          break;

        case 'TOKEN_CAPTURED':
          if (capturedToken) return; // Already got one
          
          const token = data.token;
          if (!token || token.length < 20) return; // Validate token format

          setCapturedToken(token);
          setStatus('connecting');
          setStatusMessage('✅ Token captured! Connecting to server...');
          setProgress(30);

          // Proceed with connection
          try {
            await handleTokenCapture(token);
          } catch (e) {
            setStatus('error');
            setStatusMessage('Connection failed: ' + e.message);
          }
          break;

        case 'LOGIN_SUCCESS':
          setStatusMessage('Login detected — waiting for API token...');
          break;
      }
    } catch {}
  }, [capturedToken]);

  // Handle the captured token — send to MCP server and sync
  const handleTokenCapture = async (token) => {
    setProgress(50);
    setStatusMessage('Sending token to MCP server...');

    // Get MCP server URL
    const mcpUrl = await getMcpUrl();
    if (!mcpUrl) {
      throw new Error('MCP server URL not configured');
    }

    // Send token to MCP server
    try {
      await setDoorDashToken(token);
    } catch {}

    setProgress(70);
    setStatusMessage('Checking connection...');

    // Verify connection
    const health = await checkConnection();
    if (!health.connected) {
      throw new Error('MCP server unreachable at ' + mcpUrl);
    }

    setProgress(85);
    setStatus('syncing');
    setStatusMessage('Syncing your DoorDash data...');

    // Start sync
    const result = await syncAllFromDoorDash();
    
    // Save token to local storage too
    const state = getLocalState();
    state.settings.doorDashToken = token;
    state.settings.doorDashConnected = true;
    state.settings.lastDoorDashSync = new Date().toISOString();
    await saveToStorage(state);

    // Start background polling
    try { await startBackgroundSync(5); } catch {}

    setProgress(100);
    setStatus('done');
    setStatusMessage('✅ Connected! Dashboard is live.');

    showToast('🚚 Live DoorDash data active!');
  };

  const handleNavigationStateChange = useCallback((navState) => {
    setUrl(navState.url);
    
    // Detect which page we're on
    if (navState.url.includes('/login') || navState.url.includes('/auth')) {
      setStatus('login');
      setStatusMessage('Enter your DoorDash credentials to continue');
    } else if (navState.url.includes('/dashboard') || navState.url.includes('/earnings')) {
      if (!capturedToken) {
        setStatusMessage('Looking for API token...');
      }
    }
  }, [capturedToken]);

  const handleRetry = () => {
    setCapturedToken(null);
    setStatus('login');
    setStatusMessage('Log in to DoorDash below');
    setProgress(0);
    setUrl('https://dasher.doordash.com');
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
  };

  const handleClose = () => {
    navigation.goBack();
  };

  // ===== RENDER =====

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Connect DoorDash</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Status Bar */}
      {status !== 'login' && (
        <View style={[styles.statusBar, 
          status === 'done' ? styles.statusSuccess :
          status === 'error' ? styles.statusError :
          styles.statusActive
        ]}>
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color={status === 'error' ? THEME.red : THEME.green} />
            <Text style={[styles.statusText, { color: status === 'error' ? THEME.red : THEME.green }]}>
              {statusMessage}
            </Text>
          </View>
          {progress > 0 && progress < 100 && (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: progress + '%' }]} />
            </View>
          )}
        </View>
      )}

      {/* Login instructions (shown when awaiting login) */}
      {status === 'login' && (
        <View style={styles.instructions}>
          <Text style={styles.instructionsTitle}>🔐 Sign in to DoorDash</Text>
          <Text style={styles.instructionsText}>
            {statusMessage}
          </Text>
          <View style={styles.stepsRow}>
            <View style={styles.step}>
              <Text style={styles.stepNum}>1</Text>
              <Text style={styles.stepLabel}>Log in</Text>
            </View>
            <View style={styles.stepArrow}>→</View>
            <View style={styles.step}>
              <Text style={styles.stepNum}>2</Text>
              <Text style={styles.stepLabel}>Auto-capture</Text>
            </View>
            <View style={styles.stepArrow}>→</View>
            <View style={styles.step}>
              <Text style={styles.stepNum}>3</Text>
              <Text style={styles.stepLabel}>Live data</Text>
            </View>
          </View>
        </View>
      )}

      {/* Success screen */}
      {status === 'done' && (
        <View style={styles.successContainer}>
          <Text style={styles.successEmoji}>🚚</Text>
          <Text style={styles.successTitle}>Connected!</Text>
          <Text style={styles.successDesc}>Your DoorDash data is now live in the dashboard.</Text>
          <TouchableOpacity style={styles.doneBtn} onPress={handleClose}>
            <Text style={styles.doneBtnText}>Go to Dashboard</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Error screen */}
      {status === 'error' && (
        <View style={styles.successContainer}>
          <Text style={styles.successEmoji}>⚠️</Text>
          <Text style={styles.successTitle}>Connection Issue</Text>
          <Text style={styles.successDesc}>{statusMessage}</Text>
          <Text style={styles.helpText}>
            Make sure your MCP server is running at the configured URL.
            You can also manually paste your auth token in Settings.
          </Text>
          <View style={styles.errorActions}>
            <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
              <Text style={styles.retryBtnText}>🔄 Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.skipBtn} onPress={handleClose}>
              <Text style={styles.skipBtnText}>Settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* WebView — always rendered but hidden when done/error */}
      <View style={[
        styles.webViewContainer,
        (status === 'done' || status === 'error') && { height: 0, opacity: 0 }
      ]}>
        <WebView
          ref={webViewRef}
          source={{ uri: url }}
          style={styles.webView}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
          cacheEnabled={false}
          onMessage={handleMessage}
          onNavigationStateChange={handleNavigationStateChange}
          injectedJavaScript={INJECTED_JS}
          startInLoadingState={true}
          renderLoading={() => (
            <View style={styles.webViewLoading}>
              <ActivityIndicator size="large" color={THEME.accent} />
              <Text style={{ color: THEME.text2, marginTop: 8, fontSize: 13 }}>Loading DoorDash...</Text>
            </View>
          )}
          userAgent={Platform.OS === 'ios' 
            ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
            : 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36'
          }
          allowsBackForwardNavigationGestures={true}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },
  
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: THEME.surface,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  closeBtn: { padding: 4 },
  closeText: { fontSize: 20, color: THEME.text, fontWeight: '600' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: THEME.text },

  // Status bar
  statusBar: {
    padding: 10,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 8,
  },
  statusActive: { backgroundColor: 'rgba(34,197,94,0.08)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)' },
  statusSuccess: { backgroundColor: 'rgba(34,197,94,0.12)', borderWidth: 1, borderColor: THEME.green },
  statusError: { backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: THEME.red },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: { fontSize: 12, fontWeight: '600', flex: 1 },
  progressTrack: { height: 3, backgroundColor: THEME.border, borderRadius: 2, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: THEME.green, borderRadius: 2 },
  
  // Instructions overlay
  instructions: {
    padding: 16,
    alignItems: 'center',
  },
  instructionsTitle: { fontSize: 16, fontWeight: '700', color: THEME.text, marginBottom: 4 },
  instructionsText: { fontSize: 12, color: THEME.text2, textAlign: 'center', marginBottom: 12 },
  stepsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  step: { alignItems: 'center' },
  stepNum: { fontSize: 18, fontWeight: '800', color: THEME.accent, backgroundColor: THEME.surface2, width: 32, height: 32, borderRadius: 16, textAlign: 'center', lineHeight: 32, overflow: 'hidden' },
  stepLabel: { fontSize: 10, color: THEME.text2, marginTop: 4 },
  stepArrow: { fontSize: 16, color: THEME.text3 },

  // Success / Error
  successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  successEmoji: { fontSize: 64, marginBottom: 12 },
  successTitle: { fontSize: 24, fontWeight: '800', color: THEME.text, marginBottom: 8 },
  successDesc: { fontSize: 14, color: THEME.text2, textAlign: 'center', marginBottom: 16 },
  helpText: { fontSize: 12, color: THEME.text3, textAlign: 'center', marginBottom: 20, lineHeight: 18 },
  doneBtn: {
    backgroundColor: THEME.accent,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
  },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  errorActions: { flexDirection: 'row', gap: 12 },
  retryBtn: {
    backgroundColor: THEME.accent,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  skipBtn: {
    backgroundColor: THEME.surface2,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  skipBtnText: { color: THEME.text, fontWeight: '600', fontSize: 14 },

  // WebView
  webViewContainer: { flex: 1, marginTop: 4 },
  webView: { flex: 1, backgroundColor: THEME.bg },
  webViewLoading: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: THEME.bg,
  },
});
