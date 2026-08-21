import { today } from './save';

const KEY = 'pig-sandbox.metrics.v1';
/** 何日ぶん残すか。localStorage を太らせないための上限 */
const KEEP_DAYS = 60;

/**
 * 数えていること。北極星指標は「部屋を編集した日数」なので `edit` が主役。
 * 端末のなかだけで完結していて、どこにも送信しない。
 */
export type MetricEvent =
  | 'session' // 起動した
  | 'edit' // 部屋を編集した（置く・しまう・動かす・まわす・もようがえ）
  | 'buy'
  | 'share' // 共有 URL をつくった
  | 'shareOpen' // 共有 URL で開かれた
  | 'png' // 画像で保存した
  | 'like'
  | 'import'; // 共有 URL から部屋をとりこんだ

type DayRow = Partial<Record<MetricEvent, number>>;

interface Metrics {
  days: Record<string, DayRow>;
}

function read(): Metrics {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { days: {} };
    const parsed = JSON.parse(raw) as Partial<Metrics>;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.days !== 'object' || parsed.days === null) {
      return { days: {} };
    }
    return { days: parsed.days as Record<string, DayRow> };
  } catch {
    return { days: {} };
  }
}

function write(m: Metrics) {
  // 古い日を落としてから書く
  const days = Object.keys(m.days).sort();
  while (days.length > KEEP_DAYS) {
    const drop = days.shift();
    if (drop !== undefined) delete m.days[drop];
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* 保存できない環境では数えない */
  }
}

export function track(event: MetricEvent, n = 1) {
  if (n <= 0) return;
  const m = read();
  const day = today();
  const row = m.days[day] ?? {};
  row[event] = (row[event] ?? 0) + n;
  m.days[day] = row;
  write(m);
}

export interface MetricsSummary {
  /** 起動した日数 */
  playDays: number;
  /** 部屋を編集した日数（北極星指標） */
  editDays: number;
  /** 今日はもう編集したか */
  editedToday: boolean;
  totals: Record<MetricEvent, number>;
}

const EVENTS: MetricEvent[] = ['session', 'edit', 'buy', 'share', 'shareOpen', 'png', 'like', 'import'];

export function metricsSummary(): MetricsSummary {
  const m = read();
  const totals = Object.fromEntries(EVENTS.map((e) => [e, 0])) as Record<MetricEvent, number>;
  let playDays = 0;
  let editDays = 0;
  for (const row of Object.values(m.days)) {
    if ((row.session ?? 0) > 0) playDays += 1;
    if ((row.edit ?? 0) > 0) editDays += 1;
    for (const e of EVENTS) totals[e] += row[e] ?? 0;
  }
  return { playDays, editDays, editedToday: (m.days[today()]?.edit ?? 0) > 0, totals };
}
