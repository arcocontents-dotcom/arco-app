// Teste de ponta a ponta: Notion falso + app real + navegador real.
// Uso: npm run build && node tests/e2e.mjs
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { SignJWT } from 'jose';
import { chromium } from 'playwright';
import { CLIENTS_DB, CONTENTS_DB, PLANNING_DB, seedPage, startMock, store } from './mock-notion.mjs';

const MOCK_PORT = 4010;
const APP_PORT = 3100;
const APP = `http://localhost:${APP_PORT}`;
const SECRET = 'teste-teste-teste-teste-teste-teste-123456';
const SHOTS = process.env.SHOTS_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const rt = (s) => ({ rich_text: [{ text: { content: s } }] });
const title = (s) => ({ title: [{ text: { content: s } }] });
const sel = (s) => ({ select: { name: s } });

// ---------- dados ----------
const A = seedPage(CLIENTS_DB, { Nome: title('Studio Alfa'), 'E-mails que aprovam': rt('a@x.com'), 'E-mails que só visualizam': rt('v@x.com'), Instagram: rt('studioalfa') });
const B = seedPage(CLIENTS_DB, { Nome: title('Beta Ltda'), 'E-mails que aprovam': rt('b@x.com') });
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
    VAPID_PUBLIC_KEY: 'BMocD2_Bate1IK8f6sJ1d4i2a3m9Q0fTq6m1nUQ8m2m0a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w',
    VAPID_PRIVATE_KEY: 'teste',
    NOTION_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
    R2_PUBLIC_URL: 'https://midia.test',
    NEXT_TELEMETRY_DISABLED: '1'
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true
});
app.stdout.on('data', (d) => (logs += d));
app.stderr.on('data', (d) => (logs += d));
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
    await col('Ideias').getByText('Ideia de bastidores').waitFor();
    await col('Em produção').getByText('Reels do lançamento').waitFor();
    assert.equal(await pd.getByText('De outro cliente').count(), 0, 'não mostra cards de outro cliente');
    await pd.waitForTimeout(700);
    await shot(pd, '14-planejamento');
    // nova ideia direto no Notion
    await pd.getByLabel('Nova ideia').fill('Ideia nova do app');
    await pd.keyboard.press('Enter');
    await col('Ideias').getByText('Ideia nova do app').waitFor();
    await pd.waitForTimeout(600);
    const created = [...store.values()].find((x) => x.properties['Título do assunto']?.title?.[0]?.plain_text === 'Ideia nova do app');
    assert.ok(created, 'criou no Calendário mensal');
    assert.equal(created.properties['Cliente'].select.name, 'Studio Alfa');
    assert.equal(created.properties['Status'].status.name, 'Ideia');
    // editar pelo painel lateral
    await col('Ideias').getByRole('button', { name: /Ideia de bastidores/ }).click();
    const drawer = pd.getByRole('dialog', { name: 'Ideia de bastidores' });
    await drawer.waitFor();
    await drawer.getByLabel('Tipo de demanda').selectOption('Post 1');
    await drawer.getByLabel('Data de postagem').fill('2026-11-25');
    await drawer.getByRole('button', { name: 'Em produção' }).click();
    await pd.waitForTimeout(800);
    await shot(pd, '15-planejamento-card');
    assert.equal(page(PLAN1).properties['Tipo de demanda'].select.name, 'Post 1');
    assert.equal(page(PLAN1).properties['Data de postagem'].date.start, '2026-11-25');
    assert.equal(page(PLAN1).properties['Referente ao mês'].select.name, 'Novembro');
    assert.equal(page(PLAN1).properties['Status'].status.name, 'Realizando');
    await drawer.getByRole('button', { name: 'Fechar' }).click();
    // arrastar de volta para Ideias
    await col('Em produção').getByRole('button', { name: /Ideia de bastidores/ }).dragTo(col('Ideias'));
    await pd.waitForTimeout(800);
    assert.equal(page(PLAN1).properties['Status'].status.name, 'Ideia');
    // enviar para aprovação cria o conteúdo ligado
    await col('Em produção').getByRole('button', { name: /Reels do lançamento/ }).click();
    await pd.getByRole('button', { name: 'Enviar para aprovação' }).click();
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
    await pd.goto(`${APP}/c/${A}/${STORY}`);
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

  await step('admin cria conteúdo (rascunho) pelo app e ele vai para o Notion', async () => {
    await pd.goto(`${APP}/admin/conteudo/novo?c=${A}&d=2026-11-20`);
    await pd.fill('#ti', 'Lançamento de dezembro');
    await pd.getByRole('button', { name: 'Carrossel' }).click();
    await pd.fill('#lg', 'Nova coleção');
    await pd.getByRole('button', { name: 'Salvar como rascunho' }).click();
    await pd.waitForURL(/\/admin\?c=/);
    const created = [...store.values()].find((p) => p.properties['Título']?.title?.[0]?.plain_text === 'Lançamento de dezembro');
    assert.ok(created, 'não criou no Notion');
    assert.equal(created.properties.Status.select.name, 'Rascunho');
    assert.equal(created.properties.Tipo.select.name, 'Carrossel');
    assert.equal(created.properties.Data.date.start.slice(0, 10), '2026-11-20');
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
