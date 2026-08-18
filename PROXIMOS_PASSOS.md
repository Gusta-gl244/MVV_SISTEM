# INSPEC360 — Estado da reconstrução e próximos passos

Este arquivo documenta o que foi feito na reconstrução da camada de dados/
sincronização/backup do sistema e o que ainda falta, para retomar em uma
sessão futura. Ver também o plano original em
`C:\Users\gustavo.santos\.claude\plans\dreamy-forging-cray.md`.

## ✅ Concluído e testado

- **Banco de dados novo**: Postgres como única fonte de verdade
  (`backend/src/database/init-postgres.js`), sem mais blob JSON nem tabelas
  duplicadas. JSONB para listas aninhadas (componentes de inspeção, pausas,
  log de atividade).
- **Sincronização offline-first real**: fila de mutações (outbox) no
  IndexedDB do navegador + `POST /api/sync/push` (last-write-wins por
  registro) + `GET /api/sync/pull` incremental. Ver `src/sync/engine.ts` e
  `backend/src/routes/sync.js`. O outbox é sempre drenado ANTES de qualquer
  pull — um registro criado offline nunca é apagado por uma sincronização.
- **Dados mock removidos**: `INITIAL_USERS`/`INITIAL_STRUCTURES`/etc.
  deletados do frontend. Confirmado por teste automatizado (Playwright): tela
  de login → dashboard não mostra nenhum nome/torre fake, contagens batem
  exatamente com os dados reais importados (51 estruturas, 16 componentes, 3
  usuários).
- **Dados reais importados**: `backend/src/database/import-reference-data.js`
  lê a planilha em `Referencias/` e populou estruturas, catálogo de
  componentes/anomalias, severidades/riscos, emendas e achados históricos de
  inspeção — tudo real, nada inventado.
- **Backup completo**: `POST /api/backups/run` gera um ZIP com um .json por
  tabela + fotos de campo extraídas do base64 embutido como arquivos de
  imagem reais organizados por ordem/inspeção, guardado no próprio Postgres
  (sobrevive a redeploy). Tela "Backups do Servidor" no BackupPanel. Testado
  ponta a ponta (gerar → listar → baixar → conferir conteúdo do ZIP).
- **Backup automático**: agendamento via `node-cron`, configurável na aba
  "Automático" do BackupPanel (`GET/PUT /api/backups/schedule/config`).
- **Autenticação real**: bcrypt + JWT (`POST /api/auth/login`), todas as
  rotas de API exigem token exceto login/health. Login antigo em texto puro
  removido.
- **3 contas de teste** semeadas automaticamente no primeiro boot
  (`tecnico@inspec360.com` / `supervisor@inspec360.com` /
  `admin@inspec360.com`, senha `inspec360`) — aviso na tela de login só
  aparece com `VITE_DEV_MODE=true`.
- **Coordenadas UTM 24S/SIRGAS2000** corrigidas em `coordinateUtils.ts`
  (estava fixo em 23S).
- **Ambiente local sem Docker**: Postgres real embutido via
  `embedded-postgres` (`backend/src/database/dev-bootstrap.js`), sobe
  sozinho no primeiro `npm run dev` do backend.
- **Bugs reais encontrados e corrigidos durante o teste end-to-end**:
  1. `.env.local` usava URL absoluta da API (`http://localhost:3001/api`)
     em vez de `/api`, ignorando o proxy do Vite e causando erro de CORS.
  2. `offlineStorage.clearOldCache` tinha sido removido sem querer na
     reescrita do IndexedDB, quebrando o `OfflineProvider` (tela em branco).
  3. Race condition no stream do ZIP de backup (`archive.finalize()` podia
     resolver depois do evento `end` já ter disparado, travando o backup
     para sempre).
  4. **Importante**: `getInitialData()` ainda semeava
     `checklistComponents`/`severities` com uma lista genérica de fallback —
     como o pull mescla por id, isso duplicava permanentemente com o
     catálogo real vindo do servidor (16 reais + 12 genéricos = 28). Corrigido
     para começar 100% vazio, igual as outras coleções.

## ⚠️ Testado só parcialmente / precisa de mais verificação

- Fluxo completo do **técnico** (iniciar/pausar/concluir inspeção e
  execução, captura de foto) não foi exercitado no navegador nesta sessão —
  só verificado por leitura de código. Testar de ponta a ponta, incluindo
  simular offline (DevTools → Network → Offline) e confirmar que o trabalho
  não some ao reconectar.
- Mapa do **supervisor** (pinos, status) não foi aberto no navegador nesta
  sessão.
- Demais abas do **SuperAdmApp** (Estruturas, Regras de Inspeção, Ordens de
  Serviço, Fotos, Atividades, Logs, Status, Usuários) não foram clicadas uma
  por uma — só a "Visão Geral" e "Bases de Dados" foram verificadas.
- PWA offline "de verdade" (fechar o navegador, reabrir sem internet) não
  foi testado.
- Publicação num serviço/banco novo no Render (o usuário disse que vai
  recriar do zero) — o `render.yaml` atual não precisa de disco persistente
  (fotos/backups moram no Postgres agora), mas nunca foi testado deployado.
  Vai precisar configurar `JWT_SECRET` como variável de ambiente no Render
  (obrigatória em produção, sem fallback).

## ✅ Concluído em sessão seguinte (pedidos feitos no meio da reconstrução)

1. **ID de ordem curto e rastreável** — `generateOrderId()` em `store.ts`
   gera `OS-AAAAMMDD-XXXX` (data + sufixo de 4 caracteres), usado em
   `SupervisorApp.tsx` ao criar ordens. Ordena por data, curto o bastante
   pra anotar/falar em campo.
2. **Logos reposicionadas** — INSPEC360 + BNMC/Mineração Vale Verde agora
   aparecem juntas, menores, no cabeçalho das 3 telas principais
   (`TecnicoApp.tsx`, `SupervisorApp.tsx`, `SuperAdmApp.tsx`), além da tela
   de login.
4. **Painel de diagnóstico do admin** — endpoint real
   `GET /api/diagnostics` (`backend/src/routes/diagnostics.js`) retorna
   status da conexão com o Postgres, uptime do servidor, contagem real por
   tabela, status do agendamento de backup e dados do último backup. A aba
   "Status" do admin (`SystemStatusPanel` em `SuperAdmApp.tsx`) foi
   reescrita para mostrar só isso — nada mais fixo/estimado como antes
   (o "Fluxo do Sistema" com 8 passos sempre verdes foi removido por não
   representar nada real). Testado no navegador: mostra conexão real,
   contagens reais (51 estruturas, 16 componentes, etc.), e o backup
   automático configurado antes realmente rodou sozinho no horário certo.

3. **Mapa** (`MapComponent.tsx`) — camada de satélite Esri World Imagery
   como padrão (não exige chave de API; tiles do Google diretamente feriria
   os termos de uso sem conta/faturamento configurados), com seletor
   satélite/ruas no canto (`L.control.layers`); rótulo discreto com o nome
   da torre sobre cada pino, só visível a partir do zoom 13 pra não poluir
   a visão geral; marcador azul pulsante "Você está aqui" com a localização
   em tempo real de quem está vendo o mapa, reaproveitando o
   `watchPosition` que já rodava em `OfflineContext.tsx` (sem abrir uma
   segunda assinatura de GPS). Testado no navegador com geolocalização
   simulada — imagem de satélite carrega de verdade (dá pra ver vegetação/
   estradas), sem erros de console.
4. **Dashboard do supervisor** mais estratégico — pesquisei referências de
   dashboards de gestão de manutenção/inspeção de ativos antes de mexer
   (ver fontes abaixo). Padrão encontrado: KPIs críticos primeiro,
   vermelho/amarelo/verde, backlog por idade de atraso, e visão de carga
   por equipe — em vez de só uma grade plana de números. Adicionado ao
   `SupervisorApp.tsx`:
   - Seção "Prioridade — precisa de atenção agora": estruturas críticas
     (`estruturaCritica`) com anomalia/pendência aparecem primeiro, antes
     de qualquer outro número.
   - Backlog de atraso por faixa de idade (1–7 / 8–14 / 15–30 / 30+ dias),
     barra segmentada colorida.
   - Cumprimento de prazo (SLA): % de ordens concluídas dentro do prazo.
   - Carga de trabalho por técnico (ordens abertas por pessoa) — ajuda a
     redistribuir antes de virar gargalo.
   Testado no navegador com uma ordem de teste (criada e depois removida
   via API) — todas as seções novas renderizam corretamente com dado real
   e ficam ocultas quando não há nada a mostrar (sem seção vazia/zerada
   poluindo a tela).

   Fontes da pesquisa:
   - [14 Facility Management KPIs to Track in 2026](https://facilio.com/blog/facility-management-kpis/)
   - [Facility Management Dashboard Design: KPIs, Widgets and Executive Reporting](https://oxmaint.com/industries/facility-management/facility-management-dashboard-design-kpis)
   - [Maintenance KPI Dashboard: Effective Performance Tracking](https://preventivehq.com/blog/maintenance-kpi-dashboard/)

## ❌ Ainda não iniciado

- O **relatório em PDF** (`ReportPanel.tsx`) não foi revisado — o pedido do
  dashboard focou na tela do supervisor; o relatório exportável continua
  como estava.
- A tela **Configurações → "Modo Offline (PWA)"** ainda tem um bloco
  estático dizendo "Storage ativo" com uma bolinha verde fixa — menor
  prioridade que o painel de Status (já corrigido), mas vale revisar com o
  mesmo padrão de dado real.

## Como rodar localmente

```powershell
# Instala tudo (raiz + backend)
npm install
cd backend; npm install; cd ..

# Sobe os dois juntos (Postgres local embutido sobe sozinho no backend)
npm run dev:full
```

Acesse `http://localhost:5000`. Contas de teste na própria tela de login
(modo dev). Para popular com os dados reais da planilha:

```powershell
cd backend
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:54329/inspec360_dev"
npm run import-reference-data -- "../Referencias/Planilha_LT230kV_MVV_V3_restaurada_completa - BASE 13.04.26.xlsx"
```
