import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/env.js';
import logger from '../utils/logger.js';
import { execute } from '../config/database.js';

// Instância singleton do banco

class ApiKey {

  static async findByKey(key) {
    try {
      const { rows } = await execute(`SELECT * FROM sessao WHERE active = $1 AND apikey = $2`, [true, key]);
      return rows[0] || null;
    } catch (error) {
      logger.error('Erro ao buscar sessao: ', error)
      return false
    }
  }

  static async list() {
    try {
      const { rows } = await execute(`SELECT apikey, nome_sessao, active, created_at, updated_at FROM sessao ORDER BY created_at DESC`, []);
      return rows || [];
    } catch (error) {
      logger.error('Erro ao buscar sessao')
      return false
    }

  }

  static async deactivate(id) {
    try {
      const result = await execute('UPDATE api_keys SET active = $1, updated_at = CURRENT_TIMESTAMP WHERE apikey = $2', [false, id]);
      return result.rowCount > 0;
    } catch (error) {
      logger.error('Erro ao buscar desativar sessao');
      return false;
    }

  }

}

export default ApiKey;