import { Request, Response } from "express";
import axios, { AxiosError } from "axios";
import { validateSession } from "../utils/validateSession";

interface AttendanceRecord {
  inTime?: string;
  outTime?: string;
  date: string;
  memberId?: {
    phone?: string;
    firstname?: string;
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
      error: "Missing required parameters: scheduleId, startDate, endDate",
    });
  }

  const scheduleIdNum = Number(scheduleId);
  if (isNaN(scheduleIdNum)) {
    return res.status(400).json({ error: "Invalid schedule ID format" });
  }

  if (scheduleIdNum <= 0) {
    return res.status(400).json({ error: "Schedule ID must be positive" });
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate as string) || !dateRegex.test(endDate as string)) {
    return res.status(400).json({ error: "Invalid date format (use YYYY-MM-DD)" });
  }

  try {
    const baseURL = process.env.ATTENDANCE_API_URL;
    if (!baseURL) throw new Error("Attendance API URL not configured");

    const headers = { 
      Authorization: `Token ${rawToken}`,
      "Content-Type": "application/json"
    };

    const scheduleRes = await axios.get<Schedule>(
      `${baseURL}/attendance/meeting-event/schedule/${scheduleId}`,
      { headers }
    );
    const schedule = scheduleRes.data;

    const attendanceRes = await axios.get<{ results: AttendanceRecord[] }>(
      `${baseURL}/attendance/meeting-event/attendance`,
      { 
        headers,
        params: {
          start_date: startDate,
          end_date: endDate,
          meetingEventId: scheduleId,
          length: 1000
        }
      }
    );

    const records = attendanceRes.data?.results || [];

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

function calculateUserStats(records: AttendanceRecord[], schedule: Schedule) {
  let stats = {
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
        const workHours = calculateWorkHours(record.inTime, record.outTime);
        stats.totalWorkHours += workHours;

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
  let totalWorkHours = 0;
  let overtimeDays = 0;
  let totalOvertime = 0;

  records.forEach(record => {
    if (record.inTime && record.outTime) {
      totalWorkHours += calculateWorkHours(record.inTime, record.outTime);

      if (schedule.end_time) {
        const overtime = calculateOvertime(record.date, record.outTime, schedule.end_time);
        if (overtime > 0) {
          overtimeDays++;
          totalOvertime += overtime;
        }
      }
    }
  });

  return {
    totalWorkHours: Math.round(totalWorkHours),
    overtimeDays,
    totalOvertime: Math.round(totalOvertime)
  };
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