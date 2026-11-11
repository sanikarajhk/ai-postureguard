// PostureGuard detection and feature thresholds configuration
export const POSTURE_CONFIG = {
  // Head drop threshold: bad posture if noseHeight falls below 85% of calibrated baseline
  NOSE_HEIGHT_FACTOR: 0.85,

  // Leaning forward threshold: bad posture if shoulderWidth exceeds 115% of calibrated baseline
  SHOULDER_WIDTH_FACTOR: 1.15,

  // Shoulder tilt threshold: bad posture if shoulder tilt deviates by more than 8.0 degrees
  SHOULDER_TILT_MAX_DIFF_DEG: 8.0,

  // Lateral head offset threshold relative to shoulder width
  HEAD_OFFSET_MAX_DIFF: 0.15,

  // Baseline calibration duration in seconds
  CALIBRATION_DURATION_SEC: 5,

  // Posture score boundary for good vs bad posture
  SCORE_BAD_THRESHOLD: 70,

  // Camera moved warning thresholds:
  // Triggered when tilt or width shifts significantly while noseHeight remains near baseline
  CAMERA_MOVED_MIN_DURATION_SEC: 10,
  CAMERA_MOVED_NOSE_TOLERANCE_FACTOR: 0.12, // within 12% of baseline noseHeight
  CAMERA_MOVED_TILT_DIFF_DEG: 12.0,        // tilt shifted >= 12 degrees
  CAMERA_MOVED_WIDTH_DIFF_FACTOR: 1.25,     // width scaled by >= 25%

  // Moving average window size for smoothing
  MOVING_AVERAGE_WINDOW: 5,

  // Default alert timings
  DEFAULT_ALERT_AFTER_SECONDS: 20,
  ALERT_COOLDOWN_SECONDS: 60,
  DEFAULT_BREAK_EVERY_MINUTES: 45
};

// Official MediaPipe Pose Landmarker Lite model URL & CDN
export const MEDIAPIPE_CONFIG = {
  WASM_PATH: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
  MODEL_URL: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
};
