import { POSTURE_CONFIG } from './config.js';

/**
 * Extracts posture features from MediaPipe Pose landmarks (normalized coordinates).
 * Landmarks needed:
 *   - 0: nose
 *   - 11: left_shoulder
 *   - 12: right_shoulder
 *
 * @param {Array<{x: number, y: number, z?: number, visibility?: number}>} landmarks
 * @returns {Object|null} Extracted features or null if landmarks are missing/invalid
 */
export function extractFeatures(landmarks) {
  if (!landmarks || landmarks.length < 13) return null;

  const nose = landmarks[0];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];

  if (!nose || !leftShoulder || !rightShoulder) return null;

  // Check visibility if provided by model
  if (
    (nose.visibility !== undefined && nose.visibility < 0.5) ||
    (leftShoulder.visibility !== undefined && leftShoulder.visibility < 0.5) ||
    (rightShoulder.visibility !== undefined && rightShoulder.visibility < 0.5)
  ) {
    return null;
  }

  // 1. Shoulder width: 2D Euclidean distance between left and right shoulders
  const dx = rightShoulder.x - leftShoulder.x;
  const dy = rightShoulder.y - leftShoulder.y;
  const shoulderWidth = Math.hypot(dx, dy);

  // Avoid division by zero if shoulders coincide
  if (shoulderWidth < 0.001) return null;

  // 2. Shoulder tilt in degrees relative to horizontal
  const shoulderTilt = Math.atan2(dy, dx) * (180 / Math.PI);

  // 3. Midpoint of shoulder line
  const midX = (leftShoulder.x + rightShoulder.x) / 2;
  const midY = (leftShoulder.y + rightShoulder.y) / 2;

  // 4. Nose height relative to shoulder midpoint, normalized by shoulder width.
  // Note: in 2D image coordinates, y=0 is at the top of the frame.
  // When sitting upright, the nose is above the shoulders (nose.y < midY),
  // so (midY - nose.y) is positive. Normalizing by shoulderWidth makes it scale-invariant.
  const noseHeight = (midY - nose.y) / shoulderWidth;

  // 5. Head lateral offset relative to shoulder midpoint, normalized by shoulder width.
  const headOffset = (nose.x - midX) / shoulderWidth;

  return {
    noseHeight,
    shoulderWidth,
    shoulderTilt,
    headOffset,
    raw: {
      nose: { x: nose.x, y: nose.y },
      leftShoulder: { x: leftShoulder.x, y: leftShoulder.y },
      rightShoulder: { x: rightShoulder.x, y: rightShoulder.y }
    }
  };
}

/**
 * Calculates the mean average of a collection of valid posture feature samples.
 * Used during 5-second calibration to establish an upright baseline.
 * Handles missing or invalid samples by filtering them out.
 *
 * @param {Array<Object|null>} samples Array of feature objects collected during calibration
 * @returns {Object|null} Calibrated baseline object or null if no valid samples
 */
export function calculateBaselineAverage(samples) {
  if (!Array.isArray(samples)) return null;

  const validSamples = samples.filter(
    (s) =>
      s &&
      typeof s.shoulderWidth === 'number' &&
      !isNaN(s.shoulderWidth) &&
      typeof s.shoulderTilt === 'number' &&
      !isNaN(s.shoulderTilt) &&
      typeof s.noseHeight === 'number' &&
      !isNaN(s.noseHeight) &&
      typeof s.headOffset === 'number' &&
      !isNaN(s.headOffset)
  );

  if (validSamples.length === 0) return null;

  const count = validSamples.length;
  const sum = validSamples.reduce(
    (acc, sample) => {
      acc.shoulderWidth += sample.shoulderWidth;
      acc.shoulderTilt += sample.shoulderTilt;
      acc.noseHeight += sample.noseHeight;
      acc.headOffset += sample.headOffset;
      return acc;
    },
    { shoulderWidth: 0, shoulderTilt: 0, noseHeight: 0, headOffset: 0 }
  );

  return {
    shoulderWidth: sum.shoulderWidth / count,
    shoulderTilt: sum.shoulderTilt / count,
    noseHeight: sum.noseHeight / count,
    headOffset: sum.headOffset / count,
    sampleCount: count
  };
}

/**
 * Compares current features against a calibrated baseline to determine if posture is bad.
 *
 * Bad posture criteria (per spec):
 *  - noseHeight < baseline.noseHeight * 0.85 (head dropped)
 *  - shoulderWidth > baseline.shoulderWidth * 1.15 (leaning forward toward screen)
 *  - |shoulderTilt - baseline.shoulderTilt| > 8.0 degrees (slouching sideways)
 *
 * @param {Object} features Current posture features
 * @param {Object} baseline Calibrated baseline posture features
 * @param {Object} [config=POSTURE_CONFIG] Threshold configuration
 * @returns {{ isBad: boolean, reasons: string[] }}
 */
export function isBadPosture(features, baseline, config = POSTURE_CONFIG) {
  if (!features || !baseline) {
    return { isBad: false, reasons: [] };
  }

  const reasons = [];

  // Check 1: Head drop
  const minNoseHeight = baseline.noseHeight * config.NOSE_HEIGHT_FACTOR;
  if (features.noseHeight < minNoseHeight) {
    reasons.push('Head dropped (nose height low)');
  }

  // Check 2: Leaning forward
  const maxShoulderWidth = baseline.shoulderWidth * config.SHOULDER_WIDTH_FACTOR;
  if (features.shoulderWidth > maxShoulderWidth) {
    reasons.push('Leaning forward (shoulder width expanded)');
  }

  // Check 3: Shoulder tilt
  const tiltDiff = Math.abs(features.shoulderTilt - baseline.shoulderTilt);
  if (tiltDiff > config.SHOULDER_TILT_MAX_DIFF_DEG) {
    reasons.push(`Shoulders tilted (${tiltDiff.toFixed(1)}° deviation)`);
  }

  return {
    isBad: reasons.length > 0,
    reasons
  };
}

/**
 * Calculates a 0-100 posture score relative to baseline.
 *
 * SCORING FORMULA:
 * - Each feature's deviation is normalized by its threshold tolerance:
 *     ratio = (observed deviation) / (allowed deviation threshold)
 *   When ratio = 0.0, posture perfectly matches baseline -> Score 100.
 *   When ratio = 1.0, posture is at the exact threshold boundary of bad posture -> Score 70.
 *   When ratio > 1.0, posture degrades further -> Score drops below 70 down to 0.
 *
 * Formula:
 *   worstDeviation = max(headDropRatio, leanRatio, tiltRatio, lateralShiftRatio)
 *   score = Math.max(0, Math.min(100, Math.round(100 - worstDeviation * 30)))
 *
 * Note: This score is a heuristic geometric deviation indicator and does not
 * claim to represent medically validated posture quality.
 *
 * @param {Object} features Current posture features
 * @param {Object} baseline Calibrated baseline features
 * @param {Object} [config=POSTURE_CONFIG] Threshold configuration
 * @returns {number} Score between 0 and 100
 */
export function calculatePostureScore(features, baseline, config = POSTURE_CONFIG) {
  if (!features || !baseline) return 100;

  // Head drop deviation ratio (only penalized if head drops below baseline)
  const noseDropThreshold = baseline.noseHeight * (1 - config.NOSE_HEIGHT_FACTOR);
  const noseDrop = baseline.noseHeight - features.noseHeight;
  const rNose = noseDrop > 0 && noseDropThreshold > 0 ? noseDrop / noseDropThreshold : 0;

  // Lean forward deviation ratio (only penalized if shoulder width increases)
  const widthExpandThreshold = baseline.shoulderWidth * (config.SHOULDER_WIDTH_FACTOR - 1);
  const widthExpand = features.shoulderWidth - baseline.shoulderWidth;
  const rWidth = widthExpand > 0 && widthExpandThreshold > 0 ? widthExpand / widthExpandThreshold : 0;

  // Tilt deviation ratio
  const tiltDiff = Math.abs(features.shoulderTilt - baseline.shoulderTilt);
  const rTilt = tiltDiff / config.SHOULDER_TILT_MAX_DIFF_DEG;

  // Head lateral shift deviation ratio
  const offsetDiff = Math.abs(features.headOffset - (baseline.headOffset || 0));
  const rOffset = offsetDiff / config.HEAD_OFFSET_MAX_DIFF;

  // Take the worst deviation ratio among all metrics
  const maxDeviation = Math.max(rNose, rWidth, rTilt, rOffset);

  // Map deviation to 0-100 score:
  // At maxDeviation = 0 -> 100
  // At maxDeviation = 1 -> 70 (boundary of bad posture)
  // At maxDeviation = 3.33 -> 0
  const score = Math.round(100 - maxDeviation * 30);
  return Math.max(0, Math.min(100, score));
}

/**
 * Checks whether current features indicate possible camera movement rather than human slouching.
 *
 * Condition:
 * 1. shoulderTilt or shoulderWidth shifts significantly from baseline (camera rotated or moved distance).
 * 2. noseHeight remains reasonably close to baseline (head has NOT dropped relative to shoulders).
 *
 * @param {Object} features
 * @param {Object} baseline
 * @param {Object} [config=POSTURE_CONFIG]
 * @returns {boolean}
 */
export function checkCameraMovedCondition(features, baseline, config = POSTURE_CONFIG) {
  if (!features || !baseline) return false;

  const noseDiff = Math.abs(features.noseHeight - baseline.noseHeight);
  const maxAllowedNoseDiff = baseline.noseHeight * config.CAMERA_MOVED_NOSE_TOLERANCE_FACTOR;
  const isNoseNearBaseline = noseDiff <= maxAllowedNoseDiff;

  const tiltDiff = Math.abs(features.shoulderTilt - baseline.shoulderTilt);
  const isTiltShifted = tiltDiff >= config.CAMERA_MOVED_TILT_DIFF_DEG;

  const isWidthShifted =
    features.shoulderWidth >= baseline.shoulderWidth * config.CAMERA_MOVED_WIDTH_DIFF_FACTOR ||
    features.shoulderWidth <= baseline.shoulderWidth / config.CAMERA_MOVED_WIDTH_DIFF_FACTOR;

  return isNoseNearBaseline && (isTiltShifted || isWidthShifted);
}
