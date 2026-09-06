// Authorize against the Silpo MCP server and dump `tools/list` (input and
// output JSON Schemas) to docs/silpo-tools.json.
//
//   npm run silpo:tools
import { mkdirSync, writeFileSync } from 'node:fs';
import { connectLocal, ROOT, SERVER_URL } from './lib/silpoLocal.mts';

const TOOLS_FILE = `${ROOT}docs/silpo-tools.json`;

const { client, transport } = await connectLocal();
console.log(`connected: protocol ${transport.protocolVersion}, server`, client.getServerVersion());

const { tools } = await client.listTools();
mkdirSync(`${ROOT}docs`, { recursive: true });
writeFileSync(
  TOOLS_FILE,
  JSON.stringify(
    { fetchedAt: new Date().toISOString(), server: SERVER_URL, count: tools.length, tools },
    null,
    2
  )
);
console.log(`\n${tools.length} tools → docs/silpo-tools.json`);
for (const t of tools) {
  const required = (t.inputSchema.required as string[] | undefined) ?? [];
  console.log(`- ${t.name}  required: ${required.join(', ') || '(none)'}`);
}

await client.close();
