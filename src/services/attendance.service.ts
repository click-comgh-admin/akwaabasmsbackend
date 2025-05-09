import axios from 'axios';
import { getDateRange } from '../utils/date';


export class AttendanceService {
  constructor(
    private apiUrl: string,
    private apiToken: string
  ) {}

// In attendance.service.ts, update getAttendanceSummary:
async getAttendanceSummary(phone: string, frequency: string, meetingEventId: number, lastSent?: Date) {
  const { startDate, endDate } = getDateRange(frequency, lastSent);
  
  try {
    // First get schedule details
    const scheduleResponse = await axios.get(`${this.apiUrl}/attendance/meeting-event/schedule/${meetingEventId}`, {
      headers: { Authorization: `Token ${this.apiToken}` }
    });

    // Then get attendance data
    const attendanceResponse = await axios.get(`${this.apiUrl}/attendance/meeting-event/attendance`, {
      params: { filter_date: startDate, meetingEventId, length: 700 },
      headers: { Authorization: `Token ${this.apiToken}` }
    });

    const userRecord = attendanceResponse.data.results.find((r: any) => 
      r.memberId.phone === phone
    );

    if (!userRecord) {
      throw new Error(`No attendance record found for phone: ${phone}`);
    }

    return {
      firstName: userRecord.memberId.firstname,
      scheduleName: scheduleResponse.data.name,
      clockIns: userRecord.inTime ? 1 : 0,
      lateDays: this.calculateLateDays(userRecord),
      absentDays: this.calculateAbsentDays(userRecord),
      totalHours: this.calculateTotalHours(userRecord),
      month: new Date(startDate).toLocaleString('default', { month: 'long' }),
      year: new Date(startDate).getFullYear().toString()
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
}