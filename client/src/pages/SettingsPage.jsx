import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore.js';
import { usePostureStore } from '../store/usePostureStore.js';

export default function SettingsPage() {
  const { user, updateUserSettings, isLoading: isAuthLoading } = useAuthStore();
  const { settings: postureSettings, updateSettings: updatePostureSettings } = usePostureStore();

  const [alertAfterSeconds, setAlertAfterSeconds] = useState(
    user?.settings?.alertAfterSeconds ?? postureSettings?.alertAfterSeconds ?? 20
  );
  const [breakEveryMinutes, setBreakEveryMinutes] = useState(
    user?.settings?.breakEveryMinutes ?? postureSettings?.breakEveryMinutes ?? 45
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    if (user?.settings) {
      if (typeof user.settings.alertAfterSeconds === 'number') {
        setAlertAfterSeconds(user.settings.alertAfterSeconds);
      }
      if (typeof user.settings.breakEveryMinutes === 'number') {
        setBreakEveryMinutes(user.settings.breakEveryMinutes);
      }
    }
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatusMessage(null);
    setErrorMessage(null);

    const alertSec = Number(alertAfterSeconds);
    const breakMin = Number(breakEveryMinutes);

    if (isNaN(alertSec) || alertSec < 5 || alertSec > 120) {
      setErrorMessage('Alert duration must be between 5 and 120 seconds.');
      setIsSubmitting(false);
      return;
    }

    if (isNaN(breakMin) || breakMin < 10 || breakMin > 120) {
      setErrorMessage('Break interval must be between 10 and 120 minutes.');
      setIsSubmitting(false);
      return;
    }

    const res = await updateUserSettings({
      alertAfterSeconds: alertSec,
      breakEveryMinutes: breakMin
    });

    if (res.success) {
      // Sync immediately with live posture session store
      updatePostureSettings({
        alertAfterSeconds: alertSec,
        breakEveryMinutes: breakMin
      });
      setStatusMessage('Settings saved successfully and synced with your account.');
    } else {
      setErrorMessage(res.error || 'Failed to save settings.');
    }

    setIsSubmitting(false);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="border-b border-slate-200/80 pb-5">
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
          Coaching & Alert Settings
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Customize posture sensitivity, continuous slouch alerts, and ergonomic break intervals.
        </p>
      </div>

      {statusMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200/80 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
          <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 bg-rose-50 border border-rose-200/80 rounded-xl text-xs text-rose-800 flex items-center gap-2">
          <svg className="w-4 h-4 text-rose-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-6">
        {/* Setting 1: Slouch Alert Threshold */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="alertAfterSeconds" className="text-xs font-semibold text-slate-900">
              Slouch Alert Threshold
            </label>
            <span className="text-xs font-mono font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
              {alertAfterSeconds} seconds
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            PostureGuard triggers an alert notification only after poor posture persists continuously for this duration.
          </p>
          <input
            id="alertAfterSeconds"
            type="range"
            min="5"
            max="60"
            step="5"
            value={alertAfterSeconds}
            onChange={(e) => setAlertAfterSeconds(Number(e.target.value))}
            className="w-full accent-slate-900 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-mono">
            <span>5s (Sensitive)</span>
            <span>20s (Recommended)</span>
            <span>60s (Forgiving)</span>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-5 space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="breakEveryMinutes" className="text-xs font-semibold text-slate-900">
              Ergonomic Break Reminder
            </label>
            <span className="text-xs font-mono font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
              {breakEveryMinutes} minutes
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            Interval between gentle reminders to stand up, stretch, and relax spinal lumbar tension.
          </p>
          <input
            id="breakEveryMinutes"
            type="range"
            min="15"
            max="90"
            step="5"
            value={breakEveryMinutes}
            onChange={(e) => setBreakEveryMinutes(Number(e.target.value))}
            className="w-full accent-slate-900 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-mono">
            <span>15m (Frequent)</span>
            <span>45m (Optimal)</span>
            <span>90m (Extended)</span>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-5 flex items-center justify-between">
          <p className="text-[11px] text-slate-400">
            Settings are saved to your account in MongoDB Atlas.
          </p>
          <button
            type="submit"
            disabled={isSubmitting || isAuthLoading}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition shadow-xs cursor-pointer"
          >
            {isSubmitting ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>

      {/* Account Info Card */}
      <div className="bg-slate-50/80 rounded-xl border border-slate-200/80 p-5 text-xs text-slate-600 space-y-2">
        <h3 className="font-semibold text-slate-800">Account Credentials & Privacy</h3>
        <p className="text-[11px] text-slate-500">
          Signed in as <strong>{user?.name}</strong> ({user?.email}).
        </p>
        <p className="text-[11px] text-slate-400">
          Privacy guarantee: Webcam video frames never leave your local browser sandbox. Only numeric session summaries are stored.
        </p>
      </div>
    </div>
  );
}
