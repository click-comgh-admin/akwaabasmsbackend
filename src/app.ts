// src/app.ts
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { AppDataSource } from "./config/data-source";
import routes from "./routes/index.route";
import { allowedOrigins } from "./config/cors";
import { HubtelSMS } from "./services/sms.service";
import { ScheduleService } from "./services/schedule.service";
import { AttendanceService } from "./services/attendance.service";
import { scheduleBackgroundJobs } from "./services/cron_job.service";

// Constants
const MAX_RETRIES = 5;
const RETRY_DELAY = 5000;
const PORT = Number(5550);

// Express App Setup
const app = express();
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 });

app.use(cookieParser());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: "60mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use("/api", apiLimiter);
app.use("/api", routes);

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    database: AppDataSource.isInitialized ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

// Initialize Database and Start Server
const initializeDatabase = async (attempt = 1): Promise<void> => {
  try {
    console.log(`📡 Connecting to database (Attempt ${attempt}/${MAX_RETRIES})`);
    console.table({
      Host: process.env.DB_HOST,
      Port: process.env.DB_PORT,
      Database: process.env.DB_NAME,
      User: process.env.DB_USER,
    });

    await AppDataSource.initialize();
    console.log("✅ Database connected successfully");

    if (process.env.RUN_MIGRATIONS === "true") {
      console.log("⚙️ Running migrations...");
      await AppDataSource.runMigrations();
      console.log("✅ Migrations completed");
    }

    startApplicationServices();
  } catch (error) {
    console.error(`❌ Connection failed (Attempt ${attempt}):`, error);

    if (attempt < MAX_RETRIES) {
      setTimeout(() => initializeDatabase(attempt + 1), RETRY_DELAY);
    } else {
      console.error("🚫 Max connection attempts reached. Exiting.");
      process.exit(1);
    }
  }
};

const startApplicationServices = (): void => {
  const smsService = new HubtelSMS(
    process.env.HUBTEL_CLIENT_ID!,
    process.env.HUBTEL_CLIENT_SECRET!
  );

  const scheduleService = new ScheduleService(
    process.env.ATTENDANCE_API_URL!,
    process.env.ATTENDANCE_API_TOKEN!
  );

  const attendanceService = new AttendanceService(
    process.env.ATTENDANCE_API_URL!,
    process.env.ATTENDANCE_API_TOKEN!
  );

  const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    scheduleBackgroundJobs(smsService, attendanceService);
  });

  process.on("SIGINT", () => shutdown(server));
  process.on("SIGTERM", () => shutdown(server));
};

const shutdown = (server: ReturnType<typeof app.listen>): void => {
  console.log("🛑 Shutting down server...");
  server.close(async () => {
    if (AppDataSource.isInitialized) {
      console.log("🔌 Closing DB connection...");
      await AppDataSource.destroy();
    }
    console.log("✅ Server shutdown complete");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("⏱️ Forced shutdown timeout reached");
    process.exit(1);
  }, 10_000);
};

// Start App
initializeDatabase().catch((err) => {
  console.error("❌ Failed to initialize application:", err);
  process.exit(1);
});
