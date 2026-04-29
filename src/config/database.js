
import { Pool as PgPool } from "pg";
import logger from "../utils/logger.js";
import config from "./env.js";

export default class Database {
  constructor() {
    if (Database.instance) {
      return Database.instance;
    }

    this.pool = new PgPool({
      host: config.host || "localhost",
      user: config.user || "postgres",
      password: config.password || "",
      database: config.database || "FlashApi",
      port: config.porta || 5432,
      max: config.connectionLimit || 10, // Limite de conexões
      idleTimeoutMillis: 30000, // Tempo para fechar conexões ociosas
      connectionTimeoutMillis: 10000, // Tempo máximo para obter uma conexão
      keepAlive: true,
      query_timeout: 30000, //mata query travada
      statement_timeout: 30000, //evita travamento no banco
    });

    this.pool.on("connect", (client) => {
      logger.debug("Nova conexão PostgreSQL estabelecida.");
    });

    this.pool.on("error", (err) => {
      logger.error("Erro no pool PostgreSQL:", err);
    });

    Database.instance = this;
  }

  adaptPlaceholders(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  }

  async execute(sql, parameters = []) {
    sql = this.adaptPlaceholders(sql);

    let client;
    try {
      client = await this.pool.connect();
      const res = await client.query(sql, parameters);

      // Detecta comando de modificação (INSERT, UPDATE, DELETE)
      if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)) {
        return { affectedRows: res.rowCount || 0 };
      }

      // Para SELECT, retorna array como no MySQL
      return res.rows;
    } catch (err) {
      logger.error(err);
      logger.error("Erro ao executar consulta PostgreSQL:", err);
      throw err;
    } finally {
      if (client) client.release();
    }
  }

  async runAdmin(sql) {
    let client;
    try {
      client = await this.pool.connect();
      const res = await client.query(sql);
      return res.rows;
    } catch (err) {
      logger.error("Erro ao executar comando administrativo PostgreSQL:", err);
      throw err;
    } finally {
      if (client) client.release();
    }
  }

  async getPoolStatus() {
    return {
      type: "postgres",
      totalConnections: this.pool.totalCount,
      idleConnections: this.pool.idleCount,
      waitingRequests: this.pool.waitingCount,
      connectionLimit: this.pool.options.max || 0,
    };
  }

  async close() {
    try {
      await this.pool.end();
      logger.info(`Pool de conexões encerrado.`);
      Database.instance = null;
    } catch (err) {
      logger.error(`Erro ao encerrar o pool de conexões:`, err);
    }
  }
}
