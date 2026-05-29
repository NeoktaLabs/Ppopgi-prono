# Local dev auth bypass

For local troubleshooting, the Worker exposes a dev-only login endpoint:

```txt
/api/dev/login?email=you@example.com
```

It is disabled unless `DEV_AUTH_BYPASS=1` is present in the Worker environment, and it only works on local hosts such as `localhost` or `127.0.0.1`.

To jump directly into a league, pass its code or id:

```txt
/api/dev/login?email=you@example.com&league=ZD88UV
```

The endpoint creates the user if needed, sets a local session cookie, skips the one-time Turnstile gate for that browser session, and redirects back to the app. If a valid league is provided, the app opens that league automatically.

Do not enable `DEV_AUTH_BYPASS` in production.
