import Store from "../models/Store.js";

// queuesConfig.js
export const QUEUES = [
  {
    name: "queue:messages",
    batchSize: 500,
    handler: Store.saveMessagesBatch,
    keyFn: (i) => `${i.sessao_id}:${i.key.id}`,
  },
  {
    name: "queue:contacts",
    batchSize: 300,
    handler: Store.saveContactsBatch,
    keyFn: (i) => `${i.sessao_id}:${i.id}`,
  },
  {
    name: "queue:chats",
    batchSize: 300,
    handler: Store.saveChatsBatch,
    keyFn: (i) => `${i.sessao_id}:${i.id}`,
  },
];
