const mysql = require('mysql2/promise');
const logger = require('../utils/logger');
const config = require('./env');

class Database {
    constructor() {
        if (Database.instance) {
            return Database.instance;
        }

        this.pool = mysql.createPool({
            host: config.host || 'localhost',
            user: config.user || 'root',
            password: config.password || '',
            database: config.database || 'FlashApi',
            waitForConnections: true,
            connectionLimit: config.connectionLimit || 10, // Reduzido para 10
            queueLimit: config.queuelimit || 0
        });

        // Log de eventos do pool
        this.pool.on('connection', (connection) => {
            logger.debug(`Nova conexão MySQL estabelecida: ${connection.threadId}`);
        });

        this.pool.on('error', (err) => {
            logger.error('Erro no pool MySQL:', err);
        });

        Database.instance = this;
    }

    async execute(sql, parameters = []) {
        let connection;
        try {
            connection = await this.pool.getConnection();
            const [rows] = await connection.execute(sql, parameters);
            return rows;
        } catch (err) {
            logger.error('Erro ao executar a consulta:', err);
            throw err; // Re-throw para que o erro seja tratado pelo chamador
        } finally {
            if (connection) {
                connection.release(); // Sempre liberar a conexão
            }
        }
    }
    
    async runAdmin(sql) {
        let connection;
        try {
            connection = await this.pool.getConnection();
            const [rows] = await connection.query(sql); // <- query, não execute
            return rows;
        } catch (err) {
            logger.error('Erro ao executar comando administrativo:', err);
            throw err;
        } finally {
            if (connection) connection.release();
        }
    }

    async getPoolStatus() {
        const poolInternals = this.pool.pool || {};
        return {
            totalConnections: poolInternals._allConnections?.length || 0,
            freeConnections: poolInternals._freeConnections?.length || 0,
            acquiringConnections: poolInternals._acquiringConnections?.length || 0,
            connectionLimit: this.pool.config?.connectionLimit || 0
        };
    }

    async close() {
        try {
            await this.pool.end();
            logger.info('Pool de conexões MySQL encerrado.');
            Database.instance = null;
        } catch (err) {
            logger.error('Erro ao encerrar o pool de conexões MySQL:', err);
        }
    }
}

// Singleton instance
Database.instance = null;

module.exports = Database;