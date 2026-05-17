import { env } from '$env/dynamic/private';
import { error, fail } from '@sveltejs/kit';
import { requireSession } from '$lib/server/authClient';
import { getDb } from '$lib/server/db';
import {
  createManagedApp,
  parseCreateForm,
  parseUpdateForm,
  setAllAppContainersByMode,
  startAllContainers,
  startAppContainer,
  startAppDbContainer,
  stopAllContainers,
  stopAppContainer,
  stopAppDbContainer,
  updateManagedApp
} from '$lib/server/appManager';
import type { Actions, PageServerLoad } from './$types';

const REQUIRED_PERMISSION = env.REQUIRED_PERMISSION ?? 'platform.manage';

type AppPermission = {
  permission: string;
  label: string;
  description: string | null;
  isRequiredForAccess: boolean;
};

type PlatformApp = {
  id: string;
  title: string;
  endpoint: string;
  imageUrl: string | null;
  imageAlt: string | null;
  enabled: boolean;
  showWhenLocked: boolean;
  showInCatalog: boolean;
  adminOnly: boolean;
  sortOrder: number;
  appType: 'management' | 'applet';
  absolutePath: string;
  isPublic: boolean;
  requiredPermission: string | null;
  permissions: AppPermission[];
};

async function listApps(): Promise<PlatformApp[]> {
  const db = getDb();
  const columnResult = await db.query(
    `select column_name
     from information_schema.columns
     where table_schema = 'public'
       and table_name = 'platform_apps'
       and column_name in ('show_in_catalog')`
  );
  const hasShowInCatalog = new Set(
    columnResult.rows.map((row: { column_name: string }) => row.column_name)
  ).has('show_in_catalog');

  const appsResult = await db.query(
    `select
      id,
      title,
      endpoint,
      image_url,
      image_alt,
      enabled,
      show_when_locked,
      ${hasShowInCatalog ? 'show_in_catalog' : 'true as show_in_catalog'},
      admin_only,
      sort_order,
      app_type,
      absolute_path,
      is_public,
      required_permission
     from platform_apps
     order by sort_order asc, title asc`
  );

  const permissionsResult = await db.query(
    `select app_id, permission, label, description, is_required_for_access
     from platform_app_permissions
     order by app_id asc, permission asc`
  );

  const permissionsByApp = new Map<string, AppPermission[]>();

  for (const row of permissionsResult.rows) {
    const current = permissionsByApp.get(row.app_id) ?? [];
    current.push({
      permission: row.permission,
      label: row.label,
      description: row.description,
      isRequiredForAccess: row.is_required_for_access
    });
    permissionsByApp.set(row.app_id, current);
  }

  return appsResult.rows.map((row) => ({
    id: row.id,
    title: row.title,
    endpoint: row.endpoint,
    imageUrl: row.image_url,
    imageAlt: row.image_alt,
    enabled: row.enabled,
    showWhenLocked: row.show_when_locked,
    showInCatalog: row.show_in_catalog,
    adminOnly: row.admin_only,
    sortOrder: row.sort_order,
    appType: row.app_type,
    absolutePath: row.absolute_path,
    isPublic: row.is_public,
    requiredPermission: row.required_permission,
    permissions: permissionsByApp.get(row.id) ?? []
  }));
}

async function requirePlatformAccess(event: Parameters<PageServerLoad>[0]) {
  const session = await requireSession(event);
  const permissions = session.user?.permissions ?? [];
  const isAdmin = Boolean(session.user?.isAdmin);

  if (!isAdmin && !permissions.includes(REQUIRED_PERMISSION)) {
    throw error(403, 'You do not have access to Platform.');
  }

  return session;
}

export const load: PageServerLoad = async (event) => {
  const session = await requirePlatformAccess(event);
  const user = (session.user ?? {}) as Record<string, unknown>;

  const apps = await listApps();
  const modeCandidate = user.themeMode ?? user.colorMode;
  const primaryCandidate = user.primaryColor ?? user.themePrimary ?? user.shellPrimary;
  const secondaryCandidate = user.secondaryColor ?? user.themeSecondary ?? user.shellSecondary;
  const shellTheme = {
    mode:
      modeCandidate === 'light' || modeCandidate === 'dark' || modeCandidate === 'system'
        ? modeCandidate
        : 'dark',
    primary: typeof primaryCandidate === 'string' ? primaryCandidate : '#58a6ff',
    secondary: typeof secondaryCandidate === 'string' ? secondaryCandidate : '#a855f7'
  };

  return {
    session,
    user: {
      ...session.user,
      permissions: session.user?.permissions ?? []
    },
    shellTheme,
    apps
  };
};

export const actions: Actions = {
  createApp: async (event) => {
    await requirePlatformAccess(event);

    const formData = await event.request.formData();
    const db = getDb();

    try {
      const input = parseCreateForm(formData);
      const created = await createManagedApp(input, db);

      return {
        success: true,
        message: `Created app '${created.title}' at ${created.absolutePath}.`
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create app.';
      return fail(400, {
        success: false,
        message
      });
    }
  },

  updateApp: async (event) => {
    await requirePlatformAccess(event);

    const formData = await event.request.formData();
    const db = getDb();

    try {
      const input = parseUpdateForm(formData);
      await updateManagedApp(input, db);

      return {
        success: true,
        message: `Updated app '${input.id}'.`
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update app.';
      return fail(400, {
        success: false,
        message
      });
    }
  },

  startApp: async (event) => {
    await requirePlatformAccess(event);
    const appId = String((await event.request.formData()).get('id') ?? '').trim();

    try {
      await startAppContainer(appId, false);
      return { success: true, message: `Started ${appId}.` };
    } catch (err) {
      return fail(400, { success: false, message: err instanceof Error ? err.message : 'Start failed.' });
    }
  },

  stopApp: async (event) => {
    await requirePlatformAccess(event);
    const appId = String((await event.request.formData()).get('id') ?? '').trim();

    try {
      await stopAppContainer(appId, false);
      return { success: true, message: `Stopped ${appId}.` };
    } catch (err) {
      return fail(400, { success: false, message: err instanceof Error ? err.message : 'Stop failed.' });
    }
  },

  startAppDev: async (event) => {
    await requirePlatformAccess(event);
    const appId = String((await event.request.formData()).get('id') ?? '').trim();

    try {
      await startAppContainer(appId, true);
      return { success: true, message: `Started ${appId}-dev.` };
    } catch (err) {
      return fail(400, { success: false, message: err instanceof Error ? err.message : 'Start dev failed.' });
    }
  },

  stopAppDev: async (event) => {
    await requirePlatformAccess(event);
    const appId = String((await event.request.formData()).get('id') ?? '').trim();

    try {
      await stopAppContainer(appId, true);
      return { success: true, message: `Stopped ${appId}-dev.` };
    } catch (err) {
      return fail(400, { success: false, message: err instanceof Error ? err.message : 'Stop dev failed.' });
    }
  },

  startAppDb: async (event) => {
    await requirePlatformAccess(event);
    const appId = String((await event.request.formData()).get('id') ?? '').trim();

    try {
      await startAppDbContainer(appId);
      return { success: true, message: `Started ${appId}-db.` };
    } catch (err) {
      return fail(400, { success: false, message: err instanceof Error ? err.message : 'Start db failed.' });
    }
  },

  stopAppDb: async (event) => {
    await requirePlatformAccess(event);
    const appId = String((await event.request.formData()).get('id') ?? '').trim();

    try {
      await stopAppDbContainer(appId);
      return { success: true, message: `Stopped ${appId}-db.` };
    } catch (err) {
      return fail(400, { success: false, message: err instanceof Error ? err.message : 'Stop db failed.' });
    }
  },

  setAllByMode: async (event) => {
    await requirePlatformAccess(event);
    const formData = await event.request.formData();
    const mode = String(formData.get('mode') ?? '').trim() as 'prod' | 'dev' | 'db';
    const action = String(formData.get('action') ?? '').trim() as 'start' | 'stop';
    if (!['prod', 'dev', 'db'].includes(mode) || !['start', 'stop'].includes(action)) {
      return fail(400, { success: false, message: 'Invalid bulk action request.' });
    }

    const db = getDb();
    const appsResult = await db.query('select id from platform_apps order by sort_order asc, title asc');
    const appIds = appsResult.rows.map((row) => String(row.id));
    const isDevUi =
      process.env.CHOKIDAR_USEPOLLING === 'true' ||
      (process.env.HOSTNAME ?? '').includes('platform-dev');

    try {
      const summary = await setAllAppContainersByMode(appIds, mode, action, isDevUi);
      if (summary.failed.length > 0) {
        return fail(400, {
          success: false,
          message: `Some ${mode.toUpperCase()} ${action} operations failed.`,
          summary
        });
      }
      return {
        success: true,
        message: `${action === 'start' ? 'Started' : 'Stopped'} ${mode.toUpperCase()} containers.`,
        summary
      };
    } catch (err) {
      return fail(400, {
        success: false,
        message: err instanceof Error ? err.message : 'Bulk container action failed.'
      });
    }
  },

  startAll: async (event) => {
    await requirePlatformAccess(event);
    try {
      await startAllContainers(false);
      return { success: true, message: 'Started all production containers.' };
    } catch (err) {
      return fail(400, { success: false, message: err instanceof Error ? err.message : 'Start all failed.' });
    }
  },

  stopAll: async (event) => {
    await requirePlatformAccess(event);
    try {
      await stopAllContainers(false);
      return { success: true, message: 'Stopped all production containers.' };
    } catch (err) {
      return fail(400, { success: false, message: err instanceof Error ? err.message : 'Stop all failed.' });
    }
  },

  startAllDev: async (event) => {
    await requirePlatformAccess(event);
    try {
      await startAllContainers(true);
      return { success: true, message: 'Started all dev containers.' };
    } catch (err) {
      return fail(400, { success: false, message: err instanceof Error ? err.message : 'Start all dev failed.' });
    }
  },

  stopAllDev: async (event) => {
    await requirePlatformAccess(event);
    try {
      await stopAllContainers(true);
      return { success: true, message: 'Stopped all dev containers.' };
    } catch (err) {
      return fail(400, { success: false, message: err instanceof Error ? err.message : 'Stop all dev failed.' });
    }
  }
};
