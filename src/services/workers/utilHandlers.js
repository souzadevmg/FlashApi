import redis, { KEYS } from "../redis.js";

export const utilHandlers = {

    //Mapear lid
    async lid_map(dados) {

        const id = dados.lid.split("@lid")[0];

        await redis.set(
            KEYS().lid_map(dados.sessionId, id),
            dados.pn.replace(/"/g, "").trim()
        );

    },

};