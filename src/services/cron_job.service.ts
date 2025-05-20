import { AppDataSource } from "../config/data-source";
import { Recipient, MessageType } from "../entities/Recipient";
import { SMSLog } from "../entities/SMSLog";
import { CronLog } from "../entities/CronLog";
import { HubtelSMS } from "./sms.service";
import { Schedule } from "../entities/Schedule";
import { addDays, subDays, addMonths, subMonths, addYears, subYears, isAfter, format } from "date-fns";
import { toZonedTime } from 'date-fns-tz';
import { Repository } from "typeorm";
import * as cron from "node-cron";

const GHANA_TIMEZONE = 'Africa/Accra';

export class CronJobService {
  private recipientRepo: Repository<Recipient>;
  private smsLogRepo: Repository<SMSLog>;
  private scheduleRepo: Repository<Schedule>;
  private cronLogRepo: Repository<CronLog>;
  private smsService: HubtelSMS;

  constructor(smsService: HubtelSMS) {
    this.recipientRepo = AppDataSource.getRepository(Recipient);
    this.smsLogRepo = AppDataSource.getRepository(SMSLog);
    this.scheduleRepo = AppDataSource.getRepository(Schedule);
    this.cronLogRepo = AppDataSource.getRepository(CronLog);
    this.smsService = smsService;
  }

async runScheduledSMSJob(): Promise<void> {
  const ghanaNow = toZonedTime(new Date(), GHANA_TIMEZONE);
  const log = new CronLog();
  log.jobType = "SMS_DELIVERY";
  log.status = "started";
  log.details = `Starting SMS delivery job at ${ghanaNow.toISOString()}`;
  await this.cronLogRepo.save(log);

  try {
    const recipients = await this.recipientRepo.find({
      where: { isActive: true },
      relations: ["schedule"]
    });

    let processedCount = 0;
    let successCount = 0;
    const batchDelaySeconds = 10;

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];

      // Wait for staggered delay before processing this recipient
      await this.delay(i * batchDelaySeconds * 1000);

      try {
        const result = await this.processRecipient(recipient, ghanaNow);
        if (result.success) successCount++;
        processedCount++;
      } catch (error) {
        console.error(`Error processing recipient ${recipient.id}:`, error);
        await this.handleRecipientError(recipient, error);
      }
    }

    log.status = "completed";
    log.processedCount = processedCount;
    log.details = `Completed SMS delivery job. Success: ${successCount}, Failed: ${processedCount - successCount}`;
    await this.cronLogRepo.save(log);
  } catch (error) {
    log.status = "failed";
    log.details = `Job failed: ${error instanceof Error ? error.message : String(error)}`;
    await this.cronLogRepo.save(log);
    console.error("Scheduled SMS job failed:", error);
  }
}
private async delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


private async processRecipient(recipient: Recipient, currentDate: Date): Promise<{ success: boolean }> {
  if (recipient.nextRetryAt && isAfter(recipient.nextRetryAt, currentDate)) {
    return { success: false };
  }

  if (!recipient.startDate) {
    console.warn(`Recipient ${recipient.id} has no startDate set.`);
    return { success: false };
  }

  const nextSendDate = this.calculateNextSendDate(
    recipient.lastSent,
    recipient.frequency,
    recipient.startDate,
    currentDate
  );

  if (!nextSendDate) {
    console.warn(`No next send date for recipient ${recipient.id}`);
    return { success: false };
  }

  if (isAfter(nextSendDate, currentDate)) {
    return { success: false };
  }

    const { startDate, endDate } = this.getDateRange(recipient.frequency, currentDate);
    const schedule = recipient.schedule;

    if (!schedule) {
      console.warn(`Schedule not found for recipient ${recipient.id}`);
      return { success: false };
    }

    const message = this.formatMessage(
      recipient.messageType === MessageType.ADMIN_SUMMARY
        ? this.getAdminTemplate(recipient.frequency)
        : this.getUserTemplate(recipient.frequency),
      schedule.name,
      { start: startDate, end: endDate },
      recipient.frequency,
      "Organization"
    );

    try {
      const response = await this.smsService.sendSMS({
        from: schedule.senderName || "AKWAABA",
        to: recipient.phone,
        content: message
      });

      recipient.lastSent = currentDate;
      recipient.retryAttempts = 0;
      recipient.nextRetryAt = undefined; // Changed from null to undefined
      await this.recipientRepo.save(recipient);

      await this.logSMS({
        recipientId: recipient.id,
        phone: recipient.phone,
        message,
        status: "sent",
        messageId: response.MessageId,
        frequency: recipient.frequency,
        scheduleId: recipient.scheduleId,
        isAdmin: recipient.messageType === MessageType.ADMIN_SUMMARY
      });

      return { success: true };
    } catch (error) {
      await this.handleRecipientError(recipient, error);
      return { success: false };
    }
  }

  private calculateNextSendDate(
    lastSent: Date | undefined,
    frequency: string,
    startDate: Date,
    currentDate: Date
  ): Date | undefined {
    if (!lastSent) {
      return isAfter(startDate, currentDate) ? undefined : startDate;
    }

    switch (frequency) {
      case "Daily":
        return addDays(lastSent, 1);
      case "Weekly":
        return addDays(lastSent, 7);
      case "Monthly":
        const nextMonth = addMonths(lastSent, 1);
        if (nextMonth.getMonth() !== (lastSent.getMonth() + 1) % 12) {
          return new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0);
        }
        return nextMonth;
      case "Quarterly":
        return addMonths(lastSent, 3);
      case "Annually":
        return addYears(lastSent, 1);
      default:
        return undefined;
    }
  }

  private getDateRange(frequency: string, endDate: Date): { startDate: Date; endDate: Date } {
    const startDate = new Date(endDate);
    
    switch (frequency) {
      case "Daily":
        startDate.setDate(endDate.getDate() - 1);
        break;
      case "Weekly":
        startDate.setDate(endDate.getDate() - 7);
        break;
      case "Monthly":
        startDate.setMonth(endDate.getMonth() - 1);
        break;
      case "Quarterly":
        startDate.setMonth(endDate.getMonth() - 3);
        break;
      case "Annually":
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(endDate.getDate() - 1);
    }

    return { startDate, endDate };
  }

  private async handleRecipientError(recipient: Recipient, error: unknown): Promise<void> {
    const maxRetries = 3;
    const retryDelays = [2, 6, 24]; // Hours between retries

    recipient.retryAttempts += 1;

    if (recipient.retryAttempts >= maxRetries) {
      recipient.isActive = false;
      recipient.nextRetryAt = undefined; // Changed from null to undefined
      console.warn(`Deactivating recipient ${recipient.id} after ${maxRetries} failed attempts`);
    } else {
      const delayHours = retryDelays[recipient.retryAttempts - 1] || 24;
      const nextRetry = new Date();
      nextRetry.setHours(nextRetry.getHours() + delayHours);
      recipient.nextRetryAt = nextRetry;
    }

    await this.recipientRepo.save(recipient);

    const errorMessage = error instanceof Error ? error.message : String(error);
    await this.logSMS({
      recipientId: recipient.id,
      phone: recipient.phone,
      message: "Failed to send SMS",
      status: "failed",
      error: errorMessage,
      frequency: recipient.frequency,
      scheduleId: recipient.scheduleId,
      isAdmin: recipient.messageType === MessageType.ADMIN_SUMMARY
    });
  }

  private getAdminTemplate(frequency: string): string {
    return `Hi Admin, here's the ${frequency.toLowerCase()} attendance report for [ScheduleName] [DateRange].\n` +
           `Total Attendees: [ClockIns]\n` +
           `Late Comers: [LateTotal]\n` +
           `Absentees: [AbsentTotal]\n` +
           `Total Work Hours: [TotalWorkHours]\n` +
           `From [ClientName]`;
  }

  private getUserTemplate(frequency: string): string {
    return `Hi [FirstName], here's your ${frequency.toLowerCase()} attendance report for [ScheduleName] [DateRange].\n` +
           `Clock Ins: [ClockIns]\n` +
           `Clock Outs: [ClockOuts]\n` +
           `Late Days: [LateDays]\n` +
           `Absent Days: [AbsentDays]\n` +
           `From [ClientName]`;
  }

  private formatMessage(
    template: string,
    scheduleName: string,
    dateRange: { start: Date; end: Date },
    frequency: string,
    clientName: string,
    firstName?: string
  ): string {
    const formattedDateRange = this.formatDateRange(dateRange, frequency);
    
    return template
      .replace(/\[ScheduleName\]/g, scheduleName)
      .replace(/\[DateRange\]/g, formattedDateRange)
      .replace(/\[ClockIns\]/g, "0") // Placeholder - should be replaced with actual data
      .replace(/\[ClockOuts\]/g, "0")
      .replace(/\[LateDays\]/g, "0")
      .replace(/\[LateTotal\]/g, "0")
      .replace(/\[AbsentDays\]/g, "0")
      .replace(/\[AbsentTotal\]/g, "0")
      .replace(/\[TotalWorkHours\]/g, "0")
      .replace(/\[ClientName\]/g, clientName)
      .replace(/\[FirstName\]/g, firstName || "User");
  }

  private formatDateRange(dateRange: { start: Date; end: Date }, frequency: string): string {
    if (frequency === "Daily") {
      return `on ${format(dateRange.end, 'MMMM d, yyyy')}`;
    }
    return `from ${format(dateRange.start, 'MMMM d')} to ${format(dateRange.end, 'MMMM d, yyyy')}`;
  }

  private async logSMS(params: {
    recipientId: number;
    phone: string;
    message: string;
    status: "sent" | "failed";
    messageId?: string;
    error?: string;
    frequency: string;
    scheduleId: number;
    isAdmin: boolean;
  }): Promise<void> {
    const smsLog = new SMSLog();
    smsLog.recipient = params.phone;
    smsLog.content = params.message;
    smsLog.status = params.status;
    smsLog.sentAt = new Date();
    smsLog.frequency = params.frequency;
    smsLog.scheduleId = params.scheduleId;
    smsLog.isAdmin = params.isAdmin;
    
    if (params.messageId) smsLog.messageId = params.messageId;
    if (params.error) smsLog.error = params.error;

    await this.smsLogRepo.save(smsLog);
  }
}

export function scheduleBackgroundJobs(smsService: HubtelSMS): void {
  // Run daily at 10:10pm Ghana time (10 minutes after typical end time)
  cron.schedule("10 22 * * *", async () => {
    console.log(`Running scheduled SMS job at ${new Date().toLocaleString('en-GH', { timeZone: GHANA_TIMEZONE })}`);
    const service = new CronJobService(smsService);
    await service.runScheduledSMSJob();
  }, {
    timezone: GHANA_TIMEZONE
  });

  // Additional cleanup job runs weekly on Sundays at midnight
  cron.schedule("0 0 * * 0", async () => {
    console.log("Running weekly cleanup job");
    const logRepo = AppDataSource.getRepository(CronLog);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30); // Keep logs for 30 days
    
    await logRepo.createQueryBuilder()
      .delete()
      .where("createdAt < :cutoff", { cutoff: cutoffDate })
      .execute();
  }, {
    timezone: GHANA_TIMEZONE
  });
}