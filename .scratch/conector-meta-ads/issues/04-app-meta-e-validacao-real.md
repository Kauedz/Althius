# 04: Criar o app Meta e validar com conta real

**What to build:** o passo humano do app Meta, a publicação e o teste com uma conta de anúncio real. Só então `available = true`.

**Blocked by:** 01, 02, 03.

**Status:** ready-for-human

## Passos do Nan
1. Em https://developers.facebook.com/apps, crie o app (tipo Empresa) e adicione o caso de uso **Create & manage ads with ads MCP server**.
2. Em *Facebook Login for Business > Configurações*, cadastre a URL de retorno `https://ycbdilsmydvzezhlymty.supabase.co/functions/v1/integration-callback`.
3. Grave o App ID como segredo das funções (o valor não vai ao chat):
   ```powershell
   npx supabase secrets set META_ADS_MCP_CLIENT_ID=<App ID> --project-ref ycbdilsmydvzezhlymty
   ```
4. Publique as funções:
   ```powershell
   npx supabase functions deploy integration-connect integration-callback integration-tools --project-ref ycbdilsmydvzezhlymty
   ```
5. Teste:
   - conectar, aprovando `ads_mcp_management` e `ads_read`;
   - ver as ferramentas e anotar os nomes;
   - pedir a um Agente com Propor um relatório de campanha: deve nascer uma Aprovação;
   - desconectar.
6. Anote aqui se a Meta pediu revisão do app ou verificação da empresa para contas que não são do app.

## Comments
