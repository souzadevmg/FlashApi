import axios from 'axios'
import logger from '../utils/logger.js'

class WebhookService {
  async sendWebhook(url, data, retries = 3) {
    if (!url) {
      logger.error('URL do webhook inválida')
      return false
    }

    for (let i = 0; i < retries; i++) {
      try {
        const response = await axios.post(url, data, {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'flash-Multi-Session-Webhook/1.0'
          },
          validateStatus: () => true // 🔥 evita throw automático
        })

        if (response.status >= 200 && response.status < 300) {
          logger.info(`✅ Webhook enviado: ${url}`)
          return true
        }

        // ❌ NÃO tentar retry em erro do cliente
        if (response.status >= 400 && response.status < 500) {
          logger.error(`❌ Erro cliente ${response.status} - ${url}`)
          return false
        }

        logger.warn(`⚠️ Tentativa ${i + 1} falhou (${response.status})`)

      } catch (error) {
        const status = error.response?.status

        logger.error(`❌ Tentativa ${i + 1} - erro webhook:`, {
          url,
          status,
          message: error.message
        })

        // ❌ erro 4xx não deve retry
        if (status >= 400 && status < 500) {
          return false
        }

        // timeout ou rede → pode tentar de novo
      }

      // ⏱ backoff progressivo
      await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }

    logger.error(`💥 Falha total ao enviar webhook: ${url}`)
    return false
  }
}

export default WebhookService