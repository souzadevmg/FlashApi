import express from "express";
import { v4 as uuidv4 } from "uuid";
import globalAuth from "../middleware/globalAuth.js";
import BaileysService from "../services/BaileysService.js";
import Session from "../models/Session.js";
import logger from "../utils/logger.js";
import authenticateApiKey from "../middleware/auth.js";
import Store from "../models/Store.js";
import axios from "axios";
import path from "path";

const router = express.Router();

router.post(
  "/create_sessao",
  globalAuth.authenticateGlobalApiKey,
  async (req, res) => {
    try {
      const {
        numero = null,
        criar_sessao = false,
        gerar_qrcode = false,
        nome_sessao = null,
        apikey = null,
        proxy = null,
      } = req.body;

      const uuid = !apikey ? uuidv4() : apikey;

      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(uuid)) {
        logger.warn(`Apikey inválida: ${uuid}`);
        return res.status(400).json({
          success: false,
          message:
            "A apikey fornecida não está no formato UUID v4 válido (ex: 83725a47-fc7a-404a-bbac-206d590bae8f)",
        });
      }

      if (proxy) {
        if (
          typeof proxy != "object" ||
          !proxy.protocol ||
          !proxy.username ||
          !proxy.password ||
          !proxy.host ||
          !proxy.port
        ) {
          logger.warn(`Proxy inválido: ${JSON.stringify(proxy)}`);
          return res.status(400).json({
            success: false,
            message:
              'O proxy fornecido não está no formato válido (ex: { protocol: "http", username: "user", password: "pass", host: "host", port: 8080 })',
          });
        }
      }

      let finalNomeSessao;
      if (nome_sessao === null || nome_sessao === "") {
        const randomDigits = Math.floor(10000 + Math.random() * 90000);
        finalNomeSessao = `instacia_${randomDigits}`;
      } else {
        if (nome_sessao.length <= 5) {
          logger.warn(
            `Nome da sessão "${nome_sessao}" é inválido: deve ter mais de 5 caracteres`,
          );
          return res.status(400).json({
            success: false,
            message: "Nome da sessão deve ter mais de 5 caracteres",
          });
        }
        finalNomeSessao = nome_sessao;
      }

      //Verificar se sessão existe
      const getsessao = await Session.findByApiKey();

      const apikeyExist = getsessao.find((a) => a.apikey === uuid);
      if (apikeyExist) {
        logger.warn(`A apikey: ${uuid} gerada já existe tente novamente`);
        return res.status(409).json({
          success: false,
          message: "A apikey gerada já existe tente novamente",
        });
      }

      const nameExist = getsessao.find((a) => a.nome_sessao === nome_sessao);
      if (nameExist) {
        logger.warn(`Name Sessão: ${nameExist} Já existe`);
        return res.status(409).json({
          success: false,
          message: `Name Sessão: ${nameExist.nome_sessao} Já existe tente outro`,
        });
      }

      //Adicionar sessão
      const addapikey = await Session.addsessao({ uuid, finalNomeSessao });

      if (!addapikey) {
        logger.warn(`Erro ao criar apikey`);
        return res.status(409).json({
          success: false,
          message: "Erro ao criar apikey",
        });
      }

      if (proxy) {
        await Session.setProxy(uuid, proxy);
      }

      await BaileysService.redis.del(BaileysService.SESSIONS_STATS_CACHE_KEY);

      return res.status(200).json({
        success: true,
        message: "sessão criada com sucesso",
        dados: {
          apikey: uuid,
          name: finalNomeSessao,
        },
      });
    } catch (error) {
      logger.error("Erro ao criar apikey:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Erro ao criar apikey",
      });
    }
  },
);

router.put("/conectar_sessao", authenticateApiKey, async (req, res) => {
  try {
    const uuid = req.headers["apikey"];
    const getsessao = await Session.findById(uuid);
    let { numero = null } = req.body;
    if (!getsessao) {
      return res.status(400).json({
        success: false,
        message: "Sessão não existe",
      });
    }

    if (getsessao.stats && getsessao.status === "connected") {
      return res.status(400).json({
        success: false,
        message: "Sessão Já está conectada",
      });
    }

    let phoneNumber = null;
    let type = "qrcode";

    if (!numero && getsessao.numero && (numero === null || numero === "")) {
      numero = getsessao.numero;
    }

    if (numero) {
      type = "code";
      phoneNumber = numero;
    }
    const conectar = await BaileysService.createSession(
      uuid,
      phoneNumber,
      type,
      false,
    );
    if (!conectar || !conectar.success) {
      return res.status(500).json({
        success: false,
        message: conectar.message || "Erro ao iniciar sessão",
      });
    }

    await BaileysService.redis.del(BaileysService.SESSIONS_STATS_CACHE_KEY);

    await BaileysService.delay(7000);
    const getqr = await BaileysService.redis.get(`sessao:${uuid}`);
    // console.log(getqr);
    if (!getqr) {
      return res.status(404).json({
        success: false,
        message:
          "Erro ao buscar dados da sessão caso continue delete a sessao e crie outra",
      });
    }
    const dados = {
      success: true,
      message: "Qrcode Gerado com sucesso",
      qrcode: getqr.qrcode,
      code: getqr.code || null,
    };
    res.status(200).json(dados);
  } catch (error) {
    logger.error("Erro ao criar sessão:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.put("/restart", authenticateApiKey, async (req, res) => {
  try {
    const uuid = req.headers["apikey"];
    const getsessao = await Session.findById(uuid);

    if (!getsessao) {
      return res.status(400).json({
        success: false,
        message: "Sessão não existe",
      });
    }

    const sock = await BaileysService.getSocket(uuid);
    if (sock) {
      if (sock?.end) {
        try {
          sock.end();
        } catch (error) {}
        try {
          await sock.ws.close();
        } catch (error) {}
      }
    }

    await BaileysService.redis.del(BaileysService.SESSIONS_STATS_CACHE_KEY);

    return res.status(200).json({
      success: true,
      message: "Sessão reniciada",
    });
  } catch (error) {
    logger.error("Erro ao criar sessão:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.get("/status", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];

    const session = await Session.findById(sessionId);
    const proxy = await Session.getProxy(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Sessão não encontrada",
      });
    }
    session.url_imagem = null;
    const getsessao = await BaileysService.redis.get(`sessao:${sessionId}`);
    if (getsessao) {
      session.url_imagem = getsessao.url_imagem || null;
    }
    const dados = {
      ...session,
      proxy,
    };

    return res.json({
      success: true,
      data: dados,
    });
  } catch (error) {
    logger.error("Erro ao obter status:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor",
    });
  }
});

router.get("/list", globalAuth.authenticateGlobalApiKey, async (req, res) => {
  try {
    const sessionsWithStats = await BaileysService.getSessionsStats();
    const response = {
      success: true,
      data: {
        ...sessionsWithStats,
        total: sessionsWithStats.sessions.length,
        activeSessions: sessionsWithStats.sessions.filter((s) => s.isConnected)
          .length,
      },
    };

    res.json(response);
  } catch (error) {
    console.log(error);
    logger.error("Erro ao listar sessões:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor",
    });
  }
});

router.get("/health", globalAuth.authenticateGlobalApiKey, async (req, res) => {
  try {
    const healthData = await BaileysService.healthCheck();
    const sessions = await BaileysService.getSessionsStats();
    healthData.sessions = sessions;
    res.json({
      success: true,
      data: healthData,
    });
  } catch (error) {
    console.log(error);
    logger.error("Erro ao verificar saúde do sistema:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor",
    });
  }
});

router.delete(
  "/delete/:sessionId",
  globalAuth.authenticateGlobalApiKey,
  async (req, res) => {
    try {
      const { sessionId } = req.params;

      let sessao = await Session.findById(sessionId);

      if (!sessao) {
        sessao = await Session.findByName(sessionId);
      }

      if (!sessao) {
        return res.status(404).json({
          success: false,
          message: "Sessão não encontrada",
        });
      }

      const targetSessionId = sessao.apikey;

      await BaileysService.deleteSession(targetSessionId);
      await Session.delete(targetSessionId);
      BaileysService.delRedisSessionData(targetSessionId);
      await BaileysService.redis.del(BaileysService.SESSIONS_STATS_CACHE_KEY);

      res.json({
        success: true,
        message: "Sessão deletada com sucesso",
      });

      logger.info(`Sessão deletada: ${targetSessionId}`);
    } catch (error) {
      logger.error("Erro ao deletar sessão:", error);
      res.status(500).json({
        success: false,
        message: "Erro interno do servidor",
      });
    }
  },
);

router.delete("/desconect/:sessionId", authenticateApiKey, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const apiKey = req.headers["apikey"];

    let sessao = await Session.findById(sessionId);
    if (!sessao) {
      sessao = await Session.findByName(sessionId);
      if (apiKey !== sessao.apikey) {
        return res.status(404).json({
          success: false,
          message: "Essa apikey não corresponde a essa sessão",
        });
      }
    }

    if (!sessao) {
      return res.status(404).json({
        success: false,
        message: "Sessão não encontrada",
      });
    }

    const sock = BaileysService.getSocket(sessionId);
    if (!sock) {
      return res.status(404).json({
        success: false,
        message: "Sessão não foi iniciada ainda",
      });
    }
    try {
      await sock.logout();
    } catch (error) {}
    return res.json({
      success: true,
      message: "Sessão Desconectada com sucesso",
    });
  } catch (error) {
    logger.error("Erro ao Desconectada sessão:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor",
    });
  }
});

router.get("/avatar/:apikey", async (req, res) => {
  try {
    const apiKey = req.params.apikey;
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: "ApiKey é obrigatória",
      });
    }
    const sock = BaileysService.getSocket(apiKey);

    if (!sock?.user?.id) {
      return res.sendFile(path.resolve("public/images/image.png"));
    }

    const url = await sock.profilePictureUrl(sock.user.id, "image");

    const response = await axios.get(url, {
      responseType: "stream",
      timeout: 5000,
    });

    res.setHeader("Content-Type", "image/jpeg");
    response.data.pipe(res);
  } catch {
    return res.sendFile(path.resolve("public/images/image.png"));
  }
});

export default router;
