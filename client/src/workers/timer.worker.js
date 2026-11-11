// client/src/workers/timer.worker.js
// Dedicated Web Worker timer for PostureGuard detection loop.
// Web Workers run in an isolated thread and are not subject to the aggressive
// background-tab throttling that browsers impose on window.setInterval/requestAnimationFrame.

let intervalId = null;

self.onmessage = (event) => {
  const { action, interval = 1000 } = event.data || {};

  if (action === 'start') {
    if (intervalId) {
      clearInterval(intervalId);
    }

    // Immediately emit first tick
    self.postMessage({ type: 'tick', timestamp: Date.now() });

    intervalId = setInterval(() => {
      self.postMessage({
        type: 'tick',
        timestamp: Date.now()
      });
    }, interval);
  } else if (action === 'stop') {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }
};
