import mysql from 'mysql2/promise';
import { Pool as PgPool } from 'pg';
import logger from '../utils/logger.js';
import config from './env.js';

export default class Database {
    constructor() {
        if (Database.instance) {
            return Database.instance;
        }

        this.dbType = config.db_client || 'mysql';

        if (this.dbType === 'mysql') {
            this.pool = mysql.createPool({
                host: config.host || 'localhost',
                user: config.user || 'root',
                password: config.password || '',
                database: config.database || 'FlashApi',
                port: config.porta || 3306,
                waitForConnections: true,
                connectionLimit: config.connectionLimit || 10,
                queueLimit: config.queuelimit || 0
            });

            this.pool.on('connection', (connection) => {
                logger.debug(`Nova conexão MySQL estabelecida: ${connection.threadId}`);
            });

            this.pool.on('error', (err) => {
                logger.error('Erro no pool MySQL:', err);
            });

        } else if (this.dbType === 'postgres') {
            this.pool = new PgPool({
                host: config.host || 'localhost',
                user: config.user || 'postgres',
                password: config.password || '',
                database: config.database || 'FlashApi',
                port: config.porta || 5432,
                max: config.connectionLimit || 10,
                idleTimeoutMillis: 30000
            });

            this.pool.on('connect', (client) => {
                logger.debug('Nova conexão PostgreSQL estabelecida.');
            });

            this.pool.on('error', (err) => {
                logger.error('Erro no pool PostgreSQL:', err);
            });
        } else {
            throw new Error('Tipo de banco de dados não suportado.');
        }

        Database.instance = this;
    }

    adaptPlaceholders(sql, dbType) {
        if (dbType === 'postgres') {
            // Troca cada "?" por "$n"
            let i = 0;
            return sql.replace(/\?/g, () => `$${++i}`);
        }
        // Para mysql, retorna o sql original
        return sql;
    }

    async execute(sql, parameters = []) {

        sql = this.adaptPlaceholders(sql, this.dbType);

        let client;
        if (this.dbType === 'mysql') {
            try {
                client = await this.pool.getConnection();
                const [rows] = await client.execute(sql, parameters);
                return rows;
            } catch (err) {
                logger.error('Erro ao executar consulta MySQL:', err);
                throw err;
            } finally {
                if (client) client.release();
            }
        } else if (this.dbType === 'postgres') {
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
                logger.error('Erro ao executar consulta PostgreSQL:', err);
                throw err;
            } finally {
                if (client) client.release();
            }
        }
    }

    async runAdmin(sql) {
        let client;
        if (this.dbType === 'mysql') {
            try {
                client = await this.pool.getConnection();
                const [rows] = await client.query(sql);
                return rows;
            } catch (err) {
                logger.error('Erro ao executar comando administrativo MySQL:', err);
                throw err;
            } finally {
                if (client) client.release();
            }
        } else if (this.dbType === 'postgres') {
            try {
                client = await this.pool.connect();
                const res = await client.query(sql);
                return res.rows;
            } catch (err) {
                logger.error('Erro ao executar comando administrativo PostgreSQL:', err);
                throw err;
            } finally {
                if (client) client.release();
            }
        }
    }

    async getPoolStatus() {
        if (this.dbType === 'mysql') {
            const poolInternals = this.pool.pool || {};
            return {
                type: 'mysql',
                totalConnections: poolInternals._allConnections?.length || 0,
                freeConnections: poolInternals._freeConnections?.length || 0,
                acquiringConnections: poolInternals._acquiringConnections?.length || 0,
                connectionLimit: this.pool.config?.connectionLimit || 0
            };
        } else if (this.dbType === 'postgres') {
            return {
                type: 'postgres',
                totalConnections: this.pool.totalCount,
                idleConnections: this.pool.idleCount,
                waitingRequests: this.pool.waitingCount,
                connectionLimit: this.pool.options.max || 0
            };
        }
    }

    async close() {
        try {
            await this.pool.end();
            logger.info(`Pool de conexões ${this.dbType} encerrado.`);
            Database.instance = null;
        } catch (err) {
            logger.error(`Erro ao encerrar o pool de conexões ${this.dbType}:`, err);
        }
    }
}
