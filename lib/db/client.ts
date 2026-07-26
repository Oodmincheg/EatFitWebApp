import { Db, MongoClient } from 'mongodb';

// Cached client on globalThis so hot lambda invocations reuse the
// connection instead of exhausting the Atlas pool (standard Next.js pattern).
const globalForMongo = globalThis as unknown as {
  _mongo?: { client: MongoClient; dbPromise: Promise<Db> };
};

async function init(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  const db = client.db(process.env.MONGODB_DB || 'mealplanner');

  await Promise.all([
    db.collection('users').createIndex({ firebaseUid: 1 }, { unique: true, sparse: true }),
    db.collection('plans').createIndex({ userId: 1, generatedAt: -1 }),
    db.collection('progress').createIndex({ userId: 1, date: 1 }),
    db.collection('orders').createIndex({ userId: 1, createdAt: -1 }),
  ]);

  globalForMongo._mongo = { client, dbPromise: Promise.resolve(db) };
  return db;
}

export function getDb(): Promise<Db> {
  if (!globalForMongo._mongo) {
    const dbPromise = init();
    // cache the in-flight promise so concurrent requests share one connect
    globalForMongo._mongo = { client: null as unknown as MongoClient, dbPromise };
    dbPromise.catch(() => {
      // allow retry on next request instead of caching a failed connection
      delete globalForMongo._mongo;
    });
    return dbPromise;
  }
  return globalForMongo._mongo.dbPromise;
}
