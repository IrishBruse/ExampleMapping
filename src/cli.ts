#!/usr/bin/env node
/**
 * mapping-tool CLI — start the HTTP + Socket.io server
 */

function printHelp(): void {
    console.log(`Usage: example-mapping [options]

Options:
  -p, --port N     Listen port (default: 3000 or PORT env)
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

async function main(): Promise<void> {
    const argv = process.argv.slice(2);
    applyPortFromArgv(argv);

    if (wantsHelp(argv)) {
        printHelp();
        process.exit(0);
    }

    const { startServer } = await import("./server");
    startServer();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
