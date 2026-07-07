import "dotenv/config";
import { sendEmailNotification, generateLeaveNotificationEmail } from "./email";

async function main() {
  const employeeName = "CI Test User";
  const leaveType = "Casual";
  const startDate = "2026-01-10";
  const endDate = "2026-01-11";
  const reason = "Integration test from test-send.ts";

  const html = generateLeaveNotificationEmail(employeeName, leaveType, startDate, endDate, reason);

  const sent = await sendEmailNotification({
    to: ["naveen@ctint.in"],
    subject: `Test Leave Notification from ${employeeName}`,
    html,
    type: "leave",
  });

  console.log("[test-send] sendEmailNotification returned:", sent);
}

main().catch((err) => {
  console.error("[test-send] error:", err);
  process.exit(1);
});
