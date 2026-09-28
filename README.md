# Walrus Names Gateway

> The HTTP lens for **`.epoch` names** — a single-file Cloudflare Worker that resolves names from the on-chain registry on [Sui](https://sui.io) and serves their websites straight from [Walrus](https://www.walrus.xyz).
>
> **Anyone can run this.** That's the point.

**Live instance:** `https://<name>.epochsui.com` · Register a name & build a site: [names.epochsui.com](https://names.epochsui.com)

---

## Why this exists (and why it's open source)

A `.epoch` site is two on-chain facts: a **name → blob_id** record in a shared Registry object on Sui, and the site content stored as **blobs on Walrus**. Both are public, permissionless and durable. The only centralized link in the chain was the gateway that turns those facts into a website in your browser.

This repo removes that link. The gateway is stateless, read-only and needs **zero secrets** — so anyone can deploy their own copy on their own domain and every `.epoch` site keeps working there. If `epochsui.com` disappeared tomorrow, this Worker plus any domain would bring every site back in five minutes.

```
<name>.yourdomain.com
        │
        ▼
 1. Sui fullnode RPC  ──  Registry (shared object) → Table dynamic field → NameRecord { blob_id }
        │
        ▼
 2. Walrus aggregator ──  GET /v1/blobs/<blob_id>
        │
        ▼
 3. Serve: single blob (legacy)  or  multi-page site via manifest
```

## Features

- **Name resolution** from the on-chain Registry (`Table<String, NameRecord>` read via `suix_getDynamicFieldObject`).
- **Multi-page sites** via a tiny manifest format (below): exact route → `.html` variant → nested `index.html`, custom 404, MIME by extension.
- **Base36 object-ID URLs** — `<objectid-base36>.yourdomain.com` works like Walrus Sites portals: resolves a NameCap (via its `name` field) or any object exposing `blob_id` directly, no registry lookup needed.
- **OG image generator** — `og.<domain>/<name>` returns a branded SVG social card.
- **Reserved-subdomain guard** (www, mail, api, …) and name validation mirroring the contract rules.
- Five-minute caching, CORS open, `X-Walrus-Blob-Id` / `X-Epoch-Manifest` debug headers on every response.

## Manifest format

A multi-page site is one JSON blob:

```json
{
  "epoch-manifest": 1,
  "routes": {
    "/":          "<blobId>",
    "/about":     "<blobId>",
    "/style.css": "<blobId>"
  },
  "404": "<blobId>",
  "fallback": "/"
}
```

`404` is an optional custom not-found page. `fallback` (optional) is for single-page apps: any unknown extension-less path (e.g. `/session/3`) serves that route (or blobId) with a real 200, so client-side routers work and share previews resolve.

Any non-JSON blob (or JSON without `epoch-manifest`) is served as a classic single-page site — full backwards compatibility. You don't need to craft manifests by hand: the no-code builder at [names.epochsui.com/build](https://names.epochsui.com/build) generates and publishes them (multi-page, asset upload, .zip import).

## Self-host in 5 minutes

```bash
git clone https://github.com/DCSteve96/walrus-names-gateway
cd walrus-names-gateway
npm install
npx wrangler deploy
```

Then in the Cloudflare dashboard:

1. DNS → add a wildcard record: `CNAME  *  walrus-names-gateway.<your-account>.workers.dev` (proxied).
2. Worker → Settings → Domains → add Custom Domain `*.yourdomain.com`.

Done — `<name>.yourdomain.com` now serves every registered `.epoch` site. Switch `NETWORK = "testnet"` in `wrangler.toml` to point at the testnet registry.

**Your domain needs no code change.** The worker takes the name from the first label of whatever hostname reaches it, so `epochsui.com` appears nowhere in the resolution path: the same source serves `alice.epochsui.com` and `alice.yourdomain.com` identically, off the same on-chain records. The only requirement is at least three labels, so host it on a subdomain of your domain (`*.yourdomain.com`), not on the apex.

**No secrets, no database, no state.** The worker reads two public sources: a Sui fullnode and the public Walrus aggregator (both endpoints are in `CONTRACTS` at the top of `src/index.ts` — swap in your own fullnode/aggregator if you prefer).

## Adapting for your own deployment

The `src/index.ts` top section contains a few **Epoch-infrastructure proxy routes** (`mcp.*`, `badge.*`, `ecosystem.*` → Epoch's own workers). They are irrelevant for third-party deployments — delete that block, or repoint it at your services.

## On-chain constants

| | Package | Registry |
|---|---|---|
| **mainnet** | `0x5dd1fb9f784129f0815c8e54ed917ad698401c0900ebeb1525f37fac98a94dda` | `0xa6d9e91daa40dbff259838c9f5bd6448d8f08e9b2a3da02c5d4d3c88ce5666d1` |
| **testnet** | `0x159ced95ba4b73994f6c70c7bfe4cc9aee62abcf35a358185364e3af9bc231e3` | `0xce19bb7e07bca68a5074534e0878580365b45ec9f11a0231dddfc25106fd216b` |

The registry contracts are deployed on Sui; names are NFTs (NameCap) with full marketplace support (royalty-enforced via TransferPolicy).

## Part of the Epoch ecosystem

[Epoch](https://epochsui.com) — trustless token vesting · [.epoch Names & Sites](https://names.epochsui.com) · [Kairos](https://kairos.epochsui.com), the autonomous on-chain agent · open [MCP server](https://epoch-mcp.epochsui.com) for AI agents.

Built by [@EpochSui](https://x.com/EpochSui). License: [MIT](LICENSE).
