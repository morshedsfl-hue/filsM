# Project Instructions & Conventions

This file contains persistent instructions for any AI agent working on this project.

## Project Overview
This is a secure, encrypted storage application that integrates **Google Drive** for file storage and **Firebase** for metadata and synchronization.

## Tech Stack
- **Frontend**: React (Vite), Tailwind CSS
- **Backend**: Express (Full-stack setup)
- **Database**: Firestore
- **Auth**: Firebase Auth + Google OAuth (for Drive access)
- **Encryption**: Custom AES/encryption logic (see `src/lib/crypto.ts`)
- **Animations**: `motion/react`

## Core Rules & Guidelines
1. **Consistency**: Maintain the "A to Z" consistency in UI/UX. The theme should be technical, secure, and modern.
2. **Security First**: 
   - Never expose raw encryption keys.
   - All file data sent to or retrieved from Google Drive must pass through the encryption/decryption layer in `src/lib/crypto.ts`.
   - Ensure Firestore rules are updated whenever new collections are added.
3. **Google Drive Integration**: Use `DriveContext` for all Drive-related operations. Ensure proper error handling for OAuth token expiration.
4. **Environment Variables**: Always use `VITE_` prefix for client-side variables and declare them in `.env.example`.
5. **UI Components**: Use tailwind classes for styling. Favor `lucide-react` for icons.

## Formatting Preferences
- Use TypeScript for all new files.
- Prefer functional components with hooks.
- Maintain clear comments for encryption/decryption logic.

## Specific Task Instructions
- When the user asks for "A to Z prompt consistency", ensure that the layout, spacing, and typography remain identical across different views (Auth, Dashboard, etc.).
