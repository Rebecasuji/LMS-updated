import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";

async function main() {
  const app = express();
  app.use(express.json());
  const httpServer = createServer(app);

  await registerRoutes(httpServer, app);

  const port = 5050;
  await new Promise<void>((resolve) => httpServer.listen(port, resolve));
  console.log(`[test-server] listening on http://localhost:${port}`);

  const body = {
    employeeName: "Test User",
    leaveType: "Casual",
    startDate: "2026-01-10",
    endDate: "2026-01-11",
    reason: "integration test",
    hrEmails: ["naveen@ctint.in"],
    adminEmails: ["naveen@ctint.in"],
  };

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/send-leave-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    console.log('[test-server] response:', data);
  } catch (err) {
    console.error('[test-server] fetch error:', err);
  } finally {
    httpServer.close(() => {
      console.log('[test-server] server closed');
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error('[test-server] error:', err);
  process.exit(1);
});
