# Privacy Radar

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Testing

```bash
# Run unit tests (Vitest)
$ npm run test:unit

# Watch mode for unit tests
$ npm run test:unit:watch

# End-to-end smoke tests (Playwright)
$ npx playwright install --with-deps   # first run only
$ npm run test:e2e
```

Playwright spins up a renderer-only Vite dev server and injects stubbed Electron APIs, so the dashboard can be exercised in a real browser without capturing live packets. The suite targets Chromium only, mirroring the engine bundled with Electron.

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

## Database

This project uses **better-sqlite3** with **Drizzle ORM** for local data storage.

### Database Locations

- **Development**: `dev-data/dev.db` (gitignored, safe for testing)
- **Production**: User data directory (`app.getPath('userData')/data/app.db`)

### Schema Management

Database schema is defined in `src/main/infrastructure/db/schema.ts`. The initial schema includes:

- `settings` table for application configuration

### Migrations

Migrations are managed using Drizzle Kit and are automatically applied on application startup.

#### Creating Migrations

After modifying the schema in `src/main/infrastructure/db/schema.ts`:

```bash
# Generate a new migration
$ npm run db:generate
```

This creates a new SQL migration file in the `drizzle/` directory.

#### Applying Migrations

Migrations are automatically applied when the application starts. For manual migration management:

```bash
# Push schema changes directly to database (dev only)
$ npm run db:push

# View and edit database in Drizzle Studio
$ npm run db:studio
```

#### Migration Files

- Migration files are stored in `drizzle/`
- They are committed to git for version control
- They are bundled with production builds in `extraResources`
- They are applied automatically on app startup

### Database Utilities

- `npm run db:studio` - Open Drizzle Studio to browse and edit data visually
- `npm run db:generate` - Generate migrations from schema changes
- `npm run db:push` - Push schema changes directly (dev only, skips migrations)
