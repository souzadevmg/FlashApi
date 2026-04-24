import axios from "axios";
import logger from "../utils/logger.js";
import http from "http";
import https from "https";

const httpAgent = new http.Agent({ keepAlive: false });
const httpsAgent = new https.Agent({ keepAlive: false });

class WebhookService {
  async sendWebhook(url, data, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await axios.post(url, data, {
          timeout: 10000,
          httpAgent,
          httpsAgent,
          validateStatus: () => true, // não deixa axios quebrar em 4xx/5xx
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0",
            Connection: "close",
            Accept: "*/*",
          },
        });

        if (response.status >= 200 && response.status < 300) {
          logger.info(`Webhook enviado com sucesso para ${url}`);
          return true;
        }
      } catch (error) {
        console.log(error);
        logger.error(
          `Tentativa ${i + 1} - Erro ao enviar webhook para ${url}:`,
          error.message,
        );

        if (i === retries - 1) {
          logger.error(`Falha ao enviar webhook após ${retries} tentativas`);
          return false;
        }

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
      }
    }

    return false;
  }
}

export default WebhookService;
