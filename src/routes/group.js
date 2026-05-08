import express from "express";
import authenticateApiKey from "../middleware/auth.js";
import BaileysService from "../services/BaileysService.js";
import Store from "../models/Store.js";
import logger from "../utils/logger.js";

const router = express.Router();
const GROUP_LIST_CACHE_TTL_SECONDS = 120;

async function getignorarGrupo(req, res, next) {
  const sessionId = req.headers["apikey"];
  const getsessao = await BaileysService.redis.get(`sessao:${sessionId}`);
  if (getsessao && getsessao.ignorar_grupos) {
    return res.status(400).json({ success: false, message: "A sessão está configurada para ignorar grupos" });
  }
  next();
}

function getGroupListCacheKey(sessionId) {
  return `groups:list:${sessionId}`;
}

async function invalidateGroupListCache(sessionId) {
  try {
    await BaileysService.redis.del(getGroupListCacheKey(sessionId));
  } catch (error) {
    logger.error("Erro ao invalidar cache de grupos:", error);
  }
}

router.get("/list", authenticateApiKey, getignorarGrupo, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];

    if (!(await BaileysService.isSessionConnected(sessionId))) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    const cacheKey = getGroupListCacheKey(sessionId);
    const cachedGroups = await BaileysService.redis.get(cacheKey);
    if (Array.isArray(cachedGroups)) {
      return res.json({
        success: true,
        total: cachedGroups.length,
        groups: cachedGroups,
        cache: true,
      });
    }

    const sock = BaileysService.getSocket(sessionId);
    if (!sock) {
      return res.status(400).json({
        success: false,
        message: "Sessão não foi iniciada ainda",
      });
    }

    const groups = await sock.groupFetchAllParticipating();
    const arr = Object.values(groups);

    await BaileysService.redis.set(cacheKey, arr, GROUP_LIST_CACHE_TTL_SECONDS);

    return res.json({
      success: true,
      total: arr.length,
      groups: arr,
      cache: false,
    });
  } catch (error) {
    logger.error("Erro ao listar grupos:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor",
    });
  }
});

router.post("/info", authenticateApiKey, getignorarGrupo, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const { groupJid } = req.body;

    if (!groupJid) {
      return res.status(400).json({
        success: false,
        message: "groupJid é obrigatório",
      });
    }

    if (!BaileysService.isSessionConnected(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    const groupInfo = await BaileysService.getGroupInfo(sessionId, groupJid);

    res.json({
      success: true,
      data: groupInfo,
    });
  } catch (error) {
    logger.error("Erro ao obter informações do grupo:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/create", authenticateApiKey, getignorarGrupo, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const { subject, participants } = req.body;

    if (!subject || !participants || !Array.isArray(participants)) {
      return res.status(400).json({
        success: false,
        message: "subject e participants são obrigatórios",
      });
    }

    if (!BaileysService.isSessionConnected(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    const result = await BaileysService.createGroup(sessionId, subject, participants);

    await invalidateGroupListCache(sessionId);

    res.json({
      success: true,
      message: "Grupo criado com sucesso",
      data: result,
    });
  } catch (error) {
    logger.error("Erro ao criar grupo:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/add-participant", authenticateApiKey, getignorarGrupo, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const { groupJid, participants } = req.body;

    if (!groupJid || !participants || !Array.isArray(participants)) {
      return res.status(400).json({
        success: false,
        message: "groupJid e participants são obrigatórios",
      });
    }

    if (!BaileysService.isSessionConnected(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    const result = await BaileysService.addParticipants(sessionId, groupJid, participants);

    await invalidateGroupListCache(sessionId);

    res.json({
      success: true,
      message: "Participantes adicionados com sucesso",
      data: result,
    });
  } catch (error) {
    logger.error("Erro ao adicionar participantes:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/remove-participant", authenticateApiKey, getignorarGrupo, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const { groupJid, participants } = req.body;

    if (!groupJid || !participants || !Array.isArray(participants)) {
      return res.status(400).json({
        success: false,
        message: "groupJid e participants são obrigatórios",
      });
    }

    if (!BaileysService.isSessionConnected(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    const result = await BaileysService.removeParticipants(sessionId, groupJid, participants);

    await invalidateGroupListCache(sessionId);

    res.json({
      success: true,
      message: "Participantes removidos com sucesso",
      data: result,
    });
  } catch (error) {
    logger.error("Erro ao remover participantes:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/promote", authenticateApiKey, getignorarGrupo, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const { groupJid, participants } = req.body;

    if (!groupJid || !participants || !Array.isArray(participants)) {
      return res.status(400).json({
        success: false,
        message: "groupJid e participants são obrigatórios",
      });
    }

    if (!BaileysService.isSessionConnected(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    const result = await BaileysService.promoteParticipants(sessionId, groupJid, participants);

    await invalidateGroupListCache(sessionId);

    res.json({
      success: true,
      message: "Participantes promovidos com sucesso",
      data: result,
    });
  } catch (error) {
    logger.error("Erro ao promover participantes:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/demote", authenticateApiKey, getignorarGrupo, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const { groupJid, participants } = req.body;

    if (!groupJid || !participants || !Array.isArray(participants)) {
      return res.status(400).json({
        success: false,
        message: "groupJid e participants são obrigatórios",
      });
    }

    if (!BaileysService.isSessionConnected(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    const result = await BaileysService.demoteParticipants(sessionId, groupJid, participants);

    await invalidateGroupListCache(sessionId);

    res.json({
      success: true,
      message: "Participantes rebaixados com sucesso",
      data: result,
    });
  } catch (error) {
    logger.error("Erro ao rebaixar participantes:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/leave", authenticateApiKey, getignorarGrupo, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const { groupJid } = req.body;

    if (!groupJid) {
      return res.status(400).json({
        success: false,
        message: "groupJid é obrigatório",
      });
    }

    if (!BaileysService.isSessionConnected(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    await BaileysService.leaveGroup(sessionId, groupJid);
    await invalidateGroupListCache(sessionId);

    res.json({
      success: true,
      message: "Saiu do grupo com sucesso",
      data: { groupJid },
    });
  } catch (error) {
    logger.error("Erro ao sair do grupo:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/update-subject", authenticateApiKey, getignorarGrupo, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const { groupJid, subject } = req.body;

    if (!groupJid || !subject) {
      return res.status(400).json({
        success: false,
        message: "groupJid e subject são obrigatórios",
      });
    }

    if (!BaileysService.isSessionConnected(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    await BaileysService.updateGroupSubject(sessionId, groupJid, subject);
    await invalidateGroupListCache(sessionId);

    res.json({
      success: true,
      message: "Nome do grupo atualizado com sucesso",
      data: { groupJid, subject },
    });
  } catch (error) {
    logger.error("Erro ao atualizar nome do grupo:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/up-setting", authenticateApiKey, getignorarGrupo, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const { groupJid, subject } = req.body;

    if (!groupJid || !subject) {
      return res.status(400).json({
        success: false,
        message: "groupJid e subject são obrigatórios",
      });
    }

    if (!BaileysService.isSessionConnected(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    await BaileysService.groupSettingUpdate(sessionId, groupJid, subject);
    await invalidateGroupListCache(sessionId);

    res.json({
      success: true,
      message: "Grupo foi fechado com sucesso",
      data: { groupJid, subject },
    });
  } catch (error) {
    logger.error("Erro ao Frecar grupos:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/update-description", authenticateApiKey, getignorarGrupo, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const { groupJid, description } = req.body;

    if (!groupJid || !description) {
      return res.status(400).json({
        success: false,
        message: "groupJid e description são obrigatórios",
      });
    }

    if (!BaileysService.isSessionConnected(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    await BaileysService.updateGroupDescription(sessionId, groupJid, description);
    await invalidateGroupListCache(sessionId);

    res.json({
      success: true,
      message: "Descrição do grupo atualizada com sucesso",
      data: { groupJid, description },
    });
  } catch (error) {
    logger.error("Erro ao atualizar descrição do grupo:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

export default router;
