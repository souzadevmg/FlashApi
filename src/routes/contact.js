import express from "express";
import authenticateApiKey from "../middleware/auth.js";
import BaileysService from "../services/BaileysService.js";
import Store from "../models/Store.js";
import logger from "../utils/logger.js";
import fs from "fs";
import util from "util";
import Session from "../models/Session.js";

const router = express.Router();

router.get("/list", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];

    const SoJids = await Store.getContacts(sessionId);
    res.json({
      success: true,
      total: SoJids.length,
      contacts: SoJids,
    });
  } catch (error) {
    console.log(error);
    logger.error("Erro ao listar contatos:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor",
    });
  }
});

router.post("/profile", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const { jid } = req.body;

    if (!jid) {
      return res.status(400).json({
        success: false,
        message: "JID é obrigatório",
      });
    }

    if (!BaileysService.isSessionConnected(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    const profile = await BaileysService.getContactProfile(sessionId, jid);

    res.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    logger.error("Erro ao obter perfil do contato:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/check", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const { numbers } = req.body;

    if (!numbers || !Array.isArray(numbers)) {
      return res.status(400).json({
        success: false,
        message: "Lista de números é obrigatória",
      });
    }

    if (!BaileysService.isSessionConnected(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    const results = await BaileysService.checkNumbers(sessionId, numbers);

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    logger.error("Erro ao verificar números:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/block", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const { jid } = req.body;

    if (!jid) {
      return res.status(400).json({
        success: false,
        message: "JID é obrigatório",
      });
    }

    if (!BaileysService.isSessionConnected(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    await BaileysService.blockContact(sessionId, jid);

    res.json({
      success: true,
      message: "Contato bloqueado com sucesso",
      data: { jid, action: "blocked" },
    });
  } catch (error) {
    logger.error("Erro ao bloquear contato:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/unblock", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const { jid } = req.body;

    if (!jid) {
      return res.status(400).json({
        success: false,
        message: "JID é obrigatório",
      });
    }

    if (!BaileysService.isSessionConnected(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    await BaileysService.unblockContact(sessionId, jid);

    res.json({
      success: true,
      message: "Contato desbloqueado com sucesso",
      data: { jid, action: "unblocked" },
    });
  } catch (error) {
    logger.error("Erro ao desbloquear contato:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

export default router;
