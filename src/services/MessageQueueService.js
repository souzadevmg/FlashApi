import logger from '../utils/logger.js';

class MessageQueueService {
  constructor() {
    this.queues = new Map(); // sessionId -> array de mensagens
    this.processing = new Map(); // sessionId -> boolean
    this.defaultDelay = 1000; // 1 segundo por padrão
  }

  async addToQueue(sessionId, messageData, delay = null) {
    if (!this.queues.has(sessionId)) {
      this.queues.set(sessionId, []);
    }

    const queue = this.queues.get(sessionId);
    queue.push({
      ...messageData,
      delay: delay || this.defaultDelay,
      timestamp: Date.now()
    });

    logger.info(`📝 Mensagem adicionada à fila da sessão ${sessionId}. Fila: ${queue.length} mensagens`);

    // Processar fila se não estiver processando
    if (!this.processing.get(sessionId)) {
      this.processQueue(sessionId);
    }

    return {
      queuePosition: queue.length,
      estimatedDelay: this.calculateEstimatedDelay(sessionId)
    };
  }

  async processQueue(sessionId) {
    if (this.processing.get(sessionId)) {
      return;
    }

    this.processing.set(sessionId, true);
    const queue = this.queues.get(sessionId);

    if (!queue || queue.length === 0) {
      this.processing.set(sessionId, false);
      return;
    }

    logger.info(`🔄 Processando fila da sessão ${sessionId} com ${queue.length} mensagens`);

    while (queue.length > 0) {
      const messageData = queue.shift();
      
      try {
        // Executar a função de envio
        await messageData.sendFunction();
        
        logger.info(`✅ Mensagem processada da fila: ${sessionId}`);

        // Aplicar delay se houver mais mensagens na fila
        if (queue.length > 0) {
          logger.info(`⏱️ Aguardando ${messageData.delay}ms antes da próxima mensagem...`);
          await this.delay(messageData.delay);
        }
      } catch (error) {
        logger.error(`❌ Erro ao processar mensagem da fila ${sessionId}:`, error);
        // Continuar processando outras mensagens mesmo se uma falhar
      }
    }

    this.processing.set(sessionId, false);
    logger.info(`✅ Fila da sessão ${sessionId} processada completamente`);
  }

  calculateEstimatedDelay(sessionId) {
    const queue = this.queues.get(sessionId);
    if (!queue || queue.length === 0) return 0;

    return queue.reduce((total, msg) => total + msg.delay, 0);
  }

  getQueueStatus(sessionId) {
    const queue = this.queues.get(sessionId) || [];
    return {
      queueLength: queue.length,
      processing: this.processing.get(sessionId) || false,
      estimatedDelay: this.calculateEstimatedDelay(sessionId)
    };
  }

  clearQueue(sessionId) {
    this.queues.set(sessionId, []);
    this.processing.set(sessionId, false);
    logger.info(`🗑️ Fila da sessão ${sessionId} limpa`);
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new MessageQueueService();