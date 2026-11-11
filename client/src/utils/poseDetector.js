import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { MEDIAPIPE_CONFIG } from './config.js';

let landmarkerInstance = null;
let initPromise = null;

/**
 * Initializes and caches the MediaPipe PoseLandmarker in VIDEO running mode.
 * Falls back to CPU delegate if GPU delegate is not supported by browser environment.
 */
export async function getPoseLandmarker() {
  if (landmarkerInstance) {
    return landmarkerInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_CONFIG.WASM_PATH);

    try {
      // First try GPU delegate for optimal performance
      landmarkerInstance = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MEDIAPIPE_CONFIG.MODEL_URL,
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numPoses: 1
      });
      return landmarkerInstance;
    } catch (gpuError) {
      console.warn('GPU delegate failed for PoseLandmarker, falling back to CPU:', gpuError);
      landmarkerInstance = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MEDIAPIPE_CONFIG.MODEL_URL,
          delegate: 'CPU'
        },
        runningMode: 'VIDEO',
        numPoses: 1
      });
      return landmarkerInstance;
    }
  })();

  return initPromise;
}

/**
 * Runs pose detection on an active HTML5 video element.
 * MediaPipe detectForVideo requires strictly monotonically increasing timestampMs.
 *
 * @param {PoseLandmarker} landmarker
 * @param {HTMLVideoElement} videoElement
 * @param {number} timestampMs Monotonically increasing timestamp (performance.now())
 * @returns {Array|null} Array of landmarks for pose 0, or null if no person is detected
 */
export function detectPoseInVideo(landmarker, videoElement, timestampMs) {
  if (!landmarker || !videoElement || videoElement.readyState < 2) {
    return null;
  }

  try {
    const result = landmarker.detectForVideo(videoElement, timestampMs);
    if (result && result.landmarks && result.landmarks.length > 0) {
      return result.landmarks[0];
    }
    return null;
  } catch (err) {
    console.error('Error during detectForVideo:', err);
    return null;
  }
}

/**
 * Draws shoulder line and keypoints on the overlay canvas.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Object} rawPoints Raw normalized coordinates { nose, leftShoulder, rightShoulder }
 * @param {boolean} isBad Whether current posture is bad (changes color)
 */
export function drawSkeletonOverlay(canvas, rawPoints, isBad = false) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!rawPoints || !rawPoints.nose || !rawPoints.leftShoulder || !rawPoints.rightShoulder) {
    return;
  }

  const { nose, leftShoulder, rightShoulder } = rawPoints;
  const w = canvas.width;
  const h = canvas.height;

  const nX = nose.x * w;
  const nY = nose.y * h;
  const lsX = leftShoulder.x * w;
  const lsY = leftShoulder.y * h;
  const rsX = rightShoulder.x * w;
  const rsY = rightShoulder.y * h;
  const midX = (lsX + rsX) / 2;
  const midY = (lsY + rsY) / 2;

  // Refined health-tech palette: #DC5656 for bad posture, #16A36A for good posture
  const mainColor = isBad ? '#DC5656' : '#16A36A';
  const accentColor = isBad ? '#F87171' : '#34D399';

  ctx.lineWidth = 3;
  ctx.strokeStyle = mainColor;

  // Draw shoulder bar
  ctx.beginPath();
  ctx.moveTo(lsX, lsY);
  ctx.lineTo(rsX, rsY);
  ctx.stroke();

  // Draw dashed neck line (midpoint to nose)
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = accentColor;
  ctx.beginPath();
  ctx.moveTo(midX, midY);
  ctx.lineTo(nX, nY);
  ctx.stroke();
  ctx.restore();

  // Draw keypoints
  const points = [
    { x: nX, y: nY, label: 'Nose' },
    { x: lsX, y: lsY, label: 'Left Shoulder' },
    { x: rsX, y: rsY, label: 'Right Shoulder' }
  ];

  for (const pt of points) {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 6, 0, 2 * Math.PI);
    ctx.fillStyle = mainColor;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }
}
