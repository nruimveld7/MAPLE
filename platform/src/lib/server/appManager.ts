import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { Pool } from 'pg';

export type AppType = 'management' | 'applet';

const WEBAPPS_ROOT = path.resolve(process.env.WEBAPPS_ROOT || process.cwd());
const APPLETS_ROOT = path.join(WEBAPPS_ROOT, 'applets');
const TEMPLATE_ROOT = path.join(WEBAPPS_ROOT, 'platform', 'templates', 'applet-template');
const PLATFORM_STATIC_ROOT = process.env.PLATFORM_STATIC_ROOT ?? path.join(process.cwd(), 'static', 'app-images');

type CreateInput = {
  name: string;
  appType: AppType;
  isPublic: boolean;
  showWhenLocked: boolean;
  showInCatalog: boolean;
  adminOnly: boolean;
  enabled: boolean;
  requiredPermission: string | null;
  absolutePath: string | null;
  image: File | null;
};

type UpdateInput = {
  id: string;
  name: string;
  appType: AppType;
  isPublic: boolean;
  showWhenLocked: boolean;
  showInCatalog: boolean;
  adminOnly: boolean;
  enabled: boolean;
  requiredPermission: string | null;
  absolutePath: string;
  image: File | null;
};

export type RuntimeMode = 'prod' | 'dev' | 'db';
export type RuntimeAction = 'start' | 'stop';

function runCommand(args: string[], cwd = WEBAPPS_ROOT) {
  return new Promise<{ ok: boolean; output: string; exitCode: number | null }>((resolve) => {
    const child = spawn(args[0], args.slice(1), { cwd });
    let output = '';

    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('error', (err) => {
      resolve({ ok: false, output: err.message, exitCode: null });
    });
    child.on('close', (code) => {
      resolve({ ok: code === 0, output, exitCode: code });
    });
  });
}

function composeSubcommandMissing(output: string) {
  const normalized = output.toLowerCase();
  return (
    normalized.includes("unknown command: docker compose") ||
    normalized.includes("unknown command: compose") ||
    normalized.includes("'compose' is not a docker command")
  );
}

async function runComposeCommand(argsAfterCompose: string[], cwd = WEBAPPS_ROOT) {
  const dockerComposeV2 = await runCommand(['docker', 'compose', ...argsAfterCompose], cwd);
  if (dockerComposeV2.ok || !composeSubcommandMissing(dockerComposeV2.output)) {
    return {
      ...dockerComposeV2,
      commandUsed: `docker compose ${argsAfterCompose.join(' ')}`
    };
  }

  const dockerComposeV1 = await runCommand(['docker-compose', ...argsAfterCompose], cwd);
  return {
    ...dockerComposeV1,
    output: dockerComposeV1.ok
      ? dockerComposeV1.output
      : `${dockerComposeV2.output}\n${dockerComposeV1.output}`,
    commandUsed: `docker-compose ${argsAfterCompose.join(' ')}`
  };
}

async function listContainerIdsForService(serviceName: string, cwd = WEBAPPS_ROOT) {
  const listed = await runCommand(
    ['docker', 'ps', '-a', '--format', '{{.ID}}|{{.Names}}|{{.Label "com.docker.compose.service"}}'],
    cwd
  );
  if (!listed.ok) {
    throw new Error(`Failed to locate containers for ${serviceName}: ${listed.output.trim()}`);
  }

  const ids = new Set<string>();
  const expectedNames = new Set([
    serviceName,
    `webapps-${serviceName}-1`,
    `webapps_${serviceName}_1`
  ]);

  for (const line of listed.output.split('\n').map((row) => row.trim()).filter(Boolean)) {
    const [idRaw, nameRaw, serviceRaw] = line.split('|');
    const id = (idRaw ?? '').trim();
    const name = (nameRaw ?? '').trim();
    const composeService = (serviceRaw ?? '').trim();
    if (!id) continue;

    if (composeService === serviceName || expectedNames.has(name)) {
      ids.add(id);
    }
  }

  return [...ids];
}

async function stopContainersByService(serviceName: string, cwd = WEBAPPS_ROOT) {
  const ids = await listContainerIdsForService(serviceName, cwd);
  if (ids.length === 0) {
    throw new Error(`No containers found for service ${serviceName}.`);
  }

  const result = await runCommand(['docker', 'stop', ...ids], cwd);
  if (!result.ok) {
    throw new Error(`Failed to stop service ${serviceName}: ${result.output.trim()}`);
  }
}

async function startContainersByService(serviceName: string, cwd = WEBAPPS_ROOT) {
  const ids = await listContainerIdsForService(serviceName, cwd);
  if (ids.length === 0) {
    throw new Error(`No containers found for service ${serviceName}.`);
  }

  const result = await runCommand(['docker', 'start', ...ids], cwd);
  if (!result.ok) {
    throw new Error(`Failed to start service ${serviceName}: ${result.output.trim()}`);
  }
}

async function setContainersByIds(ids: string[], action: RuntimeAction, serviceName: string, cwd = WEBAPPS_ROOT) {
  const command = action === 'start' ? 'start' : 'stop';
  const result = await runCommand(['docker', command, ...ids], cwd);
  if (!result.ok) {
    throw new Error(`Failed to ${action} service ${serviceName}: ${result.output.trim()}`);
  }
}

function isDockerStatusRunning(status: string) {
  const normalized = status.trim().toLowerCase();
  return normalized.startsWith('up');
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function normalizePath(p: string) {
  return path.resolve(p);
}

function getManagedRoot(appType: AppType) {
  return appType === 'management' ? WEBAPPS_ROOT : APPLETS_ROOT;
}

function assertManagedPath(appType: AppType, absolutePath: string) {
  const root = normalizePath(getManagedRoot(appType));
  const target = normalizePath(absolutePath);

  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Path must be inside ${root}`);
  }
}

function pathToRoute(absolutePath: string) {
  const slug = path.basename(normalizePath(absolutePath));
  return `/${slug}/`;
}

function pathToSlug(absolutePath: string) {
  return slugify(path.basename(normalizePath(absolutePath)));
}

function appPathToContextRelative(appType: AppType, slug: string) {
  if (appType === 'management') {
    return `${slug}`;
  }

  return `applets/${slug}`;
}

function appDbService(slug: string) {
  return `${slug}-db`;
}

function appDbMigrateService(slug: string) {
  return `${slug}-db-migrate`;
}

function appDbName(slug: string) {
  return `${slug}_db`;
}

function appDbUser(slug: string) {
  return `${slug}_user`;
}

function appDbPassword(slug: string) {
  return `${slug}_pass`;
}

function migrationScriptName(slug: string) {
  return `Migrate${slug.charAt(0).toUpperCase()}${slug.slice(1)}DB.sh`;
}

function dockerImageForType(appType: AppType) {
  return appType === 'management' ? 'node:22-bookworm-slim' : 'node:22-alpine';
}

function buildDockerfile(appType: AppType, slug: string) {
  const image = dockerImageForType(appType);
  const contextRelative = appPathToContextRelative(appType, slug);

  return `FROM ${image} AS builder
WORKDIR /app

ARG BASE_PATH=""
ENV BASE_PATH=$BASE_PATH

COPY ${contextRelative}/package*.json ./
RUN npm ci

COPY ${contextRelative}/ ./
COPY shared-shell/ /shared-shell/
RUN npm run build
RUN npm prune --omit=dev

FROM ${image}
WORKDIR /app

COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000
CMD ["node", "build"]
`;
}

function buildRunMigrationsShell() {
  return `#!/bin/sh
set -eu

if [ -z "\${POSTGRES_HOST:-}" ] || [ -z "\${POSTGRES_DB:-}" ] || [ -z "\${POSTGRES_USER:-}" ]; then
\techo "POSTGRES_HOST, POSTGRES_DB, and POSTGRES_USER are required" >&2
\texit 1
fi

for migration in /migrations/*.sql; do
\tif [ ! -f "$migration" ]; then
\t\techo "No migration files found in /migrations" >&2
\t\texit 1
\tfi

\techo "Applying migration: $migration"
\tpsql \\
\t\t"host=\${POSTGRES_HOST} dbname=\${POSTGRES_DB} user=\${POSTGRES_USER}" \\
\t\t-v ON_ERROR_STOP=1 \\
\t\t-f "$migration"
done
`;
}

async function pathExists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function copyTemplateTo(targetPath: string) {
  await fs.cp(TEMPLATE_ROOT, targetPath, { recursive: true, errorOnExist: true, force: false });
}

async function replaceInFile(filePath: string, replacements: Array<{ from: string; to: string }>) {
  const original = await fs.readFile(filePath, 'utf8');
  let next = original;

  for (const replacement of replacements) {
    next = next.split(replacement.from).join(replacement.to);
  }

  if (next !== original) {
    await fs.writeFile(filePath, next, 'utf8');
  }
}

async function writeDockerfileForApp(appType: AppType, slug: string, absolutePath: string) {
  const dockerfilePath = path.join(absolutePath, 'Dockerfile');
  await fs.writeFile(dockerfilePath, buildDockerfile(appType, slug), 'utf8');
}

async function customizeTemplateApp(absolutePath: string, appName: string, appType: AppType, slug: string) {
  const packageJson = path.join(absolutePath, 'package.json');
  const packageLock = path.join(absolutePath, 'package-lock.json');
  const pageSvelte = path.join(absolutePath, 'src/routes/+page.svelte');
  const viteConfig = path.join(absolutePath, 'vite.config.js');

  await replaceInFile(packageJson, [
    { from: '"name": "template-app"', to: `"name": "${slug}"` }
  ]);
  await replaceInFile(packageLock, [
    { from: '"name": "template-app"', to: `"name": "${slug}"` }
  ]);

  await replaceInFile(pageSvelte, [
    { from: 'Template App', to: appName }
  ]);

  if (appType === 'management') {
    await replaceInFile(viteConfig, [
      { from: "path.resolve('../../shared-shell/src')", to: "path.resolve('../shared-shell/src')" }
    ]);
  }

  await writeDockerfileForApp(appType, slug, absolutePath);
}

async function ensureDbScaffolding(absolutePath: string, slug: string) {
  const dbDir = path.join(absolutePath, 'db');
  const migrationDir = path.join(dbDir, 'migrations');
  const runMigrationsPath = path.join(dbDir, 'run-migrations.sh');
  const initMigrationPath = path.join(migrationDir, `001_init_${slug}.sql`);

  await ensureDir(migrationDir);

  if (!(await pathExists(runMigrationsPath))) {
    await fs.writeFile(runMigrationsPath, buildRunMigrationsShell(), { mode: 0o755 });
  }

  if (!(await pathExists(initMigrationPath))) {
    const sql = `create extension if not exists pgcrypto;

create table if not exists ${slug}_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
`;
    await fs.writeFile(initMigrationPath, sql, 'utf8');
  }
}

function managedImageUrlForSlug(slug: string) {
  return `/platform/app-images/${slug}.png`;
}

function managedImagePathForSlug(slug: string) {
  return path.join(PLATFORM_STATIC_ROOT, `${slug}.png`);
}

async function storeImage(file: File | null, slug: string) {
  if (!file || file.size === 0) {
    return null;
  }

  const fileType = (file.type || '').toLowerCase();
  const fileExt = path.extname(file.name || '').toLowerCase();
  if (fileType !== 'image/png' && fileExt !== '.png') {
    throw new Error('Only PNG images are supported.');
  }

  await ensureDir(PLATFORM_STATIC_ROOT);

  const absPath = managedImagePathForSlug(slug);
  const bytes = Buffer.from(await file.arrayBuffer());

  await fs.writeFile(absPath, bytes);

  return managedImageUrlForSlug(slug);
}

function ensureLineIncluded(text: string, line: string, anchorPattern: RegExp) {
  if (text.includes(line)) {
    return text;
  }

  const match = text.match(anchorPattern);
  if (!match || match.index === undefined) {
    throw new Error(`Could not find anchor for line: ${line}`);
  }

  const insertionPoint = match.index + match[0].length;
  return text.slice(0, insertionPoint) + `\n${line}` + text.slice(insertionPoint);
}

async function updateCaddyFile(filePath: string, slug: string, serviceName: string) {
  let text = await fs.readFile(filePath, 'utf8');

  const redirLine = `    redir /${slug} /${slug}/ 308`;
  const handleBlock = `\n\n    handle /${slug}/* {\n        reverse_proxy ${serviceName}:3000\n    }`;

  text = ensureLineIncluded(text, redirLine, /redir \/workouts \/workouts\/ 308/);

  if (!text.includes(`handle /${slug}/*`)) {
    const workoutsHandle = text.match(/    handle \/workouts\/\* \{\n        reverse_proxy [^\n]+:3000\n    \}/);
    if (!workoutsHandle || workoutsHandle.index === undefined) {
      throw new Error(`Could not find workouts handle block in ${filePath}`);
    }

    const insertionPoint = workoutsHandle.index + workoutsHandle[0].length;
    text = text.slice(0, insertionPoint) + handleBlock + text.slice(insertionPoint);
  }

  await fs.writeFile(filePath, text, 'utf8');
}

function buildComposeServiceBlock({ serviceName, slug, appType, isDev }: { serviceName: string; slug: string; appType: AppType; isDev: boolean }) {
  const contextRelative = appPathToContextRelative(appType, slug);
  const image = dockerImageForType(appType);
  const dbService = appDbService(slug);
  const dbUrl = `postgres://${appDbUser(slug)}:${appDbPassword(slug)}@${dbService}:5432/${appDbName(slug)}`;

  if (!isDev) {
    return `\n  ${serviceName}:\n    build:\n      context: .\n      dockerfile: ./${contextRelative}/Dockerfile\n      args:\n        BASE_PATH: /${slug}\n    restart: unless-stopped\n    environment:\n      <<: *webapp-common-env\n      BASE_PATH: /${slug}\n      HOST: 0.0.0.0\n      PORT: "3000"\n      DATABASE_URL: ${dbUrl}\n    expose:\n      - "3000"\n    depends_on:\n      - ${dbService}\n    networks:\n      - webapps\n`;
  }

  return `\n  ${serviceName}:\n    image: ${image}\n    restart: unless-stopped\n    working_dir: /app\n    command: >-\n      sh -lc "npm ci && npm run dev -- --host 0.0.0.0 --port 3000"\n    environment:\n      BASE_PATH: /${slug}\n      HOST: 0.0.0.0\n      PORT: "3000"\n      AUTH_ORIGIN: http://auth-dev:3000\n      AUTH_BASE_PATH: /auth\n      DATABASE_URL: ${dbUrl}\n      CHOKIDAR_USEPOLLING: "true"\n    volumes:\n      - ./${contextRelative}:/app\n      - ./shared-shell:/shared-shell\n      - ${serviceName}-node-modules:/app/node_modules\n    expose:\n      - "3000"\n    depends_on:\n      - ${dbService}\n    networks:\n      - webapps\n`;
}

function buildComposeDbBlock(slug: string) {
  const dbService = appDbService(slug);
  return `\n  ${dbService}:\n    image: postgres:16-alpine\n    restart: unless-stopped\n    environment:\n      POSTGRES_DB: ${appDbName(slug)}\n      POSTGRES_USER: ${appDbUser(slug)}\n      POSTGRES_PASSWORD: ${appDbPassword(slug)}\n    volumes:\n      - ${dbService}-data:/var/lib/postgresql/data\n    networks:\n      - webapps\n`;
}

function buildComposeDbMigrateBlock(slug: string, appType: AppType) {
  const dbService = appDbService(slug);
  const migrateService = appDbMigrateService(slug);
  const contextRelative = appPathToContextRelative(appType, slug);
  return `\n  ${migrateService}:\n    image: postgres:16-alpine\n    profiles:\n      - migrate\n    depends_on:\n      - ${dbService}\n    environment:\n      POSTGRES_HOST: ${dbService}\n      POSTGRES_DB: ${appDbName(slug)}\n      POSTGRES_USER: ${appDbUser(slug)}\n      PGPASSWORD: ${appDbPassword(slug)}\n    volumes:\n      - ./${contextRelative}/db/migrations:/migrations:ro\n      - ./${contextRelative}/db/run-migrations.sh:/run-migrations.sh:ro\n    command: [\"/run-migrations.sh\"]\n    networks:\n      - webapps\n`;
}

async function updateComposeFile(filePath: string, serviceName: string, slug: string, appType: AppType, isDev: boolean) {
  let text = await fs.readFile(filePath, 'utf8');

  if (!text.includes(`  ${serviceName}:`)) {
    const insertBefore = isDev ? '  auth-db:' : '  auth-db:';
    text = text.replace(insertBefore, `${buildComposeServiceBlock({ serviceName, slug, appType, isDev })}\n${insertBefore}`);
  }

  const dependsLine = `      - ${serviceName}`;
  if (!text.includes(dependsLine)) {
    const dependsMarker = isDev ? '      - workouts-dev' : '      - workouts';
    const markerIndex = text.indexOf(dependsMarker);
    if (markerIndex !== -1) {
      const insertionPoint = markerIndex + dependsMarker.length;
      text = text.slice(0, insertionPoint) + `\n${dependsLine}` + text.slice(insertionPoint);
    }
  }

  if (isDev) {
    const volumeLine = `  ${serviceName}-node-modules:`;
    if (!text.includes(volumeLine)) {
      text = text.replace('  workouts-node-modules:\n', `  workouts-node-modules:\n${volumeLine}\n`);
    }
  }

  const dbService = appDbService(slug);
  if (!text.includes(`  ${dbService}:`)) {
    text = text.replace('networks:\n', `${buildComposeDbBlock(slug)}\nnetworks:\n`);
  }

  const migrateService = appDbMigrateService(slug);
  if (!text.includes(`  ${migrateService}:`)) {
    text = text.replace('networks:\n', `${buildComposeDbMigrateBlock(slug, appType)}\nnetworks:\n`);
  }

  const dbVolume = `  ${dbService}-data:`;
  if (!text.includes(dbVolume)) {
    text = text.replace(/volumes:\n/, (match) => `${match}${dbVolume}\n`);
  }

  await fs.writeFile(filePath, text, 'utf8');
}

async function updateScriptLine(filePath: string, find: RegExp, addToken: string) {
  let text = await fs.readFile(filePath, 'utf8');
  const match = text.match(find);

  if (!match) {
    return;
  }

  const line = match[0];
  if (line.includes(addToken)) {
    return;
  }

  const updated = `${line} ${addToken}`;
  text = text.replace(line, updated);
  await fs.writeFile(filePath, text, 'utf8');
}

async function addRestartScript({ slug, isDev }: { slug: string; isDev: boolean }) {
  const scriptDir = isDev ? path.join(WEBAPPS_ROOT, 'scripts', 'dev') : path.join(WEBAPPS_ROOT, 'scripts');
  const fileName = `${slug.charAt(0).toUpperCase()}${slug.slice(1)}Restart.sh`;
  const scriptPath = path.join(scriptDir, fileName);

  if (await pathExists(scriptPath)) {
    return;
  }

  const composeFlags = isDev ? '-f docker-compose.yml -f docker-compose.dev.yml ' : '';
  const serviceName = isDev ? `${slug}-dev` : slug;
  const script = `#!/usr/bin/env bash\nset -euo pipefail\ncd ${WEBAPPS_ROOT}\ndocker compose ${composeFlags}restart ${serviceName}\n`;
  await fs.writeFile(scriptPath, script, { mode: 0o755 });
}

async function updateGlobalScripts(slug: string) {
  await updateScriptLine(path.join(WEBAPPS_ROOT, 'scripts', 'AllContainersRestart.sh'), /docker compose up -d --build .+/, slug);
  await updateScriptLine(path.join(WEBAPPS_ROOT, 'scripts', 'DevModeUp.sh'), /landing-dev auth-dev xmas-dev platform-dev workouts-dev router-dev/, `${slug}-dev`);
  await updateScriptLine(path.join(WEBAPPS_ROOT, 'scripts', 'DevModeDown.sh'), /router-dev landing-dev auth-dev xmas-dev platform-dev workouts-dev/, `${slug}-dev`);
  await updateScriptLine(path.join(WEBAPPS_ROOT, 'scripts', 'dev', 'AllContainersRestart.sh'), /router-dev landing-dev auth-dev xmas-dev platform-dev workouts-dev/, `${slug}-dev`);

  await addRestartScript({ slug, isDev: false });
  await addRestartScript({ slug, isDev: true });
}

async function ensureDbMigrationScript(slug: string) {
  const scriptPath = path.join(WEBAPPS_ROOT, 'scripts', 'dbMigrations', migrationScriptName(slug));
  if (!(await pathExists(scriptPath))) {
    const dbService = appDbService(slug);
    const migrateService = appDbMigrateService(slug);
    const script = `#!/usr/bin/env bash\nset -euo pipefail\n\ncd ${WEBAPPS_ROOT}\n\ndocker compose -f docker-compose.yml -f docker-compose.dev.yml up -d ${dbService}\ndocker compose -f docker-compose.yml -f docker-compose.dev.yml --profile migrate run --rm ${migrateService}\n`;
    await fs.writeFile(scriptPath, script, { mode: 0o755 });
  }

  const allPath = path.join(WEBAPPS_ROOT, 'scripts', 'dbMigrations', 'MigrateAllDBs.sh');
  let allText = await fs.readFile(allPath, 'utf8');
  const callLine = path.join(WEBAPPS_ROOT, 'scripts', 'dbMigrations', migrationScriptName(slug));
  if (!allText.includes(callLine)) {
    allText += `\n${callLine}\n`;
    await fs.writeFile(allPath, allText, 'utf8');
  }
}

async function restartRoutersBestEffort() {
  const commands = [
    ['docker', 'compose', 'restart', 'router'],
    ['docker', 'compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.dev.yml', 'restart', 'router-dev']
  ];

  for (const cmd of commands) {
    await new Promise<void>((resolve) => {
      const proc = spawn(cmd[0], cmd.slice(1), {
        cwd: WEBAPPS_ROOT,
        stdio: 'ignore'
      });

      proc.on('exit', () => resolve());
      proc.on('error', () => resolve());
    });
  }
}

async function rewriteAllIntegrationFiles(slug: string, appType: AppType) {
  await updateCaddyFile(path.join(WEBAPPS_ROOT, 'router', 'Caddyfile'), slug, slug);
  await updateCaddyFile(path.join(WEBAPPS_ROOT, 'router', 'Caddyfile.dev'), slug, `${slug}-dev`);

  await updateComposeFile(path.join(WEBAPPS_ROOT, 'docker-compose.yml'), slug, slug, appType, false);
  await updateComposeFile(path.join(WEBAPPS_ROOT, 'docker-compose.dev.yml'), `${slug}-dev`, slug, appType, true);

  await updateGlobalScripts(slug);
  await ensureDbMigrationScript(slug);
  await restartRoutersBestEffort();
}

function boolFromFormData(value: FormDataEntryValue | null) {
  if (!value) return false;
  return value === 'on' || value === 'true' || value === '1';
}

function stringFromFormData(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

export function parseCreateForm(formData: FormData): CreateInput {
  const appType = stringFromFormData(formData.get('appType')) === 'management' ? 'management' : 'applet';

  return {
    name: stringFromFormData(formData.get('name')),
    appType,
    isPublic: boolFromFormData(formData.get('isPublic')),
    showWhenLocked: boolFromFormData(formData.get('showWhenLocked')),
    showInCatalog: boolFromFormData(formData.get('showInCatalog')),
    adminOnly: boolFromFormData(formData.get('adminOnly')),
    enabled: boolFromFormData(formData.get('enabled')),
    requiredPermission: stringFromFormData(formData.get('requiredPermission')) || null,
    absolutePath: stringFromFormData(formData.get('absolutePath')) || null,
    image: (formData.get('image') as File | null) ?? null
  };
}

export async function createManagedApp(input: CreateInput, db: Pool) {
  if (!input.name) {
    throw new Error('App name is required.');
  }

  const slugFromName = slugify(input.name);
  if (!slugFromName) {
    throw new Error('Could not derive a valid app slug from name.');
  }

  const targetPath = input.absolutePath
    ? normalizePath(input.absolutePath)
    : path.join(getManagedRoot(input.appType), slugFromName);

  assertManagedPath(input.appType, targetPath);

  const slug = pathToSlug(targetPath);
  const endpoint = pathToRoute(targetPath);

  if (await pathExists(targetPath)) {
    throw new Error(`Target path already exists: ${targetPath}`);
  }

  const existing = await db.query('select 1 from platform_apps where id = $1 limit 1', [slug]);
  if (existing.rowCount) {
    throw new Error(`An app with slug '${slug}' already exists in platform registry.`);
  }

  await copyTemplateTo(targetPath);
  await customizeTemplateApp(targetPath, input.name, input.appType, slug);
  await ensureDbScaffolding(targetPath, slug);

  const imageUrl = await storeImage(input.image, slug);
  const imageAlt = slug === 'landing' ? null : `${input.name} image`;
  const requiredPermission = input.isPublic ? null : input.requiredPermission ?? `${slug}.access`;

  await db.query(
    `insert into platform_apps (
      id,
      title,
      endpoint,
      image_url,
      image_alt,
      enabled,
      show_when_locked,
      show_in_catalog,
      admin_only,
      sort_order,
      app_type,
      absolute_path,
      is_public,
      required_permission
    )
    values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,
      coalesce((select max(sort_order) + 10 from platform_apps), 100),
      $10,$11,$12,$13
    )`,
    [
      slug,
      input.name,
      endpoint,
      imageUrl,
      imageAlt,
      input.enabled,
      input.showWhenLocked,
      input.showInCatalog,
      input.adminOnly,
      input.appType,
      targetPath,
      input.isPublic,
      requiredPermission
    ]
  );

  if (requiredPermission) {
    await db.query(
      `insert into platform_app_permissions (
        app_id,
        permission,
        label,
        description,
        is_required_for_access
      ) values ($1, $2, $3, $4, true)
      on conflict (app_id, permission) do update set
        label = excluded.label,
        description = excluded.description,
        is_required_for_access = true,
        updated_at = now()`,
      [
        slug,
        requiredPermission,
        `Access ${input.name}`,
        `Allows access to ${input.name}.`
      ]
    );
  } else {
    await db.query(
      `update platform_app_permissions
       set is_required_for_access = false,
           updated_at = now()
       where app_id = $1`,
      [slug]
    );
  }

  await rewriteAllIntegrationFiles(slug, input.appType);

  return {
    id: slug,
    title: input.name,
    endpoint,
    absolutePath: targetPath
  };
}

export function parseUpdateForm(formData: FormData): UpdateInput {
  const appType = stringFromFormData(formData.get('appType')) === 'management' ? 'management' : 'applet';

  return {
    id: stringFromFormData(formData.get('id')),
    name: stringFromFormData(formData.get('name')),
    appType,
    isPublic: boolFromFormData(formData.get('isPublic')),
    showWhenLocked: boolFromFormData(formData.get('showWhenLocked')),
    showInCatalog: boolFromFormData(formData.get('showInCatalog')),
    adminOnly: boolFromFormData(formData.get('adminOnly')),
    enabled: boolFromFormData(formData.get('enabled')),
    requiredPermission: stringFromFormData(formData.get('requiredPermission')) || null,
    absolutePath: stringFromFormData(formData.get('absolutePath')),
    image: (formData.get('image') as File | null) ?? null
  };
}

export async function updateManagedApp(input: UpdateInput, db: Pool) {
  if (!input.id) {
    throw new Error('App id is required.');
  }

  const currentRes = await db.query('select * from platform_apps where id = $1 limit 1', [input.id]);
  const current = currentRes.rows[0];

  if (!current) {
    throw new Error('App not found.');
  }

  const nextPath = normalizePath(input.absolutePath || current.absolute_path);
  assertManagedPath(input.appType, nextPath);

  const nextSlug = pathToSlug(nextPath);
  if (nextSlug !== input.id) {
    throw new Error('Path basename must match existing app id. Rename is not yet supported.');
  }

  if (nextPath !== current.absolute_path) {
    if (!(await pathExists(current.absolute_path))) {
      throw new Error(`Current app path does not exist on disk: ${current.absolute_path}`);
    }

    if (await pathExists(nextPath)) {
      throw new Error(`New path already exists: ${nextPath}`);
    }

    await fs.rename(current.absolute_path, nextPath);
  }

  const nextImageUrl = await storeImage(input.image, input.id);
  const imageUrl = input.id === 'landing' ? null : nextImageUrl ?? current.image_url;
  const imageAlt = input.id === 'landing' ? null : `${input.name} image`;
  const requiredPermission = input.isPublic ? null : input.requiredPermission ?? `${input.id}.access`;
  const endpoint = pathToRoute(nextPath);

  await db.query(
    `update platform_apps
     set
      title = $2,
      endpoint = $3,
      image_url = $4,
      image_alt = $5,
      enabled = $6,
      show_when_locked = $7,
      show_in_catalog = $8,
      admin_only = $9,
      app_type = $10,
      absolute_path = $11,
      is_public = $12,
      required_permission = $13,
      updated_at = now()
     where id = $1`,
    [
      input.id,
      input.name,
      endpoint,
      imageUrl,
      imageAlt,
      input.enabled,
      input.showWhenLocked,
      input.showInCatalog,
      input.adminOnly,
      input.appType,
      nextPath,
      input.isPublic,
      requiredPermission
    ]
  );

  if (requiredPermission) {
    await db.query(
      `insert into platform_app_permissions (
        app_id,
        permission,
        label,
        description,
        is_required_for_access
      ) values ($1, $2, $3, $4, true)
      on conflict (app_id, permission) do update set
        label = excluded.label,
        description = excluded.description,
        is_required_for_access = true,
        updated_at = now()`,
      [
        input.id,
        requiredPermission,
        `Access ${input.name}`,
        `Allows access to ${input.name}.`
      ]
    );
  } else {
    await db.query(
      `update platform_app_permissions
       set is_required_for_access = false,
           updated_at = now()
       where app_id = $1`,
      [input.id]
    );
  }

  await rewriteAllIntegrationFiles(input.id, input.appType);
}

export async function startAppContainer(appId: string, isDev: boolean) {
  const serviceName = isDev ? `${appId}-dev` : appId;
  await startContainersByService(serviceName);
}

export async function stopAppContainer(appId: string, isDev: boolean) {
  const serviceName = isDev ? `${appId}-dev` : appId;
  await stopContainersByService(serviceName);
}

export async function startAppDbContainer(appId: string) {
  const serviceName = `${appId}-db`;
  await startContainersByService(serviceName);
}

export async function stopAppDbContainer(appId: string) {
  const serviceName = `${appId}-db`;
  await stopContainersByService(serviceName);
}

export async function setAllAppContainersByMode(
  appIds: string[],
  mode: RuntimeMode,
  action: RuntimeAction,
  isDevUi: boolean
) {
  const CORE_APPS = new Set(['auth', 'platform']);
  const DB_BLOCKED = new Set(['auth', 'platform', 'landing', 'mailer']);
  const DEV_BLOCKED = new Set(['mailer']);
  const summary = {
    attempted: 0,
    changed: 0,
    skippedBlocked: 0,
    skippedMissing: 0,
    failed: [] as string[]
  };
  const targets: Array<{ appId: string; serviceName: string }> = [];

  for (const appId of appIds) {
    const blocked =
      (mode === 'db' && DB_BLOCKED.has(appId)) ||
      (mode === 'dev' && DEV_BLOCKED.has(appId)) ||
      (mode === 'dev' && isDevUi && CORE_APPS.has(appId)) ||
      (mode === 'prod' && !isDevUi && CORE_APPS.has(appId));
    if (blocked) {
      summary.skippedBlocked += 1;
      continue;
    }

    const serviceName = mode === 'db' ? `${appId}-db` : mode === 'dev' ? `${appId}-dev` : appId;
    targets.push({ appId, serviceName });
  }

  summary.attempted = targets.length;
  const results = await Promise.all(
    targets.map(async ({ serviceName }) => {
      try {
        const ids = await listContainerIdsForService(serviceName);
        if (ids.length === 0) return { serviceName, status: 'missing' as const };
        await setContainersByIds(ids, action, serviceName);
        return { serviceName, status: 'changed' as const };
      } catch (err) {
        return {
          serviceName,
          status: 'failed' as const,
          message: err instanceof Error ? err.message : String(err)
        };
      }
    })
  );

  for (const result of results) {
    if (result.status === 'missing') {
      summary.skippedMissing += 1;
    } else if (result.status === 'changed') {
      summary.changed += 1;
    } else {
      summary.failed.push(`${result.serviceName}: ${result.message}`);
    }
  }

  return summary;
}

export async function startAllContainers(isDev: boolean) {
  const args = isDev
    ? ['bash', '-lc', path.join(WEBAPPS_ROOT, 'scripts', 'DevModeUp.sh')]
    : ['bash', '-lc', path.join(WEBAPPS_ROOT, 'scripts', 'AllContainersRestart.sh')];

  const result = await runCommand(args);
  if (!result.ok) {
    throw new Error(`Failed to start ${isDev ? 'dev' : 'prod'} containers: ${result.output.trim()}`);
  }
}

export async function stopAllContainers(isDev: boolean) {
  const args = isDev
    ? ['bash', '-lc', path.join(WEBAPPS_ROOT, 'scripts', 'DevModeDown.sh')]
    : ['docker', 'compose', 'stop'];

  const result = await runCommand(args);
  if (!result.ok) {
    throw new Error(`Failed to stop ${isDev ? 'dev' : 'prod'} containers: ${result.output.trim()}`);
  }
}

export async function getHostContainerStates() {
  const result = await runCommand([
    'docker',
    'ps',
    '-a',
    '--format',
    '{{.Names}}|{{.Status}}|{{.Label "com.docker.compose.service"}}'
  ]);

  if (!result.ok) {
    throw new Error(`Failed to read host containers: ${result.output.trim()}`);
  }

  const states = new Map<string, boolean>();
  const markState = (key: string, running: boolean) => {
    if (!key) return;
    const prev = states.get(key) ?? false;
    states.set(key, prev || running);
  };
  const lines = result.output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const [nameRaw, statusRaw, serviceRaw] = line.split('|');
    const name = (nameRaw ?? '').trim();
    const status = (statusRaw ?? '').trim();
    const composeService = (serviceRaw ?? '').trim();
    const running = isDockerStatusRunning(status);

    markState(name, running);
    markState(composeService, running);
  }

  return states;
}
