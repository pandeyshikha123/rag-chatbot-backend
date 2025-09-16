import express from "express";
import cors from "cors";
import routesChat from "./routes/chat.js";
import routesSession from "./routes/session.js";
import { logger } from "./utils/logger.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/", (req, res) => res.send("RAG Chatbot Backend"));

app.use("/api/chat", routesChat);
app.use("/api/session", routesSession);

app.use((err, req, res, next) => {
  logger.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

export default app;
