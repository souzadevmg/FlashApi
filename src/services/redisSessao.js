import { initAuthCreds, BufferJSON, proto } from "@whiskeysockets/baileys";

/**
 * Sistema de AuthState igual ao useMultiFileAuthState, porém usando Redis.
 */
export const useRedisAuthState = async (sessionId, redis) => {

    const credsKey = `baileys:${sessionId}:creds`;
    const baseKey = `baileys:${sessionId}:keys`;

    // -----------------------------
    // SALVAR JSON no Redis
    // -----------------------------
    const writeData = async (key, data) => {
        try {
            const json = JSON.stringify(data, BufferJSON.replacer);
            await redis.set(key, json);
        } catch (e) {
            console.error("Erro ao salvar no Redis:", e);
        }
    };

    // -----------------------------
    // LER JSON do Redis
    // -----------------------------
    const readData = async (key) => {
        try {
            const raw = await redis.get(key);
            if (!raw) return null;
            return JSON.parse(raw, BufferJSON.reviver);
        } catch {
            return null;
        }
    };

    // -----------------------------
    // REMOVER do Redis
    // -----------------------------
    const removeData = async (key) => {
        try {
            await redis.del(key);
        } catch { }
    };

    // -----------------------------
    // Carregar Credenciais
    // -----------------------------
    const creds = (await readData(credsKey)) || initAuthCreds();

    // -----------------------------
    // DEVOLVE O AUTH STATE IGUAL Baileys
    // -----------------------------
    return {
        state: {
            creds,

            // -------------------------
            // SISTEMA DE KEYS
            // -------------------------
            keys: {
                /** Carrega várias keys */
                get: async (type, ids) => {
                    const results = {};

                    for (const id of ids) {
                        const redisKey = `${baseKey}:${type}:${id}`;
                        let value = await readData(redisKey);

                        if (type === "app-state-sync-key" && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value);
                        }

                        results[id] = value;
                    }
                    return results;
                },

                /** Salva várias keys */
                set: async (updates) => {
                    const ops = [];
                    for (const type in updates) {
                        for (const id in updates[type]) {
                            const redisKey = `${baseKey}:${type}:${id}`;
                            const value = updates[type][id];

                            if (!value) {
                                ops.push(removeData(redisKey));
                            } else {
                                ops.push(writeData(redisKey, value));
                            }
                        }
                    }
                    await Promise.all(ops);
                }
            }
        },

        // -----------------------------
        // Salvar credenciais
        // -----------------------------
        saveCreds: async () => {
            await writeData(credsKey, creds);
        }
        // 🔥 NOVO — método público para apagar a sessão
    };
};


// 🔥 NOVO — remover TUDO da sessão
export const clearAuth = async (sessionId, redis) => {


    const credsKey = `baileys:${sessionId}:creds`;
    const baseKey = `baileys:${sessionId}:keys`;
    try {
        // Apaga credenciais
        await redis.del(credsKey);

        // Busca TODAS as keys relacionadas
        const pattern = `${baseKey}:*`;
        const keys = await redis.keys(pattern);

        if (keys.length > 0) {
            await redis.del(...keys);
        }

        console.log(`🔥 Sessão ${sessionId} removida do Redis.`);
    } catch (e) {
        console.error("Erro ao limpar sessão do Redis:", e);
    }
};