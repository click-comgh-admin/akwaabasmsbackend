import { Request, Response } from "express";
import { Recipient } from "../entities/Recipient";
import { validateSession } from "../utils/validateSession";




export async function checkRecipient(req: Request, res: Response) {
  const valid = validateSession(req, res);
  if (!valid) return;

  const { phone, scheduleId } = req.query;

  if (!phone || !scheduleId) {
    return res.status(400).json({
      success: false,
      error: "Missing required query params: phone and scheduleId",
    });
  }

  try {
    const existing = await Recipient.findOneBy({
      phone: phone as string,
      scheduleId: Number(scheduleId),
    });
    return res.json({ exists: !!existing });
  } catch (error) {
    console.error("Failed to check recipient:", error);
    return res.status(500).json({ error: "Failed to check recipient" });
  }
}

export async function deleteRecipientById(req: Request, res: Response) {
  const valid = validateSession(req, res);
  if (!valid) return;

  const id = Number(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: "Invalid or missing recipient ID" });
  }

  try {
    const recipient = await Recipient.findOneBy({ id });
    if (!recipient) {
      return res.status(404).json({ error: "Recipient not found" });
    }

    await recipient.remove();
    return res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete recipient:", error);
    return res.status(500).json({ error: "Failed to delete recipient" });
  }
}

export async function deleteRecipients(req: Request, res: Response) {
  const valid = validateSession(req, res);
  if (!valid) return;

  const { type } = req.query;

  if (type !== "admin" && type !== "user") {
    return res.status(400).json({
      error: "Invalid query param 'type'. Must be 'admin' or 'user'",
    });
  }

  try {
    const query =
      type === "admin"
        ? { messageType: "Admin Summary" }
        : { messageType: "User Summary" };

    await Recipient.delete(query);
    return res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete recipients:", error);
    return res.status(500).json({ error: "Failed to delete recipients" });
  }
}

export async function listRecipients(req: Request, res: Response) {
  const valid = validateSession(req, res);
  if (!valid) return;

  const { session } = valid;
  const { phone, scheduleId, frequency, messageType } = req.query;

  try {
    const queryBuilder = Recipient.createQueryBuilder("recipient")
      .leftJoinAndSelect("recipient.schedule", "schedule")
      .where("recipient.clientCode = :clientCode", {
        clientCode: session.clientCode,
      });

    if (phone) {
      queryBuilder.andWhere("recipient.phone = :phone", { phone });
    }

    if (scheduleId && !isNaN(Number(scheduleId))) {
      queryBuilder.andWhere("recipient.scheduleId = :scheduleId", {
        scheduleId: Number(scheduleId),
      });
    }

    if (frequency && frequency !== "All") {
      queryBuilder.andWhere("recipient.frequency = :frequency", { frequency });
    }

    if (messageType) {
      queryBuilder.andWhere("recipient.messageType = :messageType", {
        messageType,
      });
    }

    const recipients = await queryBuilder
      .orderBy("recipient.lastSent", "DESC")
      .getMany();

    return res.json({
      success: true,
      data: recipients.map((r) => ({
        id: r.id,
        phone: r.phone,
        frequency: r.frequency,
        lastSent: r.lastSent,
        messageType: r.messageType,
        scheduleId: r.scheduleId,
        scheduleName: r.schedule?.senderName || "N/A",
        createdAt: r.createdAt,
      })),
      count: recipients.length,
      clientCode: session.clientCode,
      orgName: session.organizationName,
    });
  } catch (error) {
    console.error("Failed to fetch recipients:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch recipients",
    });
  }
}
