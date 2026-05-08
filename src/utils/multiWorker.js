// multiWorker.js
import Store from "../models/Store.js";
import BaileysService from "../services/BaileysService.js";
import { QUEUES } from "./queuesConfig.js";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// 🔥 deduplicação genérica usando keyFn
function deduplicate(items, keyFn) {
  const map = new Map();

  for (const item of items) {
    try {
      const key = keyFn(item);

      if (!key) continue;

      // mantém o mais recente
      map.set(key, item);
    } catch {
      // ignora item inválido
    }
  }

  return Array.from(map.values());
}

export async function startMultiQueueWorker() {
  console.log("Worker multi-filas iniciado...");

  while (true) {
    let processedSomething = false;

    try {
      for (const queue of QUEUES) {
        const { name, batchSize, handler, keyFn } = queue;

        const items = [];

        // 🔥 coleta lote
        for (let i = 0; i < batchSize; i++) {
          const raw = await BaileysService.redis.client.lpop(name);
          if (!raw) break;

          try {
            items.push(JSON.parse(raw));
          } catch {
            // ignora inválido
          }
        }

        if (items.length > 0) {
          processedSomething = true;
          const uniqueItems = deduplicate(items, keyFn);
          await handler(uniqueItems);
        }
      }

      // se nenhuma fila tinha dados
      if (!processedSomething) {
        await sleep(500);
      }
    } catch (err) {
      console.error("Erro no worker:", err);
      await sleep(2000);
    }
  }
}
