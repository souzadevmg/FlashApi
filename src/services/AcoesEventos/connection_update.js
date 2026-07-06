import BaileysService from "../BaileysService.js";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import QRCode from "qrcode";
import Session from "../../models/Session.js";
import logger from "../../utils/logger.js";
import { DisconnectReason } from "@whiskeysockets/baileys";
import config from "../../config/env.js";


export const connection = async (sessionId, update) => {
    const { connection, lastDisconnect, qr } = update;


    //Limite de conexão
    const countConnect = BaileysService.limitReconnect.get(sessionId) || 0;
    if (countConnect >= 10) {
        logger.info('Limite de Conexão atingido');
        Session.delete(sessionId, false);
        return;
    }
    BaileysService.limitReconnect.set(sessionId, countConnect + 1);

    /** @type {import("@whiskeysockets/baileys").WASocket} */
    const sock = BaileysService.sockets.get(sessionId)
    if (!sock) return

    const getsessao = await BaileysService.GetSessao(sessionId)
    if (!getsessao) return

    if (qr) {
        const limiteQr = parseInt(config.qrcode_limite)

        const count = BaileysService.countQrcode.get(sessionId) || 0;
        if (count >= limiteQr) {
            logger.info('Limite de Qrcode atingido');
            Session.delete(sessionId, false);
            return;
        }
        BaileysService.countQrcode.set(sessionId, count + 1);

        let code = null
        if (getsessao.numero !== "") {
            try {
                code = await sock.requestPairingCode(getsessao.numero);
            } catch (error) { }
        }

        getsessao.qrcode = qr;
        getsessao.code = code;
        logger.info(`Qrcode sessão ${sessionId}`)
        qrcode.generate(qr, { small: true, });
        const qrCode = await QRCode.toDataURL(qr)
        getsessao.qrcode = qrCode
        getsessao.status = "qr_ready";
        attSessao(sessionId, getsessao)
    }

    if (connection === "connecting") {
        getsessao.status = "connecting"
        attSessao(sessionId, getsessao)
    }

    if (connection === "open") {

        const numero = sock.user.id.split(':')[0] || null
        logger.info(`Sessão ${sessionId} Conectada numero: ${numero} Nome: ${sock.user.name}`)
        getsessao.status = "connected"
        getsessao.numero = numero
        getsessao.qrcode = null
        getsessao.code = null
        attSessao(sessionId, getsessao)
        BaileysService.countQrcode.set(sessionId, 0);
        BaileysService.limitReconnect.set(sessionId, 0);
    }

    if (connection === "close") {
        const statusCode = new Boom(lastDisconnect?.error).output.statusCode;

        getsessao.status = "disconnected"
        attSessao(sessionId, getsessao)
        if (statusCode == '515') {
            logger.info(`Status 515 Reniciando sessão: ${sessionId}`)
            await BaileysService.delay(3000);
            return BaileysService.createSession(sessionId)
        }

        if (statusCode !== DisconnectReason.loggedOut) {
            logger.info(`Reconectando sessão: ${sessionId}`)
            await BaileysService.delay(3000);
            return BaileysService.createSession(sessionId)

        } else {
            Session.delete(sessionId, false)
            logger.info(`Sessão ${sessionId} Deconectada loggedOut Foi limpa do sistema com sucesso`)
        }

    }
    sock.status = qr ? 'qr_ready' : connection

}

async function attSessao(sessionId, getsessao) {
    Session.update(sessionId, {
        status: getsessao.status,
        qr_code: getsessao.qrcode,
        phone_number: getsessao.numero,
        code: getsessao.code,
    })
    BaileysService.salvarSessao(sessionId, getsessao)
}