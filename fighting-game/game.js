"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

const GROUND_Y = 420;
const GRAVITY = 2200;
const MOVE_SPEED = 260;
const JUMP_SPEED = 780;
const STAGE_LEFT = 40;
const STAGE_RIGHT = W - 40;
const ROUND_TIME = 99;
const ROUNDS_TO_WIN = 2;

const KEYS_P1 = { left: "a", right: "d", up: "w", down: "s", punch: "f", kick: "g" };
const KEYS_P2 = { left: "arrowleft", right: "arrowright", up: "arrowup", down: "arrowdown", punch: "k", kick: "l" };

const held = new Set();
const pressedOnce = new Set();

window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (!held.has(k)) pressedOnce.add(k);
  held.add(k);
  if (["arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(k)) e.preventDefault();
});
window.addEventListener("keyup", (e) => {
  held.delete(e.key.toLowerCase());
});

function isDown(k) {
  return held.has(k);
}
function wasPressed(k) {
  return pressedOnce.has(k);
}

class Fighter {
  constructor(name, color, x, facing, keys, isCPU) {
    this.name = name;
    this.color = color;
    this.x = x;
    this.y = 0; // height above ground
    this.vx = 0;
    this.vy = 0;
    this.facing = facing;
    this.keys = keys;
    this.isCPU = isCPU;
    this.width = 46;
    this.standHeight = 120;
    this.crouchHeight = 82;
    this.health = 100;
    this.maxHealth = 100;
    this.state = "idle"; // idle, walk, crouch, jump, punch, kick, special, hitstun, block, ko
    this.stateTimer = 0;
    this.attackHasHit = false;
    this.projectileCooldown = 0;
    this.motionStep = 0; // 0=none 1=down pressed 2=down+forward pressed
    this.motionTimer = 0;
    this.blocking = false;
    this.wins = 0;
  }

  get grounded() {
    return this.y <= 0;
  }

  currentHeight() {
    return this.state === "crouch" ? this.crouchHeight : this.standHeight;
  }

  hurtBox() {
    const h = this.currentHeight();
    return { x: this.x - this.width / 2, y: GROUND_Y - this.y - h, w: this.width, h: h };
  }

  attackHitbox() {
    if (this.state !== "punch" && this.state !== "kick") return null;
    const def = ATTACKS[this.state];
    if (this.stateTimer < def.startup || this.stateTimer >= def.startup + def.active) return null;
    const h = this.currentHeight();
    const reach = def.reach;
    const boxW = 34;
    const bx = this.facing === 1 ? this.x + this.width / 2 : this.x - this.width / 2 - reach;
    const by = GROUND_Y - this.y - h * (this.state === "kick" ? 0.55 : 0.7);
    return { x: bx, y: by, w: reach + boxW - 34, h: 24, dmg: def.dmg, kb: def.kb, hitstun: def.hitstun };
  }

  startAttack(kind) {
    if (this.state === "hitstun" || this.state === "ko") return;
    if (this.state === "punch" || this.state === "kick" || this.state === "special") return;
    this.state = kind;
    this.stateTimer = 0;
    this.attackHasHit = false;
  }

  fireSpecial() {
    if (this.projectileCooldown > 0) return;
    this.state = "special";
    this.stateTimer = 0;
    this.attackHasHit = false;
    this.projectileCooldown = 1.1;
  }

  takeHit(dmg, kb, hitstun, blocked) {
    if (blocked) {
      this.health = Math.max(0, this.health - Math.ceil(dmg * 0.15));
      this.vx = -this.facing * kb * 0.4;
      this.state = "block";
      this.stateTimer = 0;
    } else {
      this.health = Math.max(0, this.health - dmg);
      this.vx = -this.facing * kb;
      this.state = this.health <= 0 ? "ko" : "hitstun";
      this.stateTimer = 0;
    }
    if (this.state === "hitstun") this.hitstunLen = hitstun;
  }

  update(dt, opponent) {
    if (this.state !== "ko") {
      this.facing = opponent.x > this.x ? 1 : -1;
    }

    const k = this.keys;
    const left = this.isCPU ? this._ai.left : isDown(k.left);
    const right = this.isCPU ? this._ai.right : isDown(k.right);
    const up = this.isCPU ? this._ai.up : wasPressed(k.up);
    const down = this.isCPU ? this._ai.down : isDown(k.down);
    const punch = this.isCPU ? this._ai.punch : wasPressed(k.punch);
    const kick = this.isCPU ? this._ai.kick : wasPressed(k.kick);

    const backKey = this.facing === 1 ? left : right;
    const fwdKey = this.facing === 1 ? right : left;

    this.blocking = this.grounded && backKey && (this.state === "idle" || this.state === "walk" || this.state === "crouch" || this.state === "block");

    if (this.projectileCooldown > 0) this.projectileCooldown -= dt;

    // motion input for fireball: down -> forward -> punch
    if (down) {
      this.motionStep = 1;
      this.motionTimer = 0.35;
    } else if (this.motionStep === 1 && fwdKey) {
      this.motionStep = 2;
      this.motionTimer = 0.35;
    }
    if (this.motionTimer > 0) {
      this.motionTimer -= dt;
    } else {
      this.motionStep = 0;
    }

    switch (this.state) {
      case "idle":
      case "walk":
      case "block": {
        let vx = 0;
        if (left) vx -= MOVE_SPEED;
        if (right) vx += MOVE_SPEED;
        this.vx = vx;
        if (down) {
          this.state = "crouch";
        } else if (up && this.grounded) {
          this.vy = JUMP_SPEED;
          this.state = "jump";
        } else if (punch && this.motionStep === 2) {
          this.fireSpecial();
        } else if (punch) {
          this.startAttack("punch");
        } else if (kick) {
          this.startAttack("kick");
        } else {
          this.state = vx !== 0 && this.grounded ? "walk" : this.blocking ? "block" : "idle";
        }
        break;
      }
      case "crouch": {
        this.vx = 0;
        if (!down) {
          this.state = "idle";
        } else if (punch && this.motionStep === 2) {
          this.fireSpecial();
        } else if (punch) {
          this.startAttack("punch");
        } else if (kick) {
          this.startAttack("kick");
        }
        break;
      }
      case "jump": {
        if (left) this.vx = -MOVE_SPEED * 0.85;
        else if (right) this.vx = MOVE_SPEED * 0.85;
        if (punch) this.startAttack("punch");
        else if (kick) this.startAttack("kick");
        break;
      }
      case "punch":
      case "kick":
      case "special": {
        this.vx *= 1 - Math.min(1, dt * 10);
        const def = ATTACKS[this.state];
        this.stateTimer += dt;
        if (this.state === "special" && this.stateTimer >= def.startup && !this.attackHasHit) {
          this.attackHasHit = true;
          projectiles.push(new Projectile(this));
        }
        if (this.stateTimer >= def.startup + def.active + def.recovery) {
          this.state = this.grounded ? "idle" : "jump";
          this.stateTimer = 0;
        }
        break;
      }
      case "hitstun": {
        this.vx *= 1 - Math.min(1, dt * 8);
        this.stateTimer += dt;
        if (this.stateTimer >= this.hitstunLen) {
          this.state = this.grounded ? "idle" : "jump";
          this.stateTimer = 0;
        }
        break;
      }
      case "ko": {
        this.vx *= 1 - Math.min(1, dt * 6);
        break;
      }
    }

    if (this.state === "block") {
      this.stateTimer += dt;
      if (this.stateTimer > 0.25 && !this.blocking) {
        this.state = "idle";
        this.stateTimer = 0;
      }
    }

    // physics
    if (!this.grounded || this.vy > 0) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        if (this.state === "jump") {
          this.state = "idle";
          this.stateTimer = 0;
        }
      }
    }

    this.x += this.vx * dt;
    this.x = Math.max(STAGE_LEFT + this.width / 2, Math.min(STAGE_RIGHT - this.width / 2, this.x));
  }

  draw() {
    const h = this.currentHeight();
    const top = GROUND_Y - this.y - h;
    const cx = this.x;
    ctx.save();

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(cx, GROUND_Y + 6, this.width * 0.6, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    const flash = this.state === "hitstun" && Math.floor(this.stateTimer * 20) % 2 === 0;
    ctx.fillStyle = flash ? "#fff" : this.color;

    // legs
    const legH = h * 0.42;
    ctx.fillRect(cx - this.width / 2 + 6, top + h - legH, this.width - 12, legH);

    // torso
    const torsoH = h * 0.42;
    ctx.fillRect(cx - this.width / 2, top + h * 0.16, this.width, torsoH);

    // head
    ctx.beginPath();
    ctx.arc(cx, top + h * 0.09, h * 0.09, 0, Math.PI * 2);
    ctx.fill();

    // arm / attack indicator
    if (this.state === "punch" || this.state === "kick" || this.state === "special") {
      const box = this.attackHitbox();
      ctx.fillStyle = flash ? "#fff" : "#ffe066";
      if (box) {
        ctx.fillRect(box.x, box.y, box.w, box.h);
      } else {
        const armLen = 18;
        const ax = this.facing === 1 ? cx + this.width / 2 : cx - this.width / 2 - armLen;
        ctx.fillRect(ax, top + h * 0.28, armLen, 10);
      }
    }

    // block guard indicator
    if (this.state === "block") {
      ctx.fillStyle = "rgba(140,200,255,0.85)";
      const gx = this.facing === 1 ? cx + this.width / 2 - 6 : cx - this.width / 2 - 10;
      ctx.fillRect(gx, top + h * 0.2, 16, h * 0.35);
    }

    ctx.restore();

    // name tag
    ctx.fillStyle = "#fff";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(this.name, cx, GROUND_Y + 20);
  }
}

const ATTACKS = {
  punch: { startup: 0.07, active: 0.07, recovery: 0.15, dmg: 6, kb: 90, hitstun: 0.35, reach: 26 },
  kick: { startup: 0.1, active: 0.08, recovery: 0.22, dmg: 9, kb: 140, hitstun: 0.45, reach: 34 },
  special: { startup: 0.28, active: 0.05, recovery: 0.3, dmg: 13, kb: 60, hitstun: 0.5, reach: 0 },
};

class Projectile {
  constructor(owner) {
    this.owner = owner;
    this.x = owner.x + owner.facing * owner.width * 0.7;
    this.y = GROUND_Y - owner.y - owner.currentHeight() * 0.55;
    this.facing = owner.facing;
    this.speed = 480;
    this.dead = false;
    this.w = 24;
    this.h = 16;
  }
  update(dt) {
    this.x += this.speed * this.facing * dt;
    if (this.x < STAGE_LEFT - 30 || this.x > STAGE_RIGHT + 30) this.dead = true;
  }
  hitbox() {
    return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h };
  }
  draw() {
    ctx.fillStyle = "#ff9f1c";
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, this.w / 2, this.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

let projectiles = [];
let p1, p2;
let phase = "title"; // title, ready, fight, roundend, matchend
let phaseTimer = 0;
let roundTimeLeft = ROUND_TIME;
let mode = "cpu"; // "cpu" or "2p"
let message = "";
let roundNumber = 1;

function newFighters() {
  p1 = new Fighter("KAZE", "#3a86ff", 260, 1, KEYS_P1, false);
  p2 = new Fighter("HOMURA", "#ff4d4d", W - 260, -1, KEYS_P2, mode === "cpu");
  p1.wins = p1.wins || 0;
  p2.wins = p2.wins || 0;
  projectiles = [];
  roundTimeLeft = ROUND_TIME;
}

function startMatch() {
  if (p1) p1.wins = 0;
  if (p2) p2.wins = 0;
  roundNumber = 1;
  newFighters();
  phase = "ready";
  phaseTimer = 0;
}

function updateAI(dt) {
  if (!p2.isCPU) return;
  const ai = p2._ai || (p2._ai = { left: false, right: false, up: false, down: false, punch: false, kick: false });
  ai.left = ai.right = ai.up = ai.down = ai.punch = ai.kick = false;
  if (p1.state === "ko" || p2.state === "ko") return;
  const dist = Math.abs(p1.x - p2.x);
  const towardsP1 = p1.x < p2.x ? "left" : "right";

  if (dist > 90) {
    ai[towardsP1] = true;
    if (Math.random() < 0.002) ai.up = true;
  } else if (dist < 55) {
    if (Math.random() < 0.02) ai[towardsP1 === "left" ? "right" : "left"] = true;
    if (Math.random() < 0.045) ai.punch = true;
    else if (Math.random() < 0.03) ai.kick = true;
    else if (Math.random() < 0.01) ai.down = true;
  } else {
    if (Math.random() < 0.02) ai.punch = true;
    if (Math.random() < 0.006) ai.down = true;
  }
}

function checkAttack(attacker, defender) {
  const box = attacker.attackHitbox();
  if (!box || attacker.attackHasHit) return;
  if (defender.state === "ko") return;
  const hb = defender.hurtBox();
  if (rectsOverlap(box, hb)) {
    attacker.attackHasHit = true;
    defender.takeHit(box.dmg, box.kb, box.hitstun, defender.blocking);
  }
}

function separate(a, b) {
  const minDist = (a.width + b.width) / 2 - 4;
  const dx = b.x - a.x;
  if (Math.abs(dx) < minDist && a.grounded && b.grounded && a.state !== "ko" && b.state !== "ko") {
    const push = (minDist - Math.abs(dx)) / 2;
    const dir = dx >= 0 ? 1 : -1;
    a.x -= dir * push;
    b.x += dir * push;
  }
}

function loop(ts) {
  requestAnimationFrame(loop);
  if (!loop.last) loop.last = ts;
  let dt = (ts - loop.last) / 1000;
  loop.last = ts;
  dt = Math.min(dt, 0.033);

  step(dt);
  render();
  pressedOnce.clear();
}

function step(dt) {
  if (phase === "title") {
    if (wasPressed("1")) {
      mode = "cpu";
      startMatch();
    } else if (wasPressed("2")) {
      mode = "2p";
      startMatch();
    }
    return;
  }

  if (phase === "ready") {
    phaseTimer += dt;
    if (phaseTimer > 1.2) {
      phase = "fight";
      phaseTimer = 0;
    }
    return;
  }

  if (phase === "fight") {
    updateAI(dt);
    p1.update(dt, p2);
    p2.update(dt, p1);
    separate(p1, p2);

    checkAttack(p1, p2);
    checkAttack(p2, p1);

    projectiles.forEach((pr) => pr.update(dt));
    projectiles.forEach((pr) => {
      if (pr.dead) return;
      const target = pr.owner === p1 ? p2 : p1;
      if (target.state === "ko") return;
      if (rectsOverlap(pr.hitbox(), target.hurtBox())) {
        target.takeHit(ATTACKS.special.dmg, ATTACKS.special.kb, ATTACKS.special.hitstun, target.blocking);
        pr.dead = true;
      }
    });
    projectiles = projectiles.filter((pr) => !pr.dead);

    roundTimeLeft -= dt;
    let ended = false;
    if (p1.health <= 0 || p2.health <= 0) {
      ended = true;
      if (p1.health <= 0 && p2.health <= 0) message = "DOUBLE K.O.";
      else if (p1.health <= 0) {
        message = `${p2.name} WINS!`;
        p2.wins++;
      } else {
        message = `${p1.name} WINS!`;
        p1.wins++;
      }
    } else if (roundTimeLeft <= 0) {
      roundTimeLeft = 0;
      ended = true;
      if (p1.health > p2.health) {
        message = `${p1.name} WINS! (TIME OVER)`;
        p1.wins++;
      } else if (p2.health > p1.health) {
        message = `${p2.name} WINS! (TIME OVER)`;
        p2.wins++;
      } else {
        message = "DRAW GAME";
      }
    }
    if (ended) {
      phase = "roundend";
      phaseTimer = 0;
    }
    return;
  }

  if (phase === "roundend") {
    phaseTimer += dt;
    if (phaseTimer > 2) {
      if (p1.wins >= ROUNDS_TO_WIN || p2.wins >= ROUNDS_TO_WIN) {
        phase = "matchend";
        phaseTimer = 0;
      } else {
        roundNumber++;
        const w1 = p1.wins,
          w2 = p2.wins;
        newFighters();
        p1.wins = w1;
        p2.wins = w2;
        phase = "ready";
        phaseTimer = 0;
      }
    }
    return;
  }

  if (phase === "matchend") {
    phaseTimer += dt;
    if (phaseTimer > 1.5 && wasPressed("enter")) {
      phase = "title";
    }
    return;
  }
}

function drawHealthBar(x, y, w, fighter, flip) {
  const pct = Math.max(0, fighter.health / fighter.maxHealth);
  ctx.fillStyle = "#222";
  ctx.fillRect(x, y, w, 18);
  ctx.fillStyle = pct > 0.35 ? "#3ddc84" : "#ff3b3b";
  if (flip) {
    ctx.fillRect(x + w * (1 - pct), y, w * pct, 18);
  } else {
    ctx.fillRect(x, y, w * pct, 18);
  }
  ctx.strokeStyle = "#fff";
  ctx.strokeRect(x, y, w, 18);

  for (let i = 0; i < ROUNDS_TO_WIN; i++) {
    const wx = flip ? x + w - 14 - i * 16 : x + i * 16;
    ctx.fillStyle = fighter.wins > i ? "#ffd60a" : "#555";
    ctx.beginPath();
    ctx.arc(wx, y - 10, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function render() {
  // background
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#1b2735");
  grad.addColorStop(1, "#0d1520");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#2b3a4a";
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  ctx.fillStyle = "#324357";
  ctx.fillRect(0, GROUND_Y, W, 6);

  if (phase === "title") {
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "bold 48px monospace";
    ctx.fillText("KAZE vs HOMURA", W / 2, 150);
    ctx.font = "16px monospace";
    ctx.fillText("対戦型格闘ゲーム プロトタイプ", W / 2, 185);

    ctx.font = "20px monospace";
    ctx.fillText("[1] 1人プレイ (CPU対戦)", W / 2, 260);
    ctx.fillText("[2] 2人対戦 (ローカル)", W / 2, 295);

    ctx.font = "14px monospace";
    ctx.fillText("P1: A/D 移動  W ジャンプ  S しゃがみ  F パンチ  G キック", W / 2, 360);
    ctx.fillText("P2: ←/→ 移動  ↑ ジャンプ  ↓ しゃがみ  K パンチ  L キック", W / 2, 382);
    ctx.fillText("しゃがみ→前→パンチ で必殺技（波動拳風の飛び道具）", W / 2, 404);
    ctx.fillText("相手から見て後ろ方向を入力するとブロック", W / 2, 426);
    return;
  }

  drawHealthBar(30, 30, 340, p1, false);
  drawHealthBar(W - 370, 30, 340, p2, true);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 28px monospace";
  ctx.textAlign = "center";
  ctx.fillText(String(Math.ceil(roundTimeLeft)), W / 2, 50);
  ctx.font = "12px monospace";
  ctx.fillText(`ROUND ${roundNumber}`, W / 2, 68);

  projectiles.forEach((pr) => pr.draw());
  p1.draw();
  p2.draw();

  if (phase === "ready") {
    ctx.fillStyle = "#fff";
    ctx.font = "bold 40px monospace";
    ctx.fillText(`ROUND ${roundNumber}`, W / 2, H / 2 - 10);
    ctx.font = "bold 56px monospace";
    ctx.fillStyle = "#ffd60a";
    ctx.fillText("READY?", W / 2, H / 2 + 50);
  } else if (phase === "roundend") {
    ctx.fillStyle = "#ffd60a";
    ctx.font = "bold 40px monospace";
    ctx.fillText(message, W / 2, H / 2);
  } else if (phase === "matchend") {
    const winner = p1.wins > p2.wins ? p1.name : p2.name;
    ctx.fillStyle = "#ffd60a";
    ctx.font = "bold 44px monospace";
    ctx.fillText(`${winner} WINS THE MATCH!`, W / 2, H / 2 - 10);
    ctx.font = "18px monospace";
    ctx.fillStyle = "#fff";
    ctx.fillText("Press ENTER to return to title", W / 2, H / 2 + 40);
  }

  window.__debug = {
    phase,
    roundNumber,
    p1: p1 && { health: p1.health, x: p1.x, state: p1.state, wins: p1.wins, motionStep: p1.motionStep, facing: p1.facing },
    p2: p2 && { health: p2.health, x: p2.x, state: p2.state, wins: p2.wins, motionStep: p2.motionStep, facing: p2.facing },
  };
}

requestAnimationFrame(loop);
