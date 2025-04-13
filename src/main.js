import Phaser from 'phaser'
let gameStarted = false
let nextPauseThreshold = 1

const COLS = 7
const ROWS = 14
const CELL_SIZE = 48
const GRID_HEIGHT = ROWS * CELL_SIZE
const PANEL_WIDTH = 160

const LETTER_FREQ = {
  E: 12.7, T: 9.1, A: 8.2, O: 7.5, I: 7.0, N: 6.7,
  S: 6.3, H: 6.1, R: 6.0, D: 4.3, L: 4.0, C: 2.8,
  U: 2.8, M: 2.4, W: 2.4, F: 2.2, G: 2.0, Y: 2.0,
  P: 1.9, B: 1.5, V: 1.0, K: 0.8, J: 0.2, X: 0.2,
  Q: 0.1, Z: 0.1
}

let weightedLetters = []
for (const [letter, freq] of Object.entries(LETTER_FREQ)) {
  const count = Math.round(freq * 10)
  for (let i = 0; i < count; i++) weightedLetters.push(letter)
}

let grid = []
let fallTimer = 0
const fallInterval = 500
let score = 0
let totalWordsCleared = 0
let pauseTokens = 0
let paused = false
let VALID_WORDS = new Set()
let gameOver = false

const config = {
  type: Phaser.AUTO,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: COLS * CELL_SIZE + PANEL_WIDTH,
    height: GRID_HEIGHT + 80
  },
  backgroundColor: '#121212',
  scene: {
    preload,
    create,
    update
  }
}

new Phaser.Game(config)

function preload() {
  this.load.text('wordlist', 'words.txt')
  this.load.audio('wordClear', 'word-clear.wav')
  this.load.audio('combo', 'combo.wav')
  this.load.audio('gameOver', 'game-over.wav')
  this.load.image('glow', 'glow.png')
}

function getWordScore(length) {
  if (length <= 2) return 0
  if (length <= 10) return Math.pow(3, length - 3)
  return Math.pow(3, 7) * Math.pow(4, length - 10)
}

function create() {
  const startMsg = this.add.text(config.width / 2, GRID_HEIGHT / 2, 'Press SPACE to Start', {
    fontSize: '28px', color: '#ffffff'
  }).setOrigin(0.5).setDepth(999)

  const offsetX = COLS * CELL_SIZE + 10
  this.scoreText = this.add.text(offsetX, 10, 'Score: 0', { fontSize: '16px', color: '#ffffff' }).setDepth(10)
  this.wordCountText = this.add.text(offsetX, 30, 'Words: 0', { fontSize: '16px', color: '#ffffff' }).setDepth(10)
  this.pauseTokenText = this.add.text(offsetX, 50, 'Pauses: 0', { fontSize: '16px', color: '#ffffff' }).setDepth(10)
  this.previewText = this.add.text(offsetX, 80, 'Next: ', {
    fontSize: '36px',
    color: '#ffffff',
    fontStyle: 'bold',
    shadow: { offsetX: 2, offsetY: 2, color: '#000', blur: 2, fill: true }
  }).setDepth(10).setDepth(10)
  this.gameOverText = this.add.text(config.width / 2, GRID_HEIGHT / 2, 'GAME OVER', {
    fontSize: '36px', color: '#ff3333', fontStyle: 'bold'
  }).setOrigin(0.5).setDepth(1000).setVisible(false)

  this.input.keyboard.on('keydown-SPACE', () => {
    if (gameOver) return
    if (!gameStarted) {
      gameStarted = true
      startMsg.destroy()
      this.spawnBlock()
    } else if (!paused && pauseTokens > 0) {
      paused = true
      pauseTokens--
      this.pauseTokenText.setText(`Pauses: ${pauseTokens}`);
    this.tweens.add({
      targets: this.pauseTokenText,
      scaleX: 1.5,
      scaleY: 1.5,
      duration: 150,
      yoyo: true,
      ease: 'Quad.easeInOut'
    })
    } else if (paused) {
      paused = false
    }
  })

  for (let row = 0; row < ROWS; row++) {
    grid[row] = []
    for (let col = 0; col < COLS; col++) {
      const x = col * CELL_SIZE
      const y = row * CELL_SIZE
      const cell = this.add.rectangle(x, y, CELL_SIZE - 2, CELL_SIZE - 2, 0x333333).setOrigin(0)
      grid[row][col] = { occupied: false, letter: null, rect: cell, sprite: null }
    }
  }

  this.cursors = this.input.keyboard.createCursorKeys()
  this.moveCooldown = 0

  this.input.keyboard.on('keydown-D', () => {
    console.log(grid.map(row => row.map(c => c.letter || '.').join(' ')).join('\n'))
  })

  this.input.keyboard.on('keydown-R', () => location.reload())

  const rawWords = this.cache.text.get('wordlist')
  if (rawWords) {
    VALID_WORDS = new Set(
      rawWords.split('\n').map(w => w.trim().toUpperCase()).filter(w => w.length >= 3)
    )
  }

  this.wordClearSound = this.sound.add('wordClear')
  this.comboSound = this.sound.add('combo')
  this.gameOverSound = this.sound.add('gameOver')
  this.bannerGroup = this.add.group()

  console.log('Scene created')
this.add.text(100, 100, 'Brickwords Loaded', { fontSize: '24px', color: '#00ff00' })


  this.spawnBlock = spawnBlock.bind(this)
  this.placeBlock = function () {
    const block = this.fallingBlock
    if (!block) return

    let blocked = false
    block.parts.forEach(part => {
      const { row, col, letter, sprite } = part
      if (grid[row][col].occupied) blocked = true
      grid[row][col] = {
        occupied: true,
        letter,
        rect: grid[row][col].rect,
        sprite
      }
    })

    this.fallingBlock = null
    if (blocked) {
      this.gameOverSound.play()
      this.gameOverText.setVisible(true)
      gameOver = true
      return
    }
    this.checkAndClearWords()
    this.spawnBlock()
  }.bind(this)

  this.checkAndClearWords = checkAndClearWords.bind(this)
  this.rotateBlock = rotateBlock.bind(this)
  this.settleFloatingTiles = settleFloatingTiles.bind(this)
  this.showWordBanner = showWordBanner.bind(this)
  this.scanLine = scanLine.bind(this)
  this.moveBlockDown = moveBlockDown.bind(this)
  this.tryMove = tryMove.bind(this)
}

function scanLine(getPos) {
  const wordsToClear = []
  const wordScores = []

  for (let i = 0; i < ROWS; i++) {
    let sequence = []
    for (let j = 0; j < COLS; j++) {
      const { row, col } = getPos(i, j)
      if (row < 0 || row >= ROWS || col < 0 || col >= COLS) continue
      const cell = grid[row]?.[col]
      if (cell && cell.occupied && typeof cell.letter === 'string' && /^[A-Z]$/.test(cell.letter)) {
        sequence.push({ row, col, letter: cell.letter })
      } else {
        processSequence.call(this, sequence)
        sequence = []
      }
    }
    processSequence.call(this, sequence)
  }

  function processSequence(seq) {
    for (let len = seq.length; len >= 3; len--) {
      for (let start = 0; start <= seq.length - len; start++) {
        const slice = seq.slice(start, start + len)
        const word = slice.map(t => t.letter).join('');
        if (VALID_WORDS.has(word)) {
          const score = getWordScore(word.length);
          slice.forEach(({ row, col }) => {
            const cell = grid[row][col]
            cell.rect.setFillStyle(0xffff33)
            this.tweens.add({
              targets: cell.rect,
              alpha: 0.3,
              duration: 500,
              yoyo: true,
              ease: 'Sine.easeInOut'
            })
            const scorePop = this.add.text(
              col * CELL_SIZE + CELL_SIZE / 2,
              row * CELL_SIZE + CELL_SIZE / 2,
              `+${score}`,
              {
                fontSize: '14px',
                color: '#00ff88',
                fontStyle: 'bold'
              }
            ).setOrigin(0.5).setDepth(50)
            this.tweens.add({
              targets: scorePop,
              y: '-=20',
              alpha: 0,
              duration: 600,
              ease: 'Cubic.easeOut',
              onComplete: () => scorePop.destroy()
            })
          })
           {
          wordsToClear.push(slice)
          wordScores.push(len)
          this.showWordBanner(word, slice[0].row, slice[0].col)
          return
        }
      }
    }
  }

  return { wordsToClear, wordScores }
}




function update(time, delta) {
  if (!gameStarted || paused) return

  fallTimer += delta
  if (this.moveCooldown > 0) this.moveCooldown -= delta

  const block = this.fallingBlock
  if (block && this.moveCooldown <= 0) {
    let moved = false
    const cursors = this.cursors
    const dx = cursors.left.isDown ? -1 : cursors.right.isDown ? 1 : 0

    if (dx !== 0) moved = this.tryMove(dx)
    if (cursors.down.isDown) { this.moveBlockDown(); moved = true }
    if (cursors.up.isDown && !block.rotatedThisFrame) {
      this.rotateBlock(); block.rotatedThisFrame = true
    } else if (block) block.rotatedThisFrame = false

    if (moved) this.moveCooldown = 150
  }

  if (fallTimer > fallInterval) {
    fallTimer = 0
    this.moveBlockDown()
  }
}

function tryMove(dx) {
  const block = this.fallingBlock
  if (!block) return false
  const canMove = block.parts.every(part => {
    const newCol = part.col + dx
    return newCol >= 0 && newCol < COLS && !grid[part.row][newCol].occupied
  })
  if (canMove) {
    block.parts.forEach(part => {
      part.col += dx
      this.tweens.add({ targets: part.sprite, x: part.col * CELL_SIZE + CELL_SIZE / 2, duration: 100 })
    })
    return true
  }
  return false
}


let nextLetters = []

function spawnBlock() {
  const vowels = 'AEIOU'
  const getRandomLetter = () => weightedLetters[Math.floor(Math.random() * weightedLetters.length)]

  const generateLetters = () => {
    const length = Math.random() < 0.9 ? 1 : 2
    const includeVowel = length === 2
    while (true) {
      let letters = []
      let hasVowel = false
      for (let i = 0; i < length; i++) {
        const letter = getRandomLetter()
        if (vowels.includes(letter)) hasVowel = true
        letters.push(letter)
      }
      if (!includeVowel || hasVowel) return letters
    }
  }

  const chosenLetters = nextLetters.length ? nextLetters : generateLetters()
  nextLetters = generateLetters()
  if (this.previewText) this.previewText.setText(`Next: ${nextLetters.join('')}`)

  const isVertical = Math.random() < 0.5
  const startCol = isVertical ? Math.floor(COLS / 2) : Phaser.Math.Between(0, COLS - chosenLetters.length)
  const block = { parts: [], row: 0, col: startCol, isVertical }

  for (let i = 0; i < chosenLetters.length; i++) {
    const letter = chosenLetters[i]
    const col = isVertical ? startCol : startCol + i
    const row = isVertical ? i : 0
    const x = col * CELL_SIZE + CELL_SIZE / 2
    const y = row * CELL_SIZE + CELL_SIZE / 2

    const sprite = this.add.text(x, y, letter, {
      fontSize: '36px', color: '#ffffff', fontStyle: 'bold', shadow: { offsetX: 2, offsetY: 2, color: '#000', blur: 2, fill: true }
    }).setOrigin(0.5)

    block.parts.push({ sprite, letter, row, col })
  }

  this.fallingBlock = block
}

function moveBlockDown() {
  const block = this.fallingBlock
  if (!block) return

  const willCollide = block.parts.some(part => {
    const newRow = part.row + 1
    return newRow >= ROWS || grid[newRow][part.col].occupied
  })

  if (willCollide) {
    this.placeBlock()
    return
  }

  block.parts.forEach(part => {
    part.row++
    this.tweens.add({
      targets: part.sprite,
      y: part.row * CELL_SIZE + CELL_SIZE / 2,
      duration: 100
    })
  })
}

function placeBlock() {
  const block = this.fallingBlock
  if (!block) return

  block.parts.forEach(part => {
    const { row, col, letter, sprite } = part
    grid[row][col] = {
      occupied: true,
      letter,
      rect: grid[row][col].rect,
      sprite
    }
  })

  this.fallingBlock = null
  this.checkAndClearWords()
  this.spawnBlock()
}

function rotateBlock() {
  const block = this.fallingBlock
  if (!block || block.parts.length !== 2) return

  const [a, b] = block.parts
  const orientation = block.orientation || 0

  const positions = [
    [{ row: a.row, col: a.col }, { row: a.row, col: a.col + 1 }],
    [{ row: a.row, col: a.col }, { row: a.row + 1, col: a.col }],
    [{ row: a.row, col: a.col }, { row: a.row, col: a.col - 1 }],
    [{ row: a.row, col: a.col }, { row: a.row - 1, col: a.col }],
  ]

  const next = (orientation + 1) % 4
  const nextPos = positions[next]

  const canRotate = nextPos.every(pos =>
    pos.row >= 0 && pos.row < ROWS &&
    pos.col >= 0 && pos.col < COLS &&
    !grid[pos.row][pos.col].occupied
  )

  if (!canRotate) return

  b.row = nextPos[1].row
  b.col = nextPos[1].col
  this.tweens.add({ targets: b.sprite, x: b.col * CELL_SIZE + CELL_SIZE / 2, y: b.row * CELL_SIZE + CELL_SIZE / 2, duration: 100 })
  block.orientation = next
}

function checkAndClearWords() {
  const scanned = new Set()
  const collect = (row, col) => {
    const horizontal = this.scanLine((i, j) => ({ row, col: j }))
    const vertical = this.scanLine((i, j) => ({ row: j, col }))
    return {
      wordsToClear: [...horizontal.wordsToClear, ...vertical.wordsToClear],
      wordScores: [...horizontal.wordScores, ...vertical.wordScores]
    }
  }

  let fullWordsToClear = []
  let fullScores = []

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = grid[row][col]
      if (cell.occupied && !scanned.has(`${row},${col}`)) {
        const { wordsToClear, wordScores } = collect(row, col)
        wordsToClear.flat().forEach(({ row, col }) => scanned.add(`${row},${col}`))
        fullWordsToClear.push(...wordsToClear)
        fullScores.push(...wordScores)
      }
    }
  }

  if (fullWordsToClear.length === 0) return

  this.wordClearSound.play()
  totalWordsCleared += fullWordsToClear.length
  score += fullScores.reduce((acc, len) => acc + getWordScore(len), 0)

  this.scoreText.setText(`Score: ${score}`)
  this.wordCountText.setText(`Words: ${totalWordsCleared}`)

  if (totalWordsCleared >= nextPauseThreshold) {
    pauseTokens++
    nextPauseThreshold += pauseTokens + 1
    this.pauseTokenText.setText(`Pauses: ${pauseTokens}`)
    this.comboSound.play()
  }

  for (const word of fullWordsToClear) {
    for (const { row, col } of word) {
      const cell = grid[row][col]
      if (cell?.sprite) {
        const scoreText = this.add.text(
          col * CELL_SIZE + CELL_SIZE / 2,
          row * CELL_SIZE + CELL_SIZE / 2,
          '+1',
          {
            fontSize: '16px',
            fontStyle: 'bold',
            color: '#ffcc00'
          }
        ).setOrigin(0.5).setDepth(20)

        this.tweens.add({
          targets: [cell.sprite, scoreText],
          y: '-=20',
          alpha: 0,
          scale: 1.5,
          duration: 500,
          ease: 'Cubic.easeOut',
          onComplete: () => {
            if (cell.sprite) cell.sprite.destroy()
            scoreText.destroy()
          }
        })
      }
      grid[row][col].occupied = false
      grid[row][col].letter = null
      grid[row][col].sprite = null
      grid[row][col].rect.fillColor = 0x333333
    }
  }

  this.settleFloatingTiles()
}


function settleFloatingTiles() {
  let changed = true
  while (changed) {
    changed = false
    for (let col = 0; col < COLS; col++) {
      for (let row = ROWS - 2; row >= 0; row--) {
        const current = grid[row][col]
        const below = grid[row + 1][col]
        if (current.occupied && !below.occupied) {
          below.letter = current.letter
          below.occupied = true
          below.sprite = current.sprite
          below.rect.fillColor = 0x5555ff
          this.tweens.add({ targets: below.sprite, y: (row + 1) * CELL_SIZE + CELL_SIZE / 2, duration: 100 })

          current.occupied = false
          current.letter = null
          current.sprite = null
          current.rect.fillColor = 0x333333

          changed = true
        }
      }
    }
  }
}

function triggerJuicyEffects(scene, word) {
  scene.cameras.main.shake(200, 0.01)

  if (scene.textures.exists('glow')) {
    const letterCount = word.length
    for (let i = 0; i < letterCount; i++) {
      const x = Phaser.Math.Between(CELL_SIZE, COLS * CELL_SIZE - CELL_SIZE)
      const y = Phaser.Math.Between(CELL_SIZE, ROWS * CELL_SIZE - CELL_SIZE)
      const particles = scene.add.particles('glow')
      const emitter = particles.createEmitter({
        x, y,
        speed: { min: -60, max: 60 },
        scale: { start: 0.3, end: 0 },
        blendMode: 'ADD',
        lifespan: 400,
        quantity: Phaser.Math.Clamp(letterCount, 10, 30)
      })
      scene.time.delayedCall(500, () => {
        emitter.stop()
        particles.destroy()
      })
    }
  }
}


function showWordBanner(word, row, col) {
  const banner = this.add.text(
    col * CELL_SIZE + CELL_SIZE / 2,
    row * CELL_SIZE,
    word,
    {
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#ffff00',
      backgroundColor: '#000000aa',
    }
  ).setOrigin(0.5).setDepth(20)

  this.bannerGroup.add(banner);
  triggerJuicyEffects(this, word)
  this.tweens.add({
    targets: banner,
    y: banner.y - 50,
    alpha: 0,
    duration: 1000,
    onComplete: () => banner.destroy()
  })
}
