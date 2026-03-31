#!/usr/bin/env node
/**
 * example-mapping CLI — start the HTTP + Socket.io server
 */

import { startRelayTunnel, type RelayTunnelHandle } from "./relayTunnel";

function printHelp(): void {
    console.log(`Usage: example-mapping [options]

Options:
  -p, --port N          Listen port (default: 3000 or PORT env)
  -o, --output-dir DIR  Notes output directory (default: ./context_files)
  --tunnel URL          After the server listens, run the relay (ws:// or wss://)
  --tunnel-only URL     Only the relay client, no HTTP server (ws:// or wss://)
  -h, --help            Show this help
`);
}

function applyPortFromArgv(argv: string[]): void {
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--port" || a === "-p") {
            const v = argv[i + 1];
            if (v === undefined || v.startsWith("-")) {
                console.error(`${a} requires a port number`);
                process.exit(1);
            }
            process.env.PORT = v;
            i++;
        }
    }
}

function parseOutputDir(argv: string[]): string | undefined {
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--output-dir" || a === "-o") {
            const v = argv[i + 1];
            if (v === undefined || v.startsWith("-")) {
                console.error(`${a} requires a directory path`);
                process.exit(1);
            }
            return v;
        }
    }
    return undefined;
}

function wantsHelp(argv: string[]): boolean {
    return argv.some((a) => a === "--help" || a === "-h");
}

function isWsUrl(s: string): boolean {
    return s.startsWith("ws://") || s.startsWith("wss://");
}

function printTunnelUrlHelp(): void {
    console.error("Example:");
    console.error(
        "  example-mapping --tunnel wss://xxxxxxxx.execute-api.us-east-1.amazonaws.com/live",
    );
}

function parseTunnelArgs(argv: string[]): {
    tunnelUrl: string | undefined;
    tunnelOnlyUrl: string | undefined;
} {
    let tunnelUrl: string | undefined;
    let tunnelOnlyUrl: string | undefined;

    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];

        if (a === "--tunnel-only") {
            const v = argv[i + 1];
            if (
                v === undefined ||
                v.startsWith("-") ||
                !isWsUrl(v)
            ) {
                console.error(
                    "--tunnel-only requires a WebSocket URL (ws:// or wss://)",
                );
                printTunnelUrlHelp();
                process.exit(1);
            }
            tunnelOnlyUrl = v;
            i++;
            continue;
        }

        if (a === "--tunnel" || a.startsWith("--tunnel=")) {
            let url: string | undefined;
            if (a.startsWith("--tunnel=")) {
                url = a.slice("--tunnel=".length);
            } else {
                url = argv[i + 1];
                if (url === undefined || url.startsWith("-")) {
                    console.error(
                        "--tunnel requires a WebSocket URL (ws:// or wss://)",
                    );
                    printTunnelUrlHelp();
                    process.exit(1);
                }
                i++;
            }
            if (url.length === 0 || !isWsUrl(url)) {
                console.error(
                    "--tunnel URL must start with ws:// or wss://",
                );
                printTunnelUrlHelp();
                process.exit(1);
            }
            tunnelUrl = url;
            continue;
        }
    }

    return { tunnelUrl, tunnelOnlyUrl };
}

function parseDevPort(): number {
    const raw = process.env.PORT ?? "3000";
    const n = parseInt(raw, 10);
    if (Number.isNaN(n) || n < 1 || n > 65535) {
        console.error(`Invalid port: ${raw}`);
        process.exit(1);
    }
    return n;
}

async function main(): Promise<void> {
    const argv = process.argv.slice(2);
    applyPortFromArgv(argv);

    if (wantsHelp(argv)) {
        printHelp();
        process.exit(0);
    }

    const { tunnelUrl, tunnelOnlyUrl } = parseTunnelArgs(argv);
    const outputDir = parseOutputDir(argv);

    if (tunnelUrl !== undefined && tunnelOnlyUrl !== undefined) {
        console.error("Use either --tunnel or --tunnel-only, not both.");
        process.exit(1);
    }

    const devPort = parseDevPort();

    if (tunnelOnlyUrl !== undefined) {
        const relay = startRelayTunnel({
            wsUrl: tunnelOnlyUrl,
            devPort,
        });
        const shutdown = (): void => {
            relay.stop();
            process.exit(0);
        };
        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);
        return;
    }

    let relayHandle: RelayTunnelHandle | null = null;
    const shutdownRelay = (): void => {
        if (relayHandle !== null) {
            relayHandle.stop();
            relayHandle = null;
        }
    };

    if (tunnelUrl !== undefined) {
        process.on("SIGINT", () => {
            shutdownRelay();
            process.exit(0);
        });
        process.on("SIGTERM", () => {
            shutdownRelay();
            process.exit(0);
        });
    }

    const { startServer } = await import("./server");

    startServer({
        outputDir,
        onListening: () => {
            if (tunnelUrl === undefined) return;
            relayHandle = startRelayTunnel({
                wsUrl: tunnelUrl,
                devPort,
            });
        },
    });
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
