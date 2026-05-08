document.addEventListener("DOMContentLoaded", async () => {
  // Obtém elementos-base do dashboard.
  const elementoInfoUsuario = document.getElementById("userInfo");
  const inputFiltroBusca = document.getElementById("filtroBusca");
  const botaoAtualizar = document.getElementById("btnRefreshAnalytics");
  const modalQrCode = document.getElementById("modalQR");
  const btn_conectar = document.querySelectorAll(".btn-conectar");
  const btn_desconectar = document.querySelectorAll(".btn-desconectar");
  const btn_deletar = document.querySelectorAll(".btn-deletar");
  const btn_configuracao = document.querySelectorAll(".btn-configuracao");
  const btn_copiar = document.querySelectorAll(".copiar-btn");

  btn_copiar.forEach((botao) => {
    botao.addEventListener("click", function () {
      const valorCopiar = this.getAttribute("data-copy");
      if (!valorCopiar) {
        alert("Valor para copiar não encontrado.");
        return;
      }
      navigator.clipboard.writeText(valorCopiar).then(  () => {
        alert("Valor copiado para a área de transferência.");

      }).catch((err) => {
        alert("Erro ao copiar o valor. Veja o console para detalhes.");
        console.error("Erro ao copiar para a área de transferência:", err);
      });
    });
  });

  const modalConfig = new bootstrap.Modal(document.getElementById("configSessao"));
  modalConfig._element.addEventListener("hidden.bs.modal", function () {
    window.location.reload();
  });

  if (!elementoInfoUsuario) {
    return;
  }

  const apikeyGlobal = elementoInfoUsuario.getAttribute("data-apikey");

  // Tenta ler as instâncias vindas do backend.
  let instancias = [];
  try {
    instancias = JSON.parse(elementoInfoUsuario.getAttribute("data-instance") || "[]");
  } catch (erro) {
    instancias = [];
  }

  // Lista original das colunas de card para re-renderização do filtro.
  const colunasOriginais = Array.from(document.querySelectorAll(".card-instance"))
    .map((card) => card.closest(".col-md-6.col-lg-4"))
    .filter(Boolean);

  const containerCards = colunasOriginais[0]?.parentElement || null;

  // Faz requisições para a API com o header de apikey.
  async function fazerRequisicao(url, metodo = "GET", apikey = apikeyGlobal, dados = null) {
    const opcoes = {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        apikey: apikey,
      },
    };

    if (dados && metodo !== "GET") {
      opcoes.body = JSON.stringify(dados);
    }

    try {
      const resposta = await fetch(url, opcoes);
      return await resposta.json();
    } catch (erro) {
      console.error("Erro ao consultar API:", erro);
      return null;
    }
  }

  // Atualiza os indicadores de total/conectadas/conectando/desconectadas.
  async function atualizarMetricasSessoes() {
    const respostaSessoes = await fazerRequisicao("/api/session/list", "GET");
    const stats = respostaSessoes?.data?.stats;

    if (!stats) {
      return;
    }

    const total = Number(stats.total || 0);
    const conectadas = Number(stats.connected || 0);
    const conectando = Number(stats.connecting || 0);
    const desconectadas = Number(stats.disconnected || 0);

    const totalEl = document.getElementById("metricTotalInstances");
    const conectadasEl = document.getElementById("metricConnectedInstances");
    const conectandoEl = document.getElementById("metricConnectingInstances");
    const desconectadasEl = document.getElementById("metricDisconnectedInstances");
    const statusTextoEl = document.getElementById("dashboardStatusText");
    const atualizadoEmEl = document.getElementById("analyticsUpdatedAt");

    if (totalEl) totalEl.textContent = String(total);
    if (conectadasEl) conectadasEl.textContent = String(conectadas);
    if (conectandoEl) conectandoEl.textContent = String(conectando);
    if (desconectadasEl) desconectadasEl.textContent = String(desconectadas);

    if (statusTextoEl) {
      statusTextoEl.textContent = `Total: ${total} | Conectadas: ${conectadas} | Conectando: ${conectando} | Desconectadas: ${desconectadas}`;
    }

    if (atualizadoEmEl) {
      atualizadoEmEl.textContent = new Date().toLocaleString("pt-BR");
    }
  }

  // Define fallback de imagem sem usar handlers inline (compatível com CSP).
  function configurarFallbackAvatar() {
    const avatares = document.querySelectorAll("img.instance-avatar[data-fallback-src]");
    avatares.forEach((avatar) => {
      avatar.addEventListener("error", function aoFalharAvatar() {
        const srcFallback = this.getAttribute("data-fallback-src") || "/images/image.png";
        if (this.getAttribute("src") !== srcFallback) {
          this.setAttribute("src", srcFallback);
          return;
        }

        this.style.display = "none";
      });
    });
  }

  // Extrai os campos usados na busca de cada card.
  function extrairCamposBusca(colunaCard) {
    const card = colunaCard.querySelector(".card-instance");

    const nome = card?.querySelector(".instancia_name")?.textContent?.toLowerCase().trim() || "";
    const telefone = card?.querySelector(".phone-number")?.textContent?.toLowerCase().trim() || "";
    const apikey = card?.querySelector(".api-key")?.textContent?.toLowerCase().trim() || "";

    return { colunaCard, nome, telefone, apikey };
  }

  // Limpa a grade e renderiza apenas os resultados filtrados, ordenados por nome.
  function renderizarFiltroInstancias(termoBusca) {
    if (!containerCards) {
      return;
    }

    const termo = String(termoBusca || "")
      .toLowerCase()
      .trim();
    const cardsComDados = colunasOriginais.map(extrairCamposBusca);

    const resultados = cardsComDados.filter(({ nome, telefone, apikey }) => {
      if (!termo) {
        return true;
      }

      return nome.includes(termo) || telefone.includes(termo) || apikey.includes(termo);
    });

    resultados.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    containerCards.innerHTML = "";

    if (resultados.length === 0) {
      const avisoSemResultado = document.createElement("div");
      avisoSemResultado.className = "col-12 small-muted";
      avisoSemResultado.textContent = "Nenhuma instância encontrada para o filtro informado.";
      containerCards.appendChild(avisoSemResultado);
      return;
    }

    resultados.forEach(({ colunaCard }) => {
      containerCards.appendChild(colunaCard);
    });
  }

  // Mantém a variável em uso para evitar remoções acidentais por linters.
  if (!Array.isArray(instancias)) {
    instancias = [];
  }

  // Configura o fallback de avatar para todas as imagens de instância.
  configurarFallbackAvatar();
  await atualizarMetricasSessoes();
  setInterval(atualizarMetricasSessoes, 6000);

  // Configura o botão de atualizar para recarregar as métricas de sessões.
  if (botaoAtualizar) {
    botaoAtualizar.addEventListener("click", atualizarMetricasSessoes);
  }

  // Configura o filtro de busca para atualizar a lista de instâncias conforme o usuário digita.
  if (inputFiltroBusca) {
    inputFiltroBusca.addEventListener("input", function aoDigitarFiltro() {
      renderizarFiltroInstancias(this.value);
    });
  }

  // Configura os botões de conectar para iniciar o processo de conexão da sessão correspondente.
  btn_conectar.forEach((botao) => {
    botao.addEventListener("click", async function () {
      const sessionId = this.getAttribute("data-id");
      if (!sessionId) {
        alert("ID da sessão não encontrado para esta instância.");
        return;
      }
      const instacia = instancias.find((inst) => String(inst.apikey) === String(sessionId));
      if (!instacia) {
        alert("Instância não encontrada para esta sessão.");
        return;
      }
      botao.disabled = true;
      const spinner = botao.querySelector(".spinner-border");
      const textoBotao = botao.querySelector(".btn-text");
      if (spinner) spinner.classList.remove("d-none");
      if (textoBotao) textoBotao.textContent = "Conectando...";
      try {
        const conectar = await fazerRequisicao(`/api/session/conectar_sessao`, "PUT", sessionId, { numero: instacia.numero });
        if (!conectar || !conectar.success) {
          alert("Falha ao conectar a sessão." + (conectar?.message ? ` Mensagem: ${conectar.message}` : ""));
          console.error("Resposta da API:", conectar);
          return;
        }

        modalQrCode.querySelector(".modal-title").textContent = `QR Code - ${instacia.nome_sessao}`;
        const imgQr = modalQrCode.querySelector("#qr-code-img");
        if (imgQr) {
          imgQr.setAttribute("src", `${conectar.qrcode}`);
          if (conectar.code) {
            document.getElementById("qr-code-info").textContent = `Codigo: ${conectar.code}`;
          }
        }
        const modal = new bootstrap.Modal(modalQrCode);
        modal.show();

        const intervalId = setInterval(async () => {
          const status = await verificarStatusSessao(sessionId);
          console.log("Status verificado:", status);
          if (status && status.status === "connected") {
            modal.hide();
            clearInterval(intervalId);
            window.location.reload();
          }
        }, 2000);
      } catch (error) {
        alert("Erro ao conectar a sessão. Veja o console para detalhes.");
        console.error("Erro ao conectar a sessão:", error);
      } finally {
        botao.disabled = false;
        if (spinner) spinner.classList.add("d-none");
        if (textoBotao) textoBotao.textContent = "Conectar";
      }
    });
  });

  // Configura os botões de desconectar para iniciar o processo de desconexão da sessão correspondente.
  btn_desconectar.forEach((botao) => {
    botao.addEventListener("click", async function () {
      const sessionId = this.getAttribute("data-id");
      if (!sessionId) {
        alert("ID da sessão não encontrado para esta instância.");
        return;
      }
      if (!confirm("Tem certeza que deseja desconectar esta sessão?")) {
        return;
      }
      botao.disabled = true;
      const spinner = botao.querySelector(".spinner-border");
      const textoBotao = botao.querySelector(".btn-text");
      if (spinner) spinner.classList.remove("d-none");
      if (textoBotao) textoBotao.textContent = "Desconectando...";
      try {
        const resposta = await fazerRequisicao(`/api/session/desconect/${sessionId}`, "DELETE", sessionId);
        if (!resposta || !resposta.success) {
          alert("Falha ao desconectar a sessão." + (resposta?.message ? ` Mensagem: ${resposta.message}` : ""));
          console.error("Resposta da API:", resposta);
          return;
        }
        alert("Sessão desconectada com sucesso.");
        window.location.reload();
      } catch (error) {
        alert("Erro ao desconectar a sessão. Veja o console para detalhes.");
        console.error("Erro ao desconectar a sessão:", error);
      } finally {
        botao.disabled = false;
        if (spinner) spinner.classList.add("d-none");
        if (textoBotao) textoBotao.textContent = "Desconectar";
      }
    });
  });

  // Configura os botões de deletar para iniciar o processo de deleção da sessão correspondente.
  btn_deletar.forEach((botao) => {
    botao.addEventListener("click", async function () {
      const sessionId = this.getAttribute("data-id");
      if (!sessionId) {
        alert("ID da sessão não encontrado para esta instância.");
        return;
      }
      if (!confirm("Tem certeza que deseja deletar esta sessão?")) {
        return;
      }
      botao.disabled = true;
      const spinner = botao.querySelector(".spinner-border");
      const textoBotao = botao.querySelector(".btn-text");
      if (spinner) spinner.classList.remove("d-none");
      if (textoBotao) textoBotao.textContent = "Deletando...";
      try {
        const resposta = await fazerRequisicao(`/api/session/delete/${sessionId}`, "DELETE", apikeyGlobal);
        if (!resposta || !resposta.success) {
          alert("Falha ao deletar a sessão." + (resposta?.message ? ` Mensagem: ${resposta.message}` : ""));
          console.error("Resposta da API:", resposta);
          return;
        }
        alert("Sessão deletada com sucesso.");
        window.location.reload();
      } catch (error) {
        alert("Erro ao deletar a sessão. Veja o console para detalhes.");
        console.error("Erro ao deletar a sessão:", error);
      } finally {
        botao.disabled = false;
        if (spinner) spinner.classList.add("d-none");
        if (textoBotao) textoBotao.textContent = "Deletar";
      }
    });
  });

  // Configura o formulário de criação de sessão para enviar os dados para a API e criar uma nova sessão.
  document.getElementById("form-Criar-Instance").addEventListener("submit", async function (event) {
    event.preventDefault();
    const nome_sessao = document.getElementById("nome-sessao").value.trim() || "";
    const apikey = document.getElementById("apikey-sessao").value.trim() || "";
    const numero = document.getElementById("numero-sessao").value.trim() || "";
    let proxy = null;
    if (document.getElementById("proxy-ativo-add").checked) {
      proxy = {
        protocol: document.getElementById("proxy-protocol-add").value.trim() || "http",
        username: document.getElementById("proxy-username-add").value.trim() || "",
        password: document.getElementById("proxy-password-add").value.trim() || "",
        host: document.getElementById("proxy-host-add").value.trim() || "",
        port: document.getElementById("proxy-port-add").value.trim() || "",
      };
    }

    try {
      const resposta = await fazerRequisicao(`/api/session/create_sessao`, "POST", apikeyGlobal, { nome_sessao, numero, apikey, proxy });
      if (!resposta || !resposta.success) {
        alert("Falha ao criar a sessão." + (resposta?.message ? ` Mensagem: ${resposta.message}` : ""));
        console.error("Resposta da API:", resposta);
        return;
      }
      alert("Sessão criada com sucesso. Conectando...");
      window.location.reload();
    } catch (error) {
      alert("Erro ao criar a sessão. Veja o console para detalhes.");
      console.error("Erro ao criar a sessão:", error);
    } finally {
      inputNome.value = "";
      inputNumero.value = "";
    }
  });

  // Configura os botões de configuração para abrir o modal de configuração da sessão correspondente e preencher os campos com os dados atuais da sessão.
  btn_configuracao.forEach((botao) => {
    botao.addEventListener("click", async function () {
      const sessionId = this.getAttribute("data-id");
      botao.disabled = true;
      botao.querySelector(".btn-text").textContent = "Carregando...";
      const resposta = await fazerRequisicao(`/api/session/status/`, "GET", sessionId);
      if (!resposta || !resposta.success) {
        alert("Falha ao obter status da sessão." + (resposta?.message ? ` Mensagem: ${resposta.message}` : ""));
        console.error("Resposta da API:", resposta);
        return;
      }

      const modalConfig = new bootstrap.Modal(document.getElementById("configSessao"));
      modalConfig.show();
      document.getElementById("id_sessao").value = sessionId;
      document.getElementById("webhook-url").value = resposta.data.webhook_url || "";
      document.getElementById("webhook-status").checked = resposta.data.webhook_status == 1;
      document.getElementById("mensagem-rejeicao").value = resposta.data.msg_rejectcalls || "";
      document.getElementById("rejeitar-chamada").checked = resposta.data.rejeitar_ligacoes == 1;
      document.getElementById("ignorar-grupos").checked = resposta.data.ignorar_grupos == 1;
      document.getElementById("sempre-online").checked = resposta.data.leitura_automatica == 1;
      document.getElementById("proxy-ativo").checked = resposta.data.proxy.active ? true : false;

      const select = document.getElementById("events[]");
      const values = resposta.data.events || [];

      Array.from(select.options).forEach((option) => {
        option.selected = values.includes(option.value);
      });

      if (resposta?.data?.proxy) {
        document.getElementById("proxy-protocol").value = resposta.data.proxy.protocol || "http";
        document.getElementById("proxy-username").value = resposta.data.proxy.username || "";
        document.getElementById("proxy-password").value = resposta.data.proxy.password || "";
        document.getElementById("proxy-host").value = resposta.data.proxy.host || "";
        document.getElementById("proxy-port").value = resposta.data.proxy.port || "";
        if (resposta.data.proxy.active) {
          document.getElementById("config-proxy").classList.remove("d-none");
        }
      } else {
        document.getElementById("config-proxy").classList.add("d-none");
      }
    });
  });

  // Configura o checkbox de ativação de proxy para mostrar/ocultar as configurações de proxy.
  document.getElementById("proxy-ativo").addEventListener("change", function () {
    const configProxy = document.getElementById("config-proxy");
    if (this.checked) {
      configProxy.classList.remove("d-none");
    } else {
      configProxy.classList.add("d-none");
    }
  });

  // Configura o checkbox de ativação de proxy para mostrar/ocultar as configurações de proxy.
  document.getElementById("proxy-ativo-add").addEventListener("change", function () {
    const configProxy = document.getElementById("config-proxy-add");
    if (this.checked) {
      configProxy.classList.remove("d-none");
    } else {
      configProxy.classList.add("d-none");
    }
  });

  // Configura o formulário de configuração de sessão para enviar os dados para a API e atualizar as configurações da sessão.
  document.getElementById("form-config-Instance").addEventListener("submit", async function (event) {
    event.preventDefault();
    const btnSalvar = this.querySelector('button[type="submit"]');
    btnSalvar.disabled = true;
    const spinner = btnSalvar.querySelector(".spinner-border");
    const textoBotao = btnSalvar.querySelector(".btn-text");
    if (spinner) spinner.classList.remove("d-none");
    if (textoBotao) textoBotao.textContent = "Salvando...";

    const sessionId = document.getElementById("id_sessao").value;
    const webhook_url = document.getElementById("webhook-url").value.trim() || "";
    const webhook_status = document.getElementById("webhook-status").checked ? 1 : 0;
    const events = Array.from(document.getElementById("events[]").selectedOptions).map((option) => option.value);
    const msg_rejectcalls = document.getElementById("mensagem-rejeicao").value.trim() || "";
    const rejeitar_ligacoes = document.getElementById("rejeitar-chamada").checked ? 1 : 0;
    const ignorar_grupos = document.getElementById("ignorar-grupos").checked ? 1 : 0;
    const leitura_automatica = document.getElementById("sempre-online").checked ? 1 : 0;
    let proxy = null;
    if (document.getElementById("proxy-ativo").checked) {
      proxy = {
        protocol: document.getElementById("proxy-protocol").value.trim() || "http",
        username: document.getElementById("proxy-username").value.trim() || "",
        password: document.getElementById("proxy-password").value.trim() || "",
        host: document.getElementById("proxy-host").value.trim() || "",
        port: document.getElementById("proxy-port").value.trim() || "",
        active: true,
      };
    }
    const datawebhook = {
      webhookUrl: document.getElementById("webhook-url").value.trim() || "",
      events: Array.from(document.getElementById("events[]").selectedOptions).map((option) => option.value),
      status_webhook: document.getElementById("webhook-status").checked ? true : false,
    };

    const proxyConfig = {
      protocol: document.getElementById("proxy-protocol").value.trim() || "http",
      username: document.getElementById("proxy-username").value.trim() || "",
      password: document.getElementById("proxy-password").value.trim() || "",
      host: document.getElementById("proxy-host").value.trim() || "",
      port: document.getElementById("proxy-port").value.trim() || "",
      active: document.getElementById("proxy-ativo").checked ? true : false,
    };

    if (document.getElementById("proxy-ativo").checked) {
      const param = ["protocol", "username", "password", "host", "port"];
      for (const p of param) {
        if (!proxyConfig[p]) {
          alert(`Por favor, preencha o campo ${p} para ativar o proxy.`);
          return;
        }
      }
    }

    const config = {
      ignoreGroups: document.getElementById("ignorar-grupos").checked ? true : false,
      autoRead: document.getElementById("sempre-online").checked ? true : false,
      msg_rejectcalls: document.getElementById("mensagem-rejeicao").value.trim() || "",
      rejectCalls: document.getElementById("rejeitar-chamada").checked ? true : false,
    };

    await fazerRequisicao(`/api/config/webhook`, "PUT", sessionId, datawebhook);
    await fazerRequisicao(`/api/config/proxy`, "PUT", sessionId, proxyConfig);
    await fazerRequisicao(`/api/config/config`, "PUT", sessionId, config);
    alert("Configurações atualizadas com sucesso.");
    window.location.reload();
  });

  //Verificar status de uma sessao
  async function verificarStatusSessao(sessionId) {
    try {
      const resposta = await fazerRequisicao(`/api/session/status/`, "GET", sessionId);
      console.log("Resposta do status da sessão:", resposta);
      if (resposta && resposta.success) {
        return resposta.data;
      } else {
        console.error("Falha ao obter status da sessão:", resposta);
        return null;
      }
    } catch (error) {
      console.error("Erro ao verificar status da sessão:", error);
      return null;
    }
  }
});
