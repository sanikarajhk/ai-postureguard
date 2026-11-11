import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

/**
 * Generates a signed JWT with 7-day expiration.
 */
function createToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is missing from server environment variables');
  }
  return jwt.sign(
    { userId: user._id.toString(), email: user.email },
    secret,
    { expiresIn: '7d' }
  );
}

/**
 * POST /api/auth/register
 * Creates a new user record with hashed password and returns JWT.
 */
export async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        message: 'An account with this email already exists. Please sign in instead.'
      });
    }

    // Hash password with bcryptjs (salt factor 10)
    const passwordHash = await bcrypt.hash(password, 10);

    // Save user to database
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash
    });

    const token = createToken(user);

    return res.status(201).json({
      message: 'Registration successful',
      token,
      user: user.toSafeObject()
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 * Validates credentials and returns JWT token with safe user info.
 */
export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    // Find user by normalized email
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({
        message: 'Invalid email or password.'
      });
    }

    // Verify bcrypt password hash
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        message: 'Invalid email or password.'
      });
    }

    const token = createToken(user);

    return res.status(200).json({
      message: 'Sign in successful',
      token,
      user: user.toSafeObject()
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me
 * Returns current authenticated user's profile and settings.
 */
export async function getMe(req, res, next) {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User account not found.' });
    }

    return res.status(200).json({
      user: user.toSafeObject()
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/auth/settings
 * Updates user settings (alertAfterSeconds, breakEveryMinutes).
 */
export async function updateSettings(req, res, next) {
  try {
    const { alertAfterSeconds, breakEveryMinutes } = req.body;
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({ message: 'User account not found.' });
    }

    if (alertAfterSeconds !== undefined) {
      user.settings.alertAfterSeconds = Number(alertAfterSeconds);
    }
    if (breakEveryMinutes !== undefined) {
      user.settings.breakEveryMinutes = Number(breakEveryMinutes);
    }

    await user.save();

    return res.status(200).json({
      message: 'Settings updated successfully',
      settings: user.settings
    });
  } catch (err) {
    next(err);
  }
}
