import React, { useEffect, useRef, useState, useCallback } from 'react';
import { usePostureStore } from '../store/usePostureStore.js';
import { getPoseLandmarker, detectPoseInVideo, drawSkeletonOverlay } from '../utils/poseDetector.js';
import {
  extractFeatures,
  isBadPosture,
  calculatePostureScore,
  calculateBaselineAverage,
  checkCameraMovedCondition
} from '../utils/features.js';
import {
  calculateMovingAverage,
  getSmoothedPostureState,
  createInitialAlertTracker,
  updateAlertTracker,
  createInitialCameraMovedTracker,
  updateCameraMovedTracker
} from '../utils/smoothing.js';
import {
  requestNotificationPermission,
  sendBrowserNotification,
  playAlertChime,
  isNotificationSupported
} from '../utils/notifications.js';
import { POSTURE_CONFIG } from '../utils/config.js';

// Development-only diagnostic logging helper
const isDev = Boolean(import.meta.env?.DEV);
function diagLog(event, data) {
  if (isDev) {
    if (data !== undefined) {
      console.log(`[PostureGuard Diagnostic] ${event}`, data);
    } else {
      console.log(`[PostureGuard Diagnostic] ${event}`);
    }
  }
}

export default function SessionPage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const workerRef = useRef(null);
  const landmarkerRef = useRef(null);
  const streamRef = useRef(null);

  // Store state and actions
  const {
    baseline,
    setBaseline,
    clearBaseline,
    settings,
    updateSettings,
    startSession,
    stopSession,
    tickSession,
    sessionDurationSec,
    goodSec,
    badSec,
    alertsCount,
    currentScore,
    smoothedScore,
    postureState,
    badReasons,
    isCameraMoved,
    breakReminderActive,
    dismissBreakReminder,
    sessionSummary,
    dismissSummary
  } = usePostureStore();

  // Local camera & detection states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [detectionStatus, setDetectionStatus] = useState('Camera off');
  const [notificationPermission, setNotificationPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported'
  );

  // Calibration state (State for UI renders + Refs to avoid stale closures)
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibSecondsRemaining, setCalibSecondsRemaining] = useState(POSTURE_CONFIG.CALIBRATION_DURATION_SEC);
  const [calibrationMessage, setCalibrationMessage] = useState(null);
  const isCalibratingRef = useRef(false);
  const calibSecondsRemainingRef = useRef(POSTURE_CONFIG.CALIBRATION_DURATION_SEC);
  const calibSamplesRef = useRef([]);

  // Trackers
  const alertTrackerRef = useRef(createInitialAlertTracker());
  const cameraMovedTrackerRef = useRef(createInitialCameraMovedTracker());
  const scoresHistoryRef = useRef([]);

  // Mutable ref to always point to the freshest handleWorkerTick function
  const handleWorkerTickRef = useRef(null);

  // Clean up all resources
  const stopCameraAndWorker = useCallback(() => {
    isCalibratingRef.current = false;
    setIsCalibrating(false);

    if (workerRef.current) {
      workerRef.current.postMessage({ action: 'stop' });
      workerRef.current.terminate();
      workerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    setIsCameraActive(false);
    setDetectionStatus('Camera off');
  }, []);

  useEffect(() => {
    return () => {
      stopCameraAndWorker();
    };
  }, [stopCameraAndWorker]);

  // Start webcam and load MediaPipe Pose model
  const startCamera = async () => {
    try {
      setCameraError(null);
      setModelLoading(true);
      setDetectionStatus('Loading MediaPipe model...');

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise((resolve) => {
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play();
            resolve();
          };
        });
      }

      const landmarker = await getPoseLandmarker();
      landmarkerRef.current = landmarker;
      setModelLoading(false);
      setIsCameraActive(true);
      setDetectionStatus('Camera ready');

      // Start dedicated Web Worker loop
      const worker = new Worker(
        new URL('../workers/timer.worker.js', import.meta.url),
        { type: 'module' }
      );
      workerRef.current = worker;

      worker.onmessage = (event) => {
        if (event.data?.type === 'tick') {
          handleWorkerTickRef.current?.();
        }
      };

      worker.postMessage({ action: 'start', interval: 1000 });
    } catch (err) {
      console.error('Error starting camera:', err);
      let errorMsg = 'Unable to access webcam or initialize pose model.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = 'Camera permission was denied. Please allow camera access in your browser settings to use PostureGuard.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = 'No camera found. Please connect a webcam and try again.';
      }
      setCameraError(errorMsg);
      setModelLoading(false);
      stopCameraAndWorker();
    }
  };

  // Calibration Finalizer
  const finishCalibration = useCallback(() => {
    isCalibratingRef.current = false;
    setIsCalibrating(false);

    const samples = calibSamplesRef.current;
    diagLog('Calibration completed.');

    // Require at least 2 valid samples over the 5 seconds
    if (samples.length < 2) {
      diagLog('Calibration failed, reason: Insufficient valid posture samples collected.');
      setCalibrationMessage({
        type: 'error',
        text: 'Unable to detect your posture. Please sit in front of the camera and try again.'
      });
      return;
    }

    const computedBaseline = calculateBaselineAverage(samples);
    const isValid =
      computedBaseline &&
      Number.isFinite(computedBaseline.shoulderWidth) &&
      computedBaseline.shoulderWidth > 0.001 &&
      Number.isFinite(computedBaseline.shoulderTilt) &&
      Number.isFinite(computedBaseline.noseHeight) &&
      Number.isFinite(computedBaseline.headOffset);

    if (isValid) {
      diagLog('Baseline calculated:', computedBaseline);
      setBaseline(computedBaseline);
      diagLog('Baseline saved.');
      setCalibrationMessage({
        type: 'success',
        text: 'Calibration complete. Your posture baseline has been saved.'
      });
      // Reset session trackers
      alertTrackerRef.current = createInitialAlertTracker();
      cameraMovedTrackerRef.current = createInitialCameraMovedTracker();
      scoresHistoryRef.current = [];
    } else {
      diagLog('Calibration failed, reason: Baseline calculation produced invalid numbers.');
      setCalibrationMessage({
        type: 'error',
        text: 'Unable to detect your posture. Please sit in front of the camera and try again.'
      });
    }
  }, [setBaseline]);

  // Main per-second tick handler
  const handleWorkerTick = useCallback(() => {
    diagLog('Worker tick received.');

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;

    if (!video || !landmarker || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    // Run MediaPipe detection
    const landmarks = detectPoseInVideo(landmarker, video, performance.now());
    const personDetected = Boolean(landmarks && landmarks.length >= 13);

    // Extract posture features
    let features = null;
    if (personDetected) {
      features = extractFeatures(landmarks);
      if (features) {
        const isValid =
          Number.isFinite(features.shoulderWidth) &&
          features.shoulderWidth > 0.001 &&
          Number.isFinite(features.shoulderTilt) &&
          Number.isFinite(features.noseHeight) &&
          Number.isFinite(features.headOffset);

        if (!isValid) {
          features = null;
        }
      }
    }

    // 1. ACTIVE CALIBRATION FLOW
    if (isCalibratingRef.current) {
      if (features) {
        calibSamplesRef.current.push(features);
        diagLog('Valid calibration sample collected.');
      } else {
        diagLog('Calibration tick had no valid person/features. Sample skipped.');
      }

      const nextRemaining = calibSecondsRemainingRef.current - 1;
      calibSecondsRemainingRef.current = nextRemaining;
      setCalibSecondsRemaining(Math.max(0, nextRemaining));

      // Draw skeleton overlay during calibration
      if (canvas) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        if (features) {
          drawSkeletonOverlay(canvas, features.raw, false);
        } else {
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }

      if (nextRemaining <= 0) {
        finishCalibration();
      }
      return;
    }

    // 2. NORMAL MONITORING / SESSION FLOW
    if (!personDetected || !features) {
      setDetectionStatus("Can't see you");
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    setDetectionStatus('Tracking');

    const liveState = usePostureStore.getState();
    const currentBaseline = liveState.baseline;
    const isSessionActive = liveState.isSessionActive;

    let isBad = false;
    let reasons = [];
    let rawScore = 100;
    let smoothedVal = 100;
    let cameraMovedTriggered = false;

    if (currentBaseline) {
      // Check camera movement condition
      const isCamConditionMet = checkCameraMovedCondition(features, currentBaseline, POSTURE_CONFIG);
      cameraMovedTrackerRef.current = updateCameraMovedTracker(
        cameraMovedTrackerRef.current,
        {
          isConditionMet: isCamConditionMet,
          personDetected: true,
          minDurationSec: POSTURE_CONFIG.CAMERA_MOVED_MIN_DURATION_SEC
        }
      );
      cameraMovedTriggered = cameraMovedTrackerRef.current.isTriggered;

      // If camera moved is detected, do NOT penalize as bad posture
      if (cameraMovedTriggered) {
        isBad = false;
        rawScore = 100;
      } else {
        const evalResult = isBadPosture(features, currentBaseline, POSTURE_CONFIG);
        isBad = evalResult.isBad;
        reasons = evalResult.reasons;
        rawScore = calculatePostureScore(features, currentBaseline, POSTURE_CONFIG);
      }

      // Add to rolling scores history for smoothing
      scoresHistoryRef.current.push(rawScore);
      smoothedVal = calculateMovingAverage(
        scoresHistoryRef.current,
        POSTURE_CONFIG.MOVING_AVERAGE_WINDOW
      ) ?? rawScore;

      const smoothedState = getSmoothedPostureState(smoothedVal, POSTURE_CONFIG.SCORE_BAD_THRESHOLD);
      const isSmoothedBad = smoothedState === 'bad';

      // Update Continuous Bad Posture Alert Tracker
      const currentSettings = liveState.settings;
      alertTrackerRef.current = updateAlertTracker(alertTrackerRef.current, {
        isSmoothedBad,
        personDetected: true,
        alertThresholdSec: currentSettings.alertAfterSeconds,
        cooldownSec: POSTURE_CONFIG.ALERT_COOLDOWN_SECONDS
      });

      const shouldAlert = alertTrackerRef.current.shouldTriggerAlert;

      if (shouldAlert && isSessionActive) {
        if (currentSettings.notificationsEnabled) {
          sendBrowserNotification('Posture Alert', {
            body: `You've been slouching for ${currentSettings.alertAfterSeconds} continuous seconds. Straighten up!`
          });
        }
        if (currentSettings.soundEnabled) {
          playAlertChime();
        }
      }

      // Check Break Reminder (every breakEveryMinutes)
      const currentDuration = liveState.sessionDurationSec;
      const breakIntervalSec = currentSettings.breakEveryMinutes * 60;
      const triggerBreak =
        isSessionActive &&
        currentDuration > 0 &&
        currentDuration % breakIntervalSec === 0;

      if (triggerBreak) {
        if (currentSettings.notificationsEnabled) {
          sendBrowserNotification('Break Reminder', {
            body: `Time for a quick stretch! You've been sitting for ${currentSettings.breakEveryMinutes} minutes.`
          });
        }
        if (currentSettings.soundEnabled) {
          playAlertChime();
        }
      }

      // Update session store if session is active
      if (isSessionActive) {
        tickSession({
          isGood: !isSmoothedBad,
          rawScore,
          smoothedScore: smoothedVal,
          reasons,
          isCameraMoved: cameraMovedTriggered,
          shouldAlert,
          triggerBreak
        });
      }
    }

    if (canvas) {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      drawSkeletonOverlay(canvas, features.raw, isBad);
    }
  }, [finishCalibration, tickSession]);

  // Keep handleWorkerTickRef synchronized on every render
  useEffect(() => {
    handleWorkerTickRef.current = handleWorkerTick;
  });

  // Calibration Trigger
  const handleStartCalibration = () => {
    if (!isCameraActive || isCalibratingRef.current) return;
    if (!videoRef.current || videoRef.current.readyState < 2) {
      setCalibrationMessage({
        type: 'error',
        text: 'Camera is not ready yet. Please wait a moment.'
      });
      return;
    }

    diagLog('Calibration started.');
    calibSamplesRef.current = [];
    calibSecondsRemainingRef.current = POSTURE_CONFIG.CALIBRATION_DURATION_SEC;
    setCalibSecondsRemaining(POSTURE_CONFIG.CALIBRATION_DURATION_SEC);
    setCalibrationMessage(null);
    isCalibratingRef.current = true;
    setIsCalibrating(true);
  };

  // Notification Permission Request
  const handleEnableNotifications = async () => {
    const perm = await requestNotificationPermission();
    setNotificationPermission(perm);
    if (perm === 'granted') {
      updateSettings({ notificationsEnabled: true });
      sendBrowserNotification('PostureGuard Notifications Active', {
        body: 'You will receive subtle desktop alerts when bad posture lasts too long.'
      });
    } else {
      updateSettings({ notificationsEnabled: false });
    }
  };

  // Session Handlers
  const handleStartSession = () => {
    if (!baseline || isCalibratingRef.current) return;
    alertTrackerRef.current = createInitialAlertTracker();
    cameraMovedTrackerRef.current = createInitialCameraMovedTracker();
    scoresHistoryRef.current = [];
    startSession();
  };

  const handleStopSession = () => {
    stopSession();
  };

  // Format seconds to MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isSessionRunning = usePostureStore((state) => state.isSessionActive);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Top Banners: Break reminder & Camera movement */}
      {breakReminderActive && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-xl flex items-center justify-between gap-4 transition shadow-xs">
          <div className="flex items-center gap-3">
            <span className="text-amber-700 text-base">☕</span>
            <div>
              <p className="text-xs font-semibold">Time for a short break</p>
              <p className="text-xs text-amber-700">
                You have been sitting for {settings.breakEveryMinutes} minutes. Stand up, stretch, and relax your eyes.
              </p>
            </div>
          </div>
          <button
            onClick={dismissBreakReminder}
            className="px-3 py-1 bg-white hover:bg-amber-100/60 border border-amber-300 text-amber-800 text-xs font-medium rounded-lg transition cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {isCameraMoved && (
        <div className="bg-sky-50 border border-sky-200 text-sky-900 px-4 py-3 rounded-xl flex items-center justify-between gap-4 transition shadow-xs">
          <div className="flex items-center gap-3">
            <span className="text-sky-600 text-base">📷</span>
            <div>
              <p className="text-xs font-semibold">Camera position changed</p>
              <p className="text-xs text-sky-700">
                A sudden shift in shoulder angle/distance was detected without head drop. Please recalibrate your baseline.
              </p>
            </div>
          </div>
          <button
            onClick={handleStartCalibration}
            disabled={isCalibrating}
            className="px-3 py-1 bg-white hover:bg-sky-100/60 border border-sky-300 text-sky-800 text-xs font-medium rounded-lg transition cursor-pointer"
          >
            Recalibrate
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
              Posture Session
            </h1>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                isCameraActive
                  ? 'bg-emerald-50 text-[#16A36A] border-emerald-200'
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isCameraActive ? 'bg-[#16A36A]' : 'bg-slate-400'
                }`}
              ></span>
              {isCameraActive ? 'Camera active' : 'Camera inactive'}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Real-time on-device computer vision posture coach.
          </p>
        </div>

        {/* Global Controls Bar */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Sound Toggle */}
          <button
            onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition cursor-pointer flex items-center gap-1.5 ${
              settings.soundEnabled
                ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                : 'bg-slate-100 border-slate-200 text-slate-400 hover:text-slate-600'
            }`}
            title="Toggle audio chime"
          >
            <span>{settings.soundEnabled ? '🔔 Sound on' : '🔕 Muted'}</span>
          </button>

          {/* Desktop Notifications Toggle */}
          {isNotificationSupported() && (
            <button
              onClick={handleEnableNotifications}
              disabled={notificationPermission === 'granted'}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition cursor-pointer ${
                notificationPermission === 'granted'
                  ? 'bg-emerald-50 border-emerald-200 text-[#16A36A]'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span>
                {notificationPermission === 'granted'
                  ? '✓ Notifications on'
                  : 'Enable notifications'}
              </span>
            </button>
          )}

          {/* Camera Power Button */}
          {!isCameraActive ? (
            <button
              onClick={startCamera}
              disabled={modelLoading}
              className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition shadow-xs cursor-pointer flex items-center gap-2"
            >
              {modelLoading ? 'Initializing model...' : 'Start camera'}
            </button>
          ) : (
            <button
              onClick={stopCameraAndWorker}
              className="px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg transition cursor-pointer"
            >
              Stop camera
            </button>
          )}
        </div>
      </div>

      {cameraError && (
        <div className="bg-rose-50 border border-rose-200 text-[#DC5656] p-3.5 rounded-xl text-xs flex items-center justify-between">
          <span>{cameraError}</span>
          <button onClick={() => setCameraError(null)} className="font-semibold underline ml-4 cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Calibration Result Message */}
      {calibrationMessage && (
        <div
          className={`px-4 py-3 rounded-xl text-xs flex items-center justify-between gap-4 border ${
            calibrationMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-[#DC5656]'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold">{calibrationMessage.type === 'success' ? '✓' : '⚠'}</span>
            <span>{calibrationMessage.text}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {calibrationMessage.type === 'error' && (
              <button
                onClick={handleStartCalibration}
                className="px-3 py-1 bg-[#DC5656] hover:bg-rose-700 text-white font-medium text-xs rounded-lg transition cursor-pointer"
              >
                Retry Calibration
              </button>
            )}
            <button
              onClick={() => setCalibrationMessage(null)}
              className="text-slate-400 hover:text-slate-600 text-xs font-medium cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Primary Webcam Stage */}
        <div className="lg:col-span-7 space-y-3">
          <div className="relative w-full aspect-4/3 bg-slate-900 rounded-xl overflow-hidden border border-slate-200 shadow-xs flex items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full object-cover scale-x-[-1] pointer-events-none"
            />

            {!isCameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-900/90 p-6 text-center">
                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-200">Camera inactive</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  Click "Start camera" in the top bar to initialize MediaPipe detection.
                </p>
              </div>
            )}

            {/* Redesigned Compact Calibration Card (No giant dark blur!) */}
            {isCalibrating && (
              <div className="absolute inset-0 flex items-center justify-center p-4 z-20 pointer-events-none">
                <div className="bg-white/95 backdrop-blur-xs border border-slate-200 shadow-md rounded-xl p-5 max-w-xs w-full text-center space-y-3">
                  <div className="flex items-center justify-center gap-2 text-slate-900">
                    <span className="w-2 h-2 rounded-full bg-[#7185C8] animate-pulse"></span>
                    <h3 className="text-sm font-semibold tracking-tight">Calibrating your posture</h3>
                  </div>

                  <p className="text-xs text-slate-500">
                    Sit comfortably upright and look at the screen.
                  </p>

                  {/* Clean progress bar and countdown */}
                  <div className="space-y-1.5 pt-1">
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden border border-slate-200/60">
                      <div
                        className="bg-[#7185C8] h-full transition-all duration-300 rounded-full"
                        style={{
                          width: `${Math.max(0, Math.min(100, ((5 - calibSecondsRemaining) / 5) * 100))}%`
                        }}
                      ></div>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                      <span>{calibSecondsRemaining}s remaining</span>
                      <span>{calibSamplesRef.current.length}/5 samples</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* In-feed Connection Tag (top-left) */}
            {isCameraActive && !isCalibrating && (
              <div className="absolute top-3 left-3 bg-slate-900/75 backdrop-blur-xs text-slate-200 text-[11px] px-2.5 py-1 rounded-md border border-slate-700/80 flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    detectionStatus === 'Tracking'
                      ? 'bg-[#16A36A]'
                      : detectionStatus === "Can't see you"
                      ? 'bg-amber-400'
                      : 'bg-slate-400'
                  }`}
                ></span>
                <span>{detectionStatus}</span>
              </div>
            )}

            {/* In-feed Live Posture Pill (top-right) */}
            {isSessionRunning && (
              <div
                className={`absolute top-3 right-3 text-xs font-semibold px-3 py-1 rounded-md border shadow-xs backdrop-blur-xs ${
                  postureState === 'bad'
                    ? 'bg-white/95 text-[#DC5656] border-rose-200'
                    : 'bg-white/95 text-[#16A36A] border-emerald-200'
                }`}
              >
                {postureState === 'bad' ? 'Bad Posture' : 'Good Posture'} • {smoothedScore}%
              </div>
            )}
          </div>

          {/* Privacy Note */}
          <div className="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#16A36A] shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944zM11 14a1 1 0 11-2 0 1 1 0 012 0zm0-7a1 1 0 10-2 0v3a1 1 0 102 0V7z" clipRule="evenodd" />
              </svg>
              <span>
                <strong>Privacy Note:</strong> Video never leaves your device. Only local numeric features are evaluated.
              </span>
            </span>
          </div>
        </div>

        {/* Right: Calibration & Session Metrics */}
        <div className="lg:col-span-5 space-y-4">
          {/* Section 1: Calibration Panel */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Posture Baseline</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Calibrate your natural sitting baseline before tracking.
                </p>
              </div>
              {baseline && (
                <span className="text-xs font-medium text-[#16A36A] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Calibrated
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={handleStartCalibration}
                disabled={!isCameraActive || isCalibrating}
                className="flex-1 py-2 px-3.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition shadow-xs cursor-pointer"
              >
                {isCalibrating
                  ? `Calibrating (${calibSecondsRemaining}s)...`
                  : baseline
                  ? 'Recalibrate Baseline'
                  : 'Start Calibration (5s)'}
              </button>

              {baseline && (
                <button
                  onClick={clearBaseline}
                  disabled={isSessionRunning}
                  className="py-2 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 text-xs font-medium rounded-lg transition cursor-pointer"
                  title="Clear baseline"
                >
                  Reset
                </button>
              )}
            </div>

            {baseline && (
              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50/70 p-3 rounded-lg border border-slate-200 font-mono text-slate-600">
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Nose height</span>
                  <span className="font-semibold text-slate-800">{baseline.noseHeight.toFixed(3)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Shoulder width</span>
                  <span className="font-semibold text-slate-800">{baseline.shoulderWidth.toFixed(3)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Shoulder tilt</span>
                  <span className="font-semibold text-slate-800">{baseline.shoulderTilt.toFixed(1)}°</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Head offset</span>
                  <span className="font-semibold text-slate-800">{baseline.headOffset.toFixed(3)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Session Metrics & Control Panel */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Live Session</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isSessionRunning ? 'Monitoring continuous ergonomic posture' : 'Ready to start'}
                </p>
              </div>
              <span
                className={`px-2 py-0.5 text-xs font-medium rounded border ${
                  isSessionRunning
                    ? 'bg-emerald-50 text-[#16A36A] border-emerald-200'
                    : 'bg-slate-50 text-slate-500 border-slate-200'
                }`}
              >
                {isSessionRunning ? 'Active' : 'Idle'}
              </span>
            </div>

            {/* Metrics Bar (Single clean card, non-nested) */}
            <div className="grid grid-cols-3 divide-x divide-slate-100 bg-slate-50/70 rounded-lg border border-slate-200 py-3 text-center">
              <div className="px-2">
                <span className="text-[11px] font-medium text-slate-500 uppercase block">Duration</span>
                <span className="text-lg font-semibold font-mono text-slate-900 mt-0.5 block">
                  {formatTime(sessionDurationSec)}
                </span>
              </div>

              <div className="px-2">
                <span className="text-[11px] font-medium text-slate-500 uppercase block">Score</span>
                <span
                  className={`text-lg font-semibold font-mono mt-0.5 block ${
                    smoothedScore >= 70 ? 'text-[#16A36A]' : 'text-[#DC5656]'
                  }`}
                >
                  {isSessionRunning ? `${smoothedScore}%` : '—'}
                </span>
              </div>

              <div className="px-2">
                <span className="text-[11px] font-medium text-slate-500 uppercase block">Alerts</span>
                <span className="text-lg font-semibold font-mono text-slate-800 mt-0.5 block">
                  {alertsCount}
                </span>
              </div>
            </div>

            {/* Primary Action Button */}
            <div>
              {!isSessionRunning ? (
                <button
                  onClick={handleStartSession}
                  disabled={!isCameraActive || !baseline || isCalibrating}
                  className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-medium text-xs rounded-lg transition shadow-xs cursor-pointer"
                >
                  {!baseline ? 'Calibrate Posture First' : 'Start Session'}
                </button>
              ) : (
                <button
                  onClick={handleStopSession}
                  className="w-full py-2.5 px-4 bg-[#DC5656] hover:bg-rose-700 text-white font-medium text-xs rounded-lg transition shadow-xs cursor-pointer"
                >
                  Stop Session & View Summary
                </button>
              )}
            </div>

            {/* Bad posture alerts detail */}
            {isSessionRunning && badReasons.length > 0 && (
              <div className="p-3 bg-rose-50/70 border border-rose-200/80 rounded-lg text-xs text-[#DC5656]">
                <strong className="font-semibold">Notice:</strong>
                <ul className="list-disc list-inside mt-1 space-y-0.5 text-slate-700">
                  {badReasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Session Summary Modal */}
      {sessionSummary && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Session Summary</h3>
                <p className="text-xs text-slate-500">Tracked sitting ergonomics</p>
              </div>
              <button
                onClick={dismissSummary}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1 cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-center text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[11px] text-slate-500 block">Duration</span>
                <span className="text-lg font-semibold font-mono text-slate-900 mt-0.5 block">
                  {formatTime(sessionSummary.durationSec)}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[11px] text-slate-500 block">Average Score</span>
                <span
                  className={`text-lg font-semibold font-mono mt-0.5 block ${
                    sessionSummary.avgScore >= 70 ? 'text-[#16A36A]' : 'text-[#DC5656]'
                  }`}
                >
                  {sessionSummary.avgScore}%
                </span>
              </div>
              <div className="p-3 bg-emerald-50/60 rounded-lg border border-emerald-200 text-emerald-900">
                <span className="text-[11px] text-[#16A36A] block">Good Posture</span>
                <span className="text-base font-semibold font-mono mt-0.5 block">
                  {sessionSummary.goodPercentage}%
                </span>
              </div>
              <div className="p-3 bg-rose-50/60 rounded-lg border border-rose-200 text-rose-900">
                <span className="text-[11px] text-[#DC5656] block">Slouch Alerts</span>
                <span className="text-base font-semibold font-mono mt-0.5 block">
                  {sessionSummary.slouchAlerts}
                </span>
              </div>
            </div>

            <button
              onClick={dismissSummary}
              className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
