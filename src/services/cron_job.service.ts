import cron from "node-schedule";
import { format, subDays } from "date-fns";
import { AppDataSource } from "../config/data-source";
import { Schedule } from "../entities/Schedule";
import { HubtelSMS } from "./sms.service";
import { AttendanceService } from "./attendance.service";
import { Recipient } from "../entities/Recipient";
import { SMSLog } from "../entities/SMSLog";

const TIMEZONE = "Africa/Accra";

interface AttendanceStats {
  firstName: string;
  clockIns: number;
  lateDays: number;
  absentDays: number;
  totalHours?: number;
  scheduleName?: string;
}

function formatMessage(
  stats: AttendanceStats,
  template: string,
  scheduleName: string,
  dateRange: string
): string {
  return template
    .replace(/\[FirstName\]/g, stats.firstName)
    .replace(/\[ClockIns\]/g, stats.clockIns.toString())
    .replace(/\[LateDays\]/g, stats.lateDays.toString())
    .replace(/\[AbsentDays\]/g, stats.absentDays.toString())
    .replace(/\[TotalHours\]/g, stats.totalHours?.toString() || '0')
    .replace(/\[ScheduleName\]/g, scheduleName)
    .replace(/\[DateRange\]/g, dateRange);
}

function getStartDate(frequency: string): string {
  const now = new Date();
  let startDate: Date;

  switch (frequency) {
    case "Daily":
      startDate = subDays(now, 1);
      break;
    case "Weekly":
      startDate = subDays(now, 7);
      break;
    case "Monthly":
      startDate = subDays(now, 30);
      break;
    case "Quarterly":
      startDate = subDays(now, 90);
      break;
    case "Annually":
      startDate = subDays(now, 365);
      break;
    default:
      startDate = subDays(now, 1);
  }

  return format(startDate, "yyyy-MM-dd");
}

function getDateRange(frequency: string): string {
  const now = new Date();
  let startDate: Date;

  switch (frequency) {
    case "Daily":
      startDate = subDays(now, 1);
      return `${format(startDate, "d MMM")} - ${format(now, "d MMM yyyy")}`;
    case "Weekly":
      startDate = subDays(now, 7);
      return `${format(startDate, "d MMM")} - ${format(now, "d MMM yyyy")}`;
    case "Monthly":
      startDate = subDays(now, 30);
      return `${format(startDate, "d MMM")} - ${format(now, "d MMM yyyy")}`;
    case "Quarterly":
      startDate = subDays(now, 90);
      return `${format(startDate, "d MMM yyyy")} - ${format(now, "d MMM yyyy")}`;
    case "Annually":
      startDate = subDays(now, 365);
      return `${format(startDate, "d MMM yyyy")} - ${format(now, "d MMM yyyy")}`;
    default:
      return format(now, "d MMM yyyy");
  }
}

export const scheduleBackgroundJobs = (
  smsService: HubtelSMS,
  attendanceService: AttendanceService
): void => {
  if (!AppDataSource.isInitialized) {
    throw new Error("Database connection not initialized");
  }

  const scheduleRepo = AppDataSource.getRepository(Schedule);
  const recipientRepo = AppDataSource.getRepository(Recipient);
  const smsLogRepo = AppDataSource.getRepository(SMSLog);

  const processScheduleJob = async (schedule: Schedule) => {
    console.log(`[${format(new Date(), "yyyy-MM-dd HH:mm:ss")}] Processing schedule ${schedule.id}`);

    try {
      const recipients = await recipientRepo.find({
        where: { scheduleId: schedule.id }
      });

      if (recipients.length === 0) {
        console.warn(`No recipients found for schedule ${schedule.id}`);
        return;
      }

      const dateRange = getDateRange(schedule.frequency);
      const startDate = getStartDate(schedule.frequency);

      for (const recipient of recipients) {
        const logEntry = new SMSLog();
        logEntry.recipient = recipient.phone;
        logEntry.message = schedule.template ?? "";
        logEntry.status = "pending";
        logEntry.sentAt = new Date();
        logEntry.frequency = schedule.frequency;

        try {
          const stats = await attendanceService.getAttendanceSummary(
            recipient.phone,
            schedule.frequency,
            schedule.id
          );

          const message = formatMessage(
            {
              firstName: stats.firstName,
              clockIns: stats.clockIns,
              lateDays: stats.lateDays,
              absentDays: stats.absentDays,
              totalHours: stats.totalHours,
              scheduleName: stats.scheduleName
            },
            schedule.template || "",
            schedule.name,
            dateRange
          );

          const response = await smsService.sendSMS({
            from: schedule.senderName || "AKWAABA",
            to: recipient.phone,
            content: message
          });

          logEntry.status = "sent";
          logEntry.messageId = response.MessageId;
          logEntry.response = JSON.stringify(response);

          recipient.lastSent = new Date();
          await recipientRepo.save(recipient);
        } catch (error) {
          logEntry.status = "failed";
          logEntry.error = error instanceof Error ? error.message : "Unknown error";
          console.error(`Failed to send SMS to ${recipient.phone}:`, error);
        } finally {
          await smsLogRepo.save(logEntry);
        }
      }

      schedule.lastSent = new Date();
      await scheduleRepo.save(schedule);
    } catch (error) {
      console.error(`Failed to process schedule ${schedule.id}:`, error);
    }
  };

  const scheduleJobForSchedule = (schedule: Schedule) => {
    try {
      const [hours, minutes] = schedule.startTime.split(":").map(Number);
      
      const rule = new cron.RecurrenceRule();
      rule.tz = TIMEZONE;
      rule.hour = hours;
      rule.minute = minutes;
      
      switch (schedule.frequency) {
        case "Daily":
          rule.dayOfWeek = new cron.Range(0, 6);
          break;
        case "Weekly":
          rule.dayOfWeek = 1; // Monday
          break;
        case "Monthly":
          rule.date = 1;
          break;
        case "Quarterly":
          rule.month = [0, 3, 6, 9];
          rule.date = 1;
          break;
        case "Annually":
          rule.month = 0; // January
          rule.date = 1;
          break;
        default:
          throw new Error(`Unsupported frequency: ${schedule.frequency}`);
      }

      cron.scheduleJob(`schedule-${schedule.id}`, rule, () => {
        processScheduleJob(schedule);
      });

      console.log(`Scheduled job for ${schedule.name} (${schedule.frequency} at ${schedule.startTime})`);
    } catch (error) {
      console.error(`Failed to schedule job ${schedule.id}:`, error);
    }
  };

  const initializeSchedules = async () => {
    try {
      console.log("Initializing scheduled jobs...");
      
      // Cancel all existing jobs
      for (const job in cron.scheduledJobs) {
        cron.cancelJob(job);
      }

      // Load active schedules
      const activeSchedules = await scheduleRepo.find({ 
        where: { isActive: true }
      });

      console.log(`Found ${activeSchedules.length} active schedules`);

      // Schedule new jobs
      for (const schedule of activeSchedules) {
        scheduleJobForSchedule(schedule);
      }
    } catch (error) {
      console.error("Failed to initialize schedules:", error);
    }
  };

  // Initialize on startup
  initializeSchedules();
  
  // Refresh schedules daily at midnight
  cron.scheduleJob("0 0 * * *", initializeSchedules);
};