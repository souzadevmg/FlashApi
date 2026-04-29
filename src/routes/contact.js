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

    let contacts = await getAllContacts(sessionId);

    const SoJids = contacts
      .map((c) => {
        if (!c?.id) return null;

        return {
          ...c,
          id: c.id.replace(/"/g, ""), // remove todas aspas
          name: c.name ? c.name.replace(/"/g, "") : "", // remove todas aspas
          notify: c.notify ? c.notify.replace(/"/g, "") : "", // remove todas aspas
        };
      })
      .filter((c) => c && c.id.includes("@s.whatsapp.net"));
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

async function getAllContacts(sessionId) {
  const redis = BaileysService.redis.client;

  let cursor = "0";
  const allKeys = [];

  do {
    const [nextCursor, keys] = await redis.scan(
      cursor,
      "MATCH",
      `contatos:${sessionId}:*`,
      "COUNT",
      500,
    );

    cursor = nextCursor;
    allKeys.push(...keys);
  } while (cursor !== "0");

  if (!allKeys.length) return [];

  // ⚡ pega TODOS os valores de uma vez
  const values = await redis.mget(allKeys);

  const contacts = [];

  for (const v of values) {
    if (!v) continue;

    try {
      contacts.push(JSON.parse(v));
    } catch {
      // ignora inválido
    }
  }

  return contacts;
}

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
