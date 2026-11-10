import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Sem cache incremental: o app usa um cache próprio, curtinho, em memória.
const config = defineCloudflareConfig({});

// O "npm run build" do projeto chama o OpenNext; aqui o OpenNext chama o Next direto,
// para não entrar em laço. Assim a Cloudflare funciona com os comandos padrão
// (build: npm run build · deploy: npx wrangler deploy).
config.buildCommand = 'npx next build';

export default config;
