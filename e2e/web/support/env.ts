// Typed view of stack/config.mjs (shared with the Node boot scripts) for the tests.
import { E2E, apiUrl, databaseUrl, webUrl } from "../stack/config.mjs";

export const API = `${apiUrl}/api/v1`;
export const API_ORIGIN = apiUrl;
export const WEB = webUrl;
export const MAILPIT = E2E.mailpit;
export const MAIL_DOMAIN = E2E.mailDomain;
export const DATABASE_URL = databaseUrl;
