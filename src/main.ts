import Phaser from 'phaser';
import { RoomScene } from './scenes/RoomScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#2b2430',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: '100%',
    height: '100%',
  },
  render: {
    antialias: true,
    roundPixels: false,
  },
  scene: [RoomScene],
});
