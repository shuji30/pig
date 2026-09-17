import { describe, expect, it } from 'vitest';
import { GUEST_BYE, GUEST_HELLO } from './guests';

describe('おきゃくさん', () => {
  it('あいさつと帰りぎわの言葉が入っている', () => {
    expect(GUEST_HELLO.length).toBeGreaterThan(0);
    expect(GUEST_BYE.length).toBeGreaterThan(0);
    for (const t of [...GUEST_HELLO, ...GUEST_BYE]) expect(t.length).toBeLessThanOrEqual(20);
  });
});
