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
import detect from "detect-port";

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

app.use(cors({
  origin: 'https://report-akwaaba.vercel.app',
  credentials: true
}));

app.use(express.json());

const tokenStore = new Map<string, TokenData>();

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
  synchronize: process.env.NODE_ENV !== "production",
  logging: ["error", "warn"],
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'healthy' });
});

app.post('/api/auth/store-token', (req: Request, res: Response) => {
  const { clientCode, email, token, orgName } = req.body;
  if (!token || !clientCode) {
    res.status(400).json({ error: 'Token and client code are required' });
    return;
  }
  tokenStore.set(token, { clientCode, email, orgName });
  res.json({ success: true });
});

app.get('/api/schedules/available', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      res.status(401).json({ error: 'Authorization token required' });
      return;
    }
    const today = format(new Date(), 'yyyy-MM-dd');
    const { data } = await axios.get(
      `${process.env.ATTENDANCE_API_URL}/attendance/meeting-event/schedule/date/${today}?datatable_plugin`,
      { headers: { Authorization: `Token ${token}` } }
    );
    res.json(data.data.map((s: any) => ({ id: s.id, name: s.name })));
  } catch (error: unknown) {
    const err = error as AxiosError;
    res.status(500).json({ 
      error: "Failed to fetch schedules", 
      details: err.message 
    });
  }
});

app.post('/api/sms/send', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, error: 'Authorization token required' });
    }
    const { from, to, content } = req.body;
    if (!from || !to || !content) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields (from, to, content)'
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
    return res.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    return res.status(500).json({ 
      success: false,
      error: "Failed to send SMS",
      details: err.message 
    });
  }
});

app.get("/api/sms/logs", async (req: Request, res: Response) => {
  try {
    const logs = await SMSLog.find({ order: { sentAt: "DESC" } });
    res.json(logs);
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ 
      error: "Failed to fetch logs", 
      details: err.message 
    });
  }
});

app.get("/api/recipients/list", async (req: Request, res: Response) => {
  try {
    const recipients = await Recipient.find();
    res.json(recipients);
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ 
      error: "Failed to fetch recipients", 
      details: err.message 
    });
  }
});

const MAX_RETRIES = 5;
const RETRY_DELAY = 5000;

const initializeDatabase = async (attempt = 1): Promise<void> => {
  const desiredPort = parseInt(process.env.PORT || '5000');
  const availablePort = await detect(desiredPort);

  if (availablePort !== desiredPort) {
    console.warn(`⚠️  Port ${desiredPort} in use. Switching to ${availablePort}`);
    process.env.PORT = availablePort.toString();
  }

  try {
    await AppDataSource.initialize();
    startApplicationServices(availablePort);
  } catch (error: unknown) {
    const err = error as Error;
    if (attempt < MAX_RETRIES) {
      setTimeout(() => initializeDatabase(attempt + 1), RETRY_DELAY);
    } else {
      process.exit(1);
    }
  }
};

const startApplicationServices = (port: number): void => {
  const smsService = new HubtelSMS(
    process.env.HUBTEL_CLIENT_ID!,
    process.env.HUBTEL_CLIENT_SECRET!
  );
  const scheduleService = new ScheduleService();
  const attendanceService = new AttendanceService(
    process.env.ATTENDANCE_API_URL!,
    process.env.ATTENDANCE_API_TOKEN!
  );
  const server = app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
    scheduleBackgroundJobs(smsService, scheduleService, attendanceService);
  });

  process.on("SIGTERM", () => shutdown(server));
  process.on("SIGINT", () => shutdown(server));
};

const scheduleBackgroundJobs = (
  smsService: HubtelSMS,
  scheduleService: ScheduleService,
  attendanceService: AttendanceService
): void => {
  cron.scheduleJob("*/5 * * * *", async () => {
    try {
      const pending = await scheduleService.getPendingSchedules();
      for (const schedule of pending) {
        await processSchedule(schedule, smsService, scheduleService, attendanceService);
      }
    } catch {}
  });
};

const processSchedule = async (
  schedule: Schedule,
  smsService: HubtelSMS,
  scheduleService: ScheduleService,
  attendanceService: AttendanceService
): Promise<void> => {
  try {
    const recipients = await scheduleService.getRecipients(schedule.id);
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
      } catch {}
    }
  } catch {}
};

const shutdown = (server: ReturnType<typeof app.listen>): void => {
  server.close(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
};

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  res.status(500).json({ error: 'Internal Server Error' });
});

initializeDatabase().catch(() => process.exit(1));