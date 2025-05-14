import { Request, Response } from "express";
import { Schedule } from "../entities/Schedule";
import axios, { AxiosError } from "axios";
import { format } from "date-fns";
import { validateSession } from "../utils/validateSession"; // ✅ Import shared validator

export async function getAvailableSchedules(req: Request, res: Response) {
  const valid = validateSession(req, res);
  if (!valid) return;

  const { session } = valid;
  const rawToken = session.rawToken;

  try {
    const today = format(new Date(), "yyyy-MM-dd");
    const { data } = await axios.get(
      `${process.env.ATTENDANCE_API_URL}/attendance/meeting-event/schedule/date/${today}?datatable_plugin`,
      {
        headers: { Authorization: `Token ${rawToken}` },
        timeout: 10000,
      }
    );

    return res.json(
      data.data.map((schedule: any) => ({
        id: schedule.id,
        name: schedule.name,
        startTime: schedule.start_time,
        endTime: schedule.end_time,
        days: schedule.days || [],
        latenessTime: schedule.lateness_time,
      }))
    );
  } catch (error) {
    const err = error as AxiosError;
    console.error("Failed to fetch schedules:", err);
    return res.status(500).json({
      error: "Failed to fetch schedules",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}

export async function getScheduleDetails(req: Request, res: Response) {
  const valid = validateSession(req, res);
  if (!valid) return;

  const { ids } = req.query;
  if (!ids) {
    return res.status(400).json({ error: "Schedule IDs are required" });
  }

  try {
    const idList = (ids as string).split(",").map(Number);
    const schedules = await Schedule.findByIds(idList);

    return res.json(schedules);
  } catch (error) {
    const err = error as Error;
    console.error("Failed to fetch schedule details:", err);
    return res.status(500).json({
      error: "Failed to fetch schedule details",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}

export async function getUsersPerSchedule(req: Request, res: Response) {
  const valid = validateSession(req, res);
  if (!valid) return;

  const { session } = valid;
  const rawToken = session.rawToken;

  const { schedules } = req.query;
  if (!schedules) {
    return res.status(400).json({ error: "Schedule IDs are required" });
  }

  try {
    const scheduleIds = (schedules as string).split(",").map(Number);
    const today = format(new Date(), "yyyy-MM-dd");

    const { data } = await axios.get(
      `${process.env.ATTENDANCE_API_URL}/attendance/meeting-event/attendance`,
      {
        params: {
          filter_date: today,
          meetingEventId: scheduleIds[0],
          length: 1000,
        },
        headers: {
          Authorization: `Token ${rawToken}`,
        },
      }
    );

    const users = data.results
      .filter((r: any) => r.memberId)
      .map((r: any) => ({
        id: r.memberId.id,
        firstName: r.memberId.firstname,
        lastName: r.memberId.surname,
        phone: r.memberId.phone,
        gender: r.memberId.gender,
      }))
      .filter(
        (user: any, index: number, self: any[]) =>
          index === self.findIndex((u) => u.id === user.id)
      );

    return res.json(users);
  } catch (error) {
    const err = error as AxiosError;
    console.error("Failed to fetch users:", err);
    return res.status(500).json({
      error: "Failed to fetch users",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}
