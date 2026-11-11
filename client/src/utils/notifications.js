/**
 * Utilities for browser notifications and audio alerts in PostureGuard.
 */

/**
 * Checks if browser notifications are supported.
 * @returns {boolean}
 */
export function isNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Requests browser notification permission after explicit user gesture.
 * @returns {Promise<'granted'|'denied'|'default'|'unsupported'>}
 */
export async function requestNotificationPermission() {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.error('Failed to request notification permission:', err);
    return 'denied';
  }
}

/**
 * Sends a native browser desktop notification if permission has been granted.
 *
 * @param {string} title Notification heading
 * @param {NotificationOptions} [options]
 * @returns {Notification|null}
 */
export function sendBrowserNotification(title, options = {}) {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return null;
  }

  try {
    return new Notification(title, {
      icon: '/vite.svg',
      badge: '/vite.svg',
      tag: 'postureguard-alert',
      renotify: true,
      ...options
    });
  } catch (err) {
    console.warn('Failed to display browser notification:', err);
    return null;
  }
}

/**
 * Plays a short, friendly synthesized audio chime using the Web Audio API.
 * Uses an oscillator ramp from D5 (587 Hz) to A5 (880 Hz) with exponential decay.
 * Requires no external audio files or network requests.
 */
export function playAlertChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);

    // Clean up audio context
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 600);
  } catch (err) {
    console.warn('Web Audio chime playback failed or blocked by autoplay policy:', err);
  }
}
