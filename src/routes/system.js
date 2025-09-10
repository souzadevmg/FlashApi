const express = require('express');
const { authenticateGlobalApiKey } = require('../middleware/globalAuth');
const BaileysService = require('../services/BaileysService');
const GlobalWebhookService = require('../services/GlobalWebhookService');
const Store = require('../models/Store');
const config = require('../config/env');
const logger = require('../utils/logger');
const os = require('os');
const { statSync } = require('fs');
const { sep } = require('path');
const { execSync } = require('child_process');
const si = require('systeminformation');

const router = express.Router();

router.get('/status', authenticateGlobalApiKey, async (req, res) => {
  try {
    const sessionsStats = BaileysService.getSessionsStats();
    const sessions = Array.from(BaileysService.sessions.values()).map(s => ({
      id: s.id,
      status: s.status,
      user: s.user || null,
      lastActive: s.lastActive || null
    }));

    const webhookInfo = GlobalWebhookService.getWebhookInfo();
    const poolStatus = await Store.getPoolStatus();

    // Espaço em disco
    let diskInfo = {};
    try {
      const rootPath = os.platform() === 'win32' ? process.cwd().split(sep)[0] + sep : '/';
      const { total, free } = statSync(rootPath);
      // Fallback usando os.totalmem e os.freemem para info de RAM, mas para disco:
      let totalDisk = 0, freeDisk = 0;
      if (os.platform() === 'win32') {
        const drives = await si.fsSize();
        const drive = drives.find(d => d.mount.toLowerCase().startsWith(rootPath.toLowerCase()));
        if (drive) {
          freeDisk = drive.available;
          totalDisk = drive.size;
        }
        const lines = output.trim().split('\n').slice(1);
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length === 3 && parts[0].toLowerCase() === rootPath.replace(sep, '').toLowerCase()) {
        freeDisk = parseInt(parts[1]);
        totalDisk = parseInt(parts[2]);
        break;
          }
        }
      } else {
        const output = execSync(`df -k '${rootPath}'`).toString();
        const lines = output.trim().split('\n');
        if (lines.length > 1) {
          const parts = lines[1].split(/\s+/);
          totalDisk = parseInt(parts[1]) * 1024;
          freeDisk = parseInt(parts[3]) * 1024;
        }
      }
      diskInfo = {
        total: totalDisk,
        free: freeDisk,
        used: totalDisk - freeDisk,
        usagePercent: totalDisk ? (((totalDisk - freeDisk) / totalDisk) * 100).toFixed(2) : null
      };
    } catch (e) {
      diskInfo = { error: e.message };
    }

    res.json({
      success: true,
      data: {
        system: {
          status: 'online',
          hostname: os.hostname(),
          platform: os.platform(),
          arch: os.arch(),
          uptime: {
            seconds: process.uptime(),
            formatted: new Date(process.uptime() * 1000).toISOString().substr(11, 8)
          },
          memory: {
            process: process.memoryUsage(),
            total: os.totalmem(),
            free: os.freemem(),
            usagePercent: ((1 - os.freemem() / os.totalmem()) * 100).toFixed(2)
          },
          cpu: {
            cores: os.cpus().length,
            model: os.cpus()[0].model,
            loadavg: os.loadavg()
          },
          disk: diskInfo,
          node: {
            version: process.version,
            dependencies: Object.keys(require(require('path').join(__dirname, '../../package.json')).dependencies || {})
          },
          environment: config.nodeEnv,
          envVars: {
            NODE_ENV: process.env.NODE_ENV,
            PORT: process.env.PORT,
            // Adicione outras variáveis relevantes aqui
          }
        },
        sessions: {
          stats: sessionsStats,
          details: sessions
        },
        webhook: {
          global: webhookInfo,
          enabled: config.enableGlobalWebhook
        },
        websocket: {
          enabled: config.enableGlobalWebsocket,
          clients: 0 // Atualize conforme necessário
        },
        database: {
          mysql: poolStatus
        }
      }
    });
  } catch (error) {
    console.log(error)
    logger.error('Erro ao obter status do sistema:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

router.get('/config', authenticateGlobalApiKey, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        features: {
          globalWebhook: config.enableGlobalWebhook,
          globalWebsocket: config.enableGlobalWebsocket
        },
        limits: {
          rateLimitWindow: config.rateLimitWindowMs,
          rateLimitMax: config.rateLimitMaxRequests
        },
        environment: config.nodeEnv,
        version: '1.0.0'
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

router.post('/cleanup', authenticateGlobalApiKey, async (req, res) => {
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

module.exports = router;