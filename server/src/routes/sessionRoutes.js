import express from 'express';
import { z } from 'zod';
import { createSession, getSessions, getStats } from '../controllers/sessionController.js';
import { authenticateToken } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { requireDB } from '../middleware/dbCheck.js';

const router = express.Router();

const sessionSchema = z.object({
  durationSec: z.number().int().min(1, 'Duration must be at least 1 second'),
  goodSec: z.number().int().min(0).default(0),
  badSec: z.number().int().min(0).default(0),
  alertsCount: z.number().int().min(0).default(0),
  avgScore: z.number().min(0).max(100, 'Average score must be between 0 and 100'),
  startedAt: z.string().datetime().optional(),
  endedAt: z.string().datetime().optional(),
  timelineScores: z.array(z.number()).optional().default([])
});

// All session routes require authenticated user and active database
router.use(authenticateToken);
router.use(requireDB);

router.post('/', validateBody(sessionSchema), createSession);
router.get('/', getSessions);
router.get('/stats', getStats);

export default router;
