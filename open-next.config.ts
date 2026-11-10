import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Sem cache incremental: o app usa um cache próprio, curtinho, em memória.
export default defineCloudflareConfig({});
