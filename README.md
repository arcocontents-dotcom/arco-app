# Arco Contents — App de Aprovação

Calendário semanal e mensal, prévia do feed e aprovação de Reels, Post, Carrossel e Story, com tudo gravado no Notion.

- **Admin** (`ADMIN_EMAIL`, padrão `arcocontents@gmail.com`): vê todos os clientes, cria conteúdo, libera acessos, aprova/ajusta/reprova e marca como postado.
- **Cliente**: entra com um link enviado ao e-mail liberado e vê **só** a página dele. "Pode aprovar" ou "Só visualiza".

## Como funciona

| Parte | Onde fica | Custo |
|---|---|---|
| App | Cloudflare Workers (Next.js via OpenNext) | grátis |
| Dados | Notion: bases **Clientes** e **Conteúdos** na página "Arco app" | grátis |
| Vídeos e imagens | Cloudflare R2 (vídeos são comprimidos no navegador antes do envio) | grátis até 10 GB |
| E-mail de login | Resend | grátis até 3.000/mês |
| Instagram | Instagram API com Instagram Login | grátis |

Não renomeie as colunas das bases do Notion: o app lê pelos nomes (ver `src/lib/schema.json`).
Conteúdo criado direto no Notion só aparece para o cliente quando o **Status** for diferente de "Rascunho" (ex.: "Aguardando").

## Publicar (Cloudflare)

1. **Notion**: notion.so/profile/integrations → New integration (Internal) → copie o segredo. Na página "Arco app": ••• → Conexões → adicione a integração.
2. **R2**: Cloudflare → R2 → criar bucket `arco-midia`.
   - Settings → Public access → habilite o **r2.dev** (ou um domínio próprio) e copie a URL pública.
   - Settings → CORS policy:
     ```json
     [{ "AllowedOrigins": ["https://SEU-APP.workers.dev"], "AllowedMethods": ["PUT", "GET"], "AllowedHeaders": ["Content-Type"], "MaxAgeSeconds": 3600 }]
     ```
   - R2 → Manage API tokens → criar token "Object Read & Write" só para esse bucket → copie Access Key ID e Secret.
3. **Resend**: crie a conta, adicione o domínio `arcocontents.com.br` e cadastre no seu provedor de domínio os registros que o Resend mostrar (só adiciona registros; não mexe no site nem no e-mail atual). Crie uma API key.
4. **Workers**: Cloudflare → Workers & Pages → Create → Import a repository → `arco-app`.
   - Build command: `npx opennextjs-cloudflare build`
   - Deploy command: `npx opennextjs-cloudflare deploy`
5. Em **Settings → Variables and Secrets** do Worker, cadastre as variáveis do `.env.example` (as chaves como *Secret*). Gere os segredos com:
   - `SESSION_SECRET`: `openssl rand -base64 48`
   - `TOKEN_ENC_KEY`: `openssl rand -base64 32`
6. Faça um novo deploy. Entre em `/entrar` com `arcocontents@gmail.com`.

## Instagram (quando quiser)

1. developers.facebook.com → criar app → produto **Instagram** → "API setup with Instagram login".
2. Redirect URI: `https://SEU-APP/api/instagram/callback`.
3. Copie App ID e App Secret para `IG_APP_ID` e `IG_APP_SECRET`.
4. Enquanto a Meta não aprovar o app (App Review), só contas adicionadas como testers conseguem conectar.
5. No painel: cliente → Acessos → **Conectar Instagram**. O token é guardado criptografado e renovado sozinho.

## Desenvolvimento

```bash
npm install
cp .env.example .env.local   # preencha
npm run dev                  # http://localhost:3000
npm run test:e2e             # 20 testes de ponta a ponta com um Notion falso
npm run preview              # roda no mesmo motor da Cloudflare
```

Sem `RESEND_API_KEY`, o link de login aparece no log do servidor.

## Fonte

Gotham é paga. Com a licença web, coloque os `.woff2` em `public/fonts/` e ative `fonts.css` em `src/app/layout.tsx`. Até lá, Montserrat.
