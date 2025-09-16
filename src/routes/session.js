import express from "express";
import { createSession, getSessionHistory, clearSession } from "../controllers/sessionController.js";

const router = express.Router();

router.post("/", createSession);
router.get("/:sessionId", getSessionHistory);
router.delete("/:sessionId", clearSession);

export default router;
