import { describe, it, expect } from 'vitest';
import {
  calculateMovingAverage,
  getSmoothedPostureState,
  createInitialAlertTracker,
  updateAlertTracker,
  createInitialCameraMovedTracker,
  updateCameraMovedTracker
} from './smoothing.js';

describe('smoothing.js - Temporal Smoothing and Alert Logic', () => {
  it('1. computes moving average over latest 5 valid posture scores', () => {
    const scores = [80, 85, 90, 95, 100];
    const avg = calculateMovingAverage(scores, 5);
    // (80 + 85 + 90 + 95 + 100) / 5 = 90
    expect(avg).toBe(90);

    // Over 5 scores: only uses last 5
    const longerHistory = [20, 30, 80, 85, 90, 95, 100];
    const avgRecent = calculateMovingAverage(longerHistory, 5);
    expect(avgRecent).toBe(90);
  });

  it('2. filters out null, undefined, or NaN scores in moving average', () => {
    const dirtyScores = [100, null, 80, undefined, NaN, 90];
    // valid: 100, 80, 90 -> avg = 90
    const avg = calculateMovingAverage(dirtyScores, 5);
    expect(avg).toBe(90);

    expect(calculateMovingAverage([])).toBeNull();
    expect(calculateMovingAverage([null, undefined])).toBeNull();
  });

  it('3. maps smoothed score to posture state correctly', () => {
    expect(getSmoothedPostureState(100)).toBe('good');
    expect(getSmoothedPostureState(70)).toBe('good');
    expect(getSmoothedPostureState(69)).toBe('bad');
    expect(getSmoothedPostureState(0)).toBe('bad');
    expect(getSmoothedPostureState(null)).toBe('undetected');
  });

  it('4. tracks continuous bad posture duration and triggers alert at configured threshold', () => {
    let tracker = createInitialAlertTracker();
    const alertThresholdSec = 5; // test with 5 seconds threshold
    const cooldownSec = 10;

    // Simulate 4 bad seconds: should not alert yet
    for (let i = 1; i <= 4; i++) {
      tracker = updateAlertTracker(tracker, {
        isSmoothedBad: true,
        personDetected: true,
        alertThresholdSec,
        cooldownSec
      });
      expect(tracker.consecutiveBadSeconds).toBe(i);
      expect(tracker.shouldTriggerAlert).toBe(false);
      expect(tracker.totalAlerts).toBe(0);
    }

    // 5th bad second: alert triggers!
    tracker = updateAlertTracker(tracker, {
      isSmoothedBad: true,
      personDetected: true,
      alertThresholdSec,
      cooldownSec
    });
    expect(tracker.consecutiveBadSeconds).toBe(5);
    expect(tracker.shouldTriggerAlert).toBe(true);
    expect(tracker.totalAlerts).toBe(1);
    expect(tracker.cooldownRemainingSeconds).toBe(cooldownSec);
  });

  it('5. enforces cooldown: does not re-alert while cooldown is active, then alerts after cooldown expires', () => {
    let tracker = createInitialAlertTracker();
    const alertThresholdSec = 3;
    const cooldownSec = 5;

    // Run to threshold
    for (let i = 0; i < 3; i++) {
      tracker = updateAlertTracker(tracker, {
        isSmoothedBad: true,
        personDetected: true,
        alertThresholdSec,
        cooldownSec
      });
    }
    expect(tracker.shouldTriggerAlert).toBe(true);
    expect(tracker.totalAlerts).toBe(1);
    expect(tracker.cooldownRemainingSeconds).toBe(5);

    // Continue bad posture for 4 seconds during cooldown: should NOT trigger alert
    for (let i = 0; i < 4; i++) {
      tracker = updateAlertTracker(tracker, {
        isSmoothedBad: true,
        personDetected: true,
        alertThresholdSec,
        cooldownSec
      });
      expect(tracker.shouldTriggerAlert).toBe(false);
      expect(tracker.totalAlerts).toBe(1); // remains 1
    }
    expect(tracker.cooldownRemainingSeconds).toBe(1);

    // 5th tick: cooldown reaches 0
    tracker = updateAlertTracker(tracker, {
      isSmoothedBad: true,
      personDetected: true,
      alertThresholdSec,
      cooldownSec
    });
    expect(tracker.cooldownRemainingSeconds).toBe(0);

    // Next tick: cooldown is expired and posture is still bad -> re-alert fires!
    tracker = updateAlertTracker(tracker, {
      isSmoothedBad: true,
      personDetected: true,
      alertThresholdSec,
      cooldownSec
    });
    expect(tracker.shouldTriggerAlert).toBe(true);
    expect(tracker.totalAlerts).toBe(2);
  });

  it('6. resets consecutive bad seconds when smoothed posture becomes good', () => {
    let tracker = createInitialAlertTracker();

    // 10 bad seconds
    for (let i = 0; i < 10; i++) {
      tracker = updateAlertTracker(tracker, {
        isSmoothedBad: true,
        personDetected: true,
        alertThresholdSec: 20
      });
    }
    expect(tracker.consecutiveBadSeconds).toBe(10);

    // User sits upright: posture becomes good
    tracker = updateAlertTracker(tracker, {
      isSmoothedBad: false,
      personDetected: true,
      alertThresholdSec: 20
    });
    expect(tracker.consecutiveBadSeconds).toBe(0);
    expect(tracker.shouldTriggerAlert).toBe(false);
  });

  it('7. handles missing person: does NOT increment bad seconds and does NOT trigger alert', () => {
    let tracker = createInitialAlertTracker();

    // 3 bad seconds
    for (let i = 0; i < 3; i++) {
      tracker = updateAlertTracker(tracker, {
        isSmoothedBad: true,
        personDetected: true,
        alertThresholdSec: 5
      });
    }
    expect(tracker.consecutiveBadSeconds).toBe(3);

    // Person steps away: personDetected = false
    tracker = updateAlertTracker(tracker, {
      isSmoothedBad: true, // even if flag was stale
      personDetected: false,
      alertThresholdSec: 5
    });
    // Counter should not increment
    expect(tracker.consecutiveBadSeconds).toBe(3);
    expect(tracker.shouldTriggerAlert).toBe(false);
  });

  it('8. triggers camera movement warning only when condition persists for at least 10 seconds', () => {
    let tracker = createInitialCameraMovedTracker();

    // Condition met for 9 seconds: not triggered yet
    for (let i = 1; i <= 9; i++) {
      tracker = updateCameraMovedTracker(tracker, {
        isConditionMet: true,
        personDetected: true,
        minDurationSec: 10
      });
      expect(tracker.consecutiveSeconds).toBe(i);
      expect(tracker.isTriggered).toBe(false);
    }

    // 10th second: triggers camera moved warning!
    tracker = updateCameraMovedTracker(tracker, {
      isConditionMet: true,
      personDetected: true,
      minDurationSec: 10
    });
    expect(tracker.consecutiveSeconds).toBe(10);
    expect(tracker.isTriggered).toBe(true);

    // When condition ends (e.g. user recalibrates or camera moves back)
    tracker = updateCameraMovedTracker(tracker, {
      isConditionMet: false,
      personDetected: true,
      minDurationSec: 10
    });
    expect(tracker.consecutiveSeconds).toBe(0);
    expect(tracker.isTriggered).toBe(false);
  });

  it('9. camera movement tracker ignores ticks when no person is detected', () => {
    let tracker = createInitialCameraMovedTracker();
    tracker = updateCameraMovedTracker(tracker, {
      isConditionMet: true,
      personDetected: true,
      minDurationSec: 10
    });
    expect(tracker.consecutiveSeconds).toBe(1);

    // Missing person tick
    tracker = updateCameraMovedTracker(tracker, {
      isConditionMet: true,
      personDetected: false,
      minDurationSec: 10
    });
    expect(tracker.consecutiveSeconds).toBe(1);
  });
});
