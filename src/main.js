import Phaser from 'phaser'

const config = {
  type: Phaser.AUTO,
  width: 360,
  height: 640,
  backgroundColor: '#1a1a1a',
  parent: 'game',
  scene: {
    preload,
    create,
    update,
  },
}

const game = new Phaser.Game(config)

function preload() {
  // we'll add assets here later
}

function create() {
  this.add.text(100, 300, 'Tetris Word Game', {
    fontSize: '20px',
    fill: '#fff',
  })
}

function update() {
  // game logic will go here
}
