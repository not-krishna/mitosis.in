#!/usr/bin/env node
/* global process, console */

import { spawn, exec } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pidFile = path.join(__dirname, ".launcher-pids.json");

function savePids(pids) {
  fs.writeFileSync(pidFile, JSON.stringify(pids, null, 2));
}

function loadPids() {
  try {
    return JSON.parse(fs.readFileSync(pidFile, "utf8"));
  } catch {
    return { bridge: null, web: null };
  }
}

function killProcess(pid) {
  try {
    if (process.platform === "win32") {
      exec(`taskkill /PID ${pid} /T /F`);
    } else {
      process.kill(pid, "SIGTERM");
    }
  } catch (error) {
    console.error(`Failed to kill process ${pid}:`, error.message);
  }
}

function start() {
  const pids = loadPids();

  // Kill any existing processes
  if (pids.bridge) killProcess(pids.bridge);
  if (pids.web) killProcess(pids.web);

  console.log("Starting bridge server...");
  const bridge = spawn("npm", ["run", "bridge:dev"], {
    cwd: __dirname,
    stdio: "inherit",
    shell: true,
  });

  console.log("Starting web app...");
  const web = spawn("npm", ["run", "web:dev"], {
    cwd: __dirname,
    stdio: "inherit",
    shell: true,
  });

  savePids({ bridge: bridge.pid, web: web.pid });

  bridge.on("exit", () => {
    console.log("Bridge server stopped");
  });

  web.on("exit", () => {
    console.log("Web app stopped");
  });

  console.log(`Bridge PID: ${bridge.pid}`);
  console.log(`Web PID: ${web.pid}`);
  console.log(`\n✓ Services started successfully`);
  console.log(`Bridge: http://localhost:8787`);
  console.log(`Web App: http://localhost:5173`);
}

function stop() {
  const pids = loadPids();

  if (pids.bridge) {
    console.log(`Killing bridge (PID: ${pids.bridge})...`);
    killProcess(pids.bridge);
  }

  if (pids.web) {
    console.log(`Killing web app (PID: ${pids.web})...`);
    killProcess(pids.web);
  }

  savePids({ bridge: null, web: null });
  console.log("✓ Services stopped");
}

const command = process.argv[2];

if (command === "start") {
  start();
} else if (command === "stop") {
  stop();
} else {
  console.log("Usage: node launcher.js [start|stop]");
  process.exit(1);
}
