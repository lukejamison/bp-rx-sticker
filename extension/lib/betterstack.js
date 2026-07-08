/**
 * Best-effort forwarding of warnings/errors to Better Stack (Logtail) for
 * real-time alerting. Disabled by default -- a no-op until both settings
 * below are configured on the Options page. Never throws; a Better Stack
 * outage or missing config must never affect scanning/printing.
 */

function safeSerialize(value) {
  try {
    return JSON.parse(
      JSON.stringify(value, (_key, val) => {
        if (val instanceof Error) {
          return { message: val.message, stack: val.stack };
        }
        return val;
      })
    );
  } catch {
    return String(value);
  }
}

/**
 * Returns { sent: boolean, reason?: string } so callers that care (the
 * Options page "send test alert" button) can report real status, while
 * regular warn()/error call sites can just fire-and-forget the promise.
 * Never throws.
 */
async function sendToBetterStack(level, message, context) {
  try {
    const settings = await chrome.storage.sync.get({
      betterStackToken: '',
      betterStackHost: '',
    });
    if (!settings.betterStackToken || !settings.betterStackHost) {
      return { sent: false, reason: 'not_configured' };
    }

    const host = settings.betterStackHost.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!host) return { sent: false, reason: 'not_configured' };

    const response = await fetch(`https://${host}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.betterStackToken}`,
      },
      body: JSON.stringify({
        dt: new Date().toISOString(),
        level,
        message: String(message ?? ''),
        service: 'bp-rx-extension',
        ...(context ? safeSerialize(context) : {}),
      }),
    });

    if (!response.ok) {
      return { sent: false, reason: `http_${response.status}` };
    }
    return { sent: true };
  } catch (err) {
    // Best-effort only -- swallow network/config errors so this never breaks
    // the extension's real job (scanning + printing).
    return { sent: false, reason: err.message || 'network_error' };
  }
}

if (typeof self !== 'undefined') {
  self.sendToBetterStack = sendToBetterStack;
}
