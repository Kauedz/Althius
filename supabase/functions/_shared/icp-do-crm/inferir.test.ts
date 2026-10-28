import { assertEquals } from 'jsr:@std/assert@1';
import { divergenciasDoIcp, inferirIcpDosGanhos, type NegocioGanho } from './inferir.ts';

const negocio = (n: Partial<NegocioGanho>): NegocioGanho => ({
  setor: null,
  porte: null,
  regiao: null,
  valor: null,
  cicloDias: null,
  ...n,
});

Deno.test('sem negócios ganhos não infere nada', () => {
  assertEquals(inferirIcpDosGanhos([]), null);
});

Deno.test('com pesos iguais vence o valor mais frequente', () => {
  const icp = inferirIcpDosGanhos([
    negocio({ setor: 'SaaS', porte: '11-50', regiao: 'SP' }),
    negocio({ setor: 'SaaS', porte: '51-200', regiao: 'SP' }),
    negocio({ setor: 'Varejo', porte: '11-50', regiao: 'RJ' }),
  ]);
  assertEquals(icp?.setor.valor, 'SaaS');
  assertEquals(icp?.porte.valor, '11-50');
  assertEquals(icp?.regiao.valor, 'SP');
  assertEquals(icp?.negocios, 3);
});

Deno.test('ticket maior pesa mais que a frequência', () => {
  const icp = inferirIcpDosGanhos([
    negocio({ setor: 'Varejo', valor: 1_000 }),
    negocio({ setor: 'Varejo', valor: 1_000 }),
    negocio({ setor: 'Indústria', valor: 20_000 }),
  ]);
  assertEquals(icp?.setor.valor, 'Indústria');
});

Deno.test('ciclo mais curto pesa mais', () => {
  const icp = inferirIcpDosGanhos([
    negocio({ setor: 'Saúde', valor: 5_000, cicloDias: 120 }),
    negocio({ setor: 'Educação', valor: 5_000, cicloDias: 15 }),
  ]);
  assertEquals(icp?.setor.valor, 'Educação');
});

Deno.test('a fatia diz quanto do peso ficou com o vencedor', () => {
  const icp = inferirIcpDosGanhos([
    negocio({ setor: 'SaaS' }),
    negocio({ setor: 'SaaS' }),
    negocio({ setor: 'Varejo' }),
    negocio({ setor: null }),
  ]);
  assertEquals(icp?.setor.fatia, 0.67);
  assertEquals(icp?.setor.comDado, 3);
});

Deno.test('campo sem dado em nenhum negócio fica vazio', () => {
  const icp = inferirIcpDosGanhos([negocio({ setor: 'SaaS' })]);
  assertEquals(icp?.porte, { valor: null, fatia: 0, comDado: 0 });
});

Deno.test('compara sem diferenciar caixa nem espaços e mostra a primeira grafia', () => {
  const icp = inferirIcpDosGanhos([
    negocio({ setor: 'SaaS' }),
    negocio({ setor: ' saas ' }),
    negocio({ setor: 'Varejo', valor: 1 }),
  ]);
  assertEquals(icp?.setor.valor, 'SaaS');
});

Deno.test('valor ou ciclo inválido não muda o peso', () => {
  const icp = inferirIcpDosGanhos([
    negocio({ setor: 'A', valor: -5, cicloDias: 0 }),
    negocio({ setor: 'A', valor: Number.NaN }),
    negocio({ setor: 'B' }),
  ]);
  assertEquals(icp?.setor.valor, 'A');
});

Deno.test('divergência aparece onde CRM e site discordam, com o CRM sugerido', () => {
  const icp = inferirIcpDosGanhos([
    negocio({ setor: 'Indústria', porte: '51-200', regiao: 'Sul' }),
  ]);
  assertEquals(
    divergenciasDoIcp(icp!, { setor: 'indústria', porte: '11-50', regiao: null }),
    [{ campo: 'porte', doCrm: '51-200', doSite: '11-50', sugerido: 'crm' }],
  );
});

Deno.test('sem ICP do site não há divergência', () => {
  const icp = inferirIcpDosGanhos([negocio({ setor: 'SaaS' })]);
  assertEquals(divergenciasDoIcp(icp!, null), []);
});
