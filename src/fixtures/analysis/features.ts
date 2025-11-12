import { ApiFootballFixture } from '../types/fixtures-response.type';

export function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x));
}

export function buildScheduleLoad(lastFixtures: ApiFootballFixture[]) {
  const now = Date.now();
  const within = (days: number) =>
    lastFixtures.filter(
      (f) =>
        now - new Date((f as any).fixture?.date ?? 0).getTime() <=
        days * 86400000,
    );
  const last7 = within(7);
  const last14 = within(14);
  const matchesLast7 = last7.length,
    matchesLast14 = last14.length;
  const minutesLast7 = matchesLast7 * 90,
    minutesLast14 = matchesLast14 * 90; // fixture-level approximation
  const lastDate = lastFixtures[0]?.fixture?.date
    ? new Date(lastFixtures[0].fixture.date).getTime()
    : undefined;
  const restDaysSinceLast = lastDate
    ? Math.max(0, (now - lastDate) / 86400000)
    : 14;
  const fixtureDensityIndex = sigmoid(
    0.6 * matchesLast14 + 0.3 * (minutesLast14 / 90) - 0.5 * restDaysSinceLast,
  );
  return {
    minutesLast7,
    minutesLast14,
    matchesLast7,
    matchesLast14,
    restDaysSinceLast,
    fixtureDensityIndex,
    avgRotation: 0.5,
  };
}

export function buildBenchDepth(
  squadSize: number,
  longTermOut: number,
  susp: number,
  injuries: number,
) {
  const usableSeniorCount = Math.max(0, squadSize - longTermOut - susp);
  const injuriesCount = injuries;
  const rotationHealth = sigmoid((usableSeniorCount - 13) / 2);
  return {
    usableSeniorCount,
    longTermOut,
    suspensionCount: susp,
    rotationHealth,
    u21Share: 0.0,
    injuriesCount,
  };
}
