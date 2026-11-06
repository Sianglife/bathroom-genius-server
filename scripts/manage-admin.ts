import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { hostname, userInfo } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { setServers } from 'node:dns';
import { createConnection } from 'mongoose';
import { User, UserSchema } from '../src/modules/auth/schemas/user.schema';
import { AdminRoleService } from '../src/modules/auth/admin-role.service';

async function main() {
  const [action, flag, id, ...extra] = process.argv.slice(2);
  if (
    !['grant', 'revoke'].includes(action) ||
    flag !== '--user-id' ||
    !/^[a-f\d]{24}$/i.test(id || '') ||
    extra.length
  ) {
    throw new Error(
      'Usage: pnpm admin:grant|admin:revoke --user-id <application-user-id>',
    );
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error(
      'An interactive terminal is required to confirm role changes',
    );
  if (existsSync('.env')) process.loadEnvFile('.env');
  if (process.env.DNS_SERVERS)
    setServers(
      process.env.DNS_SERVERS.split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    );
  const connection = await createConnection(
    process.env.MONGODB_URI || 'mongodb://localhost:27017/bathroom_genius',
    {
      dbName: process.env.MONGODB_DB_NAME || process.env.DB_NAME || undefined,
      serverSelectionTimeoutMS: 10000,
    },
  ).asPromise();
  const input = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const service = new AdminRoleService(
      connection.model<User>(User.name, UserSchema),
    );
    const target = await service.target(id);
    const role = action === 'grant' ? 'admin' : 'user';
    console.log(
      JSON.stringify({
        id: target.id,
        displayName: target.displayName,
        from: target.role,
        to: role,
      }),
    );
    if (target.role === role) {
      console.log('No change required.');
      return;
    }
    if ((await input.question('Type yes to confirm: ')).trim() !== 'yes') {
      console.log('Cancelled.');
      return;
    }
    const operator = `${userInfo().username}@${hostname()}`;
    const result = await service.change(id, role, target.role, operator);
    console.log(
      result.changed
        ? 'Role updated; audit entry recorded.'
        : 'No change required.',
    );
  } finally {
    input.close();
    await connection.close();
  }
}

void main().catch((error: unknown) => {
  // Never print connection strings, database errors or credentials.
  const safe =
    error instanceof Error &&
    /^(Usage:|An interactive|Invalid application|User does not|Role changed)/.test(
      error.message,
    );
  console.error(
    safe
      ? (error as Error).message
      : 'Unable to change role. Check database connectivity and configuration.',
  );
  process.exitCode = 1;
});
