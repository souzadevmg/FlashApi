import { decryptPollVote, getKeyAuthor, jidNormalizedUser } from "@whiskeysockets/baileys";
import BaileysService from "../BaileysService.js";
import WebSocketService from "../WebSocketService.js";
import Message from "../../models/Message.js";
import digestSync from "crypto-digest-sync";
import logger from "../../utils/logger.js";
import config from "../../config/env.js";



export const messagemap = async (sessionId, dados) => {
    const { messages, type } = dados
    if (!Array.isArray(messages) || messages.length === 0) {
        return;
    }
    const pipeline = BaileysService.redis.workerClient.pipeline();
    const sessao = await BaileysService.redis.get(BaileysService.keys.sessao(sessionId))

    for (const msg of messages) {

        let message = JSON.parse(JSON.stringify(msg))
        if (sessao?.ignorar_grupos === true && message?.key?.remoteJid?.endsWith("@g.us")) continue; //Verificar se ta ativo ignorar grupos
        if (!message.key || (config.ignore_boadcast === true && message?.key?.remoteJid == "status@broadcast")) continue; //Verificar se e evendo de status
        const messageType = getMessageType(message.message);
        const tiposIgnoraveis = new Set(["protocolMessage", "senderKeyDistributionMessage"]);
        if (tiposIgnoraveis.has(messageType)) continue; //Ignora tipos de messagem

        const dadosmsg = {
            sessionId: sessionId,
            ...message
        }

        if (message.message?.pollCreationMessageV3 ||
            message.message?.pollCreationMessage ||
            message.message?.pollCreationMessageV2 ||
            message.message?.pollUpdateMessage
        ) {
            Message.SaveMessage(dadosmsg)
            const getVoto = await pollvote(message, sessionId)
            try { message.message.pollUpdateMessage.vote = getVoto } catch (e) { }


        } else {
            //Adicionar messagem a lista de cache
            pipeline.lpush(
                BaileysService.keys.Store_mensagens(),
                JSON.stringify(message)
            )
        }
        WebSocketService.emitEvents(sessionId, 'messages_upsert', message);

    }
    await pipeline.exec();
}

export const getMessageType = (message) => {
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
    if (message.pollCreationMessageV3 ||
        message.pollCreationMessage ||
        message.pollCreationMessageV2
    ) {
        return "pollCreationMessage";
    }
    if (message.pollUpdateMessage) {
        return "pollUpdateMessage"
    }

    return Object.keys(message)[0] || null;
}


const pollvote = async (message, sessionId) => {

    try {
        /** @type {import("@whiskeysockets/baileys").WASocket} */
        const sock = BaileysService.sockets.get(sessionId);

        const pollMsgId1 = message?.message?.pollCreationMessageKey?.id || null;
        const pollMsgId2 = message?.message?.pollUpdateMessage?.pollCreationMessageKey?.id || null;
        const pollMsgId = pollMsgId1 || pollMsgId2;
        const getmessagem = await Message.getMessage(sessionId, pollMsgId)

        if (getmessagem) {
            const me = sock.user
            const creationMsgKey = getmessagem?.conteudo_mensagem.key || null;
            const pollEncKey = Buffer.from(getmessagem.conteudo_mensagem.message.messageContextInfo.messageSecret, "base64")

            const meIdNormalised = jidNormalizedUser(me.id)
            const meLidNormalised = me?.lid ? jidNormalizedUser(me.lid) : undefined

            const voterJid = getKeyAuthor(message.key, meIdNormalised)
            const remoteJid = message.key.remoteJid
            const remoteJidAlt = message.key.remoteJidAlt
            const participant = message.key.participant
            const participantAlt = message.key.participantAlt

            const creatorPnJid = getKeyAuthor(creationMsgKey, meIdNormalised)
            const creatorLidJid = meLidNormalised && creationMsgKey?.fromMe ? meLidNormalised : creatorPnJid
            const jidCombos = [
                [creatorLidJid, voterJid],
                [creatorPnJid, voterJid],

                [creatorLidJid, remoteJid],
                [creatorPnJid, remoteJid],

                [creatorLidJid, remoteJidAlt],
                [creatorPnJid, remoteJidAlt],

                [creatorLidJid, participant],
                [creatorPnJid, participantAlt],
            ]


            const encPayload_encIv = {
                encPayload: Buffer.from(message?.message.pollUpdateMessage.vote.encPayload, "base64"),
                encIv: Buffer.from(message?.message.pollUpdateMessage.vote.encIv, "base64")
            }
            let vote
            for (const [mylid, voterJid] of jidCombos) {
                try {
                    vote = await decryptPollVote(encPayload_encIv, {
                        pollCreatorJid: mylid,
                        pollMsgId: pollMsgId,
                        pollEncKey: pollEncKey,
                        voterJid: voterJid,
                    });
                    break;
                } catch (error) { }

            }
            if (!vote) return []
            let selectedOptions = []

            for (const decryptedHash of vote.selectedOptions) {
                const hashHex = Buffer.from(decryptedHash).toString('hex').toUpperCase();
                const pollUption = getmessagem?.conteudo_mensagem?.message?.pollCreationMessageV3 ||
                    getmessagem?.conteudo_mensagem?.message?.pollCreationMessage ||
                    getmessagem?.conteudo_mensagem?.message?.pollCreationMessageV2 ||
                    getmessagem?.conteudo_mensagem?.message?.pollUpdateMessage || []

                for (const option of pollUption?.options) {
                    const hash = Buffer.from(digestSync("SHA-256", new TextEncoder().encode(Buffer.from(option.optionName).toString())))
                        .toString("hex")
                        .toUpperCase();

                    if (hashHex == hash) {
                        selectedOptions.push(option.optionName);
                        break;
                    }
                }
            }
            return selectedOptions
        }
    } catch (error) {
        logger.error("Erro ao pegar voto de enquete: ", error);
        return []
    }



}