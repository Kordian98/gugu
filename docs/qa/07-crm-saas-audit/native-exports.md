# Native export audit and repair — 2026-11-05

Payroll XLSX exports on iOS/Android previously shared only the file name. CSV and privacy exports shared raw text instead of downloadable attachments. Both now write the actual export to private application cache and open the system file-sharing sheet. Web keeps its Blob-based file download.

## Changes

- `apps/app/services/files/share.ts`: native UTF-8 and base64 file writes through Expo FileSystem, sharing through Expo Sharing, availability check, safe cache filenames, and a single active native share operation.
- `apps/app/package.json`, `pnpm-lock.yaml`: direct SDK 58 compatible `expo-file-system ~58.0.13` and `expo-sharing ~58.0.22` dependencies installed with `expo install`.
- `apps/app/app.config.ts`: default `expo-sharing` plugin. Incoming-share extensions remain disabled by default; this change only exports files.
- Payroll and privacy export controls catch write/share failures, display the existing localized error banner, and disable repeat actions until completion.
- Failed exports are removed immediately. Successful attachments remain in private cache because an Android receiving app can still read the URI after the chooser closes. Entries older than 24 hours are removed at the next export; the OS may evict cache earlier. This is not a guaranteed wall-clock deletion deadline. No export is written to public Documents or localStorage.

## Validation

- `pnpm --filter @gugu/app exec vitest run features/salon-crm/export/files.test.ts`: **8 passed**. Covers binary bytes on both native branches, Vietnamese CSV, unsupported sharing and retry, failed-write/share cleanup, cache expiry, and path confinement.
- `pnpm --filter @gugu/app typecheck`: **passed**.
- Targeted ESLint: **passed**, existing PayrollScreen complexity/file-length warnings remain.
- `pnpm --filter @gugu/app exec expo config --type public --json`: **passed**, plugin present.
- Tests mock native SDK boundaries; they prove that the app writes the real content and passes its file URI, not that a physical target app successfully receives it.
- Native device execution is **not verified**. The available Expo Go installation is SDK 54 and this app uses SDK 58. A compatible development build is required to verify Files/Mail/Drive targets on iPhone and Android.

## API references

The installed SDK types and [Expo SDK 58 FileSystem documentation](https://docs.expo.dev/versions/v58.0.0/sdk/filesystem/) specify async `File.write(content, { encoding })`. [Expo SDK 58 Sharing documentation](https://docs.expo.dev/versions/v58.0.0/sdk/sharing/) specifies sharing a local file URI on iOS/Android and checking availability first. Web file downloads intentionally use the existing browser implementation.
