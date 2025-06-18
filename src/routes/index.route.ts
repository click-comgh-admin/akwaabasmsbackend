import express from "express";
import {
  verifyToken,
  getSession,
  logout,
} from "../controllers/auth.controller";
import { getAttendanceStats, getUserCounts } from "../controllers/atendance.controller";
import {
  checkRecipient,
  deleteRecipientById,
  deleteRecipients,
  listRecipients,
  deleteRecipientByPhone,
} from "../controllers/recipients.controller";
import { 
  getContact, 
  saveContact 
} from "../controllers/contact.controller";
import { 
  getAdminContacts, 
  addAdminContact 
} from "../controllers/admin-contact.controller";
import { getAvailableSchedules, getScheduleDetails, getUsersPerSchedule } from "../controllers/schedule.controller";
import { getSMSLogs, createScheduledMessages,getScheduledMessages, cancelScheduledMessage } from "../controllers/sms.controller";
import { forwardRequest } from "../controllers/forwarder.controller";

const router = express.Router();

//
// 🔐 AUTH ROUTES
//

// @route   POST /api/auth/verify-token
// @desc    Verifies external token with Timmy server and signs local JWT
router.post("/auth/verify-token", verifyToken);

// @route   GET /api/auth/me
// @desc    Returns session info from verified JWT cookie
router.get("/auth/me", getSession);

// @route   POST /api/auth/logout
// @desc    Clears authToken cookie
router.post("/auth/logout", logout);

//
// 📊 ATTENDANCE ROUTES
//

// @route   GET /api/attendance/stats
// @desc    Retrieves attendance stats (clock-ins, lateness, overtime, etc.)
router.get("/attendance/stats", getAttendanceStats);
router.get("/attendance/users-count", getUserCounts);


//
// 📦 RECIPIENT ROUTES
//

// @route   GET /api/recipients/check
// @desc    Check if a recipient exists by phone and scheduleId
router.get("/recipients/check", checkRecipient);

// @route   DELETE /api/recipients/:id
// @desc    Delete a single recipient by ID
router.delete("/recipients/:id", deleteRecipientById);

// @route   DELETE /api/recipients?type=admin|user
// @desc    Delete all admin or user recipients (bulk delete)
router.delete("/recipients", deleteRecipients);

// @route   GET /api/recipients/list
// @desc    List all recipients filtered by scheduleId, phone, frequency, etc.
router.get("/recipients/list", listRecipients);
router.delete("/recipients/by-phone", deleteRecipientByPhone);

//
// 📞 CONTACT ROUTES
//

// @route   GET /api/contact
// @desc    Get primary and secondary contacts for the client
router.get("/contact", getContact);

// @route   POST /api/contact
// @desc    Save or update client contacts
router.post("/contact", saveContact);

//
// 👥 ADMIN CONTACT ROUTES
//

// @route   GET /api/admin-contact
// @desc    Get all admin contacts for the client
router.get("/admin-contact", getAdminContacts);

// @route   POST /api/admin-contact
// @desc    Add a new admin contact
router.post("/admin-contact", addAdminContact);
//
// 📅 SCHEDULE ROUTES
//

// @route   GET /api/schedules/available
// @desc    Fetch schedules available for the current date
// @access  Protected (requires authToken cookie)
router.get("/schedules/available", getAvailableSchedules);

// @route   GET /api/schedules/details?ids=1,2,3
// @desc    Get full details of multiple schedules by comma-separated IDs
// @access  Protected (requires authToken cookie)
router.get("/schedules/details", getScheduleDetails);

// @route   GET /api/schedules/users?schedules=1
// @desc    Fetch all users assigned to a given schedule
// @access  Protected (requires authToken cookie)
router.get("/schedules/users", getUsersPerSchedule);

//
// ✉️ SMS ROUTES
//

// @route   POST /api/sms/send
// @desc    Send an SMS message to a user and store their recipient record
// @body    { from, to, content, frequency, scheduleId, isAdmin }
// @access  Protected (requires authToken cookie)

// @route   GET /api/sms/logs
// @desc    Retrieve a list of all previously sent SMS logs (latest first)
// @access  Protected (requires authToken cookie)
router.get("/sms/logs", getSMSLogs);
router.post("/sms/scheduled-messages", createScheduledMessages);
router.get("/sms/scheduled-messages", getScheduledMessages);
router.put("/sms/scheduled-messages/:id/cancel", cancelScheduledMessage);
//
// 🌐 API FORWARDER ROUTE
//

// @route   ALL /api/forward/*
// @desc    Forwards any HTTP request (GET, POST, PUT, DELETE, etc.) to https://db-api-v2.akwaabasoftware.com/
// @access  Protected (requires authToken cookie)
// @usage   To call:
//          Original endpoint: https://db-api-v2.akwaabasoftware.com/attendance/meeting-event/schedule/date/2025-11-19
//          Forwarded via:     https://sms-api.akwaabahr.com/api/forward/attendance/meeting-event/schedule/date/2025-11-19
//          The server extracts the rawToken from the JWT stored in authToken cookie and forwards the request with:
//          Authorization: Token {rawToken}
// @example curl --cookie "authToken=your_signed_token" https://sms-api.akwaabahr.com/api/forward/attendance/meeting-event/schedule/date/2025-11-19

router.all("/forward/:path(*)", forwardRequest);


export default router;
