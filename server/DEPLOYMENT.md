# Production deployment: HTTPS and trusted proxies

With `NODE_ENV=production`, the server rejects requests Express does not recognize as secure with HTTP 400. `CLIENT_URL` must use HTTPS, but that only constrains the frontend origin; it does not secure incoming connections.

## TLS terminated by this server

Leave `TRUST_PROXY` empty and serve the app only over HTTPS.

## TLS terminated at a reverse proxy or ingress

Set `TRUST_PROXY` to the exact IP addresses or CIDR ranges of trusted proxy hops, comma-separated. For example, use `TRUST_PROXY=10.20.0.0/16` only if that is the actual ingress range. Never use `*`, `true`, or a range that includes untrusted clients. Express relies on this boundary for `req.ip` (`X-Forwarded-For`) and `req.secure` (`X-Forwarded-Proto`).

Configure the ingress to redirect or reject plain HTTP and overwrite forwarded headers. Restrict backend network access to the ingress so clients cannot bypass it; the app-level check is defense in depth, not a firewall.

Production HTTPS responses include HSTS. HSTS helps browsers use HTTPS on later visits; it does not redirect or protect a visitor's first HTTP request.

## Notification email

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM` as shown in `.env.example` to deliver notification email. With SMTP unset, in-app notifications still work. Delivery failures are logged and do not roll back registrations, event decisions, or event changes.

The server checks for event reminders every minute. Keep the server process running and ensure MongoDB indexes are applied so a student receives at most one reminder for each scheduled event time.
