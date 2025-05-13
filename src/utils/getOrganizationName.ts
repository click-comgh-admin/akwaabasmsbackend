import axios from 'axios';

export interface AccountCategory {
  id: number;
  clientId: number;
  category: string;
  createdBy: number;
  updatedBy: number;
  updateDate: string | null;
  date: string | null;
}

export interface SubscriptionInfo {
  id: number;
  client: string;
  client_id: string;
  subscription_id: string;
  subscribed_modules: Record<string, any>;
  date_created: string;
  membership_size: string;
  description: string;
  duration: number;
  amount_paid: number;
  renewing_days: number;
  remaining_days: number;
  expired_days: number;
  subscription_fee_ghs: number;
  paid_by: string;
  subscription_fee_usd: number;
  expires_on: string;
  confirmed: boolean;
  expired: boolean;
  annual_maintenance_fee: number;
  invoice_copy: string;
  non_expiry: boolean;
  special: boolean;
  usercode: string | null;
  new_expires_on: string | null;
}

export interface CountryInfo {
  id: number;
  name: string;
  short: string;
  code: string;
}

export interface OrganizationData {
  id: number;
  name: string;
  accountType: number;
  country: string;
  stateProvince: string;
  applicantFirstname: string;
  applicantSurname: string;
  applicantGender: number;
  applicantPhone: string;
  applicantEmail: string;
  applicantDesignationRole: number;
  region: number;
  district: number;
  constituency: number;
  community: string;
  subscriptionDuration: string;
  subscriptionDate: string;
  subscriptionFee: string;
  logo: string;
  status: number;
  archive: number;
  accountCategory: AccountCategory;
  website: string;
  creationDate: string;
  updatedBy: number;
  updateDate: string;
  subscriptionInfo: SubscriptionInfo;
  countryInfo: CountryInfo[];
}

export interface GetOrganizationResponse {
  success: boolean;
  message: string;
  data: OrganizationData;
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

export async function getOrganizationData(accountId: number, rawToken: string): Promise<string | null> {
  try {
    const response = await axios.get<GetOrganizationResponse>(
      `${BASE_URL}/clients/account/${accountId}`,
      {
        headers: { Authorization: `Token ${rawToken}` },
        withCredentials: true,
      }
    );

    const { data } = response;


    if (data.success) {
      console.log('Organization data fetched successfully:', data.data);
      return data.data.name;;
    } else {
      console.error('Failed to fetch organization data:', data.message);
      return null;
    }

  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      console.error('Axios error fetching organization data:', error.response?.data || error.message);
    } else {
      console.error('Unexpected error fetching organization data:', error);
    }
    return null;
  }
}
