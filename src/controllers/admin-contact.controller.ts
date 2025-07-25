import { Request, Response } from "express";
import { Pool } from "pg";
import { validateSession } from "../utils/validateSession";

const pool = new Pool({
    connectionString: "postgresql://absenteecontact_9yin_user:c6pkkBu1A7L6kaBgBMSdHQo8a1alb8kr@dpg-d20g1sffte5s738set4g-a.oregon-postgres.render.com/absenteecontact_9yin",
    ssl: {
        rejectUnauthorized: false,
    },
    max: 10, // Recommended for Render's free tier
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
});

export async function getAdminContacts(req: Request, res: Response) {
  const valid = validateSession(req, res);
  if (!valid) return;

  const { clientCode } = valid.session;

  try {
    const client = await pool.connect();

    try {
      const result = await client.query(
        `SELECT id, name, phone_number, created_at 
         FROM admin_numbers 
         WHERE client_code = $1 
         ORDER BY created_at DESC`,
        [clientCode]
      );

      return res.json({
        success: true,
        data: result.rows,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error fetching admin numbers:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function addAdminContact(req: Request, res: Response) {
  const valid = validateSession(req, res);
  if (!valid) return;

  const { clientCode } = valid.session;
  const { name, phoneNumber } = req.body;

  if (!name || !phoneNumber) {
    return res.status(400).json({
      success: false,
      error: "Both name and phone number are required",
    });
  }

  try {
    const client = await pool.connect();

    try {
      const result = await client.query(
        `INSERT INTO admin_numbers 
         (client_code, name, phone_number, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         RETURNING id, name, phone_number, created_at`,
        [clientCode, name.trim(), phoneNumber.trim()]
      );

      return res.json({
        success: true,
        data: result.rows[0],
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error saving admin number:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}