import { initAuthCreds, BufferJSON, proto } from "@whiskeysockets/baileys";
import redis from "./redis.js";

function parseStoredJson(raw) {
  if (raw == null) return null;

  // json/jsonb no PostgreSQL costuma chegar como objeto já parseado.
  if (typeof raw === "object") {
    return JSON.parse(JSON.stringify(raw), BufferJSON.reviver);
  }

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw, BufferJSON.reviver);
      // Protege contra payload salvo como string JSON dentro de outra string JSON.
      if (typeof parsed === "string") {
        try {
          return JSON.parse(parsed, BufferJSON.reviver);
        } catch {
          return parsed;
        }
      }
      return parsed;
    } catch {
      // Alguns dados legados podem estar salvos como string pura.
      return raw;
    }
  }

  return null;
}

function isByteLikeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const keys = Object.keys(value);
  if (!keys.length) return false;

  for (const key of keys) {
    if (!/^\d+$/.test(key)) return false;
    const byte = value[key];
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) return false;
  }

  return true;
}

function normalizeBuffers(value) {
  if (value == null) return value;
  if (Buffer.isBuffer(value)) return value;

  if (
    typeof value === "object" &&
    value.type === "Buffer" &&
    Array.isArray(value.data)
  ) {
    return Buffer.from(value.data);
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeBuffers(item));
  }

  if (isByteLikeObject(value)) {
    const ordered = Object.keys(value)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => value[k]);
    return Buffer.from(ordered);
  }

  if (typeof value === "object") {
    const out = {};
    for (const [key, innerValue] of Object.entries(value)) {
      out[key] = normalizeBuffers(innerValue);
    }
    return out;
  }

  return value;
}

export async function makePostgresAuthState(pool, sessionId) {
  const state = {
    creds: initAuthCreds(),

    keys: {
      async get(type, ids) {
        if (!ids?.length) return {};

        const res = await pool.query(
          `SELECT key_id, value_json
           FROM wa_session_keys
           WHERE session_id=$1 AND key_type=$2 AND key_id = ANY($3)`,
          [sessionId, type, ids],
        );

        const out = {};

        for (const row of res.rows) {
          let parsed = parseStoredJson(row.value_json);
          if (parsed == null) continue;

          parsed = normalizeBuffers(parsed);

          if (
            type === "app-state-sync-key" &&
            parsed &&
            typeof parsed === "object"
          ) {
            parsed = proto.Message.AppStateSyncKeyData.fromObject(parsed);
          }

          out[row.key_id] = parsed;
        }

        return out;
      },

      async set(data) {
        // Agrupa upserts e deletes por tipo: 1 query por tipo em vez de 1 por chave.
        const upserts = {}; // { [type]: { ids: string[], values: string[] } }
        const deletes = {}; // { [type]: string[] }

        for (const type of Object.keys(data || {})) {
          for (const id of Object.keys(data[type] || {})) {
            const value = data[type][id];
            if (value == null) {
              (deletes[type] = deletes[type] || []).push(id);
            } else {
              if (!upserts[type]) upserts[type] = { ids: [], values: [] };
              upserts[type].ids.push(id);
              upserts[type].values.push(
                JSON.stringify(value, BufferJSON.replacer),
              );
            }
          }
        }

        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          // Um INSERT por tipo usando unnest() — evita N conexões simultâneas.
          for (const [type, { ids, values }] of Object.entries(upserts)) {
            await client.query(
              `INSERT INTO wa_session_keys (session_id, key_type, key_id, value_json)
               SELECT $1, $2, unnest($3::text[]), unnest($4::jsonb[])
               ON CONFLICT (session_id, key_type, key_id)
               DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = now()`,
              [sessionId, type, ids, values],
            );
            if (type == "lid-mapping") {
              try {
                const getLids = await client.query("SELECT * FROM wa_session_keys WHERE key_type = 'lid-mapping';");
                for (const element of getLids.rows) {
                   if (element.key_id && element.key_id.endsWith("_reverse")){
                    const lid = element.key_id.split("_")[0];
                    await redis.set(`lid-mapping:${sessionId}:${lid}`, element.value_json);
                   };
                }
          
              } catch (error) {
                console.error("Erro ao processar lid-mapping:", error);
              }
            }
            
            
          }

          // Um DELETE por tipo usando ANY().
          for (const [type, ids] of Object.entries(deletes)) {
            await client.query(
              `DELETE FROM wa_session_keys
               WHERE session_id = $1 AND key_type = $2 AND key_id = ANY($3::text[])`,
              [sessionId, type, ids],
            );
          }

          await client.query("COMMIT");
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
      },
    },

    async saveCreds() {
      //   console.log("Salvando credenciais para sessão:", state.creds);
      try {
        await pool.query(
          `INSERT INTO wa_sessions (session_id, creds_json)
         VALUES ($1,$2)
         ON CONFLICT (session_id)
         DO UPDATE SET creds_json=EXCLUDED.creds_json, updated_at=now()`,
          [
            sessionId,
            JSON.stringify(state.creds, BufferJSON.replacer), // 🔥 ESSENCIAL
          ],
        );
      } catch (error) {
        console.error("Erro ao salvar credenciais para sessão:", error);
      }
    },
  };

  const res = await pool.query(
    `SELECT creds_json FROM wa_sessions WHERE session_id=$1`,
    [sessionId],
  );

  if (res.rows[0]?.creds_json) {
    const parsedCreds = parseStoredJson(res.rows[0].creds_json);
    if (parsedCreds) {
      state.creds = parsedCreds;
    }
  }

  return state;
}

export async function deleteSession(pool, sessionId) {
  await pool.query(`DELETE FROM wa_sessions WHERE session_id=$1`, [sessionId]);
  await pool.query(`DELETE FROM wa_session_keys WHERE session_id=$1`, [
    sessionId,
  ]);
}

export async function listSessions(pool) {
  const res = await pool.query(`SELECT session_id FROM wa_sessions`);
  return res.rows.map((row) => row.session_id);
}
