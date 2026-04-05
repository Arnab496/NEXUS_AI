<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Nexus AI

A modern Vite + React app that connects to Google Gemini for AI-powered experiences.

Live in AI Studio: https://ai.studio/apps/c70558d0-f5e3-4076-b294-2938e5d3c2ae

## Overview

Nexus AI provides a clean, responsive interface for exploring generative AI workflows in the browser. The app is built with Vite for fast feedback during development and TypeScript for predictable, maintainable code. The Gemini integration is designed to be simple to configure while keeping environment secrets out of the codebase.

## Highlights

- Vite + React + TypeScript for a fast, modern UI
- Gemini API integration for generative features
- Firebase-ready configuration

## Project Structure

The source code lives in the `src/` folder. The core UI is in `App.tsx`, app bootstrap code is in `main.tsx`, and shared styling is in `index.css`. The Gemini integration is centralized in `src/services/geminiService.ts`, which keeps API wiring isolated from UI components.

## Prerequisites

- Node.js 18+ (recommended)
- A Gemini API key

## Local Development

1. Install dependencies:
   `npm install`
2. Create a `.env.local` file and add your key:
   `VITE_GEMINI_API_KEY=your_key_here`
3. Start the dev server:
   `npm run dev`

When the dev server starts, Vite will print a local URL in the terminal. Open it in a browser to use the app. Any changes under `src/` are hot-reloaded.

## Build

`npm run build`

This creates a production-ready build in the `dist/` folder. You can preview it locally using `npm run preview`.

## Deploy to Vercel

1. Push the repo to GitHub.
2. In Vercel, import the project.
3. Framework preset: Vite
4. Build command: `npm run build`
5. Output directory: `dist`
6. Environment variables:
   - `VITE_GEMINI_API_KEY`

After deployment, update the environment variable in Vercel if you rotate your Gemini key. Vercel will trigger a new build when you change environment variables.

## Environment Variables

Use `.env.local` for local development. Only variables prefixed with `VITE_` are exposed to the client build. Keep your API keys out of source control.

## Troubleshooting

- If the app fails to load data from Gemini, verify `VITE_GEMINI_API_KEY` is set and the key is active.
- If dependencies fail to install, confirm you are using Node.js 18+.
- If builds fail on Vercel, re-check the output directory is set to `dist`.

## Contributing

Contributions are welcome. Please open an issue describing the change before submitting a pull request.

## Scripts

- `npm run dev` - Start the development server
- `npm run build` - Create a production build
- `npm run preview` - Preview the production build
