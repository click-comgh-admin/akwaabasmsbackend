import { Request, Response } from "express";
import { SMSLog } from "../entities/SMSLog";
import { Recipient } from "../entities/Recipient";
import { HubtelSMS } from "../services/sms.service";
import { validateSession } from "../utils/validateSession";

interface HubtelResponse {
  Status: string;
  Message: string;
  MessageId: string;
  NetworkId?: string;
  // Add other Hubtel response properties as needed
}

export async function sendSMS(req: Request, res: Response) {
  const valid = validateSession(req, res);
  if (!valid) return;

  const { from, to, content, frequency, scheduleId, isAdmin } = req.body;

  // Validate required body fields
  if (!from || !content || !frequency || !scheduleId) {
    console.error("[SMS] Missing required fields", { from, content, frequency, scheduleId });
    return res.status(400).json({
      success: false,
      error: "Missing required fields (from, content, frequency, scheduleId)",
    });
  }

  const recipients = Array.isArray(to) ? to : [to];
  if (recipients.length === 0) {
    console.error("[SMS] No recipients provided");
    return res.status(400).json({
      success: false,
      error: "At least one recipient is required",
    });
  }

  if (content.length > 160) {
    console.error("[SMS] Message too long", { length: content.length });
    return res.status(400).json({
      success: false,
      error: "Message content exceeds 160 character limit",
    });
  }

  try {
    const smsService = new HubtelSMS(
      process.env.HUBTEL_CLIENT_ID!,
      process.env.HUBTEL_CLIENT_SECRET!
    );

    const results = [];
    let successfulSends = 0;

    for (const phone of recipients) {
      const logEntry = new SMSLog();
      logEntry.recipient = phone;
      logEntry.message = content;
      logEntry.status = 'pending';
      logEntry.sentAt = new Date();
      logEntry.frequency = frequency;

      try {
        // Format phone number to international standard
        const formattedPhone = formatPhoneNumber(phone);
        if (!formattedPhone) {
          throw new Error("Invalid phone number format");
        }

        console.log(`[SMS] Processing recipient: ${formattedPhone}`);

        // Check for existing recipient
        const existing = await Recipient.findOneBy({
          phone: formattedPhone,
          scheduleId: Number(scheduleId),
        });

        if (existing) {
          logEntry.status = 'failed';
          logEntry.error = "Recipient already exists";
          await logEntry.save();

          console.warn(`[SMS] Recipient ${formattedPhone} already exists for schedule ${scheduleId}`);
          results.push({
            phone: formattedPhone,
            success: false,
            error: "Recipient already exists for this schedule",
          });
          continue;
        }

        // Send SMS via Hubtel
        console.log(`[SMS] Sending to ${formattedPhone} via Hubtel`);
        const hubtelResponse = await smsService.sendSMS({ 
          from, 
          to: formattedPhone, 
          content 
        }) as HubtelResponse;

        console.log('[SMS] Hubtel raw response:', hubtelResponse);

        // Validate Hubtel response
        if (!hubtelResponse || hubtelResponse.Status !== "0") {
          const errorMsg = hubtelResponse?.Message || "No response from Hubtel";
          logEntry.status = 'failed';
          logEntry.error = errorMsg;
          logEntry.response = hubtelResponse;
          await logEntry.save();

          console.error(`[SMS] Hubtel API failure for ${formattedPhone}:`, errorMsg);
          results.push({
            phone: formattedPhone,
            success: false,
            error: errorMsg,
          });
          continue;
        }

        console.log(`[SMS] Successfully submitted to Hubtel for ${formattedPhone}`, {
          messageId: hubtelResponse.MessageId,
          network: hubtelResponse.NetworkId,
          status: hubtelResponse.Status
        });

        // Save recipient record
        const recipient = new Recipient();
        recipient.phone = formattedPhone;
        recipient.frequency = frequency;
        recipient.lastSent = new Date();
        recipient.scheduleId = Number(scheduleId);
        recipient.messageType = isAdmin ? "Admin Summary" : "User Summary";
        recipient.clientCode = valid.session.clientCode;
        recipient.isAdmin = isAdmin;
        await recipient.save();

        // Update log entry
        logEntry.status = 'sent';
        logEntry.messageId = hubtelResponse.MessageId;
        logEntry.response = hubtelResponse;
        await logEntry.save();

        successfulSends++;
        results.push({ 
          phone: formattedPhone, 
          success: true,
          messageId: hubtelResponse.MessageId
        });

        console.log(`[SMS] Successfully processed ${formattedPhone}`);
      } catch (error) {
        const errorMsg = (error as Error).message;
        logEntry.status = 'failed';
        logEntry.error = errorMsg.substring(0, 255);
        await logEntry.save();

        console.error(`[SMS] Error processing ${phone}:`, error);
        results.push({
          phone,
          success: false,
          error: errorMsg,
        });
      }
    }

    console.log(`[SMS] Completed batch: ${successfulSends} successful, ${recipients.length - successfulSends} failed`);

    return res.json({
      success: true,
      total: recipients.length,
      successful: successfulSends,
      failed: recipients.length - successfulSends,
      results,
    });
  } catch (error) {
    const err = error as Error;
    console.error("[SMS] System failure:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to send SMS",
      details: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
}

// Helper function to format phone numbers
function formatPhoneNumber(phone: string): string | null {
  if (!phone) return null;

  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');

  // Handle Ghanaian numbers (leading 0)
  if (cleaned.match(/^0\d{9}$/)) {
    return `+233${cleaned.substring(1)}`;
  }

  // Handle numbers with country code but no +
  if (cleaned.match(/^233\d{9}$/)) {
    return `+${cleaned}`;
  }

  // Handle international numbers with +
  if (cleaned.match(/^\+\d{10,15}$/)) {
    return phone;
  }

  // Handle full international numbers without +
  if (cleaned.match(/^\d{10,15}$/)) {
    return `+${cleaned}`;
  }

  console.error(`[SMS] Invalid phone number format: ${phone}`);
  return null;
}

export async function getSMSLogs(req: Request, res: Response) {
  const valid = validateSession(req, res);
  if (!valid) return;

  const { limit = 100, status, phone } = req.query;

  try {
    const queryBuilder = SMSLog.createQueryBuilder('log')
      .orderBy('log.sentAt', 'DESC')
      .take(Number(limit));

    if (status) {
      queryBuilder.andWhere('log.status = :status', { status });
    }

    if (phone) {
      queryBuilder.andWhere('log.recipient LIKE :phone', { phone: `%${phone}%` });
    }

    const logs = await queryBuilder.getMany();
    
    console.log(`[SMS] Retrieved ${logs.length} logs`);

    return res.json({
      success: true,
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    const err = error as Error;
    console.error("[SMS] Failed to fetch logs:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch logs",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}