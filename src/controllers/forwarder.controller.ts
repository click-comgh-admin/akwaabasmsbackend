import { Request, Response } from "express";
import axios from "axios";
import https from "https";
import { verifyToken } from "../services/jwt.service";

/**
 * Forwards any HTTP request to https://db-api-v2.akwaabasoftware.com
 * Requires a valid authToken cookie and only includes the Authorization header.
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

  const path = req.params[0]; // router.all('/forward/*', forwardRequest)
  const url = `${targetHost}/${path}`;

  // 👇 Only forward Authorization header
  const headers = {
    Authorization: `Token ${rawToken}`,
    "Content-Type": req.headers["content-type"] || "application/json",
  };

  const httpsAgent = new https.Agent({
    rejectUnauthorized: true,
    checkServerIdentity: () => undefined, // ⚠️ Only use in dev to skip SAN errors
  });

  try {
    const response = await axios({
      method: req.method as any,
      url,
      headers,
      params: req.query,
      data: req.body,
      timeout: 120_000,
      httpsAgent,
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


// rsync -avz --exclude 'node_modules' --exclude 'src' --exclude '.git' ~/Documents/GitHub/akwaabasmsbackend/ root@144.126.202.27:/var/www/smsbackend
