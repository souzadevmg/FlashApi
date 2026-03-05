import pkg from 'https-proxy-agent';
const { HttpsProxyAgent } = pkg;
import { SocksProxyAgent } from 'socks-proxy-agent';

/**
 * Seleciona o agente de proxy com base no protocolo da URL.
 * @param {string} proxyUrl
 * @returns {HttpsProxyAgent|SocksProxyAgent}
 */
function selectProxyAgent(proxyUrl) {
  const url = new URL(proxyUrl);

  const PROXY_HTTP_PROTOCOL = 'http:';
  const PROXY_SOCKS_PROTOCOL = 'socks:';

  switch (url.protocol) {
    case PROXY_HTTP_PROTOCOL:
      return new HttpsProxyAgent(url);
    case PROXY_SOCKS_PROTOCOL:
      return new SocksProxyAgent(url);
    default:
      throw new Error(`Unsupported proxy protocol: ${url.protocol}`);
  }
}

/**
 * Cria o agente de proxy a partir de um objeto ou string.
 * @param {Object|string} proxy
 * @returns {HttpsProxyAgent|SocksProxyAgent}
 */
export function makeProxyAgent(proxy) {
  if (typeof proxy === 'string') {
    return selectProxyAgent(proxy);
  }

  const { host, password, port, protocol, username } = proxy;
  let proxyUrl = `${protocol}://${host}:${port}`;

  if (username && password) {
    proxyUrl = `${protocol}://${username}:${password}@${host}:${port}`;
  }

  return selectProxyAgent(proxyUrl);
}