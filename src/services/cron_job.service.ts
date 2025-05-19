import cron from "node-schedule";
import { format, subDays } from "date-fns";
import { AppDataSource } from "../config/data-source";
import { Schedule } from "../entities/Schedule";
import { HubtelSMS } from "./sms.service";
import { AttendanceService } from "./attendance.service";

const TIMEZONE = "Africa/Accra";

function formatMessage(
  stats: any,
  template: string,
  scheduleName: string,
  dateRange: string
): string {
  return template
    .replace(/\[ClockIns\]/g, stats.clockIns.toString())
    .replace(/\[LateDays\]/g, stats.lateDays.toString())
    .replace(/\[AbsentDays\]/g, stats.absentDays.toString())
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

  const scheduleSMSJob = async (schedule: Schedule) => {
    try {
      const { frequency, startTime } = schedule;
      const [hours, minutes] = startTime.split(":").map(Number);

      const jobCallback = async () => {
        console.log(`[${format(new Date(), "yyyy-MM-dd HH:mm:ss")}] Running SMS job for schedule ${schedule.id}...`);

        try {
          const recipients = await scheduleRepo
            .createQueryBuilder("schedule")
            .relation(Schedule, "recipients")
            .of(schedule)
            .loadMany();

          if (recipients.length === 0) {
            console.warn(`No recipients found for schedule ${schedule.id}. Skipping.`);
            return;
          }

          for (const recipient of recipients) {
            try {
              const stats = await attendanceService.getAttendanceSummary(
                recipient.phone,
                frequency,
                schedule.id
              );

              const message = formatMessage(
                stats,
                schedule.template || "",
                schedule.name,
                getDateRange(frequency)
              );

              await smsService.sendSMS({
                from: schedule.senderName || "AKWAABA",
                to: recipient.phone,
                content: message,
              });

              console.log(`Sent SMS to ${recipient.phone} for schedule ${schedule.id}.`);
            } catch (error) {
              console.error(`Failed to send SMS to ${recipient.phone}:`, error);
            }
          }

          schedule.lastSent = new Date();
          await scheduleRepo.save(schedule);
        } catch (error) {
          console.error(`Failed to process schedule ${schedule.id}:`, error);
        }
      };

      switch (frequency) {
        case "Daily":
          cron.scheduleJob(`schedule-${schedule.id}`, `0 ${minutes} ${hours} * * *`, jobCallback);
          break;
        case "Weekly":
          cron.scheduleJob(`schedule-${schedule.id}`, `0 ${minutes} ${hours} * * 1`, jobCallback);
          break;
        case "Monthly":
          cron.scheduleJob(`schedule-${schedule.id}`, `0 ${minutes} ${hours} 1 * *`, jobCallback);
          break;
        case "Quarterly":
          cron.scheduleJob(`schedule-${schedule.id}`, `0 ${minutes} ${hours} 1 */3 *`, jobCallback);
          break;
        case "Annually":
          cron.scheduleJob(`schedule-${schedule.id}`, `0 ${minutes} ${hours} 1 1 *`, jobCallback);
          break;
        default:
          throw new Error(`Unsupported frequency: ${frequency}`);
      }

      console.log(`Scheduled job for ${schedule.name} (${frequency} at ${startTime})`);
    } catch (error) {
      console.error(`Failed to schedule job for ${schedule.id}:`, error);
    }
  };

  const initializeSchedules = async () => {
    try {
      // Remove the isActive filter since it's not in your entity
      const activeSchedules = await scheduleRepo.find();
      console.log(`Found ${activeSchedules.length} schedules.`);

      for (const job in cron.scheduledJobs) {
        cron.cancelJob(job);
      }

      for (const schedule of activeSchedules) {
        await scheduleSMSJob(schedule);
      }
    } catch (error) {
      console.error("Failed to initialize schedules:", error);
    }
  };

  initializeSchedules();
  cron.scheduleJob("0 0 * * *", initializeSchedules);
};