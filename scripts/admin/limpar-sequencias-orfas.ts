/** CRM-17: simulação por padrão. Nunca apaga linhas. Credenciais vêm do ambiente libpq do psql. */
export interface Orfa { sequence_id: string; reason: string }
interface Banco {
  listar: () => Promise<Orfa[]>;
  pausar: (id: string) => Promise<Record<string, unknown>>;
  registrar: (evento: Record<string, unknown>) => Promise<void>;
}

export async function limparSequenciasOrfas(banco: Banco, aplicar = false) {
  const orfas = await banco.listar();
  if (aplicar) {
    for (const orfa of orfas) {
      const evento = await banco.pausar(orfa.sequence_id);
      await banco.registrar(evento);
    }
  }
  return { aplicado: aplicar, orfas };
}

if (import.meta.main) {
  if (Deno.args.some((arg) => arg !== '--aplicar')) throw new Error('Use sem argumentos para simular, ou --aplicar para pausar.');
  async function consultar(sql: string): Promise<unknown> {
    const resultado = await new Deno.Command('psql', {
      args: ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql],
      stdout: 'piped', stderr: 'piped',
    }).output();
    if (!resultado.success) throw new Error('A operação no banco falhou. Confira a conexão libpq por um canal seguro.');
    return JSON.parse(new TextDecoder().decode(resultado.stdout).trim());
  }
  const resultado = await limparSequenciasOrfas({
    listar: async () => await consultar("select coalesce(jsonb_agg(t order by t.sequence_id), '[]'::jsonb) from private.diagnose_sequence_orphans() t") as Orfa[],
    pausar: async (id) => {
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Identificador de Sequência inválido.');
      return await consultar(`select private.pause_orphan_sequence('${id}'::uuid)`) as Record<string, unknown>;
    },
    registrar: async (evento) => {
      await Deno.writeTextFile('.scratch/qualidade-p2-limpeza.jsonl', JSON.stringify(evento) + '\n', { append: true });
    },
  }, Deno.args.includes('--aplicar'));
  console.log(JSON.stringify(resultado, null, 2));
}
