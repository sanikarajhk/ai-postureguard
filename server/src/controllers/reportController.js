import { Session } from '../models/Session.js';

/**
 * GET /api/reports/weekly
 * Generates an analytical weekly posture summary for the authenticated user.
 */
export async function getWeeklyReport(req, res, next) {
  try {
    const userId = req.userId;
    const now = new Date();

    // Past 7 days
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const sessions = await Session.find({
      userId,
      endedAt: { $gte: sevenDaysAgo }
    })
      .sort({ endedAt: 1 })
      .lean();

    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dailyMap = {};

    // Initialize 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      dailyMap[dateStr] = {
        date: dateStr,
        day: daysOfWeek[d.getDay()],
        durationSec: 0,
        goodSec: 0,
        badSec: 0,
        alerts: 0,
        scores: [],
        sessionCount: 0
      };
    }

    sessions.forEach((s) => {
      const dateStr = new Date(s.endedAt).toISOString().slice(0, 10);
      if (dailyMap[dateStr]) {
        dailyMap[dateStr].durationSec += s.durationSec || 0;
        dailyMap[dateStr].goodSec += s.goodSec || 0;
        dailyMap[dateStr].badSec += s.badSec || 0;
        dailyMap[dateStr].alerts += s.alertsCount || 0;
        dailyMap[dateStr].sessionCount += 1;
        if (typeof s.avgScore === 'number') {
          dailyMap[dateStr].scores.push(s.avgScore);
        }
      }
    });

    const dailyBreakdown = Object.values(dailyMap).map((d) => {
      const avgScore =
        d.scores.length > 0
          ? Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length)
          : null;
      return {
        date: d.date,
        day: d.day,
        durationMin: Math.round(d.durationSec / 60),
        durationSec: d.durationSec,
        goodSec: d.goodSec,
        badSec: d.badSec,
        alerts: d.alerts,
        sessionCount: d.sessionCount,
        avgScore
      };
    });

    const totalTrackedSeconds = sessions.reduce((acc, s) => acc + (s.durationSec || 0), 0);
    const totalGoodSec = sessions.reduce((acc, s) => acc + (s.goodSec || 0), 0);
    const totalBadSec = sessions.reduce((acc, s) => acc + (s.badSec || 0), 0);
    const totalAlerts = sessions.reduce((acc, s) => acc + (s.alertsCount || 0), 0);
    const totalSessions = sessions.length;

    const overallAvgScore =
      totalSessions > 0
        ? Math.round(sessions.reduce((acc, s) => acc + (s.avgScore || 0), 0) / totalSessions)
        : null;

    const goodPosturePercentage =
      totalTrackedSeconds > 0
        ? Math.round((totalGoodSec / totalTrackedSeconds) * 100)
        : null;

    // Determine best and worst days among days with data
    const activeDays = dailyBreakdown.filter((d) => d.avgScore !== null);
    let bestDay = null;
    let worstDay = null;
    if (activeDays.length > 0) {
      const sorted = [...activeDays].sort((a, b) => b.avgScore - a.avgScore);
      bestDay = { day: sorted[0].day, date: sorted[0].date, score: sorted[0].avgScore };
      worstDay = {
        day: sorted[sorted.length - 1].day,
        date: sorted[sorted.length - 1].date,
        score: sorted[sorted.length - 1].avgScore
      };
    }

    // Dynamic AI coach insights based on actual user data
    const insights = [];
    if (totalSessions === 0) {
      insights.push('Start a calibrated session to begin tracking your weekly posture trends.');
    } else {
      if (goodPosturePercentage !== null && goodPosturePercentage >= 80) {
        insights.push('Strong postural alignment maintained for over 80% of tracked study time.');
      } else if (goodPosturePercentage !== null && goodPosturePercentage < 65) {
        insights.push('Slouching or forward head tilt was detected frequently this week. Consider elevating your screen to eye level.');
      }

      if (totalAlerts > 10) {
        insights.push(`Received ${totalAlerts} posture alerts this week. Take 2-minute posture resets every 45 minutes to ease cervical tension.`);
      } else if (totalAlerts === 0 && totalSessions > 0) {
        insights.push('Zero slouch alerts triggered! Your spine alignment remained within calibrated thresholds.');
      }

      if (totalTrackedSeconds > 3600) {
        insights.push(`Accumulated ${Math.round(totalTrackedSeconds / 60)} minutes of posture-aware focus sessions.`);
      }
    }

    return res.status(200).json({
      report: {
        weekStartDate: sevenDaysAgo.toISOString().slice(0, 10),
        weekEndDate: now.toISOString().slice(0, 10),
        totalSessions,
        totalTrackedSeconds,
        totalTrackedMinutes: Math.round(totalTrackedSeconds / 60),
        overallAvgScore,
        goodPosturePercentage,
        totalAlerts,
        bestDay,
        worstDay,
        dailyBreakdown,
        insights
      }
    });
  } catch (err) {
    next(err);
  }
}
