import { Request, Response } from "express";
import { SMSLog } from "../entities/SMSLog";
import { getRepository } from "typeorm";
import { MessageType, Recipient } from "../entities/Recipient";
import { HubtelSMS } from "../services/sms.service";
import { validateSession } from "../utils/validateSession";

interface HubtelResponse {
  Status: string;
  Message: string;
  MessageId: string;
  NetworkId?: string;
}

export async function sendSMS(req: Request, res: Response) {
  const valid = validateSession(req, res);
  if (!valid) return;

  const { from, to, content, frequency, scheduleId, isAdmin } = req.body;

  if (!from || !content || !frequency) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields (from, content, frequency)",
    });
  }

  const recipients = Array.isArray(to) ? to : [to];
  if (recipients.length === 0) {
    return res.status(400).json({
      success: false,
      error: "At least one recipient is required",
    });
  }

  try {
    const smsService = new HubtelSMS(
      process.env.HUBTEL_CLIENT_ID!,
      process.env.HUBTEL_CLIENT_SECRET!
    );

    const results = await Promise.all(recipients.map(async (phone) => {
      const logEntry = new SMSLog();
      logEntry.recipient = phone;
      logEntry.content = content;
      logEntry.status = 'pending';
      logEntry.sentAt = new Date();
      logEntry.frequency = frequency;

      try {
        const formattedPhone = formatPhoneNumber(phone);
        if (!formattedPhone) {
          throw new Error("Invalid phone number format");
        }

        if (!isAdmin) {
          const existing = await Recipient.findOneBy({
            phone: formattedPhone,
            scheduleId: Number(scheduleId),
          });
          if (existing) {
            throw new Error("Recipient already exists for this schedule");
          }
        }

        const hubtelResponse = await smsService.sendSMS({ 
          from, 
          to: formattedPhone, 
          content 
        }) as HubtelResponse;

        if (!hubtelResponse || hubtelResponse.Status !== "0") {
          throw new Error(hubtelResponse?.Message || "SMS gateway error");
        }

        if (!isAdmin) {
          const recipient = new Recipient();
          recipient.phone = formattedPhone;
          recipient.frequency = frequency;
          recipient.lastSent = new Date();
          recipient.scheduleId = Number(scheduleId);
          recipient.messageType = MessageType.USER_SUMMARY;
          recipient.clientCode = valid.session.clientCode;
          recipient.isAdmin = false;
        await getRepository(SMSLog).save(logEntry);
        }

        logEntry.status = 'sent';
        logEntry.messageId = hubtelResponse.MessageId;
        logEntry.response = hubtelResponse;
        await logEntry.save();

        return { 
          phone: formattedPhone, 
          success: true,
          messageId: hubtelResponse.MessageId
        };
      } catch (error) {
        const errorMsg = (error as Error).message;
        logEntry.status = 'failed';
        logEntry.error = errorMsg.substring(0, 255);
        await logEntry.save();

        return {
          phone,
          success: false,
          error: errorMsg
        };
      }
    }));

    const successfulSends = results.filter(r => r.success).length;
    return res.json({
      success: true,
      total: recipients.length,
      successful: successfulSends,
      failed: recipients.length - successfulSends,
      results,
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
export const getSMSLogs = async (req: Request, res: Response) => {
  const valid = validateSession(req, res);
  if (!valid) return;

  const { limit = 100, status, phone } = req.query;

  try {
    const queryBuilder = SMSLog.createQueryBuilder('log')
      .orderBy('log.sentAt', 'DESC')
      .take(Number(limit));

    if (status) queryBuilder.andWhere('log.status = :status', { status });
    if (phone) queryBuilder.andWhere('log.recipient LIKE :phone', { phone: `%${phone}%` });

    const logs = await queryBuilder.getMany();
    return res.json({
      success: true,
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    const err = error as Error;
    return res.status(500).json({
      success: false,
      error: "Failed to fetch logs",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
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