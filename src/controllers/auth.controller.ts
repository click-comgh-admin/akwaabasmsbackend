// controllers/auth.controller.ts
import { Request, Response } from 'express';
import axios, { AxiosError } from 'axios';
import { allowedOrigins } from '../config/cors';
import { signToken, verifyToken as JWTVerify } from '../services/jwt.service';


// @route   POST /api/auth/verify-token
// @desc    Verifies a token via Timmy server and sets a cookie with our signed JWT
// @access  Public
export async function verifyToken(req: Request, res: Response) {
  const { token } = req.body;
  const origin = req.headers.origin;

  console.log("[verifyToken] Incoming request from origin:", origin);
  console.log("[verifyToken] Received token:", token);

  // CORS setup
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    console.log("[verifyToken] CORS headers set for allowed origin:", origin);
  } else {
    console.warn("[verifyToken] Origin not allowed or missing:", origin);
  }

  if (!token || typeof token !== "string") {
    console.warn("[verifyToken] Missing or invalid token in request body.");
    return res.status(400).json({
      success: false,
      error: "Token is required and must be a valid string.",
    });
  }

  try {
    console.log("[verifyToken] Sending request to Timmy auth server...");
    const { data: externalRes } = await axios.post(
      "https://timmy.akwaabahr.com/api/cross-auth-auth/receiver",
      { token },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 120_000,
      }
    );

    console.log("[verifyToken] Response from Timmy:", externalRes);

    const { success, data, message } = externalRes;

    if (!success || !data?.user || !data.rawToken) {
      console.warn("[verifyToken] Timmy responded with invalid data:", externalRes);
      return res.status(401).json({
        success: false,
        error: message || "Invalid token response from Timmy.",
      });
    }

    const { rawToken, organizationName, user } = data;

    console.log("[verifyToken] Extracted user data:", user);
    console.log("[verifyToken] Organization:", organizationName);

    if (!user.email || !user.accountId) {
      console.error("[verifyToken] Missing critical user data: email or accountId");
      return res.status(401).json({
        success: false,
        error: "Invalid user data in token response.",
      });
    }

    console.log("[verifyToken] Signing internal JWT...");
    const signedJwt = signToken({
      email: user.email,
      clientCode: String(user.accountId),
      organizationName,
      rawToken,
    });

    console.log("[verifyToken] Setting authToken cookie...");
    res.cookie("authToken", signedJwt, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      domain: ".akwaabahr.com",
      maxAge: 5 * 86400 * 1000,
    });

    console.log("[verifyToken] Authentication complete. Sending success response.");
    return res.status(200).json({
      success: true,
      user: {
        accountId: user.accountId,
        email: user.email,
        phone: user.phone,
      },
      organizationName,
    });
  } catch (error) {
    const err = error as AxiosError;
    const errorMsg =
      err.response?.data || err.message || "Unexpected verification error";

    console.error("[verifyToken] Error occurred during verification:", errorMsg);
    if (err.response) {
      console.error("[verifyToken] Response error data:", err.response.data);
    }

    return res.status(500).json({
      success: false,
      error: "Token verification failed.",
      details: process.env.NODE_ENV === "development" ? errorMsg : undefined,
    });
  }
}

export async function getSession(req: Request, res: Response) {
  const token = req.cookies?.authToken;

  if (!token) {
    return res.status(401).json({ success: false, error: "Not authenticated" });
  }

  try {
    const session = JWTVerify(token); // 🔐 decode with our JWT service

    return res.status(200).json({
      success: true,
      user: {
        email: session.email,
        clientCode: session.clientCode,
        orgName: session.organizationName,
      },
    });
  } catch (error) {
    console.error("[getSession] Invalid or expired JWT:", error);
    return res.status(401).json({ success: false, error: "Invalid or expired session" });
  }
}


export async function logout(req: Request, res: Response) {
  res.clearCookie('authToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none',
    domain: '.akwaabahr.com',
    path: '/'
  });
  return res.status(200).json({ success: true, message: 'Logged out' });
}


