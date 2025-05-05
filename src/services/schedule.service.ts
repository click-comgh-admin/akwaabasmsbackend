import { Schedule } from '../entities/Schedule';
import { Recipient } from '../entities/Recipient';
import { getDateRange } from '../utils/date';

export class ScheduleService {
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

  async getRecipients(scheduleId: number, maxRetries = 3) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await Recipient.findBy({ scheduleId });
      } catch (error) {
        lastError = error;
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
    throw lastError;
  }

  async updateLastSent(scheduleId: number) {
    const schedule = await Schedule.findOneBy({ id: scheduleId });
    if (!schedule) return;

    schedule.lastSent = new Date();
    schedule.nextSend = this.calculateNextSend(schedule.frequency, schedule.startTime);
    return schedule.save();
  }

  private calculateNextSend(frequency: string, time: string) {
    const [hours, minutes] = time.split(':').map(Number);
    const next = new Date();

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
    }

    next.setHours(hours, minutes, 0, 0);
    return next;
  }

  formatMessage(data: any, template: string) {
    const message = template
      .replace('[Name]', data.name)
      .replace('[ClockIns]', data.clockIns)
      .replace('[LateDays]', data.lateDays)
      .replace('[AbsentDays]', data.absentDays)
      .replace('[TotalHours]', data.totalHours)
      .replace('[Month]', data.month);

    if (message.length > 160) {
      throw new Error('Formatted message exceeds 160 character limit');
    }

    return message;
  }
}