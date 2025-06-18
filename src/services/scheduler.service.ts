// services/SchedulerService.ts
import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, LessThanOrEqual, MoreThanOrEqual } from "typeorm";
import { ScheduledMessage } from "../entities/ScheduledMessage";
import { HubtelSMS } from "./sms.service";
import { Recipient } from "../entities/Recipient";
import { SMSLog } from "../entities/SMSLog";
import { 
  differenceInDays, 
  isSameDay, 
  isSameMonth, 
  addDays,
  startOfDay,
  endOfDay
} from "date-fns";

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 2000;

  constructor(
    @InjectRepository(ScheduledMessage)
    private readonly scheduledMessageRepo: Repository<ScheduledMessage>,
    @InjectRepository(Recipient)
    private readonly recipientRepo: Repository<Recipient>,
    @InjectRepository(SMSLog)
    private readonly smsLogRepo: Repository<SMSLog>,
    private readonly smsService: HubtelSMS
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async processScheduledMessages() {
    this.logger.log("Starting scheduled message processing...");
    const today = new Date();
    const todayStart = startOfDay(today);
    const todayEnd = endOfDay(today);
    
    try {
      const messages = await this.scheduledMessageRepo.find({
        where: { 
          active: true,
          startDate: LessThanOrEqual(todayEnd),
          endDate: MoreThanOrEqual(todayStart) 
        },
        order: { id: "desc" } // Replace with a valid property to sort messages
      });

      let successCount = 0;
      let retryCount = 0;

      for (const message of messages) {
        if (!this.shouldSendToday(message, today)) continue;

        try {
          await this.sendWithRetry(message, today);
          successCount++;
        } catch (error) {
          this.logger.error(`Failed to process message ${message.id} after ${this.MAX_RETRIES} attempts: ${(error as Error).message}`);
          retryCount++;
        }
      }

      this.logger.log(`Processed ${messages.length} messages: ${successCount} succeeded, ${retryCount} failed after retries`);
    } catch (error) {
      this.logger.error(`Error in scheduled message processing: ${(error as Error).message}`);
    }
  }

  private async sendWithRetry(message: ScheduledMessage, today: Date, attempt = 1): Promise<void> {
    try {
      const formattedPhone = this.formatPhoneNumber(message.phone);
      if (!formattedPhone) {
        throw new Error("Invalid phone number format");
      }

      const smsParams = {
        from: 'AKWAABA',
        to: formattedPhone,
        content: message.content
      };

      const hubtelResponse = await this.smsService.sendSMS(smsParams);

      if (!hubtelResponse || hubtelResponse.Status !== "0") {
        throw new Error(hubtelResponse?.Message || "SMS gateway error");
      }

      await this.updateRecipientAndLog(message, today, hubtelResponse.MessageId);
    } catch (error) {
      if (attempt < this.MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));
        return this.sendWithRetry(message, today, attempt + 1);
      }
      throw error;
    }
  }

  private async updateRecipientAndLog(message: ScheduledMessage, today: Date, messageId: string) {
    // Update or create recipient record
    let recipient = await this.recipientRepo.findOne({
      where: {
        phone: message.phone,
        scheduleId: message.scheduleId,
        messageType: message.messageType
      }
    });

    if (!recipient) {
      recipient = new Recipient();
      recipient.phone = message.phone;
      recipient.scheduleId = message.scheduleId;
      recipient.messageType = message.messageType;
      recipient.clientCode = message.clientCode;
      recipient.isAdmin = message.isAdmin;
    }

    recipient.lastSent = today;
    recipient.frequency = message.frequency;
    await this.recipientRepo.save(recipient);

    // Log the successful send
    const logEntry = new SMSLog();
    logEntry.recipient = message.phone;
    logEntry.content = message.content;
    logEntry.status = 'sent';
    logEntry.sentAt = today;
    logEntry.frequency = message.frequency;
    logEntry.scheduleId = message.scheduleId;
    logEntry.isAdmin = message.isAdmin;
    logEntry.clientCode = message.clientCode;
    logEntry.messageId = messageId;
    await this.smsLogRepo.save(logEntry);
  }

  private shouldSendToday(message: ScheduledMessage, today: Date): boolean {
    // Check if we're before start date
    if (today < message.startDate) return false;
    
    // Check if we're after end date (if set)
    if (message.endDate && today > message.endDate) {
      this.scheduledMessageRepo.update(message.id, { active: false });
      return false;
    }

    // Check frequency
    const daysSinceStart = differenceInDays(today, message.startDate);
    
    switch (message.frequency.toLowerCase()) {
      case 'daily':
        return true;
      case 'weekly':
        return daysSinceStart % 7 === 0;
      case 'monthly':
        return this.isSameMonthlyDate(today, message.startDate);
      case 'quarterly':
        return this.isSameQuarterlyDate(today, message.startDate);
      case 'annually':
        return this.isSameAnnualDate(today, message.startDate);
      case 'weekdays':
        return this.isWeekday(today);
      case 'weekends':
        return this.isWeekend(today);
      default:
        return false;
    }
  }

  private isSameMonthlyDate(currentDate: Date, startDate: Date): boolean {
    return currentDate.getDate() === startDate.getDate() &&
           currentDate.getMonth() === startDate.getMonth();
  }

  private isSameQuarterlyDate(currentDate: Date, startDate: Date): boolean {
    return this.isSameMonthlyDate(currentDate, startDate) &&
           Math.floor(currentDate.getMonth() / 3) === Math.floor(startDate.getMonth() / 3);
  }

  private isSameAnnualDate(currentDate: Date, startDate: Date): boolean {
    return currentDate.getDate() === startDate.getDate() &&
           currentDate.getMonth() === startDate.getMonth();
  }

  private isWeekday(date: Date): boolean {
    const day = date.getDay();
    return day > 0 && day < 6; // Monday to Friday
  }

  private isWeekend(date: Date): boolean {
    const day = date.getDay();
    return day === 0 || day === 6; // Saturday or Sunday
  }

  private formatPhoneNumber(phone: string): string | null {
    if (!phone) return null;
    const cleaned = phone.replace(/\D/g, '');

    if (cleaned.match(/^0\d{9}$/)) return `+233${cleaned.substring(1)}`;
    if (cleaned.match(/^233\d{9}$/)) return `+${cleaned}`;
    if (cleaned.match(/^\+\d{10,15}$/)) return phone;
    if (cleaned.match(/^\d{10,15}$/)) return `+${cleaned}`;

    return null;
  }
}