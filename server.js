// server.js (safe startup: dynamic imports + timeouts)
import dotenv from "dotenv";
dotenv.config();

import http from "http";
import express from "express";
import cors from "cors";
import { Server as IOServer } from "socket.io";

console.log("[server] entry - starting up", new Date().toISOString());

// dynamic loader helper with timeout
async function importWithTimeout(path, ms = 8000) {
  return Promise.race([
    import(path),
    new Promise((_, rej) => setTimeout(() => rej(new Error(`Import timeout: ${path}`)), ms)),
  ]);
}

let app;
let logger = console;

try {
  // import app first (should be minimal / non-blocking)
  app = (await importWithTimeout("./src/app.js", 5000)).default;
  console.log("[server] imported app.js");
} catch (err) {
  console.error("[server] failed to import app.js:", err && err.message ? err.message : err);
  process.exit(1);
}

// try to import logger (optional)
try {
  const mods = await importWithTimeout("./src/utils/logger.js", 3000).catch(() => null);
  if (mods && mods.logger) logger = mods.logger;
  console.log("[server] logger loaded");
} catch (err) {
  console.warn("[server] logger import failed, using console");
}

const PORT = process.env.PORT || 4000;
const server = http.createServer(app);

// socket.io for streaming responses
const io = new IOServer(server, {
  cors: { origin: "*" },
});

app.set("io", io);

io.on("connection", (socket) => {
  logger.info?.("[socket] client connected", socket.id);
  socket.on("join", ({ sessionId }) => {
    socket.join(sessionId);
    logger.info?.(`[socket] joined room ${sessionId}`);
  });

  socket.on("disconnect", () => {
    logger.info?.("[socket] client disconnected", socket.id);
  });
});

async function tryInitServices() {
  // import the services lazily, each with timeout and safe catch
  try {
    console.log("[server] attempting to import cacheService");
    const { initCache } = (await importWithTimeout("./src/services/cacheService.js", 5000)) || {};
    if (typeof initCache === "function") {
      await Promise.race([initCache(), new Promise((_, rej) => setTimeout(() => rej(new Error("initCache timeout")), 5000))])
        .catch((e) => {
          console.warn("[server] initCache warning (continuing):", e && e.message ? e.message : e);
        });
    } else {
      console.log("[server] initCache not found (skipping)");
    }
  } catch (err) {
    console.warn("[server] cacheService import/init failed, continuing without it:", err && err.message ? err.message : err);
  }

  try {
    console.log("[server] attempting to import vectorService");
    const { initVector } = (await importWithTimeout("./src/services/vectorService.js", 5000)) || {};
    if (typeof initVector === "function") {
      await Promise.race([initVector(), new Promise((_, rej) => setTimeout(() => rej(new Error("initVector timeout")), 5000))])
        .catch((e) => {
          console.warn("[server] initVector warning (continuing):", e && e.message ? e.message : e);
        });
    } else {
      console.log("[server] initVector not found (skipping)");
    }
  } catch (err) {
    console.warn("[server] vectorService import/init failed, continuing without it:", err && err.message ? err.message : err);
  }
}

(async () => {
  try {
    // Start service initializers in sequence (they won't block past timeouts)
    await tryInitServices();

    server.listen(PORT, () => {
      logger.info?.(`Server listening on port ${PORT}`);
      console.log("[server] listening on port", PORT, "pid=", process.pid);
    });
  } catch (err) {
    logger.error?.("Startup error (fatal):", err);
    console.error("[server] fatal startup error:", err);
    process.exit(1);
  }
})();