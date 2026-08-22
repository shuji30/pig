/**
 * 時間帯。端末の時計から決まる。
 * 「毎日ちょっと変わる」を、更新なしで成立させるための仕掛け。
 */
export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night';

export interface TimeOfDayStyle {
  kind: TimeOfDay;
  label: string;
  icon: string;
  /** 明るさの倍率（1 が昼そのまま） */
  brightness: number;
  /** 混ぜる色。夕は橙、夜は青 */
  tintColor: number;
  /** 混ぜる強さ 0〜1 */
  tintAmount: number;
  /** 夜だけランプが点く */
  lampsOn: boolean;
}

export const TIME_OF_DAY: Record<TimeOfDay, TimeOfDayStyle> = {
  morning: {
    kind: 'morning',
    label: 'あさ',
    icon: '🌅',
    brightness: 1.02,
    tintColor: 0xffe9c8,
    tintAmount: 0.1,
    lampsOn: false,
  },
  day: { kind: 'day', label: 'ひるま', icon: '☀️', brightness: 1, tintColor: 0xffffff, tintAmount: 0, lampsOn: false },
  evening: {
    kind: 'evening',
    label: 'ゆうがた',
    icon: '🌇',
    brightness: 0.95,
    tintColor: 0xff9a5c,
    tintAmount: 0.2,
    lampsOn: false,
  },
  night: {
    kind: 'night',
    label: 'よる',
    icon: '🌙',
    brightness: 0.66,
    tintColor: 0x3a4a8c,
    tintAmount: 0.28,
    lampsOn: true,
  },
};

/**
 * その時刻の時間帯。
 * あさ 5-10 / ひるま 10-17 / ゆうがた 17-19 / よる 19-5
 */
export function timeOfDayAt(hour: number): TimeOfDay {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h >= 5 && h < 10) return 'morning';
  if (h >= 10 && h < 17) return 'day';
  if (h >= 17 && h < 19) return 'evening';
  return 'night';
}

/** いまの時間帯 */
export function currentTimeOfDay(now = new Date()): TimeOfDay {
  return timeOfDayAt(now.getHours());
}

/** 色に時間帯の色調をかける。0xrrggbb を返す */
export function applyTimeOfDay(color: number, style: TimeOfDayStyle): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const tr = (style.tintColor >> 16) & 0xff;
  const tg = (style.tintColor >> 8) & 0xff;
  const tb = style.tintColor & 0xff;
  const mix = (v: number, t: number) =>
    Math.max(0, Math.min(255, Math.round((v * (1 - style.tintAmount) + t * style.tintAmount) * style.brightness)));
  return (mix(r, tr) << 16) | (mix(g, tg) << 8) | mix(b, tb);
}
