import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { jest } from '@jest/globals';
import app from '../app.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';

let mongoServer;
let testToken;
let testUserId;

jest.setTimeout(60000);

beforeAll(async () => {
  process.env.JWT_SECRET = 'test_jwt_secret_at_least_32_characters_long';
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  // Create a test user
  const user = await User.create({
    name: 'Test Runner',
    email: 'runner@example.com',
    passwordHash: 'dummyhashedpassword'
  });
  testUserId = user._id;

  // Obtain token by registering or creating token
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      name: 'Session Tester',
      email: 'sessiontester@example.com',
      password: 'password123'
    });
  testToken = res.body.token;
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Session.deleteMany({});
});

describe('POST /api/sessions', () => {
  it('saves a valid posture session for authenticated user', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        durationSec: 120,
        goodSec: 100,
        badSec: 20,
        alertsCount: 1,
        avgScore: 85,
        timelineScores: [80, 85, 90]
      });

    expect(res.status).toBe(201);
    expect(res.body.session).toBeDefined();
    expect(res.body.session.durationSec).toBe(120);
    expect(res.body.session.avgScore).toBe(85);
    expect(res.body.session.alertsCount).toBe(1);

    const dbSession = await Session.findOne({ durationSec: 120 });
    expect(dbSession).not.toBeNull();
  });

  it('rejects session creation when duration is less than 1 second', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        durationSec: 0,
        avgScore: 90
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Duration must be at least 1 second');
  });

  it('rejects unauthenticated session submissions', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .send({
        durationSec: 60,
        avgScore: 80
      });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/sessions/stats', () => {
  it('computes correct statistics and streaks from saved sessions', async () => {
    // Insert two sessions
    await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        durationSec: 300,
        goodSec: 250,
        badSec: 50,
        alertsCount: 2,
        avgScore: 82
      });

    await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        durationSec: 180,
        goodSec: 160,
        badSec: 20,
        alertsCount: 0,
        avgScore: 92
      });

    const res = await request(app)
      .get('/api/sessions/stats')
      .set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(200);
    expect(res.body.stats).toBeDefined();
    expect(res.body.stats.totalSessions).toBe(2);
    expect(res.body.stats.totalTrackedSeconds).toBe(480);
    expect(res.body.stats.todayAvgScore).toBe(87); // (82 + 92) / 2
    expect(res.body.stats.trendData.length).toBe(7);
  });
});

describe('GET /api/reports/weekly', () => {
  it('returns weekly analytical summary', async () => {
    await request(app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        durationSec: 600,
        goodSec: 500,
        badSec: 100,
        alertsCount: 1,
        avgScore: 88
      });

    const res = await request(app)
      .get('/api/reports/weekly')
      .set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(200);
    expect(res.body.report).toBeDefined();
    expect(res.body.report.totalSessions).toBe(1);
    expect(res.body.report.overallAvgScore).toBe(88);
    expect(res.body.report.dailyBreakdown.length).toBe(7);
    expect(res.body.report.insights.length).toBeGreaterThan(0);
  });
});
