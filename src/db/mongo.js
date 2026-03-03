import mongoose from "mongoose";
import { env } from "../config/env.js";

mongoose.set("bufferCommands", false);

export async function connectMongo() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  return mongoose.connect(env.mongoUri, {
    dbName: env.mongoDb,
    serverSelectionTimeoutMS: 9000,
    connectTimeoutMS: 9000,
    socketTimeoutMS: 20000,
    maxPoolSize: 5,
    minPoolSize: 0,
    maxIdleTimeMS: 30000
  });
}
