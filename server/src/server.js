import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import { connectDB } from './config/db.js';

const PORT = process.env.PORT || 5001;

async function startServer() {
  // Connect to MongoDB
  await connectDB();

  const server = app.listen(PORT, () => {
    console.log(`[PostureGuard Server] Running on http://localhost:${PORT}`);
    console.log(`[PostureGuard Server] CORS allowed origin: ${process.env.CLIENT_URL || 'http://localhost:5173'}`);
  });

  const shutdown = async () => {
    console.log('\n[PostureGuard Server] Shutting down gracefully...');
    server.close(() => {
      console.log('[PostureGuard Server] HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer();
