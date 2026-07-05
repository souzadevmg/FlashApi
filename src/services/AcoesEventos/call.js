import logger from "../../utils/logger.js"
import BaileysService from "../BaileysService.js"
import { sendMessage } from "../messageService.js"


export const call = async (sessionId, data) => {

    const sock = BaileysService.sockets.get(sessionId)
    if (!sock) return

    const getsesssao = await BaileysService.GetSessao(sessionId)
    if (!getsesssao) return;

    for (const call of data) {
        if (getsesssao?.rejeitar_ligacoes && call.status === "offer") {
            await sock.rejectCall(call.id, call.from);
            if (getsesssao?.msg_rejectcalls && getsesssao?.msg_rejectcalls !== "") {
                const message = {
                    text: getsesssao.msg_rejectcalls,
                };
                const send = await sendMessage(sessionId, {
                    jid: call.from,
                    text: message
                })
            }
            logger.info(`📞 Chamada rejeitada automaticamente de ${call.from}`);
        }
    }
}