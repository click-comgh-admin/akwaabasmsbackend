import { Request, Response } from "express";
import axios, { AxiosError } from "axios";
import { validateSession } from "../utils/validateSession";

export async function getAttendanceStats(req: Request, res: Response) {
  const valid = validateSession(req, res);
  if (!valid) return;

  const { session } = valid;
  const rawToken = session.rawToken;

  const { scheduleId, phone, startDate, endDate, isAdmin } = req.query;

  if (!scheduleId || !startDate || !endDate) {
    return res.status(400).json({
      error: "Missing required query parameters: scheduleId, startDate, endDate",
    });
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate as string) || !dateRegex.test(endDate as string)) {
    return res.status(400).json({
      error: "Invalid date format. Use yyyy-mm-dd for startDate and endDate",
    });
  }

  try {
    const baseURL = process.env.ATTENDANCE_API_URL;
    const headers = { Authorization: `Token ${rawToken}` };

    const { data } = await axios.get(`${baseURL}/attendance/meeting-event/attendance`, {
      params: {
        start_date: startDate,
        end_date: endDate,
        meetingEventId: scheduleId,
        length: 1000,
      },
      headers,
    });

    const scheduleRes = await axios.get(
      `${baseURL}/attendance/meeting-event/schedule/${scheduleId}`,
      { headers }
    );
    const schedule = scheduleRes.data;

    if (isAdmin === "true") {
      const totalRecords = data.results.length;
      const presentRecords = data.results.filter((r: any) => r.inTime).length;
      const lateRecords = data.results.filter((r: any) => {
        if (!r.inTime) return false;
        if (!r.meetingEventId?.latenessTime) return false;
        return new Date(r.inTime) > new Date(r.meetingEventId.latenessTime);
      }).length;

      const { totalWorkHours, overtimeDays, totalOvertime } = calculateWorkMetrics(data.results, schedule);

      return res.json({
        firstName: "Admin",
        clockIns: presentRecords,
        clockOuts: data.results.filter((r: any) => r.outTime).length,
        lateDays: lateRecords,
        absentDays: totalRecords - presentRecords,
        totalWorkHours,
        overtimeDays,
        totalOvertime,
        scheduleName: schedule.name,
      });
    }

    if (!phone) {
      return res.status(400).json({ error: "Phone number is required for user stats" });
    }

    const userRecords = data.results.filter((r: any) => r.memberId?.phone === phone);
    if (userRecords.length === 0) {
      return res.status(404).json({ error: "No attendance records found for this user" });
    }

    const userStats = calculateUserStats(userRecords, schedule);

    return res.json({
      firstName: userRecords[0]?.memberId?.firstname || "User",
      clockIns: userStats.clockIns,
      clockOuts: userStats.clockOuts,
      lateDays: userStats.lateDays,
      absentDays: userStats.absentDays,
      totalWorkHours: userStats.totalWorkHours,
      overtimeDays: userStats.overtimeDays,
      totalOvertime: userStats.totalOvertime,
      scheduleName: schedule.name,
    });

  } catch (error) {
    const err = error as AxiosError;
    console.error("Failed to fetch attendance stats:", err);
    return res.status(500).json({
      error: "Failed to fetch attendance stats",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}

function calculateWorkMetrics(records: any[], schedule: any) {
  let totalWorkHours = 0;
  let overtimeDays = 0;
  let totalOvertime = 0;

  records.forEach((record) => {
    if (record.inTime && record.outTime) {
      const clockInTime = new Date(record.inTime);
      const clockOutTime = new Date(record.outTime);
      const workHours = (clockOutTime.getTime() - clockInTime.getTime()) / 3600000;
      totalWorkHours += workHours;

      if (schedule.end_time) {
        const scheduleEnd = new Date(`${record.date.split("T")[0]}T${schedule.end_time}`);
        if (clockOutTime > scheduleEnd) {
          overtimeDays++;
          totalOvertime += (clockOutTime.getTime() - scheduleEnd.getTime()) / 3600000;
        }
      }
    }
  });

  return {
    totalWorkHours: Math.round(totalWorkHours),
    overtimeDays,
    totalOvertime: Math.round(totalOvertime),
  };
}

function calculateUserStats(records: any[], schedule: any) {
  let clockIns = 0;
  let clockOuts = 0;
  let lateDays = 0;
  let absentDays = 0;
  let totalWorkHours = 0;
  let overtimeDays = 0;
  let totalOvertime = 0;

  records.forEach((record) => {
    if (record.inTime) {
      clockIns++;

      if (schedule.start_time) {
        const scheduleStart = new Date(`${record.date.split("T")[0]}T${schedule.start_time}`);
        const clockInTime = new Date(record.inTime);
        if (clockInTime > scheduleStart) lateDays++;
      }

      if (record.outTime) {
        clockOuts++;
        const clockOutTime = new Date(record.outTime);
        const workHours = (clockOutTime.getTime() - new Date(record.inTime).getTime()) / 3600000;
        totalWorkHours += workHours;

        if (schedule.end_time) {
          const scheduleEnd = new Date(`${record.date.split("T")[0]}T${schedule.end_time}`);
          if (clockOutTime > scheduleEnd) {
            overtimeDays++;
            totalOvertime += (clockOutTime.getTime() - scheduleEnd.getTime()) / 3600000;
          }
        }
      }
    } else {
      absentDays++;
    }
  });

  return {
    clockIns,
    clockOuts,
    lateDays,
    absentDays,
    totalWorkHours: Math.round(totalWorkHours),
    overtimeDays,
    totalOvertime: Math.round(totalOvertime),
  };
}