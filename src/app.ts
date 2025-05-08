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
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 });
const tokenStore = new Map<string, TokenData>();

app.use(cors({
  origin: ['https://report-akwaaba.vercel.app', 'http://localhost:3000', 'https://alert.akwaabahr.com'],
  credentials: true
}));
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/api/', apiLimiter);

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

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ 
    status: 'healthy',
    database: AppDataSource.isInitialized ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

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
        timeout: 10000
      }
    );
    
    return res.json(data.data.map((schedule: any) => ({
      id: schedule.id,
      name: schedule.name,
      startTime: schedule.start_time,
      endTime: schedule.end_time,
      days: schedule.days || [],
      latenessTime: schedule.lateness_time
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

app.get('/api/schedules/users', async (req: Request, res: Response) => {
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
        }
      }
    );

    const users = data.results
      .filter((r: any) => r.memberId)
      .map((r: any) => ({
        id: r.memberId.id,
        firstName: r.memberId.firstname,
        lastName: r.memberId.surname,
        phone: r.memberId.phone,
        gender: r.memberId.gender
      }))
      .filter((user: any, index: number, self: any[]) => 
        index === self.findIndex((u) => u.id === user.id)
      );

    return res.json(users);
  } catch (error) {
    const err = error as AxiosError;
    console.error('Failed to fetch users:', err);
    return res.status(500).json({ 
      error: "Failed to fetch users",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

app.get('/api/recipients/check', async (req: Request, res: Response) => {
  try {
    const { phone, scheduleId } = req.query;
    const existing = await Recipient.findOneBy({ 
      phone: phone as string,
      scheduleId: Number(scheduleId)
    });
    return res.json({ exists: !!existing });
  } catch (error) {
    const err = error as Error;
    console.error('Failed to check recipient:', err);
    return res.status(500).json({ 
      error: "Failed to check recipient",
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

    const { scheduleId, phone, startDate, endDate } = req.query;
    if (!scheduleId || !phone || !startDate || !endDate) {
      return res.status(400).json({ error: 'Required parameters missing' });
    }

    // Validate date formats
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate as string) || 
        !/^\d{4}-\d{2}-\d{2}$/.test(endDate as string)) {
      return res.status(400).json({ error: 'Invalid date format. Use yyyy-mm-dd' });
    }

    const { data } = await axios.get(
      `${process.env.ATTENDANCE_API_URL}/attendance/meeting-event/attendance`,
      {
        params: {
          start_date: startDate,
          end_date: endDate,
          meetingEventId: scheduleId,  // Use scheduleId directly
          length: 1000
        },
        headers: { 
          Authorization: `Token ${token}` 
        }
      }
    );


    const userRecords = data.results.filter((r: any) => 
      r.memberId?.phone === phone
    );

    if (userRecords.length === 0) {
      return res.status(404).json({ error: 'No attendance records found' });
    }

    const scheduleResponse = await axios.get(
      `${process.env.ATTENDANCE_API_URL}/attendance/meeting-event/schedule/${scheduleId}`,
      {
        headers: { 
          Authorization: `Token ${token}` 
        }
      }
    );

    const scheduleDetails = scheduleResponse.data;

    let clockIns = 0;
    let clockOuts = 0;
    let lateDays = 0;
    let absentDays = 0;
    let totalWorkHours = 0;
    let overtimeDays = 0;
    let totalOvertime = 0;

    userRecords.forEach((record: any) => {
      if (record.inTime) {
        clockIns++;
        
        const clockInTime = new Date(record.inTime);
        const scheduleStart = new Date(`${record.date.split('T')[0]}T${scheduleDetails.start_time}`);
        
        if (clockInTime > scheduleStart) {
          lateDays++;
        }
        
        if (record.outTime) {
          clockOuts++;
          const clockOutTime = new Date(record.outTime);
          const workHours = (clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);
          totalWorkHours += workHours;
          
          const scheduleEnd = new Date(`${record.date.split('T')[0]}T${scheduleDetails.end_time}`);
          if (clockOutTime > scheduleEnd) {
            overtimeDays++;
            totalOvertime += (clockOutTime.getTime() - scheduleEnd.getTime()) / (1000 * 60 * 60);
          }
        }
      } else {
        absentDays++;
      }
    });

    return res.json({
      firstName: userRecords[0].memberId.firstname,
      clockIns,
      clockOuts,
      lateDays,
      absentDays,
      totalWorkHours: Math.round(totalWorkHours),
      overtimeDays,
      totalOvertime: Math.round(totalOvertime),
      scheduleName: scheduleDetails.name
    });
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

    if (content.length > 160) {
      return res.status(400).json({
        success: false,
        error: 'Message content exceeds maximum length of 160 characters'
      });
    }

    const existing = await Recipient.findOneBy({ 
      phone: to,
      scheduleId: scheduleId
    });
    
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Recipient already exists for this schedule'
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

const MAX_RETRIES = 5;
const RETRY_DELAY = 5000;

const initializeDatabase = async (attempt = 1): Promise<void> => {
  try {
    console.log(`Connecting to database (attempt ${attempt}/${MAX_RETRIES})...`);
    console.log("🔍 Connecting to DB:", {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user:   process.env.DB_USER,
    });
    await AppDataSource.initialize();
    console.log("Database connected successfully");

    if (process.env.RUN_MIGRATIONS === 'true') {
      console.log("Running migrations...");
      await AppDataSource.runMigrations();
      console.log("Migrations completed");
    }

    startApplicationServices();
  } catch (err) {
    const error = err as Error;
    console.error(`Connection attempt ${attempt} failed:`, error.message);
    
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
  
  const scheduleService = new ScheduleService(
    process.env.ATTENDANCE_API_URL!,
    process.env.ATTENDANCE_API_TOKEN!
  );
  
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

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

initializeDatabase().catch((error) => {
  console.error("Failed to initialize application:", error);
  process.exit(1);
});