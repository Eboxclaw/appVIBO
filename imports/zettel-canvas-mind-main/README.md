# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Cloudflare Workers deployment

This repository now includes a `wrangler.jsonc` configuration so `wrangler deploy` skips the interactive framework setup and deploys the built Vite assets as a Worker-backed static site.

### One-time setup

1. Create a Cloudflare API token with **Workers Scripts:Edit** (and any account-level permissions you need).
2. Export credentials in your shell or CI environment (never commit secrets):

```sh
export CLOUDFLARE_API_TOKEN="<your-api-token>"
export CLOUDFLARE_ACCOUNT_ID="<your-account-id>"
```

### Deploy commands

```sh
# Build + deploy
npm run deploy

# Deploy prebuilt dist/ (for CI after build step)
npm run deploy:ci

# Local Worker preview
npm run preview:worker
```

The Worker name is configured as `appviboai` (Cloudflare requires lowercase, alphanumeric plus dashes), and SPA routing is enabled via `assets.not_found_handling = "single-page-application"`.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
