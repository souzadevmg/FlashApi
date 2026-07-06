import logger from "../../utils/logger.js";

export function createLoopWorker({
    name,
    concurrency = 1,
    interval = 3000,
    handler
}) {

    async function run() {

        while (true) {

            try {

                await handler();

            } catch (err) {

                logger.error(`[${name}]`, err);

            }

            await new Promise(r => setTimeout(r, interval));

        }

    }

    return {
        name,
        concurrency,
        run
    };

}