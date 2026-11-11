/**
 * Central Express error handling middleware.
 */
export function errorHandler(err, req, res, next) {
  console.error('[Server Error]:', err);

  // Mongoose duplicate key error (e.g. unique email)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({
      message: `An account with this ${field} already exists.`
    });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      message: errors[0] || 'Validation error',
      errors
    });
  }

  // MongoDB connection / network error
  if (err.name === 'MongooseServerSelectionError' || err.name === 'MongoNetworkError') {
    return res.status(503).json({
      message: 'Database connection is temporarily unavailable. Please try again shortly.'
    });
  }

  const statusCode = err.statusCode || 500;
  return res.status(statusCode).json({
    message: err.message || 'Internal server error.'
  });
}
