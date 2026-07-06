// workerServices.js
import BaileysService from "../BaileysService.js";
import logger from "../../utils/logger.js";
import redis, { KEYS } from "../redis.js";
import Session from "../../models/Session.js";

export async function startSessaoWorker() {

    while (true) {
        try {
            for (const [id, sock] of BaileysService.sockets) {

                if (sock.status == 'open') {
                    await Session.update(id, {
                        status: 'connected'
                    })
                }
                // logger.info(`Sessao: ${id} Status: ${sock.status}`)
            }
        } catch (err) {
            console.error(err);
        } finally {
            await BaileysService.delay(3000);
        }
    }
}