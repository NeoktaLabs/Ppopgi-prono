# Cloudflare Email and Turnstile setup

## Email Service

The Worker expects a Cloudflare Email Service binding named `EMAIL`.

In `wrangler.jsonc`:

```json
"send_email": [
  {
    "name": "EMAIL",
    "destination_address": "tech@ppopgi.xyz"
  }
]
```

The app sends magic links with:

```ts
env.EMAIL.send({
  from: env.EMAIL_FROM,
  to,
  replyTo: env.EMAIL_REPLY_TO || env.EMAIL_FROM,
  subject,
  text,
});
```

Make sure `EMAIL_FROM` uses an address/domain that is configured and allowed in Cloudflare Email Service.

If the `EMAIL` binding is missing, the API now fails loudly instead of returning success without sending an email.

## Turnstile

Turnstile support is prepared on the backend.

Set this secret to enforce captcha validation:

```bash
npx wrangler secret put TURNSTILE_SECRET_KEY
```

Add the public site key to `wrangler.jsonc` or Cloudflare vars:

```json
"TURNSTILE_SITE_KEY": "your-public-site-key"
```

The login request body supports:

```json
{
  "email": "user@example.com",
  "turnstileToken": "client-token"
}
```

If `TURNSTILE_SECRET_KEY` is not configured, captcha validation is skipped. This lets local/dev deployments work without Turnstile.

## Next frontend step

Render a Turnstile widget on the login form and send the generated token as `turnstileToken` in `/api/auth/request-link`.
