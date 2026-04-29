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
import Database from "../config/database.js";
import {
  deleteSession,
  listSessions,
  makePostgresAuthState,
} from "./postgresSessao.js";
import { pipeline } from "stream";

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
  static db = new Database();
  static sockets = new Map();
  static msgRetryCounterCache = new NodeCache({
    stdTTL: 5 * 60,
    useClones: false,
  });
  static keepAliveIntervals = new Map();
  static sessionHeartbeats = new Map();
  static reconnectAttempts = new Map();
  static qrcodelimites = new Map();

  static setGlobalWebSocketService(service) {
    this.globalWebSocketService = service;
  }

  static async initialize() {
    logger.info("🔄 Inicializando BaileysService...");

    // Restaurar sessões ativas do banco
    await this.restoreActiveSessions();

    logger.info("✅ BaileysService inicializado");
  }

  static async restoreActiveSessions() {
    try {
      const sessions = await Session.findByApiKey();
      logger.info(
        `🔄 Restaurando ${sessions.length} sessões do banco de dados...`,
      );

      for (const session of sessions) {
        await Session.update(session.apikey, { status: "disconnected" });
        logger.info(`⌛ Aguardando antes de restaurar ${session.apikey}...`);
        await this.delay(2000);
        logger.info(`🔄 Restaurando sessão: ${session.apikey}`);
        await this.createSession(session.apikey, session.numero, false);
      }
    } catch (error) {
      logger.error("❌ Erro ao restaurar sessões:", error);
    }
  }

  static async createSession(sessionId, phoneNumber = null, type = "qrcode") {
    try {
      const getsessao = await Session.findById(sessionId);
      if (!getsessao) {
        return {
          success: false,
          message: "Sessão não encontrada no banco de dados",
        };
      }

      this.redis.set(`sessao:${sessionId}`, getsessao);
      if (getsessao) {
        if (getsessao.status == "connected") {
          logger.warn(
            `⚠️ Sessão ${sessionId} já está conectada. Não criar outra instância.`,
          );
          return { success: false, message: "Sessão já conectada" };
        }
      }
      const state = await makePostgresAuthState(
        BaileysService.db.pool,
        sessionId,
      );

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
        const browser = [
          configenv.sessao_phone,
          configenv.sessao_phone_name,
          release(),
        ];
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
          keys: state.keys,
        },
        generateHighQualityLinkPreview: true,
        syncFullHistory: configenv.sync_sessions,
        markOnlineOnConnect: false,
        fireInitQueries: true,
        emitOwnEvents: true,
        msgRetryCounterCache: this.msgRetryCounterCache,
        defaultQueryTimeoutMs: 90000,
        retryRequestDelayMs: 1000,
        maxMsgRetryCount: 3,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        qrTimeout: 45000,
        //  patchMessageBeforeSending(message) {
        //   console.log("Mensagem antes de enviar:", message);
        //  },
        // cachedGroupMetadata: async (jid) => {
        //   return this.groupCache.get(`${sessionId}_${jid}`)
        // },
        getMessage,
        shouldIgnoreJid: (jid) => {
          if (!jid) return true;
          if (jid.endsWith("@g.us") && getsessao && getsessao.ignorar_grupos) {
            return true;
          }
          return (
            jid.endsWith("@broadcast") ||
            jid.endsWith("@newsletter") ||
            jid === "status@broadcast"
          );
        },
      };

      // Configurações de proxy individuais por sessão (sobrescreve configurações globais)
      const exists = await Session.getProxy(sessionId);
      if (exists?.active && exists.active) {
        try {
          const agent = new HttpsProxyAgent(
            `http://${exists.username}:${exists.password}@${exists.host}:${exists.port}`,
          );
          configs.agent = agent;
          logger.info(
            `Instacia ${sessionId} 🛰️ Usando proxy ${exists.host}:${exists.port}`,
          );
        } catch (err) {
          logger.error("❌ Erro ao criar ProxyAgent:", err);
          configs.agent = undefined; // fallback sem proxy
        }
      }

      // Configurações de proxy globais (aplicadas apenas se a sessão não tiver proxy individual ativo)
      if (
        configenv.proxy_state === "true" &&
        (!exists?.active || exists.active !== true)
      ) {
        try {
          const agent = new HttpsProxyAgent(
            `${configenv.proxy_protocol}://${configenv.proxy_usename}:${configenv.proxy_password}@${configenv.proxy_host}:${configenv.proxy_port}`,
          );
          logger.info(
            `Instacia ${sessionId} 🛰️ Usando proxy ${configenv.proxy_host}:${configenv.proxy_port}`,
          );
          configs.agent = agent;
        } catch (err) {
          logger.error("❌ Erro ao criar ProxyAgent:", err);
          configs.agent = undefined; // fallback sem proxy
        }
      }

      const sock = makeWASocket(configs);
      this.sockets.set(sessionId, sock);

      // Event handlers
      this.EventsGet(sock, sessionId, state.saveCreds);

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
  static EventsGet(sock, sessionId, saveCreds) {
    try {
      // Connection updates
      sock.ev.on("connection.update", async (update) => {
        await this.update_conexao(sessionId, update);
      });

      // Credentials update
      sock.ev.on("creds.update", saveCreds);

      // Messages - com throttling
      sock.ev.on("messages.upsert", ({ messages, type }) => {
        this.msgrecebidas(sessionId, messages, type).catch((error) => {
          logger.error(
            `Erro no pipeline messages.upsert da sessão ${sessionId}:`,
            error,
          );
        });
      });

      // Message updates (read receipts, etc)
      sock.ev.on("messages.update", async (updates) => {
        await this.update_mensagem(sessionId, updates);
      });

      sock.ev.on("chats.update", async (updates) => {
        try {
          this.emitEvent(sessionId, "chats_update", updates).catch((err) =>
            logger.error("Erro emitEvent:", err),
          );
          let chatsProcessados = [];
          for (const update of updates) {
            if (!update.id) continue;

            for (const msg of update.messages || []) {
              if (
                msg?.message?.key?.addressingMode &&
                msg.message.key.addressingMode === "lid" &&
                msg.message.key.remoteJidAlt
              ) {
                const jid = msg.message.key.remoteJidAlt;
                const lid = msg.message.key.remoteJid;
                msg.message.key.remoteJidAlt = lid;
                msg.message.key.remoteJid = jid;
                update.id = msg.message.key.remoteJid;
              }
            }
            chatsProcessados.push(update);
          }
          await Store.saveChatsBatch(sessionId, chatsProcessados);
        } catch (error) {
          logger.error("Erro ao atualizar chats:", error);
        }
      });

      const BATCH_SIZE = 20;

      sock.ev.on("contacts.update", async (updates) => {
        await this.emitEvent(sessionId, "contacts_update", updates);

        try {
          for (let i = 0; i < updates.length; i += BATCH_SIZE) {
            const lote = updates.slice(i, i + BATCH_SIZE);

            // 🔹 processa tudo primeiro
            const contatosProcessados = await Promise.all(
              lote.map(async (update) => {
                try {
                  if (!update?.id) return null;

                  update.name = update.notify || "";
                  update.url_imagem = null;

                  // 🔹 LID → número
                  if (update.id.includes("@lid")) {
                    const id = update.id.split("@")[0];

                    const getreverse = await this.redis.get(
                      `lid-mapping:${sessionId}:${id}`,
                    );

                    if (getreverse) {
                      let numero = getreverse.replace(/"/g, "").trim();
                      update.id = `${numero}@s.whatsapp.net`;
                    }
                  }

                  // 🔹 Buscar foto
                  if (update.id.includes("@s.whatsapp.net")) {
                    try {
                      update.url_imagem = await sock.profilePictureUrl(
                        update.id,
                      );
                    } catch {
                      update.url_imagem = null;
                    }

                    return update;
                  }

                  return null;
                } catch (err) {
                  logger.error("Erro ao processar contato:", err);
                  return null;
                }
              }),
            );

            // 🔹 remove inválidos
            const validos = contatosProcessados.filter(Boolean);

            // 🔹 salva tudo de uma vez (AGORA SIM batch de verdade)
            if (validos.length) {
              await Store.saveContactsBatch(sessionId, validos);
            }

            // 🔹 delay entre lotes (melhor lugar)
            await this.delay(100);
          }
        } catch (error) {
          logger.error("Erro geral no contacts.update:", error);
        }
      });

      sock.ev.on("contacts.upsert", async (contacts) => {
        logger.info(
          `👥 Atualizando ${contacts.length} contatos para sessão ${sessionId}`,
        );
        let contactsProcessados = [];
        for (const contact of contacts) {
          if (!contact?.id) continue;
          contact.name = contact.notify || "";
          try {
            const url = await sock.profilePictureUrl(contact.id);
            contact.url_imagem = url;
          } catch (error) {}
          if (contact.id.endsWith("@s.whatsapp.net")) {
            contactsProcessados.push(contact);
          }
        }
        await Store.saveContactsBatch(sessionId, contactsProcessados);
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
            logger.info(
              `📥 messaging-history.set: ${data.messages.length} mensagens sessão ${sessionId}`,
            );

            const BATCH_SIZE = 50;

            try {
              for (let i = 0; i < data.messages.length; i += BATCH_SIZE) {
                const batch = data.messages.slice(i, i + BATCH_SIZE);

                const pipeline = this.redis.client.pipeline();
                const messagesProcessados = [];

                // 🔹 processa em paralelo
                await Promise.all(
                  batch.map(async (msg) => {
                    try {
                      if (!msg?.key?.id) return;

                      let remoteJid = msg.key.remoteJid || "unknown";

                      // 🔹 ignorar grupos
                      if (
                        remoteJid.endsWith("@g.us") &&
                        getsessao?.ignorar_grupos
                      )
                        return;

                      // 🔹 resolver LID
                      if (remoteJid.endsWith("@lid")) {
                        const id = remoteJid.split("@")[0];

                        const mapping = await this.redis.get(
                          `lid-mapping:${sessionId}:${id}`,
                        );

                        if (mapping) {
                          try {
                            remoteJid = JSON.parse(mapping) + "@s.whatsapp.net";
                          } catch {
                            remoteJid =
                              mapping.replace(/"/g, "").trim() +
                              "@s.whatsapp.net";
                          }
                        }
                      }

                      msg.key.remoteJid = remoteJid;

                      const msgKey = `message:${sessionId}:${msg.key.id}`;

                      // 🔹 ADD direto (sem exists → mais rápido)
                      const tempDelete = configenv.delete_message
                        ? configenv.temp_delet_message
                        : null;

                      if (tempDelete) {
                        pipeline.set(
                          msgKey,
                          JSON.stringify(msg),
                          "EX",
                          tempDelete,
                        );
                      } else {
                        pipeline.set(msgKey, JSON.stringify(msg));
                      }

                      messagesProcessados.push(msg);
                    } catch (err) {
                      logger.error(`Erro msg ${msg?.key?.id}`, err);
                    }
                  }),
                );

                // 🔹 executa Redis
                await pipeline.exec();

                // 🔹 salva no banco
                if (messagesProcessados.length) {
                  await Store.saveMessagesBatch(sessionId, messagesProcessados);
                }

                // 🔹 pequeno respiro
                await this.delay(50);
              }

              logger.info(
                `💾 ${data.messages.length} mensagens sincronizadas sessão ${sessionId}`,
              );
            } catch (error) {
              logger.error("Erro geral messaging-history.set:", error);
            }
          }

          // ✅ Processar chats em lotes
          if (data.chats?.length > 0) {
            logger.info(
              `📥 messaging-history.set: ${data.chats.length} chats para processar da sessão ${sessionId}`,
            );

            let chatsProcessados = [];
            for (let i = 0; i < data.chats.length; i += batchSize) {
              const batch = data.chats.slice(i, i + batchSize);

              for (const chat of batch) {
                try {
                  if (
                    !Array.isArray(chat.messages) ||
                    chat.messages.length === 0
                  ) {
                    continue;
                  }

                  if (!chat?.id) continue;
                  if (chat.id.endsWith("@g.us") && getsessao?.ignorar_grupos) {
                    continue;
                  }
                  if (chat.id.endsWith("@lid")) {
                    const id = chat.id.split("@")[0];
                    const existingMapping = await this.redis.get(
                      `lid-mapping:${sessionId}:${id}`,
                    );
                    if (existingMapping) {
                      chat.id =
                        JSON.stringify(existingMapping) + "@s.whatsapp.net";
                    } else {
                      continue;
                    }
                  }
                  chatsProcessados.push(chat);
                } catch (error) {
                  logger.error(`Erro ao processar chat ${chat?.id}:`, error);
                }
              }
            }
            await Store.saveChatsBatch(sessionId, chatsProcessados);

            logger.info(
              `💾 ${data.chats.length} chats sincronizados para sessão ${sessionId}`,
            );
          }

          // ✅ Processar contatos em lotes
          if (data.contacts?.length > 0) {
            logger.info(
              `📥 messaging-history.set: ${data.contacts.length} contatos para processar da sessão ${sessionId}`,
            );
            let contactsProcessados = [];
            for (let i = 0; i < data.contacts.length; i += batchSize) {
              const batch = data.contacts.slice(i, i + batchSize);

              for (const contact of batch) {
                try {
                  if (contact.id.endsWith("@g.us")) {
                    continue;
                  }
                  if (contact.id.endsWith("@lid")) {
                    const id = contact.id.split("@")[0];
                    const existingMapping = await this.redis.get(
                      `lid-mapping:${sessionId}:${id}`,
                    );
                    if (existingMapping) {
                      contact.id =
                        JSON.stringify(existingMapping) + "@s.whatsapp.net";
                    } else {
                      continue;
                    }
                  }
                  contact.url_imagem = null;
                  try {
                    const url = await this.getSocket(
                      sessionId,
                    ).profilePictureUrl(contact.id);
                    contact.url_imagem = url;
                  } catch (error) {}
                  contact.name = contact.notify || "";
                  contactsProcessados.push(contact);
                } catch (error) {
                  logger.error(
                    `Erro ao processar contato ${contact?.id}:`,
                    error,
                  );
                }
              }
            }
            await Store.saveContactsBatch(sessionId, contactsProcessados);

            logger.info(
              `💾 ${data.contacts.length} contatos sincronizados para sessão ${sessionId}`,
            );
          }

          await this.emitEvent(sessionId, "messaging_history_set", {
            messages: data.messages?.length || 0,
            chats: data.chats?.length || 0,
            contacts: data.contacts?.length || 0,
          });

          logger.info(
            `✅ Histórico de mensagens sincronizado para sessão ${sessionId}`,
          );
        } catch (error) {
          logger.error(
            `Erro ao processar messaging-history.set na sessão ${sessionId}:`,
            error,
          );
        }
      });
    } catch (error) {
      logger.error("Erro ao processar eventos:", error);
    }
  }

  static async delRedisSessionData(sessionId) {
    await BaileysService.redis.del(`sessao:${sessionId}`);
    await this.deleteContatos(sessionId);
    await this.deleteChats(sessionId);
    await this.deleteMessageRedis(sessionId);
    await this.deleteLid_Mapping(sessionId);
  }

  // Deletar mensagens armazenadas no Redis para uma sessão
  static async deleteMessageRedis(sessionId) {
    const id2s = await BaileysService.redis.client.smembers(
      `messages:${sessionId}`,
    );
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
    const id2s = await BaileysService.redis.client.keys(
      `lid-mapping:${sessionId}:*`,
    );
    id2s.forEach((key) => {
      BaileysService.redis.del(key);
    });
  }

  // Deletar contatos armazenados no Redis para uma sessão
  static async deleteContatos(sessionId) {
    const id2s = await BaileysService.redis.client.keys(
      `contatos:${sessionId}:*`,
    );
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

  static async update_conexao(sessionId, update) {
    const { connection, lastDisconnect, qr } = update;
    const sock = this.getSocket(sessionId);
    const sessionData = await Session.findById(sessionId);
    if (!sessionData || !sock) return;

    logger.info(`🔄 Conexão ${sessionId}: ${connection || "indefinido"}`);

    await this.emitEvent(sessionId, "connection_update", update);

    if (qr) {
      let limiteqrcode = await this.qrcodelimites.get(
        `limiteqrcode:${sessionId}`,
      );
      if (!limiteqrcode) {
        limiteqrcode = { limite: 0 };
        await this.qrcodelimites.set(`limiteqrcode:${sessionId}`, limiteqrcode);
      }

      if (limiteqrcode.limite >= parseInt(configenv.qrcode_limite)) {
        logger.info(`❌ Máximo de qrcode atingido para ${sessionId}`);
        return await this.deleteSession(sessionId);
      }
      limiteqrcode.limite += 1;
      await this.qrcodelimites.set(`limiteqrcode:${sessionId}`, limiteqrcode);

      try {
        qrTerminal.generate(qr, { small: true }, (qrcode) => {
          logger.info(
            `QR Code ${limiteqrcode.limite++}/${configenv.qrcode_limite} Sessão ${sessionId}:\n`,
            qrcode,
          );
        });
        let code = null;

        if (sessionData.numero && sessionData.numero !== "") {
          try {
            await this.delay(1000);
            code = await sock.requestPairingCode(sessionData.numero);
            logger.info(`Codigo de pareamento: ${code}`);
          } catch (error) {
            logger.error("erro ao gerar codigo de conexão");
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

        logger.info(`📱 QR Code gerado para sessão ${sessionId}`);
      } catch (error) {
        logger.error(`Erro ao gerar QR Code para ${sessionId}:`, error);
      }
    }

    if (connection === "close") {
      try {
        sessionData.status = "disconnected";
        await Session.update(sessionId, { status: "disconnected" });
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect =
          (lastDisconnect?.error && lastDisconnect.error.output?.statusCode) !==
          DisconnectReason.loggedOut;

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

        logger.info(`🚪 Sessão ${sessionId} foi desconectada (logout)`);

        try {
          await deleteSession(BaileysService.db.pool, sessionId);
        } catch (err) {
          console.error("Erro ao remover sessão:", err);
        }

        await this.deleteSession(sessionId);
        return;
      } catch (error) {
        console.error(`Erro na conexão ${sessionId}: `, error);
      }
    }

    if (connection === "connecting") {
      sessionData.status = "connecting";
      await Session.update(sessionId, { status: "connecting" });
    }

    if (connection === "open") {
      sessionData.status = "connected";
      sessionData.lastConnected = moment()
        .tz(configenv.timeZone)
        .format("YYYY-MM-DD HH:mm:ss");
      await this.qrcodelimites.delete(`limiteqrcode:${sessionId}`);
      this.reconnectAttempts.delete(sessionId);

      const phoneNumber = sock?.user?.id?.split(":")[0];
      const sessaoDB = await Session.findById(sessionId);

      try {
        const foto = await sock.profilePictureUrl(
        `${phoneNumber}@s.whatsapp.net`,
      );
      sessionData.url_imagem = foto;

      } catch (error) {
        
      }

      sessionData.phoneNumber = phoneNumber;

      await Session.update(sessionId, {
        status: "connected",
        phone_number: phoneNumber,
        qr_code: null,
      });

      logger.info(
        `✅ Sessão ${sessionId} conectada com sucesso! Telefone: ${phoneNumber}`,
      );
    }

    await this.redis.set(`sessao:${sessionId}`, sessionData);
  }

  static async msgrecebidas(sessionId, messages, type) {
    const getsessao = (await this.redis.get(`sessao:${sessionId}`)) || {};
    const sock = this.getSocket(sessionId);

    const pipeline = this.redis.client.pipeline();
    for (const message of messages) {
      if (!message || !message.key) {
        continue;
      }
      if (message.key.remoteJid.endsWith("@g.us") && getsessao?.ignorar_grupos){
        continue; // Ignorar mensagens de grupos se a configuração estiver ativada
      }
        
      if (
        message?.key?.remoteJid &&
        message.key.remoteJid.endsWith("status@broadcast")
      ) {
        continue; // Ignorar mensagens de status
      }

      // Verificar se a mensagem é de um contato com LID e criar mapeamento se necessário
      if (
        (message?.key?.remoteJidAlt &&
          message.key.remoteJidAlt.endsWith("@lid")) ||
        (message?.key?.remoteJid && message.key.remoteJid.endsWith("@lid"))
      ) {
        const lidId =
          message.key.remoteJidAlt && message.key.remoteJidAlt.endsWith("@lid")
            ? message.key.remoteJidAlt.split("@")[0]
            : message.key.remoteJid && message.key.remoteJid.endsWith("@lid")
              ? message.key.remoteJid.split("@")[0]
              : null;

        if (lidId) {
          const getLid_Mapping = await this.redis.get(
            `lid-mapping:${sessionId}:${lidId}`,
          );

          if (!getLid_Mapping) {
            const liJid =
              message.key.remoteJidAlt &&
              message.key.remoteJidAlt.endsWith("@s.whatsapp.net")
                ? message.key.remoteJidAlt.split("@")[0]
                : message.key.remoteJid &&
                    message.key.remoteJid.endsWith("@s.whatsapp.net")
                  ? message.key.remoteJid.split("@")[0]
                  : null;

            if (liJid) {
              await this.redis.set(
                `lid-mapping:${sessionId}:${lidId}`,
                JSON.stringify(liJid),
              );
              logger.info(
                `🔄 Mapeamento criado para LID ${lidId} -> ${liJid} na sessão ${sessionId}`,
              );
            }
          }
        }
      }

      // Se a mensagem tiver um remoteJid alternativo com LID, trocar os valores para usar o JID real
      if (message.key.addressingMode === "lid" && message.key.remoteJidAlt) {
        const jid = message.key.remoteJidAlt;
        const lid = message.key.remoteJid;
        message.key.remoteJidAlt = lid;
        message.key.remoteJid = jid;
      }

      // Validação básica da estrutura da mensagem
      if (!message || !message.key || !message.key.remoteJid) {
        logger.warn(`⚠️ Mensagem inválida recebida na sessão ${sessionId}:`, {
          hasMessage: !!message,
          hasKey: !!message?.key,
          hasRemoteJid: !!message?.key?.remoteJid,
        });
        continue;
      }

      // Filtro de mensagens de grupos, com tratamento de erros para evitar falhas no processamento
      try {
        const remoteJid = message.key.remoteJid;
        if (
          remoteJid &&
          remoteJid.endsWith("@g.us") &&
          getsessao?.ignorar_grupos
        )
          continue;
      } catch (error) {
        logger.warn(
          `⚠️ Falha ao avaliar filtro de grupo na sessão ${sessionId}, continuando processamento.`,
        );
      }

      try {
        // Salvar mensagem no Redis

        const key = `message:${sessionId}:${message.key.id}`;
        const tempDelete = configenv.delete_message
          ? configenv.temp_delet_message
          : null;

        if (tempDelete) {
          await pipeline.set(key, JSON.stringify(message), "EX", tempDelete);
        } else {
          await pipeline.set(key, JSON.stringify(message));
        }
        Store.saveMessagesBatch(sessionId, [message]).catch((error) => {
          logger.error(
            `Erro ao salvar chat no banco para sessão ${sessionId}:`,
            error,
          );
        });

        // Verificar configurações da sessão
        const config = await this.redis.get(`sessao:${sessionId}`);

        // Auto-read
        if (
          config?.autoRead &&
          !message.key.fromMe &&
          message.key.remoteJid &&
          message.key.id
        ) {
          await this.markAsRead(
            sessionId,
            message.key.remoteJid,
            message.key.id,
          );
        }

        // Emit message event
        const messageType = this.getMessageType(message.message);
        const text = this.extractMessageContent(message.message);
        await this.emitEvent(sessionId, "message_received", {
          message,
          messageType,
          text,
        });

        try {
          message.id = message.key.remoteJid;
          message.name = message.pushName || "";
          message.notify = message.pushName || "";
          message.verifiedName = message.pushName || "";
          try {
            const perfil = await sock.profilePictureUrl(message.id);
            message.url_imagem = perfil;
          } catch (error) {}
          if (message.id.endsWith("@s.whatsapp.net")) {
            const contactData = {
              id: message.id,
              name: message.name || message.verifiedName || "",
              notify: message.name || message.verifiedName || "",
              url_imagem: message.url_imagem,
            };
            this.redis.set(
              `contatos:${sessionId}:${message.id}`,
              JSON.stringify(contactData),
            );
          }
        } catch (error) {
          logger.error(`Erro ao processar mensagem:`, error);
        }
      } catch (error) {
        logger.error(`Erro ao processar mensagem:`, error);
      }
    }
    pipeline.exec().catch((error) => {
      logger.error(
        `Erro ao salvar mensagens no Redis para sessão ${sessionId}:`,
        error,
      );
    });
  }

  static async update_mensagem(sessionId, updates) {
    for (const update of updates) {
      try {
        if (!update?.key?.remoteJid) {
          logger.warn(
            `⚠️ Update de mensagem inválido na sessão ${sessionId}:`,
            {
              hasUpdate: !!update,
              hasKey: !!update?.key,
              hasRemoteJid: !!update?.key?.remoteJid,
            },
          );
          continue;
        }

        await this.emitEvent(sessionId, "message_update", {
          jid: update.key.remoteJid,
          update,
        });

        logger.debug(
          `📝 Mensagem atualizada: ${update.key.id} - Status: ${update.update?.status}`,
        );
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
          if (
            sessiondata?.msg_rejectcalls &&
            sessiondata?.msg_rejectcalls !== ""
          ) {
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
      return this.extractMessageContent(
        message.viewOnceMessageV2Extension.message,
      );
    }

    if (message.conversation) return message.conversation;
    if (message.extendedTextMessage?.text)
      return message.extendedTextMessage.text;
    if (message.imageMessage?.caption) return message.imageMessage.caption;
    if (message.videoMessage?.caption) return message.videoMessage.caption;
    if (message.documentMessage?.caption)
      return message.documentMessage.caption;
    if (message.buttonsResponseMessage?.selectedDisplayText)
      return message.buttonsResponseMessage.selectedDisplayText;
    if (message.listResponseMessage?.title)
      return message.listResponseMessage.title;
    if (message.templateButtonReplyMessage?.selectedDisplayText)
      return message.templateButtonReplyMessage.selectedDisplayText;
    if (message.templateButtonReplyMessage?.selectedId)
      return message.templateButtonReplyMessage.selectedId;
    return "";
  }

  static async emitEvent(sessionId, event, data) {
    try {
      // Global WebSocket
      if (this.globalWebSocketService) {
        this.globalWebSocketService.broadcast(sessionId, event, data);
      }

      // Session-specific webhook
      const config = await Session.findById(sessionId);

      const webhookTasks = [];

      // Global Webhook
      webhookTasks.push(
        GlobalWebhookService.sendGlobalWebhook({
          event,
          sessionId,
          data,
        }),
      );

      if (
        config?.webhook_status &&
        config.webhook_status == "1" &&
        config?.events &&
        Array.isArray(config.events)
      ) {
        const Isevent = config.events.find((e) => e == event);
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

      const highFrequencyEvents = new Set([
        "message_received",
        "message_update",
        "presence_update",
        "connection_update",
      ]);

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
      if (
        typeof mediaData === "string" &&
        (mediaData.startsWith("http") || mediaData.startsWith("https"))
      ) {
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
        message.document = await this.prepareMedia(
          sessionId,
          message.document.url,
        );
      }
      if (message.sticker?.url) {
        message.sticker = await this.prepareMedia(
          sessionId,
          message.sticker.url,
        );
      }

      const result = await sock.sendMessage(jid, message);
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
          const jid = number.includes("@")
            ? number
            : `${number}@s.whatsapp.net`;
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

      const result = await sock.groupParticipantsUpdate(
        groupJid,
        participants,
        "add",
      );
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

      const result = await sock.groupParticipantsUpdate(
        groupJid,
        participants,
        "remove",
      );
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

      const result = await sock.groupParticipantsUpdate(
        groupJid,
        participants,
        "promote",
      );
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

      const result = await sock.groupParticipantsUpdate(
        groupJid,
        participants,
        "demote",
      );
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

      try {
        await deleteSession(BaileysService.db.pool, sessionId);
      } catch (err) {
        console.error("Erro ao remover sessão:", err);
      }
      await BaileysService.redis.del(`sessao:${sessionId}`);

      logger.info(`🗑️ Sessão ${sessionId} deletada completamente`);
    } catch (error) {
      logger.error(`Erro ao deletar sessão ${sessionId}:`, error);
      throw error;
    }
  }

  static delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Utility methods
  static async isSessionConnected(sessionId) {
    const sessionData = await Session.findById(sessionId);
    const sock = this.getSocket(sessionId);
    return sessionData?.status === "connected" && sock?.ws?.readyState === 1;
  }

  static async getSession(sessionId) {
    const sessionData = await this.redis.get(`sessao:${sessionId}`);
    const sock = this.getSocket(sessionId);
    if (
      sock &&
      sessionData &&
      sessionData.status === "connected" &&
      sessionData.phoneNumber
    ) {
      try {
        const perfil = await sock.profilePictureUrl(
          `${sessionData.phoneNumber}@s.whatsapp.net`,
        );
        sessionData.url_imagem = perfil;
      } catch (error) {
        console.error(
          `Erro ao obter imagem de perfil para ${sessionId}:`,
          error,
        );
        logger.error("Erro ao obter imagem de perfil:", error);
      }
    }
    return sessionData;
  }

  static async getSessionsStats() {
    const sessions = await Session.findByApiKey();
    return {
      total: sessions.length,
      connected: sessions.filter((s) => s.status === "connected").length,
      connecting: sessions.filter(
        (s) => s.status === "connecting" || s.status === "qr_ready",
      ).length,
      disconnected: sessions.filter((s) => s.status === "disconnected").length,
    };
  }

  static async healthCheck() {
    const stats = await this.getSessionsStats();
    return {
      status: "healthy",
      timestamp: moment().tz(configenv.timeZone).toISOString(),
      sessions: stats,
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
        logger.error(
          `❌ Máximo de tentativas de reconexão atingido para ${sessionId} (${attempts}/${maxAttempts})`,
        );
        await this.deleteSession(sessionId);
        return;
      }

      // Backoff exponencial: 2^attempts segundos, máximo 2 minutos
      const backoffSeconds = Math.min(Math.pow(2, attempts), 120);
      logger.info(
        `🔄 Tentativa de reconexão ${attempts}/${maxAttempts} para ${sessionId} em ${backoffSeconds}s`,
      );

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
      logger.error(
        `❌ Erro ao gerenciar perda de conexão ${sessionId}:`,
        error,
      );
    }
  }
}

export default BaileysService;
