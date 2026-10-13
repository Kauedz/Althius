-- A busca longa do Diário Oficial ignora a consulta e custa caro. O monitor da Seção 1 fica sozinho:
-- a data vem em dd/mm/aaaa e o trecho coberto (cerca de 3 dias) confere quando cabe na janela pedida.
-- A nota da cooperativa registra o atraso de alguns meses da base aberta de CNPJ.

update private.signal_cascade_steps s set
  fallbacks = '[]'::jsonb,
  known_price = (s.known_price - 'alternativa') || '{"observacao":"A busca cobre cerca de 3 dias. Uma data dentro da janela pedida confere, mesmo que o trecho seja mais curto."}'::jsonb
from private.signal_cascades c
where s.cascade_id = c.id and c.signal_type = 'mudanca_regulatoria' and s.ordem = 1;

update private.signal_cascades set
  notes = 'Sinal de mercado: atos da Seção 1 do Diário Oficial da União. A busca olha cerca de 3 dias e casa palavra solta; só entra a publicação que traz a frase exata (IBS, CBS, reforma tributária ou agência reguladora) dentro da janela. Uma data nesse trecho confere, mesmo que a janela pedida seja maior. Ato de pessoal é descartado. A cadência é de 3 dias para não pular edição.',
  updated_at = now()
where signal_type = 'mudanca_regulatoria';

update private.signal_cascade_steps s set
  fallbacks = '[]'::jsonb,
  known_price = (s.known_price - 'alternativa') || '{"observacao":"A busca cobre cerca de 3 dias. Uma data dentro da janela pedida confere, mesmo que o trecho seja mais curto."}'::jsonb
from private.signal_cascades c
where s.cascade_id = c.id and c.signal_type = 'licenca_instalacao_dou' and s.ordem = 1;

update private.signal_cascades set
  notes = 'Sinal de mercado: publicações da Seção 1 do Diário Oficial da União com a frase exata "licença de instalação". A busca cobre cerca de 3 dias; uma data nesse trecho confere, mesmo que a janela pedida seja maior. Licença de pessoa física (CPF) é descartada. Parcial: as licenças estaduais não entram.',
  updated_at = now()
where signal_type = 'licenca_instalacao_dou';

update private.signal_cascades set
  notes = 'Só cooperativa agro ativa (natureza jurídica 214-3), aberta na janela da cascata, com CNAE do agro. A base da Receita é mensal e pode refletir a abertura com alguns meses de atraso: a janela acompanha esse atraso. Se o que volta não passa no filtro por outro motivo (baixada ou fora do agro), a outra base assume.',
  updated_at = now()
where signal_type = 'nova_cooperativa';
