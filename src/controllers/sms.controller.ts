import { Request, Response } from "express";
import { SMSLog } from "../entities/SMSLog";
import { MessageType, Recipient } from "../entities/Recipient";
import { HubtelSMS } from "../services/sms.service";
import { validateSession } from "../utils/validateSession";
import { ScheduledMessage } from "../entities/ScheduledMessage";
import { getRepository, LessThanOrEqual, MoreThanOrEqual } from "typeorm";
import { isToday, addDays, isSameDay, isSameMonth, differenceInDays } from "date-fns";

interface HubtelResponse {
  Status: string;
  Message: string;
  MessageId: string;
  NetworkId?: string;
}

interface HubtelSMSParams {
  from: string;
  to: string;
  content: string;
}

interface SMSRequest {
  from: string;
  to: string | string[];
  content: string;
  frequency: string;
  scheduleId?: number;
  isAdmin: boolean;
  clientCode?: string;
  orgName?: string;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const MAX_SENDER_LENGTH = 11;
const MAX_RECIPIENTS_PER_BATCH = 100;

export async function createScheduledMessages(req: Request, res: Response) {
  const valid = validateSession(req, res);
  if (!valid) return;

  const { 
    recipients, 
    content, 
    frequency, 
    startDate, 
    endDate, 
    isAdmin, 
    scheduleId 
  } = req.body;

  if (!recipients || !content || !frequency || !startDate) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: recipients, content, frequency, startDate"
    });
  }

  try {
    const smsService = new HubtelSMS(
      process.env.HUBTEL_CLIENT_ID!,
      process.env.HUBTEL_CLIENT_SECRET!
    );

    const scheduledMessages = [];
    const immediateSends = [];
    const today = new Date();
    const startDateTime = new Date(startDate);

    for (const phone of recipients) {
      const message = new ScheduledMessage();
      message.phone = phone;
      message.content = content;
      message.frequency = frequency;
      message.startDate = startDateTime;
      message.endDate = endDate ? new Date(endDate) : null;
      message.isAdmin = isAdmin;
      message.scheduleId = isAdmin ? 0 : (scheduleId || 0);
      message.clientCode = valid.session.clientCode;
      message.messageType = isAdmin ? MessageType.ADMIN_SUMMARY : MessageType.USER_SUMMARY;
      message.active = true;

      // If start date is today, send immediately
      if (isToday(startDateTime)) {
        try {
          const formattedPhone = formatPhoneNumber(phone);
          if (!formattedPhone) {
            throw new Error("Invalid phone number format");
          }

          const smsParams: HubtelSMSParams = {
            from: 'AKWAABA',
            to: formattedPhone,
            content: content
          };

          const hubtelResponse = await smsService.sendSMS(smsParams) as HubtelResponse;

          if (!hubtelResponse || hubtelResponse.Status !== "0") {
            throw new Error(hubtelResponse?.Message || "SMS gateway error");
          }

          // Create recipient record
          await createRecipient(
            formattedPhone,
            frequency,
            isAdmin ? 0 : scheduleId,
            valid.session.clientCode,
            isAdmin
          );

          // Log the successful send
          const logEntry = new SMSLog();
          logEntry.recipient = formattedPhone;
          logEntry.content = content;
          logEntry.status = 'sent';
          logEntry.sentAt = new Date();
          logEntry.frequency = frequency;
          logEntry.scheduleId = message.scheduleId;
          logEntry.isAdmin = isAdmin;
          logEntry.clientCode = valid.session.clientCode;
          logEntry.messageId = hubtelResponse.MessageId;
          await logEntry.save();

          immediateSends.push({
            phone: formattedPhone,
            success: true,
            messageId: hubtelResponse.MessageId
          });
        } catch (error) {
          immediateSends.push({
            phone,
            success: false,
            error: (error as Error).message
          });
          continue; // Continue with scheduling even if immediate send fails
        }
      }

      scheduledMessages.push(message);
    }

    // Save all scheduled messages
    await getRepository(ScheduledMessage).save(scheduledMessages);

    return res.json({
      success: true,
      scheduledCount: scheduledMessages.length,
      immediateSends,
      data: scheduledMessages
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to schedule messages",
      details: (error as Error).message
    });
  }
}

export async function getScheduledMessages(req: Request, res: Response) {
  const valid = validateSession(req, res);
  if (!valid) return;

  const { active, phone, frequency } = req.query;

  try {
    const query = getRepository(ScheduledMessage)
      .createQueryBuilder('message')
      .where('message.clientCode = :clientCode', { clientCode: valid.session.clientCode });

    if (active !== undefined) {
      query.andWhere('message.active = :active', { active: active === 'true' });
    }
    if (phone) {
      query.andWhere('message.phone LIKE :phone', { phone: `%${phone}%` });
    }
    if (frequency) {
      query.andWhere('message.frequency = :frequency', { frequency });
    }

    const messages = await query.getMany();
    return res.json({
      success: true,
      count: messages.length,
      data: messages
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to fetch scheduled messages",
      details: (error as Error).message
    });
  }
}

export async function cancelScheduledMessage(req: Request, res: Response) {
  const valid = validateSession(req, res);
  if (!valid) return;

  const { id } = req.params;

  try {
    const result = await getRepository(ScheduledMessage)
      .createQueryBuilder()
      .update()
      .set({ active: false })
      .where('id = :id AND clientCode = :clientCode', {
        id,
        clientCode: valid.session.clientCode
      })
      .execute();

    if (result.affected === 0) {
      return res.status(404).json({
        success: false,
        error: "Message not found or already cancelled"
      });
    }

    return res.json({
      success: true,
      message: "Scheduled message cancelled"
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to cancel scheduled message",
      details: (error as Error).message
    });
  }
}

export const getSMSLogs = async (req: Request, res: Response) => {
  const valid = validateSession(req, res);
  if (!valid) return;

  const { limit = 100, status, phone, startDate, endDate } = req.query;
  const { clientCode } = valid.session;

  try {
    const queryBuilder = SMSLog.createQueryBuilder('log')
      .where('log.clientCode = :clientCode', { clientCode })
      .orderBy('log.sentAt', 'DESC')
      .take(Math.min(Number(limit), 500));

    if (status) queryBuilder.andWhere('log.status = :status', { status });
    if (phone) queryBuilder.andWhere('log.recipient LIKE :phone', { phone: `%${phone}%` });
    if (startDate) queryBuilder.andWhere('log.sentAt >= :startDate', { startDate });
    if (endDate) queryBuilder.andWhere('log.sentAt <= :endDate', { endDate });

    const logs = await queryBuilder.getMany();
    return res.json({
      success: true,
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to fetch logs",
      details: process.env.NODE_ENV === "development" 
        ? (error as Error).message 
        : undefined,
    });
  }
};

async function createRecipient(
  phone: string,
  frequency: string,
  scheduleId?: number,
  clientCode?: string,
  isAdmin: boolean = false
) {
  const recipient = new Recipient();
  recipient.phone = phone;
  recipient.frequency = frequency;
  recipient.lastSent = new Date();
  recipient.scheduleId = isAdmin ? 0 : Number(scheduleId);
  recipient.messageType = isAdmin ? MessageType.ADMIN_SUMMARY : MessageType.USER_SUMMARY;
  recipient.clientCode = clientCode;
  recipient.isAdmin = isAdmin;
  await recipient.save();
}

function formatPhoneNumber(phone: string): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, '');

  if (cleaned.match(/^0\d{9}$/)) return `+233${cleaned.substring(1)}`;
  if (cleaned.match(/^233\d{9}$/)) return `+${cleaned}`;
  if (cleaned.match(/^\+\d{10,15}$/)) return phone;
  if (cleaned.match(/^\d{10,15}$/)) return `+${cleaned}`;

  return null;
}

// Scheduled message processing (should be called by a cron job)
export async function processScheduledMessages() {
  const today = new Date();
  
  try {
    const messages = await getRepository(ScheduledMessage)
      .createQueryBuilder('message')
      .where('message.active = :active', { active: true })
      .andWhere('message.startDate <= :today', { today })
      .andWhere('(message.endDate IS NULL OR message.endDate >= :today)', { today })
      .getMany();

    const smsService = new HubtelSMS(
      process.env.HUBTEL_CLIENT_ID!,
      process.env.HUBTEL_CLIENT_SECRET!
    );

    for (const message of messages) {
      if (!shouldSendToday(message, today)) continue;

      try {
        const formattedPhone = formatPhoneNumber(message.phone);
        if (!formattedPhone) {
          throw new Error("Invalid phone number format");
        }

        const smsParams: HubtelSMSParams = {
          from: 'AKWAABA',
          to: formattedPhone,
          content: message.content
        };

        const hubtelResponse = await smsService.sendSMS(smsParams) as HubtelResponse;

        if (!hubtelResponse || hubtelResponse.Status !== "0") {
          throw new Error(hubtelResponse?.Message || "SMS gateway error");
        }

        // Update recipient record
        await createRecipient(
          formattedPhone,
          message.frequency,
          message.scheduleId,
          message.clientCode,
          message.isAdmin
        );

        // Log the successful send
        const logEntry = new SMSLog();
        logEntry.recipient = formattedPhone;
        logEntry.content = message.content;
        logEntry.status = 'sent';
        logEntry.sentAt = new Date();
        logEntry.frequency = message.frequency;
        logEntry.scheduleId = message.scheduleId;
        logEntry.isAdmin = message.isAdmin;
        logEntry.clientCode = message.clientCode;
        logEntry.messageId = hubtelResponse.MessageId;
        await logEntry.save();

      } catch (error) {
        console.error(`Failed to process scheduled message ${message.id}: ${(error as Error).message}`);
      }
    }
  } catch (error) {
    console.error(`Error in scheduled message processing: ${(error as Error).message}`);
  }
}

function shouldSendToday(message: ScheduledMessage, today: Date): boolean {
  const daysSinceStart = differenceInDays(today, message.startDate);
  
  switch (message.frequency.toLowerCase()) {
    case 'daily':
      return true;
    case 'weekly':
      return daysSinceStart % 7 === 0;
    case 'monthly':
      return isSameDay(today, message.startDate) && 
             isSameMonth(today, message.startDate);
    case 'quarterly':
      return isSameQuarter(today, message.startDate) &&
             isSameDay(today, message.startDate);
    case 'annually':
      return isSameMonth(today, message.startDate) &&
             isSameDay(today, message.startDate);
    default:
      return false;
  }
}

function isSameQuarter(date1: Date, date2: Date): boolean {
  const quarter1 = Math.floor(date1.getMonth() / 3);
  const quarter2 = Math.floor(date2.getMonth() / 3);
  return quarter1 === quarter2;
}