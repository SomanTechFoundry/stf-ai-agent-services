# Branch and deploy policy

| Branch | Purpose | Vercel |
|--------|---------|--------|
| `dev` | Daily development. Commit and push freely. | **Not deployed** |
| `qa` | Integration / customer-preview. | **Preview** |
| `prod` | Live customer environment. | **Production** |
| `main` | Legacy. Do not deploy. | **Not deployed** |

`vercel.json` sets `git.deploymentEnabled` so `dev` and `main` never trigger a build.

In the Vercel project, set **Production Branch** to `prod`. Preview deployments should come from `qa`.

## Workflow

1. Develop and test locally.
2. Commit and push to `dev`.
3. When ready for preview, merge `dev` → `qa`.
4. When ready for customers, merge `qa` (or `dev`) → `prod`.
