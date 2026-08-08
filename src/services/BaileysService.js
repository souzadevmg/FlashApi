import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  proto,
  decryptPollVote,
  makeCacheableSignalKeyStore,
  jidNormalizedUser,
  getKeyAuthor,
} from "@whiskeysockets/baileys";

import redis, { KEYS } from "./redis.js"
import logger from "../utils/logger.js";
import usePostgresAuthState from "./usePostgresAuthStore.js";
import config from "../config/env.js";
import Session from "../models/Session.js";
import pLimit from 'p-limit';
import { release } from "os";
import pino from "pino";
import { eventBaileys } from "./EventService.js";
import { HttpsProxyAgent } from "https-proxy-agent";


class BaileysService {
  constructor() {
    this.WebSocketService = null;
    this.healthCheckInterval = null;
    this.keepAliveInterval = null;
    this.sessionMonitors = new Map();

  }
  static keys = KEYS();
  static sockets = new Map();
  static countQrcode = new Map();
  static limitReconnect = new Map();
  static redis = redis;

  //Serviço de WebSocket
  static SetWebSocketService(service) {
    this.WebSocketService = service;
  }

  //Iniciar bots
  static async initialize() {
    const getsessoes = await Session.findAllSessao()
    logger.info(`Iniciando ${getsessoes.length} Sessões..`)

    const limit = pLimit(15);
    await Promise.allSettled(getsessoes.map(s => limit(() => this.createSession(s.apikey, null))));
    logger.info('Todos os bots foram iniciados')
  }

  static async salvarSessao(SessionId, dados) {
    logger.info(`Salvando sessão ${SessionId} no redis`)
    this.redis.set(this.keys.sessao(SessionId), dados)
  }

  static async GetSessao(SessionId) {
    logger.info(`Buscando sessão ${SessionId} no redis`)
    return this.redis.get(this.keys.sessao(SessionId))
  }

  static async DeleteSessao(SessionId) {
    logger.info(`Deletando sessão ${SessionId} no redis`)
    this.redis.del(this.keys.sessao(SessionId))
  }

  static toBuffer = (value) => {
    if (!value) return value;
    return Buffer.isBuffer(value) ? value : Buffer.from(value, "base64");
  };

  static async createSession(sessionId, phoneNumber) {
    try {
      const getsessao = await Session.findById(sessionId);
      if (!getsessao) {
        return {
          success: false,
          message: "Sessão não encontrada no banco de dados",
        };
      }

      const sockAtual = this.sockets.get(sessionId)
      if (sockAtual) {
        if (sockAtual?.ws?.socket?.readyState === WebSocket.OPEN && getsessao.status === "connected") {
          return {
            success: false,
            message: "Sessão já conectada",
          };
        }
      }

      if (phoneNumber) {
        getsessao.numero = phoneNumber;
      }

      await this.salvarSessao(sessionId, getsessao)
      const { state, saveCreds } = await usePostgresAuthState(sessionId);
      state.creds.noiseKey = {
        private: this.toBuffer(state.creds.noiseKey.private),
        public: this.toBuffer(state.creds.noiseKey.public)
      };

      state.creds.signedIdentityKey = {
        private: this.toBuffer(state.creds.signedIdentityKey.private),
        public: this.toBuffer(state.creds.signedIdentityKey.public)
      };

      state.creds.signedPreKey = {
        ...state.creds.signedPreKey,
        keyPair: {
          private: this.toBuffer(state.creds.signedPreKey.keyPair.private),
          public: this.toBuffer(state.creds.signedPreKey.keyPair.public)
        }
      };
      const { version, isLatest } = await fetchLatestBaileysVersion();
      logger.info(`using WA v${version.join(".")}, isLatest: ${isLatest}`);


      let browserOptions = {};
      let number = false;

      const browser = [config.sessao_phone, config.sessao_phone_name, release()];
      if (!number) {
        browserOptions = { browser };
      }


      const configs = {
        version: JSON.parse(config.versao),
        logger: pino({ level: config.baileysLogLevel || "info" }),
        printQRInTerminal: false,
        ...browserOptions,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        syncFullHistory: config.sync_sessions,
        markOnlineOnConnect: false,
        fireInitQueries: true,
        emitOwnEvents: true,
        msgRetryCounterCache: this.msgRetryCounterCache,
        linkPreviewImageThumbnailWidth: 192,
        generateHighQualityLinkPreview: true,
        defaultQueryTimeoutMs: undefined,
        retryRequestDelayMs: 1000,
        maxMsgRetryCount: 3,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        qrTimeout: 45000,
        getMessage: (key) => { },
      };

      // Configurações de proxy individuais por sessão (sobrescreve configurações globais)
      const exists = await Session.getProxy(sessionId);
      if (exists?.active) {
        try {
          const agent = new HttpsProxyAgent(`http://${exists.username}:${exists.password}@${exists.host}:${exists.port}`);
          configs.agent = agent;
          logger.info(`Instacia ${sessionId} 🛰️ Usando proxy ${exists.host}:${exists.port}`);
        } catch (err) {
          logger.error("❌ Erro ao criar ProxyAgent:", err);
          configs.agent = undefined; // fallback sem proxy
        }
      }

      // Configurações de proxy globais (aplicadas apenas se a sessão não tiver proxy individual ativo)
      if (config.proxy_state === "true" && (!exists?.active || exists.active !== true)) {
        try {
          const agent = new HttpsProxyAgent(
            `${config.proxy_protocol}://${config.proxy_usename}:${config.proxy_password}@${config.proxy_host}:${config.proxy_port}`,
          );
          logger.info(`Instacia ${sessionId} 🛰️ Usando proxy ${config.proxy_host}:${config.proxy_port}`);
          configs.agent = agent;
        } catch (err) {
          logger.error("❌ Erro ao criar ProxyAgent:", err);
          configs.agent = undefined; // fallback sem proxy
        }
      }

      const sock = makeWASocket(configs);
      this.sockets.set(sessionId, sock);

      // Event handlers

      eventBaileys(sock, sessionId, saveCreds);

      return { success: true };
    } catch (error) {
      logger.error(`❌ Erro ao criar sessão ${sessionId}:`, error);
      throw error;
    }
  }

  // Função genérica para salvar dados em lotes
  static logjson(data, sessionId, nameArquivo = "session_data") {
    try {
      const logsDir = path.join(__dirname, "..", "logs");

      // Cria a pasta se não existir
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      const filePath = path.join(logsDir, `${nameArquivo}_${sessionId}.json`);

      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.log("Erro ao salvar JSON:", error);
    }
  }

  static delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

}

export default BaileysService;
