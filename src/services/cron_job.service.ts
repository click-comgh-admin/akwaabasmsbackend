import cron from "node-schedule";
import { AttendanceService } from "../services/attendance.service";
import { ScheduleService } from "../services/schedule.service";
import { HubtelSMS } from "../services/sms.service";

export const scheduleBackgroundJobs = (
  smsService: HubtelSMS,
  scheduleService: ScheduleService,
  attendanceService: AttendanceService
): void => {
  // Run every minute for testing; change to "0 8 * * *" for daily at 8am
  cron.scheduleJob("* * * * *", async () => {
    try {
      console.log("Running scheduled SMS jobs...");
      const pending = await scheduleService.getPendingSchedules();
      console.log(`Found ${pending.length} pending schedules`);
      
      for (const schedule of pending) {
        try {
          const recipients = await scheduleService.getRecipients(schedule.id);
          console.log(`Processing schedule ${schedule.id} for ${recipients.length} recipients`);
          
          for (const recipient of recipients) {
            try {
              const isAdmin = recipient.messageType === 'Admin Summary';
const senderName = isAdmin ? 'AKWAABA' : schedule.senderName || 'AKWAABA';
              
              const data = await attendanceService.getAttendanceSummary(
                recipient.phone,
                schedule.frequency,
                schedule.meetingEventId,
                schedule.lastSent
              );
              
if (!schedule.template) {
  throw new Error(`No template defined for schedule ${schedule.id}`);
}
const message = scheduleService.formatMessage(data, schedule.template);              await smsService.sendSMS({
                from: senderName,
                to: recipient.phone,
                content: message,
              });
              
              await scheduleService.updateLastSent(schedule.id);
            } catch (error) {
              console.error(`Failed to process recipient ${recipient.phone}:`, error);
            }
          }
        } catch (error) {
          console.error(`Failed to process schedule ${schedule.id}:`, error);
        }
      }
    } catch (error) {
      console.error("Error in scheduled job:", error);
    }
  });
};
