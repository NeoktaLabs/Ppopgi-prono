# Ppopgi Prono

Web app mobile-first de pronostics Coupe du Monde.

## Stack

- React + Vite
- Cloudflare Workers
- Cloudflare D1
- Cloudflare Cron Triggers
- Cloudflare Email Service / email binding
- GitHub deployment

## V1 features

- Connexion par magic link e-mail
- Session longue durée via cookie HttpOnly
- Création et rejoindre une ligue avec code obligatoire
- Admin unique par ligue
- Suppression de joueur par admin
- Pronostics verrouillés au coup d’envoi
- Pronostics des autres cachés avant coup d’envoi, visibles ensuite
- Scores automatisables via cron
- Score pris après prolongations éventuelles, tirs au but ignorés
- Multiplicateurs: groupes x1, huitièmes x2, quarts x3, demies/petite finale x4, finale x5
- Leaderboard, historique joueur, stats avancées

## Local setup

```bash
npm install
npm run dev
```

Create a D1 database and replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.jsonc`, then run:

```bash
npm run db:migrate:local
```

## Notes

The football provider is currently stubbed in `src/worker/sync.ts`. Replace `fetchProviderMatches()` with API-Football or football-data.org mapping once the provider/API key is selected.
