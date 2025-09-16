import dotenv from "dotenv";
dotenv.config();

import http from "http";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server as IOServer } from "socket.io";
import app from "./src/app.js";
import { initCache } from "./src/services/cacheService.js";
import { initVector } from "./src/services/vectorService.js";
import { logger } from "./src/utils/logger.js";

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);

// socket.io for streaming responses
const io = new IOServer(server, {
  cors: {
    origin: "*",
  },
});

// attach io to app locals so controllers can access it
app.set("io", io);

io.on("connection", (socket) => {
  logger.info("[socket] client connected", socket.id);
  socket.on("join", ({ sessionId }) => {
    socket.join(sessionId);
    logger.info(`[socket] joined room ${sessionId}`);
  });

  socket.on("disconnect", () => {
    logger.info("[socket] client disconnected", socket.id);
  });
});

(async () => {
  try {
    await initCache();
    await initVector();
    server.listen(PORT, () => {
      logger.info(`Server listening on port ${PORT}`);
    });
  } catch (err) {
    logger.error("Startup error", err);
    process.exit(1);
  }
})();
