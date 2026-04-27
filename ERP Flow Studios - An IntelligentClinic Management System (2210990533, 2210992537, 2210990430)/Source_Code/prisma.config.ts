import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
        path: 'prisma/migrations',
    },
    datasource: {
        // CLI commands like db push are more reliable on the direct port.
        url: env('DIRECT_URL'),
    },
})
