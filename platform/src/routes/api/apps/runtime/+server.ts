import { env } from '$env/dynamic/private';
import { error, json } from '@sveltejs/kit';
import { requireSession } from '$lib/server/authClient';
import { getDb } from '$lib/server/db';
import { getHostContainerStates } from '$lib/server/appManager';
import type { RequestHandler } from './$types';

const REQUIRED_PERMISSION = env.REQUIRED_PERMISSION ?? 'platform.manage';
const KNOWN_NO_DB_APPS = new Set(['landing', 'mailer']);
const KNOWN_NO_DEV_APPS = new Set(['mailer']);
const HARD_BLOCKED_DB_APPS = new Set(['auth', 'platform']);
const CORE_APPS = new Set(['auth', 'platform']);

async function requirePlatformAccess(event: Parameters<RequestHandler>[0]) {
  const session = await requireSession(event);
  const permissions = session.user?.permissions ?? [];
  const isAdmin = Boolean(session.user?.isAdmin);

  if (!isAdmin && !permissions.includes(REQUIRED_PERMISSION)) {
    throw error(403, 'You do not have access to Platform.');
  }
}

export const GET: RequestHandler = async (event) => {
  await requirePlatformAccess(event);
  const isDevUi =
    process.env.CHOKIDAR_USEPOLLING === 'true' ||
    (process.env.HOSTNAME ?? '').includes('platform-dev');

  const db = getDb();
  const appsResult = await db.query('select id from platform_apps');
  const appIds = appsResult.rows.map((row) => String(row.id));

  let hostStates = new Map<string, boolean>();
  let runtimeError: string | null = null;

  try {
    hostStates = await getHostContainerStates();
  } catch (err) {
    runtimeError = err instanceof Error ? err.message : 'Failed to read runtime status.';
  }

  function isRunningForKey(key: string) {
    if (hostStates.get(key)) return true;
    // Common compose container name shapes.
    if (hostStates.get(`webapps-${key}-1`)) return true;
    if (hostStates.get(`webapps_${key}_1`)) return true;
    return false;
  }

  function hasHostKey(key: string) {
    if (hostStates.has(key)) return true;
    if (hostStates.has(`webapps-${key}-1`)) return true;
    if (hostStates.has(`webapps_${key}_1`)) return true;
    return false;
  }

  const runtime = Object.fromEntries(
    appIds.map((appId) => [
      appId,
      {
        prod: isRunningForKey(appId),
        dev: isRunningForKey(`${appId}-dev`),
        db:
          KNOWN_NO_DB_APPS.has(appId) || !hasHostKey(`${appId}-db`)
            ? null
            : isRunningForKey(`${appId}-db`),
        availability: {
          prod: hasHostKey(appId),
          dev: hasHostKey(`${appId}-dev`),
          db: hasHostKey(`${appId}-db`)
        },
        controls: {
          prod: !(CORE_APPS.has(appId) && !isDevUi),
          dev: !KNOWN_NO_DEV_APPS.has(appId) && !(CORE_APPS.has(appId) && isDevUi),
          db: !(HARD_BLOCKED_DB_APPS.has(appId) || KNOWN_NO_DB_APPS.has(appId))
        }
      }
    ])
  );

  return json(
    { runtime, runtimeError },
    {
      headers: {
        'Cache-Control': 'no-store'
      }
    }
  );
};
