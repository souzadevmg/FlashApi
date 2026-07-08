import Session from "../../models/Session.js";
import redis, { KEYS } from "../redis.js";

const statusCache = new Map();

export async function updateSessao(sessionId, sessao) {

    await redis.set(KEYS().sessao(sessionId), sessao)
    await Session.update(sessionId, {
        status: sessao.status,
        qr_code: sessao.qrcode,
        phone_number: sessao.numero,
        code: sessao.code,
    })
}