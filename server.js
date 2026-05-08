process.on('uncaughtException', (err) => {
  console.error('❌ Erro global:', err.message);

  if (err.stack) {
    const lines = err.stack.split('\n');
    console.error('📍 Origem provável:', lines);
  }
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Rejeição não tratada (unhandledRejection):', reason);
});

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerJsDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import http from 'http';
import { WebSocketServer } from 'ws';
import fs from 'fs';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import redis from './src/services/redis.js';

import config from './src/config/env.js';
import swaggerOptions from './src/config/swagger.js';
import GlobalWebSocketService from './src/services/GlobalWebSocketService.js';

import logger from './src/utils/logger.js';

// Import routes
import sessionRoutes from './src/routes/session.js';
import chatRoutes from './src/routes/chat.js';
import contactRoutes from './src/routes/contact.js';
import groupRoutes from './src/routes/group.js';
import configRoutes from './src/routes/config.js';
import systemRoutes from './src/routes/system.js';
import managerRoutes from './src/routes/manager.js';
import { execSync } from 'child_process';
import modifyTable from './src/config/verificardb.js';
import BaileysService from './src/services/BaileysService.js';
import Session from './src/models/Session.js';
import { startMultiQueueWorker } from './src/utils/multiWorker.js';

// Gerar arquivo swagger completo
fs.writeFileSync('swagger_full.json', JSON.stringify(swaggerOptions.definition, null, 2));
logger.info('Arquivo swagger_full.json gerado com sucesso');

try {
  // Executar o comando para converter para Postman
  execSync('openapi2postmanv2 -s swagger_full.json -o postman_collection.json -p', { stdio: 'inherit' });
  logger.info('Arquivo postman_collection.json gerado com sucesso');
} catch (error) {
  logger.error('Erro ao gerar coleção Postman:', error);
}

const app = express();

const server = http.createServer(app);
const PORT = config.port;


const allowedOrigins = config.origins;

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
};

// Middleware
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Adapter: connect-redis v8 uses redis v4 API ({ EX: n }), ioredis uses positional args
const ioredisAdapter = {
  get:    (key)            => redis.client.get(key),
  set:    (key, val, opts) => opts?.EX ? redis.client.set(key, val, 'EX', opts.EX) : redis.client.set(key, val),
  del:    (key)            => redis.client.del(key),
  expire: (key, ttl)       => redis.client.expire(key, ttl),
  mget:   (...keys)        => redis.client.mget(...keys),
};

//Sistema de sessão (persistida no Redis)
app.use(session({
  store: new RedisStore({ client: ioredisAdapter }),
  secret: config.manager_secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: config.protocol == 'https' ? true : false,
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 dias
  }
}));

// Swagger documentation
const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Routes
app.use('/api/session', sessionRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/group', groupRoutes);
app.use('/api/config', configRoutes);
app.use('/api/system', systemRoutes);
app.use('/manager', managerRoutes);

// WebSocket server
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 200 * 1024 * 1024 });
const globalWebSocketService = new GlobalWebSocketService(wss);

// Connect BaileysService with GlobalWebSocketService
BaileysService.setGlobalWebSocketService(globalWebSocketService); 

// Global error handler
app.use((err, req, res, next) => {
  logger.error(err);
  logger.error('Global error:', err);
  res.status(500).json({
    success: false,
    message: 'Erro interno do servidor',
    error: config.isDevelopment ? err.message : undefined
  });
});

app.get('/', (req, res) => {
  return res.redirect('/manager/login');
});


// Initialize database and start server
async function startServer() {
  try {
    logger.info('✅ Iniciando Flash API - WhatsApp Multi-Session');
    // Initialize BaileysService and restore sessions
    startMultiQueueWorker();
    BaileysService.initialize();

    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Flash API rodando na porta ${PORT}`);
      logger.info(`📚 Documentação: http://localhost:${PORT}/api-docs`);

      if (config.enableGlobalWebsocket) {
        logger.info(`🔗 WebSocket Global: ws://localhost:${PORT}`);
      } else {
        logger.info(`🔗 WebSocket Global: DESABILITADO`);
      }

      if (config.enableGlobalWebhook) {
        logger.info(`📡 Webhook Global: HABILITADO (${config.globalWebhookUrl || 'URL não configurada'})`);
      } else {
        logger.info(`📡 Webhook Global: DESABILITADO`);
      }

      logger.info(`🔑 API Key Global: ${config.globalApiKey.substring(0, 10)}...`);

      const stats = BaileysService.getSessionsStats();
      logger.info(`📱 Sessões ativas: ${stats.connected} conectadas, ${stats.connecting} conectando, ${stats.total} total`);

      logger.info('🎯 Recursos disponíveis:');
      logger.info('   📤 Envio de mensagens (texto, imagem, vídeo, áudio, documento, localização, enquete)');
      logger.info('   👥 Gerenciamento de grupos (criar, adicionar/remover participantes, promover/rebaixar)');
      logger.info('   📞 Gerenciamento de contatos (verificar, bloquear/desbloquear)');
      logger.info('   ⚙️  Configurações de sessão (webhook, auto-reply, auto-read, ignorar grupos)');
      logger.info('   📊 Fila de mensagens com delay personalizado');
      logger.info('   💾 Store persistente MySQL para mensagens, contatos, chats e grupos');
      logger.info('   🔄 Reconexão automática e health check');

    });
  } catch (error) {
    logger.error(error);
    logger.error('❌ Erro ao iniciar servidor:');
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM recebido, encerrando servidor...');
  server.close(() => {
    logger.info('Servidor encerrado');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT recebido, encerrando servidor...');
  process.exit(0);
});


startServer();

export default { app, server, wss };