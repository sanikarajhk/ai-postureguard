import mongoose from 'mongoose';

/**
 * Middleware that verifies MongoDB connection is active before processing database requests.
 */
export function requireDB(req, res, next) {
  // readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      message: 'Database is not connected. Please configure MONGO_URI in server/.env with your MongoDB Atlas connection string.'
    });
  }
  next();
}
