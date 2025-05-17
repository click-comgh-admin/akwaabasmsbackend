import { Request, Response } from "express";
import { SMSLog } from "../entities/SMSLog";
import { Recipient } from "../entities/Recipient";
import { HubtelSMS } from "../services/sms.service";
import { validateSession } from "../utils/validateSession";

export async function sendSMS(req: Request, res: Response) {
  const valid = validateSession(req, res);
  if (!valid) return;

  const { from, to, content, frequency, scheduleId, isAdmin } = req.body;

  // Validate required body fields
  if (!from || !content || !frequency || !scheduleId) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields (from, content, frequency, scheduleId)",
    });
  }

  const recipients = Array.isArray(to) ? to : [to];
  if (recipients.length === 0) {
    return res.status(400).json({
      success: false,
      error: "At least one recipient is required",
    });
  }

  if (content.length > 160) {
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
        // Check for existing recipient
        const existing = await Recipient.findOneBy({
          phone,
          scheduleId: Number(scheduleId),
        });

        if (existing) {
          logEntry.status = 'failed';
          logEntry.error = "Recipient already exists";
          await logEntry.save();

          results.push({
            phone,
            success: false,
            error: "Recipient already exists for this schedule",
          });
          continue;
        }

        // Send SMS via Hubtel
        const sent = await smsService.sendSMS({ from, to: phone, content });

        if (!sent) {
          logEntry.status = 'failed';
          logEntry.error = "Hubtel API failure";
          await logEntry.save();

          results.push({
            phone,
            success: false,
            error: "Failed to send SMS through Hubtel API",
          });
          continue;
        }

        // Save recipient record
        const recipient = new Recipient();
        recipient.phone = phone;
        recipient.frequency = frequency;
        recipient.lastSent = new Date();
        recipient.scheduleId = Number(scheduleId);
        recipient.messageType = isAdmin ? "Admin Summary" : "User Summary";
        await recipient.save();

        // Update log entry
        logEntry.status = 'sent';
        await logEntry.save();

        successfulSends++;
        results.push({ phone, success: true });
      } catch (error) {
        logEntry.status = 'failed';
        logEntry.error = (error as Error).message.substring(0, 255);
        await logEntry.save();

        results.push({
          phone,
          success: false,
          error: "Failed to send SMS",
        });
      }
    }

    return res.json({
      success: true,
      total: recipients.length,
      successful: successfulSends,
      failed: recipients.length - successfulSends,
      results,
    });
  } catch (error) {
    console.error("Failed to send SMS:", error);
    const err = error as Error;

    return res.status(500).json({
      success: false,
      error: err.message.includes("160 character") ? err.message : "Failed to send SMS",
      details: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
}

// Keep the existing getSMSLogs function
export async function getSMSLogs(req: Request, res: Response) {
  const valid = validateSession(req, res);
  if (!valid) return;

  try {
    const logs = await SMSLog.find({ 
      order: { sentAt: "DESC" },
      take: 100 // Limit to 100 most recent logs by default
    });
    
    return res.json({
      success: true,
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    const err = error as Error;
    console.error("Failed to fetch logs:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch logs",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}