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
  get igAppId() {
    return read('IG_APP_ID');
  },
  get igAppSecret() {
    return read('IG_APP_SECRET');
  },
  get tokenEncKey() {
    return need('TOKEN_ENC_KEY');
  },
  get cronSecret() {
    return read('CRON_SECRET');
  }
};

export const isProd = process.env.NODE_ENV === 'production';
