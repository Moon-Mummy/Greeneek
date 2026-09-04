/**
 * The single network egress policy for the Greeneek Harness.
 *
 * The rebrand severed the pre-rebrand provider for good: no harness request
 * may reach a `*.deepseek.*` host, regardless of how the endpoint was
 * configured (`$GREENEEK_BASE_URL`, a user settings file, or a plugin patch).
 * The guard runs where connection facts resolve — before any adapter holds a
 * URL — so a blocked endpoint fails at boot with a readable config error
 * rather than mid-stream. Hosts on the blocklist can never be allow-listed.
 *
 * Strict mode (`$GNK_STRICT_EGRESS=1`) additionally refuses every host that
 * is not in the built-in allow-list or user-configured, for air-gapped or
 * compliance deployments.
 * @module @greeneek/gnk-egress
 */
/** Raised when a resolved endpoint violates the egress policy. */
export class EgressBlockedError extends Error {
    /** The hostname that caused the refusal. */
    hostname;
    /**
     * @param hostname - the refused host.
     * @param reason - which policy arm refused it.
     */
    constructor(hostname, reason) {
        super(`Egress blocked for ${hostname}: ${reason}`);
        this.name = 'EgressBlockedError';
        this.hostname = hostname;
    }
}
/**
 * Hosts the harness will never talk to. Every pre-rebrand DeepSeek endpoint
 * lands here — inference, search, files, platform, and marketing — because
 * the rebrand's contract is zero communication with the retired upstream.
 * Matched against the full hostname, so subdomains are covered too.
 */
export const BLOCKED_HOSTS = [
    /(^|\.)deepseek\.com$/i,
    /(^|\.)deepseek\.ai$/i,
    /(^|\.)deepseek\.cn$/i,
    /^deepseek\./i,
];
/**
 * Allow-list consulted only under `$GNK_STRICT_EGRESS=1`. It holds the
 * Greeneek gateway; package-registry and release hosts are added by the
 * update/installer seams themselves when strict mode is tightened further.
 */
export const STRICT_ALLOWED_HOSTS = new Set([
    'api.greeneek.dev',
    'greeneek.dev',
]);
/**
 * Refuse URLs whose host is banned (and, under strict mode, not allow-listed).
 * @param url - a resolved endpoint about to be used by a connection layer.
 * @param env - environment mapping consulted for `GNK_STRICT_EGRESS`.
 * @throws {EgressBlockedError} when the URL's host is blocked or, in strict
 * mode, absent from the allow-list; a `TypeError`-shaped failure for a URL
 * that cannot be parsed is wrapped so consumers see one error class.
 */
export function assertEgressAllowed(url, env = process.env) {
    let hostname;
    try {
        hostname = new URL(url).hostname;
    }
    catch {
        throw new EgressBlockedError(String(url), 'not an absolute URL');
    }
    hostname = hostname.toLowerCase();
    if (BLOCKED_HOSTS.some(re => re.test(hostname))) {
        throw new EgressBlockedError(hostname, 'the retired pre-rebrand provider is never contacted; point GREENEEK_BASE_URL at the Greeneek gateway');
    }
    if (env.GNK_STRICT_EGRESS === '1' && !STRICT_ALLOWED_HOSTS.has(hostname)) {
        throw new EgressBlockedError(hostname, 'GNK_STRICT_EGRESS=1 allows only the built-in host list');
    }
}
//# sourceMappingURL=index.js.map