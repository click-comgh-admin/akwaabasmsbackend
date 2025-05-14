// controllers/auth.controller.ts
import { Request, Response } from 'express';
import axios, { AxiosError } from 'axios';
import { allowedOrigins } from '../config/cors';
import { signToken, verifyToken as JWTVerify } from '../services/jwt.service';


// @route   POST /api/auth/verify-token
// @desc    Verifies a token via Timmy server and sets a cookie with our signed JWT
// @access  Public (requires external token)
export async function verifyToken(req: Request, res: Response) {
  const { token } = req.body;
  const origin = req.headers.origin;

  // Handle CORS
  if (origin && allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  res.header("Access-Control-Allow-Credentials", "true");

  if (!token || typeof token !== "string") {
    return res.status(400).json({
      success: false,
      error: "Token is required and must be a valid string.",
    });
  }

  try {
    // 🔐 Verify external token
    const { data: externalRes } = await axios.post(
      "https://timmy.akwaabahr.com/api/cross-auth-auth/receiver",
      { token },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 120000,
      }
    );

    const { success, data, message } = externalRes;

    if (!success || !data?.user || !data.rawToken) {
      return res.status(401).json({
        success: false,
        error: message || "Invalid token response from Timmy.",
      });
    }

    const { rawToken, organizationName, user } = data;

    if (!user.email || !user.accountId) {
      return res.status(401).json({
        success: false,
        error: "Invalid user data in token response.",
      });
    }

    const signedJwt = signToken({
      email: user.email,
      clientCode: String(user.accountId),
      organizationName,
      rawToken,
    });


    // 🍪 Set cookie
    res.cookie("authToken", signedJwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
      domain: ".akwaabahr.com",
      maxAge: 5 * 86400 * 1000, // 5 days
    });

    // ✅ Return only safe user info
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
      err.response?.data ||
      err.message ||
      "Unexpected verification error";

    console.error("[verifyToken] Error:", errorMsg);

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


