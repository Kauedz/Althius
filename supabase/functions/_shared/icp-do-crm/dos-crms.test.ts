import { assertEquals } from 'jsr:@std/assert@1';
import { ganhoDoHubspot, ganhoDoPipedrive, porteDeFuncionarios } from './dos-crms.ts';

Deno.test('porte pela quantidade de funcionários', () => {
  assertEquals(porteDeFuncionarios(8), '1-10');
  assertEquals(porteDeFuncionarios(50), '11-50');
  assertEquals(porteDeFuncionarios(51), '51-200');
  assertEquals(porteDeFuncionarios(4_000), '1001-5000');
  assertEquals(porteDeFuncionarios(20_000), '10001+');
  assertEquals(porteDeFuncionarios(0), null);
  assertEquals(porteDeFuncionarios(Number.NaN), null);
});

Deno.test('HubSpot: negócio ganho com a empresa associada', () => {
  assertEquals(
    ganhoDoHubspot(
      { properties: { amount: '12000.50', createdate: '2026-01-01T00:00:00Z', closedate: '2026-01-31T00:00:00Z' } },
      { properties: { industry: 'COMPUTER_SOFTWARE', numberofemployees: '120', state: 'SP', country: 'Brazil' } },
    ),
    { setor: 'Computer software', porte: '51-200', regiao: 'SP', valor: 12000.5, cicloDias: 30 },
  );
});

Deno.test('HubSpot: sem empresa e sem datas fica só o valor', () => {
  assertEquals(ganhoDoHubspot({ properties: { amount: '900' } }, null), {
    setor: null,
    porte: null,
    regiao: null,
    valor: 900,
    cicloDias: null,
  });
});

Deno.test('HubSpot: região cai para o país quando não há estado', () => {
  assertEquals(ganhoDoHubspot({ properties: {} }, { properties: { country: 'Brazil' } }).regiao, 'Brazil');
});

Deno.test('Pipedrive: ciclo de add_time a won_time e região da organização', () => {
  assertEquals(
    ganhoDoPipedrive(
      { value: 5000, add_time: '2026-03-01 10:00:00', won_time: '2026-03-11 09:00:00' },
      { address_admin_area_level_1: 'Paraná', address_country: 'Brasil', people_count: 3 },
    ),
    { setor: null, porte: null, regiao: 'Paraná', valor: 5000, cicloDias: 10 },
  );
});

Deno.test('Pipedrive: ciclo negativo ou datas inválidas não contam', () => {
  assertEquals(
    ganhoDoPipedrive({ value: 1, add_time: '2026-03-11', won_time: '2026-03-01' }, null).cicloDias,
    null,
  );
  assertEquals(ganhoDoPipedrive({ value: 1, add_time: 'x', won_time: 'y' }, null).cicloDias, null);
});
