// Spec §6: nothing about a conversation leaves our servers. CopilotKit's runtime reports usage unless this is set,
// and it reads it when its telemetry client is built, so this module is imported first, before the runtime loads.
process.env.COPILOTKIT_TELEMETRY_DISABLED ??= "true";
