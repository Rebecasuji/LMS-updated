import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

import {
  sendEmailNotification,
  generateLeaveNotificationEmail,
  generatePermissionNotificationEmail,
  generateResetPasswordEmail,
  generateLeaveDecisionEmail,
  generatePermissionDecisionEmail,
} from "./email";

import { getNotificationEmailsServer, supabaseServer } from "./supabaseServerClient";
import crypto from "crypto";
import { cliqService } from "./cliq";
import { generateDailyAttendanceReport } from "./attendanceReport";
import { checkAndRunScheduledReport, markDailyReportSent } from "./scheduler";
import { getLeaveSettings, saveLeaveSettings, getShiftSettings, saveShiftSettings, getHolidaySettings, saveHolidaySettings, getPermissionSettings, savePermissionSettings } from "./settingsManager";


export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // put application routes here
  // prefix all routes with /api

  // Email notification endpoints
  app.post("/api/send-leave-notification", async (req, res) => {
    try {
      const { employeeName, leaveType, startDate, endDate, reason } = req.body;

      // Resolve recipients server-side using Supabase service role (or fall back to ADMIN_EMAIL)
      const { adminEmails, hrEmails } = await getNotificationEmailsServer();
      let recipients = [...(hrEmails || []), ...(adminEmails || [])];

      // Allow a temporary override via FORCE_NOTIFICATION_EMAILS env var
      // e.g. FORCE_NOTIFICATION_EMAILS="E0048-durgadevi@ctint.in,E0053-naveen@ctint.in"
      if (process.env.FORCE_NOTIFICATION_EMAILS) {
        const forced = (process.env.FORCE_NOTIFICATION_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);
        if (forced.length > 0) {
          recipients = forced;
        }
      }

      const emailContent = generateLeaveNotificationEmail(employeeName, leaveType, startDate, endDate, reason);

      const sent = await sendEmailNotification({
        to: recipients,
        subject: `New Leave Application from ${employeeName}`,
        html: emailContent,
        type: 'leave'
      });

      res.json({
        success: sent,
        message: sent ? `Notification sent to ${recipients.length || 0} recipient(s)` : "Failed to send notification"
      });
    } catch (error) {
      console.error('Error sending leave notification:', error);
      res.status(500).json({ success: false, message: "Error sending notification" });
    }
  });

  app.post("/api/send-permission-notification", async (req, res) => {
    try {
      const { employeeName, permissionType, date, startTime, endTime, reason, isLOPApplicable } = req.body;

      // Resolve recipients server-side using Supabase service role (or fall back to ADMIN_EMAIL)
      const { adminEmails, hrEmails } = await getNotificationEmailsServer();
      let recipients = [...(hrEmails || []), ...(adminEmails || [])];

      // Allow a temporary override via FORCE_NOTIFICATION_EMAILS env var
      if (process.env.FORCE_NOTIFICATION_EMAILS) {
        const forced = (process.env.FORCE_NOTIFICATION_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);
        if (forced.length > 0) {
          recipients = forced;
        }
      }

      const emailContent = generatePermissionNotificationEmail(employeeName, permissionType, date, startTime, endTime, reason, isLOPApplicable);

      const sent = await sendEmailNotification({
        to: recipients,
        subject: `New Permission Request from ${employeeName}${isLOPApplicable ? " (LOP Applicable)" : ""}`,
        html: emailContent,
        type: 'permission'
      });

      // Also dispatch instant Zoho Cliq notification to #teaminformation
      cliqService.sendPermissionNotification({
        employeeName,
        employeeCode: req.body.employeeCode,
        permissionType,
        date,
        startTime,
        endTime,
        reason,
        isLOPApplicable,
        status: 'Pending',
      }).catch((err) => console.error('[ZOHO-CLIQ] Permission notification alert failed:', err));

      res.json({
        success: sent,
        message: sent ? `Notification sent to ${recipients.length || 0} recipient(s)` : "Failed to send notification"
      });
    } catch (error) {
      console.error('Error sending permission notification:', error);
      res.status(500).json({ success: false, message: "Error sending notification" });
    }
  });
  app.post("/api/apply-leave", async (req, res) => {
    try {
      const leave = req.body;
      const employeeId = leave.employeeId;

      if (!employeeId || !leave.startDate || !leave.endDate) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
      }

      const isHourlyOdOrOt = leave.duration === 'Hourly' && (leave.type === 'OD' || leave.type === 'OT');
      const requestedFromTime = leave.fromTime || leave.odFromTime;
      const requestedToTime = leave.toTime || leave.odToTime;
      const parseTimeMinutes = (time: unknown) => {
        if (typeof time !== 'string') return null;
        const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d+)?)?$/.exec(time);
        return match ? Number(match[1]) * 60 + Number(match[2]) : null;
      };
      const requestedStartMinutes = parseTimeMinutes(requestedFromTime);
      const requestedEndMinutes = parseTimeMinutes(requestedToTime);

      if (isHourlyOdOrOt && (
        requestedStartMinutes === null ||
        requestedEndMinutes === null ||
        requestedStartMinutes >= requestedEndMinutes
      )) {
        return res.status(400).json({
          success: false,
          message: "Hourly OD / OT must have valid times, with the end time after the start time."
        });
      }

      const db = supabaseServer;
      if (!db) {
        return res.status(500).json({ success: false, message: "Database server connection unavailable" });
      }

      // 1. Fetch existing leaves for this employee that are Pending or Approved
      const { data: existingLeaves, error: fetchError } = await (db.from('leaves') as any)
        .select('start_date, end_date, leave_type, leave_duration_type, from_time, to_time, od_from_time, od_to_time')
        .eq('user_id', employeeId)
        .in('status', ['Pending', 'Approved']);

      if (fetchError) {
        console.error('Error fetching existing leaves for validation:', fetchError);
        return res.status(500).json({ success: false, message: "Database error during validation" });
      }

      // 2. Overlap validation
      let conflictingDates: string[] = [];
      let conflictingLeaveType: string | null = null;

      const parseDateStr = (d: string) => {
        if (!d) return NaN;
        if (d.includes('T')) return new Date(d).getTime();
        return new Date(d + "T00:00:00").getTime();
      };

      const reqStart = parseDateStr(leave.startDate);
      const reqEnd = parseDateStr(leave.endDate);

      for (const existing of existingLeaves || []) {
        const existingStart = parseDateStr(existing.start_date);
        const existingEnd = parseDateStr(existing.end_date);

        if (!isNaN(existingStart) && !isNaN(existingEnd) && reqStart <= existingEnd && reqEnd >= existingStart) {
          const existingStartMinutes = parseTimeMinutes(existing.from_time || existing.od_from_time);
          const existingEndMinutes = parseTimeMinutes(existing.to_time || existing.od_to_time);
          const isHourlyOdOtRequestPair =
            isHourlyOdOrOt &&
            existing.leave_duration_type === 'Hourly' &&
            (existing.leave_type === 'OD' || existing.leave_type === 'OT');
          const sameSingleDate =
            reqStart === reqEnd &&
            existingStart === existingEnd &&
            reqStart === existingStart;

          if (
            isHourlyOdOtRequestPair &&
            sameSingleDate &&
            existingStartMinutes !== null &&
            existingEndMinutes !== null &&
            requestedStartMinutes !== null &&
            requestedEndMinutes !== null &&
            (requestedEndMinutes <= existingStartMinutes || existingEndMinutes <= requestedStartMinutes)
          ) {
            continue;
          }

          const overlapStart = new Date(Math.max(reqStart, existingStart));
          const overlapEnd = new Date(Math.min(reqEnd, existingEnd));

          let current = new Date(overlapStart);
          while (current <= overlapEnd) {
            const d = current.getDate().toString().padStart(2, '0');
            const m = (current.getMonth() + 1).toString().padStart(2, '0');
            const y = current.getFullYear();
            const formattedDate = `${d}/${m}/${y}`;

            if (!conflictingDates.includes(formattedDate)) {
              conflictingDates.push(formattedDate);
            }
            current.setDate(current.getDate() + 1);
          }
          conflictingLeaveType = existing.leave_type;
          break;
        }
      }

      if (conflictingDates.length > 0) {
        if (reqStart === reqEnd && conflictingDates.length === 1) {
          return res.status(400).json({
            success: false,
            message: `You have already applied ${conflictingLeaveType} for ${conflictingDates[0]}. You cannot apply another leave or Comp Off for the same date.`
          });
        } else {
          let dateMsg = conflictingDates.join(', ');
          if (conflictingDates.length === 2) {
            dateMsg = conflictingDates.join(' and ');
          } else if (conflictingDates.length > 2) {
            dateMsg = conflictingDates.slice(0, -1).join(', ') + ' and ' + conflictingDates[conflictingDates.length - 1];
          }
          return res.status(400).json({
            success: false,
            message: `Cannot submit this request. Leave already exists on ${dateMsg}.`
          });
        }
      }

      // 3. Prepare payload for insertion
      const safePayload: any = {
        user_id: leave.employeeId,
        ...(leave.employeeCode ? { username: leave.employeeCode } : {}),
        leave_type: leave.type,
        start_date: leave.startDate,
        end_date: leave.endDate,
        ...(leave.duration ? { leave_duration_type: leave.duration } : {}),
        reason: leave.description,
        attachment: leave.attachment || null,
        ...(leave.odFromTime ? { od_from_time: leave.odFromTime, from_time: leave.odFromTime } : {}),
        ...(leave.odToTime ? { od_to_time: leave.odToTime, to_time: leave.odToTime } : {}),
      };

      const fullPayload: any = {
        ...safePayload,
        ...(leave.employeeName ? { employee_name: leave.employeeName, name: leave.employeeName } : {}),
      };

      // 4. Insert
      const resp = await (db.from('leaves') as any).insert(safePayload).select();

      if (resp.error) {
        console.error('Error inserting leave:', resp.error);
        return res.status(500).json({ success: false, message: resp.error.message || "Database error during insertion" });
      }

      // Automatically send notification to Zoho Cliq channel
      const insertedLeave = Array.isArray(resp.data) && resp.data[0] ? resp.data[0] : null;
      if (insertedLeave) {
        const empName = leave.employeeName || insertedLeave.employee_name || insertedLeave.username || insertedLeave.user_id;
        cliqService.sendLeaveNotification({
          id: insertedLeave.id,
          employeeName: empName,
          leaveType: insertedLeave.leave_type,
          startDate: insertedLeave.start_date,
          endDate: insertedLeave.end_date,
          appliedDate: (insertedLeave.created_at || '').split('T')[0],
          status: insertedLeave.status || 'Pending',
          reason: insertedLeave.reason,
          duration: insertedLeave.leave_duration_type,
        }).catch((err) => console.error('[ZOHO-CLIQ] Failed to send leave notification:', err));
      }

      return res.status(200).json({ success: true, data: resp.data });
    } catch (err) {
      console.error('Error in /api/apply-leave:', err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.post("/api/forgot-password", async (req, res) => {
    try {
      const { employeeCode } = req.body;

      if (!employeeCode) {
        return res.status(400).json({ success: false, message: "Employee Code is required" });
      }

      if (!supabaseServer) {
        return res.status(500).json({ success: false, message: "Supabase not configured" });
      }

      // 1️⃣ Find user
      const { data: user, error } = await supabaseServer
        .from("users")
        .select("*")
        .or(`username.eq.${employeeCode},user_id.eq.${employeeCode.toUpperCase()}`)
        .maybeSingle();

      if (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Database error" });
      }

      const safeUser = user as any;

      if (!safeUser) {
        return res.status(404).json({ success: false, message: "Employee not found" });
      }
      console.log("USER FOUND:", safeUser);
      console.log("USER_ID USED FOR UPDATE:", safeUser.user_id);

      if (safeUser.is_active === false) {
        return res.status(403).json({ success: false, message: "This account is inactive" });
      }

      const userEmail = safeUser.email;

      if (!userEmail) {
        return res.status(400).json({
          success: false,
          message: "No email registered for this employee"
        });
      }

      // 2️⃣ Generate token + expiry
      const token = crypto.randomBytes(32).toString("hex");
      const expiry = Date.now() + 15 * 60 * 1000; // 15 minutes

      // 3️⃣ Save token in DB
      await (supabaseServer
        .from("users") as any)
        .update({
          reset_token: token,
          reset_expiry: expiry
        })
        .eq("user_id", safeUser.user_id);

      // 4️⃣ Create reset link
      const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

      // 5️⃣ Send reset email
      const emailHtml = generateResetPasswordEmail(
        safeUser.username,
        resetLink
      );

      await sendEmailNotification({
        to: [userEmail],
        subject: "Reset Your Password",
        html: emailHtml,
        type: "reset"
      });

      console.log(`[AUTH] Reset link sent to ${userEmail}`);

      res.json({
        success: true,
        message: "Reset link sent to your email"
      });

    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.post("/api/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({ success: false, message: "Token and password are required" });
      }

      if (!supabaseServer) {
        return res.status(500).json({ success: false, message: "Supabase not configured" });
      }

      // 1️⃣ Find user with valid token
      const { data: user, error } = await supabaseServer
        .from("users")
        .select("*")
        .eq("reset_token", token)
        .maybeSingle();

      if (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Database error" });
      }

      const safeUser = user as any;

      if (!safeUser) {
        return res.status(400).json({ success: false, message: "Invalid or expired reset token" });
      }

      if (safeUser.is_active === false) {
        return res.status(403).json({ success: false, message: "This account is inactive" });
      }

      // 2️⃣ Check expiry
      if (safeUser.reset_expiry && Date.now() > safeUser.reset_expiry) {
        // Optionally clear the expired token here
        await (supabaseServer
          .from("users") as any)
          .update({
            reset_token: null,
            reset_expiry: null
          })
          .eq("user_id", safeUser.user_id)

        return res.status(400).json({ success: false, message: "Reset token has expired" });
      }

      // 3️⃣ Update password and clear token
      const { error: updateError } = await (supabaseServer
        .from("users") as any)
        .update({
          password: newPassword, // Note: In a production app, this should be hashed
          reset_token: null,
          reset_expiry: null
        })
        .eq("user_id", safeUser.user_id);

      if (updateError) {
        console.error(updateError);
        return res.status(500).json({ success: false, message: "Failed to update password" });
      }

      console.log(`[AUTH] Password reset successful for user: ${safeUser.username}`);

      res.json({
        success: true,
        message: "Password has been reset successfully"
      });

    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });





  // use storage to perform CRUD operations on the storage interface
  // e.g. storage.insertUser(user) or storage.getUserByUsername(username)

  // Endpoint to update leave status and dispatch notification to Zoho Cliq
  app.post("/api/update-leave-status", async (req, res) => {
    try {
      const { id, status, actionBy, reason } = req.body;
      if (!id || !status) {
        return res.status(400).json({ success: false, message: "Missing id or status" });
      }

      const db = supabaseServer;
      if (!db) {
        return res.status(500).json({ success: false, message: "Database server unavailable" });
      }

      const { data: updatedLeave, error } = await (db.from("leaves") as any)
        .update({
          status,
          action_by: actionBy,
          action_date: new Date().toISOString(),
          reason_for_action: reason || null,
        })
        .eq("id", parseInt(id))
        .select();

      if (error) {
        console.error("Error updating leave in Supabase:", error);
        return res.status(500).json({ success: false, message: error.message });
      }

      // Dispatch Cliq status notification (Approved or Rejected)
      if (updatedLeave && updatedLeave[0] && (status === "Approved" || status === "Rejected")) {
        const row = updatedLeave[0];
        cliqService.sendLeaveStatusUpdate({
          id: row.id,
          employeeName: row.employee_name || row.username || row.user_id,
          leaveType: row.leave_type,
          startDate: row.start_date,
          endDate: row.end_date,
          status,
          actionBy: actionBy || "Manager",
          reason,
        }).catch((err) => console.error("[ZOHO-CLIQ] Status update alert failed:", err));

        // Send email notification to the employee
        try {
          const empId = row.user_id || row.username;
          if (empId && db) {
            const { data: empUser } = await (db.from("users") as any)
              .select("email, name, username")
              .or(`user_id.eq.${empId},username.eq.${empId}`)
              .maybeSingle();

            const empEmail = empUser?.email;
            const empName = row.employee_name || empUser?.name || empUser?.username || empId;

            if (empEmail) {
              const decisionHtml = generateLeaveDecisionEmail(
                empName,
                row.leave_type,
                row.start_date,
                row.end_date,
                status as 'Approved' | 'Rejected',
                actionBy || "Manager",
                reason
              );
              sendEmailNotification({
                to: [empEmail],
                subject: `Your Leave Request has been ${status}`,
                html: decisionHtml,
                type: 'leave',
              }).catch((err) => console.error("[EMAIL] Employee leave decision email failed:", err));
            } else {
              console.warn(`[EMAIL] No email found for employee ${empId} — skipping decision email`);
            }
          }
        } catch (emailErr) {
          console.error("[EMAIL] Error sending leave decision email to employee:", emailErr);
        }
      }

      res.json({ success: true, data: updatedLeave });
    } catch (err: any) {
      console.error("Error in /api/update-leave-status:", err);
      res.status(500).json({ success: false, message: err?.message || "Internal server error" });
    }
  });

  app.post("/api/update-permission-status", async (req, res) => {
    try {
      const { id, status, actionBy, reason, employeeName, permissionType, date, startTime, endTime } = req.body;
      if (!id || !status) {
        return res.status(400).json({ success: false, message: "Missing id or status" });
      }

      const db = supabaseServer;
      if (!db) {
        return res.status(500).json({ success: false, message: "Database server unavailable" });
      }

      const { data: updatedPermission, error } = await (db.from("permissions") as any)
        .update({
          status,
          action_by: actionBy || null,
          action_date: new Date().toISOString(),
          reason_for_action: reason || null,
        })
        .eq("id", parseInt(id))
        .select();

      if (error) {
        console.error("Error updating permission in Supabase:", error);
        return res.status(500).json({ success: false, message: error.message });
      }

      const row = Array.isArray(updatedPermission) && updatedPermission[0] ? updatedPermission[0] : null;
      const emp = employeeName || row?.employee_name || row?.name || row?.username || row?.user_id;
      const pType = permissionType || row?.permission_type || 'Permission';

      // Dispatch Cliq status notification (Approved or Rejected)
      if (status === "Approved" || status === "Rejected") {
        cliqService.sendPermissionStatusUpdate({
          id,
          employeeName: emp,
          permissionType: pType,
          date: date || row?.permission_date || '',
          startTime: startTime || row?.from_time,
          endTime: endTime || row?.to_time,
          status,
          actionBy: actionBy || "Manager",
          reason,
        }).catch((err) => console.error("[ZOHO-CLIQ] Permission status update alert failed:", err));

        // Send email notification to the employee
        try {
          const empId = row?.user_id || row?.username;
          if (empId && db) {
            const { data: empUser } = await (db.from("users") as any)
              .select("email, name, username")
              .or(`user_id.eq.${empId},username.eq.${empId}`)
              .maybeSingle();

            const empEmail = empUser?.email;
            const empDisplayName = emp || empUser?.name || empUser?.username || empId;

            if (empEmail) {
              const decisionHtml = generatePermissionDecisionEmail(
                empDisplayName,
                pType,
                date || row?.permission_date || '',
                startTime || row?.from_time || '',
                endTime || row?.to_time || '',
                status as 'Approved' | 'Rejected',
                actionBy || "Manager",
                reason
              );
              sendEmailNotification({
                to: [empEmail],
                subject: `Your Permission Request has been ${status}`,
                html: decisionHtml,
                type: 'permission',
              }).catch((err) => console.error("[EMAIL] Employee permission decision email failed:", err));
            } else {
              console.warn(`[EMAIL] No email found for employee ${empId} — skipping permission decision email`);
            }
          }
        } catch (emailErr) {
          console.error("[EMAIL] Error sending permission decision email to employee:", emailErr);
        }
      }

      res.json({ success: true, data: updatedPermission });
    } catch (err: any) {
      console.error("Error in /api/update-permission-status:", err);
      res.status(500).json({ success: false, message: err?.message || "Internal server error" });
    }
  });

  // Zoho Cliq OAuth Routes & Management Endpoints
  app.get("/api/cliq/auth", (_req, res) => {
    const authUrl = cliqService.getAuthUrl();
    res.redirect(authUrl);
  });

  app.get("/api/cliq/callback", async (req, res) => {
    const code = req.query.code as string;
    if (!code) {
      return res.status(400).send("<h3>Missing authorization code from Zoho.</h3>");
    }

    const success = await cliqService.exchangeCodeForToken(code);
    if (success) {
      res.send(`
        <div style="font-family: sans-serif; max-width: 500px; margin: 40px auto; padding: 20px; border: 1px solid #10b981; border-radius: 8px; background: #ecfdf5;">
          <h2 style="color: #065f46; margin-top: 0;">✅ Zoho Cliq Connected Successfully!</h2>
          <p style="color: #047857;">Your refresh token and access token have been safely saved. LMS can now send automated leave alerts and scheduled daily reports to the Team Information channel.</p>
          <a href="/employee/dashboard" style="display: inline-block; padding: 10px 18px; background: #059669; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Return to LMS</a>
        </div>
      `);
    } else {
      res.status(500).send(`
        <div style="font-family: sans-serif; max-width: 500px; margin: 40px auto; padding: 20px; border: 1px solid #ef4444; border-radius: 8px; background: #fef2f2;">
          <h2 style="color: #991b1b; margin-top: 0;">❌ Zoho Cliq Connection Failed</h2>
          <p style="color: #b91c1c;">Could not exchange the authorization code for tokens. Please verify client ID and secret.</p>
        </div>
      `);
    }
  });

  app.get("/api/cliq/status", (_req, res) => {
    const status = cliqService.isConfigured();
    res.json({
      success: true,
      ...status,
      channel: process.env.CLIQ_CHANNEL_NAME || "teaminformation",
    });
  });

  const handleDisconnect = (_req: any, res: any) => {
    cliqService.clearTokens();
    res.json({ success: true, message: "Zoho Cliq disconnected successfully" });
  };
  app.post("/api/cliq/disconnect", handleDisconnect);
  app.get("/api/cliq/disconnect", handleDisconnect);

  app.post("/api/cliq/send-daily-report", async (req, res) => {
    try {
      const { date, force } = req.body || {};
      const result = await generateDailyAttendanceReport(date, force !== false);
      if (result.success && !date) markDailyReportSent();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || "Failed to trigger report" });
    }
  });

  app.get("/api/cliq/cron-check", async (_req, res) => {
    try {
      res.json(await checkAndRunScheduledReport());
    } catch (err: any) {
      res.status(500).json({ ran: false, message: err?.message || "Failed to check scheduled report" });
    }
  });

  app.post("/api/cliq/test-leave-notification", async (req, res) => {
    try {
      const { employeeName, leaveType, startDate, endDate, status, reason } = req.body || {};
      const success = await cliqService.sendLeaveNotification({
        id: `test_${Date.now()}`,
        employeeName: employeeName || "Test Employee",
        leaveType: leaveType || "Casual Leave",
        startDate: startDate || new Date().toISOString().split("T")[0],
        endDate: endDate || new Date().toISOString().split("T")[0],
        status: status || "Pending",
        reason: reason || "Testing Zoho Cliq integration from LMS",
      });
      res.json({ success, message: success ? "Test message dispatched to Cliq" : "Failed to send message to Cliq" });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || "Error" });
    }
  });

  // Settings endpoints (Leave rules & Shift timings)
  app.get("/api/settings/leave", async (_req, res) => {
    try {
      const settings = await getLeaveSettings();
      res.json({ success: true, settings });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || "Failed to get leave settings" });
    }
  });

  app.post("/api/settings/leave", async (req, res) => {
    try {
      const updated = req.body;
      await saveLeaveSettings(updated);
      res.json({ success: true, message: "Leave settings saved successfully", settings: await getLeaveSettings() });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || "Failed to save leave settings" });
    }
  });

  app.get("/api/settings/shifts", async (_req, res) => {
    try {
      const settings = await getShiftSettings();
      res.json({ success: true, settings });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || "Failed to get shift settings" });
    }
  });

  app.post("/api/settings/shifts", async (req, res) => {
    try {
      const updated = req.body;
      await saveShiftSettings(updated);
      res.json({ success: true, message: "Shift settings saved successfully", settings: await getShiftSettings() });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || "Failed to save shift settings" });
    }
  });

  // Holiday settings endpoints
  app.get("/api/settings/holidays", async (_req, res) => {
    try {
      const settings = await getHolidaySettings();
      res.json({ success: true, settings });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || "Failed to get holiday settings" });
    }
  });

  app.post("/api/settings/holidays", async (req, res) => {
    try {
      const updated = req.body;
      await saveHolidaySettings(updated);
      res.json({ success: true, message: "Holiday settings saved successfully", settings: await getHolidaySettings() });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || "Failed to save holiday settings" });
    }
  });

  app.get("/api/settings/permissions", async (_req, res) => {
    try {
      const settings = await getPermissionSettings();
      res.json({ success: true, settings });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || "Failed to get permission settings" });
    }
  });

  app.post("/api/settings/permissions", async (req, res) => {
    try {
      const dailyLimitMinutes = Number(req.body?.dailyLimitMinutes);
      await savePermissionSettings({ dailyLimitMinutes });
      res.json({ success: true, message: "Permission settings saved successfully", settings: await getPermissionSettings() });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err?.message || "Failed to save permission settings" });
    }
  });

  return httpServer;
}