import axios, { AxiosError } from 'axios';
import { SMSLog } from '../entities/SMSLog';

export interface HubtelResponse {
  Status: string;       // "0" for success, other codes for errors
  Message: string;      // Status message
  MessageId: string;    // Unique message identifier
  NetworkId?: string;   // Network ID if available
  Rate?: number;        // Cost of message if available
}

export interface HubtelError {
  status: string;
  error: string;
  message: string;
}

export class HubtelSMS {
  constructor(
    private clientId: string,
    private clientSecret: string
  ) {}

  async sendSMS(params: {
    from: string;
    to: string;
    content: string;
  }): Promise<HubtelResponse> {
    // Validate content length
    if (params.content.length > 160) {
      throw new Error('Message content exceeds maximum length of 160 characters');
    }

    try {
      const baseUrl = 'https://sms.hubtel.com/v1/messages/send';
      const queryParams = new URLSearchParams({
        clientid: this.clientId,
        clientsecret: this.clientSecret,
        from: params.from,
        to: params.to,
        content: params.content
      });

      const response = await axios.get<HubtelResponse>(
        `${baseUrl}?${queryParams.toString()}`,
        { timeout: 10000 }
      );
      
      const log = new SMSLog();
      log.recipient = params.to;
      log.message = params.content;
      log.status = 'sent';
      log.sentAt = new Date();
      log.messageId = response.data.MessageId;
      log.response = response.data;
      await log.save();

      return response.data;
    } catch (error) {
      const err = error as AxiosError<HubtelError>;
      const errorResponse = err.response?.data || {
        status: 'error',
        error: 'SMS_FAILED',
        message: err.message
      };
      
      const log = new SMSLog();
      log.recipient = params.to;
      log.message = params.content;
      log.status = 'failed';
      log.sentAt = new Date();
      log.error = errorResponse.message;
      log.response = errorResponse;
      await log.save();

      throw {
        Status: '1',
        Message: errorResponse.message,
        MessageId: 'N/A'
      };
    }
  }

  async checkDelivery(messageId: string): Promise<{
    delivered: boolean;
    status: string;
    details?: HubtelResponse;
  }> {
    try {
      const baseUrl = `https://sms.hubtel.com/v1/messages/${messageId}/status`;
      const queryParams = new URLSearchParams({
        clientid: this.clientId,
        clientsecret: this.clientSecret
      });

      const response = await axios.get<HubtelResponse>(
        `${baseUrl}?${queryParams.toString()}`,
        { timeout: 10000 }
      );

      return {
        delivered: response.data.Status === '0',
        status: response.data.Message,
        details: response.data
      };
    } catch (error) {
      const err = error as AxiosError<HubtelError>;
      console.error('Delivery check failed:', err.message);
      return {
        delivered: false,
        status: 'CHECK_FAILED',
      };
    }
  }
}