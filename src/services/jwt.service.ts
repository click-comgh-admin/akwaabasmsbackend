// src/services/jwt.service.ts
import jwt, { SignOptions } from "jsonwebtoken";

export interface SessionInfo {
  email: string;
  clientCode: string;
  organizationName: string;
  rawToken: string;
}

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "5d";

if (!JWT_SECRET) {
  throw new Error("❌ JWT_SECRET is not defined in environment variables.");
}

/**
 * Signs a JWT containing session info and original token.
 */
export function signToken(session: SessionInfo): string {
  return jwt.sign(session as object, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as SignOptions);
}

/**
 * Verifies a JWT and extracts session information.
 */
export function verifyToken(token: string): SessionInfo {
  return jwt.verify(token, JWT_SECRET) as SessionInfo;
}
