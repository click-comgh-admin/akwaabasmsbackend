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

export async function getContact(req: Request, res: Response) {
  const valid = validateSession(req, res);
  if (!valid) return;

  const { clientCode } = valid.session;

  try {
    const client = await pool.connect();
    
    try {
      const result = await client.query(
        "SELECT id, primary_contact, secondary_contact, created_at, updated_at FROM contacts WHERE client_code = $1 ORDER BY created_at DESC LIMIT 1",
        [clientCode]
      );

      return res.json({
        success: true,
        data: result.rows[0] || null,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error fetching contacts:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function saveContact(req: Request, res: Response) {
  const valid = validateSession(req, res);
  if (!valid) return;

  const { clientCode } = valid.session;
  const { primaryContact, secondaryContact } = req.body;

  if (!primaryContact) {
    return res.status(400).json({ 
      success: false, 
      error: "Primary contact is required" 
    });
  }

  try {
    const client = await pool.connect();

    try {
      // Check if client already has contacts
      const existing = await client.query(
        "SELECT id FROM contacts WHERE client_code = $1", 
        [clientCode]
      );

      if (existing.rows.length > 0) {
        // Update existing record
        const result = await client.query(
          `UPDATE contacts 
           SET primary_contact = $1, 
               secondary_contact = $2,
               updated_at = NOW()
           WHERE client_code = $3
           RETURNING *`,
          [primaryContact, secondaryContact || null, clientCode]
        );

        return res.json({
          success: true,
          data: result.rows[0],
        });
      } else {
        // Create new record
        const result = await client.query(
          `INSERT INTO contacts 
           (client_code, primary_contact, secondary_contact, created_at, updated_at)
           VALUES ($1, $2, $3, NOW(), NOW())
           RETURNING *`,
          [clientCode, primaryContact, secondaryContact || null]
        );

        return res.json({
          success: true,
          data: result.rows[0],
        });
      }
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error saving contacts:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}