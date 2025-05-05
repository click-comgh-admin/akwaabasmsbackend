import "reflect-metadata";
import dotenv from "dotenv";
dotenv.config();

import express, { Express, Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import cron from "node-schedule";
import { format } from 'date-fns';
import axios, { AxiosError } from 'axios';
import cors from "cors";

import { DataSource } from "typeorm";
import { Schedule } from "./entities/Schedule";
import { SMSLog } from "./entities/SMSLog";
import { Recipient } from "./entities/Recipient";

import { HubtelSMS } from "./services/sms.service";
import { ScheduleService } from "./services/schedule.service";
import { AttendanceService } from "./services/attendance.service";

interface TokenData {
  clientCode: string;
  email: string;
  orgName: string;
}

const app: Express = express();

// Configure CORS and request body parsing
app.use(cors({
  origin: ['https://report-akwaaba.vercel.app', 'http://localhost:3000'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const tokenStore = new Map<string, TokenData>();

// Database configuration
export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 25060),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "defaultdb",
  ssl: {
    rejectUnauthorized: true,
    ca: fs.readFileSync(path.resolve(__dirname, "./ca-certificate.crt")),
  },
  entities: [Schedule, SMSLog, Recipient],
  migrations: ["migrations/*.ts"],
  migrationsRun: false, // We'll run migrations manually
  synchronize: false, // Disable synchronize in production
  logging: ["error", "warn", "query"],
});

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// API Endpoints
app.post('/api/auth/store-token', (req: Request, res: Response) => {
  const { clientCode, email, token, orgName } = req.body;
  
  if (!token || !clientCode) {
    return res.status(400).json({ error: 'Token and client code are required' });
  }

  tokenStore.set(token, { clientCode, email, orgName });
  return res.json({ success: true });
});

app.get('/api/schedules/available', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Authorization token required' });
    }

    const today = format(new Date(), 'yyyy-MM-dd');
    const { data } = await axios.get(
      `${process.env.ATTENDANCE_API_URL}/attendance/meeting-event/schedule/date/${today}?datatable_plugin`,
      { headers: { Authorization: `Token ${token}` } }
    );
    
    return res.json(data.data.map((s: any) => ({ 
      id: s.id, 
      name: s.name,
      startTime: s.start_time,
      endTime: s.end_time,
      days: s.days || []
    })));
  } catch (error: unknown) {
    const err = error as AxiosError;
    console.error('Failed to fetch schedules:', err);
    return res.status(500).json({ 
      error: "Failed to fetch schedules", 
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

app.post('/api/sms/send', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ 
        success: false,
        error: 'Authorization token required' 
      });
    }

    const { from, to, content, frequency, scheduleId } = req.body;
    
    if (!from || !to || !content || !frequency || !scheduleId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields (from, to, content, frequency, scheduleId)'
      });
    }

    const smsService = new HubtelSMS(
      process.env.HUBTEL_CLIENT_ID!,
      process.env.HUBTEL_CLIENT_SECRET!
    );
    
    const success = await smsService.sendSMS({ from, to, content });
    
    if (!success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to send SMS through Hubtel API'
      });
    }

    // Save recipient information
    const recipient = new Recipient();
    recipient.phone = to;
    recipient.frequency = frequency;
    recipient.lastSent = new Date();
    recipient.messageType = 'Attendance Summary';
    recipient.scheduleId = scheduleId;
    await recipient.save();
    
    return res.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Failed to send SMS:', err);
    return res.status(500).json({ 
      success: false,
      error: "Failed to send SMS",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

app.get("/api/sms/logs", async (req: Request, res: Response) => {
  try {
    const logs = await SMSLog.find({ order: { sentAt: "DESC" } });
    return res.json(logs);
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Failed to fetch logs:', err);
    return res.status(500).json({ 
      error: "Failed to fetch logs", 
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

app.get("/api/recipients/list", async (req: Request, res: Response) => {
  try {
    const recipients = await Recipient.find();
    return res.json(recipients);
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Failed to fetch recipients:', err);
    return res.status(500).json({ 
      error: "Failed to fetch recipients", 
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Background job scheduling
const scheduleBackgroundJobs = (
  smsService: HubtelSMS,
  scheduleService: ScheduleService,
  attendanceService: AttendanceService
): void => {
  cron.scheduleJob("*/5 * * * *", async () => {
    try {
      console.log("Running scheduled SMS jobs...");
      const pending = await scheduleService.getPendingSchedules();
      console.log(`Found ${pending.length} pending schedules`);
      
      for (const schedule of pending) {
        try {
          const recipients = await scheduleService.getRecipients(schedule.id);
          console.log(`Processing schedule ${schedule.id} for ${recipients.length} recipients`);
          
          for (const recipient of recipients) {
            try {
              const data = await attendanceService.getAttendanceSummary(
                recipient.phone,
                schedule.frequency,
                schedule.meetingEventId,
                schedule.lastSent
              );
              
              const message = scheduleService.formatMessage(data, schedule.template);
              await smsService.sendSMS({
                from: schedule.senderName,
                to: recipient.phone,
                content: message,
              });
              
              await scheduleService.updateLastSent(schedule.id);
            } catch (error) {
              console.error(`Failed to process recipient ${recipient.phone}:`, error);
            }
          }
        } catch (error) {
          console.error(`Failed to process schedule ${schedule.id}:`, error);
        }
      }
    } catch (error) {
      console.error("Error in scheduled job:", error);
    }
  });
};

// Database initialization with retry logic
const MAX_RETRIES = 5;
const RETRY_DELAY = 5000;

const initializeDatabase = async (attempt = 1): Promise<void> => {
  try {
    console.log(`Connecting to database (attempt ${attempt}/${MAX_RETRIES})...`);
    
    // Initialize connection
    await AppDataSource.initialize();
    console.log("Database connected successfully");

    // Run pending migrations
    if (process.env.RUN_MIGRATIONS === 'true') {
      console.log("Running migrations...");
      await AppDataSource.runMigrations();
      console.log("Migrations completed");
    }

    // Start application services
    startApplicationServices();
  } catch (error: unknown) {
    const err = error as Error;
    console.error(`Connection attempt ${attempt} failed:`, err.message);
    
    if (attempt < MAX_RETRIES) {
      setTimeout(() => initializeDatabase(attempt + 1), RETRY_DELAY);
    } else {
      console.error("Maximum connection attempts reached");
      process.exit(1);
    }
  }
};

const startApplicationServices = (): void => {
  const smsService = new HubtelSMS(
    process.env.HUBTEL_CLIENT_ID!,
    process.env.HUBTEL_CLIENT_SECRET!
  );
  
  const scheduleService = new ScheduleService();
  const attendanceService = new AttendanceService(
    process.env.ATTENDANCE_API_URL!,
    process.env.ATTENDANCE_API_TOKEN!
  );

  const PORT = Number(process.env.PORT || 5000);
  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    scheduleBackgroundJobs(smsService, scheduleService, attendanceService);
  });

  process.on("SIGTERM", () => shutdown(server));
  process.on("SIGINT", () => shutdown(server));
};

const shutdown = (server: ReturnType<typeof app.listen>): void => {
  console.log("Shutting down server...");
  
  server.close(async () => {
    console.log("Closing database connection...");
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    console.log("Server shutdown complete");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("Forcing shutdown after timeout");
    process.exit(1);
  }, 10000);
};

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Initialize application
initializeDatabase().catch((error: unknown) => {
  const err = error as Error;
  console.error("Failed to initialize application:", err);
  process.exit(1);
});