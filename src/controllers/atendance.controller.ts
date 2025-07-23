//attendance.controller.ts
import { Request, Response } from "express";
import axios from "axios";
import { validateSession } from "../utils/validateSession";

interface AttendanceRecord {
  inTime?: string;
  outTime?: string;
  date: string;
  memberId?: {
    id?: number;
    phone?: string;
    firstname?: string;
    surname?: string;
    gender?: number
  };
  meetingEventId?: {
    latenessTime?: string;
  };
}

interface Schedule {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
}

export async function getAttendanceStats(req: Request, res: Response) {
  const valid = validateSession(req, res);
  if (!valid) return;

  const { session } = valid;
  const { scheduleId, phone, startDate, endDate, isAdmin } = req.query;
  const rawToken = session.rawToken;

  if (!scheduleId || !startDate || !endDate) {
    return res.status(400).json({
      error: "Missing required parameters: scheduleId, startDate, endDate"
    });
  }

  const scheduleIdNum = Number(scheduleId);
  if (isNaN(scheduleIdNum)) {
    return res.status(400).json({ error: "Invalid schedule ID format" });
  }

  if (scheduleIdNum <= 0) {
    return res.status(400).json({ error: "Schedule ID must be positive" });
  }

  try {
    const baseURL = process.env.ATTENDANCE_API_URL;
    if (!baseURL) throw new Error("Attendance API URL not configured");

    const headers = { 
      Authorization: `Token ${rawToken}`,
      "Content-Type": "application/json"
    };

    const [scheduleRes, attendanceRes] = await Promise.all([
      axios.get<Schedule>(`${baseURL}/attendance/meeting-event/schedule/${scheduleId}`, { headers }),
      axios.get<{ results: AttendanceRecord[] }>(
      `${baseURL}/attendance/meeting-event/attendance`,
      { 
        headers,
        params: {
        start_date: startDate,
        end_date: endDate,
        meetingEventId: scheduleId,
        length: 1000
        },
        timeout: 300000 
      }
      )
    ]);

    const records = attendanceRes.data?.results || [];
    const schedule = scheduleRes.data;

    if (isAdmin === "true") {
      const stats = calculateAdminStats(records, schedule);
      return res.json({
        ...stats,
        scheduleName: schedule.name
      });
    }

    if (!phone) {
      return res.status(400).json({ error: "Phone number required for user stats" });
    }

    const userRecords = records.filter(r => r.memberId?.phone === phone);
    if (userRecords.length === 0) {
      return res.status(404).json({ error: "No records found for this user" });
    }

    const userStats = calculateUserStats(userRecords, schedule);
    return res.json({
      ...userStats,
      firstName: userRecords[0]?.memberId?.firstname || "User",
      scheduleName: schedule.name
    });

  } catch (error) {
    handleAttendanceError(error, res);
  }
}

function calculateAdminStats(records: AttendanceRecord[], schedule: Schedule) {
  const presentRecords = records.filter(r => r.inTime).length;
  const totalRecords = records.length;

  const lateRecords = records.filter(r => (
    r.inTime && 
    r.meetingEventId?.latenessTime &&
    new Date(r.inTime) > new Date(r.meetingEventId.latenessTime)
  )).length;

  const workMetrics = calculateWorkMetrics(records, schedule);

  return {
    firstName: "Admin",
    clockIns: presentRecords,
    clockOuts: records.filter(r => r.outTime).length,
    lateDays: lateRecords,
    absentDays: totalRecords - presentRecords,
    ...workMetrics
  };
}

export async function getUserCounts(req: Request, res: Response) {
  const valid = validateSession(req, res);
  if (!valid) return;

  const { scheduleId } = req.query;
  if (!scheduleId) {
    return res.status(400).json({ error: "Schedule ID is required" });
  }

  try {
    const baseURL = process.env.ATTENDANCE_API_URL;
    if (!baseURL) throw new Error("Attendance API URL not configured");

    const response = await axios.get(`${baseURL}/attendance/meeting-event/attendance`, {
      params: { 
        meetingEventId: scheduleId,
        length: 1000
      },
      headers: { Authorization: `Token ${valid.session.rawToken}` }
    });

    const records = response.data?.results || [];

    const userMap = new Map<number, 'male' | 'female' | 'unknown'>();

    for (const record of records) {
      const member = record.memberId;
      if (member?.id != null && !userMap.has(member.id)) {
        const genderNum = typeof member.gender === 'number' ? member.gender : null;

        let gender: 'male' | 'female' | 'unknown';
        if (genderNum === 1) gender = 'male';
        else if (genderNum === 2) gender = 'female';
        else gender = 'unknown';

        console.log(`User ${member.id} → Gender raw: ${member.gender} → Mapped: ${gender}`);
        userMap.set(member.id, gender);
      }
    }

    const total = userMap.size;
    const males = [...userMap.values()].filter(g => g === 'male').length;
    const females = [...userMap.values()].filter(g => g === 'female').length;
    const unknown = total - males - females;

    return res.json({
      success: true,
      total,
      males,
      females,
      unknown
    });

  } catch (error) {
    console.error("Failed to fetch user counts:", error);
    return res.status(500).json({ 
      success: false,
      error: "Failed to fetch user counts",
      details: process.env.NODE_ENV === "development" 
        ? error instanceof Error ? error.message : String(error)
        : undefined
    });
  }
}


function calculateUserStats(records: AttendanceRecord[], schedule: Schedule) {
  const stats = {
    clockIns: 0,
    clockOuts: 0,
    lateDays: 0,
    absentDays: 0,
    totalWorkHours: 0,
    overtimeDays: 0,
    totalOvertime: 0
  };

  records.forEach(record => {
    if (record.inTime) {
      stats.clockIns++;

      if (schedule.start_time) {
        const scheduleStart = new Date(`${record.date.split("T")[0]}T${schedule.start_time}`);
        if (new Date(record.inTime) > scheduleStart) stats.lateDays++;
      }

      if (record.outTime) {
        stats.clockOuts++;
        stats.totalWorkHours += calculateWorkHours(record.inTime, record.outTime);

        if (schedule.end_time) {
          const overtime = calculateOvertime(record.date, record.outTime, schedule.end_time);
          if (overtime > 0) {
            stats.overtimeDays++;
            stats.totalOvertime += overtime;
          }
        }
      }
    } else {
      stats.absentDays++;
    }
  });

  stats.totalWorkHours = Math.round(stats.totalWorkHours);
  stats.totalOvertime = Math.round(stats.totalOvertime);

  return stats;
}

function calculateWorkMetrics(records: AttendanceRecord[], schedule: Schedule) {
  const metrics = {
    totalWorkHours: 0,
    overtimeDays: 0,
    totalOvertime: 0
  };

  records.forEach(record => {
    if (record.inTime && record.outTime) {
      metrics.totalWorkHours += calculateWorkHours(record.inTime, record.outTime);

      if (schedule.end_time) {
        const overtime = calculateOvertime(record.date, record.outTime, schedule.end_time);
        if (overtime > 0) {
          metrics.overtimeDays++;
          metrics.totalOvertime += overtime;
        }
      }
    }
  });

  metrics.totalWorkHours = Math.round(metrics.totalWorkHours);
  metrics.totalOvertime = Math.round(metrics.totalOvertime);

  return metrics;
}

function calculateWorkHours(inTime: string, outTime: string): number {
  return (new Date(outTime).getTime() - new Date(inTime).getTime()) / 3600000;
}

function calculateOvertime(date: string, outTime: string, scheduleEndTime: string): number {
  const scheduleEnd = new Date(`${date.split("T")[0]}T${scheduleEndTime}`);
  const actualEnd = new Date(outTime);
  return actualEnd > scheduleEnd ? (actualEnd.getTime() - scheduleEnd.getTime()) / 3600000 : 0;
}

function handleAttendanceError(error: unknown, res: Response) {
  console.error("Attendance error:", error);

  if (axios.isAxiosError(error)) {
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || "Attendance API request failed";
    return res.status(status).json({ error: message });
  }

  res.status(500).json({ 
    error: "Internal server error",
    details: process.env.NODE_ENV === "development" 
      ? (error instanceof Error ? error.message : String(error))
      : undefined
  });
}