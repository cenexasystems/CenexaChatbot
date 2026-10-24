// In-memory Supabase and external API mock for testing

export function createMockState() {
  const state = {
    businesses: [],
    conversations: [],
    messages: [],
    storage: new Map(),
    sentWhatsAppMessages: [],
    aiCalls: [],
    transcriptionCalls: [],
    visionCalls: [],
  };

  class QueryBuilder {
    constructor(tableName) {
      this.tableName = tableName;
      this.filters = [];
      this.limitCount = null;
      this.orderClause = null;
    }

    select(fields) {
      return this;
    }

    eq(col, val) {
      this.filters.push((row) => row[col] === val);
      return this;
    }

    in(col, vals) {
      this.filters.push((row) => vals.includes(row[col]));
      return this;
    }

    is(col, val) {
      this.filters.push((row) => row[col] === val);
      return this;
    }

    order(col, opts) {
      this.orderClause = { col, ascending: opts?.ascending ?? true };
      return this;
    }

    limit(n) {
      this.limitCount = n;
      return this;
    }

    async single() {
      const { data, error } = await this._execute();
      if (error) return { data: null, error };
      if (!data || data.length === 0) return { data: null, error: { message: "Row not found" } };
      return { data: data[0], error: null };
    }

    async maybeSingle() {
      const { data, error } = await this._execute();
      if (error) return { data: null, error };
      return { data: data?.[0] ?? null, error: null };
    }

    async _execute() {
      let rows = state[this.tableName].slice();
      for (const f of this.filters) {
        rows = rows.filter(f);
      }
      if (this.orderClause) {
        rows.sort((a, b) => {
          if (a[this.orderClause.col] < b[this.orderClause.col]) return this.orderClause.ascending ? -1 : 1;
          if (a[this.orderClause.col] > b[this.orderClause.col]) return this.orderClause.ascending ? 1 : -1;
          return 0;
        });
      }
      if (this.limitCount !== null) {
        rows = rows.slice(0, this.limitCount);
      }
      return { data: rows, error: null };
    }

    then(resolve, reject) {
      return this._execute().then(resolve, reject);
    }
  }

  const mockSupabase = {
    from: (table) => {
      const builder = new QueryBuilder(table);
      return {
        select: (fields) => builder.select(fields),
        insert: (rows) => {
          const arr = Array.isArray(rows) ? rows : [rows];
          for (const r of arr) {
            if (r.whatsapp_msg_id && state[table].some((x) => x.whatsapp_msg_id === r.whatsapp_msg_id)) {
              const errResult = { data: null, error: { code: "23505", message: "duplicate key value" } };
              return {
                select: () => ({
                  single: async () => errResult,
                  then: (resolve) => Promise.resolve(errResult).then(resolve)
                }),
                then: (resolve) => Promise.resolve(errResult).then(resolve)
              };
            }
            const row = { id: r.id || `id_${Math.random().toString(36).slice(2, 9)}`, created_at: new Date().toISOString(), ...r };
            state[table].push(row);
          }
          const successResult = { data: arr, error: null };
          return {
            select: () => ({
              single: async () => ({ data: state[table][state[table].length - 1], error: null }),
              then: (resolve) => Promise.resolve(successResult).then(resolve)
            }),
            then: (resolve) => Promise.resolve(successResult).then(resolve)
          };
        },
        update: (updates) => ({
          eq: (col, val) => {
            const matched = state[table].filter((row) => row[col] === val);
            for (const m of matched) {
              Object.assign(m, updates);
            }
            const res = { data: matched, error: null };
            return Promise.resolve(res);
          }
        }),
        upsert: (rows, opts) => {
          const arr = Array.isArray(rows) ? rows : [rows];
          for (const r of arr) {
            const conflictCol = opts?.onConflict || "id";
            const existing = state[table].find((x) => x[conflictCol] === r[conflictCol]);
            if (existing) {
              if (!opts?.ignoreDuplicates) {
                Object.assign(existing, r);
              }
            } else {
              state[table].push({ id: `id_${Math.random().toString(36).slice(2, 9)}`, ...r });
            }
          }
          return Promise.resolve({ data: arr, error: null });
        }
      };
    },
    storage: {
      from: (bucket) => ({
        upload: async (path, buffer, opts) => {
          state.storage.set(`${bucket}:${path}`, { buffer, opts });
          return { error: null };
        },
        getPublicUrl: (path) => ({
          data: { publicUrl: `https://mock-storage.local/${bucket}/${path}` }
        })
      })
    }
  };

  return { state, mockSupabase };
}
