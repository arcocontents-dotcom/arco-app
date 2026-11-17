// Teste de ponta a ponta: Notion falso + app real + navegador real.
// Uso: npm run build && node tests/e2e.mjs
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { SignJWT } from 'jose';
import { chromium } from 'playwright';
import { ACCESS_DB, CLIENTS_DB, CONTENTS_DB, FINACC_DB, FIN_DB, LOG_DB, PLANNING_DB, ROUTINE_DB, SHOOTS_DB, blocks, seedBlocks, seedPage, startMock, store } from './mock-notion.mjs';

const MOCK_PORT = 4010;
const APP_PORT = 3100;
const APP = `http://localhost:${APP_PORT}`;
const SECRET = 'teste-teste-teste-teste-teste-teste-123456';
const SHOTS = process.env.SHOTS_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const shiftM = (m, n) => { const t = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1)); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`; };
const rt = (s) => ({ rich_text: [{ text: { content: s } }] });
const title = (s) => ({ title: [{ text: { content: s } }] });
const sel = (s) => ({ select: { name: s } });

// ---------- dados ----------
const A = seedPage(CLIENTS_DB, { Nome: title('Studio Alfa'), 'E-mails que aprovam': rt('a@x.com'), 'E-mails que só visualizam': rt('v@x.com'), Instagram: rt('studioalfa') });
const B = seedPage(CLIENTS_DB, { Nome: title('Beta Ltda'), 'E-mails que aprovam': rt('b@x.com') });
seedPage(ACCESS_DB, { Nome: title('Lemuel'), 'E-mail': { email: 'lemuel@x.com' }, Ativo: { checkbox: true }, Financeiro: { checkbox: false } });
const rel = (id) => ({ relation: [{ id }] });
const date = (s) => ({ date: { start: s, time_zone: 'America/Cuiaba' } });
const REELS = seedPage(CONTENTS_DB, { 'Título': title('Depoimento de cliente'), Cliente: rel(A), Data: date('2026-11-12T18:00:00'), Tipo: sel('Reels'), Status: sel('Aguardando'), 'Vídeo': { url: 'https://midia.test/v.mp4' }, Capa: { url: 'https://midia.test/capa.jpg' }, Legenda: rt('Legenda do reels #teste') });
const CARR = seedPage(CONTENTS_DB, { 'Título': title('Antes e depois'), Cliente: rel(A), Data: date('2026-11-11T12:00:00'), Tipo: sel('Carrossel'), Status: sel('Aguardando'), Artes: { files: [1, 2, 3].map((i) => ({ name: `Arte ${i}`, type: 'external', external: { url: `https://midia.test/a${i}.jpg` } })) }, Legenda: rt('Legenda do carrossel') });
const STORY = seedPage(CONTENTS_DB, { 'Título': title('Promoção de sábado'), Cliente: rel(A), Data: date('2026-11-14T09:00:00'), Tipo: sel('Story'), Status: sel('Aguardando'), 'Imagem do story': { url: 'https://midia.test/s.jpg' } });
const DRAFT = seedPage(CONTENTS_DB, { 'Título': title('Rascunho secreto'), Cliente: rel(A), Data: date('2026-11-13T10:00:00'), Tipo: sel('Post'), Status: sel('Rascunho') });
const BPOST = seedPage(CONTENTS_DB, { 'Título': title('Post do Beta'), Cliente: rel(B), Data: date('2026-11-12T10:00:00'), Tipo: sel('Post'), Status: sel('Aguardando') });

const stat = (n) => ({ status: { name: n } });
const PLAN1 = seedPage(PLANNING_DB, { 'Título do assunto': title('Ideia de bastidores'), Cliente: sel('Studio Alfa'), Status: stat('Ideia') });
const PLAN2 = seedPage(PLANNING_DB, { 'Título do assunto': title('Reels do lançamento'), Cliente: sel('Studio Alfa'), Status: stat('Realizando'), 'Data de postagem': { date: { start: '2026-11-20' } }, 'Tipo de demanda': sel('Reels 1'), 'Observação': sel('Falta edição'), 'Demanda atual está com': sel('Yan') });
seedBlocks(PLAN2, ['Objetivo: Mostrar o lançamento com força.', 'Legenda: Chegou a hora.', 'Referência: https://www.instagram.com/p/exemplo/', 'Imagens: https://midia.test/i1.jpg https://midia.test/i2.jpg']);
// página Gestão do Notion: toggle "Clientes social media" com as páginas dos clientes
const GESTAO = '55555555555555555555555555555555';
const gb = (type, extra = {}) => ({ object: 'block', id: randomUUID(), type, has_children: false, archived: false, ...extra });
const gCols = gb('column_list', { has_children: true });
const gCol = gb('column', { has_children: true });
const gToggle = gb('toggle', { has_children: true, toggle: { rich_text: [{ type: 'text', plain_text: 'Clientes social media', text: { content: 'Clientes social media' } }] } });
const gBast = gb('toggle', { has_children: true, toggle: { rich_text: [{ type: 'text', plain_text: 'Bastidores', text: { content: 'Bastidores' } }] } });
blocks.set(GESTAO, [gCols]);
blocks.set(gCols.id.replace(/-/g, ''), [gCol]);
blocks.set(gCol.id.replace(/-/g, ''), [gToggle, gBast]);
const gClients = [gb('child_page', { child_page: { title: 'Studio Alfa' } }), gb('child_page', { child_page: { title: 'Beta Ltda' } })];
blocks.set(gToggle.id.replace(/-/g, ''), gClients);
blocks.set(gBast.id.replace(/-/g, ''), [gb('child_page', { child_page: { title: 'Cliente arquivado antigo' } })]);
// página do Studio Alfa: "Combinado com a marca" (entregas do mês no Planejamento)
const para = (t) => gb('paragraph', { paragraph: { rich_text: [{ type: 'text', plain_text: t, text: { content: t } }] } });
const gComb = gb('toggle', { has_children: true, toggle: { rich_text: [{ type: 'text', plain_text: 'Combinado com a marca', text: { content: 'Combinado com a marca' } }] } });
blocks.set(gClients[0].id.replace(/-/g, ''), [gComb]);
blocks.set(gComb.id.replace(/-/g, ''), [para('Reels mensal: 4'), para('Post mensal: 2'), para('Story mensal: 0')]);
// produção da equipe (cliente fora do app, para não mexer nos testes do planejamento)
const PRODA = seedPage(PLANNING_DB, { 'Título do assunto': title('Editar vídeo da obra'), Cliente: sel('Outro Cliente'), Status: stat('Realizando'), 'Data de postagem': { date: { start: '2026-11-19' } }, 'Tipo de demanda': sel('Reels 2'), 'Observação': sel('Falta edição'), 'Demanda atual está com': sel('Marcos') });
seedPage(PLANNING_DB, { 'Título do assunto': title('Capa atrasada'), Cliente: sel('Outro Cliente'), Status: stat('Realizando'), 'Data de postagem': { date: { start: '2026-11-03' } }, 'Tipo de demanda': sel('Post 1'), 'Observação': sel('Falta design'), 'Demanda atual está com': sel('Lemuel') });
const ROUT = seedPage(ROUTINE_DB, { Tarefa: title('Alimentar o Notion'), Pessoa: sel('Rafa'), Tipo: sel('Tarefa fixa'), Dias: { multi_select: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((name) => ({ name })) }, 'Urgência': sel('Média'), Ativo: { checkbox: true } });
const PLANX = seedPage(PLANNING_DB, { 'Título do assunto': title('De outro cliente'), Cliente: sel('Outro Cliente'), Status: stat('Ideia') });
const page = (id) => store.get(id.replace(/-/g, ''));
const selOf = (id, prop) => page(id).properties[prop].select?.name ?? null;
const textOf = (id, prop) => page(id).properties[prop].rich_text.map((t) => t.plain_text).join('');

// ---------- servidores ----------
await startMock(MOCK_PORT);
let logs = '';
const app = spawn('npx', ['next', 'start', '-p', String(APP_PORT)], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    APP_URL: APP,
    SESSION_SECRET: SECRET,
    NOTION_TOKEN: 'secret_teste',
    NOTION_CLIENTS_DB: CLIENTS_DB,
    NOTION_CONTENTS_DB: CONTENTS_DB,
    NOTION_PLANNING_DB: PLANNING_DB,
    NOTION_ROUTINE_DB: ROUTINE_DB,
    NOTION_SHOOTS_DB: SHOOTS_DB,
    NOTION_GESTAO_PAGE: GESTAO,
    NOTION_ACCESS_DB: ACCESS_DB,
    NOTION_FIN_DB: FIN_DB,
    NOTION_FIN_ACCOUNTS_DB: FINACC_DB,
    NOTION_LOG_DB: LOG_DB,
    FINANCE_PASSWORD: 'senha-fin-teste',
    ADMIN_PASSWORD: 'senha-do-admin-teste',
    NOTION_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
    R2_PUBLIC_URL: 'https://midia.test',
    NEXT_TELEMETRY_DISABLED: '1'
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true
});
app.stdout.on('data', (d) => (logs += d));
app.stderr.on('data', (d) => { logs += d; if (process.env.SRV) process.stdout.write('SERVER ' + d); });
for (let i = 0; i < 60 && !/Ready|started server/i.test(logs); i++) await new Promise((r) => setTimeout(r, 500));

const browser0 = await chromium.launch();
// Sem internet no teste: bloqueia as fontes do Google para não travar o carregamento.
const browser = {
  async newContext(o) {
    const ctx = await browser0.newContext(o);
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    return ctx;
  },
  close: () => browser0.close()
};
const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(['ok', name]);
    console.log('  ✓', name);
  } catch (e) {
    results.push(['falhou', name, e.message]);
    console.log('  ✗', name, '\n    ', process.env.DBG ? e.message.split('\n').slice(0, 6).join(' | ') : e.message.split('\n')[0]);
    const pd = globalThis.__pd;
    if (process.env.SHOTS_DIR && pd) {
      try {
        console.log('     url:', pd.url());
        await pd.screenshot({ path: `${process.env.SHOTS_DIR}/falha-${results.length}.png` });
      } catch {}
    }
  }
}
async function sessionFor(email) {
  const jwt = await new SignJWT({ email, p: 'session' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1d').sign(new TextEncoder().encode(SECRET));
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: 'arco_session', value: jwt, domain: 'localhost', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
  return ctx;
}
const shot = async (p, name) => SHOTS && p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

try {
  await step('sem login vai para a tela de entrada', async () => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto(`${APP}/c/${A}`);
    assert.match(p.url(), /\/entrar$/);
    await ctx.close();
  });

  await step('login por link no e-mail (cliente com 1 marca cai direto na página dela)', async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(`${APP}/entrar`);
    await shot(p, '01-entrar');
    await p.fill('#email', 'A@X.com ');
    await p.click('button[type=submit]');
    await p.getByText('Confira seu e-mail').waitFor();
    await new Promise((r) => setTimeout(r, 300));
    const link = logs.match(/\[login\] link para a@x\.com: (\S+)/)?.[1];
    assert.ok(link, 'link não apareceu no log');
    await p.goto(link);
    await p.click('button:has-text("Entrar")');
    await p.waitForURL(new RegExp(`/c/${A}`), { timeout: 15000 }).catch(async (e) => {
      throw new Error(`A=${A} parou em ${p.url()} :: ${(await p.locator('body').innerText()).slice(0, 200)}`);
    });
    await ctx.close();
  });

  await step('e-mail não liberado recebe a mesma resposta, sem link', async () => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto(`${APP}/entrar`);
    await p.fill('#email', 'intruso@x.com');
    await p.click('button[type=submit]');
    await p.getByText('Confira seu e-mail').waitFor();
    assert.ok(!/link para intruso@x\.com/.test(logs));
    await ctx.close();
  });

  await step('link adulterado não entra', async () => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto(`${APP}/entrar/confirmar?t=abc.def.ghi`);
    await p.click('button:has-text("Entrar")');
    await p.waitForURL(/e=expirado/);
    await ctx.close();
  });

  const ctxA = await sessionFor('a@x.com');
  const pa = await ctxA.newPage();

  await step('semana mostra só os conteúdos do próprio cliente, sem rascunhos', async () => {
    await pa.goto(`${APP}/c/${A}?v=semana&d=2026-11-10`);
    await pa.getByText('Depoimento de cliente').first().waitFor();
    const html = await pa.content();
    assert.ok(html.includes('Antes e depois'));
    assert.ok(html.includes('Promoção de sábado'));
    assert.ok(!html.includes('Post do Beta'), 'vazou conteúdo de outro cliente');
    assert.ok(!html.includes('Rascunho secreto'), 'rascunho apareceu para o cliente');
    await pa.getByText('3 aguardando você').waitFor();
    await pa.waitForTimeout(900);
    await shot(pa, '02-semana');
  });

  await step('mês e feed abrem', async () => {
    await pa.goto(`${APP}/c/${A}?v=mes&d=2026-11-12`);
    await pa.getByRole('heading', { name: 'Novembro' }).waitFor();
    await pa.getByText('Depoimento de cliente').waitFor();
    await pa.waitForTimeout(900);
    await shot(pa, '03-mes');
    await pa.goto(`${APP}/c/${A}?v=feed`);
    await pa.getByRole('heading', { name: 'Feed' }).waitFor();
    const tiles = await pa.locator('.grid3 .tile').count();
    assert.equal(tiles, 2, 'feed deve ter Reels e Carrossel (story não entra no feed)');
  });

  await step('cliente não abre a página de outro cliente', async () => {
    const r = await pa.goto(`${APP}/c/${B}`);
    assert.equal(r.status(), 404);
  });

  await step('cliente não abre conteúdo de outro cliente pelo próprio endereço', async () => {
    const r = await pa.goto(`${APP}/c/${A}/${BPOST}`);
    assert.equal(r.status(), 404);
  });

  await step('cliente não abre rascunho nem painel admin', async () => {
    assert.equal((await pa.goto(`${APP}/c/${A}/${DRAFT}`)).status(), 404);
    assert.equal((await pa.goto(`${APP}/admin`)).status(), 404);
  });

  await step('cliente não consegue gerar envio de arquivos', async () => {
    const r = await pa.request.post(`${APP}/api/upload/video`);
    assert.equal(r.status(), 403);
    const r2 = await pa.request.post(`${APP}/api/upload/image`, { data: { contentType: 'image/jpeg' } });
    assert.equal(r2.status(), 403);
  });

  await step('Reels: aprovar vídeo, pedir ajuste na capa, reprovar legenda e enviar', async () => {
    globalThis.__pd = pa;
    await pa.goto(`${APP}/c/${A}/${REELS}`);
    await pa.getByRole('heading', { name: 'Depoimento de cliente' }).waitFor();
    await pa.waitForTimeout(900);
    await shot(pa, '04-reels');
    const send = pa.getByRole('button', { name: 'Enviar para a Arco' });
    // tentar enviar sem olhar nada: avisa o que falta
    await send.click();
    await pa.getByText('Falta olhar e responder: Vídeo, Capa e Legenda.').waitFor();
    // aprovar o vídeo sem assistir: não deixa
    await pa.getByRole('button', { name: 'Aprovar Vídeo' }).click();
    await pa.getByText('Assista ao vídeo antes de aprovar.').waitFor();
    assert.equal(await pa.getByRole('button', { name: 'Aprovar Vídeo' }).getAttribute('aria-pressed'), 'false');
    // sair no meio: pergunta antes
    await pa.getByRole('link', { name: 'Voltar' }).click();
    await pa.getByRole('dialog', { name: 'Você ainda não terminou' }).waitFor();
    await pa.getByRole('dialog').getByText(/Falta olhar e responder: Vídeo, Capa e Legenda/).waitFor();
    await pa.waitForTimeout(500);
    await pa.screenshot({ path: `${SHOTS}/04b-sair-sem-terminar.png` }).catch(() => {});
    await pa.getByRole('button', { name: 'Continuar revisando' }).click();
    assert.match(pa.url(), new RegExp(REELS.replace(/-/g, '-?')));
    // assiste e aí aprova
    await pa.getByRole('button', { name: /Reproduzir vídeo/ }).click();
    await pa.waitForFunction(() => !!document.fullscreenElement, null, { timeout: 3000 }).catch(() => {});
    await pa.evaluate(() => document.fullscreenElement && document.exitFullscreen());
    await pa.waitForTimeout(300);
    await pa.getByRole('button', { name: 'Aprovar Vídeo' }).click();
    assert.equal(await pa.getByRole('button', { name: /aprovação de Vídeo/ }).getAttribute('aria-pressed'), 'true');
    await pa.locator('.approval-row').nth(1).getByRole('button', { name: 'Ajustar' }).click();
    await pa.getByRole('button', { name: 'Reprovar Legenda' }).click();
    assert.equal(await send.getAttribute('data-ready'), 'nao', 'não pode enviar sem escrever o ajuste');
    await send.click();
    await pa.getByText('Escreva o ajuste de Capa.').first().waitFor();
    await pa.fill('#n-capa', 'Trocar a foto da capa');
    await pa.fill('#n-legenda', 'Tom não combina');
    await pa.waitForTimeout(300);
    await shot(pa, '05-reels-respondendo');
    await send.click();
    await pa.getByText('Respondido por a@x.com').waitFor();
    assert.equal(selOf(REELS, 'Status · Vídeo'), 'Aprovado');
    assert.equal(selOf(REELS, 'Status · Capa'), 'Ajuste');
    assert.equal(textOf(REELS, 'Ajuste · Capa'), 'Trocar a foto da capa');
    assert.equal(selOf(REELS, 'Status · Legenda'), 'Reprovado');
    assert.equal(selOf(REELS, 'Status'), 'Reprovado');
    assert.equal(page(REELS).properties['Respondido por'].email, 'a@x.com');
    await shot(pa, '06-reels-enviado');
  });

  await step('capa abre em tela cheia ao tocar', async () => {
    await pa.goto(`${APP}/c/${A}/${REELS}`);
    await pa.getByRole('button', { name: 'Ampliar Capa do Reels' }).click();
    await pa.getByRole('dialog', { name: 'Capa do Reels' }).waitFor();
    await pa.getByRole('button', { name: 'Fechar' }).click();
    assert.equal(await pa.getByRole('dialog').count(), 0);
  });

  await step('Carrossel desliza com setas e contador; aprovação completa vira Aprovado', async () => {
    await pa.goto(`${APP}/c/${A}/${CARR}`);
    await pa.locator('.counter').waitFor();
    assert.equal((await pa.locator('.counter').textContent()).trim(), '1/3');
    await pa.getByRole('button', { name: 'Próxima arte' }).click();
    await pa.waitForTimeout(700);
    assert.equal((await pa.locator('.counter').textContent()).trim(), '2/3');
    await pa.getByRole('button', { name: 'Aprovar Carrossel' }).click();
    await pa.getByText('Passe todas as artes do carrossel antes de aprovar.').waitFor();
    await pa.getByRole('button', { name: 'Próxima arte' }).click();
    await pa.waitForTimeout(700);
    await pa.getByRole('button', { name: 'Aprovar Carrossel' }).click();
    await pa.getByRole('button', { name: 'Aprovar Legenda' }).click();
    await pa.getByRole('button', { name: 'Enviar para a Arco' }).click();
    await pa.getByText('Tudo aprovado').waitFor();
    assert.equal(selOf(CARR, 'Status'), 'Aprovado');
    await shot(pa, '07-carrossel');
  });

  await step('cliente não vê "marcar como postado"', async () => {
    assert.equal(await pa.getByRole('button', { name: 'Marcar como postado' }).count(), 0);
  });
  await step('avisos no celular: cliente liga só para o próprio cliente e só com endereço válido', async () => {
    const ok = await pa.request.post(`${APP}/api/push`, { data: { clientId: A, endpoint: 'https://fcm.googleapis.com/fcm/send/abc123' } });
    assert.equal(ok.status(), 200);
    assert.match(textOf(A, 'Avisos (inscrições)'), /fcm\.googleapis\.com\/fcm\/send\/abc123/);
    const P = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString('base64url');
    const withKeys = await pa.request.post(`${APP}/api/push`, { data: { clientId: A, endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', p256dh: P, auth: Buffer.alloc(16, 1).toString('base64url') } });
    assert.equal(withKeys.status(), 200);
    assert.match(textOf(A, 'Avisos (inscrições)'), /"auth":"AQEBAQEBAQEBAQEBAQEBAQ"/);
    const evil = await pa.request.post(`${APP}/api/push`, { data: { clientId: A, endpoint: 'https://evil.example/x' } });
    assert.equal(evil.status(), 400);
    const other = await pa.request.post(`${APP}/api/push`, { data: { clientId: B, endpoint: 'https://fcm.googleapis.com/fcm/send/zzz' } });
    assert.equal(other.status(), 403);
    const forged = await pa.request.post(`${APP}/api/push`, { headers: { 'content-type': 'text/plain', origin: 'https://evil.example' }, data: JSON.stringify({ clientId: A, endpoint: 'https://fcm.googleapis.com/fcm/send/x' }) });
    assert.equal(forged.status(), 403);
    await pa.goto(`${APP}/c/${A}`);
    await pa.locator('.push-card, .push-on').first().waitFor({ timeout: 8000 }).catch(() => {});
    await pa.waitForTimeout(600);
    await pa.screenshot({ path: `${SHOTS}/03b-avisos.png` }).catch(() => {});
  });
  await ctxA.close();

  await step('quem só visualiza vê, mas não aprova', async () => {
    const ctx = await sessionFor('v@x.com');
    const p = await ctx.newPage();
    await p.goto(`${APP}/c/${A}/${STORY}`);
    await p.getByText('Seu acesso é só de visualização').waitFor();
    assert.equal(await p.getByRole('button', { name: 'Aprovar Story' }).count(), 0);
    await ctx.close();
  });

  await step('acesso removido no Notion perde a entrada na hora', async () => {
    page(B).properties['E-mails que aprovam'] = { type: 'rich_text', rich_text: [] };
    const ctx = await sessionFor('b@x.com');
    const p = await ctx.newPage();
    const r = await p.goto(`${APP}/c/${B}`);
    assert.ok(r.status() === 404 || /\/entrar/.test(p.url()), `ainda entrou (status ${r.status()})`);
    await ctx.close();
  });

  const ctxAdm = await sessionFor('arcocontents@gmail.com');
  const pd = await ctxAdm.newPage();
  globalThis.__pd = pd;

  await step('admin vê todos os clientes e o rascunho', async () => {
    await pd.setViewportSize({ width: 1440, height: 900 });
    await pd.goto(`${APP}/admin?c=${A}&m=2026-11-10`);
    await pd.getByText('Beta Ltda').waitFor();
    await pd.getByText('Rascunho secreto').waitFor();
    await pd.waitForTimeout(900);
    await shot(pd, '08-admin');
    // aviso é por conteúdo: sem botão geral, um sino em cada conteúdo aguardando
    assert.equal(await pd.getByRole('button', { name: 'Avisar cliente', exact: true }).count(), 0);
    await pd.getByRole('button', { name: 'Avisar cliente sobre Promoção de sábado' }).click();
    const dlg = pd.getByRole('dialog', { name: 'Avisar cliente' });
    const wa = dlg.getByRole('link', { name: /WhatsApp/ });
    await wa.waitFor({ timeout: 10000 });
    let href = decodeURIComponent((await wa.getAttribute('href')) ?? '');
    assert.ok(href.startsWith('https://wa.me/?text=') && href.includes('Promoção de sábado') && href.includes(`/c/${A}/`), href);
    assert.ok(await dlg.getByRole('button', { name: /Google Mensagens/ }).isDisabled(), 'SMS precisa de celular');
    await dlg.getByRole('link', { name: 'Cadastrar celular' }).waitFor();
    await shot(pd, '08b-avisar-conteudo');
    await dlg.getByRole('button', { name: 'Fechar' }).click();
    // cadastra o celular (a coluna é criada sozinha na tabela Clientes do app) e o WhatsApp vai direto
    await pd.goto(`${APP}/admin/clientes/${A}`);
    await pd.getByLabel('Celular com DDD').fill('(65) 99999-8888');
    await pd.locator('form:has(#phone)').getByRole('button', { name: 'Salvar' }).click();
    await pd.getByText('Celular salvo.').waitFor();
    assert.equal(await pd.getByLabel('Celular com DDD').inputValue(), '(65) 99999-8888');
    await pd.getByLabel('Celular com DDD').fill('123');
    await pd.locator('form:has(#phone)').getByRole('button', { name: 'Salvar' }).click();
    await pd.getByText(/Celular inválido/).waitFor();
    await pd.goto(`${APP}/c/${A}/${STORY}`);
    await pd.getByRole('button', { name: 'Avisar cliente' }).click();
    await dlg.getByText('Direto para (65) 99999-8888').waitFor({ timeout: 10000 });
    href = decodeURIComponent((await dlg.getByRole('link', { name: /WhatsApp/ }).getAttribute('href')) ?? '');
    assert.ok(href.startsWith('https://wa.me/5565999998888?text='), href);
    assert.ok(await dlg.getByRole('button', { name: /Google Mensagens/ }).isEnabled());
    await shot(pd, '08c-avisar-com-celular');
    await dlg.getByRole('button', { name: 'Fechar' }).click();
  });

  await step('Gestão separada mostra clientes e o que precisa de atenção', async () => {
    await pd.goto(`${APP}/admin/gestao`);
    await pd.getByRole('heading', { name: 'Gestão' }).waitFor();
    await pd.getByRole('link', { name: /Studio Alfa/ }).first().waitFor();
    await pd.getByRole('link', { name: 'Clientes', exact: true }).waitFor();
    await pd.getByText(/Todos os clientes/).waitFor();
    await pd.waitForTimeout(800);
    await shot(pd, '10-gestao');
  });

  await step('Dashboard de produção conta por formato e guarda o histórico de ajuste', async () => {
    assert.equal(page(REELS).properties['Teve ajuste'].checkbox, true);
    assert.equal(page(REELS).properties['Rodadas de ajuste'].number, 1);
    assert.equal(page(CARR).properties['Teve ajuste'].checkbox, false);
    await pd.goto(`${APP}/admin/gestao/dashboard?m=2026-11-01`);
    await pd.getByRole('link', { name: 'Dashboard', exact: true }).waitFor();
    await pd.getByRole('heading', { name: 'Novembro 2026', level: 2 }).waitFor();
    const num = (label) => pd.locator('.dash-nums div', { has: pd.getByText(label, { exact: true }) }).locator('strong').innerText();
    assert.equal(await num('Planejados'), '4');
    await pd.getByRole('img', { name: '0% postado' }).waitFor();
    assert.equal(await pd.getByText('Aprovados sem ajuste').count(), 0);
    await pd.getByRole('navigation', { name: 'Categoria' }).getByRole('link', { name: 'Post', exact: true }).click();
    await pd.waitForURL(/t=Post/, { waitUntil: 'commit' });
    await pd.locator('.seg a[aria-current="page"]', { hasText: 'Post' }).waitFor();
    assert.equal(await num('Planejados'), '2');
    await pd.getByLabel('Cliente', { exact: true }).selectOption({ label: 'Beta Ltda' });
    await pd.waitForURL(/c=[^&]+.*t=Post|t=Post.*c=[^&]+/, { waitUntil: 'commit' });
    await pd.waitForFunction(() => document.querySelector('.dash-nums div:nth-child(2) strong')?.textContent === '1');
    assert.equal(await num('Planejados'), '1');
    const [dl] = await Promise.all([pd.waitForEvent('download'), pd.getByRole('button', { name: 'Baixar PDF' }).click()]);
    assert.equal(dl.suggestedFilename(), 'producao-novembro-2026-beta-ltda-post.pdf');
    if (SHOTS) await dl.saveAs(`${SHOTS}/10c-dashboard.pdf`);
    await pd.goto(`${APP}/admin/gestao/dashboard?m=2026-11-01`);
    await pd.waitForTimeout(800);
    await shot(pd, '10b-dashboard');
  });

  await step('Planejamento: quadro do Calendário mensal, ideias, edição e envio para aprovação', async () => {
    if (process.env.DBG) { pd.on('pageerror', (e) => console.log('PAGEERR', e.message)); pd.on('console', (m) => console.log('CONSOLE', m.type(), m.text())); }
    await pd.goto(`${APP}/admin/planejamento?c=${A}&m=2026-11-01`);
    await pd.getByRole('heading', { name: 'Planejamento', level: 1 }).waitFor();
    // ligou sozinho pelo nome do cliente
    assert.equal(textOf(A, 'Nome no Calendário mensal'), 'Studio Alfa');
    const col = (n) => pd.getByRole('region', { name: n });
    await col('Ideia').getByText('Ideia de bastidores').waitFor();
    await col('Realizando').getByText('Reels do lançamento').waitFor();
    assert.equal(await pd.getByText('De outro cliente').count(), 0, 'não mostra cards de outro cliente');
    await pd.waitForTimeout(700);
    await shot(pd, '14-planejamento');
    // nova ideia igual ao Notion: abre a ficha com todas as propriedades e se salva sozinha ao ganhar título
    await pd.getByRole('button', { name: 'Nova task em Ideia' }).click();
    const nd = pd.getByRole('dialog', { name: 'Nova task' });
    await nd.getByRole('button', { name: 'Observação' }).click();
    await nd.getByRole('listbox', { name: 'Observação' }).getByRole('option', { name: 'Falta copy' }).click();
    assert.equal([...store.values()].filter((x) => x.properties['Título do assunto']?.title?.[0]?.plain_text === 'Ideia nova do app').length, 0, 'sem título ainda não cria');
    await nd.getByLabel('Título do assunto').fill('Ideia nova do app');
    await nd.getByLabel('Data de postagem').fill('2026-11-27');
    await shot(pd, '14b-nova-task');
    await pd.getByRole('dialog', { name: 'Ideia nova do app' }).getByLabel('Objetivo').waitFor();
    await pd.waitForTimeout(900);
    await pd.getByRole('dialog', { name: 'Ideia nova do app' }).getByRole('button', { name: 'Fechar' }).click();
    await col('Ideia').getByText('Ideia nova do app').waitFor();
    // apagar task: confirma, vai para a lixeira do Notion e dá para desfazer
    await col('Ideia').getByRole('button', { name: /Ideia nova do app/ }).click();
    const dd = pd.getByRole('dialog', { name: 'Ideia nova do app' });
    await dd.getByRole('button', { name: 'Apagar task' }).click();
    await dd.getByRole('alertdialog', { name: 'Confirmar apagar' }).getByRole('button', { name: 'Apagar' }).click();
    await pd.getByText('Task apagada · está na lixeira do Notion').waitFor();
    const trashed = [...store.values()].find((x) => x.properties['Título do assunto']?.title?.[0]?.plain_text === 'Ideia nova do app');
    assert.equal(trashed.archived, true, 'foi para a lixeira (arquivado), não apagado de vez');
    assert.equal(await col('Ideia').getByText('Ideia nova do app').count(), 0);
    await pd.getByRole('button', { name: 'Desfazer' }).click();
    await col('Ideia').getByText('Ideia nova do app').waitFor();
    await pd.waitForTimeout(800);
    assert.equal(trashed.archived, false, 'Desfazer tira da lixeira');
    await pd.waitForTimeout(600);
    const created = [...store.values()].find((x) => x.properties['Título do assunto']?.title?.[0]?.plain_text === 'Ideia nova do app');
    assert.ok(created, 'criou no Calendário mensal');
    assert.equal(created.properties['Cliente'].select.name, 'Studio Alfa');
    assert.equal(created.properties['Status'].status.name, 'Ideia');
    assert.equal(created.properties['Observação'].select.name, 'Falta copy');
    assert.equal(created.properties['Data de postagem'].date.start, '2026-11-27');
    assert.equal(created.properties['Referente ao mês'].select.name, 'Novembro');
    // editar pelo painel lateral
    await col('Ideia').getByRole('button', { name: /Ideia de bastidores/ }).click();
    const drawer = pd.getByRole('dialog', { name: 'Ideia de bastidores' });
    await drawer.waitFor();
    // propriedades iguais às do Notion, com as mesmas opções
    for (const n of ['Cliente', 'Demanda atual está com', 'Status', 'Observação', 'Tipo de demanda', 'Data de postagem', 'Referente ao mês', 'Gravado quando', 'Editado quando', 'Prazo', 'Finalizado', 'Gravado/Briefing por', 'Editado/Design por', 'Postado por']) {
      await drawer.locator('.nprop dt', { hasText: n }).first().waitFor();
    }
    const pickTag = async (label, option) => {
      await drawer.getByRole('button', { name: label, exact: true }).click();
      await pd.getByRole('listbox', { name: label }).getByRole('option', { name: option }).click();
    };
    await pickTag('Tipo de demanda', 'Post 1');
    await drawer.getByLabel('Data de postagem').fill('2026-11-25');
    await pickTag('Status', 'Realizando');
    await pickTag('Gravado/Briefing por', 'Yan');
    await pd.getByRole('listbox', { name: 'Gravado/Briefing por' }).getByRole('option', { name: 'Cliente' }).click();
    await drawer.locator('.nprop dt', { hasText: 'Prazo' }).click();
    await pickTag('Postado por', 'Marcos');
    await drawer.getByLabel('Finalizado').check({ force: true });
    await pd.waitForTimeout(900);
    await shot(pd, '15-planejamento-card');
    assert.equal(page(PLAN1).properties['Tipo de demanda'].select.name, 'Post 1');
    assert.equal(page(PLAN1).properties['Data de postagem'].date.start, '2026-11-25');
    assert.equal(page(PLAN1).properties['Referente ao mês'].select.name, 'Novembro');
    assert.equal(page(PLAN1).properties['Status'].status.name, 'Realizando');
    assert.deepEqual(page(PLAN1).properties['Gravado/Briefing por'].multi_select.map((o) => o.name), ['Yan', 'Cliente']);
    assert.equal(page(PLAN1).properties['Postado por'].select.name, 'Marcos');
    assert.equal(page(PLAN1).properties['Finalizado'].checkbox, true);
    await drawer.getByLabel('Finalizado').uncheck({ force: true });
    await pd.waitForTimeout(500);
    assert.equal(page(PLAN1).properties['Finalizado'].checkbox, false);
    await drawer.getByRole('button', { name: 'Fechar' }).click();
    // arrastar de volta para Ideias
    await col('Realizando').getByRole('button', { name: /Ideia de bastidores/ }).dragTo(col('Ideia'));
    await pd.waitForTimeout(800);
    assert.equal(page(PLAN1).properties['Status'].status.name, 'Ideia');
    // abas por formato, como as visões do Notion
    const tabs = pd.getByRole('navigation', { name: 'Formato' });
    await tabs.getByRole('button', { name: /^Reels/ }).click();
    await col('Realizando').getByText('Reels do lançamento').waitFor();
    assert.equal(await pd.getByText('Ideia de bastidores').count(), 0, 'na aba Reels não aparece Post');
    await tabs.getByRole('button', { name: /^Post/ }).click();
    await col('Ideia').getByText('Ideia de bastidores').waitFor();
    await tabs.getByRole('button', { name: /^Todos/ }).click();
    // nova task em qualquer coluna; na aba Reels já nasce com o próximo número livre
    await tabs.getByRole('button', { name: /^Reels/ }).click();
    await pd.getByRole('button', { name: 'Nova task em Realizando' }).click();
    await pd.getByRole('dialog', { name: 'Nova task' }).getByLabel('Título do assunto').fill('Bastidores da obra');
    // fechar a ficha já salva (sem botão de salvar)
    await pd.getByRole('dialog', { name: 'Nova task' }).getByRole('button', { name: 'Fechar' }).click();
    await col('Realizando').getByText('Bastidores da obra').waitFor();
    await pd.waitForTimeout(600);
    const task = [...store.values()].find((x) => x.properties['Título do assunto']?.title?.[0]?.plain_text === 'Bastidores da obra');
    assert.equal(task.properties['Status'].status.name, 'Realizando');
    assert.equal(task.properties['Tipo de demanda'].select.name, 'Reels 2');
    await tabs.getByRole('button', { name: /^Todos/ }).click();
    // briefing que vai no PDF: lido e gravado dentro do card no Notion
    await col('Realizando').getByRole('button', { name: /Reels do lançamento/ }).click();
    const d2 = pd.getByRole('dialog', { name: 'Reels do lançamento' });
    await d2.getByLabel('Objetivo').waitFor();
    assert.equal(await d2.getByLabel('Objetivo').inputValue(), 'Mostrar o lançamento com força.');
    await d2.getByLabel('Legenda').fill('Chegou a hora.\nVem ver de perto.');
    await d2.getByLabel('Objetivo').click();
    await d2.getByText('Salvo no Notion').waitFor();
    const bl = blocks.get(PLAN2.replace(/-/g, ''));
    assert.equal(bl.length, 4, 'não cria nem apaga blocos ao editar');
    assert.match(bl[1].paragraph.rich_text.map((t) => t.plain_text).join(''), /^Legenda: Chegou a hora\.\nVem ver de perto\.$/);
    // referências: lista com preview; colar link do YouTube adiciona na mesma linha do Notion
    await d2.getByRole('button', { name: 'Ver referência do Instagram' }).waitFor();
    await d2.getByLabel('Adicionar referência').fill('https://youtu.be/dQw4w9WgXcQ?si=abc');
    await d2.getByLabel('Adicionar referência').press('Enter');
    await d2.getByRole('button', { name: 'Ver referência do YouTube' }).waitFor();
    await d2.getByText('Salvo no Notion').waitFor();
    const refText = () => bl[2].paragraph.rich_text.map((t) => t.plain_text).join('');
    assert.equal(refText(), 'Referência: https://www.instagram.com/p/exemplo/\nhttps://youtu.be/dQw4w9WgXcQ?si=abc');
    await d2.getByRole('button', { name: 'Ver referência do YouTube' }).click();
    assert.match(await d2.locator('iframe[title="Referência do YouTube"]').getAttribute('src'), /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
    assert.equal(await d2.locator('.img-thumb').count(), 2);
    await shot(pd, '15c-referencias');
    await d2.getByRole('button', { name: 'Remover imagem' }).last().click();
    await d2.getByText('Salvo no Notion').waitFor();
    assert.equal(bl[3].paragraph.rich_text.map((t) => t.plain_text).join(''), 'Imagens: https://midia.test/i1.jpg');
    assert.equal(bl.length, 4, 'remover não apaga bloco do Notion');
    await d2.getByRole('button', { name: 'Fechar' }).click();
    // o cliente vê o planejamento com referências tocando dentro do app
    await pd.goto(`${APP}/c/${A}/planejamento?m=2026-11`);
    const card = pd.locator('article', { hasText: 'Reels do lançamento' });
    await card.getByText('Mostrar o lançamento com força.').waitFor();
    await card.getByRole('button', { name: 'Ver referência do Instagram' }).click();
    assert.equal(await card.locator('iframe[title="Referência do Instagram"]').getAttribute('src'), 'https://www.instagram.com/p/exemplo/embed/');
    assert.equal(await card.locator('.img-strip img').count(), 1);
    await shot(pd, '16b-planejamento-cliente');
    await pd.goto(`${APP}/admin/planejamento?c=${A}&m=2026-11-01`);
    await col('Realizando').getByText('Reels do lançamento').waitFor();
    // visão de calendário dentro do planejamento
    await pd.getByRole('tab', { name: 'Calendário' }).click();
    const cal20 = pd.getByRole('gridcell', { name: '2026-11-20' });
    await cal20.getByRole('button', { name: /Reels do lançamento/ }).waitFor();
    await pd.getByRole('gridcell', { name: '2026-11-27' }).getByText('Ideia nova do app').waitFor();
    await shot(pd, '14c-calendario');
    await cal20.getByRole('button', { name: /Reels do lançamento/ }).click();
    const nl = pd.getByRole('dialog', { name: 'Reels do lançamento' }).getByRole('link', { name: 'Abrir no Notion' });
    assert.match((await nl.getAttribute('href')) ?? '', /^notion:\/\//);
    await pd.getByRole('dialog', { name: 'Reels do lançamento' }).getByRole('button', { name: 'Fechar' }).click();
    await pd.getByRole('tab', { name: 'Quadro' }).click();
    // lateral: entregas do mês combinadas com a marca
    const ent = pd.getByRole('complementary', { name: /^Entregas de/ });
    await ent.getByText('Reels', { exact: true }).waitFor();
    await ent.getByText(/\/4$/).first().waitFor();
    await shot(pd, '15b-planejamento-entregas');
    await pd.waitForTimeout(300);
    assert.equal(page(A).properties['Reels mensal'].number, 4, 'combinado guardado no cliente');
    // relatório do mês em PDF, pronto para o WhatsApp
    await pd.getByRole('button', { name: 'Planejamento do mês' }).click();
    const rep = pd.getByRole('dialog', { name: 'Planejamento do mês' });
    await rep.getByRole('link', { name: 'Baixar PDF' }).waitFor({ timeout: 30000 });
    assert.match(await rep.getByRole('link', { name: /WhatsApp/ }).first().getAttribute('href'), /^https:\/\/wa\.me\/\?text=.*APROVADO/);
    const [pdf] = await Promise.all([pd.waitForEvent('download'), rep.getByRole('link', { name: 'Baixar PDF' }).click()]);
    assert.match(pdf.suggestedFilename(), /^Planejamento Novembro 2026 - Studio Alfa\.pdf$/);
    if (SHOTS) await pdf.saveAs(`${SHOTS}/16-planejamento-mes.pdf`);
    await pd.waitForTimeout(400);
    await shot(pd, '16-relatorio');
    await rep.getByRole('button', { name: 'Fechar' }).click();
    // enviar para aprovação cria o conteúdo ligado
    await col('Realizando').getByRole('button', { name: /Reels do lançamento/ }).click();
    await pd.getByRole('button', { name: 'Conteúdo editado: enviar para aprovação' }).click();
    await pd.waitForURL(/\/admin\/conteudo\//, { waitUntil: 'commit' });
    const cid = pd.url().split('/admin/conteudo/')[1].split(/[?#]/)[0];
    const content = page(cid);
    assert.equal(content.properties['Tipo'].select.name, 'Reels');
    assert.equal(content.properties['Status'].select.name, 'Rascunho');
    assert.equal(content.properties['Planejamento'].relation[0].id.replace(/-/g, ''), PLAN2.replace(/-/g, ''));
    // aprovação total → card vira "Finalizado"; postado → Status Postado no Notion
    await pd.goto(`${APP}/c/${A}/${cid}`);
    for (const n of ['Vídeo', 'Capa', 'Legenda']) await pd.getByRole('button', { name: `Aprovar ${n}` }).click();
    await pd.getByRole('button', { name: 'Salvar respostas' }).click();
    await pd.getByText('Tudo aprovado').waitFor();
    assert.equal(page(PLAN2).properties['Observação'].select.name, 'Finalizado');
    await pd.getByRole('button', { name: 'Marcar como postado' }).click();
    await pd.getByRole('button', { name: 'Desmarcar postado' }).waitFor();
    assert.equal(page(PLAN2).properties['Status'].status.name, 'Postado');
    assert.equal(page(PLAN2).properties['Finalizado'].checkbox, true);
    // no Notion alguém volta para Realizando: nada quebra; o quadro mostra o link com a aprovação
    await pd.goto(`${APP}/admin/planejamento?c=${A}&m=2026-11-01`);
    await col('Postado').getByText('Reels do lançamento').waitFor();
  });

  await step('Pendências, busca ⌘K e histórico do cliente', async () => {
    await pd.goto(`${APP}/admin/pendencias`);
    await pd.getByRole('heading', { name: 'Pendências', level: 1 }).waitFor();
    const fixRow = pd.locator('.todo', { hasText: 'Depoimento de cliente' });
    await fixRow.waitFor();
    assert.equal(await fixRow.getByRole('link', { name: /Corrigir/ }).getAttribute('href'), `/admin/conteudo/${page(REELS).id}`);
    const badge = await pd.locator('.side-nav .count').innerText();
    assert.ok(Number(badge) >= 1, 'contador de pendências no menu');
    await shot(pd, '11-pendencias');
    // busca rápida
    await pd.keyboard.press('Control+k');
    await pd.getByRole('dialog', { name: 'Buscar' }).waitFor();
    await pd.keyboard.type('beta');
    await pd.waitForTimeout(400);
    await shot(pd, '12-busca');
    await pd.keyboard.press('Control+a');
    await pd.keyboard.type('gerenciar beta');
    await pd.keyboard.press('Enter');
    await pd.waitForURL(/\/admin\/clientes\//, { waitUntil: 'commit' });
    await pd.getByRole('heading', { name: 'Beta Ltda' }).waitFor();
    await pd.getByText(/Histórico · \d+ conteúdos/).waitFor();
    await pd.locator('.row-item', { hasText: 'Post do Beta' }).first().waitFor();
    // lápis de editar direto no calendário
    await pd.goto(`${APP}/admin?c=${A}`);
    assert.equal(await pd.getByRole('link', { name: 'Editar Depoimento de cliente' }).getAttribute('href'), `/admin/conteudo/${page(REELS).id}`);
    // painel no celular
    await pd.setViewportSize({ width: 390, height: 844 });
    await pd.goto(`${APP}/admin?c=${A}`);
    await pd.waitForTimeout(900);
    await shot(pd, '13-admin-celular');
    await pd.locator('.sc-label').click();
    await pd.locator('.clients-scroll a', { hasText: 'Beta Ltda' }).waitFor();
    await shot(pd, '13b-admin-celular-clientes');
    await pd.setViewportSize({ width: 1440, height: 900 });
  });

  await step('admin também aprova, pede ajuste ou reprova', async () => {
    await pd.goto(`${APP}/c/${A}/${STORY}`, { waitUntil: 'networkidle' });
    await pd.getByRole('button', { name: 'Aprovar Story' }).click();
    await pd.getByRole('button', { name: 'Salvar respostas' }).click();
    await pd.getByText('Respondido por arcocontents@gmail.com').waitFor();
    assert.equal(selOf(STORY, 'Status'), 'Aprovado');
  });

  await step('admin marca e desmarca como postado', async () => {
    await pd.getByRole('button', { name: 'Marcar como postado' }).click();
    await pd.getByText('Conteúdo postado').waitFor();
    assert.equal(selOf(STORY, 'Status'), 'Postado');
    await pd.getByRole('button', { name: 'Desmarcar postado' }).click();
    await pd.getByRole('button', { name: 'Marcar como postado' }).waitFor();
    assert.equal(selOf(STORY, 'Status'), 'Aprovado');
  });

  await step('admin libera e remove e-mail de cliente', async () => {
    await pd.goto(`${APP}/admin/clientes/${A}`);
    await pd.fill('#email', 'Novo@X.com');
    await pd.click('button:has-text("Liberar acesso")');
    await pd.getByText('novo@x.com').waitFor();
    assert.match(textOf(A, 'E-mails que aprovam'), /novo@x\.com/);
    await pd.waitForTimeout(600);
    await shot(pd, '09-acessos');
    await pd.getByRole('button', { name: 'Remover acesso de novo@x.com' }).click();
    await pd.getByText('Acesso removido.').waitFor();
    assert.doesNotMatch(textOf(A, 'E-mails que aprovam'), /novo@x\.com/);
  });

  await step('o mesmo e-mail não pode ser liberado em dois clientes', async () => {
    await pd.goto(`${APP}/admin/clientes/${B}`);
    await pd.fill('#email', 'a@x.com');
    await pd.click('button:has-text("Liberar acesso")');
    await pd.getByText('já está liberado no cliente Studio Alfa').waitFor();
    assert.doesNotMatch(textOf(B, 'E-mails que aprovam'), /a@x\.com/);
  });

  await step('novo cliente já com e-mail liberado gera o link de acesso que funciona', async () => {
    await pd.goto(`${APP}/admin/clientes/novo`);
    await pd.fill('#name', 'Gama Studio');
    await pd.fill('#email', 'gama@x.com');
    await pd.click('button:has-text("Criar cliente")');
    await pd.getByText('Cliente criado').waitFor();
    assert.equal(await pd.locator('input[aria-label="Link de acesso"]').count(), 1, 'um link só, direto no calendário');
    const link = await pd.locator('input[aria-label="Link de acesso"]').first().inputValue();
    assert.match(link, /\/entrar\/confirmar\?t=/);
    const gama = [...store.values()].find((p) => p.properties.Nome?.title?.[0]?.plain_text === 'Gama Studio');
    assert.equal(gama.properties['E-mails que aprovam'].rich_text[0].plain_text, 'gama@x.com');
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    await pg.goto(link);
    await pg.click('button:has-text("Entrar")');
    await pg.waitForURL(/\/c\/[^/?]+$/, { timeout: 10000 }).catch(async () => {
      throw new Error(`parou em ${pg.url()} :: ${(await pg.locator('body').innerText()).slice(0, 150)}`);
    });
    await pg.getByText('Gama Studio').first().waitFor();
    await ctx.close();
  });

  await step('link de acesso leva direto ao calendário e, já logado, não pede para entrar de novo', async () => {
    await pd.goto(`${APP}/admin/clientes/${A}`);
    assert.equal(await pd.getByRole('button', { name: /Link do mês|Link da semana/ }).count(), 0);
    await pd.getByRole('button', { name: 'Gerar link de acesso' }).first().click();
    const link = await pd.locator('input[aria-label="Link de acesso"]').inputValue();
    assert.match(link, /next=/);
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    await pg.goto(link);
    await pg.click('button:has-text("Entrar")');
    await pg.waitForURL(new RegExp(`/c/${A}$`));
    await pg.getByRole('heading', { name: 'Semana' }).waitFor();
    await pg.goto(link); // segunda vez: entra direto
    await pg.waitForURL(new RegExp(`/c/${A}$`));
    await ctx.close();
  });

  await step('cliente removido some do painel e perde o acesso', async () => {
    const gama = [...store.values()].find((p) => p.properties.Nome?.title?.[0]?.plain_text === 'Gama Studio');
    await pd.goto(`${APP}/admin/clientes/${gama.id}`);
    await pd.getByRole('button', { name: 'Remover', exact: true }).click();
    await pd.getByRole('button', { name: 'Sim, remover' }).click();
    await pd.waitForURL(/\/admin\/gestao$/);
    assert.equal(page(gama.id).properties.Cancelado.checkbox, true);
    assert.equal(await pd.locator('nav[aria-label="Clientes"] > a', { hasText: 'Gama Studio' }).count(), 0);
    const ctx = await sessionFor('gama@x.com');
    const pg = await ctx.newPage();
    const r = await pg.goto(`${APP}/c/${gama.id}`);
    assert.ok(r.status() === 404 || /\/entrar/.test(pg.url()), `ainda entrou (${r.status()})`);
    await ctx.close();
  });

  await step('logo do cliente aparece no feed', async () => {
    page(A).properties.Logo = { type: 'url', url: 'https://midia.test/logo-alfa.png' };
    await new Promise((r) => setTimeout(r, 16000)); // cache de 15s da lista de clientes
    await pd.goto(`${APP}/c/${A}?v=feed`);
    await pd.locator('img[alt="Logo de Studio Alfa"]').waitFor();
  });

  await step('aprovação só revisa: criar conteúdo leva para o Planejamento', async () => {
    await pd.goto(`${APP}/admin?c=${A}`);
    await pd.locator('.cal').waitFor();
    assert.equal(await pd.getByRole('link', { name: 'Novo conteúdo' }).count(), 0, 'sem criar conteúdo na aprovação');
    assert.equal(await pd.locator('.cal .add').count(), 0);
    await pd.goto(`${APP}/admin/conteudo/novo?c=${A}`);
    await pd.waitForURL(/\/admin\/planejamento\?c=/);
  });
  await step('produção da equipe: por pessoa, rotina, lembrete, passar a vez, semana, cliente e TV', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cuiaba', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    await pd.goto(`${APP}/admin/producao`);
    const colOf = (n) => pd.getByRole('region', { name: n }).or(pd.locator(`section.pcol[aria-label="${n}"]`)).first();
    await colOf('Marcos').getByText('Editar vídeo da obra').waitFor();
    await colOf('Marcos').getByText('Falta edição').waitFor();
    await colOf('Lemuel').getByText('Capa atrasada').waitFor();
    await colOf('Lemuel').getByText(/^Atrasado/).first().waitFor();
    await pd.locator('.pfixed[aria-label="Fixas de Rafa"]').getByText('Alimentar o Notion').waitFor();
    await shot(pd, '20-producao');
    // tarefa fixa: marcar feito guarda o dia no Notion
    await colOf('Rafa').getByRole('button', { name: 'Marcar como feito: Alimentar o Notion' }).first().click();
    await colOf('Rafa').getByRole('button', { name: 'Desmarcar: Alimentar o Notion' }).first().waitFor();
    await pd.waitForTimeout(700);
    assert.match(page(ROUT).properties['Feito em'].rich_text.map((t) => t.plain_text).join(''), new RegExp(today));
    // adicionar task direto na coluna da pessoa
    await colOf('Yan').getByRole('button', { name: 'Adicionar task para Yan' }).click();
    const fy = pd.getByRole('dialog', { name: 'Novo lembrete ou tarefa' });
    assert.equal(await fy.getByRole('button', { name: 'Yan' }).getAttribute('aria-pressed'), 'true', 'já vem com o Yan');
    await fy.getByLabel('Tarefa', { exact: true }).fill('Editar vídeo do cliente X');
    await fy.getByLabel('Data de entrega').fill(today);
    await fy.getByRole('radio', { name: 'Editar reels' }).click();
    assert.equal(await fy.getByLabel('Descrição da tarefa').count(), 0, 'descrição começa minimizada');
    await fy.getByRole('button', { name: 'Adicionar descrição' }).click();
    await fy.getByLabel('Descrição da tarefa').fill('Cortar em 30s\nUsar a trilha do briefing');
    await fy.getByRole('button', { name: 'Salvar' }).click();
    await colOf('Yan').getByText('Editar vídeo do cliente X').waitFor();
    const vid = colOf('Yan').locator('article.pt', { hasText: 'Editar vídeo do cliente X' });
    assert.match((await vid.getAttribute('class')) ?? '', /f-reels/, 'cor de vídeo (laranja, igual ao Notion)');
    assert.match((await vid.getAttribute('class')) ?? '', /\bdue\b/, 'entrega hoje: pisca em neon');
    await vid.locator('.pt-desc', { hasText: 'Usar a trilha do briefing' }).waitFor();
    await vid.getByText('Editar reels', { exact: true }).waitFor();
    const vt = [...store.values()].find((x) => x.properties.Tarefa?.title?.[0]?.plain_text === 'Editar vídeo do cliente X');
    assert.equal(vt.properties.Formato.select.name, 'Editar reels');
    // formato "Outro…": descreve a tarefa
    await colOf('Marcos').getByRole('button', { name: 'Adicionar task para Marcos' }).click();
    const fo = pd.getByRole('dialog', { name: 'Novo lembrete ou tarefa' });
    await fo.getByLabel('Tarefa', { exact: true }).fill('Áudio do podcast');
    await fo.getByLabel('Data de entrega').fill(today);
    await fo.getByRole('radio', { name: 'Outro…' }).click();
    await fo.getByLabel('Descreva o formato').fill('Tratar áudio');
    await fo.getByRole('button', { name: 'Salvar' }).click();
    await colOf('Marcos').locator('article.pt.f-outro', { hasText: 'Áudio do podcast' }).getByText('Tratar áudio').waitFor();
    // cliente freelancer: escolhe e escreve o nome
    await colOf('Yan').getByRole('button', { name: 'Adicionar task para Yan' }).click();
    const ff = pd.getByRole('dialog', { name: 'Novo lembrete ou tarefa' });
    await ff.getByLabel('Tarefa', { exact: true }).fill('Vídeo do casamento');
    await ff.getByLabel('Data de entrega').fill(today);
    await ff.getByRole('radio', { name: 'Freelancer' }).click();
    await ff.getByLabel('Nome do cliente freelancer').fill('João Silva');
    await ff.getByRole('button', { name: 'Salvar' }).click();
    await colOf('Yan').getByText('Freelancer · João Silva').waitFor();
    // casamento: escreve o nome do casal
    await colOf('Rafa').getByRole('button', { name: 'Adicionar task para Rafa' }).click();
    const fc = pd.getByRole('dialog', { name: 'Novo lembrete ou tarefa' });
    await fc.getByLabel('Tarefa', { exact: true }).fill('Editar teaser');
    await fc.getByLabel('Data de entrega').fill(today);
    await fc.getByRole('radio', { name: 'Casamento' }).click();
    await fc.getByRole('button', { name: 'Salvar' }).click();
    await fc.getByText('Escreva o nome do casal.').waitFor();
    await fc.getByLabel('Nome do casal').fill('Ana e Pedro');
    await fc.getByRole('button', { name: 'Salvar' }).click();
    await colOf('Rafa').getByText('Casamento · Ana e Pedro').waitFor();
    // lembrete da equipe: data de lançamento fixa (hoje) e data de entrega obrigatória
    await pd.getByRole('button', { name: 'Lembrete ou tarefa' }).click();
    const f = pd.getByRole('dialog', { name: 'Novo lembrete ou tarefa' });
    assert.equal(await f.getByLabel('Tarefa', { exact: true }).getAttribute('placeholder'), 'Ex.: Editar vídeo');
    const br = `${today.slice(8, 10)}/${today.slice(5, 7)}/${today.slice(0, 4)}`;
    await f.getByLabel('Lançada em').getByText(br).waitFor();
    assert.equal(await f.getByText('Repete').count(), 0, 'sem repetição');
    await f.getByLabel('Tarefa', { exact: true }).fill('Aguar as plantas');
    await f.getByRole('button', { name: 'Equipe' }).click();
    await f.getByRole('radio', { name: 'Lembrete' }).click();
    await f.getByRole('radio', { name: 'Baixa' }).click();
    await f.getByText('opcional').waitFor();
    await f.getByRole('button', { name: 'Salvar' }).click();
    await pd.locator('.pteam').getByText('Aguar as plantas').waitFor();
    await pd.locator('.pteam').getByText(`Lançada ${today.slice(8, 10)}/${today.slice(5, 7)}`).waitFor();
    const plant = [...store.values()].find((x) => x.properties.Tarefa?.title?.[0]?.plain_text === 'Aguar as plantas');
    assert.equal(plant.properties.Pessoa.select.name, 'Equipe');
    assert.equal(plant.properties.Tipo.select.name, 'Lembrete');
    assert.equal(plant.properties.Data.date, null, 'lembrete sem data de entrega');
    assert.equal(plant.properties.Dias.multi_select.length, 0);
    // link individual do Yan: vê a task com a descrição toda aberta
    {
      const { createHmac } = await import('node:crypto');
      const k = createHmac('sha256', Buffer.from(SECRET)).update('arco-equipe-v1:Yan').digest('base64url').slice(0, 24);
      const tp = await pd.context().newPage();
      await tp.goto(`${APP}/equipe/yan?k=${k}`);
      await tp.locator('article.pt', { hasText: 'Editar vídeo do cliente X' }).locator('.pt-desc', { hasText: 'Cortar em 30s' }).waitFor();
      const man = await (await fetch(`${APP}/equipe/yan/app.webmanifest?k=${k}`)).json();
      assert.equal(man.start_url, `/equipe/yan?k=${k}`, 'app da equipe abre no link da pessoa');
      assert.equal((await fetch(`${APP}/equipe/yan/app.webmanifest?k=errada`)).status, 404);
      assert.match(await tp.locator('link[rel="manifest"]').getAttribute('href'), /\/equipe\/yan\/app\.webmanifest/);
      await tp.getByText('Instale o app no celular').waitFor();
      await shot(tp, '22b-equipe-yan');
      await tp.close();
    }
    // checklist de entrega: conteúdo marcado vira Finalizado no Notion e desce riscado
    await colOf('Lemuel').getByRole('button', { name: 'Marcar como entregue: Capa atrasada' }).click();
    await colOf('Lemuel').getByText('1 de 1 entregues').waitFor();
    await pd.waitForTimeout(600);
    const capa = [...store.values()].find((x) => x.properties['Título do assunto']?.title?.[0]?.plain_text === 'Capa atrasada');
    assert.equal(capa.properties['Finalizado'].checkbox, true);
    await colOf('Lemuel').getByRole('button', { name: 'Desmarcar: Capa atrasada' }).click();
    await pd.waitForTimeout(600);
    assert.equal(capa.properties['Finalizado'].checkbox, false);
    // filtro de data: só hoje
    await pd.getByRole('tablist', { name: 'Quando' }).getByRole('tab', { name: 'Hoje' }).click();
    assert.equal(await colOf('Marcos').getByText('Editar vídeo da obra').count(), 0, 'quinta não aparece em "Hoje"');
    await colOf('Lemuel').getByText('Capa atrasada').waitFor();
    await pd.getByRole('tablist', { name: 'Quando' }).getByRole('tab', { name: 'Semana' }).click();
    // transferir a demanda para o Yan: Marcos editou (vai para o relatório)
    await colOf('Marcos').getByRole('button', { name: 'Transferir' }).click();
    const tx = colOf('Marcos').getByRole('group', { name: 'Transferir Editar vídeo da obra' });
    await tx.getByText('Marcos editou (conta no relatório)').waitFor();
    await tx.getByRole('button', { name: /Yan/ }).click();
    await colOf('Yan').getByText('Editar vídeo da obra').waitFor();
    await pd.waitForTimeout(600);
    assert.equal(page(PRODA).properties['Demanda atual está com'].select.name, 'Yan');
    assert.equal(page(PRODA).properties['Editado/Design por'].select.name, 'Marcos');
    assert.equal(page(PRODA).properties['Editado quando'].select.name, ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][Number(today.slice(5, 7)) - 1]);
    // visão por semana e filtro por cliente
    await pd.getByRole('tablist', { name: 'Visualização' }).getByRole('tab', { name: 'Semana' }).click();
    await pd.locator('.pteam.late').getByText('Capa atrasada').waitFor();
    await pd.getByRole('region', { name: /^Quinta 19$/ }).or(pd.locator('section.pday[aria-label="Quinta 19"]')).first().getByText('Editar vídeo da obra').waitFor();
    await shot(pd, '21-producao-semana');
    await pd.getByLabel('Cliente', { exact: true }).selectOption('Outro Cliente');
    assert.equal(await pd.getByText('Alimentar o Notion').count(), 0, 'filtro de cliente esconde o resto');
    // TV: link fixo, sem login, só leitura
    const { createHmac } = await import('node:crypto');
    const key = createHmac('sha256', Buffer.from(SECRET)).update('arco-tv-producao-v1').digest('base64url').slice(0, 28);
    const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const tv = await tvCtx.newPage();
    const bad = await tv.goto(`${APP}/tv/producao?k=errada`);
    assert.equal(bad.status(), 404);
    await tv.goto(`${APP}/tv/producao?k=${key}`);
    await tv.locator('section.pcol[aria-label="Yan"]').getByText('Editar vídeo da obra').waitFor();
    assert.equal(await tv.getByLabel(/^Passar /).count(), 0, 'TV não deixa editar');
    assert.equal(await tv.getByRole('tablist', { name: 'Visualização' }).count(), 0, 'TV esconde os filtros');
    await tv.getByRole('button', { name: 'Filtros' }).click();
    await tv.getByRole('tablist', { name: 'Visualização' }).waitFor();
    await tv.getByRole('button', { name: 'Fechar filtros' }).click();
    await tv.waitForTimeout(600);
    await tv.screenshot({ path: `${SHOTS}/22-producao-tv.png` });
    await tvCtx.close();
  });

  await step('captação: calendário da semana e do mês, quem vai, aparece na produção e no relatório', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cuiaba', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    await pd.goto(`${APP}/admin/captacao`);
    await pd.getByRole('button', { name: 'Nova captação', exact: true }).click();
    const f = pd.getByRole('dialog', { name: 'Nova captação' });
    await f.getByLabel('Captação', { exact: true }).fill('Gravação na obra');
    await f.getByLabel('Dia').fill(today);
    await f.getByLabel('Início').fill('09:00');
    await f.getByLabel('Fim').fill('11:30');
    await f.getByRole('button', { name: 'Salvar' }).click();
    await f.getByText('Escolha quem vai.').waitFor();
    await f.getByRole('group', { name: 'Quem vai' }).getByRole('button', { name: /Yan/ }).click();
    await f.getByRole('group', { name: 'Quem vai' }).getByRole('button', { name: /Rafa/ }).click();
    await f.getByRole('radio', { name: 'Casamento' }).click();
    await f.getByLabel('Nome do casal').fill('Ana e Pedro');
    await f.getByLabel('Local').fill('Fazenda Boa Vista');
    // produtos: o que vai ser feito (fica no Notion e no Notion Calendar)
    await f.getByRole('button', { name: 'Adicionar Foto de capa' }).click();
    await f.getByRole('button', { name: 'Mais Foto de capa' }).click();
    await f.getByRole('button', { name: 'Adicionar Reels' }).click();
    await f.getByRole('button', { name: 'Adicionar Reels' }).click();
    await f.getByRole('button', { name: 'Adicionar Story' }).click();
    await f.getByLabel('Outro produto', { exact: true }).fill('Vídeo depoimento');
    await f.getByRole('button', { name: 'Adicionar outro produto' }).click();
    await f.getByRole('button', { name: 'Tirar Vídeo depoimento' }).click();
    await f.getByLabel('Descrição').fill('Levar o gimbal');
    await f.getByRole('button', { name: 'Salvar' }).click();
    const ev = pd.getByRole('button', { name: 'Gravação na obra às 09:00' });
    await ev.waitFor();
    await ev.getByText('09:00–11:30').waitFor();
    await ev.locator('.sh-prods').getByText('Foto de capa').waitFor();
    {
      const sp = [...store.values()].find((x) => x.properties['Captação']?.title?.[0]?.plain_text === 'Gravação na obra');
      assert.equal(sp.properties.Produtos.rich_text.map((t) => t.plain_text).join(''), 'Foto de capa ×2 · Reels ×2 · Story ×1');
      assert.equal(sp.properties['Observação'].rich_text.map((t) => t.plain_text).join(''), 'Levar o gimbal');
    }
    const sh = [...store.values()].find((x) => x.properties['Captação']?.title?.[0]?.plain_text === 'Gravação na obra');
    assert.deepEqual(sh.properties['Quem vai'].multi_select.map((o) => o.name), ['Yan', 'Rafa']);
    assert.match(sh.properties.Data.date.start, new RegExp(`^${today}T09:00:00-04:00$`));
    assert.equal(sh.properties.Cliente.rich_text.map((t) => t.plain_text).join(''), 'Casamento · Ana e Pedro');
    await pd.waitForTimeout(500);
    await shot(pd, '24-captacao-semana');
    await pd.getByRole('link', { name: 'Mês' }).click();
    await pd.getByRole('gridcell', { name: today }).getByRole('button', { name: 'Gravação na obra às 09:00' }).waitFor();
    await shot(pd, '25-captacao-mes');
    // na produção: aparece para o Yan e para o Rafa; marcar como gravada vira Realizada
    await pd.goto(`${APP}/admin/producao`);
    const yan = pd.locator('section.pcol[aria-label="Yan"]');
    await yan.getByText('Gravação na obra').waitFor();
    await pd.locator('section.pcol[aria-label="Rafa"]').getByText('Gravação na obra').waitFor();
    await yan.getByRole('button', { name: 'Marcar como gravada: Gravação na obra' }).click();
    await pd.waitForTimeout(700);
    assert.equal(sh.properties.Status.select.name, 'Realizada');
    // visão do mês na produção
    await pd.getByRole('navigation', { name: 'Período' }).getByRole('link', { name: 'Mês' }).click();
    await pd.getByText('Produção do mês').waitFor();
    // relatório: quem gravou
    await pd.goto(`${APP}/admin/producao/relatorio?m=${today.slice(0, 7)}`);
    await pd.locator('.db-person', { hasText: 'Yan' }).locator('li.f-capt').first().waitFor();
  });

  await step('tudo em um: captação e task de cliente viram conteúdo no planejamento', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cuiaba', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const txt = (p, n) => (p.properties[n]?.title ?? p.properties[n]?.rich_text ?? []).map((t) => t.plain_text).join('');
    const plans = () => [...store.values()].filter((x) => !x.archived && x.parent?.database_id && x.properties['Título do assunto']);
    // captação do Studio Alfa com Reels ×2 → 2 cards no planejamento, ligados à captação
    await pd.goto(`${APP}/admin/captacao`);
    await pd.getByRole('button', { name: 'Nova captação', exact: true }).click();
    const f = pd.getByRole('dialog', { name: 'Nova captação' });
    await f.getByLabel('Captação', { exact: true }).fill('Gravação loja Alfa');
    await f.getByLabel('Dia').fill(today);
    await f.getByRole('group', { name: 'Quem vai' }).getByRole('button', { name: /Marcos/ }).click();
    await f.getByLabel('Cliente da agência').selectOption('Studio Alfa');
    await f.getByRole('button', { name: 'Adicionar Reels' }).click();
    await f.getByRole('button', { name: 'Mais Reels' }).click();
    await f.getByRole('button', { name: 'Salvar' }).click();
    await pd.getByRole('button', { name: /Gravação loja Alfa/ }).first().waitFor();
    await pd.waitForTimeout(500);
    const made = plans().filter((x) => txt(x, 'Título do assunto').endsWith('· Gravação loja Alfa'));
    assert.deepEqual(made.map((x) => txt(x, 'Título do assunto')).sort(), ['Reels 1 · Gravação loja Alfa', 'Reels 2 · Gravação loja Alfa']);
    assert.equal(made[0].properties.Cliente.select.name, 'Studio Alfa');
    assert.equal(made[0].properties['Observação'].select.name, 'Falta captação');
    assert.deepEqual(made[0].properties['Gravado/Briefing por'].multi_select.map((o) => o.name), ['Marcos']);
    const shootPage = [...store.values()].find((x) => txt(x, 'Captação') === 'Gravação loja Alfa');
    assert.equal(shootPage.properties['Conteúdos'].relation.length, 2);
    // salvar de novo não duplica
    await pd.getByRole('button', { name: /Gravação loja Alfa/ }).first().click();
    const e = pd.getByRole('dialog', { name: 'Editar captação' });
    await e.getByRole('radio', { name: 'Realizada' }).click();
    await pd.waitForTimeout(800);
    assert.equal(plans().filter((x) => txt(x, 'Título do assunto').endsWith('· Gravação loja Alfa')).length, 2, 'não duplica');
    assert.equal(made[0].properties['Observação'].select.name, 'Falta edição', 'captação feita → falta edição');
    if (await e.isVisible()) await e.getByRole('button', { name: 'Fechar' }).click();
    // task de edição do Studio Alfa → card pendente no planejamento; feita → registra quem editou
    await pd.goto(`${APP}/admin/producao`);
    const col = pd.locator('section.pcol[aria-label="Yan"]');
    await col.getByRole('button', { name: 'Adicionar task para Yan' }).click();
    const t = pd.getByRole('dialog', { name: 'Novo lembrete ou tarefa' });
    await t.getByLabel('Tarefa', { exact: true }).fill('Editar vídeo institucional Alfa');
    await t.getByLabel('Data de entrega').fill(today);
    await t.getByRole('radio', { name: 'Editar reels' }).click();
    await t.getByRole('radio', { name: 'Cliente', exact: true }).click();
    await t.getByLabel('Cliente da agência').selectOption('Studio Alfa');
    await t.getByLabel('Conteúdo do planejamento').waitFor();
    await t.getByRole('button', { name: 'Salvar' }).click();
    const card = col.locator('article.pt', { hasText: 'Editar vídeo institucional Alfa' });
    await card.getByText('No planejamento').waitFor();
    const plan = plans().find((x) => txt(x, 'Título do assunto') === 'Editar vídeo institucional Alfa');
    assert.ok(plan, 'card criado no planejamento');
    assert.equal(plan.properties.Status.status.name, 'Realizando');
    assert.equal(plan.properties['Observação'].select.name, 'Falta edição');
    await card.getByRole('button', { name: /Marcar como feito/ }).click();
    await pd.waitForTimeout(900);
    assert.equal(plan.properties['Editado/Design por'].select.name, 'Yan');
    assert.equal(plan.properties['Observação'].select.name, 'Aprovação post');
    // do card no planejamento: abre pelo link da tarefa e cria outra tarefa já preenchida
    const href = await card.getByRole('link', { name: 'Abrir' }).getAttribute('href');
    assert.match(href, /open=/);
    await pd.goto(`${APP}${href}`);
    const dr = pd.getByRole('dialog', { name: 'Editar vídeo institucional Alfa' });
    await dr.waitFor();
    await dr.getByText('Editar reels · Yan').waitFor();
    await dr.getByRole('button', { name: 'Criar tarefa' }).click();
    const nt = dr.getByRole('group', { name: 'Nova tarefa a partir do card' });
    await nt.getByRole('button', { name: /Marcos/ }).click();
    await nt.getByRole('radio', { name: 'Postar' }).click();
    await nt.getByRole('button', { name: 'Criar tarefa' }).click();
    await dr.getByText('Postar · Marcos').waitFor();
    const post = [...store.values()].find((x) => txt(x, 'Tarefa') === 'Editar vídeo institucional Alfa' && x.properties.Pessoa?.select?.name === 'Marcos');
    assert.equal(post.properties['Conteúdo'].relation.length, 1, 'tarefa criada do card já vem ligada');
    assert.equal(post.properties.Cliente.rich_text.map((t) => t.plain_text).join(''), 'Studio Alfa');
  });

  await step('dashboard da produção: o que cada um captou, editou e postou', async () => {
    await pd.goto(`${APP}/admin/producao/relatorio`);
    await pd.getByText('Captações feitas').waitFor();
    await pd.getByText('Postado no Instagram', { exact: true }).first().waitFor();
    await pd.getByText('Pelo cliente', { exact: true }).waitFor();
    const ag = pd.getByRole('region', { name: 'Captações agendadas' });
    await ag.getByText(/Captações agendadas no mês · \d+ no total/).waitFor();
    await ag.locator('.ag-name', { hasText: 'Arco' }).waitFor();
    const yan = pd.locator('.db-person', { hasText: 'Yan' });
    await yan.locator('li.f-capt').first().waitFor();
    await yan.getByLabel('Ver tudo o que Yan produziu').click();
    await yan.locator('.db-items').getByText('Gravação na obra').waitFor();
    await pd.waitForTimeout(700);
    await shot(pd, '23-producao-relatorio');
  });

  await step('app do administrador no celular: lança tarefa para cada pessoa', async () => {
    await pd.setViewportSize({ width: 390, height: 844 });
    await pd.goto(`${APP}/admin/producao`);
    assert.equal(await pd.locator('link[rel="manifest"]').getAttribute('href'), '/admin.webmanifest');
    await pd.locator('section.pcol[aria-label="Yan"]').getByRole('button', { name: 'Adicionar task para Yan' }).waitFor();
    await shot(pd, '30-admin-celular');
    await pd.setViewportSize({ width: 1440, height: 900 });
  });

  await step('outro administrador (Acessos): entra, lança tarefa com histórico e não vê o Financeiro', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cuiaba', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(`${APP}/entrar`);
    await p.fill('#email', 'lemuel@x.com');
    await p.click('button[type=submit]');
    await p.getByText('Confira seu e-mail').waitFor();
    await new Promise((r) => setTimeout(r, 300));
    const link = logs.match(/\[login\] link para lemuel@x\.com: (\S+)/)?.[1];
    assert.ok(link, 'admin da equipe recebe link');
    await p.goto(link);
    await p.click('button:has-text("Entrar")');
    await p.waitForURL(/\/admin/);
    await p.goto(`${APP}/admin/producao`);
    assert.equal(await p.getByRole('link', { name: 'Financeiro' }).count(), 0, 'sem Financeiro no menu');
    const col = p.locator('section.pcol[aria-label="Marcos"]');
    await col.getByRole('button', { name: 'Adicionar task para Marcos' }).click();
    const f = p.getByRole('dialog', { name: 'Novo lembrete ou tarefa' });
    await f.getByLabel('Tarefa', { exact: true }).fill('Revisar legenda Beta');
    await f.getByLabel('Data de entrega').fill(today);
    await f.getByRole('button', { name: 'Salvar' }).click();
    const card = col.locator('article.pt', { hasText: 'Revisar legenda Beta' });
    await card.getByText(/por Lemuel/).waitFor();
    const row = [...store.values()].find((x) => x.properties.Tarefa?.title?.[0]?.plain_text === 'Revisar legenda Beta');
    assert.match(row.properties['Histórico'].rich_text.map((t) => t.plain_text).join(''), /Lemuel lançou para Marcos/);
    // edição aparece no histórico
    await card.locator('.pt-title').click();
    const e = p.getByRole('dialog', { name: 'Editar tarefa' });
    await e.getByRole('radio', { name: 'Alta' }).click();
    await e.getByRole('button', { name: 'Salvar' }).click();
    await p.waitForTimeout(800);
    assert.match(row.properties['Histórico'].rich_text.map((t) => t.plain_text).join(''), /Lemuel editou: urgência Média → Alta/);
    const r = await p.goto(`${APP}/admin/financeiro`);
    assert.equal(r.status(), 404, 'Financeiro fechado por link direto');
    await ctx.close();
  });

  await step('financeiro: bancos, cartão, recorrentes sem duplicar, fatura e calendário', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cuiaba', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const m = today.slice(0, 7);
    const fin = () => [...store.values()].filter((x) => !x.archived && x.parent?.database_id?.replace(/-/g, '') === FIN_DB);
    const txt = (x, n) => (x.properties[n]?.title ?? x.properties[n]?.rich_text ?? []).map((t) => t.plain_text).join('');
    // senha do Financeiro
    await pd.goto(`${APP}/admin/financeiro?v=contas`);
    await pd.getByLabel('Senha do Financeiro').fill('errada');
    await pd.getByRole('button', { name: 'Abrir' }).click();
    await pd.getByText('Senha incorreta.').waitFor();
    await pd.getByLabel('Senha do Financeiro').fill('senha-fin-teste');
    await pd.getByRole('button', { name: 'Abrir' }).click();
    await pd.getByText('Saldo disponível').waitFor();
    await pd.goto(`${APP}/admin/financeiro?v=contas`);
    // banco
    await pd.getByRole('button', { name: 'Banco ou cartão' }).click();
    let d = pd.getByRole('dialog', { name: 'Novo banco ou cartão' });
    await d.getByLabel('Nome').fill('Nubank PJ');
    await d.getByLabel('Saldo informado').fill('10000');
    await d.getByLabel('Saldo em').fill(`${m}-01`);
    await d.getByRole('button', { name: 'Salvar' }).click();
    await pd.getByText('Nubank PJ').first().waitFor();
    // cartão
    await pd.getByRole('button', { name: 'Banco ou cartão' }).click();
    d = pd.getByRole('dialog', { name: 'Novo banco ou cartão' });
    await d.getByRole('radio', { name: 'Cartão' }).click();
    await d.getByLabel('Nome').fill('Cartão Inter');
    await d.getByLabel('Dia de fechamento').fill('20');
    await d.getByLabel('Dia de vencimento').fill('27');
    await d.getByLabel('Banco que paga a fatura').selectOption('Nubank PJ');
    await d.getByRole('button', { name: 'Salvar' }).click();
    await pd.getByText('Cartão Inter').first().waitFor();
    // mensalidade recorrente (todo dia 10)
    const lancar = async (o) => {
      await pd.getByRole('button', { name: 'Lançar entrada ou saída' }).click();
      const f = pd.getByRole('dialog', { name: 'Novo lançamento' });
      await f.getByRole('radio', { name: o.tipo === 'in' ? '+ Entrada' : '− Saída' }).click();
      await f.getByRole('radio', { name: o.cat }).click();
      await f.getByLabel('Descrição').fill(o.desc);
      await f.getByLabel('Valor').fill(o.valor);
      if (o.dia) await f.getByLabel('Dia do vencimento').fill(o.dia);
      if (o.inicio) await f.getByLabel('Início').fill(o.inicio);
      if (o.venc) await f.getByLabel('Vencimento').fill(o.venc);
      if (o.conta) await f.getByLabel('Banco ou cartão').selectOption(o.conta);
      if (o.cliente) await f.getByLabel('Cliente').fill(o.cliente);
      await f.getByRole('button', { name: 'Salvar' }).click();
      await f.waitFor({ state: 'detached' });
    };
    await lancar({ tipo: 'in', cat: 'Mensalidade', desc: 'Mensalidade Studio Alfa', valor: '1.500,00', dia: '10', inicio: `${m}-01`, conta: 'Nubank PJ', cliente: 'Studio Alfa' });
    await lancar({ tipo: 'out', cat: 'Despesa avulsa', desc: 'Microfone', valor: '200', venc: today, conta: 'Nubank PJ' });
    await lancar({ tipo: 'out', cat: 'Plataforma', desc: 'Adobe', valor: '100', dia: '5', inicio: `${m}-01`, conta: 'Cartão Inter' });
    const tpl = fin().find((x) => txt(x, 'Descrição') === 'Mensalidade Studio Alfa');
    assert.equal(tpl.properties.Recorrente.checkbox, true);
    assert.equal(tpl.properties.Dia.number, 10);
    assert.equal(tpl.properties.Valor.number, 1500);
    assert.match(txt(tpl, 'Histórico'), /criou: R\$\s?1\.500,00 todo dia 10/);
    // visão geral
    await pd.goto(`${APP}/admin/financeiro?m=${m}`);
    await pd.getByText('Saldo disponível').waitFor();
    const proxMes = `${String(Number(m.slice(5)) % 12 + 1).padStart(2, '0')}`;
    // receber a mensalidade deste mês: vira ocorrência própria (Origem + Competência), sem duplicar
    await pd.goto(`${APP}/admin/financeiro?m=${m}&v=receitas`);
    await pd.getByRole('button', { name: 'Marcar como recebido: Mensalidade Studio Alfa' }).click();
    await pd.getByRole('button', { name: 'Desfazer pagamento: Mensalidade Studio Alfa' }).waitFor();
    let occ = fin().filter((x) => txt(x, 'Origem') === tpl.id.replace(/-/g, ''));
    assert.equal(occ.length, 1);
    assert.equal(txt(occ[0], 'Competência'), m);
    assert.equal(occ[0].properties['Pago em'].date.start, today);
    await pd.getByRole('button', { name: 'Desfazer pagamento: Mensalidade Studio Alfa' }).click();
    await pd.getByRole('button', { name: 'Marcar como recebido: Mensalidade Studio Alfa' }).waitFor();
    await pd.getByRole('button', { name: 'Marcar como recebido: Mensalidade Studio Alfa' }).click();
    await pd.getByRole('button', { name: 'Desfazer pagamento: Mensalidade Studio Alfa' }).waitFor();
    occ = fin().filter((x) => txt(x, 'Origem') === tpl.id.replace(/-/g, ''));
    assert.equal(occ.length, 1, 'sem duplicar');
    // próximo mês também aparece (gerado sozinho) e ainda pendente
    await pd.goto(`${APP}/admin/financeiro?m=${shiftM(m, 1)}&v=receitas`);
    await pd.getByRole('button', { name: 'Marcar como recebido: Mensalidade Studio Alfa' }).waitFor();
    // cartão: Adobe vai para a fatura do Cartão Inter
    await pd.goto(`${APP}/admin/financeiro?m=${m}&v=contas`);
    const acc = pd.locator('article.acc', { hasText: 'Cartão Inter' });
    await acc.getByText('Adobe').waitFor();
    await acc.getByText('Fatura Cartão Inter').first().waitFor();
    // calendário com contagem regressiva
    await pd.goto(`${APP}/admin/financeiro?m=${m}&v=calendario`);
    await pd.locator('.fchip', { hasText: 'Microfone' }).waitFor();
    await pd.locator('.fcell', { hasText: 'Microfone' }).first().click();
    await pd.getByText('vence hoje').first().waitFor();
    await shot(pd, '31-financeiro-calendario');
    await pd.goto(`${APP}/admin/financeiro?m=${m}`);
    await pd.waitForTimeout(600);
    await shot(pd, '32-financeiro');
  });

  await step('registro: tudo o que foi feito, por quem e quando', async () => {
    const logs2 = [...store.values()].filter((x) => x.parent?.database_id?.replace(/-/g, '') === LOG_DB);
    const acts = logs2.map((x) => x.properties['Ação'].title.map((t) => t.plain_text).join(''));
    assert.ok(acts.some((a) => /Lemuel lançou para Marcos/.test(a)), 'tarefa no registro');
    assert.ok(acts.some((a) => /criou o card/.test(a)), 'planejamento no registro');
    assert.ok(acts.some((a) => /marcou como recebido/.test(a)), 'financeiro no registro');
    assert.ok(acts.some((a) => /transferiu a demanda/.test(a)), 'transferência no registro');
    await pd.goto(`${APP}/admin/registro`);
    await pd.getByText(/Lemuel lançou para Marcos/).first().waitFor();
    await pd.goto(`${APP}/admin/registro?a=Financeiro`);
    await pd.getByText(/marcou como recebido/).first().waitFor();
    await shot(pd, '33-registro');
    // dentro da própria tarefa
    await pd.goto(`${APP}/admin/producao`);
    const card = pd.locator('article.pt', { hasText: 'Revisar legenda Beta' }).first();
    await card.getByRole('button', { name: 'Histórico' }).click();
    await card.locator('.pt-hist').getByText(/Lemuel lançou para Marcos/).waitFor();
    await card.locator('.pt-hist').getByText(/Lemuel editou: urgência/).waitFor();
  });

  await step('cliente novo na Gestão do Notion entra no app sozinho', async () => {
    gClients.push(gb('child_page', { child_page: { title: 'Imperial Casa & Conforto' } }));
    await pd.goto(`${APP}/admin/gestao`);
    await pd.getByRole('button', { name: 'Atualizar do Notion' }).click();
    // a página também sincroniza sozinha ao abrir: pode já ter entrado antes do clique
    await pd.getByText(/1 cliente\(s\) novo\(s\) do Notion\.|Tudo em dia com o Notion\./).waitFor();
    await pd.getByRole('link', { name: /Imperial Casa & Conforto/ }).first().waitFor();
    assert.equal(await pd.getByText('Cliente arquivado antigo').count(), 0, 'Bastidores não entra');
    const imp = [...store.values()].find((x) => x.properties.Nome?.title?.[0]?.plain_text === 'Imperial Casa & Conforto');
    assert.ok(imp, 'criado na tabela Clientes do app');
    // não duplica
    await pd.getByRole('button', { name: 'Atualizar do Notion' }).click();
    await pd.getByText('Tudo em dia com o Notion.').waitFor();
    assert.equal([...store.values()].filter((x) => x.properties.Nome?.title?.[0]?.plain_text === 'Imperial Casa & Conforto').length, 1);
  });

  await step('administrador entra na hora com senha (sem esperar link)', async () => {
    const c = await browser.newContext();
    const p = await c.newPage();
    await p.goto(`${APP}/entrar`);
    await p.getByLabel('Seu e-mail').fill('arcocontents@gmail.com');
    await p.getByRole('button', { name: 'Receber link de acesso' }).click();
    await p.getByLabel('Senha').fill('errada');
    await p.getByRole('button', { name: 'Entrar' }).click();
    await p.getByText('Senha incorreta.').waitFor();
    await p.getByLabel('Senha').fill('senha-do-admin-teste');
    await p.getByRole('button', { name: 'Entrar' }).click();
    await p.waitForURL(/\/admin/);
    await c.close();
  });
  await ctxAdm.close();
} finally {
  await browser.close();
  try { process.kill(-app.pid, 'SIGTERM'); } catch {}
}

const failed = results.filter((r) => r[0] !== 'ok');
console.log(`\n${results.length - failed.length}/${results.length} passaram`);
if (failed.length) {
  console.log(logs.split('\n').filter((l) => /error|Error|⨯/.test(l)).slice(0, 30).join('\n'));
  process.exit(1);
}
process.exit(0);
