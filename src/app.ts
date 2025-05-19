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
import { AttendanceService } from "./services/attendance.service";
import { scheduleBackgroundJobs } from "./services/cron_job.service";

const MAX_RETRIES = 5;
const RETRY_DELAY = 5000;
const PORT = Number(process.env.PORT || 5550);

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

const initializeDatabase = async (attempt = 1): Promise<void> => {
  try {
    console.log(`📡 Connecting to database (Attempt ${attempt}/${MAX_RETRIES})`);
    
    await AppDataSource.initialize();
    console.log("✅ Database connected successfully");

    if (process.env.RUN_MIGRATIONS === "true") {
      console.log("⚙️ Running migrations...");
      await AppDataSource.runMigrations();
      console.log("✅ Migrations completed");
    }

    // Initialize services after DB is ready
    const smsService = new HubtelSMS(
      process.env.HUBTEL_CLIENT_ID!,
      process.env.HUBTEL_CLIENT_SECRET!
    );

    const attendanceService = new AttendanceService(
      process.env.ATTENDANCE_API_URL!,
      process.env.ATTENDANCE_API_TOKEN!
    );

    // Start server after everything is ready
    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      scheduleBackgroundJobs(smsService, attendanceService);
    });

    process.on("SIGINT", () => shutdown(server));
    process.on("SIGTERM", () => shutdown(server));

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

initializeDatabase().catch((err) => {
  console.error("❌ Failed to initialize application:", err);
  process.exit(1);
});