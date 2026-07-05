import logger from "../../utils/logger.js";
import redis, { KEYS } from "../redis.js";

export async function startUtilWorker() {

    while (true) {
        try {
            const result = await redis.blockingClients.util.brpop(
                KEYS().queue_util(),
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

            switch (job?.type) {
                case "lid_map":
                    try {
                        const id = job.lid.split("@lid")[0];
                        await redis.set(KEYS().lid_map(job.sessionId, id), job.pn.replace(/"/g, "").trim());
                    } catch (err) { }
                    break;
            }

        } catch (err) {
            logger.error("Erro no worker:", err);

            // evita loop infinito em caso de erro
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}