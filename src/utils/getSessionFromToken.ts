import axios from 'axios';
import { getOrganizationData } from './getOrganizationName'; 

export interface SessionInfo {
  email: string;
  clientCode: string;
  organizationName: string;
}

export interface AdminUser {
  id: number;
  firstname: string;
  surname: string;
  profilePicture: string;
  phone: string;
  email: string;
  accountId: number;
  branchId: number;
}

export interface AdminAuthData {
  expiry: string;
  token: string;
  user: AdminUser;
}

const BASE_URL = 'https://db-api-v2.akwaabasoftware.com';

/**
 * Verifies a session token and returns essential session information.
 * 
 * @param token - The raw authentication token stored in the cookie
 * @returns A SessionInfo object containing user email, clientCode, and organizationName
 */
export async function getSessionFromToken(token: string): Promise<SessionInfo | null> {
  try {
    console.log('[getSessionFromToken] Verifying token with Akwaaba API...');

    const verifyRes = await axios.post<AdminAuthData>(
      `${BASE_URL}/clients/verify-token`,
      { token },
      {
        headers: { 'Content-Type': 'application/json' },
        withCredentials: true,
      }
    );

    const { user, token: verifiedToken } = verifyRes.data;

    if (!user || !verifiedToken) {
      console.warn('[getSessionFromToken] Invalid verification response.');
      return null;
    }

    console.log('[getSessionFromToken] Token verified. Fetching organization name for account ID:', user.accountId);

    const organizationName = await getOrganizationData(user.accountId, verifiedToken);
    if (!organizationName) {
      console.warn('[getSessionFromToken] Could not retrieve organization name.');
      return null;
    }

    return {
      email: user.email,
      clientCode: String(user.accountId),
      organizationName,
    };

  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      console.error('[getSessionFromToken] Axios error:', error.response?.data || error.message);
    } else {
      console.error('[getSessionFromToken] Unexpected error:', error);
    }
    return null;
  }
}
