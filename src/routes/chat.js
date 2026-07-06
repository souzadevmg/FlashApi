import express from "express";
import authenticateApiKey from "../middleware/auth.js";
import BaileysService from "../services/BaileysService.js";
import Store from "../models/Store.js";

import logger from "../utils/logger.js";
import Chats from "../models/chats.js";
import { downloadMediaMessage, generateWAMessageFromContent, prepareWAMessageMedia, proto, WAProto } from "@whiskeysockets/baileys";
import axios from "axios";
import { Sticker } from "wa-sticker-formatter";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import fs from "fs";
import os from "os";
import path from "path";
import { sendMessage } from "../services/messageService.js";
import { sendButton, sendCarousel, sendinteractiveMessage, sendList } from "../services/buttonsService.js";
import Message from "../models/Message.js";
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const router = express.Router();

//Criar sticker a partir de uma URL ou base64 usando wa-sticker-formatter
async function createSticker(input) {
  try {
    let imageBuffer;

    if (typeof input === "string" && input.startsWith("data:")) {
      const base64Data = input.split(",")[1];
      imageBuffer = Buffer.from(base64Data, "base64");
    } else {
      imageBuffer = input;
    }

    const sticker = new Sticker(imageBuffer, {
      pack: "Flash API",
      author: "Store",
      type: "full",
      quality: 100,
    });

    return await sticker.toBuffer();
  } catch (error) {
    console.error("Erro ao criar sticker:", error);
    return false;
  }
}

// Converter áudio para formato Opus usando ffmpeg
async function converterParaOpus(buffer) {
  const input = path.join(os.tmpdir(), `${Date.now()}.mp3`);
  const output = path.join(os.tmpdir(), `${Date.now()}.ogg`);

  await fs.promises.writeFile(input, buffer);

  await new Promise((resolve, reject) => {
    ffmpeg(input).audioCodec("libopus").format("ogg").on("end", resolve).on("error", reject).save(output);
  });

  const result = await fs.promises.readFile(output);

  fs.unlink(input, () => { });
  fs.unlink(output, () => { });

  return result;
}

router.post("/send-text", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.sessao.apikey;
    const send = await sendMessage(sessionId, req.body)
    return res.status(send.success ? 200 : 500).status(200).json({
      success: send.success ? true : false,
      message: send.message,
      error: send.error
    });
    logger.info(`Mensagem de texto "enviada": ${sessionId} -> ${req.body.jid}`);
  } catch (error) {
    logger.error("Erro ao enviar mensagem de texto:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor",
      error: error.message || error
    });
  }
});

router.post("/send-image", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.sessao.apikey;
    const send = await sendMessage(sessionId, req.body)
    return res.status(send.success ? 200 : 500).status(200).json({
      success: send.success ? true : false,
      message: send.message,
      error: send.error
    });
    logger.info(`Imagem enviada: ${sessionId} -> ${req.body.jid}`);
  } catch (error) {
    logger.error("Erro ao enviar imagem:", error.message || error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/send-video", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.sessao.apikey;
    const send = await sendMessage(sessionId, req.body)
    return res.status(send.success ? 200 : 500).status(200).json({
      success: send.success ? true : false,
      message: send.message,
      error: send.error
    });
    logger.info(`Video enviado: ${sessionId} -> ${req.body.jid}`);
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
    const sessionId = req.sessao.apikey;
    const send = await sendMessage(sessionId, req.body)
    return res.status(send.success ? 200 : 500).status(200).json({
      success: send.success ? true : false,
      message: send.message,
      error: send.error
    });
    logger.info(`Audio enviado: ${sessionId} -> ${req.body.jid}`);
  } catch (error) {
    logger.error("Erro ao enviar áudio:", error.message || error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/send-document", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.sessao.apikey;
    const send = await sendMessage(sessionId, req.body)
    return res.status(send.success ? 200 : 500).status(200).json({
      success: send.success ? true : false,
      message: send.message,
      error: send.error
    });
    logger.info(`Documento enviado: ${sessionId} -> ${req.body.jid}`);
  } catch (error) {
    logger.error("Erro ao enviar documento:", error.message || error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/send-location", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.sessao.apikey;
    const send = await sendMessage(sessionId, req.body)
    return res.status(send.success ? 200 : 500).status(200).json({
      success: send.success ? true : false,
      message: send.message,
      error: send.error
    });
    logger.info(`Localização enviado: ${sessionId} -> ${req.body.jid}`);
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
    const sessionId = req.sessao.apikey;
    const send = await sendMessage(sessionId, req.body)
    return res.status(send.success ? 200 : 500).status(200).json({
      success: send.success ? true : false,
      message: send.message,
      error: send.error
    });
    logger.info(`Contato enviado: ${sessionId} -> ${req.body.jid}`);
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
    const sessionId = req.sessao.apikey;
    const send = await sendMessage(sessionId, req.body)
    return res.status(send.success ? 200 : 500).status(200).json({
      success: send.success ? true : false,
      message: send.message,
      error: send.error
    });
    logger.info(`Figurinha Enviada: ${sessionId} -> ${req.body.jid}`);
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
    const sessionId = req.sessao.apikey;
    const send = await sendMessage(sessionId, req.body)
    return res.status(send.success ? 200 : 500).status(200).json({
      success: send.success ? true : false,
      message: send.message,
      error: send.error
    });
    logger.info(`Reação Enviada: ${sessionId} -> ${req.body.jid}`);
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
    const sessionId = req.sessao.apikey;
    const send = await sendMessage(sessionId, req.body)
    return res.status(send.success ? 200 : 500).status(200).json({
      success: send.success ? true : false,
      message: send.message,
      error: send.error
    });
    logger.info(`Enquete Enviada: ${sessionId} -> ${req.body.jid}`);
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
    const sessionId = req.sessao.apikey;
    const send = await sendList(sessionId, req.body)
    return res.status(send.success ? 200 : 500).status(200).json({
      success: send.success ? true : false,
      message: send.message,
      error: send.error
    });
    logger.info(`Lista Enviada: ${sessionId} -> ${req.body.jid}`);
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

    const sessionId = req.sessao.apikey;
    const send = await sendButton(sessionId, req.body)
    return res.status(send.success ? 200 : 500).status(200).json({
      success: send.success ? true : false,
      message: send.message,
      error: send.error
    });
    logger.info(`Button Enviado: ${sessionId} -> ${req.body.jid}`);

  } catch (error) {
    console.log(error);
    logger.error("Erro ao enviar botões:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/send-interactiveMessage", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.sessao.apikey;
    const send = await sendinteractiveMessage(sessionId, req.body)
    return res.status(send.success ? 200 : 500).status(200).json({
      success: send.success ? true : false,
      message: send.message,
      error: send.error
    });
    logger.info(`Button Enviado: ${sessionId} -> ${req.body.jid}`);

  } catch (error) {
    logger.error("Erro ao enviar botões:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

router.post("/send-carouselMessage", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.sessao.apikey;
    const send = await sendCarousel(sessionId, req.body)
    return res.status(send.success ? 200 : 500).status(200).json({
      success: send.success ? true : false,
      message: send.message,
      error: send.error
    });
    logger.info(`Button Enviado: ${sessionId} -> ${req.body.jid}`);
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
    const sessionId = req.sessao.apikey;
    const { jid, typing = null, audio = false, delay = 0 } = req.body;

    if (!jid) {
      return res.status(400).json({
        success: false,
        message: "to e typing são obrigatórios",
      });
    }

    if (typeof typing !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "typing deve ser Boolean",
      });
    }

    /** @type {import("@whiskeysockets/baileys").WASocket} */
    const sock = BaileysService.sockets.get(sessionId);
    if (!sock) {
      return res.status(400).json({
        success: false,
        message: "Sessão desconectada",
      });
    }

    if (typeof delay == "number" && delay > 0) {
      await BaileysService.delay(parseInt(delay))
    }
    if (!typing) {
      sock.sendPresenceUpdate("paused", jid);
    } else {
      sock.sendPresenceUpdate(audio ? "recording" : "composing", jid);
    }

    res.json({
      success: true,
      message: `Status de digitação ${typing ? "iniciado" : "parado"} com sucesso`,
      data: {},
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
    const sessao = req.sessao;
    const { jid, messageId } = req.body;

    if (!jid) {
      return res.status(400).json({
        success: false,
        message: "jid é obrigatório",
      });
    }

    /** @type {import("@whiskeysockets/baileys").WASocket} */
    const sock = BaileysService.sockets.get(sessao.apikey);
    if (!sock) {
      return res.status(400).json({
        success: false,
        message: "Sessão desconectada",
      });
    }

    const result = await sock.readMessages([{ remoteJid: jid, id: messageId }]);

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

    const messages = await Store.getMessages(sessionId, jid, parseInt(limit), parseInt(offset));

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

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const search = req.query.search || "";

    if (limit > 100) {
      return res.status(500).json({
        success: false,
        message: "limit maximo e 100"
      });
    }

    const result = await Chats.FindChatsAll({
      sessionId,
      page,
      limit,
      search
    });

    res.json(result);

  } catch (error) {
    logger.error("Erro ao obter chats:", error);

    res.status(500).json({
      success: false,
      message: "Erro interno",
      error: error.message
    });
  }
});

router.delete("/delete/:id_message", authenticateApiKey, async (req, res) => {
  try {
    const sessao = req.sessao;
    const { id_message } = req.params;
    if (!id_message) {
      return res.json({
        success: false,
        message: 'Paramentro "id_message" Ausente',
        data: [],
      });
    }

    const get_message = await Message.getMessage(sessao.apikey, id_message);

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
      participant: get_message.participant || undefined,
    };
    /** @type {import("@whiskeysockets/baileys").WASocket} */
    const sock = BaileysService.sockets.get(sessao.apikey)
    if (!sock) {
      return res.json({
        success: false,
        message: "Sessão não conectada",
        data: [],
      });
    }

    const delete_msg = await sock.sendMessage(get_message.remotejid, { delete: key });
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

//Converter midia em base64
router.post("/midiaToBase64", authenticateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers["apikey"];
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "message é obrigatório",
      });
    }
    if (!message?.imageMessage && !message?.videoMessage && !message?.audioMessage) {
      return res.status(400).json({
        success: false,
        message: "Tipo de mídia inválido",
      });
    }
    const buffer = await downloadMediaMessage({ message }, "buffer");

    const base64 = buffer.toString("base64");
    const mime = message.imageMessage?.mimetype || message.videoMessage?.mimetype || message.audioMessage?.mimetype;

    const dataUrl = `data:${mime};base64,${base64}`;

    res.json({
      success: true,
      message: "Mídia convertida para base64 com sucesso",
      data: dataUrl,
    });
  } catch (error) {
    logger.error("Erro ao converter mídia para base64:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Erro interno do servidor",
    });
  }
});

export default router;
