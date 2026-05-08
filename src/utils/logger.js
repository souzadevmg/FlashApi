import pino from 'pino';
import moment from 'moment-timezone';

// Definir o fuso horário global
process.env.TZ = 'America/Sao_Paulo';

const loggerBase = pino({
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

function serializarErro(erro) {
  if (!erro) return { detalhe: 'erro-desconhecido' };

  if (erro instanceof Error) {
    const dadosErro = {
      nome: erro.name,
      mensagem: erro.message,
      stack: erro.stack,
    };

    // Preserva propriedades extras do erro (ex.: code, status, details).
    for (const [chave, valor] of Object.entries(erro)) {
      if (!(chave in dadosErro)) {
        dadosErro[chave] = valor;
      }
    }

    return dadosErro;
  }

  if (typeof erro === 'object') {
    return erro;
  }

  return { detalhe: String(erro) };
}

function normalizarExtras(extras) {
  const acumulado = {};

  for (const item of extras) {
    if (item == null) continue;

    if (item instanceof Error) {
      acumulado.erro = serializarErro(item);
      continue;
    }

    if (typeof item === 'object') {
      Object.assign(acumulado, item);
      continue;
    }

    if (!acumulado.detalhes) {
      acumulado.detalhes = [];
    }
    acumulado.detalhes.push(String(item));
  }

  if (Array.isArray(acumulado.detalhes)) {
    acumulado.detalhes = acumulado.detalhes.join(' | ');
  }

  return acumulado;
}

function criarMetodoLog(metodoBase) {
  return (...args) => {
    if (!args.length) {
      return metodoBase();
    }

    const [primeiro, ...resto] = args;

    if (!resto.length) {
      if (primeiro instanceof Error) {
        return metodoBase({ erro: serializarErro(primeiro) }, primeiro.message || 'Erro');
      }

      return metodoBase(primeiro);
    }

    if (typeof primeiro === 'string') {
      const extrasNormalizados = normalizarExtras(resto);
      return metodoBase(extrasNormalizados, primeiro);
    }

    if (typeof primeiro === 'object' && primeiro !== null) {
      const extrasNormalizados = normalizarExtras(resto);
      const msg = typeof resto[0] === 'string' ? resto[0] : undefined;

      if (msg) {
        return metodoBase({ ...primeiro, ...extrasNormalizados }, msg);
      }

      return metodoBase({ ...primeiro, ...extrasNormalizados });
    }

    return metodoBase({ detalhes: args.map((item) => String(item)).join(' | ') });
  };
}

const logger = Object.create(loggerBase);
logger.error = criarMetodoLog(loggerBase.error.bind(loggerBase));
logger.warn = criarMetodoLog(loggerBase.warn.bind(loggerBase));
logger.info = criarMetodoLog(loggerBase.info.bind(loggerBase));
logger.debug = criarMetodoLog(loggerBase.debug.bind(loggerBase));

export default logger;