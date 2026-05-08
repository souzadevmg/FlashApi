import logger from "../utils/logger.js";
import { execute } from "./database.js";

async function columnExists(table, column) {
  try {
    const sql = `
            SELECT column_name FROM information_schema.columns
            WHERE table_name = $1 AND column_name = $2 AND table_schema = 'public'
        `;
    const result = await execute(sql, [table, column]);
    return result && result.rows.length > 0;
  } catch (error) {
    logger.error("Erro ao verificar existência da coluna:", error);
    return false;
  }
}

async function modifyTable() {
  // Deletar coluna creds em sessao
  try {
    const exists = await columnExists("sessao", "creds");
    if (exists) {
      try {
        await execute("ALTER TABLE sessao DROP COLUMN creds");

        logger.info('✅ Coluna "creds" removida com sucesso.');
      } catch (err) {
        logger.error('❌ Erro ao remover coluna "creds":', err);
        throw err;
      }
    }
  } catch (error) {
    logger.error("Erro ao remover coluna creds:", error);
  }

  // Deletar coluna keys_sessao em sessao
  try {
    const exists = await columnExists("sessao", "keys_sessao");
    if (exists) {
      try {
        await execute("ALTER TABLE sessao DROP COLUMN keys_sessao");

        logger.info('✅ Coluna "keys_sessao" removida com sucesso.');
      } catch (err) {
        logger.error('❌ Erro ao remover coluna "keys_sessao":', err);
        throw err;
      }
    }
  } catch (error) {
    logger.error("Erro ao remover coluna keys_sessao:", error);
  }

  // Criar coluna code em sessao
  try {
    const exists = await columnExists("sessao", "code");
    if (!exists) {
      await execute(`ALTER TABLE sessao ADD COLUMN code VARCHAR(50)`);
      logger.info('✅ Coluna "code" criada como VARCHAR(50).');
    }
  } catch (error) {
    logger.error("Erro ao criar coluna code:", error);
    logger.error(error);
  }

  try {
    const exists = await columnExists("proxy", "sessao_id");
    if (!exists) {
      await execute("ALTER TABLE proxy ADD COLUMN sessao_id VARCHAR(255)");
    }
  } catch (error) {
    logger.error("Erro ao criar coluna sessao_id:", error);
  }

  try {
    const exists = await columnExists("wa_session_keys", "key_type");
    if (exists) {
      await execute("ALTER TABLE wa_session_keys DROP COLUMN key_type");
    }
  } catch (error) {}

  try {
    const exists = await columnExists("wa_session_keys", "value_json");
    if (exists) {
      await execute(`
        ALTER TABLE wa_session_keys
        ALTER COLUMN value_json TYPE TEXT
        USING value_json::TEXT;`);
    }
  } catch (error) {}

  try {
    const exists = await columnExists("wa_session_keys", "id");
    if (!exists) {
      await execute("ALTER TABLE wa_session_keys ADD COLUMN id BIGINT GENERATED ALWAYS AS IDENTITY;");
    }
  } catch (error) {}

  try {
    // Remove duplicados antigos para permitir índice único no modelo sem key_type.
    await execute(`
      DELETE FROM wa_session_keys a
      USING wa_session_keys b
      WHERE a.ctid < b.ctid
        AND a.session_id = b.session_id
        AND a.key_id = b.key_id;
    `);

    await execute("CREATE UNIQUE INDEX IF NOT EXISTS unique_wa_session_keys_session_key ON wa_session_keys (session_id, key_id);");
  } catch (error) {
    logger.error("Erro ao criar índice único em wa_session_keys(session_id, key_id):", error);
  }

  try {
    const exists = await columnExists("proxy", "active");
    if (!exists) {
      await execute("ALTER TABLE proxy ADD COLUMN active BOOLEAN");
    }
  } catch (error) {}

  try {
    await execute("DROP TABLE IF EXISTS baileys_sessions;");
  } catch (error) {}

  try {
    await execute("CREATE UNIQUE INDEX IF NOT EXISTS unique_contato ON contatos (sessao_id, jid);");
  } catch (error) {
    if (error.code !== "42P07") {
      throw error; // só ignora se for duplicado
    }
  }
}

let initialized = false;

export async function initDatabase() {
  if (initialized) return;

  initialized = true;

  await modifyTable();
}

initDatabase();

export default modifyTable;
