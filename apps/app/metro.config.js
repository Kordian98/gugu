// Metro config for the monorepo (ADR-0001) with NativeWind v5 (ADR-0004).
const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");

module.exports = withNativewind(getDefaultConfig(__dirname));
