import express from 'express';
import globalAuth from '../middleware/globalAuth.js';
import BaileysService from '../services/BaileysService.js';
import GlobalWebhookService from '../services/GlobalWebhookService.js';
import Store from '../models/Store.js';
import config from '../config/env.js';
import logger from '../utils/logger.js';
import os from 'os';
import si from 'systeminformation';

const router = express.Router();

router.get('/status', globalAuth.authenticateGlobalApiKey, async (req, res) => {
  try {
    const [
      sessionsStats,
      webhookInfo,
      poolStatus,
      redisSessions,
      cpuInfo,
      cpuLoad,
      memInfo,
      fsInfo,
      networkStats,
      osInfo,
      processesInfo,
      networkInterfaces,
      usersInfo,
      currentTime
    ] = await Promise.all([
      BaileysService.getSessionsStats(),
      GlobalWebhookService.getWebhookInfo(),
      Store.getPoolStatus(),
      BaileysService.redis.getAllSessions(),
      si.cpu().catch(() => null),
      si.currentLoad().catch(() => null),
      si.mem().catch(() => null),
      si.fsSize().catch(() => []),
      si.networkStats().catch(() => []),
      si.osInfo().catch(() => null),
      si.processes().catch(() => null),
      si.networkInterfaces().catch(() => []),
      si.users().catch(() => []),
      (async () => {
        try {
          return await si.time();
        } catch (error) {
          return null;
        }
      })()
    ]);

    const memoryUsage = process.memoryUsage();
    const cpuCount = os.cpus()?.length || 0;
    const totalRam = os.totalmem();
    const freeRam = os.freemem();
    const usedRam = totalRam - freeRam;

    const processMemory = {
      rss: memoryUsage.rss,
      heapTotal: memoryUsage.heapTotal,
      heapUsed: memoryUsage.heapUsed,
      external: memoryUsage.external,
      arrayBuffers: memoryUsage.arrayBuffers || 0
    };

    const processStats = {
      pid: process.pid,
      ppid: process.ppid,
      title: process.title,
      version: process.version,
      platform: process.platform,
      arch: process.arch,
      cwd: process.cwd(),
      uptime: process.uptime(),
      memory: processMemory,
      cpuUsage: process.cpuUsage(),
      resourceUsage: process.resourceUsage?.() || null
    };

    const runtime = {
      nodeVersion: process.version,
      v8Version: process.versions?.v8,
      uvVersion: process.versions?.uv,
      opensslVersion: process.versions?.openssl,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      now: new Date().toISOString(),
      bootTime: currentTime?.current ? new Date(currentTime.current - (os.uptime() * 1000)).toISOString() : null
    };

    const host = {
      hostname: os.hostname(),
      type: os.type(),
      release: os.release(),
      uptime: os.uptime(),
      cpuCount,
      loadAverage: os.loadavg(),
      memory: {
        total: totalRam,
        free: freeRam,
        used: usedRam,
        usagePercent: totalRam > 0 ? Number(((usedRam / totalRam) * 100).toFixed(2)) : 0
      },
      interfaces: networkInterfaces,
      activeUsers: usersInfo?.length || 0
    };

    const cpu = {
      manufacturer: cpuInfo?.manufacturer || null,
      brand: cpuInfo?.brand || null,
      cores: cpuInfo?.cores || cpuCount,
      physicalCores: cpuInfo?.physicalCores || null,
      speed: cpuInfo?.speed || null,
      load: {
        current: cpuLoad?.currentLoad || 0,
        user: cpuLoad?.currentLoadUser || 0,
        system: cpuLoad?.currentLoadSystem || 0,
        idle: cpuLoad ? Math.max(0, 100 - (cpuLoad.currentLoad || 0)) : null
      }
    };

    const memory = {
      system: {
        total: memInfo?.total || totalRam,
        free: memInfo?.free || freeRam,
        used: memInfo?.used || usedRam,
        active: memInfo?.active || null,
        available: memInfo?.available || null,
        swapTotal: memInfo?.swaptotal || null,
        swapUsed: memInfo?.swapused || null,
        usagePercent: memInfo?.total ? Number((((memInfo.used || 0) / memInfo.total) * 100).toFixed(2)) : host.memory.usagePercent
      },
      process: processMemory
    };

    const storage = {
      disks: Array.isArray(fsInfo)
        ? fsInfo.map((d) => ({
          fs: d.fs,
          mount: d.mount,
          type: d.type,
          total: d.size,
          used: d.used,
          available: d.available,
          use: d.use
        }))
        : []
    };

    const network = {
      stats: Array.isArray(networkStats)
        ? networkStats.map((n) => ({
          iface: n.iface,
          operstate: n.operstate,
          rxBytes: n.rx_bytes,
          txBytes: n.tx_bytes,
          rxDropped: n.rx_dropped,
          txDropped: n.tx_dropped,
          rxErrors: n.rx_errors,
          txErrors: n.tx_errors
        }))
        : [],
      interfaces: networkInterfaces
    };

    const services = {
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
      },
      redis: {
        connected: true,
        sessionsCached: redisSessions.length
      }
    };
    
    res.json({
      success: true,
      data: {
        system: {
          status: 'online',
          uptime: process.uptime(),
          memory: processMemory,
          version: config.apiversao,
          environment: config.nodeEnv,
          host,
          runtime,
          process: processStats,
          os: osInfo,
          cpu,
          memoryDetails: memory,
          storage,
          network,
          processes: {
            all: processesInfo?.all || null,
            running: processesInfo?.running || null,
            blocked: processesInfo?.blocked || null,
            sleeping: processesInfo?.sleeping || null,
            list: Array.isArray(processesInfo?.list) ? processesInfo.list.slice(0, 20) : []
          }
        },
        sessions: sessionsStats,
        webhook: services.webhook,
        websocket: services.websocket,
        database: services.database,
        redis: services.redis,
        services
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