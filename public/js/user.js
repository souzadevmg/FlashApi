document.addEventListener("DOMContentLoaded", async () => {
	const elementoInfoUsuario = document.getElementById("userInfo");
	if (!elementoInfoUsuario) {
		return;
	}

	const apikeyGlobal = elementoInfoUsuario.getAttribute("data-apikey");
	const containerNotificacoes = document.getElementById("containerNotificacoes");
	const botaoTestarWebhook = document.getElementById("btn-testar-webhook");
	const formConfigInstancia = document.getElementById("form-config-Instance");
	const toggleProxyAtivo = document.getElementById("proxy-ativo");

	let apikeyInstanciaEmConfiguracao = null;
	const intervaloAtualizacaoMs = 20000;
	let intervaloAtualizacao = null;

	let instancias = [];
	try {
		instancias = JSON.parse(elementoInfoUsuario.getAttribute("data-instance") || "[]");
	} catch (erro) {
		instancias = [];
	}

	function mostrarNotificacao(tipo = "info", titulo = "Aviso", mensagem = "") {
		if (!containerNotificacoes) {
			return;
		}

		const mapaEstilos = {
			sucesso: "text-bg-success",
			erro: "text-bg-danger",
			aviso: "text-bg-warning",
			info: "text-bg-primary",
		};

		const classeToast = mapaEstilos[tipo] || mapaEstilos.info;
		const idToast = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

		const toastHtml = `
			<div id="${idToast}" class="toast ${classeToast} border-0" role="alert" aria-live="assertive" aria-atomic="true">
				<div class="toast-header">
					<strong class="me-auto">${titulo}</strong>
					<small>agora</small>
					<button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Fechar"></button>
				</div>
				<div class="toast-body">${mensagem}</div>
			</div>
		`;

		containerNotificacoes.insertAdjacentHTML("beforeend", toastHtml);
		const elementoToast = document.getElementById(idToast);
		const instanciaToast = bootstrap.Toast.getOrCreateInstance(elementoToast, {
			delay: 3800,
		});

		elementoToast.addEventListener("hidden.bs.toast", () => {
			elementoToast.remove();
		});

		instanciaToast.show();
	}

	function normalizarStatus(status) {
		const valor = String(status || "disconnected").toLowerCase();
		if (valor === "connected") return "connected";
		if (valor === "connecting" || valor === "qr_ready") return "connecting";
		return "disconnected";
	}

	function formatarStatusVisual(status) {
		const statusNormalizado = normalizarStatus(status);
		if (statusNormalizado === "connected") {
			return {
				texto: "Conectado",
				classe: "status-connected-badge",
				icone: "bi-check-circle-fill",
			};
		}

		if (statusNormalizado === "connecting") {
			return {
				texto: "Conectando",
				classe: "status-disconnected-badge",
				icone: "bi-arrow-repeat",
			};
		}

		return {
			texto: "Desconectado",
			classe: "status-disconnected-badge",
			icone: "bi-x-circle-fill",
		};
	}

	function obterInstanciaPorApikey(apikey) {
		return instancias.find((instancia) => String(instancia.apikey) === String(apikey));
	}

	function atualizarStatusCard(apikey, status) {
		const card = document.querySelector(`.card-instance[data-apikey="${apikey}"]`);
		if (!card) {
			return;
		}

		card.setAttribute("data-status", status || "disconnected");

		const badge = card.querySelector(".badge_status_instancia");
		if (!badge) {
			return;
		}

		const visual = formatarStatusVisual(status);
		badge.className = `${visual.classe} badge_status_instancia`;
		badge.innerHTML = `<i class="bi ${visual.icone}"></i> ${visual.texto}`;
	}

	async function fazerRequisicaoApi(endpoint, metodo = "GET", dados = null, apikeyCabecalho = apikeyGlobal) {
		const opcoesRequisicao = {
			method: metodo,
			headers: {
				apikey: apikeyCabecalho,
			},
		};

		if (dados !== null && metodo !== "GET" && metodo !== "DELETE") {
			opcoesRequisicao.headers["Content-Type"] = "application/json";
			opcoesRequisicao.body = JSON.stringify(dados);
		}

		try {
			const resposta = await fetch(endpoint, opcoesRequisicao);
			let corpoResposta = null;

			try {
				corpoResposta = await resposta.json();
			} catch {
				corpoResposta = null;
			}

			const mensagemErroPadrao = "Erro inesperado na comunicação com o servidor.";

			if (!resposta.ok) {
				return {
					sucesso: false,
					status: resposta.status,
					dados: null,
					mensagem: corpoResposta?.message || mensagemErroPadrao,
					erro: corpoResposta,
				};
			}

			return {
				sucesso: Boolean(corpoResposta?.success !== false),
				status: resposta.status,
				dados: corpoResposta?.data,
				mensagem: corpoResposta?.message || "",
				respostaCompleta: corpoResposta,
			};
		} catch (erro) {
			return {
				sucesso: false,
				status: 500,
				dados: null,
				mensagem: erro?.message || "Erro inesperado na comunicação com o servidor.",
				erro,
			};
		}
	}

	function definirEstadoCarregandoBotao(botao, carregando, textoPadrao, textoCarregando) {
		if (!botao) {
			return;
		}

		const spanTexto = botao.querySelector(".btn-text");
		const spinner = botao.querySelector(".spinner-border");

		botao.disabled = Boolean(carregando);

		if (spanTexto) {
			spanTexto.textContent = carregando ? textoCarregando : textoPadrao;
		}

		if (spinner) {
			spinner.classList.toggle("d-none", !carregando);
		}
	}

	async function atualizarStatusInstancias() {
		const atualizacoes = await Promise.all(
			instancias.map(async (instancia) => {
				const respostaStatus = await fazerRequisicaoApi(
					"/api/session/status",
					"GET",
					null,
					instancia.apikey,
				);

				if (!respostaStatus.sucesso) {
					return { apikey: instancia.apikey, status: instancia.status || "disconnected" };
				}

				const statusAtual = respostaStatus?.dados?.status || instancia.status || "disconnected";
				return { apikey: instancia.apikey, status: statusAtual };
			}),
		);

		const mapaStatus = new Map(atualizacoes.map((item) => [String(item.apikey), item.status]));

		instancias = instancias.map((instancia) => {
			const novoStatus = mapaStatus.get(String(instancia.apikey)) || instancia.status;
			atualizarStatusCard(instancia.apikey, novoStatus);
			return {
				...instancia,
				status: novoStatus,
			};
		});
	}

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

	async function conectarInstancia(apikey, botao) {
		definirEstadoCarregandoBotao(botao, true, "Conectar", "Conectando...");

		try {
			const resposta = await fazerRequisicaoApi(
				"/api/session/conectar_sessao",
				"PUT",
				{},
				apikey,
			);

			if (!resposta.sucesso) {
				mostrarNotificacao("erro", "Falha ao conectar", resposta.mensagem);
				return;
			}

			const dados = resposta.respostaCompleta || {};
			const qrCode = dados.qrcode || dados.data?.qrcode;
			const codigo = dados.code || dados.data?.code;
			const mensagem = dados.message || resposta.mensagem || "Sessão iniciada com sucesso.";

			document.getElementById("qr-code-info").textContent = codigo
				? `Código de pareamento: ${codigo}`
				: "Escaneie o QR Code para conectar.";
			document.getElementById("qr-code-img").setAttribute("src", qrCode || "");
			document.getElementById("info-detalhes").textContent = mensagem;

			const modalQR = bootstrap.Modal.getOrCreateInstance(document.getElementById("modalQR"));
			modalQR.show();

			mostrarNotificacao("sucesso", "Conexão iniciada", "QR Code gerado com sucesso.");
			await atualizarStatusInstancias();
		} finally {
			definirEstadoCarregandoBotao(botao, false, "Conectar", "Conectando...");
		}
	}

	async function desconectarInstancia(apikey, botao) {
		const confirmar = window.confirm("Deseja realmente desconectar esta instância?");
		if (!confirmar) {
			return;
		}

		definirEstadoCarregandoBotao(botao, true, "Desconectar", "Desconectando...");

		try {
			const resposta = await fazerRequisicaoApi(
				`/api/session/desconect/${encodeURIComponent(apikey)}`,
				"DELETE",
				null,
				apikey,
			);

			if (!resposta.sucesso) {
				mostrarNotificacao("erro", "Falha ao desconectar", resposta.mensagem);
				return;
			}

			mostrarNotificacao("sucesso", "Sessão desconectada", resposta.mensagem || "Instância desconectada.");
			await atualizarStatusInstancias();
			setTimeout(() => window.location.reload(), 800);
		} finally {
			definirEstadoCarregandoBotao(botao, false, "Desconectar", "Desconectando...");
		}
	}

	async function reiniciarInstancia(apikey, botao) {
		definirEstadoCarregandoBotao(botao, true, "Reiniciar", "Reiniciando...");

		try {
			const resposta = await fazerRequisicaoApi(
				"/api/session/restart",
				"PUT",
				{},
				apikey,
			);

			if (!resposta.sucesso) {
				mostrarNotificacao("erro", "Falha ao reiniciar", resposta.mensagem);
				return;
			}

			mostrarNotificacao("sucesso", "Sessão reiniciada", resposta.mensagem || "Reinício solicitado com sucesso.");
			await atualizarStatusInstancias();
			setTimeout(() => window.location.reload(), 800);
		} finally {
			definirEstadoCarregandoBotao(botao, false, "Reiniciar", "Reiniciando...");
		}
	}

	function preencherCamposInfoInstancia(apikey, dadosStatus) {
		const instanciaLocal = obterInstanciaPorApikey(apikey) || {};
		const nome = dadosStatus?.nome_sessao || instanciaLocal?.nome_sessao || "-";
		const numero = dadosStatus?.numero || instanciaLocal?.numero || "-";
		const status = dadosStatus?.status || instanciaLocal?.status || "disconnected";

		const elApikey = document.getElementById("info-instancia-apikey");
		const elStatus = document.getElementById("info-instancia-status");
		const elNome = document.getElementById("info-instancia-nome");
		const elNumero = document.getElementById("info-instancia-numero");

		if (elApikey) elApikey.textContent = apikey || "-";
		if (elNome) elNome.textContent = nome || "-";
		if (elNumero) elNumero.textContent = numero || "-";
		if (elStatus) {
			const visual = formatarStatusVisual(status);
			elStatus.textContent = visual.texto;
		}
	}

	function preencherModalConfiguracao(configuracao, proxy) {
		const inputWebhookUrl = document.getElementById("webhook-url");
		const checkWebhookAtivo = document.getElementById("webhook-status");
		const selectEventos = document.getElementById("events[]");
		const inputMensagemRejeicao = document.getElementById("mensagem-rejeicao");
		const checkRejeitarChamada = document.getElementById("rejeitar-chamada");
		const checkIgnorarGrupos = document.getElementById("ignorar-grupos");
		const checkSempreOnline = document.getElementById("sempre-online");
		const checkProxyAtivo = document.getElementById("proxy-ativo");
console.log(configuracao)
		if (inputWebhookUrl) inputWebhookUrl.value = configuracao?.webhook_url || "";
		if (checkWebhookAtivo) checkWebhookAtivo.checked = configuracao?.webhook_status === 1 || configuracao?.webhook_status === true;
		if (inputMensagemRejeicao) inputMensagemRejeicao.value = configuracao?.msg_rejectcalls || "";
		if (checkRejeitarChamada) checkRejeitarChamada.checked = configuracao?.rejeitar_ligacoes === 1 || configuracao?.rejeitar_ligacoes === true;
		if (checkIgnorarGrupos) checkIgnorarGrupos.checked = configuracao?.ignorar_grupos === 1 || configuracao?.ignorar_grupos === true;
		if (checkSempreOnline) checkSempreOnline.checked = configuracao?.leitura_automatica === 1 || configuracao?.leitura_automatica === true;

		if (selectEventos) {
			const eventosAtivos = Array.isArray(configuracao?.events)
				? configuracao.events
				: [];

			Array.from(selectEventos.options).forEach((opcao) => {
				opcao.selected = eventosAtivos.includes(opcao.value);
			});
		}

		const ativoProxy = proxy?.active === 1 || proxy?.active === true;
		if (checkProxyAtivo) checkProxyAtivo.checked = ativoProxy;

		const inputProtocol = document.getElementById("proxy-protocol");
		const inputUsername = document.getElementById("proxy-username");
		const inputPassword = document.getElementById("proxy-password");
		const inputPort = document.getElementById("proxy-port");
		const inputHost = document.getElementById("proxy-host");

		if (inputProtocol) inputProtocol.value = proxy?.protocol || "http";
		if (inputUsername) inputUsername.value = proxy?.username || "";
		if (inputPassword) inputPassword.value = proxy?.password || "";
		if (inputPort) inputPort.value = proxy?.port || "";
		if (inputHost) inputHost.value = proxy?.host || "";

		alternarAreaProxy(ativoProxy);
	}

	function alternarAreaProxy(ativo) {
		const areaProxy = document.getElementById("config-proxy");
		if (!areaProxy) return;
		areaProxy.classList.toggle("d-none", !ativo);
	}

	async function abrirModalConfiguracao(apikey, botao) {
		const textoOriginal = botao?.querySelector(".btn-text")?.textContent || "Configuração";
		definirEstadoCarregandoBotao(botao, true, textoOriginal, "Carregando...");

		try {
			apikeyInstanciaEmConfiguracao = apikey;

			const [respostaConfig, respostaStatus] = await Promise.all([
				fazerRequisicaoApi("/api/config/session", "GET", null, apikey),
				fazerRequisicaoApi("/api/session/status", "GET", null, apikey),
			]);

			if (!respostaConfig.sucesso) {
				mostrarNotificacao("erro", "Falha ao abrir configuração", respostaConfig.mensagem);
				return;
			}

			const dadosConfig = respostaConfig?.dados || {};
			const configSessao = dadosConfig?.config || {};
			const proxySessao = dadosConfig?.proxy || {};

			preencherModalConfiguracao(configSessao, proxySessao);
			preencherCamposInfoInstancia(apikey, respostaStatus?.dados || null);

			const modalConfig = bootstrap.Modal.getOrCreateInstance(document.getElementById("configSessao"));
			modalConfig.show();
		} finally {
			definirEstadoCarregandoBotao(botao, false, textoOriginal, "Carregando...");
		}
	}

	async function salvarConfiguracoesInstancia(evento) {
		evento.preventDefault();

		if (!apikeyInstanciaEmConfiguracao) {
			mostrarNotificacao("erro", "Sessão inválida", "Nenhuma instância selecionada para configurar.");
			return;
		}

		const botaoSalvar = formConfigInstancia?.querySelector('button[type="submit"]');
		const textoOriginal = botaoSalvar?.querySelector(".btn-text")?.textContent || "Salvar";
		definirEstadoCarregandoBotao(botaoSalvar, true, textoOriginal, "Salvando...");

		try {
			const webhookUrl = document.getElementById("webhook-url")?.value?.trim() || "";
			const webhookAtivo = document.getElementById("webhook-status")?.checked === true;
			const selectEventos = document.getElementById("events[]");
			const eventos = selectEventos
				? Array.from(selectEventos.selectedOptions).map((opt) => opt.value)
				: [];

			if (webhookUrl) {
				try {
					new URL(webhookUrl);
				} catch (erroUrl) {
					mostrarNotificacao("aviso", "Webhook inválido", "Informe uma URL de webhook válida.");
					return;
				}
			}

			const ignoreGroups = document.getElementById("ignorar-grupos")?.checked === true;
			const autoRead = document.getElementById("sempre-online")?.checked === true;
			const rejectCalls = document.getElementById("rejeitar-chamada")?.checked === true;
			const msgRejectCalls = document.getElementById("mensagem-rejeicao")?.value?.trim() || "";

			const proxyAtivo = document.getElementById("proxy-ativo")?.checked === true;
			const proxyPayload = {
				active: proxyAtivo,
				protocol: document.getElementById("proxy-protocol")?.value?.trim() || "http",
				username: document.getElementById("proxy-username")?.value?.trim() || "",
				password: document.getElementById("proxy-password")?.value?.trim() || "",
				port: document.getElementById("proxy-port")?.value?.trim() || "",
				host: document.getElementById("proxy-host")?.value?.trim() || "",
			};

			if (proxyAtivo && (!proxyPayload.protocol || !proxyPayload.host || !proxyPayload.port)) {
				mostrarNotificacao("aviso", "Proxy incompleto", "Preencha protocolo, host e porta para ativar o proxy.");
				return;
			}

			const [resWebhook, resConfig, resProxy] = await Promise.all([
				fazerRequisicaoApi(
					"/api/config/webhook",
					"PUT",
					{
						webhookUrl,
						status_webhook: webhookAtivo,
						events: eventos,
					},
					apikeyInstanciaEmConfiguracao,
				),
				fazerRequisicaoApi(
					"/api/config/config",
					"PUT",
					{
						ignoreGroups,
						autoRead,
						rejectCalls,
						msg_rejectcalls: msgRejectCalls,
					},
					apikeyInstanciaEmConfiguracao,
				),
				fazerRequisicaoApi(
					"/api/config/proxy",
					"PUT",
					proxyPayload,
					apikeyInstanciaEmConfiguracao,
				),
			]);

			if (!resWebhook.sucesso || !resConfig.sucesso || !resProxy.sucesso) {
				const mensagemErro =
					resWebhook.mensagem || resConfig.mensagem || resProxy.mensagem || "Erro ao salvar configurações.";
				mostrarNotificacao("erro", "Falha ao salvar", mensagemErro);
				return;
			}

			mostrarNotificacao("sucesso", "Configurações salvas", "As preferências da instância foram atualizadas com sucesso.");

			const modalConfig = bootstrap.Modal.getOrCreateInstance(document.getElementById("configSessao"));
			modalConfig.hide();
			await atualizarStatusInstancias();
		} finally {
			definirEstadoCarregandoBotao(botaoSalvar, false, textoOriginal, "Salvando...");
		}
	}

	async function testarWebhook() {
		const urlWebhook = document.getElementById("webhook-url")?.value?.trim() || "";
		const webhookAtivo = document.getElementById("webhook-status")?.checked === true;

		if (!urlWebhook) {
			mostrarNotificacao("aviso", "Webhook vazio", "Informe uma URL para testar o webhook.");
			return;
		}

		try {
			new URL(urlWebhook);
		} catch {
			mostrarNotificacao("aviso", "URL inválida", "A URL informada para webhook não é válida.");
			return;
		}

		if (!webhookAtivo) {
			mostrarNotificacao("aviso", "Webhook desativado", "Ative o webhook antes de realizar o teste.");
			return;
		}

		const textoOriginal = botaoTestarWebhook?.textContent || "Testar webhook";
		if (botaoTestarWebhook) {
			botaoTestarWebhook.disabled = true;
			botaoTestarWebhook.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Testando...';
		}

		try {
			const payloadTeste = {
				event: "webhook_teste",
				sessionId: apikeyInstanciaEmConfiguracao,
				data: {
					mensagem: "Teste de webhook disparado pelo painel do cliente.",
					timestamp: new Date().toISOString(),
				},
			};

			const resposta = await fetch(urlWebhook, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payloadTeste),
			});

			if (!resposta.ok) {
				mostrarNotificacao(
					"erro",
					"Teste falhou",
					`Webhook respondeu com status ${resposta.status}.`,
				);
				return;
			}

			mostrarNotificacao("sucesso", "Teste enviado", "Evento de teste enviado para o webhook com sucesso.");
		} catch (erro) {
			mostrarNotificacao(
				"erro",
				"Erro no teste",
				"Não foi possível testar o webhook (possível bloqueio de CORS/rede).",
			);
		} finally {
			if (botaoTestarWebhook) {
				botaoTestarWebhook.disabled = false;
				botaoTestarWebhook.innerHTML = '<i class="bi bi-broadcast me-1"></i> Testar webhook';
			}
		}
	}

	async function copiarTexto(valor) {
		try {
			await navigator.clipboard.writeText(valor);
			mostrarNotificacao("sucesso", "Copiado", "Texto copiado para a área de transferência.");
		} catch (erro) {
			mostrarNotificacao("erro", "Falha ao copiar", "Não foi possível copiar o conteúdo.");
		}
	}

	document.addEventListener("click", async (evento) => {
		const botaoCopiar = evento.target.closest(".copiar-btn");
		if (botaoCopiar) {
			const texto = botaoCopiar.getAttribute("data-copy") || "";
			if (texto) {
				await copiarTexto(texto);
			}
			return;
		}

		const botaoConectar = evento.target.closest(".btn-generate");
		if (botaoConectar) {
			const apikey = botaoConectar.getAttribute("data-apikey");
			if (apikey) {
				await conectarInstancia(apikey, botaoConectar);
			}
			return;
		}

		const botaoDesconectar = evento.target.closest(".btn-disconnect");
		if (botaoDesconectar) {
			const apikey = botaoDesconectar.getAttribute("data-apikey");
			if (apikey) {
				await desconectarInstancia(apikey, botaoDesconectar);
			}
			return;
		}

		const botaoReiniciar = evento.target.closest(".btn-restart");
		if (botaoReiniciar) {
			const apikey = botaoReiniciar.getAttribute("data-apikey");
			if (apikey) {
				await reiniciarInstancia(apikey, botaoReiniciar);
			}
			return;
		}

		const botaoConfig = evento.target.closest(".btn-config");
		if (botaoConfig) {
			const apikey = botaoConfig.getAttribute("data-apikey");
			if (apikey) {
				await abrirModalConfiguracao(apikey, botaoConfig);
			}
		}
	});

	if (botaoTestarWebhook) {
		botaoTestarWebhook.addEventListener("click", testarWebhook);
	}

	if (formConfigInstancia) {
		formConfigInstancia.addEventListener("submit", salvarConfiguracoesInstancia);
	}

	if (toggleProxyAtivo) {
		toggleProxyAtivo.addEventListener("change", function aoAlterarProxy() {
			alternarAreaProxy(this.checked === true);
		});
	}

	document.getElementById("modalQR")?.addEventListener("hidden.bs.modal", () => {
		document.getElementById("qr-code-img")?.setAttribute("src", "");
		const infoCodigo = document.getElementById("qr-code-info");
		const infoDetalhes = document.getElementById("info-detalhes");
		if (infoCodigo) infoCodigo.textContent = "";
		if (infoDetalhes) infoDetalhes.textContent = "";
	});

	document.getElementById("configSessao")?.addEventListener("hidden.bs.modal", () => {
		apikeyInstanciaEmConfiguracao = null;
	});

	function iniciarAtualizacaoAutomatica() {
		if (intervaloAtualizacao) {
			clearInterval(intervaloAtualizacao);
		}

		intervaloAtualizacao = setInterval(() => {
			if (!document.hidden) {
				atualizarStatusInstancias();
			}
		}, intervaloAtualizacaoMs);
	}

	configurarFallbackAvatar();
	await atualizarStatusInstancias();
	iniciarAtualizacaoAutomatica();
});
