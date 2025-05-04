import axios, { AxiosError } from 'axios';
import { SMSLog } from '../entities/SMSLog';

export class HubtelSMS {
  constructor(
    private clientId: string,
    private clientSecret: string
  ) {}

  async sendSMS(params: {
    from: string;
    to: string;
    content: string;
  }): Promise<boolean> {
    try {
      const baseUrl = 'https://sms.hubtel.com/v1/messages/send';
      const queryParams = new URLSearchParams({
        clientid: this.clientId,
        clientsecret: this.clientSecret,
        from: params.from,
        to: params.to,
        content: params.content
      });

      const response = await axios.get(`${baseUrl}?${queryParams.toString()}`);
      
      const log = new SMSLog();
      log.recipient = params.to;
      log.message = params.content;
      log.status = 'sent';
      log.sentAt = new Date();
      log.response = response.data;
      await log.save();

      return true;
    } catch (error) {
      const err = error as AxiosError;
      
      const log = new SMSLog();
      log.recipient = params.to;
      log.message = params.content;
      log.status = 'failed';
      log.sentAt = new Date();
      log.response = err.response?.data || err.message;
      await log.save();

      return false;
    }
  }
}