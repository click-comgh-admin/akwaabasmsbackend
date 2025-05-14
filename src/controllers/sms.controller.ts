import { Request, Response } from "express";
import { SMSLog } from "../entities/SMSLog";
import { Recipient } from "../entities/Recipient";
import { HubtelSMS } from "../services/sms.service";
import { validateSession } from "../utils/validateSession";

// @route   POST /api/sms/send
// @desc    Send SMS to recipient and store them
// @access  Protected (requires authToken cookie)
export async function sendSMS(req: Request, res: Response) {
  const valid = validateSession(req, res);
  if (!valid) return;

  const { from, to, content, frequency, scheduleId, isAdmin } = req.body;

  // ✅ Validate required body fields
  if (!from || !to || !content || !frequency || !scheduleId) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields (from, to, content, frequency, scheduleId)",
    });
  }

  if (content.length > 160) {
    return res.status(400).json({
      success: false,
      error: "Message content exceeds 160 character limit",
    });
  }

  try {
    // 📦 Check if recipient already exists
    const existing = await Recipient.findOneBy({
      phone: to,
      scheduleId: Number(scheduleId),
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        error: "Recipient already exists for this schedule",
      });
    }

    // 📤 Send SMS via Hubtel
    const smsService = new HubtelSMS(
      process.env.HUBTEL_CLIENT_ID!,
      process.env.HUBTEL_CLIENT_SECRET!
    );

    const sent = await smsService.sendSMS({ from, to, content });

    if (!sent) {
      return res.status(500).json({
        success: false,
        error: "Failed to send SMS through Hubtel API",
      });
    }

    // 🗃️ Save recipient record
    const recipient = new Recipient();
    recipient.phone = to;
    recipient.frequency = frequency;
    recipient.lastSent = new Date();
    recipient.scheduleId = Number(scheduleId);
    recipient.messageType = isAdmin ? "Admin Summary" : "User Summary";
    await recipient.save();

    return res.json({ success: true });
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

// @route   GET /api/sms/logs
// @desc    Fetch all SMS logs ordered by latest
// @access  Protected (requires authToken cookie)
export async function getSMSLogs(req: Request, res: Response) {
    const valid = validateSession(req, res);
    if (!valid) return;
  
    try {
      const logs = await SMSLog.find({ order: { sentAt: "DESC" } });
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
  
