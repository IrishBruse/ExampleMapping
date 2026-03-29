#!/usr/bin/env node
/**
 * example-mapping CLI — start the HTTP + Socket.io server
 */

import { startRelayTunnel, type RelayTunnelHandle } from "./relayTunnel";

function printHelp(): void {
    console.log(`Usage: example-mapping [options]

Options:
  -p, --port N     Listen port (default: 3000 or PORT env)
  --tunnel         After the server listens, run the AWS relay WebSocket client (needs WS_URL)
  --ws-url URL     WebSocket URL for the relay (or set WS_URL)
  -h, --help       Show this help

Notes directory defaults to ./context_files under the project; override with MAPPING_OUTPUT_DIR.
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

function wantsHelp(argv: string[]): boolean {
    return argv.some((a) => a === "--help" || a === "-h");
}

function parseTunnelArgs(argv: string[]): {
    tunnel: boolean;
    wsUrl: string | undefined;
} {
    let tunnel = false;
    let wsUrl: string | undefined;
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--tunnel") {
            tunnel = true;
            continue;
        }
        if (a === "--ws-url") {
            const v = argv[i + 1];
            if (v === undefined || v.startsWith("-")) {
                console.error("--ws-url requires a URL");
                process.exit(1);
            }
            wsUrl = v;
            i++;
        }
    }
    return { tunnel, wsUrl };
}

function printTunnelWsUrlRequired(): void {
    console.error("  example-mapping --tunnel --ws-url $WS_URL");
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

    const { tunnel, wsUrl } = parseTunnelArgs(argv);
    if (tunnel) {
        console.error("Use either --tunnel or --tunnel-only, not both.");
        process.exit(1);
    }

    const resolvedWsUrl = wsUrl ?? process.env.WS_URL;
    if (tunnel && (resolvedWsUrl === undefined || resolvedWsUrl === "")) {
        printTunnelWsUrlRequired();
        process.exit(1);
    }

    const devPort = parseDevPort();

    let relayHandle: RelayTunnelHandle | null = null;
    const shutdownRelay = (): void => {
        if (relayHandle !== null) {
            relayHandle.stop();
            relayHandle = null;
        }
    };

    if (tunnel) {
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

    startServer(() => {
        if (!tunnel || resolvedWsUrl === undefined) return;
        relayHandle = startRelayTunnel({
            wsUrl: resolvedWsUrl,
            devPort,
        });
    });
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
