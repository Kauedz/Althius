// Banco de teste: o Postgres local com as migrations aplicadas (em CI, o do `supabase start`).
// Cada teste roda numa transação desfeita no fim; cada RPC roda num savepoint, como uma chamada separada da API.
import postgres from 'npm:postgres@3.4.7'
import { type Rpc, RpcError } from './rpc.ts'

type Connection = postgres.ReservedSql

export interface TestDatabase {
  /** Executa SQL como dono do banco, para fixtures e conferências. */
  run(sql: string): Promise<void>
  value<T = unknown>(sql: string): Promise<T>
  /** Consulta como um usuário autenticado, pelas mesmas políticas e RPCs da API. */
  valueAs<T = unknown>(userId: string, sql: string): Promise<T>
  /** RPC como o service_role das Edge Functions. */
  serviceRpc: Rpc
  /** RPC como um usuário autenticado. */
  userRpc(userId: string): Rpc
}

function rpcAs(connection: Connection, role: 'service_role' | 'authenticated', userId?: string): Rpc {
  return async (name, args) => {
    if (!/^[a-z_]+$/.test(name)) throw new Error('invalid rpc name')
    const keys = Object.keys(args)
    if (keys.some((key) => !/^p_[a-z_]+$/.test(key))) throw new Error('invalid rpc argument')
    await connection.unsafe('savepoint rpc')
    try {
      await connection.unsafe(`set local role ${role}`)
      await connection.unsafe(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ''])
      const rows = await connection.unsafe(
        `select public.${name}(${keys.map((key, index) => `${key} => $${index + 1}`).join(', ')}) as result`,
        // O driver descreve os tipos da função e serializa cada valor como o PostgREST faria.
        keys.map((key) => args[key] ?? null) as postgres.ParameterOrJSON<never>[],
      )
      await connection.unsafe('reset role')
      await connection.unsafe('release savepoint rpc')
      return rows[0].result
    } catch (error) {
      await connection.unsafe('rollback to savepoint rpc')
      await connection.unsafe('reset role')
      const failure = error as { message?: string; code?: string }
      throw new RpcError(failure.message ?? 'rpc failed', failure.code)
    }
  }
}

export async function withTestDatabase(test: (db: TestDatabase) => Promise<void>) {
  const url = Deno.env.get('DATABASE_URL')
  if (!url) throw new Error('DATABASE_URL precisa apontar para o Postgres local com as migrations.')
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  const connection = await sql.reserve()
  try {
    await connection.unsafe('begin')
    await test({
      async run(text) { await connection.unsafe(text) },
      async value(text) { return (await connection.unsafe(text))[0]?.value },
      async valueAs(userId, text) {
        await connection.unsafe('savepoint consulta')
        try {
          await connection.unsafe('set local role authenticated')
          await connection.unsafe(`select set_config('request.jwt.claim.sub', $1, true)`, [userId])
          const rows = await connection.unsafe(text)
          return rows[0]?.value
        } finally {
          await connection.unsafe('rollback to savepoint consulta')
          await connection.unsafe('reset role')
        }
      },
      serviceRpc: rpcAs(connection, 'service_role'),
      userRpc: (userId) => rpcAs(connection, 'authenticated', userId),
    })
  } finally {
    await connection.unsafe('rollback').catch(() => {})
    connection.release()
    await sql.end()
  }
}

export const BETO = '80000000-0000-0000-0000-000000000002'
export const EVA = '80000000-0000-0000-0000-000000000005'

/**
 * Beto é o Vendedor responsável pela Alfa, com a Conta remetente de E-mail pronta e uma Sequência com o passo `a1`
 * para a Maria. Eva é outro Membro do mesmo Workspace.
 */
export async function seedSequence(db: TestDatabase) {
  await db.run(`
    insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous)
    values
      ('${BETO}', 'authenticated', 'authenticated', 'beto@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false),
      ('${EVA}', 'authenticated', 'authenticated', 'eva@cliente.com.br', '', now(), now(), now(), '{}', '{}', false, false);
    insert into public.workspaces (id, kind, name) values ('81000000-0000-0000-0000-000000000001', 'empresa', 'Cliente');
    insert into public.workspace_memberships (workspace_id, user_id, role, active) values
      ('81000000-0000-0000-0000-000000000001', '${BETO}', 'member', true),
      ('81000000-0000-0000-0000-000000000001', '${EVA}', 'member', true);
    insert into private.sender_accounts (workspace_id, owner_user_id, channel, unipile_account_id, provider, status)
    values ('81000000-0000-0000-0000-000000000001', '${BETO}', 'email', 'acc-beto-email', 'GOOGLE', 'ready');
  `)
  await db.run(`
    create temporary table seed (nome text primary key, id uuid) on commit drop;
    grant all on seed to authenticated;
    set local role authenticated;
    select set_config('request.jwt.claim.sub', '${BETO}', true);
    insert into seed select 'alfa', id from public.save_target_account('81000000-0000-0000-0000-000000000001', 'Alfa', 'alfa.com.br');
    insert into seed select 'maria', id from public.create_contact((select id from seed where nome = 'alfa'), 'Maria Souza', 'CFO', 'maria@alfa.com.br');
    insert into seed select 'sequencia', id from public.create_sequence(
      '81000000-0000-0000-0000-000000000001', (select id::text from seed where nome = 'alfa'),
      jsonb_build_object(
        'participantesIds', jsonb_build_array((select id from seed where nome = 'maria')),
        'steps', jsonb_build_array(jsonb_build_object(
          'id', 'a1', 'ordem', 1, 'canal', 'email', 'contatoId', (select id from seed where nome = 'maria'),
          'delayDiasUteis', 0, 'titulo', 'Abertura', 'assunto', 'Proposta para a Alfa', 'corpo', 'Olá, Maria.'))));
    reset role;
  `)
  return {
    sequenceId: await db.value<string>(`select id::text as value from seed where nome = 'sequencia'`),
    contactId: await db.value<string>(`select id::text as value from seed where nome = 'maria'`),
  }
}
