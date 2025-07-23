import { Schedule } from '../entities/Schedule';
import { Recipient } from '../entities/Recipient';
import { getRepository } from 'typeorm';
import { getDateRange } from '../utils/date';
import axios from 'axios';

interface AttendanceData {
  name: string;
  clockIns: number;
  lateDays: number;
  absentDays: number;
  totalHours: number;
  month: string;
  year: string;
  quarter: string;
  [key: string]: string | number;
}

export class ScheduleService {
  private apiUrl: string;
  private apiToken: string;

  constructor(apiUrl: string, apiToken: string) {
    this.apiUrl = apiUrl;
    this.apiToken = apiToken;
  }

  async createSchedule(scheduleData: Partial<Schedule>) {
    return Schedule.save(Schedule.create(scheduleData));
  }

  async getAllSchedules() {
    return Schedule.find();
  }

  async getPendingSchedules() {
    return Schedule.createQueryBuilder('schedule')
      .where('schedule.nextSend <= :now', { now: new Date() })
      .getMany();
  }

// schedule.service.ts
async getRecipients(scheduleId: number, maxRetries = 3) {
  let lastError: Error | undefined;
  const recipientRepo = getRepository(Recipient); // Add this at the top: import { getRepository } from "typeorm";
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await recipientRepo.find({ 
        where: { scheduleId } 
      });
    } catch (error) {
      lastError = error as Error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw lastError;
}
  async updateLastSent(scheduleId: number) {
    const schedule = await Schedule.findOneBy({ id: scheduleId });
    if (!schedule) return;
  
    schedule.lastSent = new Date();
    schedule.nextSend = this.calculateNextSend(
      schedule.frequency, 
      schedule.startTime, 
      schedule.lastSent
    );
    return schedule.save();
  }

private calculateNextSend(frequency: string, time: string, lastSent?: Date): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const next = lastSent ? new Date(lastSent) : new Date();

  switch (frequency) {
    case 'Daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'Weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'Monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'Quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'Annually':
      next.setFullYear(next.getFullYear() + 1);
      break;
  }

  next.setHours(hours, minutes, 0, 0);
  return next;
}

  async getAttendanceSummary(phone: string, frequency: string, meetingEventId: number, lastSent?: Date): Promise<AttendanceData> {
    const { startDate, endDate } = getDateRange(frequency, lastSent);
    
    try {
      const response = await axios.get(`${this.apiUrl}/attendance/meeting-event/attendance`, {
        params: {
          filter_date: startDate,
          meetingEventId,
          length: 700
        },
        headers: {
          Authorization: `Token ${this.apiToken}`
        },
        timeout: 300000
      });

      const userRecord = response.data.results.find((r: any) => 
        r.memberId.phone === phone
      );

      if (!userRecord) {
        throw new Error(`No attendance record found for phone: ${phone}`);
      }

      return {
        name: `${userRecord.memberId.firstname} ${userRecord.memberId.surname}`,
        clockIns: userRecord.inTime ? 1 : 0,
        lateDays: this.calculateLateDays(userRecord),
        absentDays: this.calculateAbsentDays(userRecord),
        totalHours: this.calculateTotalHours(userRecord),
        month: new Date(startDate).toLocaleString('default', { month: 'long' }),
        year: new Date(startDate).getFullYear().toString(),
        quarter: `Q${Math.floor(new Date(startDate).getMonth() / 3) + 1}`
      };
    } catch (error) {
      console.error('Error fetching attendance:', error);
      throw error;
    }
  }

  private calculateLateDays(record: any): number {
    return record.inTime && record.meetingEventId.latenessTime && 
      new Date(record.inTime) > new Date(record.meetingEventId.latenessTime) ? 1 : 0;
  }

  private calculateAbsentDays(record: any): number {
    return record.inTime ? 0 : 1;
  }

  private calculateTotalHours(record: any): number {
    if (!record.inTime || !record.outTime) return 0;
    const diff = new Date(record.outTime).getTime() - new Date(record.inTime).getTime();
    return Math.round(diff / (1000 * 60 * 60));
  }

  formatMessage(data: Record<string, string | number | boolean>, template: string): string {
    let message = template;
    
    for (const [key, value] of Object.entries(data)) {
      message = message.replace(
        new RegExp(`\\[${key}\\]`, 'g'), 
        value.toString()
      );
    }

    if (message.length > 160) {
      throw new Error('Formatted message exceeds 160 character limit');
    }

    return message;
  }
}