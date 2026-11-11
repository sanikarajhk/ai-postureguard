import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios.js';

export default function ReportsPage() {
  const [report, setReport] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchWeeklyReport() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await api.get('/reports/weekly');
        if (isMounted) {
          setReport(res.data.report);
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.response?.data?.message || 'Failed to load weekly report.');
          setIsLoading(false);
        }
      }
    }

    fetchWeeklyReport();
    return () => {
      isMounted = false;
    };
  }, []);

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const rem = mins % 60;
      return `${hrs}h ${rem}m`;
    }
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
            Weekly Posture Report
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {report
              ? `7-Day Summary (${report.weekStartDate} to ${report.weekEndDate})`
              : 'Analytical assessment of your postural health and habits.'}
          </p>
        </div>

        <Link
          to="/"
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition shadow-xs cursor-pointer w-fit"
        >
          <span>Start Session</span>
        </Link>
      </div>

      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center">
          <span className="w-6 h-6 rounded-full border-2 border-slate-900 border-t-transparent animate-spin mb-3"></span>
          <p className="text-xs text-slate-500">Generating your weekly posture report...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
          {error}
        </div>
      ) : !report || report.totalSessions === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-slate-800">No Weekly Data Recorded</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            You don't have any tracked posture sessions for the past 7 days. Start a calibrated session to generate your weekly report.
          </p>
          <Link
            to="/"
            className="mt-4 inline-block px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition"
          >
            Start Session
          </Link>
        </div>
      ) : (
        <>
          {/* Top 4 KPI Metrics Bar */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block">
                Weekly Avg Score
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span
                  className={`text-2xl sm:text-3xl font-semibold font-mono tracking-tight ${
                    report.overallAvgScore >= 70 ? 'text-[#16A36A]' : 'text-[#DC5656]'
                  }`}
                >
                  {report.overallAvgScore}%
                </span>
                <span className="text-[11px] text-slate-400">
                  {report.overallAvgScore >= 70 ? 'Ergonomic' : 'Needs attention'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Across {report.totalSessions} sessions</p>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block">
                Total Focus Time
              </span>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-semibold font-mono text-slate-900 tracking-tight">
                  {report.totalTrackedMinutes}
                </span>
                <span className="text-xs text-slate-500 font-medium ml-1">minutes</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Tracked across past 7 days</p>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block">
                Upright Posture %
              </span>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-semibold font-mono text-slate-900 tracking-tight">
                  {report.goodPosturePercentage}%
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Target &ge; 80%</p>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block">
                Total Slouch Alerts
              </span>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-semibold font-mono text-slate-900 tracking-tight">
                  {report.totalAlerts}
                </span>
                <span className="text-xs text-slate-500 font-medium ml-1">alerts</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Bad-posture duration warnings</p>
            </div>
          </div>

          {/* Best / Worst Days Banner */}
          {(report.bestDay || report.worstDay) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {report.bestDay && (
                <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
                      Best Performing Day
                    </span>
                    <p className="text-sm font-semibold text-emerald-950 mt-0.5">
                      {report.bestDay.day} ({report.bestDay.date})
                    </p>
                  </div>
                  <span className="text-2xl font-mono font-bold text-emerald-700">
                    {report.bestDay.score}%
                  </span>
                </div>
              )}
              {report.worstDay && (
                <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">
                      Lowest Scoring Day
                    </span>
                    <p className="text-sm font-semibold text-amber-950 mt-0.5">
                      {report.worstDay.day} ({report.worstDay.date})
                    </p>
                  </div>
                  <span className="text-2xl font-mono font-bold text-amber-700">
                    {report.worstDay.score}%
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Coach Insights */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <h2 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
              Posture Coach Insights & Recommendations
            </h2>
            <ul className="space-y-2 text-xs text-slate-600">
              {report.insights.map((insight, idx) => (
                <li key={idx} className="flex items-start gap-2.5">
                  <span className="text-slate-400 font-mono mt-0.5">&bull;</span>
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Daily Breakdown Table */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">7-Day Daily Breakdown</h2>
            <div className="overflow-x-auto border border-slate-100 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-slate-600 uppercase text-[11px] font-semibold border-b border-slate-200/80">
                  <tr>
                    <th className="py-2.5 px-3.5">Day & Date</th>
                    <th className="py-2.5 px-3.5">Sessions</th>
                    <th className="py-2.5 px-3.5">Tracked Duration</th>
                    <th className="py-2.5 px-3.5">Average Score</th>
                    <th className="py-2.5 px-3.5">Alerts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-mono">
                  {report.dailyBreakdown.map((row) => (
                    <tr key={row.date} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-3.5 font-sans font-medium text-slate-900">
                        {row.day} <span className="text-slate-400 text-[11px]">({row.date})</span>
                      </td>
                      <td className="py-3 px-3.5">{row.sessionCount}</td>
                      <td className="py-3 px-3.5">{formatDuration(row.durationSec)}</td>
                      <td className="py-3 px-3.5">
                        {row.avgScore !== null ? (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                              row.avgScore >= 70
                                ? 'bg-emerald-50 text-[#16A36A] border border-emerald-200/60'
                                : 'bg-rose-50 text-[#DC5656] border border-rose-200/60'
                            }`}
                          >
                            {row.avgScore}%
                          </span>
                        ) : (
                          <span className="text-slate-300 font-sans">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3.5 text-slate-600">{row.alerts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
