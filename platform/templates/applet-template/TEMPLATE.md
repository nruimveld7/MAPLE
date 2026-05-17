# App Template

This directory is the base scaffold used by the Platform app when creating a new app/applet.

After copying this template for a new app, update at minimum:
- `package.json` name
- app title/content in `src/routes/+page.svelte`
- `BASE_PATH` and any app-specific route/config values

This template intentionally keeps shared-shell wiring so new apps integrate with the existing shell UX.
