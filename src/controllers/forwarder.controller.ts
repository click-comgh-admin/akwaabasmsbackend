import { Request, Response } from "express";
import axios from "axios";
import https from "https";
import { verifyToken } from "../services/jwt.service";

export async function forwardRequest(req: Request, res: Response) {
  const targetHost = "https://db-api-v2.akwaabasoftware.com";
  let rawToken: string;

  try {
    // Try to get token from cookie first
    const cookieToken = req.cookies?.authToken;
    if (cookieToken) {
      const session = verifyToken(cookieToken);
      rawToken = session.rawToken;
    } 
    // Fall back to Authorization header if no cookie
    else if (req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        rawToken = authHeader.substring(7);
      } else if (authHeader.startsWith('Token ')) {
        rawToken = authHeader.substring(6);
      } else {
        rawToken = authHeader; // Try raw token
      }
    } else {
      return res.status(401).json({ 
        success: false, 
        error: "Missing authentication token" 
      });
    }

    if (!rawToken) {
      return res.status(401).json({ 
        success: false, 
        error: "Invalid authentication token format" 
      });
    }

    const path = req.params[0];
    const url = `${targetHost}/${path}`;

    const headers = {
      Authorization: `Token ${rawToken}`,
      "Content-Type": req.headers["content-type"] || "application/json",
    };

    const httpsAgent = new https.Agent({
      rejectUnauthorized: true,
      checkServerIdentity: () => undefined,
    });

    const response = await axios({
      method: req.method as any,
      url,
      headers,
      params: req.query,
      data: req.body,
      timeout: 600_000,
      httpsAgent,
    });

    return res.status(response.status).json(response.data);
  } catch (error) {
    console.error("[Forwarder] Request failed:", error);

    if (axios.isAxiosError(error)) {
      if (error.response) {
        return res.status(error.response.status).json({
          error: error.response.data?.error || "API forwarding failed",
          details: error.response.data?.details,
        });
      } else if (error.code === 'ECONNABORTED') {
        return res.status(504).json({
          error: "Request timeout",
          details: "The upstream server took too long to respond",
        });
      }
    }

    return res.status(500).json({
      error: "Unexpected forwarding error",
      details: process.env.NODE_ENV === "development" 
        ? (error as Error).message 
        : undefined,
    });
  }
}