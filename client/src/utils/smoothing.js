import { POSTURE_CONFIG } from './config.js';

/**
 * Computes moving average over the latest N valid posture scores.
 * Ignores missing/null detections.
 * Prevents sudden jitter from one erroneous landmark frame.
 *
 * @param {Array<number>} scores Array of valid historical posture scores
 * @param {number} [windowSize=POSTURE_CONFIG.MOVING_AVERAGE_WINDOW] Rolling window size (default 5)
 * @returns {number|null} Smoothed score rounded to integer, or null if no scores available
 */
export function calculateMovingAverage(scores, windowSize = POSTURE_CONFIG.MOVING_AVERAGE_WINDOW) {
  if (!Array.isArray(scores) || scores.length === 0) return null;

  const validScores = scores.filter((s) => typeof s === 'number' && !isNaN(s));
  if (validScores.length === 0) return null;

  const recentWindow = validScores.slice(-windowSize);
  const sum = recentWindow.reduce((acc, val) => acc + val, 0);
  return Math.round(sum / recentWindow.length);
}

/**
 * Returns smoothed posture classification based on the smoothed score.
 *
 * @param {number|null} smoothedScore
 * @param {number} [badThreshold=POSTURE_CONFIG.SCORE_BAD_THRESHOLD] Boundary score (default 70)
 * @returns {'good'|'bad'|'undetected'}
 */
export function getSmoothedPostureState(smoothedScore, badThreshold = POSTURE_CONFIG.SCORE_BAD_THRESHOLD) {
  if (smoothedScore === null || smoothedScore === undefined) {
    return 'undetected';
  }
  return smoothedScore < badThreshold ? 'bad' : 'good';
}

/**
 * Creates initial state for continuous bad-posture tracking and alert logic.
 *
 * @returns {Object}
 */
export function createInitialAlertTracker() {
  return {
    consecutiveBadSeconds: 0,
    cooldownRemainingSeconds: 0,
    totalAlerts: 0,
    shouldTriggerAlert: false
  };
}

/**
 * Pure state transition function for continuous bad-posture alerting.
 *
 * Rules:
 * 1. Consecutive bad seconds increment ONLY when smoothed state is 'bad' AND person is detected.
 * 2. If smoothed state becomes good, consecutive bad seconds reset to 0.
 * 3. Ticks where no person is detected are ignored (no increment, no reset).
 * 4. Alert triggers when consecutiveBadSeconds >= alertThresholdSec AND cooldownRemainingSeconds === 0.
 * 5. On alert trigger, cooldownRemainingSeconds is set to cooldownSec (default 60s).
 * 6. Cooldown decrements by 1 each second while > 0.
 *
 * @param {Object} tracker Previous tracker state
 * @param {Object} params
 * @param {boolean} params.isSmoothedBad Whether current smoothed posture is classified as bad
 * @param {boolean} params.personDetected Whether a person was successfully detected on this tick
 * @param {number} [params.alertThresholdSec=POSTURE_CONFIG.DEFAULT_ALERT_AFTER_SECONDS]
 * @param {number} [params.cooldownSec=POSTURE_CONFIG.ALERT_COOLDOWN_SECONDS]
 * @returns {Object} Next tracker state
 */
export function updateAlertTracker(
  tracker,
  {
    isSmoothedBad,
    personDetected,
    alertThresholdSec = POSTURE_CONFIG.DEFAULT_ALERT_AFTER_SECONDS,
    cooldownSec = POSTURE_CONFIG.ALERT_COOLDOWN_SECONDS
  }
) {
  // If no person detected, do not count as bad posture; simply decrement cooldown if active
  if (!personDetected) {
    return {
      ...tracker,
      cooldownRemainingSeconds: Math.max(0, tracker.cooldownRemainingSeconds - 1),
      shouldTriggerAlert: false
    };
  }

  const nextCooldown = Math.max(0, tracker.cooldownRemainingSeconds - 1);

  if (isSmoothedBad) {
    const nextBadSeconds = tracker.consecutiveBadSeconds + 1;

    // Check if alert should trigger
    if (nextBadSeconds >= alertThresholdSec && tracker.cooldownRemainingSeconds === 0) {
      return {
        consecutiveBadSeconds: nextBadSeconds,
        cooldownRemainingSeconds: cooldownSec,
        totalAlerts: tracker.totalAlerts + 1,
        shouldTriggerAlert: true
      };
    }

    return {
      consecutiveBadSeconds: nextBadSeconds,
      cooldownRemainingSeconds: nextCooldown,
      totalAlerts: tracker.totalAlerts,
      shouldTriggerAlert: false
    };
  }

  // Posture is good: reset consecutive bad seconds counter
  return {
    consecutiveBadSeconds: 0,
    cooldownRemainingSeconds: nextCooldown,
    totalAlerts: tracker.totalAlerts,
    shouldTriggerAlert: false
  };
}

/**
 * Creates initial state for camera-moved tracking.
 *
 * @returns {Object}
 */
export function createInitialCameraMovedTracker() {
  return {
    consecutiveSeconds: 0,
    isTriggered: false
  };
}

/**
 * Pure state transition function for camera movement detection.
 *
 * Rules:
 * 1. Checks if camera moved signature persists for at least minDurationSec (default 10s).
 * 2. Missing-person ticks do not reset or increment the counter.
 * 3. Once condition resolves or recalibration happens, counter resets.
 *
 * @param {Object} tracker Previous camera movement tracker state
 * @param {Object} params
 * @param {boolean} params.isConditionMet
 * @param {boolean} params.personDetected
 * @param {number} [params.minDurationSec=POSTURE_CONFIG.CAMERA_MOVED_MIN_DURATION_SEC]
 * @returns {Object} Next tracker state
 */
export function updateCameraMovedTracker(
  tracker,
  {
    isConditionMet,
    personDetected,
    minDurationSec = POSTURE_CONFIG.CAMERA_MOVED_MIN_DURATION_SEC
  }
) {
  if (!personDetected) {
    return tracker;
  }

  if (isConditionMet) {
    const nextSeconds = tracker.consecutiveSeconds + 1;
    return {
      consecutiveSeconds: nextSeconds,
      isTriggered: nextSeconds >= minDurationSec
    };
  }

  return {
    consecutiveSeconds: 0,
    isTriggered: false
  };
}
