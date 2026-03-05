import Database from "../config/database.js";
import config from "../config/env.js";
import logger from "../utils/logger.js";
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Instância singleton do banco
const db = new Database();

class Session {

  static async addsessao(dados) {
    const addsessao = await db.execute('INSERT INTO sessao (apikey, nome_sessao, rejeitar_ligacoes, ignorar_grupos) VALUES (?, ?, ?, ?)', [dados.uuid, dados.finalNomeSessao, 0, 1]);
    return addsessao.affectedRows > 0
  }

  static async findById(id) {
    const [getsessao] = await db.execute('SELECT * FROM sessao WHERE apikey = ?', [id])
    return getsessao
  }

  static async findByName(nome_sessao) {
    const [getsessao] = await db.execute('SELECT * FROM sessao WHERE nome_sessao = ?', [nome_sessao])
    return getsessao
  }

  static async findByApiKey() {
    const getsessoes = await db.execute('SELECT * FROM sessao ORDER BY created_at DESC', [])
    return getsessoes

  }

  static async update(id, data) {
    const fields = [];
    const values = [];

    const status = data.status || null
    const qr_code = data.qr_code || null
    const phone_number = data.phone_number || null
    const code = data.code || null

    if (status) {
      fields.push('status = ?');
      values.push(status);
    }

    if (qr_code) {
      fields.push('qrcode = ?');
      values.push(qr_code == 'null' ? null : qr_code);
    }

    if (phone_number) {
      fields.push('numero = ?');
      values.push(phone_number);
    }

    if (code) {
      fields.push('code = ?');
      values.push(code == 'null' ? null : code);
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const upsessao = await db.execute(`UPDATE sessao SET ${fields.join(', ')} WHERE apikey = ?`, values)
    return upsessao.affectedRows > 0
  }

  static async getCreds(id) {
    const [getcreds] = await db.execute('SELECT * FROM baileys_sessions WHERE id = ?', [id])
    return getcreds
  }

  static async saveCreds(id, auth) {
    const isPostgres = process.env.DB_TYPE === 'postgres';
    const query = isPostgres
      ? `INSERT INTO baileys_sessions (id, auth)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE
       SET auth = EXCLUDED.auth, updated_at = CURRENT_TIMESTAMP`
      : `INSERT INTO baileys_sessions (id, auth)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE auth = VALUES(auth), updated_at = CURRENT_TIMESTAMP`;

    const params = [id, auth];

    return db.execute(query, params);

  }

  static async deleteCreds(id) {
    return db.execute(
      `DELETE FROM baileys_sessions WHERE id = ?`,
      [id]
    )
  }

  static async delete(id, sessaodelete = true) {
    if (sessaodelete) {
      await db.execute(`DELETE FROM sessao WHERE apikey = ?`, [id])
    }
    try {
      
      const dir = path.join(__dirname, "..", "..", "sessions", id);
      await fs.rm(dir, {
            recursive: true,
            force: true
          });
    } catch (err) {
      console.error("Erro ao remover sessão:", err);
    }

    await db.execute(`DELETE FROM chats WHERE sessao_id = ?`, [id])
    await db.execute(`DELETE FROM contatos WHERE sessao_id = ?`, [id])
    await db.execute(`DELETE FROM grupos WHERE sessao_id = ?`, [id])
    await db.execute(`DELETE FROM mensagens WHERE sessao_id = ?`, [id])
    return true
  }

  static async limparBinlogs() {
    try {
      // Pega o último binlog
      if (config.db_client == 'mysql') {
        await db.runAdmin("PURGE BINARY LOGS BEFORE NOW();");
        logger.info('Limpeza de logs concluida')
      } else {
        logger.info('Usando postgres ignorando limpeza de logs')
      }
    } catch (err) {
      logger.error("Erro ao limpar binlogs:", err)
      // console.error("Erro ao limpar binlogs:", err);
    }
  }

}

export default Session;