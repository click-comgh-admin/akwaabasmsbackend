import { verifyToken } from "../services/jwt.service";
import { Request, Response } from "express";

// 🔐 Helper to extract and verify session from cookie
export function validateSession(req: Request, res: Response): { session: any } | undefined {
    const token = req.cookies?.authToken;
    if (!token) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }
  
    try {
      const session = verifyToken(token);
      return { session };
    } catch (error) {
      console.error("[Auth] Invalid token:", error);
      res.status(401).json({ success: false, error: "Invalid or expired token" });
      return;
    }
  }