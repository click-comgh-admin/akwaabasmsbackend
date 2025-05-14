import { Request, Response } from "express";
import axios from "axios";
import { verifyToken } from "../services/jwt.service";

/**
 * Forwards any HTTP request to https://db-api-v2.akwaabasoftware.com
 * Preserves method, headers, query, and body. Requires a valid authToken cookie.
 */
export async function forwardRequest(req: Request, res: Response) {
  const targetHost = "https://db-api-v2.akwaabasoftware.com";

  const token = req.cookies?.authToken;
  if (!token) {
    return res.status(401).json({ success: false, error: "Missing authToken cookie" });
  }

  let rawToken: string;
  try {
    const session = verifyToken(token);
    rawToken = session.rawToken;
  } catch (err) {
    console.error("[Forwarder] Invalid token:", err);
    return res.status(401).json({ success: false, error: "Invalid or expired token" });
  }

  const path = req.params.path;
  const url = `${targetHost}/${path}`;

  try {
    const response = await axios({
      method: req.method as any,
      url,
      headers: {
        Authorization: `Token ${rawToken}`,
        ...req.headers,
      },
      params: req.query,
      data: req.body,
      timeout: 120_000,
    });

    return res.status(response.status).json(response.data);
  } catch (error) {
    console.error("[Forwarder] Request failed:", error);

    if (axios.isAxiosError(error) && error.response) {
      return res.status(error.response.status).json({
        error: error.response.data || "API forwarding failed",
      });
    }

    return res.status(500).json({
      error: "Unexpected forwarding error",
      message: (error as Error).message,
    });
  }
}
