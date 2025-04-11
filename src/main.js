// Brickwords - A Scrabble + Tetris mashup built in Phaser 3
import Phaser from 'phaser'

const COLS = 8
const ROWS = 12
const CELL_SIZE = 32

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
  for (let i = 0; i < count; i++) {
    weightedLetters.push(letter)
  }
}

let grid = []
let fallTimer = 0
const fallInterval = 500
let score = 0
let totalWordsCleared = 0
let pauseTokens = 0
let paused = false
let VALID_WORDS = new Set()

const config = {
  type: Phaser.AUTO,
  width: COLS * CELL_SIZE,
  height: ROWS * CELL_SIZE,
  backgroundColor: '#1a1a1a',
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
}

function getWordScore(length) {
  if (length <= 2) return 0
  if (length <= 10) return Math.pow(3, length - 3)
  return Math.pow(3, 7) * Math.pow(4, length - 10)
}


function create() {
  for (let row = 0; row < ROWS; row++) {
    grid[row] = []
    for (let col = 0; col < COLS; col++) {
      const x = col * CELL_SIZE
      const y = row * CELL_SIZE
      const cell = this.add.rectangle(x, y, CELL_SIZE - 2, CELL_SIZE - 2, 0x333333).setOrigin(0)
      grid[row][col] = { occupied: false, letter: null, rect: cell, sprite: null }
    }
  }

  this.scoreText = this.add.text(10, 10, 'Score: 0', { fontSize: '16px', color: '#ffffff' }).setDepth(10)
  this.wordCountText = this.add.text(10, 30, 'Words: 0', { fontSize: '16px', color: '#ffffff' }).setDepth(10)
  this.pauseTokenText = this.add.text(10, 50, 'Pauses: 0', { fontSize: '16px', color: '#ffffff' }).setDepth(10)

  this.cursors = this.input.keyboard.createCursorKeys()
  this.moveCooldown = 0

  const rawWords = this.cache.text.get('wordlist')
  if (rawWords) {
    VALID_WORDS = new Set(
      rawWords
        .split('\n')
        .map(w => w.trim().toUpperCase())
        .filter(w => w.length >= 3)
    )
  }

  this.wordClearSound = this.sound.add('wordClear')
  this.comboSound = this.sound.add('combo')
  this.bannerGroup = this.add.group()

  this.input.keyboard.on('keydown-SPACE', () => {
    if (pauseTokens > 0) {
      paused = !paused
      pauseTokens--
      this.pauseTokenText.setText(`Pauses: ${pauseTokens}`)
    }
  })

  this.spawnBlock = spawnBlock.bind(this)
  this.placeBlock = placeBlock.bind(this)
  this.checkAndClearWords = checkAndClearWords.bind(this)
  this.rotateBlock = rotateBlock.bind(this)
  this.settleFloatingTiles = settleFloatingTiles.bind(this)
  this.showWordBanner = showWordBanner.bind(this)
  this.scanLine = scanLine.bind(this)
  this.moveBlockDown = moveBlockDown.bind(this)

  this.spawnBlock()
}

function update(time, delta) {
  if (paused) return
  fallTimer += delta
  if (this.moveCooldown > 0) this.moveCooldown -= delta

  const block = this.fallingBlock
  const cursors = this.cursors

  if (block && this.moveCooldown <= 0) {
    let moved = false
    const dx = cursors.left.isDown ? -1 : cursors.right.isDown ? 1 : 0

    if (dx !== 0) {
      const canMove = block.parts.every(part => {
        const newCol = part.col + dx
        return newCol >= 0 && newCol < COLS && !grid[part.row][newCol].occupied
      })
      if (canMove) {
        block.parts.forEach(part => {
          part.col += dx
          this.tweens.add({ targets: part.sprite, x: part.col * CELL_SIZE + CELL_SIZE / 2, duration: 100 })
        })
        moved = true
      }
    }

    if (cursors.down.isDown) {
      this.moveBlockDown()
      moved = true
    }

    if (cursors.up.isDown && !block.rotatedThisFrame) {
      this.rotateBlock()
      block.rotatedThisFrame = true
    } else if (block) {
      block.rotatedThisFrame = false
    }

    if (moved) this.moveCooldown = 150
  }

  if (fallTimer > fallInterval) {
    fallTimer = 0
    this.moveBlockDown()
  }
}

function scanLine(getPos) {
  const wordsToClear = []
  const wordScores = []

  for (let i = 0; i < ROWS; i++) {
    let sequence = []
    for (let j = 0; j < COLS; j++) {
      const { row, col } = getPos(i, j)
      if (row >= ROWS || col >= COLS || row < 0 || col < 0) continue
      const cell = grid[row]?.[col]
      if (cell && cell.occupied) {
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
        const word = slice.map(t => t.letter).join('')
        if (VALID_WORDS.has(word)) {
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


function spawnBlock() {
  const vowels = 'AEIOU'
  const length = Math.random() < 0.9 ? 1 : 2
  const isVertical = Math.random() < 0.5
  const includeVowel = length === 2
  let chosenLetters = []

  while (true) {
    chosenLetters = []
    let hasVowel = false
    for (let i = 0; i < length; i++) {
      const letter = weightedLetters[Math.floor(Math.random() * weightedLetters.length)]
      if (vowels.includes(letter)) hasVowel = true
      chosenLetters.push(letter)
    }
    if (!includeVowel || hasVowel) break
  }

  const startCol = isVertical ? Math.floor(COLS / 2) : Phaser.Math.Between(0, COLS - length)
  const block = { parts: [], row: 0, col: startCol, isVertical }

  for (let i = 0; i < length; i++) {
    const letter = chosenLetters[i]
    const col = isVertical ? startCol : startCol + i
    const row = isVertical ? i : 0
    const x = col * CELL_SIZE + CELL_SIZE / 2
    const y = row * CELL_SIZE + CELL_SIZE / 2

    const sprite = this.add.text(x, y, letter, {
      fontSize: '24px', color: '#ffffff', fontStyle: 'bold'
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
  const horizontal = this.scanLine((i, j) => ({ row: i, col: j }))
  const vertical = this.scanLine((i, j) => ({ row: j, col: i }))

  const wordsToClear = [...horizontal.wordsToClear, ...vertical.wordsToClear]
  const wordScores = [...horizontal.wordScores, ...vertical.wordScores]

  if (wordsToClear.length === 0) return

  this.wordClearSound.play()
  totalWordsCleared += wordsToClear.length
  score += wordScores.reduce((acc, len) => acc + getWordScore(len), 0)

  this.scoreText.setText(`Score: ${score}`)
  this.wordCountText.setText(`Words: ${totalWordsCleared}`)

  if (Math.floor(totalWordsCleared / 5) > pauseTokens) {
    pauseTokens++
    this.pauseTokenText.setText(`Pauses: ${pauseTokens}`)
    this.comboSound.play()
  }

  for (const word of wordsToClear) {
    for (const { row, col } of word) {
      const cell = grid[row][col]
      if (cell?.sprite) {
        this.tweens.add({
          targets: cell.sprite,
          scale: 1.5,
          alpha: 0,
          duration: 300,
          onComplete: () => cell.sprite.destroy()
        })
      }
      grid[row][col] = {
        ...grid[row][col],
        occupied: false,
        letter: null,
        sprite: null
      }
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

  this.bannerGroup.add(banner)
  this.tweens.add({
    targets: banner,
    y: banner.y - 50,
    alpha: 0,
    duration: 1000,
    onComplete: () => banner.destroy()
  })
}
