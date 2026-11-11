import { create } from 'zustand';
import { POSTURE_CONFIG } from '../utils/config.js';
import api from '../api/axios.js';

const BASELINE_STORAGE_KEY = 'postureguard_baseline';
const SESSIONS_STORAGE_KEY = 'postureguard_sessions';

// Safely retrieve persisted baseline from sessionStorage
function loadStoredBaseline() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(BASELINE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      Number.isFinite(parsed.noseHeight) &&
      Number.isFinite(parsed.shoulderWidth) &&
      Number.isFinite(parsed.shoulderTilt) &&
      Number.isFinite(parsed.headOffset)
    ) {
      return parsed;
    }
  } catch (e) {
    console.warn('Failed to parse baseline from sessionStorage:', e);
  }
  return null;
}

// Safely retrieve completed sessions from sessionStorage
function loadStoredSessions() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    console.warn('Failed to parse sessions from sessionStorage:', e);
  }
  return [];
}

export const usePostureStore = create((set, get) => ({
  // 1. Calibrated baseline
  baseline: loadStoredBaseline(),
  setBaseline: (baseline) => {
    try {
      if (
        baseline &&
        Number.isFinite(baseline.noseHeight) &&
        Number.isFinite(baseline.shoulderWidth) &&
        Number.isFinite(baseline.shoulderTilt) &&
        Number.isFinite(baseline.headOffset)
      ) {
        sessionStorage.setItem(BASELINE_STORAGE_KEY, JSON.stringify(baseline));
      } else {
        sessionStorage.removeItem(BASELINE_STORAGE_KEY);
      }
    } catch (e) {
      console.warn('Failed to save baseline to sessionStorage:', e);
    }
    set({
      baseline,
      calibrationStatus: baseline ? 'success' : 'idle',
      calibrationError: null
    });
  },
  clearBaseline: () => {
    try {
      sessionStorage.removeItem(BASELINE_STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to clear baseline:', e);
    }
    set({ baseline: null, postureState: 'uncalibrated', calibrationStatus: 'idle' });
  },

  // 2. Calibration lifecycle
  isCalibrating: false,
  calibrationProgressSec: 0,
  calibrationStatus: 'idle', // 'idle' | 'calibrating' | 'success' | 'failed'
  calibrationError: null,
  setCalibrationState: (partial) => set(partial),

  // 3. User settings
  settings: {
    alertAfterSeconds: POSTURE_CONFIG.DEFAULT_ALERT_AFTER_SECONDS,
    breakEveryMinutes: POSTURE_CONFIG.DEFAULT_BREAK_EVERY_MINUTES,
    soundEnabled: true,
    notificationsEnabled: false
  },
  updateSettings: (partial) =>
    set((state) => ({
      settings: { ...state.settings, ...partial }
    })),

  // 4. Session runtime state
  isSessionActive: false,
  sessionDurationSec: 0,
  goodSec: 0,
  badSec: 0,
  alertsCount: 0,
  currentScore: 100,
  smoothedScore: 100,
  scoresHistory: [],
  postureState: 'idle', // 'good' | 'bad' | 'uncalibrated' | 'undetected' | 'idle'
  badReasons: [],
  isCameraMoved: false,
  breakReminderActive: false,
  sessionSummary: null,
  completedSessions: loadStoredSessions(),

  startSession: () => {
    set({
      isSessionActive: true,
      sessionDurationSec: 0,
      goodSec: 0,
      badSec: 0,
      alertsCount: 0,
      currentScore: 100,
      smoothedScore: 100,
      scoresHistory: [],
      postureState: 'good',
      badReasons: [],
      isCameraMoved: false,
      breakReminderActive: false,
      sessionSummary: null
    });
  },

  stopSession: () => {
    const state = get();
    const duration = state.sessionDurationSec;
    const good = state.goodSec;
    const bad = state.badSec;
    const alerts = state.alertsCount;
    const scores = state.scoresHistory;

    const avgScore =
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 100;

    const goodPercentage =
      duration > 0 ? Math.round((good / duration) * 100) : 100;

    const summary = {
      id: Date.now().toString(),
      durationSec: duration,
      goodSec: good,
      badSec: bad,
      avgScore,
      slouchAlerts: alerts,
      goodPercentage,
      endedAt: new Date().toISOString()
    };

    const nextSessions = [summary, ...(state.completedSessions || [])];
    try {
      sessionStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(nextSessions));
    } catch (e) {
      console.warn('Failed to persist completed session:', e);
    }

    // Persist to MongoDB backend if session duration was at least 1 second
    if (duration >= 1) {
      api
        .post('/sessions', {
          durationSec: duration,
          goodSec: good,
          badSec: bad,
          alertsCount: alerts,
          avgScore,
          timelineScores: scores.slice(-100),
          startedAt: new Date(Date.now() - duration * 1000).toISOString(),
          endedAt: summary.endedAt
        })
        .catch((err) => {
          console.warn('Failed to save session to backend:', err?.response?.data?.message || err.message);
        });
    }

    set({
      isSessionActive: false,
      sessionSummary: summary,
      completedSessions: nextSessions,
      postureState: 'idle',
      breakReminderActive: false
    });

    return summary;
  },

  dismissBreakReminder: () => set({ breakReminderActive: false }),
  dismissSummary: () => set({ sessionSummary: null }),

  // Update session on each tick
  tickSession: ({
    isGood,
    rawScore,
    smoothedScore,
    reasons,
    isCameraMoved,
    shouldAlert,
    triggerBreak
  }) => {
    set((state) => {
      if (!state.isSessionActive) return {};

      const nextDuration = state.sessionDurationSec + 1;
      const nextGood = isGood ? state.goodSec + 1 : state.goodSec;
      const nextBad = !isGood ? state.badSec + 1 : state.badSec;
      const nextAlerts = shouldAlert ? state.alertsCount + 1 : state.alertsCount;

      const nextScores =
        typeof rawScore === 'number'
          ? [...state.scoresHistory, rawScore]
          : state.scoresHistory;

      return {
        sessionDurationSec: nextDuration,
        goodSec: nextGood,
        badSec: nextBad,
        alertsCount: nextAlerts,
        currentScore: typeof rawScore === 'number' ? rawScore : state.currentScore,
        smoothedScore:
          typeof smoothedScore === 'number'
            ? smoothedScore
            : state.smoothedScore,
        scoresHistory: nextScores,
        postureState: isGood ? 'good' : 'bad',
        badReasons: reasons || [],
        isCameraMoved: Boolean(isCameraMoved),
        breakReminderActive: triggerBreak ? true : state.breakReminderActive
      };
    });
  }
}));
