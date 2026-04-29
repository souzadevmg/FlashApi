const el = document.getElementById("userInfo");
let instacias = JSON.parse(el.dataset.instance || "[]");

const apikeyGlobal = el.dataset.apikey;
const apiurl = `${window.location.protocol}//${window.location.host}`;

const metricElements = {
  totalInstances: document.getElementById("metricTotalInstances"),
  connectedInstances: document.getElementById("metricConnectedInstances"),
  chats: document.getElementById("metricChats"),
  contacts: document.getElementById("metricContacts"),
  groups: document.getElementById("metricGroups"),
  messages: document.getElementById("metricMessages"),
  queue: document.getElementById("metricQueue"),
  statusText: document.getElementById("dashboardStatusText"),
  updatedAt: document.getElementById("analyticsUpdatedAt"),
};

const REALTIME_INTERVAL_MS = 5000;
let fullRefreshInProgress = false;
let liveRefreshInProgress = false;
let realtimeIntervalId = null;

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR").format(Number(value || 0));
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let current = value;
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }
  return `${current.toFixed(current >= 10 || unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function formatPercent(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "0%";
  return `${num.toFixed(2)}%`;
}

function formatSeconds(totalSeconds) {
  const sec = Math.max(0, Math.floor(Number(totalSeconds || 0)));
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getInstanceById(instanceId) {
  return instacias.find((i) => String(i.id) === String(instanceId));
}

function getInstanceByApiKey(apikey) {
  return instacias.find((i) => String(i.apikey) === String(apikey));
}

function updateAnalyticsTimestamp() {
  if (metricElements.updatedAt) {
    metricElements.updatedAt.textContent = new Date().toLocaleString("pt-BR");
  }
}

async function safeGet(url, headers = {}) {
  try {
    const response = await axios.get(url, { headers });
    if (response.data && response.data.success) {
      return { ok: true, data: response.data.data };
    }
    return {
      ok: false,
      error: response.data?.message || "Falha ao consultar endpoint",
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error.response?.data?.message || error.message || "Erro na requisicao",
    };
  }
}

function readStatsTotals(stats = {}) {
  const mensagens = stats.mensagens || {};
  const contatos = stats.contatos || {};
  const chats = stats.chats || {};
  const grupos = stats.grupos || {};

  return {
    mensagens: Number(mensagens.total_mensagens || mensagens.total || 0),
    contatos: Number(contatos.total_contatos || contatos.total || 0),
    chats: Number(chats.total_chats || chats.total || 0),
    grupos: Number(grupos.total_grupos || grupos.total || 0),
  };
}

function setDashboardMessage(text) {
  if (metricElements.statusText) {
    metricElements.statusText.textContent = text;
  }
}

function setTextById(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value ?? "-";
}

function setRealtimeStatus(text, healthy = true) {
  const el = document.getElementById("realtimeStatus");
  if (!el) return;
  el.textContent = text;
  el.className = healthy
    ? "badge rounded-pill text-bg-success"
    : "badge rounded-pill text-bg-danger";
}

async function loadAggregateMetrics() {
  setDashboardMessage(
    "Consolidando dados de chats, contatos, grupos e mensagens...",
  );

  const totals = {
    instances: instacias.length,
    connected: instacias.filter((instance) => instance.status === "connected")
      .length,
    chats: 0,
    contacts: 0,
    groups: 0,
    messages: 0,
    queue: 0,
  };

  await Promise.all(
    instacias.map(async (instance) => {
      const headers = { apikey: instance.apikey };

      const [statsRes] = await Promise.all([
        safeGet(`${apiurl}/api/config/stats`, headers),
      ]);

      if (statsRes.ok) {
        const parsed = readStatsTotals(statsRes.data?.stats || {});
        totals.chats += parsed.chats;
        totals.contacts += parsed.contatos;
        totals.groups += parsed.grupos;
        totals.messages += parsed.mensagens;
      }
    }),
  );

  if (metricElements.totalInstances)
    metricElements.totalInstances.textContent = formatNumber(totals.instances);
  if (metricElements.connectedInstances)
    metricElements.connectedInstances.textContent = formatNumber(
      totals.connected,
    );
  if (metricElements.chats)
    metricElements.chats.textContent = formatNumber(totals.chats);
  if (metricElements.contacts)
    metricElements.contacts.textContent = formatNumber(totals.contacts);
  if (metricElements.groups)
    metricElements.groups.textContent = formatNumber(totals.groups);
  if (metricElements.messages)
    metricElements.messages.textContent = formatNumber(totals.messages);
  if (metricElements.queue)
    metricElements.queue.textContent = formatNumber(totals.queue);
}

function renderRows(targetId, rows, emptyText, cols = 2) {
  const target = document.getElementById(targetId);
  if (!target) return;

  if (!rows || rows.length === 0) {
    target.innerHTML = `<tr><td colspan="${cols}" class="small-muted">${emptyText}</td></tr>`;
    return;
  }

  target.innerHTML = rows.join("");
}

async function loadInstanceAnalytics(selectedApiKey) {
  const selectEl = document.getElementById("instanceAnalyticsSelect");
  const defaultApiKey =
    selectedApiKey || selectEl?.value || instacias[0]?.apikey;
  const instance = getInstanceByApiKey(defaultApiKey);

  if (!instance) {
    renderRows("tableRecentChats", [], "Nenhuma instancia disponivel.");
    renderRows("tableRecentContacts", [], "Nenhuma instancia disponivel.");
    renderRows("tableRecentGroups", [], "Nenhuma instancia disponivel.");
    return;
  }

  if (selectEl && selectEl.value !== instance.apikey) {
    selectEl.value = instance.apikey;
  }

  const headers = { apikey: instance.apikey };

  const [chatsRes, contactsRes, groupsRes, statusRes] = await Promise.all([
    safeGet(`${apiurl}/api/chat/chats`, headers),
    safeGet(`${apiurl}/api/contact/list`, headers),
    safeGet(`${apiurl}/api/group/list`, headers),
    safeGet(`${apiurl}/api/session/status`, headers),
  ]);

  const chats = chatsRes.ok ? chatsRes.data?.chats || [] : [];
  const contacts = contactsRes.ok ? contactsRes.data?.contacts || [] : [];
  const groups = groupsRes.ok ? groupsRes.data?.groups || [] : [];

  const chatsRows = chats.slice(0, 8).map((chat) => {
    const name =
      chat.nome || chat.name || chat.push_name || chat.subject || "Sem nome";
    const jid = chat.remotejid || chat.jid || chat.id || "-";
    return `<tr><td>${escapeHtml(name)}</td><td class="small-muted">${escapeHtml(jid)}</td></tr>`;
  });

  const contactsRows = contacts.slice(0, 8).map((contact) => {
    const name = contact.nome || contact.apelido || "Sem nome";
    const number = contact.jid
      ? contact.jid.replace("@s.whatsapp.net", "")
      : "-";
    return `<tr><td>${escapeHtml(name)}</td><td class="small-muted">${escapeHtml(number)}</td></tr>`;
  });

  const groupsRows = groups.slice(0, 8).map((group) => {
    const name = group.assunto || group.nome || group.name || "Sem titulo";
    const id = group.id || group.jid || group.groupJid || "-";
    return `<tr><td>${escapeHtml(name)}</td><td class="small-muted">${escapeHtml(id)}</td></tr>`;
  });

  renderRows("tableRecentChats", chatsRows, "Sem chats para exibir.");
  renderRows(
    "tableRecentContacts",
    contactsRows,
    contactsRes.ok
      ? "Sem contatos para exibir."
      : "Instancia desconectada ou sem acesso.",
  );
  renderRows(
    "tableRecentGroups",
    groupsRows,
    groupsRes.ok
      ? "Sem grupos para exibir."
      : "Instancia desconectada ou sem acesso.",
  );

  const statusText = statusRes.ok
    ? `Instancia selecionada: ${instance.nome_sessao} (${statusRes.data?.status || instance.status})`
    : `Instancia selecionada: ${instance.nome_sessao} (${instance.status})`;

  setDashboardMessage(statusText);
}

async function loadSystemHealth() {
  const headers = { apikey: apikeyGlobal };
  const stateEl = document.getElementById("systemHealthState");
  const totalEl = document.getElementById("systemSessionsTotal");
  const connectedEl = document.getElementById("systemSessionsConnected");
  const connectingEl = document.getElementById("systemSessionsConnecting");

  const [listRes, healthRes] = await Promise.all([
    safeGet(`${apiurl}/api/session/list`, headers),
    safeGet(`${apiurl}/api/session/health`, headers),
  ]);

  const fallbackTotal = instacias.length;
  const fallbackConnected = instacias.filter(
    (instance) => instance.status === "connected",
  ).length;

  if (listRes.ok) {
    const stats = listRes.data?.stats || {};
    if (totalEl)
      totalEl.textContent = formatNumber(
        stats.total || listRes.data?.total || fallbackTotal,
      );
    if (connectedEl)
      connectedEl.textContent = formatNumber(
        stats.connected || fallbackConnected,
      );
    if (connectingEl)
      connectingEl.textContent = formatNumber(stats.connecting || 0);
  } else {
    if (totalEl) totalEl.textContent = formatNumber(fallbackTotal);
    if (connectedEl) connectedEl.textContent = formatNumber(fallbackConnected);
    if (connectingEl) connectingEl.textContent = "0";
  }

  if (stateEl) {
    const healthy = healthRes.ok;
    stateEl.textContent = healthy ? "Saudavel" : "Indisponivel";
    stateEl.className = healthy
      ? "badge rounded-pill text-bg-success"
      : "badge rounded-pill text-bg-danger";
  }
}

async function loadSystemInfra() {
  const headers = { apikey: apikeyGlobal };
  const statusRes = await safeGet(`${apiurl}/api/system/status`, headers);

  if (!statusRes.ok) {
    setTextById("systemHostname", "Indisponivel");
    setTextById("systemOs", "Indisponivel");
    setTextById("systemUptime", "-");
    setTextById("systemLoadAvg", "-");
    setTextById("systemCpuModel", "-");
    setTextById("systemCpuCores", "-");
    setTextById("systemCpuLoad", "-");
    setTextById("systemCpuIdle", "-");
    setTextById("systemRamTotal", "-");
    setTextById("systemRamUsed", "-");
    setTextById("systemRamFree", "-");
    setTextById("systemNodeHeap", "-");
    renderRows("tableSystemDisks", [], "Dados de disco indisponiveis.", 4);
    renderRows("tableSystemNetwork", [], "Dados de rede indisponiveis.", 4);
    return;
  }

  const payload = statusRes.data || {};
  const system = payload.system || {};
  const host = system.host || {};
  const cpu = system.cpu || {};
  const cpuLoad = cpu.load || {};
  const memoryDetails = system.memoryDetails || {};
  const sysMem = memoryDetails.system || {};
  const processMem = memoryDetails.process || system.memory || {};

  const totalRamBytes = Number(sysMem.total || 0);
  const availableRamBytes = Number(sysMem.available ?? sysMem.free ?? 0);
  const calculatedUsedRamBytes =
    totalRamBytes > 0
      ? Math.max(0, totalRamBytes - availableRamBytes)
      : Number(sysMem.used || 0);
  const ramUsagePercent =
    totalRamBytes > 0
      ? (calculatedUsedRamBytes / totalRamBytes) * 100
      : Number(sysMem.usagePercent || 0);

  setTextById("systemHostname", host.hostname || "-");
  setTextById(
    "systemOs",
    `${host.type || ""} ${host.release || ""}`.trim() ||
      system.os?.distro ||
      "-",
  );
  setTextById("systemUptime", formatSeconds(host.uptime || system.uptime || 0));
  setTextById(
    "systemLoadAvg",
    Array.isArray(host.loadAverage)
      ? host.loadAverage.map((v) => Number(v || 0).toFixed(2)).join(" | ")
      : "-",
  );

  setTextById("systemCpuModel", cpu.brand || cpu.manufacturer || "-");
  setTextById("systemCpuCores", `${cpu.cores || "-"} cores`);
  setTextById("systemCpuLoad", formatPercent(cpuLoad.current));
  setTextById(
    "systemCpuIdle",
    cpuLoad.idle == null ? "-" : formatPercent(cpuLoad.idle),
  );

  setTextById("systemRamTotal", formatBytes(totalRamBytes));
  setTextById(
    "systemRamUsed",
    `${formatBytes(calculatedUsedRamBytes)} (${formatPercent(ramUsagePercent)})`,
  );
  setTextById("systemRamFree", formatBytes(availableRamBytes));
  setTextById(
    "systemNodeHeap",
    `${formatBytes(processMem.heapUsed)} / ${formatBytes(processMem.heapTotal)}`,
  );

  const disks = system.storage?.disks || [];
  const diskRows = disks.slice(0, 8).map(
    (disk) => `
        <tr>
            <td>${escapeHtml(disk.mount || disk.fs || "-")}</td>
            <td>${escapeHtml(formatBytes(disk.total))}</td>
            <td>${escapeHtml(formatBytes(disk.used))}</td>
            <td class="small-muted">${escapeHtml(formatPercent(disk.use))}</td>
        </tr>
    `,
  );

  const nets = system.network?.stats || [];
  const netRows = nets.slice(0, 8).map(
    (net) => `
        <tr>
            <td>${escapeHtml(net.iface || "-")}</td>
            <td>${escapeHtml(net.operstate || "-")}</td>
            <td>${escapeHtml(formatBytes(net.rxBytes))}</td>
            <td class="small-muted">${escapeHtml(formatBytes(net.txBytes))}</td>
        </tr>
    `,
  );

  renderRows("tableSystemDisks", diskRows, "Nenhum volume encontrado.", 4);
  renderRows(
    "tableSystemNetwork",
    netRows,
    "Nenhuma interface ativa encontrada.",
    4,
  );
}

function populateInstanceSelect() {
  const select = document.getElementById("instanceAnalyticsSelect");
  if (!select) return;

  select.innerHTML = "";
  instacias.forEach((instance) => {
    const option = document.createElement("option");
    option.value = instance.apikey;
    option.textContent = `${instance.nome_sessao} (${instance.status})`;
    select.appendChild(option);
  });

  if (instacias.length > 0) {
    select.value = instacias[0].apikey;
  }
}

async function refreshAnalytics() {
  if (fullRefreshInProgress) {
    return;
  }

  fullRefreshInProgress = true;
  try {
    const refreshBtn = document.getElementById("btnRefreshAnalytics");
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.innerHTML =
        '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Atualizando';
    }

    await loadAggregateMetrics();
    await loadInstanceAnalytics();
    await loadSystemHealth();
    await loadSystemInfra();
    updateAnalyticsTimestamp();
    setRealtimeStatus(
      `Ativo (${Math.floor(REALTIME_INTERVAL_MS / 1000)}s)`,
      true,
    );
  } catch (error) {
    setDashboardMessage("Erro ao atualizar metricas do dashboard.");
    setRealtimeStatus("Erro no tempo real", false);
  } finally {
    fullRefreshInProgress = false;
    const refreshBtn = document.getElementById("btnRefreshAnalytics");
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML =
        '<i class="bi bi-arrow-clockwise me-1"></i> Atualizar';
    }
  }
}

async function refreshRealtimeConsumption() {
  if (liveRefreshInProgress || fullRefreshInProgress || document.hidden) {
    return;
  }

  liveRefreshInProgress = true;
  try {
    await loadSystemHealth();
    await loadSystemInfra();
    updateAnalyticsTimestamp();
    setRealtimeStatus(
      `Ativo (${Math.floor(REALTIME_INTERVAL_MS / 1000)}s)`,
      true,
    );
  } catch (error) {
    setRealtimeStatus("Erro no tempo real", false);
  } finally {
    liveRefreshInProgress = false;
  }
}

function startRealtimeConsumptionUpdates() {
  if (realtimeIntervalId) {
    clearInterval(realtimeIntervalId);
  }

  realtimeIntervalId = setInterval(
    refreshRealtimeConsumption,
    REALTIME_INTERVAL_MS,
  );
  setRealtimeStatus(
    `Ativo (${Math.floor(REALTIME_INTERVAL_MS / 1000)}s)`,
    true,
  );
}

function stopRealtimeConsumptionUpdates() {
  if (realtimeIntervalId) {
    clearInterval(realtimeIntervalId);
    realtimeIntervalId = null;
  }
  setRealtimeStatus("Pausado (aba inativa)", true);
}

function bindRealtimeLifecycle() {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopRealtimeConsumptionUpdates();
      return;
    }

    startRealtimeConsumptionUpdates();
    refreshRealtimeConsumption();
  });
}

function bindAnalyticsEvents() {
  const select = document.getElementById("instanceAnalyticsSelect");
  if (select) {
    select.addEventListener("change", async function () {
      await loadInstanceAnalytics(this.value);
      updateAnalyticsTimestamp();
    });
  }

  const refreshBtn = document.getElementById("btnRefreshAnalytics");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", refreshAnalytics);
  }
}

// Botao Conectar instancia

document.querySelectorAll(".btn-generate").forEach((button) => {
  button.addEventListener("click", function () {
    const instanceId = this.dataset.id;
    const $btn = $(this);
    $btn.prop("disabled", true);
    $btn.find(".btn-text").text("Conectando...");
    $btn.find(".spinner-border").removeClass("d-none");
    generateQRCode(instanceId);
  });
});

// Botao Desconectar instancia

document.querySelectorAll(".btn-disconnect").forEach((button) => {
  button.addEventListener("click", function () {
    const instanceId = this.dataset.id;
    const $btn = $(this);
    $btn.prop("disabled", true);
    $btn.find(".btn-text").text("Desconectando...");
    $btn.find(".spinner-border").removeClass("d-none");
    if (confirm("Deseja realmente desconectar a instancia?")) {
      disconnectInstance(instanceId);
    }
  });
});

// Botao Deletar instancia

document.querySelectorAll(".btn-delete").forEach((button) => {
  button.addEventListener("click", function () {
    const instanceId = this.dataset.id;
    if (confirm("Deseja realmente deletar a instancia?")) {
      const $btn = $(this);
      $btn.prop("disabled", true);
      $btn.find(".btn-text").text("Deletando...");
      $btn.find(".spinner-border").removeClass("d-none");
      deleteInstance(instanceId);
    }
  });
});

// Botao atualizar qrcode

document.querySelectorAll(".btn-att-qrcode").forEach((button) => {
  button.addEventListener("click", function () {
    const instanceId = this.dataset.id;
    $("#qr-code-info").html("");
    $("#qr-code-img").attr("src", "");
    $("#info-detalhes").html("");
    generateQRCode(instanceId);
  });
});

// Botao configuracao

document.querySelectorAll(".btn-config").forEach((button) => {
  button.addEventListener("click", async function () {
    this.disabled = true;
    const instanceId = this.dataset.id;
    await configuracao(instanceId);
    this.disabled = false;
  });
});

// Funcao gerar qrcode

async function generateQRCode(instanceId, modal = true) {
  const getapikey = getInstanceById(instanceId);

  if (!getapikey) {
    alert("Instancia nao encontrada.");
    return;
  }

  try {
    const headers = { apikey: getapikey.apikey };

    const response = await axios.put(
      `${apiurl}/api/session/conectar_sessao`,
      null,
      { headers },
    );
    if (response.data.success) {
      $(".btn-att-qrcode").attr("data-id", instanceId);
      $("#qr-code-info").html(
        `<strong>Codigo de conexao:</strong> ${response.data.code}`,
      );
      $("#qr-code-img").attr("src", response.data.qrcode);
      $("#info-detalhes").html(`<strong>${response.data.message}</strong>`);
      if (modal) {
        $("#modalQR").modal("show");
      }
    } else {
      alert(response.data.message || "QR Code nao disponivel.");
    }
  } catch (error) {
    alert("Erro ao gerar sessao, tente novamente.");
  }
}

// Funcao desconectar instancia

async function disconnectInstance(instanceId) {
  const getapikey = getInstanceById(instanceId);
  if (!getapikey) {
    alert("Instancia nao encontrada.");
    return;
  }

  try {
    const headers = { apikey: getapikey.apikey };

    const response = await axios.delete(
      `${apiurl}/api/session/desconect/${getapikey.apikey}`,
      { headers },
    );
    if (response.data.success) {
      alert(response.data.message);
    } else {
      alert(response.data.message || "Erro ao desconectar instancia.");
    }
    window.location.reload();
  } catch (error) {
    alert("Erro ao desconectar sessao, tente novamente.");
  }
}

// Funcao deletar instancia

async function deleteInstance(instanceId) {
  const getapikey = getInstanceById(instanceId);
  if (!getapikey) {
    alert("Instancia nao encontrada.");
    return;
  }

  try {
    const headers = { apikey: apikeyGlobal };

    const response = await axios.delete(
      `${apiurl}/api/session/delete/${getapikey.apikey}`,
      { headers },
    );
    if (response.data.success) {
      alert(response.data.message);
    } else {
      alert(response.data.message || "Erro ao deletar instancia.");
    }
    window.location.reload();
  } catch (error) {
    alert("Erro ao deletar sessao, tente novamente.");
  }
}

// Criar instancia

$("#form-Criar-Instance").on("submit", async (event) => {
  event.preventDefault();
  const nome_sessao = $("#nome-sessao").val();
  const apikey = $("#apikey-sessao").val();
  const numero = $("#numero-sessao").val();

  try {
    const headers = { apikey: apikeyGlobal };

    const data = { nome_sessao, apikey, numero };
    const response = await axios.post(
      `${apiurl}/api/session/create_sessao`,
      data,
      { headers },
    );
    if (response.data.success) {
      alert("Sessao criada com sucesso");
    } else {
      alert(response.data.message || "Erro ao criar instancia.");
    }
  } catch (error) {
    alert("Erro ao criar sessao, tente novamente.");
  } finally {
    window.location.reload();
  }
});

$("#modalQR").on("hidden.bs.modal", function () {
  window.location.reload();
});

$("#modalcreateSessao").on("hidden.bs.modal", function () {
  window.location.reload();
});

async function configuracao(instanceId) {
  const getapikey = getInstanceById(instanceId);
  const configProxy = document.getElementById("config-proxy");
  if (getapikey) {
    const getProxy = await getproxy(instanceId, getapikey.apikey);
    if (!getProxy) {
      return alert("Erro ao carregar configuracao de proxy, tente novamente.");
    }

    if (getProxy.proxy) {
      $("#proxy-ativo").prop("checked", getProxy.proxy.active == 1);
      $("#proxy-protocol").val(getProxy.proxy.protocol || "http");
      $("#proxy-username").val(getProxy.proxy.username || "");
      $("#proxy-password").val(getProxy.proxy.password || "");
      $("#proxy-port").val(getProxy.proxy.port || "");
      $("#proxy-host").val(getProxy.proxy.host || "");

      if (getProxy.proxy.active == 1) {
        configProxy.classList.remove("d-none");
      } else {
        configProxy.classList.add("d-none");
      }
    }

    $("#id_sessao").attr("data-id", instanceId);
    $("#webhook-url").val(getProxy.config.webhook_url || "");
    $("#webhook-status").prop("checked", getProxy.config.webhook_status == 1);
    $('[name="events[]"]').val(getProxy.config.events || []);
    $("#mensagem-rejeicao").val(getProxy.config.msg_rejectcalls || "");
    $("#rejeitar-chamada").prop(
      "checked",
      getProxy.config.rejeitar_ligacoes == 1,
    );
    $("#sempre-online").prop(
      "checked",
      getProxy.config.leitura_automatica == 1,
    );
    $("#ignorar-grupos").prop("checked", getProxy.config.ignorar_grupos == 1);
    $("#configSessao").modal("show");
  }
}

async function getproxy(instanceId, apikey) {
  try {
    const headers = { apikey: apikey };
    const config = await axios.get(`${apiurl}/api/config/session`, { headers });
    if (config.data.success) {
      return config.data.data || {};
    }
  } catch (error) {
    console.log(error);
    return null;
  }
}
// Alterar configuracoes

$("#form-config-Instance").on("submit", async function (e) {
  e.preventDefault();
  const instanceId = $("#id_sessao").attr("data-id");
  const getapikey = getInstanceById(instanceId);
  if (!getapikey) {
    alert("Sessao nao encontrada");
    window.location.reload();
    return;
  }

  const $btn = $(this).find('button[type="submit"]');
  $btn.prop("disabled", true);
  $btn.find(".btn-text").text("Salvando...");
  $btn.find(".spinner-border").removeClass("d-none");

  const events = $('[name="events[]"]').val();
  const status_webhook = $("#webhook-status").prop("checked");
  const webhookUrl = $("#webhook-url").val();

  const headers = { apikey: getapikey.apikey };

  await att_webhook(
    {
      events,
      status_webhook: status_webhook === true,
      webhookUrl,
    },
    headers,
  );

  const ignoreGroups = $("#ignorar-grupos").prop("checked");
  const autoRead = $("#sempre-online").prop("checked");
  const rejectCalls = $("#rejeitar-chamada").prop("checked");
  const msg_rejectcalls = $("#mensagem-rejeicao").val();

  await att_config(
    {
      ignoreGroups: ignoreGroups === true,
      autoRead: autoRead === true,
      rejectCalls: rejectCalls === true,
      msg_rejectcalls,
    },
    headers,
  );

  const proxyAtivo = $("#proxy-ativo").prop("checked");
  const proxyProtocol = $("#proxy-protocol").val();
  const proxyUsername = $("#proxy-username").val();
  const proxyPassword = $("#proxy-password").val();
  const proxyPort = $("#proxy-port").val();
  const proxyHost = $("#proxy-host").val();
  await att_proxy(
    {
      active: proxyAtivo === true,
      protocol: proxyProtocol,
      username: proxyUsername,
      password: proxyPassword,
      port: proxyPort,
      host: proxyHost,
    },
    headers,
  );

  alert("Configuracoes atualizadas");
  window.location.reload();
});

// Funcao para atualizar webhook

async function att_webhook(data, headers) {
  try {
    await axios.put(`${apiurl}/api/config/webhook`, data, { headers });
  } catch (error) {}
}

// Funcao para atualizar configuracao geral

async function att_config(data, headers) {
  try {
    await axios.put(`${apiurl}/api/config/config`, data, { headers });
  } catch (error) {}
}

async function att_proxy(data, headers) {
  try {
    await axios.put(`${apiurl}/api/config/proxy`, data, { headers });
  } catch (error) {}
}

// Filtro por nome/apikey

const filtroBusca = document.getElementById("filtroBusca");
if (filtroBusca) {
  filtroBusca.addEventListener("input", function () {
    const termo = String(this.value || "").toLowerCase();
    const cards = document.querySelectorAll(".card-instance");

    cards.forEach((card) => {
      const nome = String(card.dataset.nome || "").toLowerCase();
      const apikey = String(card.dataset.apikey || "").toLowerCase();
      const wrapper = card.parentElement;

      if (nome.includes(termo) || apikey.includes(termo)) {
        wrapper.style.display = "";
      } else {
        wrapper.style.display = "none";
      }
    });
  });
}

// Copiar ao clicar

document.addEventListener("click", function (e) {
  const copyButton = e.target.closest(".copiar-btn");
  if (!copyButton) return;

  const valor = copyButton.getAttribute("data-copy");
  if (!valor) return;

  navigator.clipboard
    .writeText(valor)
    .then(() => {
      copyButton.classList.add("copied");
      setTimeout(() => {
        copyButton.classList.remove("copied");
      }, 1200);
    })
    .catch((err) => {
      console.error("Erro ao copiar:", err);
    });
});

(async function initDashboardAnalytics() {
  populateInstanceSelect();
  bindAnalyticsEvents();
  bindRealtimeLifecycle();
  await refreshAnalytics();
  startRealtimeConsumptionUpdates();
})();

//Botão proxy

document.getElementById("proxy-ativo").addEventListener("change", function () {
  const configProxy = document.getElementById("config-proxy");
  if (this.checked) {
    configProxy.classList.remove("d-none");
  } else {
    configProxy.classList.add("d-none");
  }
});
