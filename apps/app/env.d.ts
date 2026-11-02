/// <reference types="expo/types" />

declare module "*.css";

declare namespace NodeJS {
  interface ProcessEnv {
    /** API origin for the app (inlined at build time by Expo). */
    EXPO_PUBLIC_API_URL?: string;
  }
}
