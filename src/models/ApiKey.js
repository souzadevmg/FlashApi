import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import Database from '../config/database.js';
import config from '../config/env.js';
import logger from '../utils/logger.js';

// Instância singleton do banco
const db = new Database();

class ApiKey {

  static async findByKey(key) {
    try {
      const [getapikey] = await db.execute(`SELECT * FROM sessao WHERE active = ? AND apikey = ?`, [true, key]);
      return getapikey
    } catch (error) {
      logger.error('Erro ao buscar sessao: ', error)
      return false
    }
  }

  static async list() {
    try {
      const getapikeys = await db.execute(`SELECT apikey, nome_sessao, active, created_at, updated_at FROM sessao ORDER BY created_at DESC`, []);
      return getapikeys
    } catch (error) {
      logger.error('Erro ao buscar sessao')
      return false
    }

  }

  static async deactivate(id) {
    try {
      const desativarkey = await db.execute('UPDATE api_keys SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE apikey = ?', [false, id])
      return desativarkey.affectedRows > 0
    } catch (error) {
      logger.error('Erro ao buscar desativar sessao')
      return false
    }

  }

}

export default ApiKey;