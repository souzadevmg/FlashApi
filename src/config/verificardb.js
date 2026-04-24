import logger from "../utils/logger.js";
import Database from "./database.js";

const db = new Database();

async function columnExists(table, column) {
  const sql = `
            SELECT column_name FROM information_schema.columns
            WHERE table_name = $1 AND column_name = $2 AND table_schema = 'public'
        `;
  const result = await db.execute(sql, [table, column]);
  return result && result.length > 0;
}

async function modifyTable() {
  // Deletar coluna creds em sessao
  try {
    const exists = await columnExists("sessao", "creds");
    if (exists) {
      try {
        await db.execute("ALTER TABLE sessao DROP creds");

        logger.info('✅ Coluna "creds" removida com sucesso.');
      } catch (err) {
        logger.error('❌ Erro ao remover coluna "creds":', err);
        throw err;
      }
    }
  } catch (error) {
    logger.error("Erro ao criar coluna creds:", error);
  }

  // Deletar coluna keys_sessao em sessao
  try {
    const exists = await columnExists("sessao", "keys_sessao");
    if (exists) {
      try {
        await db.execute("ALTER TABLE sessao DROP COLUMN keys_sessao");

        logger.info('✅ Coluna "keys_sessao" removida com sucesso.');
      } catch (err) {
        logger.error('❌ Erro ao remover coluna "keys_sessao":', err);
        throw err;
      }
    }
  } catch (error) {
    logger.error("Erro ao criar coluna creds:", error);
  }

  // Criar coluna code em sessao
  try {
    const exists = await columnExists("sessao", "code");
    if (!exists) {
      await db.execute(`ALTER TABLE sessao ADD COLUMN code VARCHAR(50)`);
      logger.info('✅ Coluna "code" criada como VARCHAR(50).');
    }
  } catch (error) {
    logger.error("Erro ao criar coluna code:", error);
    logger.error(error);
  }

  try {
    const exists = await columnExists("proxy", "sessao_id");
    if (!exists) {
      await db.execute("ALTER TABLE proxy ADD COLUMN sessao_id VARCHAR(255)");
    }
  } catch (error) {}

  try {
    const exists = await columnExists("proxy", "active");
    if (!exists) {
      await db.execute("ALTER TABLE proxy ADD COLUMN active BOOLEAN");
    }
  } catch (error) {}
}

modifyTable();

export default modifyTable;
