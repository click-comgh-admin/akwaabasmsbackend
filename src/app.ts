import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { allowedOrigins } from "./config/cors";
import { DataSource } from "typeorm";
import { Schedule } from "./entities/Schedule";
import { Recipient } from "./entities/Recipient";
import { SMSLog } from "./entities/SMSLog";
import { HubtelSMS } from "./services/sms.service";
import { scheduleBackgroundJobs } from "./services/cron_job.service";
import https from "https";
import fs from "fs";
import path from "path";
import { Server } from "http";

// Configuration
const MAX_RETRIES = 5;
const RETRY_DELAY = 5000;
const PORT = Number(process.env.PORT || 5550);
const DB_POOL_SIZE = parseInt(process.env.DB_POOL_SIZE || "10");

// Initialize Express
const app = express();
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 });

// SSL Configuration for Database
const sslOptions = {
  rejectUnauthorized: true,
  ca: fs.readFileSync(path.resolve(__dirname, "../ca-certificate.crt")).toString()
};

// Database Configuration
export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 25060),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "defaultdb",
  ssl: sslOptions,
  entities: [Schedule, Recipient, SMSLog],
  migrations: ["dist/migrations/**/*.js"],
  synchronize: false,
  logging: true,
  poolSize: DB_POOL_SIZE,
  extra: {
    max: 20,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000
  }
});

// Middleware
app.use(cookieParser());
app.use(cors({ 
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  exposedHeaders: ['set-cookie']
}));
app.use(express.json({ limit: "60mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use("/api", apiLimiter);

// Database Connection Middleware
app.use(async (req, res, next) => {
  try {
    if (!AppDataSource.isInitialized) {
      await initializeDatabase();
    }
    next();
  } catch (error) {
    console.error("Database connection middleware failed:", error);
    res.status(503).json({ 
      error: "Service unavailable",
      details: "Database connection failed",
      solution: "Check DB configuration and SSL certificates"
    });
  }
});

// Health Check Endpoint
app.get("/health", async (req, res) => {
  try {
    await AppDataSource.query("SELECT 1");
    res.json({ 
      status: "healthy", 
      database: "connected",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      status: "unhealthy", 
      database: "disconnected",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Initialize Database with Enhanced Retry Logic
async function initializeDatabase(attempt = 1): Promise<void> {
  try {
    console.log(`🔌 Database connection attempt ${attempt}/${MAX_RETRIES}`);
    
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      // Verify connection with a simple query
      await AppDataSource.query("SELECT 1");
      console.log("✅ Database connected and verified");
    }

    if (process.env.RUN_MIGRATIONS === "true") {
      console.log("⚙️ Running migrations...");
      await AppDataSource.runMigrations();
      console.log("✅ Migrations completed");
    }
  } catch (error) {
    console.error(`❌ Connection failed (Attempt ${attempt}):`, error instanceof Error ? error.message : error);
    
    if (attempt < MAX_RETRIES) {
      const delay = RETRY_DELAY * attempt; // Exponential backoff
      console.log(`⏳ Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return initializeDatabase(attempt + 1);
    }
    
    throw new Error(`Failed to connect after ${MAX_RETRIES} attempts. Last error: ${error instanceof Error ? error.message : error}`);
  }
}

// Initialize Services
async function initializeServices() {
  console.log("⚙️ Initializing services...");
  return {
    smsService: new HubtelSMS(
      process.env.HUBTEL_CLIENT_ID!,
      process.env.HUBTEL_CLIENT_SECRET!
    )
  };
}

// Start Server
async function startServer(): Promise<Server> {
  return new Promise((resolve) => {
    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      resolve(server);
    });
  });
}

// Graceful Shutdown
function shutdown(server: Server) {
  console.log("🛑 Shutting down server...");
  
  server.close(async () => {
    if (AppDataSource.isInitialized) {
      console.log("🔌 Closing database connection...");
      await AppDataSource.destroy();
    }
    console.log("✅ Server shutdown complete");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("⏱️ Force shutdown after timeout");
    process.exit(1);
  }, 10000);
}

// Main Application Startup
async function main() {
  try {
    // Verify CA certificate exists
    try {
      fs.accessSync(path.resolve(__dirname, "../ca-certificate.crt"));
      console.log("🔐 SSL certificate verified");
    } catch (err) {
      throw new Error("CA certificate file not found or inaccessible");
    }

    // 1. Initialize Database
    await initializeDatabase();
    
    // 2. Initialize Services
    const { smsService } = await initializeServices();
    
    // 3. Start Server
    const server = await startServer();
    
    // 4. Schedule Background Jobs
    await scheduleBackgroundJobs(smsService);
    
    // Handle Process Signals
    process.on("SIGINT", () => shutdown(server));
    process.on("SIGTERM", () => shutdown(server));
    
  } catch (error) {
    console.error("❌ Application startup failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Start the application
main().catch(err => {
  console.error("Fatal error during startup:", err);
  process.exit(1);
});