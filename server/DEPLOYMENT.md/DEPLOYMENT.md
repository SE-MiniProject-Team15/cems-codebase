# Production deployment: HTTPS and trusted proxies

The server enforces HTTPS when `NODE_ENV=production`. Requests that Express does not recognize as secure are rejected with HTTP 400. `CLIENT_URL` must also use HTTPS, but that setting only controls the allowed frontend origin; it does not secure incoming connections by itself.

## TLS terminated by this server

Leave `TRUST_PROXY` empty. Configure the deployment to serve the app only over HTTPS.

## TLS terminated by a reverse proxy or ingress

Set `TRUST_PROXY` to a comma-separated list of the exact IP addresses or CIDR ranges used by the trusted proxy hop(s), for example `TRUST_PROXY=10.20.0.0/16` only when that is the actual ingress range. Do not use `*`, `true`, or a broad range that includes untrusted clients. Express uses this trust boundary to interpret `X-Forwarded-For` for `req.ip` and `X-Forwarded-Proto` for `req.secure`.

Configure the ingress to redirect or reject plain-HTTP traffic and to set/overwrite forwarded headers itself. Restrict network access to the application backend so clients cannot bypass the ingress and connect directly. The app-level HTTPS check is defense in depth, not a firewall.

The Strict-Transport-Security header is sent on production HTTPS responses. HSTS helps browsers use HTTPS on future visits; it does not redirect or protect a visitor's first HTTP request.
