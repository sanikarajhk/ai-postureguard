import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { register, login, getMe, updateSettings } from '../controllers/authController.js';
import { validateBody } from '../middleware/validate.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireDB } from '../middleware/dbCheck.js';

const router = Router();

// Stricter rate limiter for authentication endpoints: 20 requests per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts. Please try again after 15 minutes.' }
});

// Zod validation schemas
const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters long'),
  email: z.string().trim().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters long')
});

const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required')
});

const settingsSchema = z.object({
  alertAfterSeconds: z.number().min(5).max(120).optional(),
  breakEveryMinutes: z.number().min(15).max(180).optional()
});

// Routes with active database connection verification
router.post('/register', authLimiter, requireDB, validateBody(registerSchema), register);
router.post('/login', authLimiter, requireDB, validateBody(loginSchema), login);
router.get('/me', authMiddleware, requireDB, getMe);
router.patch('/settings', authMiddleware, requireDB, validateBody(settingsSchema), updateSettings);

export default router;
