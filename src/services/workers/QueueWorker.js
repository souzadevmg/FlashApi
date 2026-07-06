import logger from "../../utils/logger.js";
import redis, { KEYS } from "../redis.js";

export function createQueueWorker({
    concurrency,
    name,
    brpop,
    validate,
    handler,
    client,
    queue
}) {

    async function run() {

        while (true) {

            try {

                const result = await client.brpop(queue, 0);
                if (!result) continue;
                const [, payload] = result;
                const dados = JSON.parse(payload);

                if (validate) {
                    if (!await validate(dados)) continue;
                }

                await handler(dados);

            } catch (err) {

                logger.error(`[${name}]`, err);

                await new Promise(r => setTimeout(r, 1000));

            }
        }
    }

    return {
        name,
        concurrency,
        run
    };

}