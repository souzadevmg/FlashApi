// workerServices.js
import BaileysService from "../BaileysService.js";
import logger from "../../utils/logger.js";
import { insertOrUpdateAuthKey } from "../usePostgresAuthStore.js";
import redis, { KEYS } from "../redis.js";

export async function startAuthKeyWorker() {

    while (true) {
        try {
            const result = await redis.blockingClients.authKey.brpop(
                KEYS().pre_keys(),
                0
            );

            if (!result) continue;

            const [, payload] = result;

            const job = JSON.parse(payload);

            await insertOrUpdateAuthKey(
                job.sessionId,
                job.key_id,
                job.json
            );
        } catch (err) {
            logger.error("Erro no worker:", err);

            // evita loop infinito em caso de erro
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}