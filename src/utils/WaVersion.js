import axios from "axios";

export const getversion = async () => {
  const ua = {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64; rv:100.0) Gecko/20100101 Firefox/100.0',
      'Sec-Fetch-Dest': 'script',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'same-origin',
      Referer: 'https://web.whatsapp.com/',
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.5',
    },
  };
  const baseURL = 'https://web.whatsapp.com';
  const response = await axios.get(`${baseURL}/sw.js`, ua);

  // Extrai a versão do client_revision
  const match = response.data.match(/client_revision\\":([\d\.]+),/);
  if (!match || !match[1]) {
    throw new Error("Não foi possível encontrar a versão do WhatsApp Web.");
  }

  const version = match[1];
  const waVersion = [2, 3000, parseInt(version)];
  return waVersion;
};