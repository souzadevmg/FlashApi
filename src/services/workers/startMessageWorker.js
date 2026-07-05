import logger from "../../utils/logger.js";
import Message from "../../models/message.js";
import redis, { KEYS } from "../redis.js";

export async function startMessageWorker() {

    while (true) {
        try {
            const result = await redis.blockingClients.message.brpop(
                KEYS().Store_mensagens(),
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
            await Message.SaveMessage(job)

        } catch (err) {
            logger.error("Erro no worker:", err);

            // evita loop infinito em caso de erro
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}