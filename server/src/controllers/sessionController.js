import { Session } from '../models/Session.js';

/**
 * POST /api/sessions
 * Saves a completed posture tracking session for the authenticated user.
 */
export async function createSession(req, res, next) {
  try {
    const {
      durationSec,
      goodSec,
      badSec,
      alertsCount,
      avgScore,
      startedAt,
      endedAt,
      timelineScores
    } = req.body;

    const session = await Session.create({
      userId: req.userId,
      durationSec: Number(durationSec),
      goodSec: Number(goodSec || 0),
      badSec: Number(badSec || 0),
      alertsCount: Number(alertsCount || 0),
      avgScore: Math.round(Number(avgScore)),
      startedAt: startedAt ? new Date(startedAt) : new Date(Date.now() - durationSec * 1000),
      endedAt: endedAt ? new Date(endedAt) : new Date(),
      timelineScores: Array.isArray(timelineScores) ? timelineScores : []
    });

    return res.status(201).json({
      message: 'Session recorded successfully',
      session
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/sessions
 * Returns recent sessions for the authenticated user.
 */
export async function getSessions(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const sessions = await Session.find({ userId: req.userId })
      .sort({ endedAt: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json({ sessions });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/sessions/stats
 * Computes live dashboard metrics directly from MongoDB sessions.
 */
export async function getStats(req, res, next) {
  try {
    const userId = req.userId;
    const allSessions = await Session.find({ userId })
      .sort({ endedAt: -1 })
      .lean();

    const totalSessions = allSessions.length;
    const totalTrackedSeconds = allSessions.reduce((acc, s) => acc + (s.durationSec || 0), 0);
    const totalMinutes = Math.round(totalTrackedSeconds / 60);

    // Filter today's sessions
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todaySessions = allSessions.filter((s) => new Date(s.endedAt) >= startOfToday);

    const todayAvgScore =
      todaySessions.length > 0
        ? Math.round(todaySessions.reduce((acc, s) => acc + s.avgScore, 0) / todaySessions.length)
        : null;

    const todayTrackedSeconds = todaySessions.reduce((acc, s) => acc + (s.durationSec || 0), 0);

    // Group sessions by calendar day (YYYY-MM-DD)
    const dayBuckets = {};
    allSessions.forEach((s) => {
      const day = new Date(s.endedAt).toISOString().slice(0, 10);
      if (!dayBuckets[day]) {
        dayBuckets[day] = { totalSec: 0, scores: [] };
      }
      dayBuckets[day].totalSec += s.durationSec || 0;
      if (typeof s.avgScore === 'number') {
        dayBuckets[day].scores.push(s.avgScore);
      }
    });

    // Calculate streak
    // A day counts towards streak if tracked >= 15 min or has sessions with avgScore >= 70
    const sortedDays = Object.keys(dayBuckets).sort();
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    // Check consecutive days ending today or yesterday
    const todayStr = now.toISOString().slice(0, 10);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    let checkDate = new Date(now);
    // If user has not tracked today yet, start checking from yesterday for current streak
    if (!dayBuckets[todayStr]) {
      checkDate = yesterday;
    }

    while (true) {
      const dStr = checkDate.toISOString().slice(0, 10);
      const b = dayBuckets[dStr];
      if (b && b.totalSec > 0) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    // Longest streak calculation across all time
    for (let i = 0; i < sortedDays.length; i++) {
      if (i === 0) {
        tempStreak = 1;
      } else {
        const prev = new Date(sortedDays[i - 1]);
        const curr = new Date(sortedDays[i]);
        const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          tempStreak++;
        } else {
          tempStreak = 1;
        }
      }
      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
      }
    }

    // 7-day trend data
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const trendData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayName = daysOfWeek[d.getDay()];

      const dayData = dayBuckets[dateStr];
      let score = null;
      let duration = 0;
      if (dayData && dayData.scores.length > 0) {
        score = Math.round(dayData.scores.reduce((a, c) => a + c, 0) / dayData.scores.length);
        duration = dayData.totalSec;
      }

      trendData.push({
        date: dayName,
        fullDate: dateStr,
        score,
        durationMin: Math.round(duration / 60)
      });
    }

    // Hourly distribution: group sessions by hour of day (0-23)
    const hourlyBuckets = Array(24)
      .fill(0)
      .map((_, h) => ({
        hour: `${h}:00`,
        count: 0,
        totalScore: 0
      }));

    allSessions.forEach((s) => {
      if (s.endedAt) {
        const h = new Date(s.endedAt).getHours();
        hourlyBuckets[h].count += 1;
        hourlyBuckets[h].totalScore += s.avgScore || 0;
      }
    });

    const hourlyData = hourlyBuckets.slice(8, 21).map((b) => ({
      hour: b.hour,
      score: b.count > 0 ? Math.round(b.totalScore / b.count) : null,
      sessionsCount: b.count
    }));

    return res.status(200).json({
      stats: {
        totalSessions,
        totalTrackedSeconds,
        totalMinutes,
        todayAvgScore,
        todayTrackedSeconds,
        currentStreak,
        longestStreak,
        trendData,
        hourlyData,
        recentSessions: allSessions.slice(0, 10)
      }
    });
  } catch (err) {
    next(err);
  }
}
