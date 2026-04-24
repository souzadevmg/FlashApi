import dotenv from 'dotenv';
import { resolve } from 'path';
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { fileURLToPath } from 'url';
import logger from './src/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: resolve('.env')});
const dbType = process.env.DB_TYPE || 'mysql';

async function checkAndInitDatabase() {
  const {
    DB_HOST,
    DB_PORT,
    DB_USER,
    DB_PASSWORD,
    DB_DATABASE
  } = process.env;

  if (!DB_HOST || !DB_USER || !DB_DATABASE) {
    console.error('⚠️ Variáveis de ambiente do banco obrigatórias faltando!');
    process.exit(1);
  }

  let connection;
  try {
    if (dbType === 'mysql') {
      // MySQL
      connection = await mysql.createConnection({
        host: DB_HOST,
        port: DB_PORT || 3306,
        user: DB_USER,
        password: DB_PASSWORD,
        multipleStatements: true
      });

      // Verifica se o database existe
      const [rows] = await connection.query('SHOW DATABASES LIKE ?', [DB_DATABASE]);
      if (rows.length === 0) {
        await connection.query(`CREATE DATABASE \`${DB_DATABASE}\``);
      }

      await connection.changeUser({ database: DB_DATABASE });

      // Lê e executa arquivo SQL
      const sqlFilePath = path.resolve(__dirname, 'supabase/migrations/database.sql');
      const sql = fs.readFileSync(sqlFilePath, 'utf8');
      await connection.query(sql);

    } else if (dbType === 'postgres') {
      // PostgreSQL
      // Conecta ao banco padrão
      let client = new Client({
        host: DB_HOST,
        port: DB_PORT || 5432,
        user: DB_USER,
        password: DB_PASSWORD,
        database: 'postgres'
      });

      await client.connect();

      // Verifica se o database existe
      const res = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_DATABASE]);
      if (res.rows.length === 0) {
        await client.query(`CREATE DATABASE "${DB_DATABASE}"`);
        logger.info(`Banco "${DB_DATABASE}" criado.`);
      } else {
        logger.info(`Banco "${DB_DATABASE}" já existe.`);
      }

      await client.end();

      // Agora conecta ao DB certo para rodar o script
      client = new Client({
        host: DB_HOST,
        port: DB_PORT || 5432,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_DATABASE
      });
      await client.connect();

      const sqlFilePath = path.resolve(__dirname, 'supabase/migrations/postgres.sql');
      const sql = fs.readFileSync(sqlFilePath, 'utf8');
      await client.query(sql);

      await client.end();
    } else {
      throw new Error('DB_TYPE não suportado! Use "mysql" ou "postgres".');
    }

    logger.info('Script SQL executado com sucesso! Banco pronto para uso.');
  } catch (error) {
    console.log(error)
    logger.error('Erro ao preparar o banco:');
  } finally {
    if (connection && dbType === 'mysql') await connection.end();
  }
}

checkAndInitDatabase();