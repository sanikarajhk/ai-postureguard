import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getPoseLandmarker, detectPoseInVideo, drawSkeletonOverlay } from '../utils/poseDetector.js';
import { extractFeatures, isBadPosture, calculatePostureScore } from '../utils/features.js';

export default function DebugPage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const workerRef = useRef(null);
  const landmarkerRef = useRef(null);
  const streamRef = useRef(null);

  // Status & loading states
  const [modelLoading, setModelLoading] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [detectionStatus, setDetectionStatus] = useState('Idle');

  // Live posture state: 'idle' | 'good' | 'bad' | 'cannot_see'
  const [postureState, setPostureState] = useState('idle');

  // Live metrics
  const [rawFeatures, setRawFeatures] = useState(null);
  const [referenceBaseline, setReferenceBaseline] = useState(null);
  const [postureEvaluation, setPostureEvaluation] = useState(null);
  const [liveScore, setLiveScore] = useState(100);

  // Hidden-tab verification & tick metrics
  const [tickCount, setTickCount] = useState(0);
  const [tpm, setTpm] = useState(0); // Ticks per minute
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [logs, setLogs] = useState([]);

  // Store tick timestamps for accurate TPM calculation
  const tickTimestampsRef = useRef([]);
  const startTimeRef = useRef(null);
  const baselineRef = useRef(null);

  // Sync ref with state
  useEffect(() => {
    baselineRef.current = referenceBaseline;
  }, [referenceBaseline]);

  // Clean up all resources
  const cleanup = useCallback(() => {
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
    setIsDetecting(false);
    setDetectionStatus('Stopped');
    setPostureState('idle');
    setPostureEvaluation(null);
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Start webcam and load model
  const startCameraAndDetection = async () => {
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
      setModelReady(true);
      setModelLoading(false);

      startTimeRef.current = Date.now();
      tickTimestampsRef.current = [];
      setTickCount(0);
      setElapsedSeconds(0);

      const worker = new Worker(
        new URL('../workers/timer.worker.js', import.meta.url),
        { type: 'module' }
      );
      workerRef.current = worker;

      worker.onmessage = (event) => {
        if (event.data?.type === 'tick') {
          handleTick(event.data.timestamp);
        }
      };

      worker.postMessage({ action: 'start', interval: 1000 });
      setIsDetecting(true);
      setDetectionStatus('Detecting');
    } catch (err) {
      console.error('Failed to start camera or model:', err);
      setCameraError(err.message || 'Could not access webcam or load model');
      setModelLoading(false);
      cleanup();
    }
  };

  // Main per-second tick handler
  const handleTick = (timestamp) => {
    const now = Date.now();
    tickTimestampsRef.current.push(now);

    tickTimestampsRef.current = tickTimestampsRef.current.filter(
      (t) => now - t <= 60000
    );
    const currentTpm = tickTimestampsRef.current.length;
    setTpm(currentTpm);

    setTickCount((prev) => prev + 1);

    if (startTimeRef.current) {
      setElapsedSeconds(Math.floor((now - startTimeRef.current) / 1000));
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;

    if (!video || !landmarker || video.readyState < 2) {
      return;
    }

    const landmarks = detectPoseInVideo(landmarker, video, performance.now());

    if (!landmarks) {
      setDetectionStatus("Can't see you");
      setPostureState('cannot_see');
      setPostureEvaluation(null);
      setLiveScore(null);
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      logTick({
        timestamp: new Date().toLocaleTimeString(),
        status: "Can't see you",
        reasons: 'No landmarks detected',
        noseHeight: '-',
        shoulderWidth: '-',
        shoulderTilt: '-',
        headOffset: '-',
        score: '-'
      });
      return;
    }

    const features = extractFeatures(landmarks);
    if (!features) {
      setDetectionStatus("Can't see you");
      setPostureState('cannot_see');
      setPostureEvaluation(null);
      setLiveScore(null);
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    setRawFeatures(features);
    setDetectionStatus('Tracking');

    if (!baselineRef.current) {
      const initialBaseline = {
        noseHeight: features.noseHeight,
        shoulderWidth: features.shoulderWidth,
        shoulderTilt: features.shoulderTilt,
        headOffset: features.headOffset
      };
      baselineRef.current = initialBaseline;
      setReferenceBaseline(initialBaseline);
    }

    const badInfo = isBadPosture(features, baselineRef.current);
    const score = calculatePostureScore(features, baselineRef.current);
    setPostureEvaluation(badInfo);
    setLiveScore(score);
    setPostureState(badInfo.isBad ? 'bad' : 'good');

    if (canvas) {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      drawSkeletonOverlay(canvas, features.raw, badInfo.isBad);
    }

    logTick({
      timestamp: new Date().toLocaleTimeString(),
      status: badInfo.isBad ? 'BAD POSTURE' : 'GOOD POSTURE',
      reasons: badInfo.reasons.join(', '),
      noseHeight: features.noseHeight.toFixed(3),
      shoulderWidth: features.shoulderWidth.toFixed(3),
      shoulderTilt: `${features.shoulderTilt.toFixed(1)}°`,
      headOffset: features.headOffset.toFixed(3),
      score: score
    });
  };

  const logTick = (entry) => {
    setLogs((prev) => [entry, ...prev.slice(0, 499)]);
  };

  const captureBaseline = () => {
    if (rawFeatures) {
      const newBaseline = {
        noseHeight: rawFeatures.noseHeight,
        shoulderWidth: rawFeatures.shoulderWidth,
        shoulderTilt: rawFeatures.shoulderTilt,
        headOffset: rawFeatures.headOffset
      };
      baselineRef.current = newBaseline;
      setReferenceBaseline(newBaseline);
      setPostureState('good');
      setPostureEvaluation({ isBad: false, reasons: [] });
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const formatBadReasons = (reasons = []) => {
    return reasons.map((r) => {
      const lower = r.toLowerCase();
      if (lower.includes('head') || lower.includes('drop') || lower.includes('nose')) return 'Head dropped';
      if (lower.includes('lean') || lower.includes('screen') || lower.includes('width')) return 'Leaning towards screen';
      if (lower.includes('tilt') || lower.includes('shoulder')) return 'Shoulder tilt';
      return r;
    });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Diagnostics Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
              Developer Diagnostics Lab
            </h1>
            <span className="px-2 py-0.5 text-[11px] font-mono font-medium bg-slate-100 text-slate-600 rounded border border-slate-200">
              /debug
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            MediaPipe PoseLandmarker 1 Hz Web Worker detection stream & feature diagnostics.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {!isDetecting ? (
            <button
              onClick={startCameraAndDetection}
              disabled={modelLoading}
              className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition shadow-xs cursor-pointer flex items-center gap-2"
            >
              {modelLoading ? 'Initializing model...' : 'Start diagnostics'}
            </button>
          ) : (
            <button
              onClick={cleanup}
              className="px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg transition cursor-pointer"
            >
              Stop diagnostics
            </button>
          )}

          {rawFeatures && (
            <button
              onClick={captureBaseline}
              className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg transition cursor-pointer"
            >
              Recapture reference
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

      {/* Benchmark Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs text-xs font-mono">
        <div>
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">TPM (Last 60s)</span>
          <span className="text-xl font-bold text-slate-900 mt-0.5 block">{tpm}</span>
          <span className="text-[10px] text-slate-400">Target: ~60</span>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">Total Ticks</span>
          <span className="text-xl font-bold text-slate-900 mt-0.5 block">{tickCount}</span>
          <span className="text-[10px] text-slate-400">1 Hz worker loop</span>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">Elapsed Time</span>
          <span className="text-xl font-bold text-slate-900 mt-0.5 block">
            {Math.floor(elapsedSeconds / 60)}m {elapsedSeconds % 60}s
          </span>
          <span className="text-[10px] text-slate-400">Active duration</span>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">Detection Loop</span>
          <span className="text-base font-bold text-slate-800 mt-1 block">
            {isDetecting ? 'Running' : 'Halted'}
          </span>
          <span className="text-[10px] text-slate-400">timer.worker.js</span>
        </div>
      </div>

      {/* Main Grid: Video + Live Status & Raw Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Video feed + skeleton overlay */}
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

            {!isDetecting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-900/90 p-6 text-center">
                <p className="text-xs font-mono text-slate-300">Camera inactive</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Click "Start diagnostics" to initialize video stream and Web Worker loop.
                </p>
              </div>
            )}

            {isDetecting && (
              <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-xs text-slate-300 text-[11px] px-2.5 py-1 rounded-md border border-slate-700 font-mono">
                Status: {detectionStatus}
              </div>
            )}

            {isDetecting && (
              <div
                className={`absolute top-3 right-3 text-xs font-semibold px-3 py-1 rounded-md border shadow-xs backdrop-blur-xs font-mono ${
                  postureState === 'good'
                    ? 'bg-white/95 text-[#16A36A] border-emerald-200'
                    : postureState === 'bad'
                    ? 'bg-white/95 text-[#DC5656] border-rose-200'
                    : 'bg-white/95 text-slate-600 border-slate-200'
                }`}
              >
                {postureState === 'good' && 'GOOD POSTURE'}
                {postureState === 'bad' && 'BAD POSTURE'}
                {postureState === 'cannot_see' && "CAN'T SEE YOU"}
                {postureState === 'idle' && 'INITIALIZING...'}
              </div>
            )}
          </div>
        </div>

        {/* Right: Live Classification & Raw Feature Table */}
        <div className="lg:col-span-5 space-y-4">
          {/* Status Box */}
          <div
            className={`p-4 rounded-xl border shadow-xs transition ${
              postureState === 'good'
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                : postureState === 'bad'
                ? 'bg-rose-50/70 border-rose-200 text-rose-950'
                : 'bg-white border-slate-200 text-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    postureState === 'good'
                      ? 'bg-[#16A36A]'
                      : postureState === 'bad'
                      ? 'bg-[#DC5656]'
                      : 'bg-slate-400'
                  }`}
                ></span>
                <div>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500 block">
                    Classification
                  </span>
                  <span className="text-base font-semibold font-mono">
                    {postureState === 'good' && 'GOOD POSTURE'}
                    {postureState === 'bad' && 'BAD POSTURE'}
                    {postureState === 'cannot_see' && "CAN'T SEE YOU"}
                    {postureState === 'idle' && (isDetecting ? 'INITIALIZING' : 'INACTIVE')}
                  </span>
                </div>
              </div>
              {liveScore !== null && isDetecting && (
                <span className="text-base font-bold font-mono text-slate-800">{liveScore}%</span>
              )}
            </div>

            {postureState === 'bad' && postureEvaluation?.reasons?.length > 0 && (
              <div className="mt-3 pt-3 border-t border-rose-200/60">
                <span className="text-[11px] font-semibold text-[#DC5656] block uppercase tracking-wider mb-1">
                  Breached Condition:
                </span>
                <ul className="text-xs space-y-1 text-slate-800">
                  {formatBadReasons(postureEvaluation.reasons).map((reason, idx) => (
                    <li key={idx} className="flex items-center gap-1.5 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#DC5656]"></span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Raw Numeric Metrics Table */}
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h2 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">
                Raw Posture Features
              </h2>
              {referenceBaseline && (
                <span className="text-[11px] text-[#16A36A] font-mono">Ref active</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-sans uppercase">noseHeight</span>
                <span className="text-base font-semibold text-slate-800">
                  {rawFeatures ? rawFeatures.noseHeight.toFixed(3) : '—'}
                </span>
                {referenceBaseline && (
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Ref: {referenceBaseline.noseHeight.toFixed(3)}
                  </span>
                )}
              </div>

              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-sans uppercase">shoulderWidth</span>
                <span className="text-base font-semibold text-slate-800">
                  {rawFeatures ? rawFeatures.shoulderWidth.toFixed(3) : '—'}
                </span>
                {referenceBaseline && (
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Ref: {referenceBaseline.shoulderWidth.toFixed(3)}
                  </span>
                )}
              </div>

              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-sans uppercase">shoulderTilt</span>
                <span className="text-base font-semibold text-slate-800">
                  {rawFeatures ? `${rawFeatures.shoulderTilt.toFixed(1)}°` : '—'}
                </span>
                {referenceBaseline && (
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Ref: {referenceBaseline.shoulderTilt.toFixed(1)}°
                  </span>
                )}
              </div>

              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-sans uppercase">headOffset</span>
                <span className="text-base font-semibold text-slate-800">
                  {rawFeatures ? rawFeatures.headOffset.toFixed(3) : '—'}
                </span>
                {referenceBaseline && (
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Ref: {referenceBaseline.headOffset.toFixed(3)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tick Event Stream Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Per-Second Tick Event Stream</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live ticks generated by Web Worker. Real-time background thread verification.
            </p>
          </div>
          <button
            onClick={clearLogs}
            className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded font-medium transition cursor-pointer"
          >
            Clear log
          </button>
        </div>

        <div className="overflow-x-auto max-h-72 overflow-y-auto border border-slate-100 rounded-lg">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-semibold sticky top-0 border-b border-slate-200/80">
              <tr>
                <th className="py-2 px-3">Time</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">noseHeight</th>
                <th className="py-2 px-3">shoulderWidth</th>
                <th className="py-2 px-3">shoulderTilt</th>
                <th className="py-2 px-3">headOffset</th>
                <th className="py-2 px-3">Score</th>
                <th className="py-2 px-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-6 text-center text-slate-400 font-sans">
                    No ticks recorded yet. Start diagnostics to stream events.
                  </td>
                </tr>
              ) : (
                logs.map((log, index) => (
                  <tr key={index} className="hover:bg-slate-50/60">
                    <td className="py-1.5 px-3 text-slate-500">{log.timestamp}</td>
                    <td className="py-1.5 px-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          log.status === 'GOOD POSTURE'
                            ? 'bg-emerald-50 text-[#16A36A]'
                            : log.status === 'BAD POSTURE'
                            ? 'bg-rose-50 text-[#DC5656]'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="py-1.5 px-3">{log.noseHeight}</td>
                    <td className="py-1.5 px-3">{log.shoulderWidth}</td>
                    <td className="py-1.5 px-3">{log.shoulderTilt}</td>
                    <td className="py-1.5 px-3">{log.headOffset}</td>
                    <td className="py-1.5 px-3 font-semibold">{log.score}</td>
                    <td className="py-1.5 px-3 text-slate-500 font-sans">{log.reasons || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
