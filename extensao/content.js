console.log("CONTENT SCRIPT RODANDO");
const WA_URL = 'web.whatsapp.com';

const params = new URLSearchParams(document.location.search);
const apiurl = params.get('apiurl')
const apikey = params.get('apikey')
let interval

if (!apiurl || !apikey) {
    console.log('Não sincronizar')

} else {
    showLoading();
    interval = setInterval(async () => {
        console.log("VERIFICANDO...");
        const status = getWhatsAppStatus();

        if (status == 'connected') {
            clearInterval(interval)
            await delay(5000)
            chrome.runtime.sendMessage({
                type: "EXTRACT_SESSION"
            });
            // Se a aba não for fechada automaticamente:
            hideLoading();
        }

    }, 9000);
}




function getWhatsAppStatus() {
    const loggedIn = !!document.querySelector('div[data-testid="chat-list"]');
    const qr = !!document.querySelector('canvas');

    if (loggedIn) return "connected";
    if (qr) return "qr";
    return "disconnected";
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}



chrome.runtime.onMessage.addListener(async (msg, sender) => {
    if (msg.type === "EXTRACT_RESULT") {

        if (msg.data?.creds && msg.data?.success) {
            try {
                const lastResult = {
                    creds: msg.data?.creds,
                    keys: msg.data?.keys
                }
                const response = await fetch(apiurl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        apikey: apikey,
                    },
                    body: JSON.stringify(lastResult),
                });

                if (!response.ok) {
                    console.log('erro ao conectar: ', await response.text())
                }

                const dados = await response.json();

            } catch (error) {
            } finally {
                chrome.runtime.sendMessage({
                    type: "CLOSE_TAB"
                });
            }
        }
    }

    if (msg.type === "EXTRACT_ERROR") {
        chrome.runtime.sendMessage({
            type: "CLOSE_TAB"
        });
    }
});

function showLoading() {
    if (document.getElementById("flashapi-loading")) return;

    const overlay = document.createElement("div");
    overlay.id = "flashapi-loading";

    overlay.innerHTML = `
        <div class="flashapi-box">
            <div class="flashapi-spinner"></div>
            <div class="flashapi-text">
                Conectando à FlashApi...<br>
                <small>Não clique em nada.</small>
            </div>
        </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
        #flashapi-loading{
            position:fixed;
            inset:0;
            z-index:2147483647;
            display:flex;
            align-items:center;
            justify-content:center;
            pointer-events:all;
        }

        .flashapi-box{
            text-align:center;
            font-family:Arial,sans-serif;
        }

        .flashapi-spinner{
            width:50px;
            height:50px;
            border:5px solid #ddd;
            border-top:5px solid #25D366;
            border-radius:50%;
            animation:flashSpin 1s linear infinite;
            margin:0 auto 20px;
        }

        .flashapi-text{
            font-size:20px;
            font-weight:bold;
            color: #ddd;
        }

        .flashapi-text small{
            display:block;
            margin-top:8px;
            font-size:14px;
            color: #ddd;
        }

        @keyframes flashSpin{
            to{
                transform:rotate(360deg);
            }
        }
    `;

    document.head.appendChild(style);
    document.body.appendChild(overlay);
}

function hideLoading() {
    document.getElementById("flashapi-loading")?.remove();
}