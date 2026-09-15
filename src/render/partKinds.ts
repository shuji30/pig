/**
 * アバター・ペットに使う「立体の部品」の種類。
 *
 * 中身は `render/parts.ts` にあるが、あちらは Phaser を読み込むので
 * テスト（node 上で DOM 無しに動く）からは import できない。
 * 名前だけをここに置いて、焼いたファイルとの突き合わせをテストできるようにしている
 */
export const PART_KINDS = ['ball', 'pill', 'slab', 'frustum'] as const;
export type PartKind = (typeof PART_KINDS)[number];

export function partKey(kind: PartKind): string {
  return `part:${kind}`;
}
