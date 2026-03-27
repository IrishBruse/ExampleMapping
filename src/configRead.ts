/** Match server + CLI: `PORT` env or 3000. */
export function resolvedListenPort(): number {
    const p = process.env.PORT;
    if (p === undefined || p === "") return 3000;
    const n = parseInt(String(p), 10);
    return Number.isNaN(n) ? 3000 : n;
}
