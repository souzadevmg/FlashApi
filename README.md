<h1 align="center">Flash Api</h1>

<div align="center"><img src="./public/images/banner.jpg"></div>

<p align="center">
  API robusta para gerenciamento de múltiplas sessões do WhatsApp utilizando <b>Baileys</b>.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js&logoColor=white">
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white">
  <img src="https://img.shields.io/badge/Redis-7-DC382D?style=for-the-badge&logo=redis&logoColor=white">
  <img src="https://img.shields.io/badge/Docker-ready-2496ED?style=for-the-badge&logo=docker&logoColor=white">
</p>

---

## Índice

- [Funcionalidades](#-funcionalidades)
- [Requisitos](#-requisitos)
- [Instalação Manual](#-instalação-manual)
- [Instalação com Docker](#-instalação-com-docker)
- [Configuração do .env](#️-configuração-do-env)
- [Configurar SSL HTTPS](#-configurar-ssl-https)
- [Uso — Exemplos de Código](#-uso--exemplos-de-código)
- [WebSocket](#-websocket)
- [Webhooks](#-webhooks)
- [Endpoints](#-endpoints)
- [Painel de Controle](#-painel-de-controle)
- [Tecnologias](#-tecnologias)
- [Suporte e Comunidade](#-suporte-e-comunidade)

---

## ✨ Funcionalidades

- ✅ **Multi-Sessão** — Controle diversas instâncias do WhatsApp simultaneamente
- ✅ **Autenticação com API Key** — Segurança integrada com chave de acesso
- ✅ **Conexão via QR Code** — Fácil autenticação de dispositivos
- ✅ **Webhooks** — Receba notificações em tempo real
- ✅ **WebSocket** — Comunicação bidirecional em tempo real
- ✅ **Envio de Mensagens** — Texto, imagem, vídeo, áudio, documento, localização, enquete, botões, listas e mensagens interativas
- ✅ **Gestão de Contatos** — Consulta e gerenciamento de contatos
- ✅ **Gestão de Grupos** — Criação e administração de grupos
- ✅ **Persistência com PostgreSQL 16** — Banco de dados estruturado
- ✅ **Cache com Redis** — Sessões e filas em memória
- ✅ **Documentação Swagger e Postman** — Integração interativa
- ✅ **Suporte a Proxy** — Rotear conexões por proxy HTTP
- ✅ **Painel Web** — Interface visual para gerenciar sessões

---

## 📋 Requisitos

| Componente   | Versão mínima |
|--------------|--------------|
| Node.js      | 20+          |
| PostgreSQL   | 16           |
| Redis        | 7            |
| npm          | 9+           |

> Para usar com Docker, apenas **Docker** e **Docker Compose** são necessários.

---

## 🚀 Instalação Manual

### 1. Clone o repositório

```bash
git clone https://github.com/clsshbr2/FlashApi.git
cd FlashApi
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure o arquivo `.env`

```bash
cp .env.example .env
```

Edite o arquivo `.env` com suas configurações. Consulte a seção [Configuração do .env](#️-configuração-do-env).

### 4. Execute a migração do banco de dados

```bash
npm run migrate
```

> Isso executa `gerardb.js`, que conecta ao PostgreSQL e cria as tabelas automaticamente.

### 5. Inicie o servidor

```bash
# Iniciar diretamente
npm start

# Ou com PM2 (recomendado para produção)
npm install pm2 -g
pm2 start npm --name flashapi -- start
pm2 save
pm2 startup
```

### 6. Atualizar para a versão mais recente

```bash
git reset --hard
git pull origin main
npm install
npm run migrate
pm2 restart flashapi
```

---

## 🐳 Instalação com Docker

### Iniciar com Docker Compose (recomendado)

O `docker-compose.yml` já inclui PostgreSQL e a API pré-configurados.

```bash
# Subir todos os serviços
docker compose up -d

# Ver logs
docker compose logs -f flash-api

# Parar
docker compose down
```

> Por padrão, a API ficará disponível em `http://localhost:3000`.

### Variáveis de ambiente no Docker

Edite o bloco `environment` no `docker-compose.yml` ou crie um arquivo `.env` e referencie com `env_file: .env` no serviço `flash-api`.

---

## ⚙️ Configuração do .env

Copie `.env.example` para `.env` e ajuste os valores:

```env
# ─── Servidor ──────────────────────────────────────────────
HOST=http://localhost:3000
PORT=3000
NODE_ENV=production
LOG_LEVEL=info                  # fatal | error | warn | info | debug | trace
BAILEYS_LOG_LEVEL=error
PROTOCOLO=http                  # http | https
VERSAO=1.0.4
SYNC_SESSIONS=false

# ─── CORS ──────────────────────────────────────────────────
CORS_ORIGINS=*
# Para restringir: CORS_ORIGINS=https://meusite.com,http://localhost:3000

# ─── API Keys ──────────────────────────────────────────────
GLOBAL_API_KEY=TROQUE-POR-UMA-CHAVE-SEGURA

# ─── Manager (painel web) ──────────────────────────────────
MANAGER=true
CHAVE_SECRET_SESSION_MANAGER=TROQUE-POR-UMA-CHAVE-SEGURA

# ─── Webhook Global ────────────────────────────────────────
ENABLE_GLOBAL_WEBHOOK=false
GLOBAL_WEBHOOK_URL=https://seu-servidor.com/webhook
GLOBAL_WEBHOOK_SECRET=TROQUE-POR-UMA-CHAVE-SEGURA

# ─── WebSocket Global ──────────────────────────────────────
ENABLE_WEBSOCKET=true
GLOBAL_WEBSOCKET_SECRET=TROQUE-POR-UMA-CHAVE-SEGURA

# ─── Banco de Dados (PostgreSQL) ───────────────────────────
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=SUA_SENHA
DB_DATABASE=flashapi
DB_CONNECTION_LIMIT=10
QUEUELIMIT=0

# ─── Redis ─────────────────────────────────────────────────
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASS=

# ─── WhatsApp / Sessão ─────────────────────────────────────
SESSION_PHONE_CLIENT=Flash_api
SESSION_PHONE_NAME=Chrome       # Chrome | Firefox | Edge | Opera | Safari
LIMITE_QRCODE=10

# ─── Limpeza automática ────────────────────────────────────
DELETE_TEMP_MENSAGE=true
TEMP_MENSAGE=3600               # Segundos até deletar mensagens temporárias
DELETE_SESAO_DISCONECT=true
TEMP_DELETE_SESSAO=5            # Horas até deletar sessão desconectada

# ─── Fuso horário ──────────────────────────────────────────
TZ=America/Sao_Paulo

# ─── Proxy (opcional) ──────────────────────────────────────
PROXY_STATE=false
PROXY_HOST=127.0.0.1
PROXY_PORT=8080
PROXY_PROTOCOL=http
PROXY_USERNAME=usuario
PROXY_PASSWORD=senha
```

---

## 🔒 Configurar SSL (HTTPS)

Para habilitar HTTPS você tem duas opções: usar um **proxy reverso (Nginx/Caddy)** — recomendado — ou configurar certificados diretamente no servidor Node.js.

---

### Opção 1: Nginx como proxy reverso (recomendado)

Esta é a abordagem mais robusta para produção.

#### 1. Instale o Nginx e o Certbot

```bash
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx -y
```

#### 2. Crie o arquivo de configuração do Nginx

```bash
sudo nano /etc/nginx/sites-available/flashapi
```

Cole o conteúdo abaixo (substitua `seudominio.com`):

```nginx
server {
    listen 80;
    server_name seudominio.com www.seudominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

#### 3. Ative o site e recarregue o Nginx

```bash
sudo ln -s /etc/nginx/sites-available/flashapi /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 4. Obtenha o certificado SSL gratuito (Let's Encrypt)

```bash
sudo certbot --nginx -d seudominio.com -d www.seudominio.com
```

O Certbot atualiza automaticamente o arquivo do Nginx para HTTPS e configura a renovação automática.

#### 5. Atualize o `.env`

```env
HOST=https://seudominio.com
PROTOCOLO=https
```

---

### Opção 2: Certificado SSL diretamente no Node.js

Use quando não há Nginx disponível (ex: ambiente de teste com certificado próprio).

#### 1. Gere um certificado autoassinado (teste)

```bash
mkdir certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/key.pem \
  -out certs/cert.pem \
  -subj "/CN=localhost"
```

#### 2. Ajuste o `server.js` para carregar o certificado

```javascript
import https from 'https';
import fs from 'fs';
import app from './index.js';

const options = {
  key: fs.readFileSync('./certs/key.pem'),
  cert: fs.readFileSync('./certs/cert.pem'),
};

https.createServer(options, app).listen(3000, () => {
  console.log('Servidor HTTPS rodando na porta 3000');
});
```

#### 3. Atualize o `.env`

```env
HOST=https://localhost:3000
PROTOCOLO=https
```

---

### Renovação automática do certificado (Let's Encrypt)

O Certbot já configura um cronjob automático. Para verificar:

```bash
sudo certbot renew --dry-run
```

---

## 💻 Uso — Exemplos de Código

Todos os exemplos usam `axios`. Substitua `SUA_API_KEY` pela apikey da sessão (ou pela `GLOBAL_API_KEY`).

---

### Criar Sessão

```javascript
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const API_KEY = 'SUA_GLOBAL_API_KEY';

async function criarSessao() {
  const { data } = await axios.post(`${BASE_URL}/api/session/create_sessao`, {
    nome_sessao: 'minha-sessao',
    numero: '5521999999999',
    criar_sessao: true,
    gerar_qrcode: true,
    webhook_status: false,
    webhookUrl: '',
    events: ['message_received', 'connection_update']
  }, {
    headers: { 'Content-Type': 'application/json', apikey: API_KEY }
  });

  if (data.success) {
    console.log('Sessão criada!');
    console.log('Nome:   ', data.dados.name);
    console.log('ApiKey: ', data.dados.apikey);
    console.log('QRCode: ', data.dados.qrcode); // base64
  }
}

criarSessao().catch(console.error);
```

---

### Reconectar / Obter QR Code

```javascript
async function reconectar(apikeySessao) {
  const { data } = await axios.put(`${BASE_URL}/api/session/conectar_sessao`, {}, {
    headers: { apikey: apikeySessao }
  });

  if (data.success) {
    console.log('QR Code:', data.qrcode);
  } else {
    console.log('Sessão já conectada ou QR desnecessário.');
  }
}
```

---

### Verificar Status da Sessão

```javascript
async function status(apikeySessao) {
  const { data } = await axios.get(`${BASE_URL}/api/session/status`, {
    headers: { apikey: apikeySessao }
  });
  console.log('Status:', data);
}
```

---

### Enviar Mensagem de Texto

```javascript
async function enviarTexto(apikeySessao) {
  const { data } = await axios.post(`${BASE_URL}/api/chat/send-text`, {
    to: '5521999999999',
    text: 'Olá! 😄 Tudo bem?',
    linkPreview: false,
    delay: 1200,
    useQueue: false
  }, {
    headers: { 'Content-Type': 'application/json', apikey: apikeySessao }
  });

  console.log('Enviado:', data);
}
```

---

### Enviar Imagem

```javascript
async function enviarImagem(apikeySessao) {
  const { data } = await axios.post(`${BASE_URL}/api/chat/send-image`, {
    to: '5521999999999',
    image: 'https://exemplo.com/imagem.jpg', // URL ou base64
    caption: 'Veja esta imagem! 🖼️',
    delay: 1200
  }, {
    headers: { 'Content-Type': 'application/json', apikey: apikeySessao }
  });

  console.log('Imagem enviada:', data);
}
```

---

### Enviar Vídeo

```javascript
async function enviarVideo(apikeySessao) {
  const { data } = await axios.post(`${BASE_URL}/api/chat/send-video`, {
    to: '5521999999999',
    video: 'https://exemplo.com/video.mp4', // URL ou base64
    caption: 'Confira este vídeo! 🎬',
    delay: 1200
  }, {
    headers: { 'Content-Type': 'application/json', apikey: apikeySessao }
  });

  console.log('Vídeo enviado:', data);
}
```

---

### Enviar Áudio

```javascript
async function enviarAudio(apikeySessao) {
  const { data } = await axios.post(`${BASE_URL}/api/chat/send-audio`, {
    to: '5521999999999',
    audio: 'https://exemplo.com/audio.mp3', // URL ou base64
    ptt: true, // true = mensagem de voz (microfone), false = arquivo de áudio
    delay: 1200
  }, {
    headers: { 'Content-Type': 'application/json', apikey: apikeySessao }
  });

  console.log('Áudio enviado:', data);
}
```

---

### Enviar Documento

```javascript
async function enviarDocumento(apikeySessao) {
  const { data } = await axios.post(`${BASE_URL}/api/chat/send-document`, {
    to: '5521999999999',
    document: 'https://exemplo.com/arquivo.pdf', // URL ou base64
    fileName: 'contrato.pdf',
    caption: 'Segue o documento em anexo.',
    delay: 1200
  }, {
    headers: { 'Content-Type': 'application/json', apikey: apikeySessao }
  });

  console.log('Documento enviado:', data);
}
```

---

### Enviar Localização

```javascript
async function enviarLocalizacao(apikeySessao) {
  const { data } = await axios.post(`${BASE_URL}/api/chat/send-location`, {
    to: '5521999999999',
    latitude: -23.5505,
    longitude: -46.6333,
    name: 'São Paulo',
    address: 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP',
    delay: 1200
  }, {
    headers: { 'Content-Type': 'application/json', apikey: apikeySessao }
  });

  console.log('Localização enviada:', data);
}
```

---

### Enviar Enquete

```javascript
async function enviarEnquete(apikeySessao) {
  const { data } = await axios.post(`${BASE_URL}/api/chat/send-poll`, {
    to: '5521999999999',
    name: 'Qual é o seu framework favorito?',
    values: ['Express', 'Fastify', 'NestJS', 'Hapi'],
    selectableCount: 1, // 0 = múltipla escolha
    delay: 1200
  }, {
    headers: { 'Content-Type': 'application/json', apikey: apikeySessao }
  });

  console.log('Enquete enviada:', data);
}
```

---

### Enviar Botões

Envia uma mensagem com até 3 botões de resposta rápida.

```javascript
async function enviarBotoes(apikeySessao) {
  const { data } = await axios.post(`${BASE_URL}/api/chat/send-buttons`, {
    to: '5521999999999',
    text: 'Como podemos te ajudar hoje?',
    footer: 'Flash Api — Suporte',
    buttons: [
      { buttonId: 'btn1', buttonText: { displayText: '📦 Meu pedido' } },
      { buttonId: 'btn2', buttonText: { displayText: '💳 Pagamento' } },
      { buttonId: 'btn3', buttonText: { displayText: '🙋 Falar com atendente' } }
    ],
    delay: 1200
  }, {
    headers: { 'Content-Type': 'application/json', apikey: apikeySessao }
  });

  console.log('Botões enviados:', data);
}
```

---

### Enviar Lista Interativa

Envia uma lista de opções organizadas em seções (menu interativo).

```javascript
async function enviarLista(apikeySessao) {
  const { data } = await axios.post(`${BASE_URL}/api/chat/send-list`, {
    to: '5521999999999',
    text: 'Escolha uma opção do nosso cardápio:',
    footer: 'Flash Api',
    title: 'Cardápio Digital',
    buttonText: 'Ver opções',
    sections: [
      {
        title: '🍔 Lanches',
        rows: [
          { rowId: 'lanche1', title: 'X-Burguer', description: 'Pão, carne, queijo e salada' },
          { rowId: 'lanche2', title: 'X-Frango',  description: 'Pão, frango grelhado e maionese' }
        ]
      },
      {
        title: '🥤 Bebidas',
        rows: [
          { rowId: 'beb1', title: 'Coca-Cola 350ml', description: 'Gelada' },
          { rowId: 'beb2', title: 'Suco de Laranja',  description: 'Natural, 500ml' }
        ]
      }
    ],
    delay: 1200
  }, {
    headers: { 'Content-Type': 'application/json', apikey: apikeySessao }
  });

  console.log('Lista enviada:', data);
}
```

---

### Enviar Mensagem Interativa

Mensagem interativa com cabeçalho, corpo, rodapé e botões nativos (NativeFlow). Ideal para menus e fluxos mais complexos.

```javascript
async function enviarInterativa(apikeySessao) {
  const { data } = await axios.post(`${BASE_URL}/api/chat/send-interactiveMessage`, {
    to: '5521999999999',
    header: {
      text: '🚀 Flash Api',
      // image: "link ou base64",
      // video: "link ou base64",
    },
    body: {
      text: 'Selecione uma das opções abaixo para continuar:'
    },
    footer: {
      text: 'Powered by Flash Api'
    },
    nativeFlowMessage: {
      buttons: [
        {
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify({ display_text: '✅ Confirmar', id: 'confirmar' })
        },
        {
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify({ display_text: '❌ Cancelar', id: 'cancelar' })
        }
      ]
    },
    delay: 1200
  }, {
    headers: { 'Content-Type': 'application/json', apikey: apikeySessao }
  });

  console.log('Interativa enviada:', data);
}
```

#### Exemplo com lista integrada na mensagem interativa (single_select)

```javascript
async function enviarInterativaLista(apikeySessao) {
  const sections = [
    {
      title: 'Opções',
      rows: [
        { id: 'op1', title: 'Suporte Técnico',  description: 'Problemas com o sistema' },
        { id: 'op2', title: 'Financeiro',        description: 'Cobranças e pagamentos' },
        { id: 'op3', title: 'Comercial',         description: 'Novos planos e ofertas' }
      ]
    }
  ];

  const { data } = await axios.post(`${BASE_URL}/api/chat/send-interactiveMessage`, {
    to: '5521999999999',
    type: 'button',
    header: { type: 'text', text: 'Central de Atendimento' },
    body: { text: 'Com qual departamento você deseja falar?' },
    footer: { text: 'Flash Api — SAC' },
    nativeFlowMessage: {
      buttons: [
        {
          name: 'single_select',
          buttonParamsJson: JSON.stringify({
            title: 'Escolha um departamento',
            sections
          })
        }
      ]
    },
    delay: 1200
  }, {
    headers: { 'Content-Type': 'application/json', apikey: apikeySessao }
  });

  console.log('Interativa com lista enviada:', data);
}
```

---

## 🌐 WebSocket

Conecte ao WebSocket em `/ws` para receber eventos em tempo real.

```javascript
const WebSocket = require('ws');

const BASE_WS  = 'ws://localhost:3000/ws';
const API_KEY  = 'SUA_API_KEY';
const MODO     = 'client'; // 'global' (GLOBAL_WEBSOCKET_SECRET) ou 'client' (apikey da sessão)

function connectWebSocket() {
  const ws = new WebSocket(BASE_WS, [], {
    headers: {
      apikey: API_KEY,
      modo: MODO,
      events: JSON.stringify([
        'connection_update',
        'qr_updated',
        'message_received',
        'message_update',
        'chats_set',
        'chats_update',
        'contacts_set',
        'contacts_update',
        'groups_update',
        'group_participants_update',
        'presence_update',
        'call',
        'messaging_history_set'
      ])
    }
  });

  // Ping a cada 60 segundos para manter a conexão
  ws.onopen = () => {
    console.log('✅ Conectado ao WebSocket');
    setInterval(() => ws.send(JSON.stringify({ type: 'ping' })), 60000);
  };

  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);

    switch (msg.type) {
      case 'welcome':
        console.log('Bem-vindo! ClientId:', msg.clientId);
        break;

      case 'pong':
        // confirmação de ping — pode ignorar
        break;

      case 'event':
        if (msg.event === 'message_received') {
          const { from, message } = msg.data;
          console.log(`Nova mensagem de ${from}:`, message);
        }
        if (msg.event === 'qr_updated') {
          console.log('Novo QR Code gerado:', msg.data.qrcode);
        }
        if (msg.event === 'connection_update') {
          console.log('Status da conexão:', msg.data.status);
        }
        break;

      case 'error':
        console.error('Erro WebSocket:', msg.message);
        break;
    }
  };

  ws.onclose = ({ code, reason }) => {
    console.log(`Conexão fechada — código: ${code}, motivo: ${reason}`);
    // Reconectar após 5 segundos
    setTimeout(connectWebSocket, 5000);
  };

  ws.onerror = (err) => console.error('Erro:', err.message);
}

connectWebSocket();
```

> **Modos disponíveis:**
> - `global` — autentica com `GLOBAL_WEBSOCKET_SECRET` do `.env` e recebe eventos de **todas** as sessões
> - `client` — autentica com a `apikey` da instância e recebe eventos apenas daquela sessão

---

## 📡 Webhooks

Configure uma URL de Webhook ao criar ou editar uma sessão para receber eventos via POST.

### Eventos disponíveis

| Evento                      | Descrição                                    |
|-----------------------------|----------------------------------------------|
| `presence_update`           | Atualização de presença (online/offline)      |
| `qr_updated`                | Novo QR Code gerado                          |
| `connection_update`         | Status da conexão alterado                   |
| `chats_set`                 | Lista inicial de chats carregada             |
| `message_received`          | Nova mensagem recebida                       |
| `message_update`            | Mensagem editada ou status atualizado        |
| `chats_update`              | Chats atualizados                            |
| `contacts_set`              | Lista inicial de contatos carregada          |
| `contacts_update`           | Contatos atualizados                         |
| `groups_update`             | Metadados de grupos alterados                |
| `group_participants_update` | Participantes do grupo adicionados/removidos |
| `call_update`               | Chamada de voz/vídeo recebida                |
| `messaging_history_set`     | Sincronização de histórico de mensagens      |

### Payload de exemplo

```json
{
  "event": "message_received",
  "sessionId": "minha-sessao",
  "data": {
    "id": "ABCD1234",
    "from": "5511999999999@s.whatsapp.net",
    "timestamp": 1700000000,
    "type": "conversation",
    "content": "Olá!"
  }
}
```

### Exemplo de servidor para receber Webhooks (Node.js)

```javascript
const express = require('express');
const app = express();
app.use(express.json());

app.post('/webhook', (req, res) => {
  const { event, sessionId, data } = req.body;

  console.log(`[${sessionId}] Evento: ${event}`);

  if (event === 'message_received') {
    console.log('Mensagem de:', data.from);
    console.log('Conteúdo:',   data.content);
  }

  res.sendStatus(200); // SEMPRE responda 200 para confirmar o recebimento
});

app.listen(4000, () => console.log('Webhook server rodando na porta 4000'));
```

---

## 🚀 Endpoints

### 🔐 Sessões

| Método | Endpoint                               | Descrição                          |
|--------|----------------------------------------|------------------------------------|
| POST   | `/api/session/create_sessao`           | Criar nova sessão                  |
| PUT    | `/api/session/conectar_sessao`         | Reconectar sessão / gerar QR Code  |
| PUT    | `/api/session/restart`                 | Reiniciar sessão                   |
| GET    | `/api/session/status`                  | Status da sessão                   |
| GET    | `/api/session/list`                    | Listar todas as sessões            |
| POST   | `/api/session/reconnect`               | Forçar reconexão                   |
| DELETE | `/api/session/delete/:sessionId`       | Deletar sessão                     |

### 💬 Chat

| Método | Endpoint                                | Descrição                              |
|--------|-----------------------------------------|----------------------------------------|
| POST   | `/api/chat/send-text`                   | Enviar texto                           |
| POST   | `/api/chat/send-image`                  | Enviar imagem                          |
| POST   | `/api/chat/send-video`                  | Enviar vídeo                           |
| POST   | `/api/chat/send-audio`                  | Enviar áudio                           |
| POST   | `/api/chat/send-document`               | Enviar documento                       |
| POST   | `/api/chat/send-location`               | Enviar localização                     |
| POST   | `/api/chat/send-poll`                   | Enviar enquete                         |
| POST   | `/api/chat/send-sticker`                | Enviar sticker                         |
| POST   | `/api/chat/send-contact`                | Enviar contato (vCard)                 |
| POST   | `/api/chat/send-reaction`               | Enviar reação                          |
| POST   | `/api/chat/send-buttons`                | Enviar botões                          |
| POST   | `/api/chat/send-list`                   | Enviar lista interativa                |
| POST   | `/api/chat/send-interactiveMessage`     | Enviar mensagem interativa (NativeFlow)|
| POST   | `/api/chat/send-carouselMessage`        | Enviar carrossel                       |
| POST   | `/api/chat/mark-read`                   | Marcar mensagem como lida             |
| POST   | `/api/chat/send-typing`                 | Enviar status de digitando             |

### 📇 Contatos

| Método | Endpoint                    | Descrição                |
|--------|-----------------------------|--------------------------|
| GET    | `/api/contact/list`         | Listar contatos          |
| GET    | `/api/contact/profile`      | Obter perfil do contato  |
| POST   | `/api/contact/check`        | Verificar número         |

### 👥 Grupos

| Método | Endpoint                              | Descrição                       |
|--------|---------------------------------------|---------------------------------|
| GET    | `/api/group/list`                     | Listar grupos                   |
| GET    | `/api/group/info`                     | Informações do grupo            |
| POST   | `/api/group/create`                   | Criar grupo                     |
| POST   | `/api/group/add-participant`          | Adicionar participante          |
| POST   | `/api/group/remove-participant`       | Remover participante            |
| PUT    | `/api/group/promote-participant`      | Promover a administrador        |
| PUT    | `/api/group/demote-participant`       | Rebaixar administrador          |
| PUT    | `/api/group/update-subject`           | Atualizar nome do grupo         |
| PUT    | `/api/group/update-description`       | Atualizar descrição             |
| POST   | `/api/group/leave`                    | Sair do grupo                   |

### 🔧 Sistema

| Método | Endpoint              | Descrição                    |
|--------|-----------------------|------------------------------|
| GET    | `/api/system/info`    | Informações do sistema       |
| GET    | `/api/system/health`  | Health check                 |

---

## 🧠 Painel de Controle

Acesse o painel web em `http://localhost:3000` (ou seu domínio).

### Funcionalidades do painel

- **Gerenciar sessões** — criar, conectar, reiniciar, deletar
- **Envio de mensagens em lote** — para contatos e grupos selecionados, com suporte a todos os tipos de mensagem
- **Gerenciador de grupos** — criar, adicionar/remover participantes, promover/rebaixar, atualizar nome e descrição
- **Configuração de Webhook** — definir URL, ativar/desativar e selecionar eventos por sessão
- **Session Lab** — recriar sessão com mesmo token e nome (restart + reconnect)

---

## 📚 Documentação Interativa

| Recurso           | URL                                     |
|-------------------|-----------------------------------------|
| Swagger UI        | `http://localhost:3000/api-docs`        |
| Coleção Postman   | `http://localhost:3000/postman_collection.json` |

---

## 🛠 Tecnologias

| Tecnologia     | Uso                                    |
|----------------|----------------------------------------|
| Node.js 20+    | Runtime JavaScript                     |
| Express        | Framework HTTP                         |
| Baileys        | Biblioteca WhatsApp Web                |
| PostgreSQL 16  | Banco de dados relacional              |
| Redis 7        | Cache e filas de mensagens             |
| WebSocket (ws) | Comunicação em tempo real              |
| Swagger        | Documentação interativa da API         |
| Pino           | Logger estruturado                     |
| Helmet         | Headers de segurança HTTP              |
| Docker         | Containerização                        |

---

## 🔐 Segurança

- Autenticação via API Key por sessão e chave global
- Helmet para headers de segurança HTTP
- CORS configurável por origem
- Validação de payload com Joi
- Logs estruturados com Pino

---

## ☕ Apoie este Projeto

Este projeto é **open source** e feito com 💚 para a comunidade.

Se ele te ajudou de alguma forma, considere fazer uma contribuição voluntária.

<p align="center">
  <img src="https://img.shields.io/badge/Chave%20PIX-ba189cff--4540--49cb--a087--5a60231e9e77-9647FF?style=for-the-badge&logo=pix&logoColor=white" alt="PIX">
</p>

<p align="center">
  📲 <strong>Chave PIX Aleatória:</strong><br>
  <code>ba189cff-4540-49cb-a087-5a60231e9e77</code>
</p>

---

## 💬 Suporte e Comunidade

Tem dúvidas, sugestões ou quer trocar ideias com outros usuários?

<p align="center">
  <a href="https://chat.whatsapp.com/Jr3lvW2tbg38MZEMpUNZMI" target="_blank">
    <img src="https://img.shields.io/badge/Grupo%20de%20Suporte%20no%20WhatsApp-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" alt="WhatsApp">
  </a>
</p>

> 📣 **Link direto:** [`https://chat.whatsapp.com/Jr3lvW2tbg38MZEMpUNZMI`](https://chat.whatsapp.com/Jr3lvW2tbg38MZEMpUNZMI)

- GitHub: [https://github.com/clsshbr2/FlashApi](https://github.com/clsshbr2/FlashApi)
- Swagger local: `/api-docs`
- Coleção Postman: `/postman_collection.json`
