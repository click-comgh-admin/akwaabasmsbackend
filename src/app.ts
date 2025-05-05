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
import rateLimit from 'express-rate-limit';

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

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000
});

// Middleware
app.use(cors({
  origin: ['https://report-akwaaba.vercel.app', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/api/', apiLimiter);

const tokenStore = new Map<string, TokenData>();

// Database Configuration
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
  synchronize: false,
  logging: ["error", "warn", "query"],
});

// Health Check Endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ 
    status: 'healthy',
    database: AppDataSource.isInitialized ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
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
      { 
        headers: { Authorization: `Token ${token}` },
        timeout: 10000 // 10 second timeout
      }
    );
    
    return res.json(data.data.map((schedule: any) => ({
      id: schedule.id,
      name: schedule.name,
      startTime: schedule.start_time,
      endTime: schedule.end_time,
      days: schedule.days || []
    })));
  } catch (error) {
    const err = error as AxiosError;
    console.error('Failed to fetch schedules:', err);
    return res.status(500).json({ 
      error: "Failed to fetch schedules",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

app.get('/api/schedules/details', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Authorization token required' });
    }

    const { ids } = req.query;
    if (!ids) {
      return res.status(400).json({ error: 'Schedule IDs are required' });
    }

    const idList = (ids as string).split(',').map(Number);
    const schedules = await Schedule.findByIds(idList);
    
    return res.json(schedules);
  } catch (error) {
    const err = error as Error;
    console.error('Failed to fetch schedule details:', err);
    return res.status(500).json({ 
      error: "Failed to fetch schedule details",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

app.get('/api/attendance/stats', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Authorization token required' });
    }

    const { schedules } = req.query;
    if (!schedules) {
      return res.status(400).json({ error: 'Schedule IDs are required' });
    }

    const scheduleIds = (schedules as string).split(',').map(Number);
    const today = format(new Date(), 'yyyy-MM-dd');
    
    const { data } = await axios.get(
      `${process.env.ATTENDANCE_API_URL}/attendance/meeting-event/attendance`,
      {
        params: {
          filter_date: today,
          meetingEventId: scheduleIds[0],
          length: 1000
        },
        headers: { 
          Authorization: `Token ${token}` 
        },
        timeout: 10000 // 10 second timeout
      }
    );

    const stats = {
      totalAttendees: data.results.filter((r: any) => r.inTime).length,
      maleCount: data.results.filter((r: any) => r.inTime && r.memberId.gender === 1).length,
      femaleCount: data.results.filter((r: any) => r.inTime && r.memberId.gender === 2).length,
      lateTotal: data.results.filter((r: any) => {
        if (!r.inTime || !r.meetingEventId.latenessTime) return false;
        const clockIn = new Date(r.inTime);
        const latenessTime = new Date(`${today}T${r.meetingEventId.latenessTime}`);
        return clockIn > latenessTime;
      }).length,
      absentTotal: data.results.filter((r: any) => !r.inTime).length
    };

    return res.json(stats);
  } catch (error) {
    const err = error as AxiosError;
    console.error('Failed to fetch attendance stats:', err);
    return res.status(500).json({ 
      error: "Failed to fetch attendance stats",
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

    // Validate content length
    if (content.length > 160) {
      return res.status(400).json({
        success: false,
        error: 'Message content exceeds maximum length of 160 characters'
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

    const recipient = new Recipient();
    recipient.phone = to;
    recipient.frequency = frequency;
    recipient.lastSent = new Date();
    recipient.messageType = 'Attendance Summary';
    recipient.scheduleId = scheduleId;
    await recipient.save();
    
    return res.json({ success: true });
  } catch (error) {
    const err = error as Error;
    console.error('Failed to send SMS:', err);
    return res.status(500).json({ 
      success: false,
      error: err.message.includes('160 character') 
        ? err.message 
        : "Failed to send SMS",
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

app.get("/api/sms/logs", async (req: Request, res: Response) => {
  try {
    const logs = await SMSLog.find({ order: { sentAt: "DESC" } });
    return res.json(logs);
  } catch (error) {
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
  } catch (error) {
    const err = error as Error;
    console.error('Failed to fetch recipients:', err);
    
    if (err.message.includes('column') && err.message.includes('does not exist')) {
      return res.status(500).json({ 
        error: "Database schema mismatch - please run migrations",
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
    
    return res.status(500).json({ 
      error: "Failed to fetch recipients", 
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Background Jobs
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

// Database Initialization
const MAX_RETRIES = 5;
const RETRY_DELAY = 5000;

const initializeDatabase = async (attempt = 1): Promise<void> => {
  try {
    console.log(`Connecting to database (attempt ${attempt}/${MAX_RETRIES})...`);
    await AppDataSource.initialize();
    console.log("Database connected successfully");

    if (process.env.RUN_MIGRATIONS === 'true') {
      console.log("Running migrations...");
      await AppDataSource.runMigrations();
      console.log("Migrations completed");
    }

    startApplicationServices();
  } catch (error) {
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

// Error Handling Middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start the application
initializeDatabase().catch((error) => {
  console.error("Failed to initialize application:", error);
  process.exit(1);
});