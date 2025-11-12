import { ApiFootballOdds } from '../types/fixtures-response.type';

export type Fav = 'home' | 'away' | 'draw' | null;

function favFromBook(book: any): Fav {
  try {
    const bet = book?.bets?.find((b: any) =>
      /match\s*winner|1x2/i.test(b.name),
    );
    if (!bet) return null;
    const entries =
      bet.values?.map((v: any) => ({
        k: (v.value || v.label || '').toString().toLowerCase(),
        p: Number(v.odd),
      })) || [];
    const sorted = entries
      .filter((e) => Number.isFinite(e.p))
      .sort((a, b) => a.p - b.p);
    const top = sorted[0]?.k;
    if (!top) return null;
    if (top.includes('home') || top === '1') return 'home';
    if (top.includes('away') || top === '2') return 'away';
    if (top.includes('draw') || top === 'x') return 'draw';
    return null;
  } catch {
    return null;
  }
}

export function inferOpenFav(odds?: ApiFootballOdds[]): Fav {
  if (!odds?.length) return null;
  const earliest = odds
    .map((o) => ({
      o,
      t: new Date((o as any).update || (o as any).date || 0).getTime(),
    }))
    .sort((a, b) => a.t - b.t)[0]?.o;
  if (!earliest) return null;
  return favFromBook(earliest.bookmakers?.[0]);
}

export function inferLatestFav(odds?: ApiFootballOdds[]): Fav {
  if (!odds?.length) return null;
  const latest = odds
    .map((o) => ({
      o,
      t: new Date((o as any).update || (o as any).date || 0).getTime(),
    }))
    .sort((a, b) => b.t - a.t)[0]?.o;
  if (!latest) return null;
  return favFromBook(latest.bookmakers?.[0]);
}

export function buildMarketDrift(openFav: Fav, latestFav: Fav) {
  let direction: 'towardHome' | 'towardAway' | 'towardDraw' | 'mixed' | 'flat' =
    'flat';
  if (openFav && latestFav) {
    direction =
      openFav === latestFav
        ? 'flat'
        : latestFav === 'home'
          ? 'towardHome'
          : latestFav === 'away'
            ? 'towardAway'
            : 'towardDraw';
  } else if (!openFav && latestFav) {
    direction =
      latestFav === 'home'
        ? 'towardHome'
        : latestFav === 'away'
          ? 'towardAway'
          : 'towardDraw';
  }
  return { openFav, latestFav, direction } as const;
}
