import pino from 'pino';
import moment from 'moment-timezone';

// Definir o fuso horário global
process.env.TZ = 'America/Sao_Paulo';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: moment().tz(`${process.env.TZ}`).format('YYYY-MM-DD HH:mm:ss'),
      ignore: 'pid,hostname',
      hideIcons: true
    }
  }
});

export default logger;