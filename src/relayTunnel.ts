/**
 * AWS API Gateway relay tunnel: WebSocket to the cloud proxy, HTTP to localhost.
 */

import * as http from "http";
import WebSocket from "ws";

/**
 * API Gateway WebSocket max frame is 128 KB (131072 bytes). The chunk data is
 * JSON-stringified, which can double the size for content rich in " and \
 * characters (common in minified JS). 50 000 chars * 2× worst-case expansion
 * = 100 000 bytes — safely under the 128 KB limit.
 */
const CHUNK_SIZE = 50000;

type RelayResponse = {
    statusCode: number;
    headers: Record<string, string | undefined>;
    body: string;
    isBase64Encoded: boolean;
};

function sendResponse(
    ws: WebSocket,
    requestId: string,
    response: RelayResponse,
): void {
    const { body, ...meta } = response;
    const bodyStr = body ?? "";

    if (bodyStr.length <= CHUNK_SIZE) {
        ws.send(JSON.stringify({ requestId, ...meta, body: bodyStr }));
        return;
    }

    const totalChunks = Math.ceil(bodyStr.length / CHUNK_SIZE);
    ws.send(JSON.stringify({ requestId, ...meta, totalChunks }));

    for (let i = 0; i < totalChunks; i++) {
        ws.send(
            JSON.stringify({
                requestId,
                chunkIndex: i,
                chunkData: bodyStr.slice(
                    i * CHUNK_SIZE,
                    (i + 1) * CHUNK_SIZE,
                ),
            }),
        );
    }
}

function forward(
    devPort: number,
    method: string | undefined,
    path: string | undefined,
    headers: unknown,
    body: string | null | undefined,
    isBase64Encoded: boolean | undefined,
): Promise<RelayResponse> {
    return new Promise((resolve, reject) => {
        const reqHeaders: http.OutgoingHttpHeaders = Object.assign(
            {},
            headers as Record<string, string>,
            { host: "localhost" },
        );
        // Strip Accept-Encoding so Express never responds with compressed
        // content. The relay sends body as a UTF-8 string or base64, both of
        // which are incompatible with binary gzip payloads.
        delete reqHeaders["accept-encoding"];
        delete reqHeaders["Accept-Encoding"];
        const req = http.request(
            {
                hostname: "localhost",
                port: devPort,
                path: path ?? "/",
                method: method ?? "GET",
                headers: reqHeaders,
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on("data", (c) => {
                    chunks.push(c);
                });
                res.on("end", () => {
                    const buf = Buffer.concat(chunks);
                    const ct = res.headers["content-type"] ?? "";
                    const isBin = !/text|json|javascript|xml|svg/.test(
                        String(ct),
                    );
                    const resHeaders: Record<string, string | undefined> = {};
                    for (const [k, v] of Object.entries(res.headers)) {
                        // Strip hop-by-hop and encoding headers; also drop
                        // content-length because after chunking/reassembly the
                        // byte count may differ, and API Gateway recomputes it.
                        if (
                            k !== "transfer-encoding" &&
                            k !== "content-encoding" &&
                            k !== "content-length"
                        ) {
                            resHeaders[k] = Array.isArray(v) ? v[0] : v;
                        }
                    }
                    resolve({
                        statusCode: res.statusCode ?? 502,
                        headers: resHeaders,
                        body: isBin
                            ? buf.toString("base64")
                            : buf.toString("utf8"),
                        isBase64Encoded: isBin,
                    });
                });
            },
        );
        req.on("error", reject);
        if (body) {
            req.write(
                isBase64Encoded
                    ? Buffer.from(body, "base64")
                    : Buffer.from(body, "utf8"),
            );
        }
        req.end();
    });
}

export type RelayTunnelHandle = {
    /** Stops reconnects, closes the WebSocket, and clears timers. */
    stop: () => void;
};

/**
 * Connects to the relay WebSocket and forwards incoming HTTP requests to localhost.
 * Reconnects after disconnect unless {@link RelayTunnelHandle.stop} is called.
 */
export function startRelayTunnel(options: {
    wsUrl: string;
    devPort: number;
}): RelayTunnelHandle {
    let stopped = false;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let socket: WebSocket | null = null;
    let keepAlive: NodeJS.Timeout | null = null;

    function clearTimers(): void {
        if (keepAlive !== null) {
            clearInterval(keepAlive);
            keepAlive = null;
        }
        if (reconnectTimer !== null) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
    }

    function connect(): void {
        if (stopped) return;
        const ws = new WebSocket(options.wsUrl);
        socket = ws;

        keepAlive = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ action: "ping" }));
            }
        }, 30000);

        ws.on("open", () => {
            console.log(
                `Relay connected. Forwarding to localhost:${options.devPort}`,
            );
        });

        ws.on("message", async (data) => {
            let req: {
                requestId?: string;
                method?: string;
                path?: string;
                headers?: unknown;
                body?: string | null;
                isBase64Encoded?: boolean;
            };
            try {
                req = JSON.parse(data.toString()) as typeof req;
            } catch {
                return;
            }

            const {
                requestId,
                method,
                path: reqPath,
                headers,
                body,
                isBase64Encoded,
            } = req;
            if (requestId === undefined) return;

            try {
                const response = await forward(
                    options.devPort,
                    method,
                    reqPath,
                    headers,
                    body,
                    isBase64Encoded,
                );
                sendResponse(ws, requestId, response);
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : String(err);
                ws.send(
                    JSON.stringify({
                        requestId,
                        statusCode: 502,
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ error: message }),
                        isBase64Encoded: false,
                    }),
                );
            }
        });

        ws.on("close", () => {
            clearTimers();
            if (stopped) return;
            console.log("Disconnected. Reconnecting in 5s...");
            reconnectTimer = setTimeout(connect, 5000);
        });

        ws.on("error", (err) => {
            console.error("WebSocket error:", err.message);
        });
    }

    connect();

    return {
        stop: () => {
            stopped = true;
            clearTimers();
            if (socket !== null) {
                socket.removeAllListeners();
                socket.close();
                socket = null;
            }
        },
    };
}
