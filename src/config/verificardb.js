import logger from "../utils/logger.js";
import { execute } from "./database.js";
import config from "./env.js";

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

  //Mudar banco de dados para Timezone correto
  try {
    await execute(`ALTER DATABASE "${config.database}" SET timezone TO '${config.timeZone}';`)
  } catch (error) {

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
