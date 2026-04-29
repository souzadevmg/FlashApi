import express from "express";
import authenticateApiKey from "../middleware/auth.js";
import Store from "../models/Store.js";
import Session from "../models/Session.js";
import logger from "../utils/logger.js";
import config from "../config/env.js";
import BaileysService from "../services/BaileysService.js";

const router = express.Router();

// Rota para obter configurações da sessão
router.get("/session", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];

    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Sessão não encontrada",
      });
    }

    const config = await Store.getSessionConfig(sessionId);
    const stats = await Store.getSessionStats(sessionId);
    const proxy = await Session.getProxy(sessionId);

    res.json({
      success: true,
      data: {
        sessionId,
        stats,
        proxy,
        config,
      },
    });
  } catch (error) {
    logger.error("Erro ao obter configurações da sessão:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor",
    });
  }
});

// Rota para atualizar configurações da sessão
router.put("/config", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const {
      ignoreGroups = false,
      autoRead = false,
      msg_rejectcalls = null,
      rejectCalls = false,
    } = req.body;

    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Sessão não encontrada",
      });
    }

    const currentConfig = (await Store.getSessionConfig(sessionId)) || {};
    currentConfig.rejeitar_ligacoes = rejectCalls;
    currentConfig.ignorar_grupos = ignoreGroups;
    currentConfig.leitura_automatica = autoRead;
    currentConfig.msg_rejectcalls = msg_rejectcalls;

    const success = await Store.saveSessionConfig(sessionId, currentConfig);
    if (!success) {
      return res.status(500).json({
        success: false,
        message: "Erro ao salvar configurações",
      });
    }
    const sock = await BaileysService.getSocket(sessionId);
    if (sock) {
      if (sock?.end) {
        try {
          await sock.end();
        } catch (error) {}
      }
    }

    res.json({
      success: true,
      message: "Configurações atualizadas com sucesso",
      data: { sessionId, currentConfig },
    });

    logger.info(`Configurações da sessão ${sessionId} atualizadas`);
  } catch (error) {
    logger.error("Erro ao atualizar configurações da sessão:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor",
    });
  }
});

// Rota para configurar webhook
router.put("/webhook", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const { webhookUrl, status_webhook = false, events = [] } = req.body;

    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Sessão não encontrada",
      });
    }

    // Validar URL se fornecida
    if (webhookUrl && webhookUrl !== null) {
      try {
        new URL(webhookUrl);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: "URL do webhook inválida",
        });
      }
    }
    const status = status_webhook == true ? 1 : 0;

    const currentConfig = (await Store.getSessionConfig(sessionId)) || {};
    currentConfig.webhook_url = webhookUrl;
    currentConfig.events = events;
    currentConfig.webhook_status = status;
    const success = await Store.saveSessionConfig(sessionId, currentConfig);
    if (!success) {
      return res.status(500).json({
        success: false,
        message: "Erro ao salvar webhook",
      });
    }

    res.json({
      success: true,
      message: "Webhook Atualizado com sucesso",
      data: { sessionId, currentConfig },
    });

    logger.info(
      `Webhook da sessão ${sessionId} ${webhookUrl ? "configurado" : "removido"}`,
    );
  } catch (error) {
    logger.error("Erro ao configurar webhook:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor",
    });
  }
});

// Rota para obter estatísticas da sessão
router.get("/stats", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];

    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Sessão não encontrada",
      });
    }

    const stats = await Store.getSessionStats(sessionId);

    res.json({
      success: true,
      data: {
        sessionId,
        stats,
        sessionInfo: {
          status: session.status,
          phoneNumber: session.numero,
          createdAt: session.created_at,
          updatedAt: session.updated_at,
        },
      },
    });
  } catch (error) {
    logger.error("Erro ao obter estatísticas da sessão:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor",
    });
  }
});

// Rota para atualizar configurações de proxy
router.put("/proxy", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const {
      protocol,
      username = "",
      password = "",
      host,
      port,
      active = false,
    } = req.body;
    const requiredFields = ["protocol", "host", "port"];
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Sessão não encontrada",
      });
    }

    const proxyConfig = { protocol, username, password, host, port, active };
    const setProxy = await Session.setProxy(sessionId, proxyConfig);
    if (setProxy.affectedRows === 0) {
      return res.status(500).json({
        success: false,
        message: "Erro ao salvar configurações de proxy",
      });
    }
    const sock = await BaileysService.getSocket(sessionId);
    let conect;
    if (sock) {
      if (sock?.end) {
        try {
          await sock.end();
        } catch (error) {
          conect = await BaileysService.createSession(sessionId);
        }finally{
          conect = await BaileysService.createSession(sessionId);
        }
      } else {
        conect = await BaileysService.createSession(sessionId);
      }
    } else {
      conect = await BaileysService.createSession(sessionId);
    }
    res.json({
      success: true,
      message: "Configurações de proxy atualizadas com sucesso",
      conect,
      data: { sessionId, proxyConfig },
    });
    logger.info(`Configurações de proxy da sessão ${sessionId} atualizadas`);
  } catch (error) {
    logger.error("Erro ao atualizar configurações de proxy:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor",
    });
  }
});

export default router;
