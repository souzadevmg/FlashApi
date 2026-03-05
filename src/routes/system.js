import express from 'express';
import globalAuth from '../middleware/globalAuth.js';
import BaileysService from '../services/BaileysService.js';
import GlobalWebhookService from '../services/GlobalWebhookService.js';
import Store from '../models/Store.js';
import config from '../config/env.js';
import logger from '../utils/logger.js';
import os from 'os';
import { statSync } from 'fs';
import { sep } from 'path';
import { execSync } from 'child_process';
import si from 'systeminformation';

const router = express.Router();

router.get('/status', globalAuth.authenticateGlobalApiKey, async (req, res) => {
  try {
    const sessionsStats = BaileysService.getSessionsStats();  
    const webhookInfo = GlobalWebhookService.getWebhookInfo();
    const poolStatus = await Store.getPoolStatus();
    
    res.json({
      success: true,
      data: {
        system: {
          status: 'online',
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          version: config.apiversao,
          environment: config.nodeEnv
        },
        sessions: sessionsStats,
        webhook: {
          global: webhookInfo,
          enabled: config.enableGlobalWebhook
        },
        websocket: {
          enabled: config.enableGlobalWebsocket,
          clients: 0 // Will be updated by WebSocket service
        },
        database: {
          dados: poolStatus
        }
      }
    });
  } catch (error) {
    logger.error('Erro ao obter status do sistema:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

router.get('/config', globalAuth.authenticateGlobalApiKey, async (req, res) => {
  try {
    const sessoes = await BaileysService.redis.getAllSessions();
    res.json({
      success: true,
      data: {
        features: {
          globalWebhook: config.enableGlobalWebhook,
          globalWebsocket: config.enableGlobalWebsocket
        },
        version: config.apiversao,
        instacias: sessoes.length
      }
    });
  } catch (error) {
    logger.error('Erro ao obter configurações:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

router.post('/cleanup', globalAuth.authenticateGlobalApiKey, async (req, res) => {
  try {
    await BaileysService.cleanupSessions();
    
    res.json({
      success: true,
      message: 'Limpeza de sessões realizada com sucesso'
    });
    
    logger.info('Limpeza manual de sessões executada');
  } catch (error) {
    logger.error('Erro na limpeza de sessões:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Endpoint para forçar sincronização manual
router.post('/sync/:sessionId', globalAuth.authenticateGlobalApiKey, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { type } = req.body; // 'all', 'contacts', 'chats', 'groups'
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'SessionId é obrigatório'
      });
    }

    // Verificar se a sessão existe
    const session = await BaileysService.getSession(sessionId);
    if (!session || session.status !== 'connected') {
      return res.status(400).json({
        success: false,
        message: 'Sessão não encontrada ou não conectada'
      });
    }

    logger.info(`🔄 Iniciando sincronização manual para sessão ${sessionId}, tipo: ${type || 'all'}`);

    let result = {};
    
    switch (type) {
      case 'contacts':
        await BaileysService.forceSyncContacts(sessionId);
        result.contacts = 'sincronizado';
        break;
      case 'chats':
        await BaileysService.forceSyncChats(sessionId);
        result.chats = 'sincronizado';
        break;
      case 'groups':
        await BaileysService.forceSyncGroups(sessionId);
        result.groups = 'sincronizado';
        break;
      default:
        await BaileysService.forceSyncAll(sessionId);
        result = { contacts: 'sincronizado', chats: 'sincronizado', groups: 'sincronizado' };
    }
    
    res.json({
      success: true,
      message: 'Sincronização executada com sucesso',
      data: result
    });
    
    logger.info(`✅ Sincronização manual concluída para sessão ${sessionId}`);
  } catch (error) {
    logger.error('Erro na sincronização manual:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

export default router;