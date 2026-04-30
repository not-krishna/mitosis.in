#!/usr/bin/env node
/* global process, console */

/**
 * Launcher Server
 *
 * Runs on port 3000 and provides HTTP endpoints to start/stop bridge and web app.
 * Allows the Figma plugin executor to control these services.
 */

import http from "http";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pidFile = path.join(__dirname, ".launcher-pids.json");
let bridgeProcess = null;
let webProcess = null;

function savePids() {
  fs.writeFileSync(
    pidFile,
    JSON.stringify(
      {
        bridge: bridgeProcess?.pid || null,
        web: webProcess?.pid || null,
      },
      null,
      2,
    ),
  );
}

function killProcess(proc) {
  if (proc && !proc.killed) {
    try {
      proc.kill("SIGTERM");
    } catch (_e) {
      // Already dead
    }
  }
}

function startServices() {
  // Kill any existing processes
  killProcess(bridgeProcess);
  killProcess(webProcess);

  console.log("[Launcher] Starting bridge...");
  bridgeProcess = spawn("npm", ["run", "bridge:dev"], {
    cwd: __dirname,
    stdio: "pipe",
    shell: true,
  });

  bridgeProcess.stdout?.on("data", (data) => {
    console.log(`[Bridge] ${data}`);
  });

  bridgeProcess.stderr?.on("data", (data) => {
    console.log(`[Bridge] ${data}`);
  });

  bridgeProcess.on("exit", (code) => {
    console.log(`[Launcher] Bridge exited with code ${code}`);
    bridgeProcess = null;
    savePids();
  });

  console.log("[Launcher] Starting web app...");
  webProcess = spawn("npm", ["run", "web:dev"], {
    cwd: __dirname,
    stdio: "pipe",
    shell: true,
  });

  webProcess.stdout?.on("data", (data) => {
    console.log(`[Web] ${data}`);
  });

  webProcess.stderr?.on("data", (data) => {
    console.log(`[Web] ${data}`);
  });

  webProcess.on("exit", (code) => {
    console.log(`[Launcher] Web exited with code ${code}`);
    webProcess = null;
    savePids();
  });

  savePids();
  console.log("[Launcher] Services started");
}

function stopServices() {
  console.log("[Launcher] Stopping services...");
  killProcess(bridgeProcess);
  killProcess(webProcess);
  bridgeProcess = null;
  webProcess = null;
  savePids();
  console.log("[Launcher] Services stopped");
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === "/launcher/start" && req.method === "POST") {
    startServices();
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, message: "Services started" }));
    return;
  }

  if (req.url === "/launcher/stop" && req.method === "POST") {
    stopServices();
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, message: "Services stopped" }));
    return;
  }

  if (req.url === "/launcher/status" && req.method === "GET") {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        ok: true,
        bridge: { running: bridgeProcess !== null, pid: bridgeProcess?.pid },
        web: { running: webProcess !== null, pid: webProcess?.pid },
      }),
    );
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ ok: false, error: "Not found" }));
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`[Launcher] Server listening on http://localhost:${PORT}`);
  console.log("[Launcher] Available endpoints:");
  console.log("  POST /launcher/start  - Start bridge and web app");
  console.log("  POST /launcher/stop   - Stop bridge and web app");
  console.log("  GET  /launcher/status - Get current status");
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("[Launcher] Shutting down...");
  stopServices();
  server.close(() => {
    console.log("[Launcher] Server closed");
    process.exit(0);
  });
});
