import logger from "../../utils/logger.js";
import redis, { KEYS } from "../redis.js";
import Contato from "../../models/Contatos.js";

let unico = new Map()
export async function startContatosWorker() {

    while (true) {
        try {
            const result = await redis.blockingClients.contato.brpop(
                KEYS().Store_contatos(),
                0
            );

            if (!result) continue;
            const [, payload] = result;
            const job = JSON.parse(payload);
            if (!job.sessionId || !job.id) continue;
            if (job.id.endsWith('@g.us') || job.id.endsWith('@newsletter')) continue;
            const getsessao = await redis.workerClient.get(
                KEYS().sessao(job.sessionId)
            );
            if (!getsessao) continue;
            await Contato.SaveContatos(job)

        } catch (err) {
            logger.error("Erro no worker:", err);

            // evita loop infinito em caso de erro
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}