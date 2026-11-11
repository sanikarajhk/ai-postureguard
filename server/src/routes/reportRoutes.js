import express from 'express';
import { getWeeklyReport } from '../controllers/reportController.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireDB } from '../middleware/dbCheck.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireDB);

router.get('/weekly', getWeeklyReport);

export default router;
