import { startAuthKeyWorker } from "./startAuthKeyWorker.js";
import { startChatsWorker } from "./startChatsWorker.js";
import { startContatosWorker } from "./startContatosWorker.js";
import { startMessageWorker } from "./startMessageWorker.js";
import { startSessaoWorker } from "./startSessionsWorker.js";
import { startUtilWorker } from "./startUtilWorker.js";

const workers = [
    { fn: startAuthKeyWorker, count: 1 },
    { fn: startMessageWorker, count: 10 },
    { fn: startContatosWorker, count: 4 },
    { fn: startUtilWorker, count: 4 },
    { fn: startChatsWorker, count: 4 },
    { fn: startSessaoWorker, count: 1 },
];

export function startWorkers() {
    for (const { fn, count } of workers) {
        for (let i = 0; i < count; i++) {
            fn().catch(err => {
                console.error(`Worker ${fn.name} #${i + 1} finalizou com erro`, err);
            });
        }
    }
}