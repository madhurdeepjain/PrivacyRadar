<div align="center">
  <img src="resources/icon.png" alt="Privacy Radar Icon" width="128" height="128">

# Privacy Radar

</div>

**Privacy Radar** is a comprehensive privacy monitoring application built with Electron, React, and TypeScript. It provides real-time network traffic analysis and system permission monitoring to help users understand and control their digital privacy.

## Overview

Privacy Radar offers two main monitoring capabilities:

1. **Network Monitoring**: Real-time packet capture and analysis with process attribution, geographic visualization, and detailed traffic statistics
2. **System Monitoring**: Platform-specific permission tracking (macOS TCC, Linux hardware access, Windows Event Logs)

The application features a modern, accessible UI with both basic and advanced monitoring modes, dark mode support, and comprehensive data visualization.

## Features

### Network Monitoring

- **Real-time Packet Capture**: Live network traffic capture from selected network interfaces
- **Process Attribution**: Automatically matches network packets to running processes and applications
- **Traffic Analysis**:
  - Packet and byte statistics per application
  - Protocol breakdown (TCP, UDP, IPv4, IPv6)
  - Inbound/outbound traffic tracking
  - Throughput calculations (bytes per second)
- **Geographic Visualization**: Interactive world map showing network connections with animated connection lines
- **Application Insights**: Detailed statistics for each application including:
  - Total packets and bytes
  - Unique remote IPs and domains
  - Geographic locations of connections
  - Interface-specific statistics
- **Data Export**: Export network data to Excel using custom SQL queries
- **Interface Selection**: Choose which network interfaces to monitor
- **Visualizations**:
  - Line charts for data transfer rates over time
  - Doughnut charts for inbound/outbound traffic distribution

### System Monitoring

- **Permission Tracking** (Platform-specific):
  - **macOS**: TCC (Transparency, Consent, and Control) log monitoring for privacy permissions
  - **Linux**: Hardware device access monitoring
  - **Windows**: Event log monitoring (stub implementation)
- **Active Sessions**: Real-time tracking of applications currently using system resources
- **Event History**: Complete log of permission requests and usage events
- **Service Types**: Monitors various system services including:
  - Camera, Microphone, Screen Capture
  - Location, Contacts, Calendar
  - File access (Documents, Downloads, Desktop)
  - Full Disk Access, Accessibility, and more

### User Interface

- **Dual View Modes**: Switch between Network and System monitoring views
- **Basic & Advanced Modes**: Simplified view for casual users, detailed view for power users
- **Dark Mode**: Full dark mode support with theme persistence
- **Color Accessibility**: Colorblind-friendly color schemes
- **Responsive Design**: Modern UI built with Tailwind CSS and Framer Motion animations
- **Settings Persistence**: User preferences saved across sessions

## Technology Stack

### Core Framework

- **Electron**
- **ReactJS**

### Frontend

- **Tailwind CSS**: Utility-first CSS framework
- **Framer Motion**: Animation library
- **Chart.js**: Data visualization charts
- **D3.js**: Geographic map visualizations
- **Radix UI**: Accessible UI components
- **Lucide React**: Icon library

### Backend & Data

- **better-sqlite3**: High-performance SQLite database
- **Drizzle ORM**: Type-safe database ORM
- **cap**: Packet capture library (libpcap wrapper)
- **pino**: Fast JSON logger

### Development Tools

- **Vite**: Fast build tool and dev server
- **electron-vite**: Electron-specific Vite integration
- **Vitest**: Unit testing framework
- **Playwright**: End-to-end testing
- **ESLint**: Code linting
- **Prettier**: Code formatting

## Architecture

### Project Structure

```
PrivacyRadar/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── app/                 # Application lifecycle
│   │   │   ├── bootstrap.ts     # App initialization
│   │   │   ├── lifecycle.ts     # Lifecycle handlers
│   │   │   ├── window-manager.ts # Window management
│   │   │   └── analyzer-runner.ts # Network analyzer orchestration
│   │   ├── core/                # Core monitoring logic
│   │   │   ├── network/         # Network monitoring
│   │   │   │   ├── network-analyzer.ts      # Main analyzer orchestrator
│   │   │   │   ├── traffic-capture.ts       # Packet capture
│   │   │   │   ├── process-tracker.ts       # Process monitoring
│   │   │   │   ├── connection-tracker.ts    # Network connection tracking
│   │   │   │   ├── proc-con-manager.ts      # Process-connection matching
│   │   │   │   ├── registry-manager.ts       # Data aggregation
│   │   │   │   ├── packet-decoder.ts        # Packet parsing
│   │   │   │   ├── geo-location.ts          # IP geolocation
│   │   │   │   └── db-writer.ts            # Database persistence
│   │   │   └── system/          # System monitoring
│   │   │       ├── base-system-monitor.ts   # Base interface
│   │   │       ├── darwin-tcc-monitor.ts    # macOS TCC monitoring
│   │   │       ├── linux-system-monitor.ts # Linux monitoring
│   │   │       ├── windows-system-monitor.ts # Windows monitoring
│   │   │       └── system-monitor-factory.ts # Platform factory
│   │   ├── infrastructure/      # Infrastructure services
│   │   │   ├── db/              # Database setup and services
│   │   │   │   ├── schema.ts    # Database schema definitions
│   │   │   │   ├── migrate.ts   # Migration runner
│   │   │   │   └── services/    # Database services
│   │   │   └── logging/         # Logging infrastructure
│   │   ├── shared/              # Shared utilities
│   │   │   ├── interfaces/      # TypeScript interfaces
│   │   │   ├── lookups/         # Protocol/port lookups
│   │   │   └── utils/           # Utility functions
│   │   └── config/              # Configuration constants
│   ├── renderer/                # Electron renderer process (React app)
│   │   └── src/
│   │       ├── components/     # React components
│   │       │   ├── NetworkMonitor.tsx      # Main network view
│   │       │   ├── BasicNetworkMonitor.tsx # Basic mode
│   │       │   ├── AdvancedNetworkMonitor.tsx # Advanced mode
│   │       │   ├── SystemMonitor.tsx       # System monitoring view
│   │       │   ├── Visualization.tsx       # Charts and graphs
│   │       │   ├── GlobalMap.tsx           # Geographic map
│   │       │   ├── ProcessList.tsx         # Process listing
│   │       │   ├── ActivityList.tsx         # Packet activity feed
│   │       │   ├── AppInsights.tsx         # Application statistics
│   │       │   ├── ExportReports.tsx       # Data export
│   │       │   └── ui/                     # Reusable UI components
│   │       ├── lib/             # Client-side utilities
│   │       └── types.ts         # TypeScript types
│   └── preload/                 # Preload scripts (IPC bridge)
├── drizzle/                     # Database migrations
├── tests/                       # Test files
│   ├── unit/                    # Unit tests
│   └── e2e/                     # End-to-end tests
└── build/                       # Build resources
```

### Data Flow

1. **Packet Capture**: `TrafficCapture` captures raw packets from network interfaces
2. **Packet Processing**: Packets are decoded and matched to processes via `ProcConManager`
3. **Registry Aggregation**: `RegistryManager` aggregates data by process, application, and globally
4. **Database Persistence**: Snapshots are written to SQLite via `DBWriter`
5. **UI Updates**: Data flows to React components via Electron IPC
6. **Visualization**: Components render charts, maps, and lists in real-time

### Database Schema

The application uses SQLite with the following main tables:

- **settings**: Application configuration and user preferences
- **global_snapshots**: Global network statistics over time
- **application_snapshots**: Per-application network statistics
- **process_snapshots**: Per-process network statistics

Each snapshot table includes:

- Timestamp information
- Packet and byte counts (total, IPv4/IPv6, TCP/UDP)
- Inbound/outbound traffic
- Protocol percentages
- Geographic location data (JSON)
- Unique remote IPs and domains (JSON)
- Interface statistics (JSON)

## Installation

### Install Dependencies

```bash
npm install
```

This will:

- Install all npm dependencies
- Rebuild native modules (better-sqlite3, cap) for your platform
- Set up Electron dependencies

## Development

### Start Development Server

```bash
npm run dev
```

This starts the Electron app in development mode with hot reloading for both main and renderer processes.

### Development Scripts

```bash
# Type checking
npm run typecheck          # Check both main and renderer
npm run typecheck:node     # Check main process only
npm run typecheck:web      # Check renderer process only

# Code quality
npm run lint               # Run ESLint
npm run format             # Format code with Prettier
npm run format:check       # Check formatting without changes

# Renderer-only dev server (for UI development)
npm run dev:renderer
```

## Testing

### Unit Tests

```bash
# Run unit tests once
npm run test:unit

# Run in watch mode
npm run test:unit:watch
```

Unit tests use **Vitest** and are located in `tests/unit/`.

### End-to-End Tests

```bash
# Install Playwright browsers (first time only)
npx playwright install --with-deps

# Run E2E tests
npm run test:e2e

# Run E2E tests in headed mode
npm run test:e2e:headed
```

E2E tests use **Playwright** and are located in `tests/e2e/`. The test suite:

- Spins up a renderer-only Vite dev server
- Injects stubbed Electron APIs
- Tests the dashboard UI in a real browser
- Targets Chromium only (mirroring Electron's engine)

## Building

### Build for Production

```bash
# Build for current platform
npm run build

# Build for specific platforms
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux

# Build unpacked directory (for testing)
npm run build:unpack
```

Build outputs are created in `dist/` directory.

### Build Configuration

Build configuration is in `electron-builder.yml`:

- **Windows**: Creates NSIS installer with desktop shortcut
- **macOS**: Creates DMG with entitlements for system access
- **Linux**: Creates AppImage, Snap, and DEB packages

## Database

### Database Locations

- **Development**: `.dev-data/dev.db` (gitignored, safe for testing)
- **Production**: User data directory (`app.getPath('userData')/data/app.db`)

### Schema Management

Database schema is defined in `src/main/infrastructure/db/schema.ts`. The schema includes:

- `settings` table for application configuration
- `global_snapshots` table for global network statistics
- `application_snapshots` table for per-application statistics
- `process_snapshots` table for per-process statistics

### Migrations

Migrations are managed using **Drizzle Kit** and are automatically applied on application startup.

#### Creating Migrations

After modifying the schema in `src/main/infrastructure/db/schema.ts`:

```bash
# Generate a new migration
npm run db:generate
```

This creates a new SQL migration file in the `drizzle/` directory.

#### Applying Migrations

Migrations are automatically applied when the application starts. For manual migration management:

```bash
# Push schema changes directly to database (dev only)
npm run db:push

# View and edit database in Drizzle Studio
npm run db:studio
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

## Platform Support

### Network Monitoring

Network monitoring is supported on all platforms: macOS, Linux, Windows

### System Monitoring

System monitoring is platform-specific:

- **macOS**: Full TCC (Transparency, Consent, and Control) log monitoring
- **Linux**: Hardware device access monitoring
- **Windows**: Event log monitoring (stub implementation, limited support)
