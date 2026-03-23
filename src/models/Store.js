import Database from "../config/database.js";
import config from "../config/env.js";
import logger from "../utils/logger.js";
import Long from "long";

// Instância singleton do banco
const db = new Database();

class Store {
  // ===== MENSAGENS =====
  static async saveMessage(sessionId, messageData) {
    try {
      if (!messageData?.key?.id) {
        return false;
      }

      const MESSAGE_STATUSES = ["received", "sent", "delivered", "read"];
      const status = MESSAGE_STATUSES.includes(messageData.status)
        ? messageData.status
        : "received";

      const remoteJid = messageData.key.remoteJid || null;

      // Converter Long para número ou string
      const timestamp = messageData.messageTimestamp
        ? Long.isLong(messageData.messageTimestamp)
          ? messageData.messageTimestamp.toNumber()
          : messageData.messageTimestamp
        : Date.now();

      const fields = [
        "sessao_id",
        "mensagem_id",
        "remoteJid",
        "fromMe",
        "isgrupo",
        "participant",
        "tipo_mensagem",
        "conteudo_mensagem",
        "timestamp",
        "status",
      ];

      const values = [
        sessionId,
        messageData.key.id,
        remoteJid,
        messageData.key.fromMe ? 1 : 0,
        remoteJid && remoteJid.includes("@g.us") ? 1 : 0,
        messageData.key.participant || null,
        messageData.messageType || "unknown",
        JSON.stringify(messageData.message || {}),
        timestamp,
        status,
      ];

      let sql;
      if (db.dbType === "mysql") {
        sql = `
        INSERT INTO mensagens (
          sessao_id, mensagem_id, remoteJid, fromMe, isgrupo, 
          participant, tipo_mensagem, conteudo_mensagem, timestamp, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          remoteJid = VALUES(remoteJid),
          fromMe = VALUES(fromMe),
          isgrupo = VALUES(isgrupo),
          participant = VALUES(participant),
          tipo_mensagem = VALUES(tipo_mensagem),
          conteudo_mensagem = VALUES(conteudo_mensagem),
          timestamp = VALUES(timestamp),
          status = VALUES(status)
      `;
      } else {
        const pgFields = fields.map((_, i) => `$${i + 1}`).join(", ");
        sql = `
        INSERT INTO mensagens (
          ${fields.join(", ")}
        ) VALUES (${pgFields})
        ON CONFLICT (sessao_id, mensagem_id) DO UPDATE SET
          remoteJid = EXCLUDED.remoteJid,
          fromMe = EXCLUDED.fromMe,
          isgrupo = EXCLUDED.isgrupo,
          participant = EXCLUDED.participant,
          tipo_mensagem = EXCLUDED.tipo_mensagem,
          conteudo_mensagem = EXCLUDED.conteudo_mensagem,
          timestamp = EXCLUDED.timestamp,
          status = EXCLUDED.status
      `;
      }

      await db.execute(sql, values);
      return true;
    } catch (error) {
      logger.error("Erro ao salvar mensagem:", error);
      return false;
    }
  }

  static async getMessages(
    sessionId,
    remoteJid = null,
    limit = 50,
    offset = 0,
    mensagem_id = null,
  ) {
    try {
      let query = `SELECT * FROM mensagens  WHERE sessao_id = ?`;
      let params = [sessionId];

      if (remoteJid) {
        query += ` AND remoteJid = ?`;
        params.push(remoteJid);
      }
      if (mensagem_id) {
        query += ` AND mensagem_id = ?`;
        params.push(mensagem_id);
      }

      const parsedLimit = Number.isFinite(Number(limit))
        ? Math.max(1, Math.min(500, parseInt(limit, 10)))
        : 50;
      const parsedOffset = Number.isFinite(Number(offset))
        ? Math.max(0, parseInt(offset, 10))
        : 0;

      query += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
      params.push(parsedLimit, parsedOffset);

      const rows = await db.execute(query, params);
      return rows;
    } catch (error) {
      console.error("Erro ao buscar mensagens:", error);
      logger.error("Erro ao buscar mensagens:", error);
      return [];
    }
  }

  static async getMessagesvote(sessionId, key = null, mensagem_id = null) {
    try {
      // Garantir que limit seja um número inteiro

      let query = `SELECT * FROM mensagens  WHERE sessao_id = ?`;
      let params = [sessionId];

      if (key) {
        query += ` AND (remoteJid = ? OR remoteJid = ?)`;
        params.push(key.remoteJid, key.remoteJidAlt);
      }
      if (mensagem_id) {
        query += ` AND mensagem_id = ?`;
        params.push(mensagem_id);
      }

      query += ` ORDER BY timestamp`;

      const rows = await db.execute(query, params); // Linha 67 (ou 62 em outra versão)
      return rows;
    } catch (error) {
      console.error("Erro ao buscar mensagens:", error);
      logger.error("Erro ao buscar mensagens:", error);
      return [];
    }
  }

  // ===== CONTATOS =====
  static async saveContact(sessionId, contactData) {
    try {
      const isMySQL = db.dbType === "mysql";

      // Lista de campos
      const fields = [
        "sessao_id",
        "jid",
        "nome",
        "apelido",
        "nome_verificado",
        "url_imagem",
        "status_contato",
      ];

      const values = [
        sessionId,
        contactData.id,
        contactData.name || contactData.notify || null,
        contactData.notify || null,
        contactData.verifiedName || null,
        contactData.url_imagem || null,
        contactData.status || null,
      ];
      let sql;
      if (isMySQL) {
        sql = `
          INSERT INTO contatos (${fields.join(", ")})
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            nome = VALUES(nome),
            apelido = VALUES(apelido),
            nome_verificado = VALUES(nome_verificado),
            url_imagem = VALUES(url_imagem),
            status_contato = VALUES(status_contato),
            updated_at = CURRENT_TIMESTAMP
        `;
      } else {
        // Em Postgres, substitua ? por $1, $2, ...
        const pgFields = fields.map((_, i) => `$${i + 1}`).join(", ");
        sql = `
          INSERT INTO contatos (${fields.join(", ")})
          VALUES (${pgFields})
          ON CONFLICT (sessao_id, jid) DO UPDATE SET
            nome = EXCLUDED.nome,
            apelido = EXCLUDED.apelido,
            nome_verificado = EXCLUDED.nome_verificado,
            url_imagem = EXCLUDED.url_imagem,
            status_contato = EXCLUDED.status_contato,
            updated_at = CURRENT_TIMESTAMP
        `;
      }

      // Executa
      await db.execute(sql, values);
      return true;
    } catch (error) {
      logger.error("Erro ao salvar contato:", error);
      return false;
    }
  }

  static async updateContact(sessionId, jid, contactData) {
    try {
      const isMySQL = db.dbType === "mysql";

      const values = [
        contactData.nome || null,
        contactData.apelido || null,
        contactData.nome_verificado || null,
        contactData.url_imagem || null,
        sessionId,
        jid,
      ];

      let sql;

      if (isMySQL) {
        sql = `
        UPDATE contatos
        SET
          nome = ?,
          apelido = ?,
          nome_verificado = ?,
          url_imagem = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE sessao_id = ? AND jid = ?
      `;
      } else {
        sql = `
        UPDATE contatos
        SET
          nome = $1,
          apelido = $2,
          nome_verificado = $3,
          url_imagem = $4,
          updated_at = CURRENT_TIMESTAMP
        WHERE sessao_id = $5 AND jid = $6
      `;
      }

      await db.execute(sql, values);

      return true;
    } catch (error) {
      logger.error("Erro ao atualizar contato:", error);
      return false;
    }
  }

  static async getContacts(sessionId) {
    try {
      const contacts = await db.execute(
        `
        SELECT * FROM contatos WHERE sessao_id = ? ORDER BY nome ASC
      `,
        [sessionId],
      );
      return contacts;
    } catch (error) {
      logger.error("Erro ao buscar contatos:", error);
      return [];
    }
  }

  static async getContact(sessionId, jid) {
    try {
      const [contact] = await db.execute(
        `
        SELECT * FROM contatos WHERE sessao_id = ? AND jid = ?
      `,
        [sessionId, jid],
      );
      return contact || null;
    } catch (error) {
      logger.error("Erro ao buscar contato:", error);
      return null;
    }
  }

  // ===== CHATS =====
  static async saveChat(sessionId, chatData) {
    try {
      const isMySQL = db.dbType === "mysql";

      const fields = [
        "sessao_id",
        "jid",
        "nome",
        "eh_grupo",
        "mensagens_nao_lidas",
        "arquivado",
        "fixado",
        "silenciado_ate",
      ];

      const values = [
        sessionId,
        chatData.id,
        chatData.name || null,
        chatData.id.includes("@g.us") ? 1 : 0,
        chatData.unreadCount || 0,
        chatData.archived ? 1 : 0,
        chatData.pinned ? 1 : 0,
        chatData.muteEndTime || null,
      ];
      let sql;
      if (isMySQL) {
        sql = `
          INSERT INTO chats (
            ${fields.join(", ")}
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            nome = VALUES(nome),
            mensagens_nao_lidas = VALUES(mensagens_nao_lidas),
            ultima_mensagem = VALUES(ultima_mensagem),
            arquivado = VALUES(arquivado),
            fixado = VALUES(fixado),
            silenciado_ate = VALUES(silenciado_ate),
            updated_at = CURRENT_TIMESTAMP
        `;
      } else {
        // Postgres: $1, $2, ... placeholders
        const pgFields = fields.map((_, i) => `$${i + 1}`).join(", ");
        sql = `
          INSERT INTO chats (
            ${fields.join(", ")}
          ) VALUES (${pgFields})
          ON CONFLICT (sessao_id, jid) DO UPDATE SET
            nome = EXCLUDED.nome,
            mensagens_nao_lidas = EXCLUDED.mensagens_nao_lidas,
            ultima_mensagem = EXCLUDED.ultima_mensagem,
            arquivado = EXCLUDED.arquivado,
            fixado = EXCLUDED.fixado,
            silenciado_ate = EXCLUDED.silenciado_ate,
            updated_at = CURRENT_TIMESTAMP
        `;
      }

      await db.execute(sql, values);
      return true;
    } catch (error) {
      logger.error("Erro ao salvar chat:", error);
      return false;
    }
  }

  static async getChats(sessionId) {
    try {
      const chats = await db.execute(
        `
        SELECT * FROM chats WHERE sessao_id = ?`,
        [sessionId],
      );
      return chats;
    } catch (error) {
      logger.error("Erro ao buscar chats:", error);
      return [];
    }
  }

  // ===== GRUPOS =====
  static async saveGroup(sessionId, groupData) {
    try {
      const isMySQL = db.dbType === "mysql"; // ajuste conforme sua lógica de detecção

      const fields = [
        "sessao_id",
        "jid",
        "assunto",
        "dono_assunto",
        "data_assunto",
        "data_criacao",
        "dono_grupo",
        "descricao_grupo",
        "dono_descricao",
        "id_descricao",
        "restrito_mensagens",
        "apenas_admins",
        "tamanho_grupo",
        "participantes",
      ];

      const values = [
        sessionId,
        groupData.id,
        groupData.subject || null,
        groupData.subjectOwner || null,
        groupData.subjectTime || null,
        groupData.creation || null,
        groupData.owner || null,
        groupData.desc || null,
        groupData.descOwner || null,
        groupData.descId || null,
        groupData.restrict ? 1 : 0,
        groupData.announce ? 1 : 0,
        groupData.size || 0,
        JSON.stringify(groupData.participants || []),
      ];

      let sql;

      if (isMySQL) {
        sql = `
        INSERT INTO grupos (
          ${fields.join(", ")}
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          assunto = VALUES(assunto),
          dono_assunto = VALUES(dono_assunto),
          data_assunto = VALUES(data_assunto),
          dono_grupo = VALUES(dono_grupo),
          descricao_grupo = VALUES(descricao_grupo),
          dono_descricao = VALUES(dono_descricao),
          id_descricao = VALUES(id_descricao),
          restrito_mensagens = VALUES(restrito_mensagens),
          apenas_admins = VALUES(apenas_admins),
          tamanho_grupo = VALUES(tamanho_grupo),
          participantes = VALUES(participantes),
          updated_at = CURRENT_TIMESTAMP
      `;
      } else {
        const pgPlaceholders = fields.map((_, i) => `$${i + 1}`).join(", ");
        sql = `
        INSERT INTO grupos (
          ${fields.join(", ")}
        ) VALUES (${pgPlaceholders})
        ON CONFLICT (sessao_id, jid) DO UPDATE SET
          assunto = EXCLUDED.assunto,
          dono_assunto = EXCLUDED.dono_assunto,
          data_assunto = EXCLUDED.data_assunto,
          dono_grupo = EXCLUDED.dono_grupo,
          descricao_grupo = EXCLUDED.descricao_grupo,
          dono_descricao = EXCLUDED.dono_descricao,
          id_descricao = EXCLUDED.id_descricao,
          restrito_mensagens = EXCLUDED.restrito_mensagens,
          apenas_admins = EXCLUDED.apenas_admins,
          tamanho_grupo = EXCLUDED.tamanho_grupo,
          participantes = EXCLUDED.participantes,
          updated_at = CURRENT_TIMESTAMP
      `;
      }

      await db.execute(sql, values);
      return true;
    } catch (error) {
      logger.error("Erro ao salvar grupo:", error);
      return false;
    }
  }

  static async getGroups(sessionId) {
    try {
      const groups = await db.execute(
        `SELECT * FROM grupos WHERE sessao_id = ?`,
        [sessionId],
      );
      return groups;
    } catch (error) {
      logger.error("Erro ao buscar grupos:", error);
      return [];
    }
  }

  static async getGroup(sessionId, jid) {
    try {
      const [group] = await db.execute(
        `
        SELECT * FROM grupos WHERE sessao_id = ? AND jid = ?
      `,
        [sessionId, jid],
      );
      if (group) {
        group.restrito_mensagens = group.restrito_mensagens === 1;
        group.apenas_admins = group.apenas_admins === 1;
        group.participantes = group.participantes || "[]";
      }
      return group || null;
    } catch (error) {
      logger.error("Erro ao buscar grupo:", error);
      return null;
    }
  }

  // ===== CONFIGURAÇÕES DE SESSÃO =====
  static async saveSessionConfig(sessionId, configData) {
    try {
      await db.execute(
        `
        UPDATE sessao SET 
        webhook_url = ?,
        ignorar_grupos = ?,
        leitura_automatica = ?,
        rejeitar_ligacoes = ?,
        events = ?,
        webhook_status = ?,
        msg_rejectcalls = ?,
        updated_at = CURRENT_TIMESTAMP
        WHERE apikey = ?
      `,
        [
          configData.webhook_url || null,
          configData.ignorar_grupos ? 1 : 0,
          configData.leitura_automatica ? 1 : 0,
          configData.rejeitar_ligacoes ? 1 : 0,
          JSON.stringify(configData.events || {}),
          configData.webhook_status ? 1 : 0,
          configData.msg_rejectcalls,
          sessionId,
        ],
      );
      return true;
    } catch (error) {
      logger.error("Erro ao salvar configuração da sessão:", error);
      return false;
    }
  }

  static async getSessionConfig(sessionId) {
    try {
      const [sessionConfig] = await db.execute(
        `
        SELECT webhook_url, events, webhook_status, ignorar_grupos, leitura_automatica, rejeitar_ligacoes,
        msg_rejectcalls
        FROM sessao WHERE apikey = ?
      `,
        [sessionId],
      );
      if (sessionConfig) {
        return sessionConfig;
      }
      return null;
    } catch (error) {
      logger.error("Erro ao buscar configuração da sessão:", error);
      return null;
    }
  }

  // ===== ESTATÍSTICAS =====
  static async getSessionStats(sessionId) {
    try {
      const [messageStats] = await db.execute(
        `
      SELECT 
        COUNT(*) as total_mensagens,
        COUNT(CASE WHEN fromMe = TRUE THEN 1 END) as mensagens_enviadas,
        COUNT(CASE WHEN fromMe = FALSE THEN 1 END) as mensagens_recebidas
      FROM mensagens WHERE sessao_id = ?
    `,
        [sessionId],
      );

      const [contactStats] = await db.execute(
        `
      SELECT COUNT(*) as total_contatos FROM contatos WHERE sessao_id = ?
    `,
        [sessionId],
      );

      const [chatStats] = await db.execute(
        `
      SELECT 
        COUNT(*) as total_chats,
        COUNT(CASE WHEN eh_grupo = TRUE THEN 1 END) as chats_grupo,
        COUNT(CASE WHEN eh_grupo = FALSE THEN 1 END) as chats_privados
      FROM chats WHERE sessao_id = ?
    `,
        [sessionId],
      );

      const [groupStats] = await db.execute(
        `
      SELECT COUNT(*) as total_grupos FROM grupos WHERE sessao_id = ?
    `,
        [sessionId],
      );

      return {
        mensagens: messageStats || {
          total_mensagens: 0,
          mensagens_enviadas: 0,
          mensagens_recebidas: 0,
        },
        contatos: contactStats || { total_contatos: 0 },
        chats: chatStats || {
          total_chats: 0,
          chats_grupo: 0,
          chats_privados: 0,
        },
        grupos: groupStats || { total_grupos: 0 },
      };
    } catch (error) {
      logger.error("Erro ao buscar estatísticas da sessão:", error);
      return {
        mensagens: {
          total_mensagens: 0,
          mensagens_enviadas: 0,
          mensagens_recebidas: 0,
        },
        contatos: { total_contatos: 0 },
        chats: { total_chats: 0, chats_grupo: 0, chats_privados: 0 },
        grupos: { total_grupos: 0 },
      };
    }
  }

  // ===== UTILITÁRIOS =====
  static async getPoolStatus() {
    return await db.getPoolStatus();
  }
}

export default Store;
