import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  proto,
  decryptPollVote,
  downloadMediaMessage,
  initAuthCreds,
  BufferJSON,
  useMultiFileAuthState,
  generateWAMessageFromContent,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";

import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import pino from "pino";
import Session from "../models/Session.js";
import Store from "../models/Store.js";
import GlobalWebhookService from "./GlobalWebhookService.js";
import WebhookService from "./WebhookService.js";
import logger from "../utils/logger.js";
import configenv from "../config/env.js";
import digestSync from "crypto-digest-sync";
import moment from "moment-timezone";
import { release } from "os";
import qrTerminal from "qrcode-terminal";
import NodeCache from "node-cache";
import { HttpsProxyAgent } from "https-proxy-agent";
import redis from "./redis.js";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import Redis from "ioredis";
import { pipeline } from "stream";
import usePostgresAuthState from "./usePostgresAuthStore.js";

class BaileysService {
  constructor() {
    this.globalWebSocketService = null;
    this.healthCheckInterval = null;
    this.keepAliveInterval = null;
    this.sessionMonitors = new Map();
  }

  static redis = redis;
  static BIZ_NATIVE_LIST = [
    {
      tag: "biz",
      attrs: {},
      content: [
        {
          tag: "list",
          attrs: { type: "product_list", v: "2" },
        },
      ],
    },
  ];
  static BIZ_NATIVE_FLOW_NODE = [
    {
      tag: "biz",
      attrs: {},
      content: [
        {
          tag: "interactive",
          attrs: { type: "native_flow", v: "1" },
          content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }],
        },
      ],
    },
  ];
  static sockets = new Map();
  static msgRetryCounterCache = new NodeCache({
    stdTTL: 5 * 60,
    useClones: false,
  });
  static keepAliveIntervals = new Map();
  static sessionHeartbeats = new Map();
  static reconnectAttempts = new Map();
  static qrcodelimites = new Map();
  static pendingChatsBySession = new Map();
  static chatsFlushTimers = new Map();
  static chatsFlushInProgress = new Map();
  static sessionDeleteInFlight = new Map();
  static SESSIONS_STATS_CACHE_KEY = "cache:sessions:stats";
  static SESSIONS_STATS_CACHE_TTL_SECONDS = 120;

  static setGlobalWebSocketService(service) {
    this.globalWebSocketService = service;
  }

  static async initialize() {
    logger.info("[wa] initializing BaileysService");

    // Restaurar sessões ativas do banco
    await this.restoreActiveSessions();

    logger.info("[wa] BaileysService initialized");
  }

  static async restoreActiveSessions() {
    try {
      const sessions = await Session.findByApiKey();
      logger.info(`[wa] restoring sessions count=${sessions.length}`);

      for (const session of sessions) {
        await Session.update(session.apikey, { status: "disconnected" });
        logger.info(`[wa][${session.apikey}] restore wait=2000ms`);
        await this.delay(2000);
        logger.info(`[wa][${session.apikey}] restore start`);
        await this.createSession(session.apikey, session.numero, false);
      }
    } catch (error) {
      logger.error("[wa] restore sessions error:", error);
    }
  }

  static async createSession(sessionId, phoneNumber = null, type = "qrcode", limitqr = true) {
    try {
      const getsessao = await Session.findById(sessionId);
      if (!getsessao) {
        return {
          success: false,
          message: "Sessão não encontrada no banco de dados",
        };
      }
      if (phoneNumber) {
        getsessao.numero = phoneNumber;
      }
      await this.redis.set(`sessao:${sessionId}`, getsessao);
      if (getsessao) {
        if (getsessao.status == "connected") {
          logger.warn(`⚠️ Sessão ${sessionId} já está conectada. Não criar outra instância.`);
          return { success: false, message: "Sessão já conectada" };
        }
      }
      const { state, saveCreds } = await usePostgresAuthState(sessionId);

      const { version, isLatest } = await fetchLatestBaileysVersion();
      logger.info(`using WA v${version.join(".")}, isLatest: ${isLatest}`);

      let browserOptions = {};
      let number = false;

      //Verificar se a conexão e via codigo ou qrcode
      if (type == "code") {
        if (!phoneNumber || phoneNumber == "") {
          return {
            success: false,
            message: "Número de telefone é obrigatório para login por código",
          };
        }
        number = phoneNumber;
      } else {
        const browser = [configenv.sessao_phone, configenv.sessao_phone_name, release()];
        browserOptions = { browser };
      }

      const getMessage = async (key) => {
        const keymsg = `message:${sessionId}_${key.id}`;
        const existingMessage = await this.redis.get(keymsg);
        return existingMessage || undefined;
      };

      const configs = {
        version,
        logger: pino({ level: configenv.baileysLogLevel || "info" }),
        printQRInTerminal: false,
        ...browserOptions,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        generateHighQualityLinkPreview: true,
        syncFullHistory: configenv.sync_sessions,
        markOnlineOnConnect: false,
        fireInitQueries: true,
        emitOwnEvents: true,
        msgRetryCounterCache: this.msgRetryCounterCache,
        defaultQueryTimeoutMs: undefined,
        retryRequestDelayMs: 1000,
        maxMsgRetryCount: 3,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        qrTimeout: 45000,
        getMessage,
      };

      // Configurações de proxy individuais por sessão (sobrescreve configurações globais)
      const exists = await Session.getProxy(sessionId);
      if (exists?.active && exists.active) {
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
      if (configenv.proxy_state === "true" && (!exists?.active || exists.active !== true)) {
        try {
          const agent = new HttpsProxyAgent(
            `${configenv.proxy_protocol}://${configenv.proxy_usename}:${configenv.proxy_password}@${configenv.proxy_host}:${configenv.proxy_port}`,
          );
          logger.info(`Instacia ${sessionId} 🛰️ Usando proxy ${configenv.proxy_host}:${configenv.proxy_port}`);
          configs.agent = agent;
        } catch (err) {
          logger.error("❌ Erro ao criar ProxyAgent:", err);
          configs.agent = undefined; // fallback sem proxy
        }
      }

      const sock = makeWASocket(configs);
      this.sockets.set(sessionId, sock);

      // Event handlers
      this.EventsGet(sock, sessionId, saveCreds, limitqr);

      return { success: true, message: getsessao };
    } catch (error) {
      logger.error(`❌ Erro ao criar sessão ${sessionId}:`, error);
      throw error;
    }
  }

  //Buscar sockets
  static getSocket(sessionId) {
    return this.sockets.get(sessionId);
  }

  //Eventos
  static EventsGet(sock, sessionId, saveCreds, limitqr) {
    try {
      logger.info(`[wa][${sessionId}] register sock.ev handlers`);

      // Debug opcional: mostra quais blocos de eventos a Baileys está entregando.
      if (String(configenv.baileys_debug_events || "false") === "true") {
        sock.ev.process(async (events) => {
          try {
            logger.info(`[wa][${sessionId}] ev=${Object.keys(events).join(",")}`);
          } catch (error) {}
        });
      }

      // Connection updates
      sock.ev.on("connection.update", async (update) => {
        await this.update_conexao(sessionId, update, limitqr);
      });

      // Credenciais atualizadas - SALVAR NO POSTGRESQL
      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("messaging-history.status", async (dados) => {});

      // Messages - com throttling
      sock.ev.on("messages.upsert", ({ messages, type }) => {
        this.msgrecebidas(sessionId, messages, type).catch((error) => {
          logger.error(`Erro no pipeline messages.upsert da sessão ${sessionId}:`, error);
        });
      });

      // Message updates (read receipts, etc)
      sock.ev.on("messages.update", async (updates) => {
        await this.update_mensagem(sessionId, updates);
      });

      sock.ev.on("chats.update", async (updates) => {
        try {
          this.emitEvent(sessionId, "chats_update", updates).catch((err) => logger.error("Erro emitEvent:", err));
          let chatsProcessados = [];
          for (const update of updates) {
            if (!update.id) continue;

            for (const msg of update.messages || []) {
            }
          }
        } catch (error) {
          logger.error("Erro ao atualizar chats:", error);
        }
      });

      sock.ev.on("contacts.update", async (updates) => {
        await this.emitEvent(sessionId, "contacts_update", updates);

        try {
          const pipeline = BaileysService.redis.client.pipeline();
          for (let contato of updates) {
            if (!contato?.id || !contato?.notify) continue;
            if (contato.id.endsWith("@lid")) {
              const id = contato.id.split("@")[0];

              const mapping = await this.redis.get(`lid-mapping:${sessionId}:${id}`);
              if (mapping) {
                try {
                  contato.id = JSON.parse(mapping) + "@s.whatsapp.net";
                } catch {
                  contato.id = mapping.replace(/"/g, "").trim() + "@s.whatsapp.net";
                }
              } else {
                continue;
              }
            }

            pipeline.rpush(
              "queue:contacts",
              JSON.stringify({
                id: contato.id,
                name: contato.notify || "sem nome",
                notify: contato.notify || null,
                verifiedName: contato.verifiedName || null,
                url_imagem: null,
                status: contato.status || null,
                sessao_id: sessionId,
              }),
            );
          }
          await pipeline.exec();
        } catch (error) {
          logger.error("Erro geral no contacts.update:", error);
        }
      });

      sock.ev.on("contacts.upsert", async (contacts) => {
        const pipeline = BaileysService.redis.client.pipeline();
        for (const c of contacts) {
          if (!c?.id || !c.id.includes("@s.whatsapp.net")) continue;

          pipeline.rpush(
            "queue:contacts",
            JSON.stringify({
              id: c.id,
              name: c.name || "sem nome",
              notify: c.notify || null,
              verifiedName: c.verifiedName || null,
              url_imagem: null,
              status: c.status || null,
              sessao_id: sessionId,
            }),
          );
        }

        await pipeline.exec();
      });

      // Eventos de grupo update
      sock.ev.on("groups.update", async (updates) => {
        const getsessao = await this.redis.get(`sessao:${sessionId}`);
        if (!getsessao || getsessao.ignorar_grupos) return;
        await this.emitEvent(sessionId, "groups_update", updates);
      });

      sock.ev.on("group-participants.update", async (event) => {
        const getsessao = await this.redis.get(`sessao:${sessionId}`);
        if (!getsessao || getsessao.ignorar_grupos) return;
        await this.emitEvent(sessionId, "group_participants_update", event);
      });

      // Presence updates
      sock.ev.on("presence.update", async ({ id, presences }) => {
        try {
          await this.emitEvent(sessionId, "presence_update", {
            jid: id,
            presences,
          });
        } catch (error) {}
      });

      // Call events
      sock.ev.on("call", async (calls) => {
        await this.emitEvent(sessionId, "call_update", calls);
        await this.event_call(sessionId, calls);
      });

      // Histórico - SALVAMENTO DIRETO POSTGRESQL (otimizado para grandes volumes)
      sock.ev.on("messaging-history.set", async (data) => {
        try {
          const batchSize = 100;
          const getsessao = await this.redis.get(`sessao:${sessionId}`);

          if (data.messages?.length > 0) {
            logger.info(`📥 messaging-history.set: ${data.messages.length} mensagens sessão ${sessionId}`);
            const pipeline = BaileysService.redis.client.pipeline();
            try {
              for (let msg of data.messages) {
                try {
                  if (!msg?.key?.remoteJid) continue;

                  let remoteJid = msg.key.remoteJid;
                  // 🔹 ignorar grupos
                  if (msg.key.remoteJid.endsWith("@g.us") && getsessao?.ignorar_grupos) continue;

                  // 🔹 resolver LID
                  if (msg.key.remoteJid.endsWith("@lid")) {
                    const id = msg.key.remoteJid.split("@")[0];
                    const mapping = `lid-mapping:${sessionId}:${id}`;
                    const value = await BaileysService.redis.get(mapping);
                    if (value) {
                      try {
                        msg.key.remoteJid = JSON.parse(value) + "@s.whatsapp.net";
                      } catch {
                        msg.key.remoteJid = value.replace(/"/g, "").trim() + "@s.whatsapp.net";
                      }
                    }
                  }
                  msg.sessao_id = sessionId;
                  pipeline.rpush("queue:messages", JSON.stringify(msg));
                } catch (err) {
                  logger.error(`Erro msg ${msg?.key?.id}`, err);
                }
              }

              await pipeline.exec();
              logger.info(`💾 ${data.messages.length} mensagens sincronizadas sessão ${sessionId}`);
            } catch (error) {
              console.error("Erro ao processar mensagens:", error);
              logger.error("Erro geral messaging-history.set:", error);
            }
          }

          // ✅ Processar chats em lotes
          if (data.chats?.length > 0) {
            logger.info(`📥 messaging-history.set: ${data.chats.length} chats para processar da sessão ${sessionId}`);
            const pipeline = BaileysService.redis.client.pipeline();
            for (const chat of data.chats) {
              try {
                if (!chat?.id) continue;
                if (chat.id.endsWith("@g.us") && getsessao?.ignorar_grupos) continue;
                if (chat.id.endsWith("@lid")) {
                  const id = chat.id.split("@")[0];
                  if (chat?.pnJid && chat.pnJid.endsWith("@s.whatsapp.net")) {
                    chat.id = chat.pnJid;
                  } else {
                    const mapping = await this.redis.get(`lid-mapping:${sessionId}:${id}`);
                    if (mapping) {
                      try {
                        chat.id = JSON.parse(mapping) + "@s.whatsapp.net";
                      } catch (error) {
                        chat.id = mapping.replace(/"/g, "").trim() + "@s.whatsapp.net";
                      }
                    }
                  }
                }
                pipeline.rpush(
                  "queue:chats",
                  JSON.stringify({
                    id: chat.id,
                    name: chat.name || "sem nome",
                    unreadCount: chat.unreadCount || 0,
                    archived: chat.archived || false,
                    pinned: chat.pinned || false,
                    sessao_id: sessionId,
                    muteEndTime: chat.muteEndTime || 0,
                  }),
                );
              } catch (error) {
                logger.error(`Erro ao processar chat ${chat?.id}:`, error);
              }
            }

            await pipeline.exec();

            logger.info(`💾 ${data.chats.length} chats sincronizados para sessão ${sessionId}`);
          }

          // ✅ Processar contatos em lotes
          if (data.contacts?.length > 0) {
            logger.info(`📥 messaging-history.set: ${data.contacts.length} contatos para processar da sessão ${sessionId}`);
            const pipeline = BaileysService.redis.client.pipeline();

            for (const contact of data.contacts) {
              try {
                if (contact.id.endsWith("@g.us")) {
                  continue;
                }
                if (contact.id.endsWith("@lid")) {
                  const id = contact.id.split("@")[0];
                  const existingMapping = await this.redis.get(`lid-mapping:${sessionId}:${id}`);
                  if (existingMapping) {
                    contact.id = JSON.stringify(existingMapping) + "@s.whatsapp.net";
                  } else {
                    continue;
                  }
                }
                contact.url_imagem = null;
                try {
                  const url = await this.getSocket(sessionId).profilePictureUrl(contact.id);
                  contact.url_imagem = url;
                } catch (error) {}

                pipeline.rpush(
                  "queue:contacts",
                  JSON.stringify({
                    id: contact.id,
                    name: contact.name || "sem nome",
                    notify: contact.notify || null,
                    verifiedName: contact.verifiedName || null,
                    url_imagem: contact.url_imagem || null,
                    status: contact.status || null,
                    sessao_id: sessionId,
                  }),
                );
              } catch (error) {
                logger.error(`Erro ao processar contato ${contact?.id}:`, error);
              }
            }
            await pipeline.exec();

            logger.info(`💾 ${data.contacts.length} contatos sincronizados para sessão ${sessionId}`);
          }

          await this.emitEvent(sessionId, "messaging_history_set", {
            messages: data.messages?.length || 0,
            chats: data.chats?.length || 0,
            contacts: data.contacts?.length || 0,
          });

          logger.info(`✅ Histórico de mensagens sincronizado para sessão ${sessionId}`);
        } catch (error) {
          logger.error(`Erro ao processar messaging-history.set na sessão ${sessionId}:`, error);
        }
      });
    } catch (error) {
      logger.error("Erro ao processar eventos:", error);
    }
  }

  //Processar contatos em lotes para otimizar inserção no PostgreSQL
  static async processBufferContatos(sessionId, contatosBuffer) {
    while (contatosBuffer.length > 0) {
      const lote = contatosBuffer.splice(0, 50); //  tamanho do batch

      const contatosValidos = lote.filter((contato) => contato?.id);
      if (!contatosValidos.length) {
        continue;
      }

      await Store.saveContactsBatch(sessionId, contatosValidos).catch((error) => {
        logger.error("Erro ao salvar lote de contatos:", error);
      });

      //  pequeno delay pra não matar o banco
      await new Promise((r) => setTimeout(r, 100));
    }
    return true;
  }

  // Processar mensagens em lotes para inserção otimizada no PostgreSQL
  static async processBufferMessage(sessionId, mensagensBuffer) {
    while (mensagensBuffer.length > 0) {
      const lote = mensagensBuffer.splice(0, 50); //  tamanho do batch

      await Store.saveMessagesBatch(sessionId, lote).catch((error) => {
        logger.error("Erro ao salvar lote de mensagens:", error);
      });

      //  pequeno delay pra não matar o banco
      await new Promise((r) => setTimeout(r, 100));
    }
    return true;
  }

  static async processBufferChats(sessionId, chatsBuffer) {
    while (chatsBuffer.length > 0) {
      const lote = chatsBuffer.splice(0, 50); //  tamanho do batch

      await Store.saveChatsBatch(sessionId, lote).catch((error) => {
        logger.error("Erro ao salvar lote de chats:", error);
      });

      //  pequeno delay pra não matar o banco
      await new Promise((r) => setTimeout(r, 100));
    }
    return true;
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

  static async delRedisSessionData(sessionId) {
    await BaileysService.redis.del(`sessao:${sessionId}`);
    await this.deleteContatos(sessionId);
    await this.deleteMessageRedis(sessionId);
    await this.deleteLid_Mapping(sessionId);
  }

  // Deletar mensagens armazenadas no Redis para uma sessão
  static async deleteMessageRedis(sessionId) {
    const id2s = await BaileysService.redis.client.smembers(`messages:${sessionId}`);
    if (id2s && id2s.length > 0) {
      const pipeline = BaileysService.redis.client.multi();
      id2s.forEach((id2) => {
        pipeline.del(`message:${sessionId}:${id2}`);
      });
      pipeline.del(`messages:${sessionId}`);
      await pipeline.exec();
    }
  }

  // Deletar mapeamento de LID para uma sessão
  static async deleteLid_Mapping(sessionId) {
    const id2s = await BaileysService.redis.client.keys(`lid-mapping:${sessionId}:*`);
    id2s.forEach((key) => {
      BaileysService.redis.del(key);
    });
  }

  // Deletar contatos armazenados no Redis para uma sessão
  static async deleteContatos(sessionId) {
    const id2s = await BaileysService.redis.client.keys(`contatos:${sessionId}:*`);
    id2s.forEach((key) => {
      BaileysService.redis.del(key);
    });
  }

  // Função para throttling de sincronização
  static async chats_set(syncFunction) {
    try {
      await syncFunction();
    } finally {
    }
  }

  static async update_conexao(sessionId, update, limitqr) {
    const { connection, lastDisconnect, qr } = update;
    const sock = this.getSocket(sessionId);
    const sessionData = await this.redis.get(`sessao:${sessionId}`);
    if (!sessionData || !sock) return;

    const disconnectCode = lastDisconnect?.error?.output?.statusCode;
    const phase = connection || (qr ? "qr" : "update");
    logger.info(`[wa][${sessionId}] connection_update phase=${phase}${disconnectCode ? ` code=${disconnectCode}` : ""}`);

    await this.emitEvent(sessionId, "connection_update", update);

    if (qr) {
      let limiteqrcode = await this.qrcodelimites.get(`limiteqrcode:${sessionId}`);
      if (!limiteqrcode) {
        limiteqrcode = { limite: 0 };
        await this.qrcodelimites.set(`limiteqrcode:${sessionId}`, limiteqrcode);
      }

      if (limiteqrcode.limite >= parseInt(configenv.qrcode_limite) && limitqr) {
        logger.info(`[wa][${sessionId}] qr max limit reached`);
        await this.deleteSession(sessionId);
        return { success: false, message: "Limite máximo de QR Code atingido" };
      }

      limiteqrcode.limite += 1;
      await this.qrcodelimites.set(`limiteqrcode:${sessionId}`, limiteqrcode);

      try {
        qrTerminal.generate(qr, { small: true }, (qrcode) => {
          logger.info(`QR Code ${limiteqrcode.limite++}/${configenv.qrcode_limite} Sessão ${sessionId}:\n`, qrcode);
        });
        let code = null;

        if (sessionData.numero && sessionData.numero !== "") {
          try {
            await this.delay(1000);
            code = await sock.requestPairingCode(sessionData.numero);
            logger.info(`[wa][${sessionId}] pairing_code=${code}`);
            sessionData.code = code;
          } catch (error) {
            console.error(`[wa][${sessionId}] pairing code generation error:`, error);
          }
        }

        const qrCodeDataURL = await QRCode.toDataURL(qr);
        sessionData.qrcode = qrCodeDataURL;

        await Session.update(sessionId, {
          status: "qr_ready",
          qr_code: qrCodeDataURL,
          code,
        });

        // Emit QR code event
        this.emitEvent(sessionId, "qr_updated", { qr: qrCodeDataURL, code });

        logger.info(`[wa][${sessionId}] qr generated`);
      } catch (error) {
        logger.error(`[wa][${sessionId}] qr generation error:`, error);
      }
    }

    if (connection === "close") {
      try {
        sessionData.status = "disconnected";
        await Session.update(sessionId, { status: "disconnected" });
        await this.invalidateSessionsStatsCache();
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = (lastDisconnect?.error && lastDisconnect.error.output?.statusCode) !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          return await this.handleReconnection(sessionId, lastDisconnect);
        }

        if (statusCode === 515) {
          // espera antes de reconectar (ANTI-BAN)
          setTimeout(() => {
            return this.handleReconnection(sessionId, lastDisconnect);
          }, 5000);

          return;
        }

        await this.emitEvent(sessionId, "session_disconnected", {
          reason: lastDisconnect?.error?.message,
        });

        logger.info(`[wa][${sessionId}] disconnected logout`);

        await this.deleteSession(sessionId);
        return;
      } catch (error) {
        console.error(`Erro na conexão ${sessionId}: `, error);
      }
    }

    if (connection === "connecting") {
      sessionData.status = "connecting";
      await Session.update(sessionId, { status: "connecting" });
      await this.invalidateSessionsStatsCache();
    }

    if (connection === "open") {
      sessionData.status = "connected";
      sessionData.lastConnected = moment().tz(configenv.timeZone).format("YYYY-MM-DD HH:mm:ss");
      await this.qrcodelimites.delete(`limiteqrcode:${sessionId}`);
      this.reconnectAttempts.delete(sessionId);

      const phoneNumber = sock?.user?.id?.split(":")[0];
      const sessaoDB = await Session.findById(sessionId);
      this.sockets.set(sessionId, sock);
      try {
        const foto = await sock.profilePictureUrl(`${phoneNumber}@s.whatsapp.net`);
        sessionData.url_imagem = foto;
      } catch (error) {}

      sessionData.phoneNumber = phoneNumber;

      await Session.update(sessionId, {
        status: "connected",
        phone_number: phoneNumber,
        qr_code: null,
      });
      await this.invalidateSessionsStatsCache();

      logger.info(`[wa][${sessionId}] connected phone=${phoneNumber || "unknown"}`);
    }

    await this.invalidateSessionsStatsCache();
    await this.redis.set(`sessao:${sessionId}`, sessionData);
  }

  static async msgrecebidas(sessionId, messages, type) {
    if (!Array.isArray(messages) || messages.length === 0) {
      return;
    }

    const getsessao = (await this.redis.get(`sessao:${sessionId}`)) || {};

    const pipeline = this.redis.client.pipeline();
    for (const message of messages) {
      if (!message || !message.key) {
        continue;
      }

      const remoteJid = message?.key?.remoteJid;
      if (!remoteJid || typeof remoteJid !== "string") {
        continue;
      }

      const messageType = this.getMessageType(message.message);
      const text = this.extractMessageContent(message.message);
      if (!messageType) continue;

      const tiposIgnoraveis = new Set(["protocolMessage", "senderKeyDistributionMessage"]);

      if (tiposIgnoraveis.has(messageType)) continue;

      if (remoteJid.endsWith("@g.us") && getsessao?.ignorar_grupos) {
        continue; // Ignorar mensagens de grupos se a configuração estiver ativada
      }

      if (remoteJid.endsWith("status@broadcast")) {
        continue; // Ignorar mensagens de status
      }

      // Verificar se a mensagem é de um contato com LID e criar mapeamento se necessário
      if ((message?.key?.remoteJidAlt && message.key.remoteJidAlt.endsWith("@lid")) || (remoteJid && remoteJid.endsWith("@lid"))) {
        const lidId =
          message.key.remoteJidAlt && message.key.remoteJidAlt.endsWith("@lid")
            ? message.key.remoteJidAlt.split("@")[0]
            : remoteJid && remoteJid.endsWith("@lid")
              ? remoteJid.split("@")[0]
              : null;

        if (lidId) {
          const getLid_Mapping = await this.redis.get(`lid-mapping:${sessionId}:${lidId}`);

          if (!getLid_Mapping) {
            const liJid =
              message.key.remoteJidAlt && message.key.remoteJidAlt.endsWith("@s.whatsapp.net")
                ? message.key.remoteJidAlt.split("@")[0]
                : remoteJid && remoteJid.endsWith("@s.whatsapp.net")
                  ? remoteJid.split("@")[0]
                  : null;

            if (liJid) {
              await this.redis.set(`lid-mapping:${sessionId}:${lidId}`, JSON.stringify(liJid));
              logger.info(`🔄 Mapeamento criado para LID ${lidId} -> ${liJid} na sessão ${sessionId}`);
            }
          }
        }
      }

      // Se a mensagem tiver um remoteJid alternativo com LID, trocar os valores para usar o JID real
      if (message.key.addressingMode === "lid" && message.key.remoteJidAlt) {
        const jid = message.key.remoteJidAlt.endsWith("@s.whatsapp.net")
          ? (message.key.remoteJid = message.key.remoteJidAlt)
          : (message.key.remoteJid = message.key.remoteJid);
      }

      console.log(`[wa][${sessionId}] mensagem recebida type=${messageType} text="${text}"`);
      await this.emitEvent(sessionId, "message_received", {
        message,
      });

      message.sessao_id = sessionId;
      pipeline.rpush("queue:messages", JSON.stringify(message));
      try {
        // Verificar configurações da sessão
        const config = await this.redis.get(`sessao:${sessionId}`);

        // Auto-read
        if (config?.autoRead && !message.key.fromMe && message.key.remoteJid && message.key.id) {
          await this.markAsRead(sessionId, message.key.remoteJid, message.key.id);
        }
      } catch (error) {
        logger.error(`Erro ao processar mensagem:`, error);
      }
    }

    pipeline.exec().catch((error) => {
      logger.error(`Erro ao salvar mensagens no Redis para sessão ${sessionId}:`, error);
    });
  }

  // Atualizações de mensagens (status, etc)
  static async update_mensagem(sessionId, updates) {
    for (const update of updates) {
      try {
        if (!update?.key?.remoteJid) {
          logger.warn(`⚠️ Update de mensagem inválido na sessão ${sessionId}:`, {
            hasUpdate: !!update,
            hasKey: !!update?.key,
            hasRemoteJid: !!update?.key?.remoteJid,
          });
          continue;
        }

        await this.emitEvent(sessionId, "message_update", {
          jid: update.key.remoteJid,
          update,
        });

        logger.debug(`📝 Mensagem atualizada: ${update.key.id} - Status: ${update.update?.status}`);
      } catch (error) {
        logger.error(`Erro ao atualizar mensagem:`, error);
      }
    }
  }

  static async event_call(sessionId, calls) {
    try {
      await this.emitEvent(sessionId, "call", calls);
      const sessiondata = await this.redis.get(`sessao:${sessionId}`);
      const sock = this.getSocket(sessionId);
      if (!sessiondata || !sock) return;

      for (const call of calls) {
        if (sessiondata?.rejeitar_ligacoes && call.status === "offer") {
          await sock.rejectCall(call.id, call.from);
          if (sessiondata?.msg_rejectcalls && sessiondata?.msg_rejectcalls !== "") {
            const message = {
              text: sessiondata.msg_rejectcalls,
            };
            await this.sendMessage(sessionId, call.from, message);
          }
          logger.info(`📞 Chamada rejeitada automaticamente de ${call.from}`);
        }
      }
    } catch (error) {
      logger.error(`Erro ao processar chamadas:`, error);
    }
  }

  static getMessageType(message) {
    if (!message || typeof message !== "object") return null;

    if (message.ephemeralMessage?.message) {
      return this.getMessageType(message.ephemeralMessage.message);
    }

    if (message.viewOnceMessage?.message) {
      return this.getMessageType(message.viewOnceMessage.message);
    }

    if (message.viewOnceMessageV2?.message) {
      return this.getMessageType(message.viewOnceMessageV2.message);
    }

    if (message.viewOnceMessageV2Extension?.message) {
      return this.getMessageType(message.viewOnceMessageV2Extension.message);
    }

    return Object.keys(message)[0] || null;
  }

  static extractMessageContent(message) {
    if (!message || typeof message !== "object") return "";

    if (message.ephemeralMessage?.message) {
      return this.extractMessageContent(message.ephemeralMessage.message);
    }

    if (message.viewOnceMessage?.message) {
      return this.extractMessageContent(message.viewOnceMessage.message);
    }

    if (message.viewOnceMessageV2?.message) {
      return this.extractMessageContent(message.viewOnceMessageV2.message);
    }

    if (message.viewOnceMessageV2Extension?.message) {
      return this.extractMessageContent(message.viewOnceMessageV2Extension.message);
    }

    if (message.conversation) return message.conversation;
    if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
    if (message.imageMessage?.caption) return message.imageMessage.caption;
    if (message.videoMessage?.caption) return message.videoMessage.caption;
    if (message.documentMessage?.caption) return message.documentMessage.caption;
    if (message.buttonsResponseMessage?.selectedDisplayText) return message.buttonsResponseMessage.selectedDisplayText;
    if (message.listResponseMessage?.title) return message.listResponseMessage.title;
    if (message.templateButtonReplyMessage?.selectedDisplayText) return message.templateButtonReplyMessage.selectedDisplayText;
    if (message.templateButtonReplyMessage?.selectedId) return message.templateButtonReplyMessage.selectedId;
    return "";
  }

  static normalizeSessionEvents(rawEvents) {
    if (Array.isArray(rawEvents)) {
      return rawEvents;
    }

    if (typeof rawEvents === "string") {
      try {
        const parsed = JSON.parse(rawEvents);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch {}
    }

    return [];
  }

  static async emitEvent(sessionId, event, data) {
    try {
      // Global WebSocket
      if (this.globalWebSocketService) {
        this.globalWebSocketService.broadcast(sessionId, event, data);
      }

      // Session-specific webhook
      // Prefer Redis cache to avoid one DB query per emitted event.
      const config = await this.redis.get(`sessao:${sessionId}`);
      if (!config) return;
      const enabledEvents = this.normalizeSessionEvents(config?.events);

      const webhookTasks = [];

      // Global Webhook
      webhookTasks.push(
        GlobalWebhookService.sendGlobalWebhook({
          event,
          sessionId,
          data,
        }),
      );

      if (config?.webhook_status && config.webhook_status == "1" && enabledEvents.length > 0) {
        const Isevent = enabledEvents.find((e) => e == event);
        if (Isevent) {
          const webhookService = new WebhookService();
          webhookTasks.push(
            webhookService.sendWebhook(config.webhook_url, {
              event,
              sessionId,
              data,
              timestamp: moment().tz(configenv.timeZone).toISOString(),
            }),
          );
        }
      }

      const highFrequencyEvents = new Set(["message_received", "message_update", "presence_update", "connection_update"]);

      if (highFrequencyEvents.has(event)) {
        Promise.allSettled(webhookTasks).catch(() => {});
        return;
      }

      await Promise.allSettled(webhookTasks);
    } catch (error) {
      logger.error(`Erro ao emitir evento ${event}:`, error);
    }
  }

  // Função para preparar mídia antes de enviar
  static async prepareMedia(sessionId, mediaData) {
    try {
      const sessionData = await this.redis.get(`sessao:${sessionId}`);

      if (!sessionData) {
        throw new Error("Sessão não encontrada ou não conectada");
      }

      // Se for URL, retornar como está
      if (typeof mediaData === "string" && (mediaData.startsWith("http") || mediaData.startsWith("https"))) {
        return { url: mediaData };
      }

      // Se for base64, converter para buffer
      if (typeof mediaData === "string" && mediaData.startsWith("data:")) {
        const base64Data = mediaData.split(",")[1];
        const buffer = Buffer.from(base64Data, "base64");
        return buffer;
      }

      // Se for buffer, retornar como está
      if (Buffer.isBuffer(mediaData)) {
        return mediaData;
      }

      // Se for objeto com url
      if (typeof mediaData === "object" && mediaData.url) {
        return mediaData;
      }

      // Fallback: tentar como URL
      return { url: mediaData };
    } catch (error) {
      logger.error("Erro ao preparar mídia:", error);
      throw new Error("Formato de mídia inválido");
    }
  }

  // Message sending methods
  static async sendMessage(sessionId, to, message) {
    try {
      const sessionData = await this.redis.get(`sessao:${sessionId}`);
      const sock = this.getSocket(sessionId);

      if (!sessionData || !sock) {
        throw new Error("Sessão não encontrada ou não conectada");
      }

      const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;

      // Preparar mídia se necessário
      if (message?.image?.url) {
        message.image = await this.prepareMedia(sessionId, message.image.url);
        message.fileName = "image.jpg";
        message.mimetype = "image/jpeg";
      }
      if (message.video?.url) {
        message.video = await this.prepareMedia(sessionId, message.video.url);
      }
      if (message.audio?.url) {
        message.audio = await this.prepareMedia(sessionId, message.audio.url);
      }
      if (message.document?.url) {
        message.document = await this.prepareMedia(sessionId, message.document.url);
      }
      if (message.sticker?.url) {
        message.sticker = await this.prepareMedia(sessionId, message.sticker.url);
      }

      const result = await sock.sendMessage(jid, message, { quoted: message.quoted || undefined });
      await sock.sendPresenceUpdate("paused", jid);
      logger.info(`📤 Mensagem enviada: ${sessionId} -> ${jid}`);
      return result;
    } catch (error) {
      logger.error(`Erro ao enviar mensagem:`, error);
      throw error;
    }
  }

  // Message sending methods
  static async deleteMessage(sessionId, to, message) {
    try {
      const sock = this.getSocket(sessionId);
      if (!sock) {
        throw new Error("Sessão não encontrada ou não conectada");
      }

      const result = await sock.sendMessage(to, { delete: message });

      logger.info(`📤 Mensagem Deletada: ${sessionId} -> ${to}`);
      return result;
    } catch (error) {
      logger.error(`Erro ao Deletar mensagem:`, error);
      throw error;
    }
  }

  static async sendReaction(sessionId, to, messageId, emoji) {
    try {
      const sock = this.getSocket(sessionId);
      if (!sock) {
        throw new Error("Sessão não encontrada ou não conectada");
      }

      const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;

      const reactionMessage = {
        react: {
          text: emoji,
          key: { remoteJid: jid, id: messageId },
        },
      };

      const result = await sock.sendMessage(jid, reactionMessage);
      return result;
    } catch (error) {
      logger.error(`Erro ao enviar reação:`, error);
      throw error;
    }
  }

  static async sendTyping(sessionId, to, typing, audio = false) {
    try {
      const sock = this.getSocket(sessionId);
      if (!sock) {
        throw new Error("Sessão não encontrada ou não conectada");
      }

      const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
      if (audio) {
        await sock.sendPresenceUpdate(typing ? "recording" : "paused", jid);
      } else {
        await sock.sendPresenceUpdate(typing ? "composing" : "paused", jid);
      }

      return { success: true };
    } catch (error) {
      logger.error(`Erro ao enviar status de digitação:`, error);
      throw error;
    }
  }

  static async markAsRead(sessionId, jid, messageId = null) {
    try {
      const sock = this.getSocket(sessionId);
      if (!sock) {
        throw new Error("Sessão não encontrada ou não conectada");
      }

      if (messageId) {
        await sock.readMessages([{ remoteJid: jid, id: messageId }]);
      } else {
        await sock.chatModify({ markRead: true }, jid);
      }

      return { success: true };
    } catch (error) {
      logger.error(`Erro ao marcar como lida:`, error);
      throw error;
    }
  }

  // Contact methods
  static async getContactProfile(sessionId, jid) {
    const sock = this.getSocket(sessionId);
    if (!sock) {
      throw new Error("Sessão não encontrada ou não conectada");
    }
    try {
      const profile = await sock.getBusinessProfile(jid);
      return profile;
    } catch (error) {
      // Try regular profile if business profile fails
      try {
        const jid2 = jid.includes("@") ? jid : `${jid}@s.whatsapp.net`;
        const status = await sock.fetchStatus(jid2);
        return { status: status?.status };
      } catch (err) {
        logger.error(`Erro ao obter perfil do contato:`, error);
        throw error;
      }
    }
  }

  static async checkNumbers(sessionId, numbers) {
    try {
      const sock = this.getSocket(sessionId);
      if (!sock) {
        throw new Error("Sessão não encontrada ou não conectada");
      }

      const results = [];
      for (const number of numbers) {
        try {
          const jid = number.includes("@") ? number : `${number}@s.whatsapp.net`;
          const [result] = await sock.onWhatsApp(jid);
          results.push({
            number,
            exists: !!result?.exists,
            jid: result?.jid || null,
          });
        } catch (error) {
          results.push({
            number,
            exists: false,
            error: error.message,
          });
        }
      }

      return results;
    } catch (error) {
      logger.error(`Erro ao verificar números:`, error);
      throw error;
    }
  }

  static async blockContact(sessionId, jid) {
    try {
      const sock = this.getSocket(sessionId);
      if (!sock) {
        throw new Error("Sessão não encontrada ou não conectada");
      }

      await sock.updateBlockStatus(jid, "block");
      return { success: true };
    } catch (error) {
      logger.error(`Erro ao bloquear contato:`, error);
      throw error;
    }
  }

  static async unblockContact(sessionId, jid) {
    try {
      const sock = this.getSocket(sessionId);
      if (!sock) {
        throw new Error("Sessão não encontrada ou não conectada");
      }

      await sock.updateBlockStatus(jid, "unblock");
      return { success: true };
    } catch (error) {
      logger.error(`Erro ao desbloquear contato:`, error);
      throw error;
    }
  }

  // Group methods
  static async getGroupInfo(sessionId, groupJid) {
    try {
      const sock = this.getSocket(sessionId);
      if (!sock) {
        throw new Error("Sessão não encontrada ou não conectada");
      }

      const groupInfo = await sock.groupMetadata(groupJid);
      return groupInfo;
    } catch (error) {
      logger.error(`Erro ao obter informações do grupo:`, error);
      throw error;
    }
  }

  static async createGroup(sessionId, subject, participants) {
    try {
      const sock = this.getSocket(sessionId);
      if (!sock) {
        throw new Error("Sessão não encontrada ou não conectada");
      }

      const group = await sock.groupCreate(subject, participants);
      return group;
    } catch (error) {
      logger.error(`Erro ao criar grupo:`, error);
      throw error;
    }
  }

  static async addParticipants(sessionId, groupJid, participants) {
    try {
      const sock = this.getSocket(sessionId);
      if (!sock) {
        throw new Error("Sessão não encontrada ou não conectada");
      }

      const result = await sock.groupParticipantsUpdate(groupJid, participants, "add");
      return result;
    } catch (error) {
      logger.error(`Erro ao adicionar participantes:`, error);
      throw error;
    }
  }

  static async removeParticipants(sessionId, groupJid, participants) {
    try {
      const sock = this.getSocket(sessionId);
      if (!sock) {
        throw new Error("Sessão não encontrada ou não conectada");
      }

      const result = await sock.groupParticipantsUpdate(groupJid, participants, "remove");
      return result;
    } catch (error) {
      logger.error(`Erro ao remover participantes:`, error);
      throw error;
    }
  }

  static async promoteParticipants(sessionId, groupJid, participants) {
    try {
      const sock = this.getSocket(sessionId);
      if (!sock) {
        throw new Error("Sessão não encontrada ou não conectada");
      }

      const result = await sock.groupParticipantsUpdate(groupJid, participants, "promote");
      return result;
    } catch (error) {
      logger.error(`Erro ao promover participantes:`, error);
      throw error;
    }
  }

  static async demoteParticipants(sessionId, groupJid, participants) {
    try {
      const sock = this.getSocket(sessionId);
      if (!sock) {
        throw new Error("Sessão não encontrada ou não conectada");
      }

      const result = await sock.groupParticipantsUpdate(groupJid, participants, "demote");
      return result;
    } catch (error) {
      logger.error(`Erro ao rebaixar participantes:`, error);
      throw error;
    }
  }

  static async leaveGroup(sessionId, groupJid) {
    try {
      const sock = this.getSocket(sessionId);
      if (!sock) {
        throw new Error("Sessão não encontrada ou não conectada");
      }

      await sock.groupLeave(groupJid);
      return { success: true };
    } catch (error) {
      logger.error(`Erro ao sair do grupo:`, error);
      throw error;
    }
  }

  static async updateGroupSubject(sessionId, groupJid, subject) {
    try {
      const sock = this.getSocket(sessionId);
      if (!sock) {
        throw new Error("Sessão não encontrada ou não conectada");
      }

      await sock.groupUpdateSubject(groupJid, subject);
      return { success: true };
    } catch (error) {
      logger.error(`Erro ao atualizar nome do grupo:`, error);
      throw error;
    }
  }

  static async groupSettingUpdate(sessionId, groupJid, subject) {
    try {
      const sock = this.getSocket(sessionId);
      if (!sock) {
        throw new Error("Sessão não encontrada ou não conectada");
      }

      await sock.groupSettingUpdate(groupJid, subject);
      return { success: true };
    } catch (error) {
      logger.error(`Erro ao abrir/fechar grupos:`, error);
      throw error;
    }
  }

  static async updateGroupDescription(sessionId, groupJid, description) {
    try {
      const sock = this.getSocket(sessionId);
      if (!sock) {
        throw new Error("Sessão não encontrada ou não conectada");
      }

      await sock.groupUpdateDescription(groupJid, description);
      return { success: true };
    } catch (error) {
      logger.error(`Erro ao atualizar descrição do grupo:`, error);
      throw error;
    }
  }

  static async deleteSession(sessionId) {
    const inFlight = this.sessionDeleteInFlight.get(sessionId);
    if (inFlight) {
      return inFlight;
    }

    const runDelete = async () => {
      try {
        // Limpar tentativas de reconexão
        this.reconnectAttempts.delete(sessionId);
        this.keepAliveIntervals.delete(sessionId);
        this.sessionHeartbeats.delete(sessionId);
        const sock = this.getSocket(sessionId);
        if (sock) {
          try {
            if (sock.ev && typeof sock.ev.removeAllListeners === "function") {
              sock.ev.removeAllListeners();
            }
          } catch (error) {}

          try {
            if (typeof sock.end === "function") {
              await sock.end();
            } else if (sock.ws && typeof sock.ws.close === "function") {
              sock.ws.close();
            }
          } catch (error) {}

          this.sockets.delete(sessionId);
        }

        await BaileysService.redis.del(`sessao:${sessionId}`);
        this.qrcodelimites.delete(`limiteqrcode:${sessionId}`);
        await this.invalidateSessionsStatsCache();

        logger.info(`🗑️ Sessão ${sessionId} deletada completamente`);
      } catch (error) {
        logger.error(`Erro ao deletar sessão ${sessionId}:`, error);
        throw error;
      } finally {
        this.sessionDeleteInFlight.delete(sessionId);
      }
    };

    const promise = runDelete();
    this.sessionDeleteInFlight.set(sessionId, promise);
    return promise;
  }

  static delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Utility methods
  static async isSessionConnected(sessionId) {
    const sessionData = await this.redis.get(`sessao:${sessionId}`);
    return sessionData && sessionData.status === "connected";
  }

  static async getSession(sessionId) {
    const sessionData = await this.redis.get(`sessao:${sessionId}`);
    const sock = this.getSocket(sessionId);
    if (sock && sessionData && sessionData.status === "connected" && sessionData.phoneNumber) {
      try {
        const perfil = await sock.profilePictureUrl(`${sessionData.phoneNumber}@s.whatsapp.net`);
        sessionData.url_imagem = perfil;
      } catch (error) {
        console.error(`Erro ao obter imagem de perfil para ${sessionId}:`, error);
        logger.error("Erro ao obter imagem de perfil:", error);
      }
    }
    return sessionData;
  }

  static async getSessionsStats() {
    try {
      const cached = await this.redis.get(this.SESSIONS_STATS_CACHE_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      logger.warn("Falha ao ler cache de estatísticas de sessões:", error);
    }

    const sessions = await Session.findByApiKey();

    const sessionsWithStats = await Promise.all(
      sessions.map(async (session) => {
        const memorySession = await this.redis.get(`sessao:${session.apikey}`);
        return {
          apikey: session.apikey,
          nome_sessao: session.nome_sessao,
          status: session.status,
          phoneNumber: session.numero,
          hasWebhook: !!session.webhook_url,
          createdAt: session.created_at,
          updatedAt: session.updated_at,
          inMemory: !!memorySession,
          isConnected: this.isSessionConnected(session.apikey),
          reconnectAttempts: memorySession?.reconnectAttempts || 0,
          lastConnected: memorySession?.lastConnected || null,
          connectionAttempts: memorySession?.connectionAttempts || 0,
        };
      }),
    );

    const stats = {
      total: sessions.length,
      connected: sessions.filter((s) => s.status === "connected").length,
      connecting: sessions.filter((s) => s.status === "connecting" || s.status === "qr_ready").length,
      disconnected: sessions.filter((s) => s.status === "disconnected").length,
    };
    const data = {
      stats,
      sessions: sessionsWithStats,
    };

    try {
      await this.redis.set(this.SESSIONS_STATS_CACHE_KEY, JSON.stringify(data), this.SESSIONS_STATS_CACHE_TTL_SECONDS);
    } catch (error) {
      logger.warn("Falha ao gravar cache de estatísticas de sessões:", error);
    }

    return data;
  }

  static async invalidateSessionsStatsCache() {
    try {
      await this.redis.del(this.SESSIONS_STATS_CACHE_KEY);
    } catch (error) {
      logger.warn("Falha ao invalidar cache de estatísticas de sessões:", error);
    }
  }

  static async healthCheck() {
    return {
      status: "healthy",
      timestamp: moment().tz(configenv.timeZone).toISOString(),
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      redis: {
        connected: true,
        accumulatorsInProgress: 0,
      },
    };
  }

  // Gerenciar reconexão inteligente com backoff exponencial
  static async handleReconnection(sessionId, lastDisconnect) {
    try {
      let attempts = this.reconnectAttempts.get(sessionId) || 0;
      attempts++;
      this.reconnectAttempts.set(sessionId, attempts);

      const maxAttempts = 8; // Reduzido para evitar loops infinitos
      if (attempts > maxAttempts) {
        logger.error(`❌ Máximo de tentativas de reconexão atingido para ${sessionId} (${attempts}/${maxAttempts})`);
        await this.deleteSession(sessionId);
        return;
      }

      // Backoff exponencial: 2^attempts segundos, máximo 2 minutos
      const backoffSeconds = Math.min(Math.pow(2, attempts), 120);
      logger.info(`🔄 Tentativa de reconexão ${attempts}/${maxAttempts} para ${sessionId} em ${backoffSeconds}s`);

      // Aguardar antes de reconectar
      await this.delay(backoffSeconds * 1000);

      // Verificar se a sessão ainda existe
      const sessionData = await Session.findById(sessionId);
      if (!sessionData) {
        logger.warn(`⚠️ Sessão ${sessionId} foi removida durante reconexão`);
        return;
      }
      // Tentar reconectar
      await this.createSession(sessionId, sessionData.numero);
    } catch (error) {
      logger.error(`❌ Erro na reconexão de ${sessionId}:`, error);

      // Se erro crítico, aguardar mais tempo antes da próxima tentativa
      const attempts = this.reconnectAttempts.get(sessionId) || 0;
      if (attempts < 8) {
        setTimeout(async () => {
          await this.handleReconnection(sessionId, lastDisconnect);
        }, 60000); // Aguardar 1 minuto em caso de erro
      } else {
        await this.deleteSession(sessionId);
      }
    }
  }

  // Gerenciar perda de conexão detectada
  static async handleConnectionLoss(sessionId) {
    try {
      logger.warn(`🔌 Perda de conexão detectada para ${sessionId}`);

      const sessionData = await Session.findById(sessionId);
      if (!sessionData) return;

      // Marcar como desconectado
      sessionData.status = "disconnected";
      await Session.update(sessionId, { status: "disconnected" });

      // Remover socket
      this.sockets.delete(sessionId);

      // Emitir evento de desconexão
      await this.emitEvent(sessionId, "session_disconnected", {
        reason: "Connection timeout - heartbeat lost",
      });

      // Iniciar processo de reconexão
      await this.handleReconnection(sessionId, null);
    } catch (error) {
      logger.error(`❌ Erro ao gerenciar perda de conexão ${sessionId}:`, error);
    }
  }
}

export default BaileysService;
