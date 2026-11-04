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
1. **Loopback Only Binding**:
   - Web server scripts (`web/server.mjs`) explicitly bind to `127.0.0.1`. Requests originating from outside the host machine are rejected at the operating system socket layer.
2. **Third-Party API Authentication**:
   - Outbound LLM calls authenticate using standard API keys stored in local environment variables (`OPENROUTER_API_KEY`, `GEMINI_API_KEY`).
   - Keys are never stored in browser cookies or transmitted to client-side bundles.

## Best Practices
- Never bind career-ops to `0.0.0.0` without placing a password-authenticated reverse proxy (e.g., Caddy with basic auth) in front.

## Examples
```javascript
// web/server.mjs explicit loopback binding
server.listen(port, '127.0.0.1', () => {
  console.log(`Server listening on http://127.0.0.1:${port}`);
});
```

## Future Enhancements
- Optional local PIN / biometric authentication (WebAuthn / TouchID) for opening the Web UI.
