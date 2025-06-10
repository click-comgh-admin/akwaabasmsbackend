import { Request, Response } from "express";
import { SMSLog } from "../entities/SMSLog";
import { MessageType, Recipient } from "../entities/Recipient";
import { HubtelSMS } from "../services/sms.service";
import { validateSession } from "../utils/validateSession";
import { getRepository } from "typeorm";
import axios from "axios";

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

export async function sendSMS(req: Request, res: Response) {
  const valid = validateSession(req, res);
  if (!valid) return;

  const { from, to, content, frequency, scheduleId, isAdmin } = req.body;
  const { clientCode, organizationName } = valid.session;

  if (!from || !content || !frequency) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: from, content, frequency"
    });
  }

  if (from.length > MAX_SENDER_LENGTH) {
    return res.status(400).json({
      success: false,
      error: `Sender name exceeds ${MAX_SENDER_LENGTH} characters`
    });
  }

  const recipients = Array.isArray(to) ? to : [to];
  if (recipients.length === 0) {
    return res.status(400).json({
      success: false,
      error: "At least one recipient is required"
    });
  }

  if (recipients.length > MAX_RECIPIENTS_PER_BATCH) {
    return res.status(400).json({
      success: false,
      error: `Maximum ${MAX_RECIPIENTS_PER_BATCH} recipients per request`
    });
  }

  try {
    const smsService = new HubtelSMS(
      process.env.HUBTEL_CLIENT_ID!,
      process.env.HUBTEL_CLIENT_SECRET!
    );

    const results = await processRecipientsBatch(
      recipients,
      smsService,
      { from, content, frequency, scheduleId, isAdmin, clientCode, organizationName }
    );

    return res.json({
      success: true,
      total: recipients.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
      clientCode,
      orgName: organizationName
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "SMS processing failed",
      details: process.env.NODE_ENV === "development" 
        ? (error as Error).message 
        : undefined,
    });
  }
}

async function processRecipientsBatch(
  recipients: string[],
  smsService: HubtelSMS,
  params: {
    from: string;
    content: string;
    frequency: string;
    scheduleId?: number;
    isAdmin: boolean;
    clientCode: string;
    organizationName: string;
  }
) {
  return Promise.all(recipients.map(async (phone) => {
    const logEntry = new SMSLog();
    logEntry.recipient = phone;
    logEntry.content = params.content;
    logEntry.status = 'pending';
    logEntry.sentAt = new Date();
    logEntry.frequency = params.frequency;
    logEntry.scheduleId = params.scheduleId || 0;
    logEntry.isAdmin = params.isAdmin;
    if ('clientCode' in logEntry) {
      logEntry.clientCode = params.clientCode;
    }

    try {
      const formattedPhone = formatPhoneNumber(phone);
      if (!formattedPhone) {
        throw new Error("Invalid phone number format");
      }

      if (!params.isAdmin) {
        const existing = await Recipient.findOneBy({
          phone: formattedPhone,
          scheduleId: Number(params.scheduleId),
        });
        if (existing) {
          throw new Error("Recipient already exists for this schedule");
        }
      }

      const smsParams: HubtelSMSParams = {
        from: params.from,
        to: formattedPhone,
        content: params.content
      };

      const hubtelResponse = await smsService.sendSMS(smsParams) as HubtelResponse;

      if (!hubtelResponse || hubtelResponse.Status !== "0") {
        throw new Error(hubtelResponse?.Message || "SMS gateway error");
      }

      if (!params.isAdmin) {
        await createRecipient(
          formattedPhone,
          params.frequency,
          params.scheduleId,
          params.clientCode
        );
      }

      logEntry.status = 'sent';
      logEntry.messageId = hubtelResponse.MessageId;
      await logEntry.save();

      return { 
        phone: formattedPhone, 
        success: true,
        parts: 1
      };
    } catch (error) {
      logEntry.status = 'failed';
      logEntry.error = (error as Error).message.substring(0, 255);
      await logEntry.save();

      return {
        phone,
        success: false,
        error: (error as Error).message
      };
    }
  }));
}

async function createRecipient(
  phone: string,
  frequency: string,
  scheduleId?: number,
  clientCode?: string
) {
  const recipient = new Recipient();
  recipient.phone = phone;
  recipient.frequency = frequency;
  recipient.lastSent = new Date();
  recipient.scheduleId = Number(scheduleId);
  recipient.messageType = MessageType.USER_SUMMARY;
  recipient.clientCode = clientCode;
  recipient.isAdmin = false;
  await recipient.save();
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

function formatPhoneNumber(phone: string): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, '');

  if (cleaned.match(/^0\d{9}$/)) return `+233${cleaned.substring(1)}`;
  if (cleaned.match(/^233\d{9}$/)) return `+${cleaned}`;
  if (cleaned.match(/^\+\d{10,15}$/)) return phone;
  if (cleaned.match(/^\d{10,15}$/)) return `+${cleaned}`;

  return null;
}
