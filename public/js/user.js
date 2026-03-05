

const el = document.getElementById('userInfo');
let instacias = JSON.parse(el.dataset.instance);
const apiurl = `${window.location.protocol}//${window.location.host}`

//Botão Conectar instacia
document.querySelectorAll('.btn-generate').forEach(button => {
    button.addEventListener('click', function () {
        const instanceId = this.dataset.id;
        const $btn = $(this);
        $btn.prop('disabled', true);
        $btn.find('.btn-text').text('Conectando...');
        $btn.find('.spinner-border').removeClass('d-none');
        generateQRCode(instanceId);
    });
});

//Botão Desconectar instacia
document.querySelectorAll('.btn-disconnect').forEach(button => {
    button.addEventListener('click', function () {
        const instanceId = this.dataset.id;
        const $btn = $(this);
        $btn.prop('disabled', true);
        $btn.find('.btn-text').text('Conectando...');
        $btn.find('.spinner-border').removeClass('d-none');
        if (confirm("Deseja realmente desconectar a instância?")) {
            disconnectInstance(instanceId);
        }
    });
});

//reniciar sessão
document.querySelectorAll('.btn-restart').forEach(button => {
    button.addEventListener('click', function () {
        const instanceId = this.dataset.id;
        const $btn = $(this);
        $btn.prop('disabled', true);
        $btn.find('.btn-text').text('Reiniciando...');
        $btn.find('.spinner-border').removeClass('d-none');
        if (confirm("Deseja realmente reiniciar a instância?")) {
            setTimeout(() => {
                restartSession(instanceId);
            }
                , 3000);
        }
    });
});


//botão atualizar qrcode
document.querySelectorAll('.btn-att-qrcode').forEach(button => {
    button.addEventListener('click', function () {
        const instanceId = this.dataset.id;
        $('#qr-code-info').html('');
        $('#qr-code-img').attr('src', '');
        $('#info-detalhes').html('')
        generateQRCode(instanceId);
    });
});

//botão condfiguração
document.querySelectorAll('.btn-config').forEach(button => {
    button.addEventListener('click', function () {
        const instanceId = this.dataset.id;
        configuracao(instanceId);
    });
});


//Função gerar qrcode
async function generateQRCode(instanceId, modal = true) {
    const getapikey = instacias.find(i => i.id == instanceId);

    try {
        const headers = {
            'apikey': getapikey.apikey
        }

        const response = await axios.put(`${apiurl}/api/session/conectar_sessao`, null, {
            headers
        })
        if (response.data.success) {
            $('.btn-att-qrcode').attr('data-id', instanceId)
            $('#qr-code-info').html(`<strong>Codigo de conexão:</strong> ${response.data.code}`);
            $('#qr-code-img').attr('src', response.data.qrcode);
            $('#info-detalhes').html(`<strong>${response.data.message}</strong>`)
            // Abre o modal
            if (modal) {
                $('#modalQR').modal('show');
            }
        } else {
            if (response.data.message) {
                alert(response.data.message);
            } else {
                alert("QR Code não disponível.");
                window.location.reload();
            }

        }
    } catch (error) {
        alert('Error ao gerar sessão tente novamente');
        window.location.reload();
    } finally {

    }
}

//função reiniciar sessão
async function restartSession(instanceId) {
    const getapikey = instacias.find(i => i.id == instanceId);
    try {
        const headers = {
            'apikey': getapikey.apikey
        }
        const response = await axios.put(`${apiurl}/api/session/restart`, null, {
            headers
        })
        if (response.data.success) {
            alert(response.data.message);
            window.location.reload();
        }
    } catch (error) {
        alert('Error ao reiniciar sessão tente novamente');
        window.location.reload();
    }
}

//Funcão desconectar instacia
async function disconnectInstance(instanceId) {
    const getapikey = instacias.find(i => i.id == instanceId);
    try {
        const headers = {
            'apikey': getapikey.apikey
        }

        const response = await axios.delete(`${apiurl}/api/session/desconect/${getapikey.apikey}`, {
            headers
        })
        if (response.data.success) {
            alert(response.data.message);
        } else {
            if (response.data.message) {
                alert(response.data.message);
            } else {
                alert("Error ao desconectar instacia.");
            }
        }
        window.location.reload();

    } catch (error) {
        alert('Error ao gerar sessão tente novamente');
    }
}

$('#modalQR').on('hidden.bs.modal', function () {
    window.location.reload();
});


async function configuracao(instanceId) {
    const getapikey = instacias.find(i => i.id == instanceId);
    if (getapikey) {
        $('#id_sessao').attr('data-id', instanceId);
        $('#configSessao').modal('show')
        $('#webhook-url').val(getapikey.webhook_url)
        $('#webhook-status').prop('checked', getapikey.webhook_status == '1')
        $('[name="events[]"]').val(getapikey.events);

        $('#mensagem-rejeicao').val(getapikey.msg_rejectcalls)
        $('#rejeitar-chamada').prop('checked', getapikey.rejeitar_ligacoes == '1')

        $('#sempre-online').prop('checked', getapikey.leitura_automatica == '1')
        $('#ignorar-grupos').prop('checked', getapikey.ignorar_grupos == '1')

    }
}

//Alterar configurações
$('#form-config-Instance').on('submit', async function (e) {
    e.preventDefault();
    const instanceId = $('#id_sessao').attr('data-id')
    const getapikey = instacias.find(i => i.id == instanceId);
    if (!getapikey) {
        alert('Sessão não encontrada');
        window.location.reload();
    }
    const $btn = $(this).find('button[type="submit"]');
    $btn.prop('disabled', true);
    $btn.find('.btn-text').text('Salvando...');
    $btn.find('.spinner-border').removeClass('d-none');


    //Webhook
    const events = $('[name="events[]"]').val();
    const status_webhook = $('#webhook-status').prop('checked');
    const webhookUrl = $('#webhook-url').val();
    const dados = {
        events,
        status_webhook: status_webhook == true,
        webhookUrl
    }
    const headers = {
        'apikey': getapikey.apikey
    }
    await att_webhook(dados, headers)

    //Config geral
    const ignoreGroups = $('#ignorar-grupos').prop('checked');
    const autoRead = $('#sempre-online').prop('checked');
    const rejectCalls = $('#rejeitar-chamada').prop('checked');
    const msg_rejectcalls = $('#mensagem-rejeicao').val();

    const dados2 = {
        ignoreGroups: ignoreGroups == true,
        autoRead: autoRead == true,
        rejectCalls: rejectCalls == true,
        msg_rejectcalls
    }

    await att_config(dados2, headers)
    alert('Configurações atualizadas')
    window.location.reload();

    // Simule async request
    // setTimeout(() => {
    //     // Após salvar...
    //     $('#configSessao').modal('hide');
    //     $btn.prop('disabled', false);
    //     $btn.find('.btn-text').text('Salvar');
    //     $btn.find('.spinner-border').addClass('d-none');
    // }, 2000);
});


//Função para atualizar webhook
async function att_webhook(data, headers) {
    try {
        const response = await axios.put(`${apiurl}/api/config/webhook`, data, {
            headers
        })
        if (response.data.success) {
            return true
        }
        return false
    } catch (error) {
        return false
    }
}

//Função para atualizar configuração geral
async function att_config(data, headers) {
    try {
        const response = await axios.put(`${apiurl}/api/config/config`, data, {
            headers
        })
        if (response.data.success) {
            return true
        }
        return false
    } catch (error) {
        return false
    }
}


// Copiar ao clicar
document.addEventListener('click', function (e) {
    if (e.target.classList.contains('copiar-btn')) {
        const valor = e.target.getAttribute('data-copy');
        navigator.clipboard.writeText(valor).then(() => {
            alert('Texto copiado com sucesso')
            e.target.textContent = '✅';
            setTimeout(() => {
                e.target.textContent = '📋';
            }, 1500);
        }).catch(err => {
            console.error('Erro ao copiar:', err);
        });
    }
});