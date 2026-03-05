import ApiKey from '../models/ApiKey.js';
import logger from '../utils/logger.js';

const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['apikey'] || req.headers['ApiKey'] || req.headers['APIKEY']
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API Key é obrigatória'
      });
    }
    
    const keyData = await ApiKey.findByKey(apiKey);
    
    if (!keyData || !keyData.active) {
      return res.status(401).json({
        success: false,
        message: 'API Key inválida ou inativa'
      });
    }
    
    req.apiKey = keyData;
    next();
  } catch (error) {
    logger.error('Erro na autenticação:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno de autenticação'
    });
  }
};

export default authenticateApiKey;