import pg from "pg";
const { Pool } = pg;
import logger from "../utils/logger.js";
import config from "./env.js";

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const dbConfig = {
  host: config.host || "localhost",
  user: config.user || "postgres",
  password: config.password || "",
  database: config.database || "FlashApi",
  port: toPositiveInt(config.porta, 5432),
  max: toPositiveInt(config.connectionLimit, 10),
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
  keepAlive: true,
  query_timeout: 20000,
  statement_timeout: 20000,
};

const pool = new Pool(dbConfig);
let dbConnection = null;

pool.on("connect", () => {
  logger.debug("Nova conexão PostgreSQL estabelecida.");
});

pool.on("error", (error) => {
  logger.error("Erro no pool PostgreSQL:", error);
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableError = (error) => {
  if (!error) return false;
  return (
    error.code === "ECONNRESET" ||
    error.code === "ETIMEDOUT" ||
    error.code === "EPIPE" ||
    error.code === "53300" || // too_many_connections
    String(error.message || "").toLowerCase().includes("timeout") ||
    String(error.message || "").includes("Connection terminated")
  );
};

export async function getDbConnection() {
  if (!dbConnection) {
    // Valida a conexão inicial para falhar cedo em boot quebrado.
    const client = await pool.connect();
    client.release();
    dbConnection = pool;
  }

  return dbConnection;
}

export async function getDbClient() {
  const db = await getDbConnection();
  return db.connect();
}

export async function execute(query, params = [], options = {}) {
  const {
    retries = 2,
    retryDelayMs = 150,
    slowQueryThreshold = 1000,
    overloadLimit = toPositiveInt(config.queuelimit, 500),
  } = options;

  const db = await getDbConnection();

  if (overloadLimit > 0 && db.waitingCount > overloadLimit) {
    const overloadError = new Error("Banco sobrecarregado, tente novamente.");
    logger.warn(
      {
        waiting: db.waitingCount,
        limit: overloadLimit,
      },
      overloadError.message,
    );
    throw overloadError;
  }

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const startedAt = Date.now();

    try {
      const result = await db.query(query, params);
      const duration = Date.now() - startedAt;

      if (duration > slowQueryThreshold) {
        logger.warn(
          {
            duration,
            rowCount: result.rowCount,
            pool: getPoolStatus(),
            query
          },
          "Query lenta detectada",
        );
      }

      return result;
    } catch (error) {
      if (attempt < retries && isRetryableError(error)) {
        const delay = retryDelayMs * (attempt + 1);
        logger.warn(
          {
            attempt: attempt + 1,
            delay,
            error: error.message,
          },
          "Retry de query",
        );
        await sleep(delay);
        continue;
      }

      logger.error(
        {
          error,
          query,
        },
        "Erro no banco",
      );
      throw error;
    }
  }
}

export function getPoolStatus() {
  return {
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingRequests: pool.waitingCount,
    connectionLimit: pool.options.max || 0,
  };
}
