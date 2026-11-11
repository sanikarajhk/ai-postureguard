import mongoose from 'mongoose';

/**
 * Connects to MongoDB using Mongoose.
 * Supports MongoDB Atlas, local MongoDB, or local in-memory MongoDB for development.
 * Logs clear error messages if connection fails.
 */
export async function connectDB() {
  if (process.env.USE_IN_MEMORY_DB === 'true') {
    try {
      console.log('\n[MongoDB] USE_IN_MEMORY_DB=true detected. Starting local in-memory MongoDB instance...');
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      const mongod = await MongoMemoryServer.create();
      const uri = mongod.getUri();
      const conn = await mongoose.connect(uri);
      console.log(`[MongoDB] Connected successfully to in-memory instance: ${conn.connection.host}`);
      console.log('[MongoDB] NOTE: All user records and sessions are stored in memory and will persist until the server restarts.\n');
      return true;
    } catch (err) {
      console.error(`\n[MongoDB In-Memory Failed]: ${err.message}\n`);
      return false;
    }
  }

  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error('\n[Database Error] MONGO_URI is missing in server/.env.');
    console.error('Please configure your MongoDB Atlas connection string in server/.env.');
    console.error('Example: MONGO_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/postureguard?retryWrites=true&w=majority');
    console.error('Or set USE_IN_MEMORY_DB=true in server/.env for local zero-config development.\n');
    return false;
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000 // Timeout after 5s if cluster is unreachable
    });
    console.log(`[MongoDB] Connected successfully: ${conn.connection.host}/${conn.connection.name}`);
    return true;
  } catch (err) {
    console.error(`\n[MongoDB Connection Failed]: ${err.message}`);
    console.error('Check your MONGO_URI, network connection, and MongoDB Atlas IP whitelist (0.0.0.0/0).');
    console.error('Or set USE_IN_MEMORY_DB=true in server/.env for local zero-config development.\n');
    return false;
  }
}
