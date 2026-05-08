import { BufferJSON } from "@whiskeysockets/baileys";
import config from "../config/env.js";
import BaileysService from "../services/BaileysService.js";
import logger from "../utils/logger.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { execute } from "../config/database.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Instância singleton do banco
let vezes = 0;
class Session {
  static async addsessao(dados) {
    const addsessao = await execute(
      "INSERT INTO sessao (apikey, nome_sessao, rejeitar_ligacoes, ignorar_grupos) VALUES ($1, $2, $3, $4)",
      [dados.uuid, dados.finalNomeSessao, 0, 1],
    );
    return addsessao.rowCount > 0;
  }

  static async findById(id) {
    const { rows } = await execute("SELECT * FROM sessao WHERE apikey = $1", [id]);
    return rows[0] || null;
  }

  static async findByName(nome_sessao) {
    const { rows } = await execute("SELECT * FROM sessao WHERE nome_sessao = $1", [nome_sessao]);
    return rows[0] || null;
  }

  static async findByApiKey() {
    const { rows } = await execute("SELECT * FROM sessao ORDER BY created_at DESC", []);
    return rows || [];
  }

  static async update(id, data) {
    const fields = [];
    const values = [];

    if (Object.prototype.hasOwnProperty.call(data, "status")) {
      values.push(data.status);
      fields.push(`status = $${values.length}`);
    }

    if (Object.prototype.hasOwnProperty.call(data, "qr_code")) {
      const qrValue = data.qr_code === "null" ? null : data.qr_code;
      values.push(qrValue);
      fields.push(`qrcode = $${values.length}`);
    }

    if (Object.prototype.hasOwnProperty.call(data, "phone_number")) {
      values.push(data.phone_number);
      fields.push(`numero = $${values.length}`);
    }

    if (Object.prototype.hasOwnProperty.call(data, "code")) {
      const codeValue = data.code === "null" ? null : data.code;
      values.push(codeValue);
      fields.push(`code = $${values.length}`);
    }

    fields.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);
    const upsessao = await execute(`UPDATE sessao SET ${fields.join(", ")} WHERE apikey = $${values.length}`, values);
    return upsessao.rowCount > 0;
  }

  static async delete(id, sessaodelete = true) {
    if (sessaodelete) {
      await execute(`DELETE FROM sessao WHERE apikey = $1`, [id]);
      await execute(`DELETE FROM wa_session_keys WHERE session_id = $1`, [id]);
    }

    await execute(`DELETE FROM chats WHERE sessao_id = $1`, [id]);
    await execute(`DELETE FROM contatos WHERE sessao_id = $1`, [id]);
    await execute(`DELETE FROM grupos WHERE sessao_id = $1`, [id]);
    await execute(`DELETE FROM mensagens WHERE sessao_id = $1`, [id]);
    await execute(`DELETE FROM proxy WHERE sessao_id = $1`, [id]);
    return true;
  }

  static async setProxy(session, proxy) {
    const { rows } = await execute(`SELECT sessao_id FROM proxy WHERE sessao_id = $1`, [session]);
    if (rows[0]?.sessao_id) {
      return await execute(
        `UPDATE proxy SET host = $1, port = $2, protocol = $3, username = $4, password = $5, active = $6 WHERE sessao_id = $7`,
        [proxy.host, proxy.port, proxy.protocol, proxy.username, proxy.password, proxy.active, session],
      );
    } else {
      return await execute(
        `INSERT INTO proxy (host, port, protocol, username, password, active, sessao_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [proxy.host, proxy.port, proxy.protocol, proxy.username, proxy.password, proxy.active, session],
      );
    }
  }

  static async getProxy(session) {
    const { rows } = await execute(`SELECT host, port, protocol, username, password, active FROM proxy WHERE sessao_id = $1`, [session]);
    return rows[0] || null;
  }

  // static async saveKeys(sessionId, upserts) {
  //   // vezes++
  //   // console.log("Salvando chaves para sessão:", sessionId, "vezes:", vezes, "total de dados:", Object.values(upserts || {}).reduce((sum, { ids }) => sum + (ids?.length || 0), 0));
  //   // return
  //   const keysToSave = [];

  //   for (const [type, data] of Object.entries(upserts || {})) {
  //     const ids = data?.ids || [];
  //     const values = data?.values || [];

  //     for (let i = 0; i < ids.length; i++) {
  //       keysToSave.push({
  //         sessionId,
  //         type,
  //         id: ids[i],
  //         value: values[i], // ideal: JSON/string já pronta
  //       });
  //     }
  //   }

  //   if (keysToSave.length === 0) return;

  //   const CHUNK_SIZE = 1000; // comece com 500-1000; ajuste conforme tempo/CPU
  //   for (let offset = 0; offset < keysToSave.length; offset += CHUNK_SIZE) {
  //     const chunk = keysToSave.slice(offset, offset + CHUNK_SIZE);

  //     // 5 colunas por registro
  //     const params = [];
  //     const valuesSql = chunk
  //       .map((k, idx) => {
  //         const base = idx * 4;
  //         // updated_at vai em CURRENT_TIMESTAMP, então não precisa param pra ele
  //         params.push(k.sessionId, k.type, k.id, k.value);
  //         return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, CURRENT_TIMESTAMP)`;
  //       })
  //       .join(",\n");

  //     const sql = `
  //     INSERT INTO wa_session_keys (
  //       session_id,
  //       key_type,
  //       key_id,
  //       value_json,
  //       updated_at
  //     )
  //     VALUES
  //     ${valuesSql}
  //     ON CONFLICT (session_id, key_type, key_id)
  //     DO UPDATE SET
  //       value_json = EXCLUDED.value_json,
  //       updated_at = CURRENT_TIMESTAMP
  //   `;

  //     await db.execute(sql, params);
  //   }
  // }

  // redis: seu client já existente
}

export default Session;
