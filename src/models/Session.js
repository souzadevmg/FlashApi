import Database from "../config/database.js";
import config from "../config/env.js";
import logger from "../utils/logger.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Instância singleton do banco
const db = new Database();

class Session {
  static async addsessao(dados) {
    const addsessao = await db.execute(
      "INSERT INTO sessao (apikey, nome_sessao, rejeitar_ligacoes, ignorar_grupos) VALUES (?, ?, ?, ?)",
      [dados.uuid, dados.finalNomeSessao, 0, 1],
    );
    return addsessao.affectedRows > 0;
  }

  static async findById(id) {
    const [getsessao] = await db.execute(
      "SELECT * FROM sessao WHERE apikey = ?",
      [id],
    );
    return getsessao;
  }

  static async findByName(nome_sessao) {
    const [getsessao] = await db.execute(
      "SELECT * FROM sessao WHERE nome_sessao = ?",
      [nome_sessao],
    );
    return getsessao;
  }

  static async findByApiKey() {
    const getsessoes = await db.execute(
      "SELECT * FROM sessao ORDER BY created_at DESC",
      [],
    );
    return getsessoes;
  }

  static async update(id, data) {
    const fields = [];
    const values = [];

    const status = data.status || null;
    const qr_code = data.qr_code || null;
    const phone_number = data.phone_number || null;
    const code = data.code || null;

    if (status) {
      fields.push("status = ?");
      values.push(status);
    }

    if (qr_code) {
      fields.push("qrcode = ?");
      values.push(qr_code == "null" ? null : qr_code);
    }

    if (phone_number) {
      fields.push("numero = ?");
      values.push(phone_number);
    }

    if (code) {
      fields.push("code = ?");
      values.push(code == "null" ? null : code);
    }

    fields.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);

    const upsessao = await db.execute(
      `UPDATE sessao SET ${fields.join(", ")} WHERE apikey = ?`,
      values,
    );
    return upsessao.affectedRows > 0;
  }

  static async delete(id, sessaodelete = true) {
    if (sessaodelete) {
      await db.execute(`DELETE FROM sessao WHERE apikey = ?`, [id]);
    }

    await db.execute(`DELETE FROM chats WHERE sessao_id = ?`, [id]);
    await db.execute(`DELETE FROM contatos WHERE sessao_id = ?`, [id]);
    await db.execute(`DELETE FROM grupos WHERE sessao_id = ?`, [id]);
    await db.execute(`DELETE FROM mensagens WHERE sessao_id = ?`, [id]);
    await db.execute(`DELETE FROM proxy WHERE sessao_id = ?`, [id]);
    await db.execute(`DELETE FROM proxy WHERE sessao_id = ?`, [id]);
    await db.execute(`DELETE FROM wa_sessions WHERE sessao_id = ?`, [id]);
    await db.execute(`DELETE FROM wa_session_keys WHERE sessao_id = ?`, [id]);
    return true;
  }

  static async setProxy(session, proxy) {
    const getProxy = await db.execute(
      `SELECT sessao_id FROM proxy WHERE sessao_id = ?`,
      [session],
    );
    if (getProxy[0]?.sessao_id) {
      return await db.execute(
        `UPDATE proxy SET host = ?, port = ?, protocol = ?, username = ?, password = ?, active = ? WHERE sessao_id = ? `,
        [
          proxy.host,
          proxy.port,
          proxy.protocol,
          proxy.username,
          proxy.password,
          proxy.active,
          session,
        ],
      );
    } else {
      return await db.execute(
        `INSERT INTO proxy (host, port, protocol, username, password, active, sessao_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          proxy.host,
          proxy.port,
          proxy.protocol,
          proxy.username,
          proxy.password,
          proxy.active,
          session,
        ],
      );
    }
  }

  static async getProxy(session) {
    const getProxy = await db.execute(
      `SELECT host, port, protocol, username, password, active FROM proxy WHERE sessao_id = ?`,
      [session],
    );
    return getProxy[0] || null;
  }
}

export default Session;
