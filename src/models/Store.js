import Database from "../config/database.js";
import config from "../config/env.js";
import logger from "../utils/logger.js";
import Long from "long";

// Instância singleton do banco
const db = new Database();

// Maps Baileys numeric proto status (0-5) to the allowed DB enum values
const BAILEYS_STATUS_MAP = {
  0: "received",  // ERROR / unknown
  1: "received",  // PENDING
  2: "sent",      // SERVER_ACK
  3: "delivered", // DELIVERY_ACK
  4: "read",      // READ
  5: "read",      // PLAYED
};
const VALID_STATUSES = new Set(["received", "sent", "delivered", "read"]);

function resolveMessageStatus(raw) {
  if (typeof raw === "number") return BAILEYS_STATUS_MAP[raw] ?? "received";
  if (typeof raw === "string" && VALID_STATUSES.has(raw)) return raw;
  return "received";
}

class Store {
  // ===== MENSAGENS =====
  static async saveMessage(sessionId, messageData) {
    try {
      if (!messageData?.key?.id) {
        return false;
      }

      const status = resolveMessageStatus(messageData.status);

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

      const pgFields = fields.map((_, i) => `$${i + 1}`).join(", ");
      const sql = `
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

      await db.execute(sql, values);
      return true;
    } catch (error) {
      logger.error("Erro ao salvar mensagem:", error);
      return false;
    }
  }

  static async saveMessagesBatch(sessionId, messages) {
    if (!messages?.length) return;
    console.log(
      `Salvando ${messages.length} mensagens para sessão ${sessionId}`,
    );
    try {
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
      const messagesFIltered = messages.filter((msg) => msg?.key?.remoteJid && !msg.key.remoteJid.includes("status@broadcast"));
      const values = messagesFIltered.map((message) => [
        sessionId,
        message.key.id,
        message.key.remoteJid || null,
        message.key.fromMe ? 1 : 0,
        message.key.remoteJid && message.key.remoteJid.includes("@g.us")
          ? 1
          : 0,
        message.key.participant || null,
        message.messageType || "unknown",
        JSON.stringify(message.message || {}),
        message.messageTimestamp
          ? Long.isLong(message.messageTimestamp)
            ? message.messageTimestamp.toNumber()
            : message.messageTimestamp
          : Date.now(),
        resolveMessageStatus(message.status),
      ]);
      const pgFields = fields.map((_, i) => `$${i + 1}`).join(", ");
      const placeholders = values
        .map(
          (_, i) =>
            `(${fields.map((_, j) => `$${i * fields.length + j + 1}`).join(", ")})`,
        )
        .join(", ");
      const sql = `
        INSERT INTO mensagens (
          ${fields.join(", ")}
        ) VALUES ${placeholders}
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
      const flatValues = values.flat();
      await db.execute(sql, flatValues);
    } catch (error) {
      logger.error("Erro ao salvar mensagens em lote:", error);
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

      const jid = Store.normalizeJid(contactData.id);

      const values = [
        sessionId,
        jid,
        contactData.name || null,
        contactData.notify || null,
        contactData.verifiedName || null,
        contactData.url_imagem || null,
        contactData.status || null,
      ];
      const pgFields = fields.map((_, i) => `$${i + 1}`).join(", ");
      const sql = `
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
      // Executa
      await db.execute(sql, values);
      return true;
    } catch (error) {
      logger.error("Erro ao salvar contato:", error);
      return false;
    }
  }

  static async saveContactsBatch(sessionId, contatos) {
    if (!contatos?.length) return;
    console.log(
      `Salvando ${contatos.length} contatos para sessão ${sessionId}`,
    );
    try {
      const fields = [
        "sessao_id",
        "jid",
        "nome",
        "apelido",
        "nome_verificado",
        "url_imagem",
        "status_contato",
      ];

      const values = [];
      const placeholders = [];

      contatos.forEach((contact, index) => {
        const baseIndex = index * fields.length;

        const jid = Store.normalizeJid(contact.id);

        values.push(
          sessionId,
          jid,
          contact.name || null,
          contact.notify || null,
          contact.verifiedName || null,
          contact.url_imagem || null,
          contact.status || null,
        );

        const place = fields.map((_, i) => `$${baseIndex + i + 1}`);
        placeholders.push(`(${place.join(", ")})`);
      });

      const sql = `
      INSERT INTO contatos (${fields.join(", ")})
      VALUES ${placeholders.join(", ")}
      ON CONFLICT (sessao_id, jid) DO UPDATE SET
        nome = EXCLUDED.nome,
        apelido = EXCLUDED.apelido,
        nome_verificado = EXCLUDED.nome_verificado,
        url_imagem = EXCLUDED.url_imagem,
        status_contato = EXCLUDED.status_contato,
        updated_at = CURRENT_TIMESTAMP
    `;

      await db.execute(sql, values);
    } catch (error) {
      logger.error("Erro ao salvar contatos em lote:", error);
    }
  }

  static normalizeJid(jid) {
    if (!jid) return null;

    // remove aspas
    jid = jid.replace(/"/g, "");

    // remove device (:22, :1, etc)
    jid = jid.split(":")[0];

    // garante formato padrão
    if (!jid.includes("@")) {
      jid = jid + "@s.whatsapp.net";
    }

    return jid;
  }

  static async updateContact(sessionId, jid, contactData) {
    try {
      const normalizedJid = Store.normalizeJid(jid);
      const values = [
        contactData.nome || null,
        contactData.apelido || null,
        contactData.nome_verificado || null,
        contactData.url_imagem || null,
        sessionId,
        normalizedJid,
      ];

      const sql = `
        UPDATE contatos
        SET
          nome = $1,
          apelido = $2,
          nome_verificado = $3,
          url_imagem = $4,
          updated_at = CURRENT_TIMESTAMP
        WHERE sessao_id = $5 AND jid = $6
      `;

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
      const normalizedJid = Store.normalizeJid(jid);
      const [contact] = await db.execute(
        `
        SELECT * FROM contatos WHERE sessao_id = ? AND jid = ?
      `,
        [sessionId, normalizedJid],
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

      chatData.id = chatData.id.replace(/"/g, "");
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
      const pgFields = fields.map((_, i) => `$${i + 1}`).join(", ");
      const sql = `
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
      await db.execute(sql, values);
      return true;
    } catch (error) {
      logger.error("Erro ao salvar chat:", error);
      return false;
    }
  }

  static async saveChatsBatch(sessionId, chats) {
    if (!chats?.length) return;
    try {
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
      const values = chats.map((chat) => [
        sessionId,
        chat.id.replace(/"/g, ""),
        chat.name || null,
        chat.id.includes("@g.us") ? 1 : 0,
        chat.unreadCount || 0,
        chat.archived ? 1 : 0,
        chat.pinned ? 1 : 0,
        chat.muteEndTime || null,
      ]);
      const pgFields = fields.map((_, i) => `$${i + 1}`).join(", ");
      const placeholders = values
        .map(
          (_, i) =>
            `(${fields.map((_, j) => `$${i * fields.length + j + 1}`).join(", ")})`,
        )
        .join(", ");
      const sql = `
        INSERT INTO chats (
          ${fields.join(", ")}
        ) VALUES ${placeholders}
        ON CONFLICT (sessao_id, jid) DO UPDATE SET
          nome = EXCLUDED.nome,
          mensagens_nao_lidas = EXCLUDED.mensagens_nao_lidas,
          ultima_mensagem = EXCLUDED.ultima_mensagem,
          arquivado = EXCLUDED.arquivado,
          fixado = EXCLUDED.fixado,
          silenciado_ate = EXCLUDED.silenciado_ate,
          updated_at = CURRENT_TIMESTAMP
      `;
      const flatValues = values.flat();
      await db.execute(sql, flatValues);
    } catch (error) {
      logger.error("Erro ao salvar chats em lote:", error);
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

      const pgPlaceholders = fields.map((_, i) => `$${i + 1}`).join(", ");
      const sql = `
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

  static async getjid(key_type, sessionId) {
    const result = await db.execute(
      `SELECT value_json, key_id FROM wa_session_keys WHERE key_type = ? AND session_id = ?`,
      [key_type, sessionId],
    );
    return result;
  }

  // ===== UTILITÁRIOS =====
  static async getPoolStatus() {
    return await db.getPoolStatus();
  }
}

export default Store;
