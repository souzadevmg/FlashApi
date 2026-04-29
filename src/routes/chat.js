import express from "express";
import authenticateApiKey from "../middleware/auth.js";
import BaileysService from "../services/BaileysService.js";
import Store from "../models/Store.js";
import MessageQueueService from "../services/MessageQueueService.js";
import logger from "../utils/logger.js";
import Chats from "../models/chats.js";
import {
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  proto,
  WAProto,
} from "@whiskeysockets/baileys";

const router = express.Router();

router.post("/send-text", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const {
      to,
      text,
      linkPreview = true,
      mentions = [],
      delay = 0,
      useQueue = false,
      MarkAll = false,
    } = req.body;

    if (!to || !text) {
      return res.status(400).json({
        success: false,
        message: "to e text são obrigatórios",
      });
    }

    if (!BaileysService.isSessionConnected(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    //Função para marcar todos do grupo como mencionados, caso MarkAll seja true e seja um grupo
    if (MarkAll && to.endsWith("@g.us")) {
      const sock = BaileysService.getSocket(sessionId);
      const grupos = await sock.groupMetadata(to);
      mentions.push(...grupos.participants.map((p) => p.id));
    }

    const message = {
      text,
      linkPreview: linkPreview,
      footer: "Rodapé",
    };

    if (mentions && mentions.length > 0) {
      message.mentions = mentions;
    }

    const sendFunction = async () => {
      await BaileysService.sendTyping(sessionId, to, true);
      if (delay > 0) {
        await BaileysService.delay(delay);
      }
      await BaileysService.sendMessage(sessionId, to, message);
      return await BaileysService.sendTyping(sessionId, to, false);
    };

    let result;
    if (useQueue) {
      const queueInfo = await MessageQueueService.addToQueue(sessionId, {
        sendFunction,
        delay,
      });

      result = {
        queued: true,
        queuePosition: queueInfo.queuePosition,
        estimatedDelay: queueInfo.estimatedDelay,
      };
    } else {
      result = await sendFunction();
    }

    res.json({
      success: true,
      message: useQueue
        ? "Mensagem adicionada à fila"
        : "Mensagem de texto enviada com sucesso",
      data: result,
    });

    logger.info(
      `Mensagem de texto ${useQueue ? "enfileirada" : "enviada"}: ${sessionId} -> ${to}`,
    );
  } catch (error) {
    logger.error("Erro ao enviar mensagem de texto:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/send-image", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const {
      to,
      image,
      caption,
      mentions = [],
      delay = 0,
      useQueue = false,
      MarkAll = false,
    } = req.body;

    if (!to || !image) {
      return res.status(400).json({
        success: false,
        message: "to e image são obrigatórios",
      });
    }

    if (!BaileysService.isSessionConnected(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    //Função para marcar todos do grupo como mencionados, caso MarkAll seja true e seja um grupo
    if (MarkAll && to.endsWith("@g.us")) {
      const sock = BaileysService.getSocket(sessionId);
      const grupos = await sock.groupMetadata(to);
      mentions.push(...grupos.participants.map((p) => p.id));
    }
    const message = {
      image: { url: image },
      caption: caption || "",
    };

    if (mentions && mentions.length > 0) {
      message.mentions = mentions;
    }

    const sendFunction = async () => {
      await BaileysService.sendTyping(sessionId, to, true);
      if (delay > 0) {
        await BaileysService.delay(delay);
      }
      await BaileysService.sendMessage(sessionId, to, message);
      return await BaileysService.sendTyping(sessionId, to, false);
    };

    let result;
    if (useQueue) {
      const queueInfo = await MessageQueueService.addToQueue(sessionId, {
        sendFunction,
        delay,
      });

      result = {
        queued: true,
        queuePosition: queueInfo.queuePosition,
        estimatedDelay: queueInfo.estimatedDelay,
      };
    } else {
      result = await sendFunction();
    }

    res.json({
      success: true,
      message: useQueue
        ? "Imagem adicionada à fila"
        : "Imagem enviada com sucesso",
      data: result,
    });

    logger.info(
      `Imagem ${useQueue ? "enfileirada" : "enviada"}: ${sessionId} -> ${to}`,
    );
  } catch (error) {
    logger.error("Erro ao enviar imagem:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/send-video", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const {
      to,
      video,
      mentions = [],
      caption,
      gifPlayback = false,
      delay = 0,
      useQueue = false,
      MarkAll = false,
    } = req.body;

    if (!to || !video) {
      return res.status(400).json({
        success: false,
        message: "to e video são obrigatórios",
      });
    }

    if (!BaileysService.isSessionConnected(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    //Função para marcar todos do grupo como mencionados, caso MarkAll seja true e seja um grupo
    if (MarkAll && to.endsWith("@g.us")) {
      const sock = BaileysService.getSocket(sessionId);
      const grupos = await sock.groupMetadata(to);
      mentions.push(...grupos.participants.map((p) => p.id));
    }
    const message = {
      video: { url: video },
      caption: caption || "",
      gifPlayback,
    };

    if (mentions && mentions.length > 0) {
      message.mentions = mentions;
    }

    const sendFunction = async () => {
      await BaileysService.sendTyping(sessionId, to, true);
      if (delay > 0) {
        await BaileysService.delay(delay);
      }
      await BaileysService.sendMessage(sessionId, to, message);
      return await BaileysService.sendTyping(sessionId, to, false);
    };

    let result;
    if (useQueue) {
      const queueInfo = await MessageQueueService.addToQueue(sessionId, {
        sendFunction,
        delay,
      });

      result = {
        queued: true,
        queuePosition: queueInfo.queuePosition,
        estimatedDelay: queueInfo.estimatedDelay,
      };
    } else {
      result = await sendFunction();
    }

    res.json({
      success: true,
      message: useQueue
        ? "Vídeo adicionado à fila"
        : "Vídeo enviado com sucesso",
      data: result,
    });

    logger.info(
      `Vídeo ${useQueue ? "enfileirado" : "enviado"}: ${sessionId} -> ${to}`,
    );
  } catch (error) {
    logger.error("Erro ao enviar vídeo:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/send-audio", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const {
      to,
      audio,
      ptt = false,
      delay = 0,
      useQueue = false,
      MarkAll = false,
      mentions = [],
    } = req.body;

    if (!to || !audio) {
      return res.status(400).json({
        success: false,
        message: "to e audio são obrigatórios",
      });
    }

    if (!BaileysService.isSessionConnected(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    if (MarkAll && to.endsWith("@g.us")) {
      const sock = BaileysService.getSocket(sessionId);
      const grupos = await sock.groupMetadata(to);
      mentions.push(...grupos.participants.map((p) => p.id));
    }

    const message = {
      audio: { url: audio },
      ptt,
    };

    if (mentions && mentions.length > 0) {
      message.mentions = mentions;
    }

    const sendFunction = async () => {
      await BaileysService.sendTyping(sessionId, to, true, true);
      if (delay > 0) {
        await BaileysService.delay(delay);
      }
      await BaileysService.sendMessage(sessionId, to, message);
      return await BaileysService.sendTyping(sessionId, to, false);
    };

    let result;
    if (useQueue) {
      const queueInfo = await MessageQueueService.addToQueue(sessionId, {
        sendFunction,
        delay,
      });

      result = {
        queued: true,
        queuePosition: queueInfo.queuePosition,
        estimatedDelay: queueInfo.estimatedDelay,
      };
    } else {
      result = await sendFunction();
    }

    res.json({
      success: true,
      message: useQueue
        ? "Áudio adicionado à fila"
        : "Áudio enviado com sucesso",
      data: result,
    });

    logger.info(
      `Áudio ${useQueue ? "enfileirado" : "enviado"}: ${sessionId} -> ${to}`,
    );
  } catch (error) {
    logger.error("Erro ao enviar áudio:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/send-document", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const {
      to,
      document,
      fileName,
      mimetype,
      caption,
      delay = 0,
      useQueue = false,
      MarkAll = false,
      mentions = [],
    } = req.body;

    if (!to || !document || !fileName) {
      return res.status(400).json({
        success: false,
        message: "to, document e fileName são obrigatórios",
      });
    }

    if (!BaileysService.isSessionConnected(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    if (MarkAll && to.endsWith("@g.us")) {
      const sock = BaileysService.getSocket(sessionId);
      const grupos = await sock.groupMetadata(to);
      mentions.push(...grupos.participants.map((p) => p.id));
    }

    const message = {
      document: { url: document },
      fileName,
      mimetype: mimetype || "application/octet-stream",
      caption: caption || "",
    };

    if (mentions && mentions.length > 0) {
      message.mentions = mentions;
    }

    const sendFunction = async () => {
      await BaileysService.sendTyping(sessionId, to, true);
      if (delay > 0) {
        await BaileysService.delay(delay);
      }
      await BaileysService.sendMessage(sessionId, to, message);
      return await BaileysService.sendTyping(sessionId, to, false);
    };

    let result;
    if (useQueue) {
      const queueInfo = await MessageQueueService.addToQueue(sessionId, {
        sendFunction,
        delay,
      });

      result = {
        queued: true,
        queuePosition: queueInfo.queuePosition,
        estimatedDelay: queueInfo.estimatedDelay,
      };
    } else {
      result = await sendFunction();
    }

    res.json({
      success: true,
      message: useQueue
        ? "Documento adicionado à fila"
        : "Documento enviado com sucesso",
      data: result,
    });

    logger.info(
      `Documento ${useQueue ? "enfileirado" : "enviado"}: ${sessionId} -> ${to}`,
    );
  } catch (error) {
    logger.error("Erro ao enviar documento:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/send-location", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const {
      to,
      latitude,
      longitude,
      name,
      address,
      delay = 0,
      useQueue = false,
      MarkAll = false,
      mentions = [],
    } = req.body;

    if (!to || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: "to, latitude e longitude são obrigatórios",
      });
    }

    if (!BaileysService.isSessionConnected(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    if (MarkAll && to.endsWith("@g.us")) {
      const sock = BaileysService.getSocket(sessionId);
      const grupos = await sock.groupMetadata(to);
      mentions.push(...grupos.participants.map((p) => p.id));
    }

    const message = {
      location: {
        degreesLatitude: latitude,
        degreesLongitude: longitude,
        name: name || "",
        address: address || "",
      },
    };

    if (mentions && mentions.length > 0) {
      message.mentions = mentions;
    }

    const sendFunction = async () => {
      await BaileysService.sendTyping(sessionId, to, true);
      if (delay > 0) {
        await BaileysService.delay(delay);
      }
      await BaileysService.sendMessage(sessionId, to, message);
      return await BaileysService.sendTyping(sessionId, to, false);
    };

    let result;
    if (useQueue) {
      const queueInfo = await MessageQueueService.addToQueue(sessionId, {
        sendFunction,
        delay,
      });

      result = {
        queued: true,
        queuePosition: queueInfo.queuePosition,
        estimatedDelay: queueInfo.estimatedDelay,
      };
    } else {
      result = await sendFunction();
    }

    res.json({
      success: true,
      message: useQueue
        ? "Localização adicionada à fila"
        : "Localização enviada com sucesso",
      data: result,
    });

    logger.info(
      `Localização ${useQueue ? "enfileirada" : "enviada"}: ${sessionId} -> ${to}`,
    );
  } catch (error) {
    logger.error("Erro ao enviar localização:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/send-contact", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const {
      to,
      contact,
      delay = 0,
      useQueue = false,
      MarkAll = false,
      mentions = [],
    } = req.body;

    if (!to || !contact) {
      return res.status(400).json({
        success: false,
        message: "to e contact são obrigatórios",
      });
    }

    if (!BaileysService.isSessionConnected(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    if (MarkAll && to.endsWith("@g.us")) {
      const sock = BaileysService.getSocket(sessionId);
      const grupos = await sock.groupMetadata(to);
      mentions.push(...grupos.participants.map((p) => p.id));
    }

    const message = {
      contacts: {
        displayName: contact.displayName,
        contacts: [{ vcard: contact.vcard }],
      },
    };

    if (mentions && mentions.length > 0) {
      message.mentions = mentions;
    }

    const sendFunction = async () => {
      await BaileysService.sendTyping(sessionId, to, true);
      if (delay > 0) {
        await BaileysService.delay(delay);
      }
      await BaileysService.sendMessage(sessionId, to, message);
      return await BaileysService.sendTyping(sessionId, to, false);
    };

    let result;
    if (useQueue) {
      const queueInfo = await MessageQueueService.addToQueue(sessionId, {
        sendFunction,
        delay,
      });

      result = {
        queued: true,
        queuePosition: queueInfo.queuePosition,
        estimatedDelay: queueInfo.estimatedDelay,
      };
    } else {
      result = await sendFunction();
    }

    res.json({
      success: true,
      message: useQueue
        ? "Contato adicionado à fila"
        : "Contato enviado com sucesso",
      data: result,
    });

    logger.info(
      `Contato ${useQueue ? "enfileirado" : "enviado"}: ${sessionId} -> ${to}`,
    );
  } catch (error) {
    logger.error("Erro ao enviar contato:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/send-sticker", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const {
      to,
      sticker,
      delay = 0,
      useQueue = false,
      MarkAll = false,
      mentions = [],
    } = req.body;

    if (!to || !sticker) {
      return res.status(400).json({
        success: false,
        message: "to e sticker são obrigatórios",
      });
    }

    if (!BaileysService.isSessionConnected(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    if (MarkAll && to.endsWith("@g.us")) {
      const sock = BaileysService.getSocket(sessionId);
      const grupos = await sock.groupMetadata(to);
      mentions.push(...grupos.participants.map((p) => p.id));
    }
    const message = {
      sticker: { url: sticker },
    };

    if (mentions && mentions.length > 0) {
      message.mentions = mentions;
    }

    const sendFunction = async () => {
      await BaileysService.sendTyping(sessionId, to, true);
      if (delay > 0) {
        await BaileysService.delay(delay);
      }
      await BaileysService.sendMessage(sessionId, to, message);
      return await BaileysService.sendTyping(sessionId, to, false);
    };

    let result;
    if (useQueue) {
      const queueInfo = await MessageQueueService.addToQueue(sessionId, {
        sendFunction,
        delay,
      });

      result = {
        queued: true,
        queuePosition: queueInfo.queuePosition,
        estimatedDelay: queueInfo.estimatedDelay,
      };
    } else {
      result = await sendFunction();
    }

    res.json({
      success: true,
      message: useQueue
        ? "Sticker adicionado à fila"
        : "Sticker enviado com sucesso",
      data: result,
    });

    logger.info(
      `Sticker ${useQueue ? "enfileirado" : "enviado"}: ${sessionId} -> ${to}`,
    );
  } catch (error) {
    logger.error("Erro ao enviar sticker:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/send-reaction", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const { to, messageId, emoji } = req.body;

    if (!to || !messageId || emoji === undefined) {
      return res.status(400).json({
        success: false,
        message: "to, messageId e emoji são obrigatórios",
      });
    }

    if (!BaileysService.isSessionConnected(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    const result = await BaileysService.sendReaction(
      sessionId,
      to,
      messageId,
      emoji,
    );

    res.json({
      success: true,
      message: emoji
        ? "Reação enviada com sucesso"
        : "Reação removida com sucesso",
      data: result,
    });

    logger.info(
      `Reação ${emoji ? "enviada" : "removida"}: ${sessionId} -> ${to}`,
    );
  } catch (error) {
    logger.error("Erro ao enviar reação:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/send-poll", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const {
      to,
      name,
      options,
      selectableCount = 1,
      delay = 0,
      useQueue = false,
    } = req.body;

    if (!to || !name || !options || !Array.isArray(options)) {
      return res.status(400).json({
        success: false,
        message: "to, name e options são obrigatórios",
      });
    }

    if (options.length < 2 || options.length > 12) {
      return res.status(400).json({
        success: false,
        message: "A enquete deve ter entre 2 e 12 opções",
      });
    }

    if (!BaileysService.isSessionConnected(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    const message = {
      poll: {
        name,
        values: options,
        selectableCount,
      },
    };

    const sendFunction = async () => {
      await BaileysService.sendTyping(sessionId, to, true);
      if (delay > 0) {
        await BaileysService.delay(delay);
      }
      await BaileysService.sendMessage(sessionId, to, message);
      return await BaileysService.sendTyping(sessionId, to, false);
    };

    let result;
    if (useQueue) {
      const queueInfo = await MessageQueueService.addToQueue(sessionId, {
        sendFunction,
        delay,
      });

      result = {
        queued: true,
        queuePosition: queueInfo.queuePosition,
        estimatedDelay: queueInfo.estimatedDelay,
      };
    } else {
      result = await sendFunction();
    }

    res.json({
      success: true,
      message: useQueue
        ? "Enquete adicionada à fila"
        : "Enquete enviada com sucesso",
      data: result,
    });

    logger.info(
      `Enquete ${useQueue ? "enfileirada" : "enviada"}: ${sessionId} -> ${to}`,
    );
  } catch (error) {
    logger.error("Erro ao enviar enquete:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/send-list", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const {
      to,
      delay = 0,
      useQueue = false,
      title,
      description = "",
      buttonText,
      footerText = "",
      sections,
    } = req.body;

    if (typeof useQueue !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "useQueue Deve ser boolean",
      });
    }

    if (!to || !title || !buttonText || !sections) {
      return res.status(400).json({
        success: false,
        message: "to, title, buttonText e sections são obrigatórios",
      });
    }

    const sock = BaileysService.getSocket(sessionId);
    if (!sock) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    if (!Array.isArray(sections) || sections.length === 0) {
      return res.status(400).json({
        success: false,
        message: "sections deve ser um array não vazio",
      });
    }

    const payloadList = {
      listMessage: proto.Message.ListMessage.fromObject({
        title: title,
        description: description,
        buttonText: buttonText,
        footerText: footerText,
        listType: proto.Message.ListMessage.ListType.SINGLE_SELECT,
        sections: sections.map((sec) =>
          proto.Message.ListMessage.Section.fromObject({
            title: sec.title,
            rows: sec.rows.map((row) =>
              proto.Message.ListMessage.Row.fromObject({
                title: row.title,
                rowId: row.rowId,
                description: row.description || "",
              })
            ),
          })
        ),
      }),
    };
    const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;

    if (!BaileysService.isSessionConnected(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    const sendFunction = async () => {
      await BaileysService.sendTyping(sessionId, jid, true);
      if (delay > 0) {
        await BaileysService.delay(delay);
      }
      const msg = generateWAMessageFromContent(jid, payloadList, {
        userJid: sock.user.id,
      });
      console.log(msg);
      const send = await sock.relayMessage(jid, msg.message, {
        messageId: msg.key.id,
        additionalNodes: BaileysService.BIZ_NATIVE_LIST,
      });
      await BaileysService.sendTyping(sessionId, jid, false);
      return send;
    };

    let result;
    if (useQueue) {
      const queueInfo = await MessageQueueService.addToQueue(sessionId, {
        sendFunction,
        delay,
      });

      result = {
        queued: true,
        queuePosition: queueInfo.queuePosition,
        estimatedDelay: queueInfo.estimatedDelay,
      };
    } else {
      result = await sendFunction();
    }

    res.json({
      success: true,
      message: useQueue
        ? "Lista adicionada à fila"
        : "Lista enviada com sucesso",
      data: result,
    });

    logger.info(
      `Lista ${useQueue ? "enfileirada" : "enviada"}: ${sessionId} -> ${to}`,
    );
  } catch (error) {
    logger.error("Erro ao enviar lista:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/send-buttons", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const {
      to,
      text,
      footer,
      buttons,
      useQueue = false,
      delay = 1200,
      imageMessage = false,
      videoMessage = false,
    } = req.body;
    if (
      !to ||
      !text ||
      !footer ||
      !buttons ||
      !Array.isArray(buttons) ||
      buttons.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "to, text, footer e buttons são obrigatórios e buttons deve ser um array não vazio",
      });
    }
    let erro = false;
    for (let index = 0; index < buttons.length; index++) {
      const button = buttons[index];
      if (
        !button.buttonId ||
        !button.buttonText ||
        typeof button.buttonId !== "string" ||
        typeof button.buttonText !== "object" ||
        typeof button.buttonText.displayText !== "string"
      ) {
        erro = true;
        return res.status(400).json({
          success: false,
          message: `O botão ${index + 1} deve ter os campos "buttonId" como string e "buttonText" como json.`,
        });
      }
    }
    if (erro) return;

    if (imageMessage && videoMessage) {
      return res.status(400).json({
        success: false,
        message: "imageMessage e videoMessage não podem ser usados ao mesmo tempo",
      });
    }

    for (let index = 0; index < buttons.length; index++) {
      const displayText = buttons[index]?.buttonText?.displayText;
      if (!displayText || !displayText.trim()) {
        return res.status(400).json({
          success: false,
          message: `O botão ${index + 1} precisa de buttonText.displayText preenchido.`,
        });
      }
    }

    const sock = BaileysService.getSocket(sessionId);
    if (!sock) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

     const payloadButtons = {
      buttonsMessage: proto.Message.ButtonsMessage.fromObject({
        contentText: text,
        footerText: footer,
        headerType: proto.Message.ButtonsMessage.HeaderType.EMPTY,
        buttons: buttons.map((btn) =>
          proto.Message.ButtonsMessage.Button.fromObject({
            buttonId: btn.buttonId,
            buttonText: { displayText: btn.buttonText.displayText },
            type: proto.Message.ButtonsMessage.Button.Type.RESPONSE,
          }),
        ),
      }),
    };

    const isValidMediaInput = (value) =>
      Buffer.isBuffer(value) ||
      (typeof value === "string" &&
        (value.startsWith("data:") || value.startsWith("http")));

    if (imageMessage) {
      if (!isValidMediaInput(imageMessage)) {
        return res.status(400).json({
          success: false,
          message:
            "imageMessage deve ser URL http(s), base64 data URI ou Buffer",
        });
      }

      let image;

      if (Buffer.isBuffer(imageMessage)) {
        image = imageMessage;
      } else if (typeof imageMessage === "string") {
        if (imageMessage.startsWith("data:")) {
          const base64Data = imageMessage.split(",")[1];
          image = Buffer.from(base64Data, "base64");
        } else if (imageMessage.startsWith("http")) {
          image = { url: imageMessage };
        }
      }

      const media = await prepareWAMessageMedia(
        { image },
        { upload: sock.waUploadToServer },
      );

      payloadButtons.buttonsMessage.headerType =
        proto.Message.ButtonsMessage.HeaderType.IMAGE;
      payloadButtons.buttonsMessage.imageMessage = media.imageMessage;
    }

    if (videoMessage) {
      if (!isValidMediaInput(videoMessage)) {
        return res.status(400).json({
          success: false,
          message:
            "videoMessage deve ser URL http(s), base64 data URI ou Buffer",
        });
      }

      let video;

      if (Buffer.isBuffer(videoMessage)) {
        video = videoMessage;
      } else if (typeof videoMessage === "string") {
        if (videoMessage.startsWith("data:")) {
          const base64Data = videoMessage.split(",")[1];
          video = Buffer.from(base64Data, "base64");
        } else if (videoMessage.startsWith("http")) {
          video = { url: videoMessage };
        }
      }

      const media = await prepareWAMessageMedia(
        { video },
        { upload: sock.waUploadToServer },
      );
      payloadButtons.buttonsMessage.headerType =
        proto.Message.ButtonsMessage.HeaderType.VIDEO;
      payloadButtons.buttonsMessage.videoMessage = media.videoMessage;
    }

    const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;

    const sendFunction = async () => {
      await BaileysService.sendTyping(sessionId, jid, true);
      if (delay > 0) {
        await BaileysService.delay(delay);
      }
      const msg = generateWAMessageFromContent(jid, payloadButtons, {
        userJid: sock.user.id,
      });

      const send = await sock.relayMessage(jid, msg.message, {
        messageId: msg.key.id,
        additionalNodes: BaileysService.BIZ_NATIVE_FLOW_NODE,
      });
      await BaileysService.sendTyping(sessionId, jid, false);
      return send;
    };

    let result;
    if (useQueue) {
      const queueInfo = await MessageQueueService.addToQueue(sessionId, {
        sendFunction,
        delay,
      });

      result = {
        queued: true,
        queuePosition: queueInfo.queuePosition,
        estimatedDelay: queueInfo.estimatedDelay,
      };
    } else {
      result = await sendFunction();
    }

    res.json({
      success: true,
      message: useQueue
        ? "Mensagem adicionada à fila"
        : "Mensagem de Botões enviada com sucesso",
      data: result,
    });
  } catch (error) {
    console.log(error);
    logger.error("Erro ao enviar botões:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post(
  "/send-interactiveMessage",
  authenticateApiKey,
  async (req, res) => {
    try {
      const sessionId = req.headers["apikey"];
      const {
        to,
        text,
        footer,
        header,
        body,
        buttons,
        useQueue = false,
        delay = 1200,
      } = req.body;
      const requiredFields = ["to", "header", "body", "footer", "buttons"];
      for (const field of requiredFields) {
        if (!req.body[field]) {
          return res.status(400).json({
            success: false,
            message: `O campo "${field}" é obrigatório.`,
          });
        }
      }

      if (!Array.isArray(buttons) || buttons.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'O campo "buttons" deve ser um array não vazio.',
        });
      }

      if (
        typeof header !== "object" ||
        typeof body !== "object" ||
        typeof footer !== "object"
      ) {
        return res.status(400).json({
          success: false,
          message: 'Os campos "header", "body" e "footer" devem ser objetos.',
        });
      }

      const sock = BaileysService.getSocket(sessionId);
      if (!sock) {
        return res.status(400).json({
          success: false,
          message: "Sessão não está conectada",
        });
      }

      let headerObj = {
        title: header.title,
      };

      // só adiciona mídia se existir
      if (header.image || header.video) {
        if (header.image && header.video) {
          return res.status(400).json({
            success: false,
            message: "O header não pode conter imagem e vídeo ao mesmo tempo.",
          });
        }
        if (header.image) {
          const media = await prepareWAMessageMedia(
            { image: { url: header.image } },
            { upload: sock.waUploadToServer },
          );
          headerObj.hasMediaAttachment = true;
          headerObj.imageMessage = media.imageMessage;
        }

        if (header.video) {
          const videoMedia = await prepareWAMessageMedia(
            { video: { url: header.video } },
            { upload: sock.waUploadToServer },
          );
          headerObj.hasMediaAttachment = true;
          headerObj.videoMessage = videoMedia.videoMessage;
        }
      }

      const payload = {
        viewOnceMessage: {
          message: {
            interactiveMessage: WAProto.Message.InteractiveMessage.create({
              header:
                WAProto.Message.InteractiveMessage.Header.create(headerObj),
              body: WAProto.Message.InteractiveMessage.Body.create({
                text: body.text,
              }),
              footer: WAProto.Message.InteractiveMessage.Footer.create({
                text: footer.text,
              }),
              nativeFlowMessage:
                WAProto.Message.InteractiveMessage.NativeFlowMessage.create({
                  buttons: buttons.map((button) => ({
                    name:
                      typeof button.name === "string"
                        ? button.name
                        : JSON.stringify(button.name),
                    buttonParamsJson:
                      typeof button.buttonParamsJson === "string"
                        ? button.buttonParamsJson
                        : JSON.stringify(button.buttonParamsJson),
                  })),
                }),
            }),
          },
        },
      };

      const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;

      const sendFunction = async () => {
        await BaileysService.sendTyping(sessionId, jid, true);
        if (delay > 0) {
          await BaileysService.delay(delay);
        }

        const msg = generateWAMessageFromContent(jid, payload, {
          userJid: sock.user.id,
        });
        const send = await sock.relayMessage(jid, msg.message, {
          messageId: msg.key.id,
          additionalNodes: BaileysService.BIZ_NATIVE_FLOW_NODE,
        });
        console.log(send);
        await BaileysService.sendTyping(sessionId, jid, false);
        return send;
      };

      let result;
      if (useQueue) {
        const queueInfo = await MessageQueueService.addToQueue(sessionId, {
          sendFunction,
          delay,
        });

        result = {
          queued: true,
          queuePosition: queueInfo.queuePosition,
          estimatedDelay: queueInfo.estimatedDelay,
        };
      } else {
        result = await sendFunction();
      }

      res.json({
        success: true,
        message: useQueue
          ? "Mensagem adicionada à fila"
          : "Mensagem de Botões enviada com sucesso",
        data: result,
      });
    } catch (error) {
      logger.error("Erro ao enviar botões:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Erro interno do servidor",
      });
    }
  },
);

router.post("/send-carouselMessage", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const {
      to,
      items,
      useQueue = false,
      delay = 1200,
      text,
      footer = "",
    } = req.body;
    const requiredFields = ["to", "items", "text"];
    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({
          success: false,
          message: `O campo "${field}" é obrigatório.`,
        });
      }
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'O campo "items" deve ser um array não vazio.',
      });
    }

    const sock = BaileysService.getSocket(sessionId);
    if (!sock) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    const cards = await Promise.all(
      items.map(async (item) => {
        if (!item.image) {
          return res.status(400).json({
            success: false,
            message: 'Cada item deve conter o campo "image".',
          });
        }

        let image;

        if (Buffer.isBuffer(item.image)) {
          image = item.image;
        } else if (typeof item.image === "string") {
          if (item.image.startsWith("data:")) {
            const base64Data = item.image.split(",")[1];
            image = Buffer.from(base64Data, "base64");
          } else if (item.image.startsWith("http")) {
            image = { url: item.image };
          }
        }

        const media = await prepareWAMessageMedia(
          { image },
          { upload: sock.waUploadToServer },
        );

        return {
          header: {
            title: item.title,
            hasMediaAttachment: true,
            imageMessage: media.imageMessage,
          },
          body: {
            text: item.description,
          },
          footer: {
            text: item.footer || "",
          },
          // carouselCardType: proto.Message.InteractiveMessage.CarouselMessage.CarouselCardType.FULL,
          nativeFlowMessage: {
            buttons: item.buttons.map((btn) => ({
              name: btn.name,
              buttonParamsJson: JSON.stringify(btn.params),
            })),
          },
        };
      }),
    );

    const payload = {
      viewOnceMessage: {
        message: {
          interactiveMessage: WAProto.Message.InteractiveMessage.create({
            body: WAProto.Message.InteractiveMessage.Body.create({
              text: text,
            }),
            footer: WAProto.Message.InteractiveMessage.Footer.create({
              text: footer,
            }),
            carouselMessage:
              WAProto.Message.InteractiveMessage.CarouselMessage.create({
                cards,
              }),
          }),
        },
      },
    };

    const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;

    const sendFunction = async () => {
      await BaileysService.sendTyping(sessionId, jid, true);
      if (delay > 0) {
        await BaileysService.delay(delay);
      }

      const msg = generateWAMessageFromContent(jid, payload, {
        userJid: sock.user.id,
      });
      const send = await sock.relayMessage(jid, msg.message, {
        messageId: msg.key.id,
        additionalNodes: BaileysService.BIZ_NATIVE_FLOW_NODE,
      });
      await BaileysService.sendTyping(sessionId, jid, false);
      return send;
    };

    let result;
    if (useQueue) {
      const queueInfo = await MessageQueueService.addToQueue(sessionId, {
        sendFunction,
        delay,
      });

      result = {
        queued: true,
        queuePosition: queueInfo.queuePosition,
        estimatedDelay: queueInfo.estimatedDelay,
      };
    } else {
      result = await sendFunction();
    }

    res.json({
      success: true,
      message: useQueue
        ? "Mensagem adicionada à fila"
        : "Mensagem de Botões enviada com sucesso",
      data: result,
    });
  } catch (error) {
    logger.error("Erro ao enviar botões:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/typing", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const { to, typing } = req.body;

    if (!to || typing === undefined) {
      return res.status(400).json({
        success: false,
        message: "to e typing são obrigatórios",
      });
    }

    if (!BaileysService.isSessionConnected(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    const result = await BaileysService.sendTyping(sessionId, to, typing);

    res.json({
      success: true,
      message: `Status de digitação ${typing ? "iniciado" : "parado"} com sucesso`,
      data: result,
    });
  } catch (error) {
    logger.error("Erro ao enviar status de digitação:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/mark-read", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const { jid, messageId } = req.body;

    if (!jid) {
      return res.status(400).json({
        success: false,
        message: "jid é obrigatório",
      });
    }

    if (!BaileysService.isSessionConnected(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Sessão não está conectada",
      });
    }

    const result = await BaileysService.markAsRead(sessionId, jid, messageId);

    res.json({
      success: true,
      message: "Mensagem marcada como lida com sucesso",
      data: result,
    });
  } catch (error) {
    logger.error("Erro ao marcar mensagem como lida:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.get("/messages", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const { jid, limit = 50, offset = 0 } = req.query;

    const messages = await Store.getMessages(
      sessionId,
      jid,
      parseInt(limit),
      parseInt(offset),
    );

    res.json({
      success: true,
      data: {
        messages,
        total: messages.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    });
  } catch (error) {
    logger.error("Erro ao obter mensagens:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor",
    });
  }
});

router.get("/chats", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    await BaileysService.deleteMessageRedis(sessionId);
    const rawLimit = parseInt(req.query.limit, 10);
    const count = Number.isInteger(rawLimit)
      ? Math.min(Math.max(rawLimit, 1), 500)
      : 100;
    const cursor =
      typeof req.query.cursor === "string" && /^\d+$/.test(req.query.cursor)
        ? req.query.cursor
        : "0";

    const remoteJid =
      typeof req.query.remoteJid === "string" ? req.query.remoteJid : null;

    let nextCursor = "0";
    let ids = [];
    let source = "set-index";

    // Se remoteJid for fornecido, buscamos mensagens daquele chat específico usando ZSET
    if (remoteJid) {
      // 🔥 buscar mensagens de um chat específico (ZSET)
      const start = parseInt(cursor, 10) || 0;
      const end = start + count - 1;

      ids = await BaileysService.redis.client.zrevrange(
        `chat:${sessionId}:${remoteJid}:messages`,
        start,
        end,
      );

      nextCursor = ids.length === count ? String(end + 1) : "0";
      source = "chat-zset";
    } else {
      const indexKey = `messages:${sessionId}`;
      const hasIndex =
        (await BaileysService.redis.client.exists(indexKey)) === 1;

      if (hasIndex) {
        const [newCursor, members] = await BaileysService.redis.client.sscan(
          indexKey,
          cursor,
          "COUNT",
          count,
        );
        nextCursor = newCursor;
        ids = Array.isArray(members) ? members : [];
      } else {
        // Fallback legado sem índice: scan incremental por padrão de chave
        const [newCursor, keys] = await BaileysService.redis.client.scan(
          cursor,
          "MATCH",
          `message:${sessionId}*`,
          "COUNT",
          count,
        );

        nextCursor = newCursor;
        source = "key-scan";
        ids = (Array.isArray(keys) ? keys : [])
          .map((key) => {
            if (key.startsWith(`message:${sessionId}_`)) {
              return key.replace(`message:${sessionId}_`, "");
            }
            if (key.startsWith(`message:${sessionId}:`)) {
              return key.replace(`message:${sessionId}:`, "");
            }
            return "";
          })
          .filter(Boolean);
      }
    }

    ids = [...new Set(ids)];

    const messages = await Promise.all(
      ids.map((id) => BaileysService.redis.get(`message:${sessionId}_${id}`)),
    );

    const validMessages = [];

    for (const m of messages) {
      if (!m) continue;

      try {
        validMessages.push(m);
      } catch (e) {
        console.error("Erro ao parsear mensagem:", e);
      }
    }

    res.json({
      success: true,
      cursor,
      nextCursor,
      hasMore: nextCursor !== "0",
      source,
      total: ids.length,
      messages: validMessages,
    });
  } catch (error) {
    logger.error("Erro ao obter chats:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor",
      error: error.message,
    });
  }
});

router.delete("/delete/:id_message", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const { id_message } = req.params;
    if (!id_message) {
      return res.json({
        success: false,
        message: 'Paramentro "id_message" Ausente',
        data: [],
      });
    }

    const get_message = await Chats.getchat(sessionId, id_message);
    if (!get_message) {
      return res.json({
        success: false,
        message: "Mensagem não encontrada",
        data: [],
      });
    }

    const key = {
      id: get_message.mensagem_id,
      remoteJid: get_message.remotejid,
      fromMe: get_message.fromme ? true : false,
    };

    const delete_msg = await BaileysService.deleteMessage(
      sessionId,
      get_message.remotejid,
      key,
    );
    if (!delete_msg) {
      return res.json({
        success: false,
        message: "Error ao deletar mensagem",
        data: delete_msg,
      });
    }
    res.json({
      success: true,
      message: "Mensagem deletada",
      data: delete_msg,
    });
  } catch (error) {
    logger.error("Erro ao deletar mensagem:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

export default router;
