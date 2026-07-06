import redis, { KEYS } from "../redis.js";
import { workers } from "./Workers.js";

export function startWorkers() {

    for (const worker of workers) {
        for (let i = 0; i < worker.concurrency; i++) {

            worker.run().catch(err => {
                console.error(
                    `[${worker.name}] Worker #${i + 1} finalizou`,
                    err
                );
            });

        }

    }

}