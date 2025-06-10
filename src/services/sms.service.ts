import axios, { AxiosError } from 'axios';
import { AppDataSource } from '../config/data-source';
import { SMSLog } from '../entities/SMSLog';

export interface HubtelResponse {
  Status: string;
  Message: string;
  MessageId: string;
  NetworkId?: string;
  Rate?: number;
}

export interface HubtelError {
  status: string;
  error: string;
  message: string;
}

export class HubtelSMS {
  private smsLogRepository = AppDataSource.getRepository(SMSLog);

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string
  ) {
    if (!clientId || !clientSecret) {
      throw new Error('Hubtel credentials are required');
    }
  }

  async sendSMS(params: {
    from: string;
    to: string;
    content: string;
  }): Promise<HubtelResponse> {

    try {
      const response = await this.makeHubtelRequest(params);
      await this.logSMS({
        ...params,
        status: 'sent',
        messageId: response.MessageId,
        responseData: response
      });
      return response;
    } catch (error) {
      const errorResponse = this.parseError(error);
      await this.logSMS({
        ...params,
        status: 'failed',
        error: errorResponse.message,
        responseData: errorResponse
      });
      throw this.formatErrorResponse(errorResponse);
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
      console.error('Delivery check failed:', error);
      return {
        delivered: false,
        status: 'CHECK_FAILED'
      };
    }
  }

  private async makeHubtelRequest(params: {
    from: string;
    to: string;
    content: string;
  }): Promise<HubtelResponse> {
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
    return response.data;
  }

  private async logSMS(params: {
    from: string;
    to: string;
    content: string;
    status: 'sent' | 'failed';
    messageId?: string;
    error?: string;
    responseData?: any;
  }): Promise<void> {
    const log = new SMSLog();
    log.recipient = params.to;
    log.content = params.content;  // Changed from 'message' to 'content'
    log.status = params.status;
    log.sentAt = new Date();
    
    if (params.messageId) log.messageId = params.messageId;
    if (params.error) log.error = params.error;  // Changed from 'error' to 'errorMessage'
    if (params.responseData) log.response = params.responseData;

    await this.smsLogRepository.save(log);
  }
  private parseError(error: unknown): HubtelError {
    const err = error as AxiosError<HubtelError>;
    return err.response?.data || {
      status: 'error',
      error: 'SMS_FAILED',
      message: err.message
    };
  }

  private formatErrorResponse(error: HubtelError): HubtelResponse {
    return {
      Status: '1',
      Message: error.message,
      MessageId: 'N/A'
    };
  }
}