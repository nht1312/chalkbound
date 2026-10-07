/** Server process settings. Gameplay constants live in @chalkbound/shared. */
export const SERVER_CONFIG = {
  port: Number(process.env['PORT'] ?? 2567),
  /** Name the match room is registered under. */
  matchRoomName: 'match',
  /** How often the measured tick rate is logged, in ms. */
  tickReportIntervalMs: 5000,
} as const;
