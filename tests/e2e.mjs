// Teste de ponta a ponta: Notion falso + app real + navegador real.
// Uso: npm run build && node tests/e2e.mjs
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { SignJWT } from 'jose';
import { chromium } from 'playwright';
import { CLIENTS_DB, CONTENTS_DB, seedPage, startMock, store } from './mock-notion.mjs';

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
const REELS = seedPage(CONTENTS_DB, { 'Título': title('Depoimento de cliente'), Cliente: rel(A), Data: date('2026-11-12T18:00:00'), Tipo: sel('Reels'), Status: sel('Aguardando'), Capa: { url: 'https://midia.test/capa.jpg' }, Legenda: rt('Legenda do reels #teste') });
const CARR = seedPage(CONTENTS_DB, { 'Título': title('Antes e depois'), Cliente: rel(A), Data: date('2026-11-11T12:00:00'), Tipo: sel('Carrossel'), Status: sel('Aguardando'), Artes: { files: [1, 2, 3].map((i) => ({ name: `Arte ${i}`, type: 'external', external: { url: `https://midia.test/a${i}.jpg` } })) }, Legenda: rt('Legenda do carrossel') });
const STORY = seedPage(CONTENTS_DB, { 'Título': title('Promoção de sábado'), Cliente: rel(A), Data: date('2026-11-14T09:00:00'), Tipo: sel('Story'), Status: sel('Aguardando'), 'Imagem do story': { url: 'https://midia.test/s.jpg' } });
const DRAFT = seedPage(CONTENTS_DB, { 'Título': title('Rascunho secreto'), Cliente: rel(A), Data: date('2026-11-13T10:00:00'), Tipo: sel('Post'), Status: sel('Rascunho') });
const BPOST = seedPage(CONTENTS_DB, { 'Título': title('Post do Beta'), Cliente: rel(B), Data: date('2026-11-12T10:00:00'), Tipo: sel('Post'), Status: sel('Aguardando') });

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
    console.log('  ✗', name, '\n    ', e.message.split('\n')[0]);
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
    await pa.goto(`${APP}/c/${A}/${REELS}`);
    await pa.getByRole('heading', { name: 'Depoimento de cliente' }).waitFor();
    await pa.waitForTimeout(900);
    await shot(pa, '04-reels');
    await pa.getByRole('button', { name: 'Aprovar Vídeo' }).click();
    await pa.locator('.approval-row').nth(1).getByRole('button', { name: 'Ajustar' }).click();
    const send = pa.getByRole('button', { name: 'Enviar para a Arco' });
    await pa.getByRole('button', { name: 'Reprovar Legenda' }).click();
    assert.equal(await send.isDisabled(), true, 'não pode enviar sem escrever o ajuste');
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

  await step('Carrossel desliza com setas e contador; aprovação completa vira Aprovado', async () => {
    await pa.goto(`${APP}/c/${A}/${CARR}`);
    await pa.locator('.counter').waitFor();
    assert.equal((await pa.locator('.counter').textContent()).trim(), '1/3');
    await pa.getByRole('button', { name: 'Próxima arte' }).click();
    await pa.waitForTimeout(700);
    assert.equal((await pa.locator('.counter').textContent()).trim(), '2/3');
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

  await step('admin vê todos os clientes e o rascunho', async () => {
    await pd.setViewportSize({ width: 1440, height: 900 });
    await pd.goto(`${APP}/admin?c=${A}&m=2026-11-10`);
    await pd.getByText('Beta Ltda').waitFor();
    await pd.getByText('Rascunho secreto').waitFor();
    await pd.waitForTimeout(900);
    await shot(pd, '08-admin');
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
