import 'server-only';

function read(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export function need(name: string): string {
  const v = read(name);
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

export const env = {
  get adminEmail() {
    return (read('ADMIN_EMAIL') ?? 'arcocontents@gmail.com').toLowerCase();
  },
  /** Tabela "🔑 Acessos do app": outros administradores (e quem vê o Financeiro). */
  get accessDb() {
    return read('NOTION_ACCESS_DB') ?? null;
  },
  /** "🧾 Clientes avulsos": freelancers e avulsos (cadastro reaproveitado quando voltam). */
  get avulsosDb() {
    return read('NOTION_AVULSOS_DB') ?? null;
  },
  /** "📜 Registro do app": tudo o que é feito no app. */
  get logDb() {
    return read('NOTION_LOG_DB') ?? null;
  },
  /** Senha extra para abrir o Financeiro (secret FINANCE_PASSWORD no Cloudflare). Sem ela, não pede senha. */
  get financePassword() {
    return read('FINANCE_PASSWORD') ?? null;
  },
  get finDb() {
    return read('NOTION_FIN_DB') ?? null;
  },
  get finAccountsDb() {
    return read('NOTION_FIN_ACCOUNTS_DB') ?? null;
  },
  get appUrl() {
    return (read('APP_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
  },
  get timeZone() {
    return read('APP_TIME_ZONE') ?? 'America/Cuiaba';
  },
  get sessionSecret() {
    const s = need('SESSION_SECRET');
    if (s.length < 32) throw new Error('SESSION_SECRET precisa ter pelo menos 32 caracteres');
    return new TextEncoder().encode(s);
  },
  get notionToken() {
    return need('NOTION_TOKEN');
  },
  get clientsDb() {
    return need('NOTION_CLIENTS_DB');
  },
  get contentsDb() {
    return need('NOTION_CONTENTS_DB');
  },
  /** Calendário mensal (planejamento e produção) que já existia no Notion da Arco. */
  get planningDb() {
    return read('NOTION_PLANNING_DB');
  },
  /** Senha do administrador (secret no Cloudflare): entra na hora, sem link por e-mail. */
  get adminPassword() {
    return read('ADMIN_PASSWORD');
  },
  /** Página Gestão do Notion: os clientes do toggle "Clientes ..." entram no app sozinhos. */
  get gestaoPage() {
    return read('NOTION_GESTAO_PAGE');
  },
  /** 📸 Captações (tabela do app; aparece no Notion Calendar). */
  get shootsDb() {
    return read('NOTION_SHOOTS_DB');
  },
  /** Produção — rotina e lembretes (tabela do app). */
  /** Link iCal secreto da agenda (Google/Notion Calendar), só leitura. */
  get captacaoIcs() {
    return read('CAPTACAO_ICS_URL') || null;
  },
  get routineDb() {
    return read('NOTION_ROUTINE_DB');
  },
  get vapidPublicKey() {
    return read('VAPID_PUBLIC_KEY');
  },
  get vapidPrivateKey() {
    return read('VAPID_PRIVATE_KEY');
  },
  get resendKey() {
    return read('RESEND_API_KEY');
  },
  get emailFrom() {
    return read('EMAIL_FROM') ?? 'Arco Contents <acesso@arcocontents.com.br>';
  },
  get cfAccountId() {
    return need('CF_ACCOUNT_ID');
  },
  get cfStreamToken() {
    return need('CF_STREAM_TOKEN');
  },
  /** Stream (pago) é opcional: sem ele, os vídeos vão para o R2 (grátis). */
  get streamEnabled() {
    return !!read('CF_STREAM_TOKEN');
  },
  get cfStreamCustomerCode() {
    return read('CF_STREAM_CUSTOMER_CODE');
  },
  get r2AccessKeyId() {
    return need('R2_ACCESS_KEY_ID');
  },
  get r2SecretAccessKey() {
    return need('R2_SECRET_ACCESS_KEY');
  },
  get r2Bucket() {
    return need('R2_BUCKET');
  },
  get r2PublicUrl() {
    return need('R2_PUBLIC_URL').replace(/\/$/, '');
  },
  get tokenEncKey() {
    return need('TOKEN_ENC_KEY');
  },
  get cronSecret() {
    return read('CRON_SECRET');
  }
};

export const isProd = process.env.NODE_ENV === 'production';
