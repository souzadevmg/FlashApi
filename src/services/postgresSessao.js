import { initAuthCreds, BufferJSON, proto } from "@whiskeysockets/baileys";

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

export async function makePostgresAuthState(pool, sessionId) {
  const state = {
    creds: initAuthCreds(), // 🔥 NUNCA null

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

          if (type === "app-state-sync-key" && parsed && typeof parsed === "object") {
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
              upserts[type].values.push(JSON.stringify(value, BufferJSON.replacer));
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

  // 🔥 CARREGA DO BANCO
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
