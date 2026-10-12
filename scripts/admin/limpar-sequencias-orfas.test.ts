import { limparSequenciasOrfas } from './limpar-sequencias-orfas.ts';

Deno.test('simulação padrão lista motivos sem pausar nem gravar auditoria', async () => {
  let alteracoes = 0;
  const resultado = await limparSequenciasOrfas({
    listar: async () => [{ sequence_id: 'ad000000-0000-0000-0000-000000000001', reason: 'account_missing' }],
    pausar: async () => { alteracoes++; return { action: 'paused' }; },
    registrar: async () => { alteracoes++; },
  });
  if (alteracoes !== 0 || resultado.aplicado || resultado.orfas.length !== 1) throw new Error('Simulação alterou estado ou omitiu o diagnóstico');
});

Deno.test('aplicar explícito pausa e registra, sem apagar', async () => {
  const estados = new Map([['ad000000-0000-0000-0000-000000000001', 'ativa']]);
  const registros: unknown[] = [];
  await limparSequenciasOrfas({
    listar: async () => [{ sequence_id: 'ad000000-0000-0000-0000-000000000001', reason: 'account_missing' }],
    pausar: async (id) => { estados.set(id, 'pausada'); return { sequence_id: id, action: 'paused' }; },
    registrar: async (evento) => { registros.push(evento); },
  }, true);
  if (estados.size !== 1 || [...estados.values()][0] !== 'pausada' || registros.length !== 1) throw new Error('Aplicação não preservou e auditou a Sequência');
});
