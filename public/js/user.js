document.addEventListener("DOMContentLoaded", async () => {

	const eventos = [
		"connection_update",
		"creds_update",
		"messaging_history_set",
		"messaging_history_status",
		"chats_upsert",
		"chats_update",
		"lid_mapping_update",
		"chats_delete",
		"presence_update",
		"contacts_upsert",
		"contacts_update",
		"messages_delete",
		"messages_update",
		"messages_media_update",
		"messages_upsert",
		"messages_reaction",
		"message_receipt_update",
		"groups_upsert",
		"groups_update",
		"group_participants_update",
		"group_join_request",
		"group_member_tag_update",
		"blocklist_set",
		"blocklist_update",
		"call",
		"labels_edit",
		"labels_association",
		"newsletter_reaction",
		"newsletter_view",
		"newsletter_participants_update",
		"newsletter_settings_update",
		"message_capping_update",
		"chats_lock",
		"settings_update"
	];

	let dados_sessao = null;

	const container = document.getElementById("events-container");

	const apiurl = window.location.origin + "/api";
	const botaoTestarWebhook = document.getElementById('btn-testar-webhook');
	const apikey = document.getElementById('userInfo').getAttribute('data-apikey');
	const name_hello = document.getElementById('name_hello');

	const info_instancia_apikey = document.getElementById('info_instancia_apikey');
	const info_instancia_status = document.getElementById('info_instancia_status');
	const info_instancia_nome = document.getElementById('info_instancia_nome');
	const info_instancia_numero = document.getElementById('info_instancia_numero');

	const form_webhook = document.getElementById('form_webhook');
	const iconCardWebhook = document.getElementById('icon-card-webhook');
	const webhook_status = document.getElementById('webhook_status');
	const webhook_url = document.getElementById('webhook-url');

	const form_chamadas = document.getElementById('form_chamadas');
	const iconCardChamadas = document.getElementById('icon-card-chamadas');
	const msg_chamadas = document.getElementById('msg_chamadas');
	const chamadas_status = document.getElementById('chamadas_status')

	const form_proxy = document.getElementById('form_proxy');
	const iconCardProxy = document.getElementById('icon-card-proxy');
	const proxy_status = document.getElementById('proxy_status');
	const proxy_protocol = document.getElementById('proxy_protocol');
	const proxy_username = document.getElementById('proxy_username');
	const proxy_password = document.getElementById('proxy_password');
	const proxy_port = document.getElementById('proxy_port');
	const proxy_host = document.getElementById('proxy_host');

	const qr_code_info = document.getElementById('qr-code-info')
	const qr_info_detalhes = document.getElementById('info-detalhes')
	const qr_code_img = document.getElementById('qr-code-img')
	const qrContainer = document.getElementById("qr-container");

	const btn_reniciar_sessao = document.getElementById('btn_reniciar_sessao')

	//Configuração de proxy
	form_proxy.addEventListener('submit', async (e) => {
		e.preventDefault();
		const formData = new FormData(form_proxy);
		const dados = {
			protocol: formData.get("proxy_protocol"),
			username: formData.get("proxy_username"),
			password: formData.get("proxy_password"),
			host: formData.get("proxy_host"),
			port: formData.get("proxy_port"),
			active: formData.get("proxy_port") == 'true' ? true : false,
		};
		const sessao = await fazerRequisicaoApi(`${apiurl}/config/proxy`, "PUT", dados, apikey)
		if (sessao.success) {
			mostrarNotificacao('sucesso', 'Sucesso', 'Webhook alterado com sucesso')
			findSessao()
		} else {
			mostrarNotificacao('erro', 'Ops', sessao.message || "Erro ao atualizar webhook")
		}
	})

	document.getElementById('card_proxy_togget').addEventListener('click', () => {
		const getclass = document.getElementById('card_proxy')
		if (getclass.classList.value.includes('d-none')) {
			getclass.classList.remove('d-none')
			iconCardProxy.classList.replace("bi-chevron-down", "bi-chevron-up");
		} else {
			getclass.classList.add('d-none')
			iconCardProxy.classList.replace("bi-chevron-up", "bi-chevron-down");
		}
	})
	//Fim configuração de proxy

	//Configuração de webhook
	form_webhook.addEventListener('submit', async (e) => {
		e.preventDefault();
		const formData = new FormData(form_webhook);
		const dados = {
			status_webhook: formData.get("webhook_status") == 'on' ? true : false,
			webhookUrl: formData.get("webhook_url"),
			events: formData.getAll("events[]")
		};
		const sessao = await fazerRequisicaoApi(`${apiurl}/config/webhook`, "PUT", dados, apikey)
		if (sessao.success) {
			mostrarNotificacao('sucesso', 'Sucesso', 'Webhook alterado com sucesso')
			findSessao()
		} else {
			mostrarNotificacao('erro', 'Ops', sessao.message || "Erro ao atualizar webhook")
		}
	})

	document.getElementById('card_webhook_togget').addEventListener('click', () => {
		const getclass = document.getElementById('card_webhook')
		if (getclass.classList.value.includes('d-none')) {
			getclass.classList.remove('d-none')
			iconCardWebhook.classList.replace("bi-chevron-down", "bi-chevron-up");
		} else {
			getclass.classList.add('d-none')
			iconCardWebhook.classList.replace("bi-chevron-up", "bi-chevron-down");
		}
	})
	//Fim configuração de webhook

	//Configuração de chamada
	form_chamadas.addEventListener('submit', async (e) => {
		e.preventDefault();
		const formData = new FormData(form_chamadas);
		const dados = {
			rejectCall: formData.get("chamadas_status") == 'on' ? true : false,
			msg_rejectCall: formData.get("msg_chamadas"),
			ignoreGroups: dados_sessao.ignorar_grupos ? true : false,
			autoRead: dados_sessao.leitura_automatica ? true : false,
		};
		const sessao = await fazerRequisicaoApi(`${apiurl}/config/config`, "PUT", dados, apikey)
		if (sessao.success) {
			mostrarNotificacao('sucesso', 'Sucesso', 'Dados alterado com sucesso')
			findSessao()
		} else {
			mostrarNotificacao('erro', 'Ops', sessao.message || "Erro ao atualizar webhook")
		}
	})

	document.getElementById('card_chamadas_togget').addEventListener('click', () => {
		const getclass = document.getElementById('card_chamadas')
		if (getclass.classList.value.includes('d-none')) {
			getclass.classList.remove('d-none')
			iconCardChamadas.classList.replace("bi-chevron-down", "bi-chevron-up");
		} else {
			getclass.classList.add('d-none')
			iconCardChamadas.classList.replace("bi-chevron-up", "bi-chevron-down");
		}
	})
	//Fim configuração de chamada

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

	function normalizarStatus(dados) {
		const valor = String(dados.status || "disconnected").toLowerCase();
		if (valor === "connected") {
			qrContainer.classList.add("d-none");
			return `
			<div class="d-flex align-items-center gap-2 flex-wrap">
				<span class="badge bg-success">
					<i class="bi bi-check-circle-fill me-1"></i>Conectado
				</span>

				<button class="btn btn-sm btn-outline-danger btn-disconnect">
					<i class="bi bi-box-arrow-left me-1"></i>Desconectar
				</button>

				<button class="btn btn-sm btn-outline-warning btn-restart">
					<i class="bi bi-arrow-clockwise me-1"></i>Reiniciar
				</button>
			</div>
		`;
		}

		if (valor === "connecting" || valor === "qr_ready") {
			qr_code_img.src = dados.qrcode;
			qrContainer.classList.remove("d-none");
			if (dados.code) {
				qr_info_detalhes.textContent = `Conecta com codigo: ${dados.code}`
			}
			return `
			<div class="d-flex align-items-center gap-2 flex-wrap">
				<span class="badge bg-warning text-dark">
					<i class="bi bi-arrow-repeat me-1"></i>Conectando
				</span>

				<button class="btn btn-sm btn-outline-secondary" disabled>
					<i class="bi bi-hourglass-split me-1"></i>Aguardando...
				</button>

				<button class="btn btn-sm btn-outline-danger btn-disconnect">
					<i class="bi bi-box-arrow-left me-1"></i>Desconectar
				</button>
			</div>
		`;
		}
		qr_code_img.src = null;
		qrContainer.classList.add("d-none");
		return `
		<div class="d-flex align-items-center gap-2 flex-wrap">
			<span class="badge bg-danger">
				<i class="bi bi-x-circle-fill me-1"></i>Desconectado
			</span>

			<button class="btn btn-sm btn-success btn-generate">
				<i class="bi bi-play-circle me-1"></i>Conectar
			</button>
			<a class="btn btn-sm btn-success" href="https://web.whatsapp.com?apiurl=${apiurl}/session/creds&apikey=${apikey}" target="_brank>
				<i class="bi bi-play-circle me-1"></i>Conectar Via extensão
			</a>
		</div>
	`;
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
					success: false,
					message: corpoResposta?.message || mensagemErroPadrao
				};
			}

			return corpoResposta;
		} catch (erro) {
			console.log(erro)
			return {
				success: false,
				mensagem: erro?.message || "Erro inesperado na comunicação com o servidor.",
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


	async function testarWebhook() {
		const urlWebhook = webhook_url?.value?.trim() || "";
		const webhookAtivo = webhook_status?.checked === true;

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
				sessionId: apikey,
				data: {
					mensagem: "Teste de webhook disparado pelo painel do cliente.",
					timestamp: new Date().toISOString(),
				},
			};

			const resposta = await fazerRequisicaoApi(urlWebhook, "POST", payloadTeste, null)

			mostrarNotificacao("sucesso", "Teste enviado", `Evento de teste enviado Webhook respondeu com: ${JSON.stringify(resposta)}`);
		} catch (erro) {
			console.log(erro)
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
			botaoConectar.disabled = true
			botaoConectar.textContent = "Aguarde..."
			const res = await fazerRequisicaoApi(`${apiurl}/session/conectar_sessao`, "PUT", null, apikey)
			if (res.success) {
				findSessao();
				return mostrarNotificacao('sucesso', 'Sucesso', 'Qrcode gerado com sucesso');

			} else {
				botaoConectar.disabled = false
				botaoConectar.textContent = "Conectar"
				return mostrarNotificacao('erro', 'Ops', res.message || 'Erro ao reniciar sessão');
			}
			return;
		}

		const botaoDesconectar = evento.target.closest(".btn-disconnect");
		if (botaoDesconectar) {
			if (confirm('Tem certeza desconectar sessão ?')) {
				botaoDesconectar.disabled = true
				botaoDesconectar.textContent = "Aguarde..."
				const res = await fazerRequisicaoApi(`${apiurl}/session/desconect/`, "DELETE", null, apikey)
				if (res.success) {
					findSessao();
					return mostrarNotificacao('sucesso', 'Sucesso', 'Sessão Desconectada com sucesso');

				} else {
					botaoDesconectar.disabled = false
					botaoDesconectar.textContent = "Desconectar"
					return mostrarNotificacao('erro', 'Ops', res.message || 'Erro ao reniciar sessão');
				}
			}
			return;
		}

		const botaoRestart = evento.target.closest(".btn-restart");
		if (botaoRestart) {
			if (confirm('Tem certeza reniciar sessão ?')) {
				const res = await fazerRequisicaoApi(`${apiurl}/session/restart`, "PUT", null, apikey)
				if (res.success) {
					findSessao();
					return mostrarNotificacao('sucesso', 'Sucesso', 'Sessão reniciada com sucesso');

				} else {
					return mostrarNotificacao('erro', 'Ops', res.message || 'Erro ao reniciar sessão');
				}
			}
			return;
		}
	});

	if (botaoTestarWebhook) {
		botaoTestarWebhook.addEventListener("click", testarWebhook);
	}

	async function findSessao(render = false) {
		const sessao = await fazerRequisicaoApi(`${apiurl}/session/status/`, "GET", null, apikey)
		if (sessao.success) {
			const dados = sessao.dados
			dados_sessao = dados

			name_hello.innerHTML = `<span class="badge bg-primary">${dados.nome_sessao}</span>`;

			info_instancia_apikey.innerHTML = `
    			<span class="badge bg-dark font-monospace">${dados.apikey}</span>`;

			info_instancia_nome.innerHTML = `
    			<span class="badge bg-primary">${dados.nome_sessao}</span>`;

			info_instancia_numero.innerHTML = dados.numero
				? `<span class="badge bg-success">${dados.numero}</span>`
				: `<span class="badge bg-secondary">Não conectado</span>`;
			info_instancia_status.innerHTML = normalizarStatus(dados)



			if (render) {
				renderDados(dados)
			}
		}
	}

	function renderDados(dados) {

		chamadas_status.checked = dados.rejeitar_ligacoes
		msg_chamadas.value = dados.msg_rejectcalls

		proxy_host.value = dados.proxy?.host
		proxy_username.value = dados.proxy?.username
		proxy_password.value = dados.proxy?.password
		proxy_port.value = dados.proxy?.port
		proxy_protocol.value = dados.proxy?.protocol
		proxy_status.value = dados.proxy?.active == true ? 'true' : 'false'

		webhook_url.value = dados.webhook_url ? dados.webhook_url : ""
		webhook_status.checked = dados.webhook_status == 1 ? true : false
		container.innerHTML = eventos.map(evento => `
    		<div class="col-md-4">
    		    <div class="form-check">
    		        <input
    		            class="form-check-input"
    		            type="checkbox"
    		            name="events[]"
    		            value="${evento}"
    		            id="${evento}"
    		            ${dados?.events?.includes(evento) ? "checked" : ""}
    		        >
    		        <label class="form-check-label" for="${evento}">
    		            ${evento}
    		        </label>
    		    </div>
    		</div>
		`).join("");
	}

	setInterval(() => {
		findSessao()
	}, 4000);

	findSessao(true);
	configurarFallbackAvatar();
});
