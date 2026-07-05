import Chats from "../../models/chats.js";
import logger from "../../utils/logger.js";
import BaileysService from "../BaileysService.js";
import redis, { KEYS } from "../redis.js";

export async function startChatsWorker() {

    while (true) {
        try {

            const result = await redis.blockingClients.chat.brpop(
                KEYS().Store_chats(),
                0
            );

            if (!result) continue;

            const [, payload] = result;

            const job = JSON.parse(payload);
            if (!job.sessionId) continue;
            const getsessao = await redis.workerClient.get(
                KEYS().sessao(job.sessionId)
            );
            if (!getsessao) continue;
            await Chats.SaveChats(job)
        } catch (err) {
            logger.error("Erro no worker:", err);

            // evita loop infinito em caso de erro
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}