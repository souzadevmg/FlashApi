
import { execute } from '../config/database.js';
import logger from '../utils/logger.js';

// Instância singleton do banco

class Chats {

  static async getMessages(key) {
    try {
      const { rows } = await execute(`SELECT * FROM mensagens WHERE sessao_id = $1`, [key]);
      return rows || [];
    } catch (error) {
      logger.error('Erro ao buscar mensagens: ', error)
      return []
    }
  }

  static async getMessage(key, id) {
    try {
      const { rows } = await execute(`SELECT * FROM mensagens WHERE sessao_id = $1 AND mensagem_id = $2`, [key, id]);
      return rows[0] || null;
    } catch (error) {
      logger.error('Erro ao buscar mensagem: ', error)
      return null
    }
  }

}

export default Chats;