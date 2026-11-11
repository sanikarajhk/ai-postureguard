/**
 * Zod validation middleware generator.
 * Validates req.body against a provided Zod schema.
 */
export const validateBody = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (err) {
    if (err.errors) {
      const errors = err.errors.map((e) => e.message);
      return res.status(400).json({
        message: errors[0] || 'Invalid request body',
        errors
      });
    }
    return res.status(400).json({ message: 'Validation failed' });
  }
};
