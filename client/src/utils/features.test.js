import { describe, it, expect } from 'vitest';
import {
  extractFeatures,
  isBadPosture,
  calculatePostureScore,
  calculateBaselineAverage,
  checkCameraMovedCondition
} from './features.js';
import { POSTURE_CONFIG } from './config.js';

describe('features.js - Core Posture Analysis', () => {
  // Mock standard upright sitting posture landmarks
  const mockUprightLandmarks = [
    { x: 0.5, y: 0.3, visibility: 0.99 }, // 0: Nose
    ...Array(10).fill({ x: 0, y: 0, visibility: 0 }),
    { x: 0.3, y: 0.6, visibility: 0.99 }, // 11: Left shoulder
    { x: 0.7, y: 0.6, visibility: 0.99 }  // 12: Right shoulder
  ];

  it('1. extracts posture features accurately for upright posture', () => {
    const features = extractFeatures(mockUprightLandmarks);
    expect(features).not.toBeNull();

    // dx = 0.7 - 0.3 = 0.4, dy = 0.6 - 0.6 = 0
    expect(features.shoulderWidth).toBeCloseTo(0.4, 4);
    expect(features.shoulderTilt).toBeCloseTo(0, 4);

    // midX = 0.5, midY = 0.6
    // noseHeight = (0.6 - 0.3) / 0.4 = 0.3 / 0.4 = 0.75
    expect(features.noseHeight).toBeCloseTo(0.75, 4);
    expect(features.headOffset).toBeCloseTo(0, 4);
  });

  it('2. detects head drop as bad posture when noseHeight < 85% of baseline', () => {
    const baseline = {
      noseHeight: 0.75,
      shoulderWidth: 0.4,
      shoulderTilt: 0,
      headOffset: 0
    };

    // Slouched posture: head drops (nose y goes down to 0.42 -> noseHeight = (0.6 - 0.42)/0.4 = 0.45)
    // 0.45 < 0.75 * 0.85 (= 0.6375)
    const slouchedLandmarks = [
      { x: 0.5, y: 0.42, visibility: 0.99 },
      ...Array(10).fill({ x: 0, y: 0, visibility: 0 }),
      { x: 0.3, y: 0.6, visibility: 0.99 },
      { x: 0.7, y: 0.6, visibility: 0.99 }
    ];

    const currentFeatures = extractFeatures(slouchedLandmarks);
    const evaluation = isBadPosture(currentFeatures, baseline);
    expect(evaluation.isBad).toBe(true);
    expect(evaluation.reasons[0]).toContain('Head dropped');

    const score = calculatePostureScore(currentFeatures, baseline);
    expect(score).toBeLessThan(70);
  });

  it('3. detects leaning forward as bad posture when shoulderWidth > 115% of baseline', () => {
    const baseline = {
      noseHeight: 0.75,
      shoulderWidth: 0.4,
      shoulderTilt: 0,
      headOffset: 0
    };

    // Leaning forward: shoulders appear wider (dx = 0.5 vs baseline 0.4)
    // noseHeight preserved at 0.75: (0.6 - 0.225) / 0.5 = 0.75
    const leaningLandmarks = [
      { x: 0.5, y: 0.225, visibility: 0.99 },
      ...Array(10).fill({ x: 0, y: 0, visibility: 0 }),
      { x: 0.25, y: 0.6, visibility: 0.99 },
      { x: 0.75, y: 0.6, visibility: 0.99 }
    ];

    const currentFeatures = extractFeatures(leaningLandmarks);
    const evaluation = isBadPosture(currentFeatures, baseline);
    expect(evaluation.isBad).toBe(true);
    expect(evaluation.reasons).toEqual(expect.arrayContaining([expect.stringContaining('Leaning forward')]));

    const score = calculatePostureScore(currentFeatures, baseline);
    expect(score).toBeLessThan(70);
  });

  it('4. detects shoulder tilt as bad posture when |tilt - baseline| > 8 degrees', () => {
    const baseline = {
      noseHeight: 0.75,
      shoulderWidth: 0.4,
      shoulderTilt: 0,
      headOffset: 0
    };

    // Tilted shoulders: left shoulder higher (y=0.55), right shoulder lower (y=0.65)
    const tiltedLandmarks = [
      { x: 0.5, y: 0.3, visibility: 0.99 },
      ...Array(10).fill({ x: 0, y: 0, visibility: 0 }),
      { x: 0.3, y: 0.55, visibility: 0.99 },
      { x: 0.7, y: 0.65, visibility: 0.99 }
    ];

    const currentFeatures = extractFeatures(tiltedLandmarks);
    const evaluation = isBadPosture(currentFeatures, baseline);
    expect(evaluation.isBad).toBe(true);
    expect(evaluation.reasons).toEqual(expect.arrayContaining([expect.stringContaining('Shoulders tilted')]));
  });

  it('5. scores 100 when current features equal baseline and scales smoothly', () => {
    const baseline = {
      noseHeight: 0.75,
      shoulderWidth: 0.4,
      shoulderTilt: 0,
      headOffset: 0
    };
    const uprightFeatures = extractFeatures(mockUprightLandmarks);
    const perfectScore = calculatePostureScore(uprightFeatures, baseline);
    expect(perfectScore).toBe(100);

    // Minor deviation below bad threshold produces score between 70 and 100
    const minorDeviationFeatures = {
      noseHeight: 0.70, // small drop (allowed threshold is 0.6375)
      shoulderWidth: 0.41,
      shoulderTilt: 2.0,
      headOffset: 0.02
    };
    const score = calculatePostureScore(minorDeviationFeatures, baseline);
    expect(score).toBeGreaterThanOrEqual(70);
    expect(score).toBeLessThan(100);
  });

  it('6. calculates baseline feature averaging accurately and ignores missing/null samples', () => {
    const samples = [
      { shoulderWidth: 0.40, shoulderTilt: 0.0, noseHeight: 0.70, headOffset: 0.0 },
      null, // invalid tick
      { shoulderWidth: 0.42, shoulderTilt: 2.0, noseHeight: 0.72, headOffset: 0.02 },
      undefined,
      { shoulderWidth: 0.38, shoulderTilt: -2.0, noseHeight: 0.68, headOffset: -0.02 }
    ];

    const baseline = calculateBaselineAverage(samples);
    expect(baseline).not.toBeNull();
    expect(baseline.sampleCount).toBe(3);
    // Average width = (0.40 + 0.42 + 0.38) / 3 = 0.40
    expect(baseline.shoulderWidth).toBeCloseTo(0.40, 4);
    // Average tilt = (0 + 2 - 2) / 3 = 0
    expect(baseline.shoulderTilt).toBeCloseTo(0, 4);
    // Average noseHeight = (0.70 + 0.72 + 0.68) / 3 = 0.70
    expect(baseline.noseHeight).toBeCloseTo(0.70, 4);
    expect(baseline.headOffset).toBeCloseTo(0, 4);
  });

  it('7. returns null when calibration samples contain no valid detections', () => {
    const emptySamples = [null, undefined, { invalid: 'data' }];
    expect(calculateBaselineAverage(emptySamples)).toBeNull();
    expect(calculateBaselineAverage([])).toBeNull();
  });

  it('8. detects camera movement when tilt or width shifts while noseHeight stays near baseline', () => {
    const baseline = {
      noseHeight: 0.75,
      shoulderWidth: 0.4,
      shoulderTilt: 0,
      headOffset: 0
    };

    // Camera tilted by 14 degrees, but noseHeight remains at 0.75 (head didn't drop relative to shoulders)
    const tiltedCameraFeatures = {
      noseHeight: 0.75,
      shoulderWidth: 0.4,
      shoulderTilt: 14.0, // >= 12 deg
      headOffset: 0
    };
    expect(checkCameraMovedCondition(tiltedCameraFeatures, baseline)).toBe(true);

    // Normal slouch (head dropped): should NOT trigger camera movement
    const slouchedFeatures = {
      noseHeight: 0.50, // head dropped significantly (> 12% difference)
      shoulderWidth: 0.4,
      shoulderTilt: 14.0,
      headOffset: 0
    };
    expect(checkCameraMovedCondition(slouchedFeatures, baseline)).toBe(false);
  });
});
