# Authentication & Authorization — career-ops

## Purpose
Documents the security model, network isolation, and access controls governing career-ops.

## Scope
Applies to local web server instances and remote AI API interactions.

## Overview
career-ops is fundamentally a **single-user, local-first system**. It eliminates complex user credential databases and session token mechanics by binding strictly to local loopback interfaces.

## Diagrams

```mermaid
flowchart TD
    Client["Browser / Local Client"] -->|Loopback Connection (127.0.0.1)| LocalServer["Next.js / Web Server"]
    Remote["Remote Internet Attacker"] -->|Blocked (No Remote Interface)| Firewall["OS Socket Binding"]
    Firewall -.->|Connection Refused| LocalServer
    LocalServer -->|Authenticated with Bearer Token| ModelProvider["Anthropic / Google / OpenAI APIs"]
```

## Technical Details

### Security Boundaries
1. **Loopback Default Binding**:
   - `web/server.mjs` binds to `127.0.0.1` unless told otherwise, so by default only processes on the same machine can connect.
   - Widening the bind is an explicit opt-in. Passing `-H <address>` to the launcher (`cd web && npm run dev -- -H 0.0.0.0`, for example) sets the bind directly, and the launcher reports that the run may be reachable from the network.
   - `CAREER_OPS_WEB_ALLOWED_HOSTS` (comma-separated) names the `Host` values the request guard accepts. Naming any non-loopback host makes `web/src/lib/bind-host.mjs` bind to that address, or to `0.0.0.0` when several hosts or a hostname are named. Naming only loopback names does not widen the bind.
   - There is no user authentication. The dashboard has no login, password, or session. Anyone who can reach the bound address can use it, so exposing it beyond loopback is a decision to make deliberately.
2. **Third-Party API Authentication**:
   - Outbound LLM calls authenticate using standard API keys stored in local environment variables (`OPENROUTER_API_KEY`, `GEMINI_API_KEY`).
   - Keys are never stored in browser cookies or transmitted to client-side bundles.

## Best Practices
- Keep the default loopback bind unless you need network access.
- Never widen the bind (`-H` or `CAREER_OPS_WEB_ALLOWED_HOSTS`) without placing an authenticating reverse proxy (e.g., Caddy with basic auth) in front, because the dashboard itself checks no credentials.

## Examples
Starting the dashboard with the default loopback bind:
```bash
cd web && npm run dev    # listens on 127.0.0.1 only
```

Widening the bind to every interface (exposes the dashboard to your network, with no login):
```bash
cd web && npm run dev -- -H 0.0.0.0
```

## Future Enhancements
- Optional local PIN / biometric authentication (WebAuthn / TouchID) for opening the Web UI.
