import fs from "fs/promises";
import path from "path";
import { WAProto as proto, initAuthCreds, BufferJSON } from "@whiskeysockets/baileys";
import { execute, getDbClient } from "../config/database.js";
import BaileysService from "./BaileysService.js";

export default async function usePostgresAuthState(sessionID, saveOnlyCreds = false) {
  // parametro para informar ao script para salvar apenas a key creds no DB
  // essa key é a principal necessaria para o baileys autenticar no whasapp web
  // adicionei essa função pois pode se tornar problematico armazenar todas as keys no db sem nenhum controle, ainda mais se voce tiver varios bots usando o mesmo db
  // pode acabar salvando muitas keys que se tornam inuteis posteriormente e continuariam ocupando espaço no DB.
  // dessa forma, com o saveOnlyCreds = true, apenas a key necessaria para logar o bot é salva no DB e esse script irá
  // armazenar as demais localmente na pasta /sessions/<sessionID>/<key>.json

  const localFolder = path.join(process.cwd(), "sessions", sessionID); // pasta local pra salvamento das keys separadas por pastas de acordo com o sessionID
  const localFile = (key) => path.join(localFolder, fixFileName(key) + ".json"); // função que retorna o caminho absoluto da key ja com o nome normalizado
  if (saveOnlyCreds) await fs.mkdir(localFolder, { recursive: true }); // cria as pastas das sessoes caso o saveOnlyCreds = true

  async function withAuthClient(callback) {
    const client = await getDbClient();
    try {
      return await callback(client);
    } finally {
      client.release();
    }
  }

  async function writeData(data, key, client = null) {
    const dataString = JSON.stringify(data, BufferJSON.replacer);

    if (saveOnlyCreds && key != "creds") {
      // caso saveOnlyCreds = true, ele salva todas as keys localmente (exceto a creds.json)
      await fs.writeFile(localFile(key), dataString);
      return;
    }
    await insertOrUpdateAuthKey(sessionID, key, dataString, client);
    return;
  }

  async function readData(key, client = null) {
    try {
      let rawData = null;

      if (saveOnlyCreds && key != "creds") {
        // caso saveOnlyCreds = true, ele busca todas as keys localmente (exceto a creds.json)
        rawData = await fs.readFile(localFile(key), { encoding: "utf-8" });
      } else {
        rawData = await getAuthKey(sessionID, key, client);
      }

      const parsedData = JSON.parse(rawData, BufferJSON.reviver);
      return parsedData;
    } catch (error) {
      console.log("❌ readData", error.message);
      return null;
    }
  }

  async function removeData(key, client = null) {
    try {
      if (saveOnlyCreds && key != "creds") {
        // caso saveOnlyCreds = true, ele deleta a key localmente (exceto a creds.json)
        await fs.unlink(localFile(key));
      } else {
        await deleteAuthKey(sessionID, key, client);
      }
    } catch (error) {
      // Não fazer nada em caso de erro
    }
  }

  let creds = await readData("creds");
  if (!creds) {
    creds = initAuthCreds();
    await writeData(creds, "creds");
  }

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};

          await withAuthClient(async (client) => {
            for (const id of ids) {
              let value = await readData(`${type}-${id}`, client);
              if (type === "app-state-sync-key" && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            }
          });

          return data;
        },
        set: async (data) => {
          await withAuthClient(async (client) => {
            const toUpsert = [];
            const toDelete = [];

            for (const category in data) {
              for (const id in data[category]) {
                const value = data[category][id];
                const key = `${category}-${id}`;
                if (value) {
                  toUpsert.push({ keyId: key, keyJson: JSON.stringify(value, BufferJSON.replacer) });
                } else {
                  toDelete.push(key);
                }
              }
            }

            await client.query("BEGIN");
            try {
              if (toUpsert.length) {
                await bulkUpsertAuthKeys(sessionID, toUpsert, client);
              }
              if (toDelete.length) {
                await bulkDeleteAuthKeys(sessionID, toDelete, client);
              }
              await client.query("COMMIT");
            } catch (error) {
              await client.query("ROLLBACK");
              throw error;
            }
          });
        },
      },
    },
    saveCreds: () => {
      return withAuthClient((client) => writeData(creds, "creds", client));
    },
  };
}

const fixFileName = (file) => {
  // função que normaliza o nome da key
  if (!file) {
    return undefined;
  }
  const replacedSlash = file.replace(/\//g, "__");
  const replacedColon = replacedSlash.replace(/:/g, "-");
  return replacedColon;
};

async function runQuery(query, params = [], client = null) {
  if (client) {
    return client.query(query, params);
  }
  return execute(query, params);
}

async function insertOrUpdateAuthKey(botId, keyId, keyJson, client = null) {
  if (keyId.includes("lid-mapping") && keyId.includes("_reverse")) {
    const id = keyId.split("-")[2].split("_")[0];
    try {
        BaileysService.redis.set(`lid-mapping:${botId}:${id}`, keyJson.replace(/"/g, "").trim());
    } catch (error) {}
  }
  if (keyId.includes("lid-mapping")) return;
  const query = `
        INSERT INTO wa_session_keys (session_id, key_id, value_json, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (session_id, key_id)
        DO UPDATE SET
          value_json = EXCLUDED.value_json,
          updated_at = NOW()
    `;
  await runQuery(query, [botId, keyId, keyJson], client);
}

async function bulkUpsertAuthKeys(botId, items, client, chunkSize = 250) {
  for (let offset = 0; offset < items.length; offset += chunkSize) {
    const chunk = items.slice(offset, offset + chunkSize);

    const params = [];
    const values = [];

    for (const item of chunk) {
      if (!item?.keyId) continue;

      // 🔥 tratar lid-mapping
      if (item.keyId.includes("lid-mapping")) {
        if (item.keyId.includes("_reverse")) {
           const id = item.keyId.split("-")[2].split("_")[0];

          if (id) {
            try {
                await BaileysService.redis.set(`lid-mapping:${botId}:${id}`, item.keyJson.replace(/"/g, "").trim());
            } catch (error) {}
            
          }
        }
        continue; // não salva no banco
      }

      // monta params
      params.push(botId, item.keyId, item.keyJson);

      const base = params.length - 3;

      values.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, NOW())`
      );
    }

    // 🔥 evita query vazia
    if (values.length === 0) continue;

    const query = `
      INSERT INTO wa_session_keys (session_id, key_id, value_json, updated_at)
      VALUES ${values.join(",")}
      ON CONFLICT (session_id, key_id)
      DO UPDATE SET
        value_json = EXCLUDED.value_json,
        updated_at = NOW()
    `;

    await client.query(query, params);
  }
}

async function bulkDeleteAuthKeys(botId, keyIds, client) {
  const query = `DELETE FROM wa_session_keys WHERE session_id = $1 AND key_id = ANY($2::text[])`;
  await client.query(query, [botId, keyIds]);
}

// Função que busca um registro na tabela wa_session_keys
async function getAuthKey(botId, keyId, client = null) {
  // Faz a consulta na tabela wa_session_keys
  const query = `SELECT value_json FROM wa_session_keys WHERE session_id = $1 AND key_id = $2`;
  const { rows } = await runQuery(query, [botId, keyId], client);

  // Retorna o conteúdo do value_json ou null, caso não tenha encontrado nenhum registro
  return rows.length > 0 ? rows[0].value_json : null;
}

// Função que deleta um registro da tabela wa_session_keys
async function deleteAuthKey(botId, keyId, client = null) {
  // Faz a exclusão na tabela wa_session_keys
  const query = `DELETE FROM wa_session_keys WHERE session_id = $1 AND key_id = $2`;
  await runQuery(query, [botId, keyId], client);
}
