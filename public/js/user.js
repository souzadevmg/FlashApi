const el = document.getElementById('userInfo');
let instacias = JSON.parse(el?.dataset.instance || '[]');
const apiurl = `${window.location.protocol}//${window.location.host}`;

const ui = {
    messageResult: document.getElementById('messageStudioResult'),
    groupResult: document.getElementById('groupManagerResult'),
    sessionResult: document.getElementById('sessionLabResult')
};

function logResult(target, message, isError = false) {
    const box = ui[target];
    if (!box) return;
    box.textContent = message;
    box.classList.toggle('error', isError);
}

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

function parseTargets(raw) {
    return unique(
        String(raw || '')
            .split(/[\n,;\s]+/)
            .map((v) => v.trim())
            .filter((v) => v.length > 0)
    );
}

function getInstanceById(instanceId) {
    return instacias.find((i) => String(i.id) === String(instanceId));
}

function getInstanceByApiKey(apikey) {
    return instacias.find((i) => String(i.apikey) === String(apikey));
}

function getSelectedApiKey(selectId) {
    const select = document.getElementById(selectId);
    return select?.value || instacias[0]?.apikey;
}

function fillSelect(selectId, items, mapLabel) {
    const select = document.getElementById(selectId);
    if (!select) return;

    select.innerHTML = '';
    items.forEach((item) => {
        const option = document.createElement('option');
        option.value = item.apikey;
        option.textContent = mapLabel(item);
        select.appendChild(option);
    });
}

function fillInstanceSelectors() {
    fillSelect('msgInstanceSelect', instacias, (i) => `${i.nome_sessao} (${i.status})`);
    fillSelect('groupInstanceSelect', instacias, (i) => `${i.nome_sessao} (${i.status})`);
    fillSelect('sessionRecreateSelect', instacias, (i) => `${i.nome_sessao} (${i.status})`);
}

function setActionLoading(button, loadingText) {
    if (!button) return;
    button.dataset.originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>${loadingText}`;
}

function clearActionLoading(button) {
    if (!button) return;
    button.disabled = false;
    if (button.dataset.originalText) {
        button.innerHTML = button.dataset.originalText;
    }
}

async function apiGet(url, apikey) {
    return axios.get(url, { headers: { apikey } });
}

async function apiPost(url, payload, apikey) {
    return axios.post(url, payload, { headers: { apikey } });
}

async function apiPut(url, payload, apikey) {
    return axios.put(url, payload, { headers: { apikey } });
}

async function apiDelete(url, apikey) {
    return axios.delete(url, { headers: { apikey } });
}

function showTypeFields(type) {
    document.querySelectorAll('.message-type-fields').forEach((el) => {
        if (el.dataset.type === type) {
            el.classList.remove('d-none');
        } else {
            el.classList.add('d-none');
        }
    });
}

async function loadRecipients() {
    const apikey = getSelectedApiKey('msgInstanceSelect');
    const targetSelect = document.getElementById('targetMultiSelect');
    if (!targetSelect || !apikey) return;

    targetSelect.innerHTML = '';

    try {
        const [contactsRes, groupsRes] = await Promise.all([
            apiGet(`${apiurl}/api/contact/list`, apikey),
            apiGet(`${apiurl}/api/group/list`, apikey)
        ]);

        const contacts = contactsRes.data?.data?.contacts || [];
        const groups = groupsRes.data?.data?.groups || [];

        contacts.forEach((c) => {
            const jid = c.jid || c.id;
            if (!jid) return;
            const option = document.createElement('option');
            option.value = jid;
            option.textContent = `[Contato] ${c.nome || c.name || c.notify || jid}`;
            targetSelect.appendChild(option);
        });

        groups.forEach((g) => {
            const gid = g.jid || g.id;
            if (!gid) return;
            const option = document.createElement('option');
            option.value = gid;
            option.textContent = `[Grupo] ${g.subject || g.nome || gid}`;
            targetSelect.appendChild(option);
        });

        logResult('messageResult', `Destinos carregados: ${contacts.length} contatos e ${groups.length} grupos.`);
    } catch (error) {
        logResult('messageResult', 'Nao foi possivel carregar contatos/grupos. Verifique se a sessao esta conectada.', true);
    }
}

function getTargetsFromForm() {
    const mode = document.getElementById('targetMode')?.value || 'selected';
    const selected = Array.from(document.getElementById('targetMultiSelect')?.selectedOptions || []).map((o) => o.value);
    const manual = parseTargets(document.getElementById('manualTargets')?.value);

    if (mode === 'selected') return unique(selected);
    if (mode === 'manual') return unique(manual);
    return unique([...selected, ...manual]);
}

function commonPayload() {
    return {
        delay: Number(document.getElementById('messageDelay')?.value || 0),
        useQueue: document.getElementById('messageUseQueue')?.checked === true,
        MarkAll: document.getElementById('messageMarkAll')?.checked === true
    };
}

function payloadByType(type, to) {
    const common = commonPayload();

    switch (type) {
        case 'text':
            return {
                endpoint: '/api/chat/send-text',
                payload: {
                    to,
                    text: document.getElementById('fieldText')?.value || '',
                    linkPreview: document.getElementById('fieldLinkPreview')?.checked === true,
                    ...common
                }
            };
        case 'image':
            return {
                endpoint: '/api/chat/send-image',
                payload: {
                    to,
                    image: document.getElementById('fieldImage')?.value || '',
                    caption: document.getElementById('fieldImageCaption')?.value || '',
                    ...common
                }
            };
        case 'video':
            return {
                endpoint: '/api/chat/send-video',
                payload: {
                    to,
                    video: document.getElementById('fieldVideo')?.value || '',
                    caption: document.getElementById('fieldVideoCaption')?.value || '',
                    gifPlayback: document.getElementById('fieldGifPlayback')?.checked === true,
                    ...common
                }
            };
        case 'audio':
            return {
                endpoint: '/api/chat/send-audio',
                payload: {
                    to,
                    audio: document.getElementById('fieldAudio')?.value || '',
                    ptt: document.getElementById('fieldPtt')?.checked === true,
                    ...common
                }
            };
        case 'document':
            return {
                endpoint: '/api/chat/send-document',
                payload: {
                    to,
                    document: document.getElementById('fieldDocument')?.value || '',
                    fileName: document.getElementById('fieldFileName')?.value || '',
                    mimetype: document.getElementById('fieldMimeType')?.value || '',
                    caption: document.getElementById('fieldDocumentCaption')?.value || '',
                    ...common
                }
            };
        case 'location':
            return {
                endpoint: '/api/chat/send-location',
                payload: {
                    to,
                    latitude: Number(document.getElementById('fieldLatitude')?.value || 0),
                    longitude: Number(document.getElementById('fieldLongitude')?.value || 0),
                    name: document.getElementById('fieldLocationName')?.value || '',
                    address: document.getElementById('fieldLocationAddress')?.value || '',
                    ...common
                }
            };
        case 'contact':
            return {
                endpoint: '/api/chat/send-contact',
                payload: {
                    to,
                    contact: {
                        displayName: document.getElementById('fieldContactName')?.value || 'Contato',
                        vcard: document.getElementById('fieldContactVcard')?.value || ''
                    },
                    ...common
                }
            };
        case 'sticker':
            return {
                endpoint: '/api/chat/send-sticker',
                payload: {
                    to,
                    sticker: document.getElementById('fieldSticker')?.value || '',
                    ...common
                }
            };
        case 'poll': {
            const options = parseTargets((document.getElementById('fieldPollOptions')?.value || '').replace(/\n/g, ','));
            return {
                endpoint: '/api/chat/send-poll',
                payload: {
                    to,
                    name: document.getElementById('fieldPollName')?.value || '',
                    options,
                    selectableCount: Number(document.getElementById('fieldPollSelectableCount')?.value || 1),
                    ...common
                }
            };
        }
        case 'reaction':
            return {
                endpoint: '/api/chat/send-reaction',
                payload: {
                    to,
                    messageId: document.getElementById('fieldReactionMessageId')?.value || '',
                    emoji: document.getElementById('fieldReactionEmoji')?.value || ''
                }
            };
        case 'typing':
            return {
                endpoint: '/api/chat/typing',
                payload: {
                    to,
                    typing: document.getElementById('fieldTyping')?.value === 'true'
                }
            };
        case 'mark-read':
            return {
                endpoint: '/api/chat/mark-read',
                payload: {
                    jid: to,
                    messageId: document.getElementById('fieldMarkReadMessageId')?.value || undefined
                }
            };
        case 'list': {
            const listMessage = JSON.parse(document.getElementById('fieldListJson')?.value || '{}');
            return {
                endpoint: '/api/chat/send-list',
                payload: {
                    to,
                    listMessage,
                    ...common
                }
            };
        }
        case 'buttons': {
            const buttons = JSON.parse(document.getElementById('fieldButtonsJson')?.value || '[]');
            return {
                endpoint: '/api/chat/send-buttons',
                payload: {
                    to,
                    text: document.getElementById('fieldButtonsText')?.value || '',
                    footer: document.getElementById('fieldButtonsFooter')?.value || '',
                    buttons,
                    ...common
                }
            };
        }
        default:
            throw new Error('Tipo de mensagem nao suportado.');
    }
}

async function handleMessageSend(event) {
    event.preventDefault();

    const sendBtn = event.submitter || document.querySelector('#messageStudioForm button[type="submit"]');
    setActionLoading(sendBtn, 'Enviando');

    const apikey = getSelectedApiKey('msgInstanceSelect');
    const type = document.getElementById('messageType')?.value || 'text';
    const targets = getTargetsFromForm();

    if (!apikey) {
        logResult('messageResult', 'Nenhuma instancia disponivel.', true);
        clearActionLoading(sendBtn);
        return;
    }

    if (targets.length === 0) {
        logResult('messageResult', 'Selecione ao menos um destino ou informe JIDs manuais.', true);
        clearActionLoading(sendBtn);
        return;
    }

    const results = [];

    for (const to of targets) {
        try {
            const { endpoint, payload } = payloadByType(type, to);
            const response = await apiPost(`${apiurl}${endpoint}`, payload, apikey);
            const ok = response.data?.success === true;
            results.push({ to, ok, message: response.data?.message || (ok ? 'OK' : 'Falha') });
        } catch (error) {
            results.push({
                to,
                ok: false,
                message: error.response?.data?.message || error.message || 'Erro ao enviar'
            });
        }
    }

    const success = results.filter((r) => r.ok).length;
    const failed = results.length - success;
    const lines = [
        `Tipo: ${type}`,
        `Total destinos: ${results.length}`,
        `Sucesso: ${success}`,
        `Falhas: ${failed}`,
        '---',
        ...results.map((r) => `${r.ok ? 'OK' : 'ERRO'} | ${r.to} | ${r.message}`)
    ];

    logResult('messageResult', lines.join('\n'), failed > 0);
    clearActionLoading(sendBtn);
}

function buildGroupPayload(action) {
    const groupJid = document.getElementById('groupJid')?.value?.trim();
    const subject = document.getElementById('groupSubject')?.value?.trim();
    const description = document.getElementById('groupDescription')?.value?.trim();
    const participants = parseTargets(document.getElementById('groupParticipants')?.value);

    switch (action) {
        case 'info':
            return { endpoint: '/api/group/info', payload: { groupJid } };
        case 'create':
            return { endpoint: '/api/group/create', payload: { subject, participants } };
        case 'add-participant':
            return { endpoint: '/api/group/add-participant', payload: { groupJid, participants } };
        case 'remove-participant':
            return { endpoint: '/api/group/remove-participant', payload: { groupJid, participants } };
        case 'promote':
            return { endpoint: '/api/group/promote', payload: { groupJid, participants } };
        case 'demote':
            return { endpoint: '/api/group/demote', payload: { groupJid, participants } };
        case 'update-subject':
            return { endpoint: '/api/group/update-subject', payload: { groupJid, subject } };
        case 'update-description':
            return { endpoint: '/api/group/update-description', payload: { groupJid, description } };
        case 'up-setting':
            return { endpoint: '/api/group/up-setting', payload: { groupJid, subject } };
        case 'leave':
            return { endpoint: '/api/group/leave', payload: { groupJid } };
        default:
            throw new Error('Acao de grupo nao suportada.');
    }
}

async function handleGroupAction(event) {
    event.preventDefault();

    const apikey = getSelectedApiKey('groupInstanceSelect');
    const action = document.getElementById('groupAction')?.value;
    const submit = event.submitter || document.querySelector('#groupManagerForm button[type="submit"]');

    if (!apikey || !action) {
        logResult('groupResult', 'Instancia ou acao ausente.', true);
        return;
    }

    setActionLoading(submit, 'Executando');

    try {
        const { endpoint, payload } = buildGroupPayload(action);
        const response = await apiPost(`${apiurl}${endpoint}`, payload, apikey);
        logResult('groupResult', JSON.stringify(response.data, null, 2), response.data?.success !== true);
        await loadRecipients();
    } catch (error) {
        logResult('groupResult', error.response?.data?.message || error.message || 'Erro na operacao de grupo.', true);
    } finally {
        clearActionLoading(submit);
    }
}

async function recreateSessionUsingSameToken() {
    const btn = document.getElementById('btnRecreateSession');
    const apikey = getSelectedApiKey('sessionRecreateSelect');
    const instance = getInstanceByApiKey(apikey);

    if (!apikey || !instance) {
        logResult('sessionResult', 'Nenhuma instancia disponivel para recriar.', true);
        return;
    }

    setActionLoading(btn, 'Recriando');

    try {
        const restartRes = await apiPut(`${apiurl}/api/session/restart`, null, apikey);
        const connectRes = await apiPut(`${apiurl}/api/session/conectar_sessao`, null, apikey);

        if (connectRes.data?.qrcode) {
            $('#qr-code-info').html(`<strong>Codigo de conexao:</strong> ${connectRes.data.code || '-'}`);
            $('#qr-code-img').attr('src', connectRes.data.qrcode);
            $('#info-detalhes').html(`<strong>${connectRes.data.message || 'Escaneie o QR Code para concluir.'}</strong>`);
            // $('#modalQR').modal('show');
        }

        logResult(
            'sessionResult',
            `Sessao ${instance.nome_sessao} recriada com o mesmo token.\nRestart: ${restartRes.data?.message || 'ok'}\nConexao: ${connectRes.data?.message || 'ok'}`
        );
    } catch (error) {
        logResult('sessionResult', error.response?.data?.message || error.message || 'Falha ao recriar sessao.', true);
    } finally {
        clearActionLoading(btn);
    }
}

async function generateQRCode(instanceId, modal = true) {
    const getapikey = getInstanceById(instanceId);
    if (!getapikey) return;

    try {
        const response = await apiPut(`${apiurl}/api/session/conectar_sessao`, null, getapikey.apikey);
        if (response.data.success) {
            $('#qr-code-info').html(`<strong>Codigo de conexao:</strong> ${response.data.code}`);
            $('#qr-code-img').attr('src', response.data.qrcode);
            $('#info-detalhes').html(`<strong>${response.data.message}</strong>`);
            if (modal) {
                $('#modalQR').modal('show');
            }
        } else {
            alert(response.data.message || 'QR Code nao disponivel.');
        }
    } catch (error) {
        alert('Erro ao gerar sessao, tente novamente.');
    }
}

async function restartSession(instanceId) {
    const getapikey = getInstanceById(instanceId);
    if (!getapikey) return;

    try {
        const response = await apiPut(`${apiurl}/api/session/restart`, null, getapikey.apikey);
        if (response.data.success) {
            alert(response.data.message || 'Sessao reiniciada com sucesso.');
            window.location.reload();
        }
    } catch (error) {
        alert('Erro ao reiniciar sessao.');
    }
}

async function disconnectInstance(instanceId) {
    const getapikey = getInstanceById(instanceId);
    if (!getapikey) return;

    try {
        const response = await apiDelete(`${apiurl}/api/session/desconect/${getapikey.apikey}`, getapikey.apikey);
        alert(response.data?.message || 'Instancia desconectada.');
        window.location.reload();
    } catch (error) {
        alert(error.response?.data?.message || 'Erro ao desconectar instancia.');
    }
}

async function configuracao(instanceId) {
    const getapikey = getInstanceById(instanceId);
    if (!getapikey) return;

    const configProxy = document.getElementById('config-proxy');
    const getProxy = await getproxy(getapikey.apikey);
    if (!getProxy) {
        alert('Erro ao carregar configuracao de proxy, tente novamente.');
        return;
    }

    if (getProxy.proxy) {
        $('#proxy-ativo').prop('checked', getProxy.proxy.active == 1);
        $('#proxy-protocol').val(getProxy.proxy.protocol || 'http');
        $('#proxy-username').val(getProxy.proxy.username || '');
        $('#proxy-password').val(getProxy.proxy.password || '');
        $('#proxy-port').val(getProxy.proxy.port || '');
        $('#proxy-host').val(getProxy.proxy.host || '');

        if (getProxy.proxy.active == 1) {
            configProxy?.classList.remove('d-none');
        } else {
            configProxy?.classList.add('d-none');
        }
    } else {
        $('#proxy-ativo').prop('checked', false);
        $('#proxy-protocol').val('http');
        $('#proxy-username').val('');
        $('#proxy-password').val('');
        $('#proxy-port').val('');
        $('#proxy-host').val('');
        configProxy?.classList.add('d-none');
    }

    $('#id_sessao').attr('data-id', instanceId);
    $('#configSessao').modal('show');
    $('#webhook-url').val(getProxy.config?.webhook_url || '');
    $('#webhook-status').prop('checked', getProxy.config?.webhook_status == 1);
    $('[name="events[]"]').val(getProxy.config?.events || []);

    $('#mensagem-rejeicao').val(getProxy.config?.msg_rejectcalls || '');
    $('#rejeitar-chamada').prop('checked', getProxy.config?.rejeitar_ligacoes == 1);

    $('#sempre-online').prop('checked', getProxy.config?.leitura_automatica == 1);
    $('#ignorar-grupos').prop('checked', getProxy.config?.ignorar_grupos == 1);
}

async function getproxy(apikey) {
    try {
        const response = await apiGet(`${apiurl}/api/config/session`, apikey);
        if (response.data?.success) {
            return response.data.data || {};
        }
    } catch (error) {
        return null;
    }
    return null;
}

async function att_webhook(data, apikey) {
    try {
        const response = await apiPut(`${apiurl}/api/config/webhook`, data, apikey);
        return response.data?.success === true;
    } catch (error) {
        return false;
    }
}

async function att_config(data, apikey) {
    try {
        const response = await apiPut(`${apiurl}/api/config/config`, data, apikey);
        return response.data?.success === true;
    } catch (error) {
        return false;
    }
}

async function att_proxy(data, apikey) {
    try {
        const response = await apiPut(`${apiurl}/api/config/proxy`, data, apikey);
        return response.data?.success === true;
    } catch (error) {
        return false;
    }
}

function bindInstanceButtons() {
    document.querySelectorAll('.btn-generate').forEach((button) => {
        button.addEventListener('click', function () {
            const instanceId = this.dataset.id;
            const $btn = $(this);
            $btn.prop('disabled', true);
            $btn.find('.btn-text').text('Conectando...');
            $btn.find('.spinner-border').removeClass('d-none');
            generateQRCode(instanceId);
        });
    });

    document.querySelectorAll('.btn-disconnect').forEach((button) => {
        button.addEventListener('click', function () {
            const instanceId = this.dataset.id;
            const $btn = $(this);
            $btn.prop('disabled', true);
            $btn.find('.btn-text').text('Desconectando...');
            $btn.find('.spinner-border').removeClass('d-none');
            if (confirm('Deseja realmente desconectar a instancia?')) {
                disconnectInstance(instanceId);
            }
        });
    });

    document.querySelectorAll('.btn-restart').forEach((button) => {
        button.addEventListener('click', function () {
            const instanceId = this.dataset.id;
            const $btn = $(this);
            $btn.prop('disabled', true);
            $btn.find('.btn-text').text('Reiniciando...');
            $btn.find('.spinner-border').removeClass('d-none');
            if (confirm('Deseja realmente reiniciar a instancia?')) {
                setTimeout(() => restartSession(instanceId), 1000);
            }
        });
    });

    document.querySelectorAll('.btn-config').forEach((button) => {
        button.addEventListener('click', function () {
            configuracao(this.dataset.id);
        });
    });
}

function bindCopyButtons() {
    document.addEventListener('click', function (e) {
        const btn = e.target.closest('.copiar-btn');
        if (!btn) return;

        const valor = btn.getAttribute('data-copy');
        if (!valor) return;

        navigator.clipboard.writeText(valor)
            .then(() => {
                btn.classList.add('copied');
                setTimeout(() => btn.classList.remove('copied'), 1200);
            })
            .catch((err) => {
                console.error('Erro ao copiar:', err);
            });
    });
}

function bindCoreForms() {
    $('#modalQR').on('hidden.bs.modal', function () {
        window.location.reload();
    });

    $('#form-config-Instance').on('submit', async function (e) {
        e.preventDefault();
        const instanceId = $('#id_sessao').attr('data-id');
        const getapikey = getInstanceById(instanceId);
        if (!getapikey) {
            alert('Sessao nao encontrada');
            return;
        }

        const $btn = $(this).find('button[type="submit"]');
        $btn.prop('disabled', true);
        $btn.find('.btn-text').text('Salvando...');
        $btn.find('.spinner-border').removeClass('d-none');

        const okWebhook = await att_webhook(
            {
                events: $('[name="events[]"]').val(),
                status_webhook: $('#webhook-status').prop('checked') === true,
                webhookUrl: $('#webhook-url').val()
            },
            getapikey.apikey
        );

        const okConfig = await att_config(
            {
                ignoreGroups: $('#ignorar-grupos').prop('checked') === true,
                autoRead: $('#sempre-online').prop('checked') === true,
                rejectCalls: $('#rejeitar-chamada').prop('checked') === true,
                msg_rejectcalls: $('#mensagem-rejeicao').val()
            },
            getapikey.apikey
        );

        const okProxy = await att_proxy(
            {
                active: $('#proxy-ativo').prop('checked') === true,
                protocol: $('#proxy-protocol').val(),
                username: $('#proxy-username').val(),
                password: $('#proxy-password').val(),
                port: $('#proxy-port').val(),
                host: $('#proxy-host').val()
            },
            getapikey.apikey
        );

        if (okWebhook || okConfig || okProxy) {
            alert('Configuracoes atualizadas');
            window.location.reload();
        } else {
            alert('Nao foi possivel atualizar as configuracoes.');
        }
    });
}

function bindNewFeatures() {
    document.querySelectorAll('.btn-enviar').forEach((button) => {
        button.addEventListener('click', function () {
            const apikey = this.dataset.apikey;
            const section = document.getElementById('messageStudioSection');
            const msgSelect = document.getElementById('msgInstanceSelect');

            if (msgSelect && apikey) {
                msgSelect.value = apikey;
                loadRecipients();
            }

            section?.scrollIntoView({ behavior: 'smooth' });
        });
    });

    document.querySelectorAll('img.instance-avatar').forEach((img) => {
        img.addEventListener('error', function () {
            this.style.display = 'none';
        });
    });

    document.getElementById('proxy-ativo')?.addEventListener('change', function () {
        const configProxy = document.getElementById('config-proxy');
        if (this.checked) {
            configProxy?.classList.remove('d-none');
        } else {
            configProxy?.classList.add('d-none');
        }
    });

    document.getElementById('messageType')?.addEventListener('change', function () {
        showTypeFields(this.value);
    });

    document.getElementById('msgInstanceSelect')?.addEventListener('change', loadRecipients);
    document.getElementById('btnRefreshRecipients')?.addEventListener('click', loadRecipients);
    document.getElementById('messageStudioForm')?.addEventListener('submit', handleMessageSend);
    document.getElementById('groupManagerForm')?.addEventListener('submit', handleGroupAction);
    document.getElementById('btnRecreateSession')?.addEventListener('click', recreateSessionUsingSameToken);

    document.getElementById('btnClearMessageForm')?.addEventListener('click', () => {
        document.getElementById('messageStudioForm')?.reset();
        showTypeFields('text');
    });
}

(async function init() {
    fillInstanceSelectors();
    bindInstanceButtons();
    bindCopyButtons();
    bindCoreForms();
    bindNewFeatures();

    showTypeFields(document.getElementById('messageType')?.value || 'text');
    await loadRecipients();
})();
