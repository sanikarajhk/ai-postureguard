import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import api from '../api/axios.js';
import { usePostureStore } from '../store/usePostureStore.js';

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  const localSessions = usePostureStore((state) => state.completedSessions || []);

  useEffect(() => {
    let isMounted = true;

    async function fetchStats() {
      setIsLoading(true);
      setFetchError(null);
      try {
        const res = await api.get('/sessions/stats');
        if (isMounted) {
          setStats(res.data.stats);
          setIsLoading(false);
        }
      } catch (err) {
        console.warn('Could not fetch backend stats, falling back to local sessions:', err);
        if (isMounted) {
          setFetchError(err.response?.data?.message || null);
          setIsLoading(false);
        }
      }
    }

    fetchStats();
    return () => {
      isMounted = false;
    };
  }, []);

  // Format seconds to clean string
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remainingMins = mins % 60;
      return `${hrs}h ${remainingMins}m`;
    }
    return `${mins}m ${secs}s`;
  };

  // Derive metrics either from backend stats or local session fallback
  const totalSessions = stats ? stats.totalSessions : localSessions.length;
  const totalTrackedSeconds = stats
    ? stats.totalTrackedSeconds
    : localSessions.reduce((acc, s) => acc + (s.durationSec || 0), 0);
  const totalMinutes = stats ? stats.totalMinutes : Math.round(totalTrackedSeconds / 60);

  const avgPostureScore = stats
    ? stats.todayAvgScore ?? (stats.recentSessions?.length > 0 ? stats.recentSessions[0].avgScore : null)
    : localSessions.length > 0
    ? Math.round(localSessions.reduce((acc, s) => acc + (s.avgScore || 0), 0) / localSessions.length)
    : null;

  const currentStreak = stats ? stats.currentStreak : totalSessions > 0 ? 1 : 0;
  const longestStreak = stats ? stats.longestStreak : totalSessions > 0 ? 1 : 0;

  const trendData = stats?.trendData || [];
  const hourlyData = stats?.hourlyData || [];
  const recentSessions = stats?.recentSessions || localSessions.slice(0, 10);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
            Posture Analytics
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Weekly posture trends, tracked sessions, and ergonomic streaks from your live database.
          </p>
        </div>

        <Link
          to="/"
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition shadow-xs cursor-pointer w-fit"
        >
          <span>Start New Session</span>
        </Link>
      </div>

      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center">
          <span className="w-6 h-6 rounded-full border-2 border-slate-900 border-t-transparent animate-spin mb-3"></span>
          <p className="text-xs text-slate-500">Loading your posture analytics...</p>
        </div>
      ) : (
        <>
          {/* Top 4 KPI Metrics Bar */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Metric 1: Average Score */}
            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block">
                Average Score
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span
                  className={`text-2xl sm:text-3xl font-semibold font-mono tracking-tight ${
                    avgPostureScore !== null
                      ? avgPostureScore >= 70
                        ? 'text-[#16A36A]'
                        : 'text-[#DC5656]'
                      : 'text-slate-400'
                  }`}
                >
                  {avgPostureScore !== null ? `${avgPostureScore}%` : '—'}
                </span>
                {avgPostureScore !== null && (
                  <span className="text-[11px] text-slate-400 font-normal">
                    {avgPostureScore >= 70 ? 'Upright' : 'Slouching'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {totalSessions > 0 ? `Across ${totalSessions} sessions` : 'No sessions recorded yet'}
              </p>
            </div>

            {/* Metric 2: Total Tracked Time */}
            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block">
                Tracked Time
              </span>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-semibold font-mono text-slate-900 tracking-tight">
                  {totalMinutes}
                </span>
                <span className="text-xs text-slate-500 font-medium ml-1">minutes</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {totalTrackedSeconds > 0 ? formatDuration(totalTrackedSeconds) : '0s recorded'}
              </p>
            </div>

            {/* Metric 3: Current Streak */}
            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block">
                Current Streak
              </span>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-semibold font-mono text-slate-900 tracking-tight">
                  {currentStreak}
                </span>
                <span className="text-xs text-slate-500 font-medium ml-1">
                  {currentStreak === 1 ? 'day' : 'days'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Consecutive active posture days</p>
            </div>

            {/* Metric 4: Longest Streak */}
            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block">
                Longest Streak
              </span>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-semibold font-mono text-slate-900 tracking-tight">
                  {longestStreak}
                </span>
                <span className="text-xs text-slate-500 font-medium ml-1">
                  {longestStreak === 1 ? 'day' : 'days'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Personal best streak</p>
            </div>
          </div>

          {/* Main Analytics Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* 7-Day Trend Chart */}
            <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">7-Day Posture Trend</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Daily average posture scores over the past week
                    </p>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">0–100%</span>
                </div>

                {totalSessions === 0 ? (
                  <div className="h-56 flex flex-col items-center justify-center text-center p-6 bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
                    <svg className="w-8 h-8 text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <p className="text-xs font-medium text-slate-600">No trend data available yet</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Complete your first posture session to populate this chart.
                    </p>
                  </div>
                ) : (
                  <div className="h-56 w-full mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                        <defs>
                          <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#7185C8" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#7185C8" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748B' }} stroke="#E2E8F0" />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748B' }} stroke="#E2E8F0" />
                        <Tooltip
                          formatter={(val) => (val !== null ? [`${val}%`, 'Average Score'] : ['No data', 'Score'])}
                          contentStyle={{
                            backgroundColor: '#FFFFFF',
                            borderColor: '#E2E8F0',
                            borderRadius: '8px',
                            fontSize: '12px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="score"
                          stroke="#7185C8"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#scoreGradient)"
                          connectNulls
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span>&ge; 70% threshold represents ergonomic posture</span>
                <span className="font-mono text-slate-400">Target: 85%+</span>
              </div>
            </div>

            {/* Hourly Posture Analysis Chart */}
            <div className="lg:col-span-5 bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Hourly Analysis</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Average score by time of day</p>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">8:00–20:00</span>
                </div>

                {totalSessions === 0 ? (
                  <div className="h-56 flex flex-col items-center justify-center text-center p-6 bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
                    <svg className="w-8 h-8 text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-xs font-medium text-slate-600">No hourly metrics</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Sessions will be grouped by time of day.
                    </p>
                  </div>
                ) : (
                  <div className="h-56 w-full mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={hourlyData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                        <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#64748B' }} stroke="#E2E8F0" />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748B' }} stroke="#E2E8F0" />
                        <Tooltip
                          formatter={(val) => (val !== null ? [`${val}%`, 'Avg Score'] : ['No sessions', 'Avg Score'])}
                          contentStyle={{
                            backgroundColor: '#FFFFFF',
                            borderColor: '#E2E8F0',
                            borderRadius: '8px',
                            fontSize: '12px'
                          }}
                        />
                        <Bar dataKey="score" fill="#7185C8" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
                Helps identify fatigue periods during daily work hours.
              </div>
            </div>
          </div>

          {/* Recent Sessions Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Recent Posture Sessions</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  History of recorded coaching sessions in MongoDB
                </p>
              </div>
              {recentSessions.length > 0 && (
                <span className="text-xs text-slate-500 font-mono">
                  {recentSessions.length} total
                </span>
              )}
            </div>

            {recentSessions.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-700">No sessions recorded yet</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Start your first session on the Session Studio page. Your posture scores and durations will be tracked here.
                </p>
                <Link
                  to="/"
                  className="mt-4 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition"
                >
                  Start Session
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-100 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 text-slate-600 uppercase text-[11px] font-semibold border-b border-slate-200/80">
                    <tr>
                      <th className="py-2.5 px-3.5">Date & Time</th>
                      <th className="py-2.5 px-3.5">Duration</th>
                      <th className="py-2.5 px-3.5">Avg Score</th>
                      <th className="py-2.5 px-3.5">Good Posture %</th>
                      <th className="py-2.5 px-3.5">Alerts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-mono">
                    {recentSessions.map((session, index) => {
                      const dur = session.durationSec || 0;
                      const good = session.goodSec || 0;
                      const goodPct = session.goodPercentage ?? (dur > 0 ? Math.round((good / dur) * 100) : 100);
                      const key = session._id || session.id || index;
                      return (
                        <tr key={key} className="hover:bg-slate-50/60 transition">
                          <td className="py-3 px-3.5 font-sans text-slate-600">
                            {session.endedAt ? new Date(session.endedAt).toLocaleDateString() : 'Today'}
                            <span className="text-[11px] text-slate-400 ml-2">
                              {session.endedAt
                                ? new Date(session.endedAt).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })
                                : ''}
                            </span>
                          </td>
                          <td className="py-3 px-3.5 font-medium">{formatDuration(dur)}</td>
                          <td className="py-3 px-3.5">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                                (session.avgScore || 0) >= 70
                                  ? 'bg-emerald-50 text-[#16A36A] border border-emerald-200/60'
                                  : 'bg-rose-50 text-[#DC5656] border border-rose-200/60'
                              }`}
                            >
                              {session.avgScore || 0}%
                            </span>
                          </td>
                          <td className="py-3 px-3.5">{goodPct}%</td>
                          <td className="py-3 px-3.5 text-slate-600 font-medium">
                            {session.alertsCount ?? session.slouchAlerts ?? 0}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
