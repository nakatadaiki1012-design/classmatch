"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

const GROUND_Y = 420;
const GRAVITY = 2200;
const JUMP_SPEED = 780;
const STAGE_LEFT = 40;
const STAGE_RIGHT = W - 40;
const ROUND_TIME = 99;
const ROUNDS_TO_WIN = 2;
const STAND_H = 120;
const CROUCH_H = 82;

const KEYS_P1 = { left: "a", right: "d", up: "w", down: "s", punch: "f", kick: "g" };
const KEYS_P2 = { left: "arrowleft", right: "arrowright", up: "arrowup", down: "arrowdown", punch: "k", kick: "l" };

const NORMALS = {
  punch: { startup: 0.07, active: 0.07, recovery: 0.15, dmg: 6, kb: 90, hitstun: 0.32, reach: 26 },
  kick: { startup: 0.1, active: 0.08, recovery: 0.22, dmg: 9, kb: 140, hitstun: 0.42, reach: 34 },
};

// ---------- input ----------
const held = new Set();
const pressedOnce = new Set();

window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (!held.has(k)) pressedOnce.add(k);
  held.add(k);
  if (["arrowleft", "arrowright", "arrowup", "arrowdown", " ", "enter"].includes(k)) e.preventDefault();
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

function numpadDir(down, fwd, back) {
  if (down && fwd) return 3;
  if (down && back) return 1;
  if (down) return 2;
  if (fwd) return 6;
  if (back) return 4;
  return 5;
}

// ---------- particles / fx ----------
let particles = [];
let gameTime = 0;
const shake = { mag: 0, timer: 0 };

function triggerShake(mag, dur) {
  shake.mag = Math.max(shake.mag, mag);
  shake.timer = Math.max(shake.timer, dur);
}

function spawnHitSpark(x, y, color, big) {
  const n = big ? 14 : 8;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
    const spd = (big ? 260 : 160) + Math.random() * 120;
    particles.push({
      x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      life: 0.22 + Math.random() * 0.1, maxLife: 0.3, color, size: big ? 4 : 2.6, grav: 200, kind: "spark",
    });
  }
  particles.push({ x, y, vx: 0, vy: 0, life: 0.14, maxLife: 0.14, color: "#fff", size: big ? 30 : 18, grav: 0, kind: "flash" });
}

function spawnDust(x, y) {
  for (let i = 0; i < 3; i++) {
    particles.push({
      x: x + (Math.random() - 0.5) * 10, y, vx: (Math.random() - 0.5) * 40, vy: -30 - Math.random() * 30,
      life: 0.35, maxLife: 0.35, color: "rgba(210,200,180,0.8)", size: 5 + Math.random() * 3, grav: 260, kind: "dust",
    });
  }
}

function updateParticles(dt) {
  particles.forEach((p) => {
    p.vy += p.grav * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  });
  particles = particles.filter((p) => p.life > 0);
}

function drawParticles() {
  particles.forEach((p) => {
    const t = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = t;
    if (p.kind === "flash") {
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
      grad.addColorStop(0, p.color);
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.globalAlpha = 1;
}

// ---------- projectiles ----------
class Projectile {
  constructor(owner, mv, offsetY = 0) {
    this.owner = owner;
    this.mv = mv;
    this.x = owner.x + owner.facing * (owner.width * 0.6 + 10);
    this.y = GROUND_Y - owner.y - owner.currentHeight() * 0.58 + offsetY;
    this.facing = owner.facing;
    this.speed = mv.speed;
    this.dead = false;
    this.w = mv.big ? 34 : 22;
    this.h = mv.big ? 24 : 15;
    this.spin = 0;
  }
  update(dt) {
    this.x += this.speed * this.facing * dt;
    this.spin += dt * 20;
    if (Math.random() < 0.6) {
      particles.push({ x: this.x - this.facing * this.w * 0.4, y: this.y + (Math.random() - 0.5) * 6, vx: -this.facing * 40, vy: (Math.random() - 0.5) * 20, life: 0.18, maxLife: 0.18, color: this.owner.def.accent, size: 3, grav: 0, kind: "spark" });
    }
    if (this.x < STAGE_LEFT - 40 || this.x > STAGE_RIGHT + 40) this.dead = true;
  }
  hitbox() {
    return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h, dmg: this.mv.dmg, kb: this.mv.kb, hitstun: this.mv.hitstun };
  }
  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.spin);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, this.w / 2);
    grad.addColorStop(0, "#fff");
    grad.addColorStop(0.4, this.owner.def.accent);
    grad.addColorStop(1, this.owner.def.color);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, this.w / 2, this.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ---------- fighter ----------
class Fighter {
  constructor(charKey, x, facing, keys, isCPU) {
    this.def = CHARACTERS[charKey];
    this.x = x;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.facing = facing;
    this.keys = keys;
    this.isCPU = isCPU;
    this.width = this.def.width;
    this.health = this.def.health;
    this.maxHealth = this.def.health;
    this.displayHealth = this.def.health;
    this.state = "idle";
    this.stateTimer = 0;
    this.attackHasHit = false;
    this.activeMove = null;
    this.meter = 0;
    this.wins = 0;
    this.comboCount = 0;
    this.comboPopupTimer = 0;
    this.walkPhase = 0;
    this.trail = [];
    this.dustTimer = 0;
    this.throwAttempt = false;
    this.moveCooldowns = {};
    this.hitstunLen = 0;
    this.hitFlash = 0;
    this.motionProgress = {};
    Object.keys(MOTION).forEach((k) => (this.motionProgress[k] = { step: 0, timer: 0, ready: false, readyTimer: 0 }));
    this._lastDir = 5;
    this.chargeBackTime = 0;
    this.chargeReady = false;
    this.chargeReadyTimer = 0;
    this._ai = { left: false, right: false, up: false, down: false, punch: false, kick: false };
  }

  get grounded() {
    return this.y <= 0;
  }
  currentHeight() {
    return this.state === "crouch" ? CROUCH_H : STAND_H;
  }
  get invulnerable() {
    if (this.state !== "special" || !this.activeMove) return false;
    return !!this.activeMove.invuln && this.stateTimer < this.activeMove.startup + this.activeMove.active;
  }
  hurtBox() {
    const h = this.currentHeight();
    return { x: this.x - this.width / 2, y: GROUND_Y - this.y - h, w: this.width, h };
  }
  cooldownReady(key, dur) {
    if ((this.moveCooldowns[key] || 0) > 0) return false;
    this.moveCooldowns[key] = dur;
    return true;
  }

  attackHitbox() {
    if (this.state !== "punch" && this.state !== "kick") return null;
    const def = NORMALS[this.state];
    if (this.stateTimer < def.startup || this.stateTimer >= def.startup + def.active) return null;
    const h = this.currentHeight();
    const dmg = Math.round(def.dmg * this.def.power);
    const bx = this.facing === 1 ? this.x + this.width / 2 : this.x - this.width / 2 - def.reach;
    const by = GROUND_Y - this.y - h * (this.state === "kick" ? 0.55 : 0.7);
    return { x: bx, y: by, w: def.reach, h: 24, dmg, kb: def.kb, hitstun: def.hitstun };
  }

  specialHitbox() {
    const mv = this.activeMove;
    if (!mv || this.state !== "special") return null;
    if (mv.kind === "projectile" || mv.kind === "multi") return null;
    const t = this.stateTimer;
    if (t < mv.startup || t >= mv.startup + mv.active) return null;
    const h = this.currentHeight();
    if (mv.kind === "riser") {
      const reach = 30;
      const bx = this.facing === 1 ? this.x : this.x - reach;
      return { x: bx, y: GROUND_Y - this.y - h * 1.05, w: reach + this.width * 0.5, h: h * 0.95, dmg: mv.dmg, kb: mv.kb, hitstun: mv.hitstun, launch: true };
    }
    if (mv.kind === "burst") {
      const bx = this.facing === 1 ? this.x + this.width / 2 : this.x - this.width / 2 - mv.reach;
      return { x: bx, y: GROUND_Y - this.y - h * 0.8, w: mv.reach, h: h * 0.65, dmg: mv.dmg, kb: mv.kb, hitstun: mv.hitstun };
    }
    if (mv.kind === "dash") {
      const reach = 30;
      const bx = this.facing === 1 ? this.x + this.width / 2 - 6 : this.x - this.width / 2 - reach + 6;
      return { x: bx, y: GROUND_Y - this.y - h * 0.65, w: reach, h: h * 0.45, dmg: mv.dmg, kb: mv.kb, hitstun: mv.hitstun };
    }
    return null;
  }

  startAttack(kind) {
    if (this.state === "hitstun" || this.state === "ko" || this.state === "throw") return;
    if (this.state === "punch" || this.state === "kick" || this.state === "special") return;
    this.state = kind;
    this.stateTimer = 0;
    this.attackHasHit = false;
    this.trail = [];
  }

  startSpecial(moveKey) {
    const mv = this.def.moves[moveKey];
    if (!mv) return false;
    if (this.state === "hitstun" || this.state === "ko" || this.state === "throw") return false;
    if (this.state === "punch" || this.state === "kick" || this.state === "special") return false;
    if (moveKey === "super_p") {
      if (this.meter < 100) return false;
      this.meter = 0;
    } else if (!this.cooldownReady(moveKey, 0.9)) {
      return false;
    }
    this.state = "special";
    this.stateTimer = 0;
    this.attackHasHit = false;
    this.activeMove = mv;
    this.activeMoveKey = moveKey;
    this.multiRemaining = mv.kind === "multi" ? mv.bolts - 1 : 0;
    this.multiTimer = 0.09;
    this.trail = [];
    if (mv.big) triggerShake(4, 0.15);
    return true;
  }

  takeHit(dmg, kb, hitstun, blocked, launch) {
    this.hitFlash = 0.12;
    if (blocked) {
      this.health = Math.max(0, this.health - Math.ceil(dmg * 0.12));
      this.vx = -this.facing * kb * 0.35;
      this.state = "block";
      this.stateTimer = 0;
      this.comboCount = 0;
    } else {
      const wasChain = this.state === "hitstun";
      this.health = Math.max(0, this.health - dmg);
      this.vx = -this.facing * kb;
      if (launch) this.vy = 420;
      this.comboCount = wasChain ? this.comboCount + 1 : 1;
      this.comboPopupTimer = 1.1;
      this.state = this.health <= 0 ? "ko" : "hitstun";
      this.stateTimer = 0;
      this.hitstunLen = hitstun;
    }
  }

  performThrow(target) {
    this.state = "throw";
    this.stateTimer = 0;
    const dmg = Math.round(12 * this.def.power);
    target.health = Math.max(0, target.health - dmg);
    target.state = target.health <= 0 ? "ko" : "hitstun";
    target.stateTimer = 0;
    target.hitstunLen = 0.55;
    target.x += this.facing * 90;
    target.comboCount = 1;
    target.comboPopupTimer = 1.1;
    target.hitFlash = 0.12;
    this.meter = Math.min(100, this.meter + 6);
    target.meter = Math.min(100, target.meter + 3);
    spawnHitSpark(this.x + this.facing * this.width * 0.5, GROUND_Y - this.currentHeight() * 0.6, "#ffe066", true);
    triggerShake(6, 0.14);
  }

  updateMotion(dt, down, fwd, back) {
    const dir = numpadDir(down, fwd, back);
    for (const key of Object.keys(MOTION)) {
      const pat = MOTION[key];
      const prog = this.motionProgress[key];
      if (prog.readyTimer > 0) {
        prog.readyTimer -= dt;
      } else {
        prog.ready = false;
      }
      if (prog.step > 0) {
        prog.timer -= dt;
        if (prog.timer <= 0) prog.step = 0;
      }
      if (dir !== this._lastDir && dir === pat[prog.step]) {
        prog.step++;
        prog.timer = 0.5;
        if (prog.step >= pat.length) {
          prog.step = 0;
          prog.ready = true;
          prog.readyTimer = 0.22;
        }
      }
    }
    this._lastDir = dir;

    if (back && this.grounded) {
      this.chargeBackTime += dt;
    } else if (!fwd) {
      this.chargeBackTime = 0;
    }
    if (this.chargeBackTime >= 0.4 && fwd) {
      this.chargeReady = true;
      this.chargeReadyTimer = 0.22;
      this.chargeBackTime = 0;
    }
    if (this.chargeReadyTimer > 0) this.chargeReadyTimer -= dt;
    else this.chargeReady = false;
  }

  tryTriggerSpecials(punch, kick) {
    const moves = this.def.moves;
    if (punch) {
      if (this.motionProgress.super.ready && this.meter >= 100 && moves.super_p && this.startSpecial("super_p")) {
        this.motionProgress.super.ready = false;
        return true;
      }
      if (this.motionProgress.dp.ready && moves.dp_p && this.startSpecial("dp_p")) {
        this.motionProgress.dp.ready = false;
        return true;
      }
      if (this.motionProgress.qcf.ready && moves.qcf_p && this.startSpecial("qcf_p")) {
        this.motionProgress.qcf.ready = false;
        return true;
      }
    }
    if (kick) {
      if (this.chargeReady && moves.chargebf_k && this.startSpecial("chargebf_k")) {
        this.chargeReady = false;
        return true;
      }
    }
    return false;
  }

  update(dt, opponent) {
    if (this.state !== "ko") this.facing = opponent.x > this.x ? 1 : -1;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    Object.keys(this.moveCooldowns).forEach((k) => {
      if (this.moveCooldowns[k] > 0) this.moveCooldowns[k] -= dt;
    });
    if (this.comboPopupTimer > 0) this.comboPopupTimer -= dt;

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

    if (!this.isCPU) this.updateMotion(dt, down, fwdKey, backKey);

    const closeRange = Math.abs(this.x - opponent.x) < this.width / 2 + opponent.width / 2 + 16;
    const neutralGround = this.grounded && (this.state === "idle" || this.state === "walk" || this.state === "crouch");

    if (punch && kick && neutralGround && closeRange) {
      this.throwAttempt = true;
    } else if (neutralGround) {
      this.tryTriggerSpecials(punch, kick);
    }

    switch (this.state) {
      case "idle":
      case "walk":
      case "block": {
        let vx = 0;
        if (left) vx -= this.def.speed;
        if (right) vx += this.def.speed;
        this.vx = vx;
        if (this.throwAttempt) {
          // resolved centrally in step()
        } else if (down) {
          this.state = "crouch";
        } else if (up && this.grounded) {
          this.vy = JUMP_SPEED;
          this.state = "jump";
        } else if (punch) {
          this.startAttack("punch");
        } else if (kick) {
          this.startAttack("kick");
        } else {
          this.state = vx !== 0 && this.grounded ? "walk" : this.blocking ? "block" : "idle";
        }
        if (this.state === "walk" && this.grounded) {
          this.walkPhase += dt * 9;
          this.dustTimer -= dt;
          if (this.dustTimer <= 0) {
            spawnDust(this.x, GROUND_Y + 2);
            this.dustTimer = 0.18;
          }
        }
        break;
      }
      case "crouch": {
        this.vx = 0;
        if (!down) this.state = "idle";
        else if (!this.throwAttempt && punch) this.startAttack("punch");
        else if (!this.throwAttempt && kick) this.startAttack("kick");
        break;
      }
      case "jump": {
        if (left) this.vx = -this.def.speed * 0.85;
        else if (right) this.vx = this.def.speed * 0.85;
        if (punch) this.startAttack("punch");
        else if (kick) this.startAttack("kick");
        break;
      }
      case "punch":
      case "kick": {
        this.vx *= 1 - Math.min(1, dt * 10);
        const def = NORMALS[this.state];
        this.stateTimer += dt;
        if (this.stateTimer >= def.startup + def.active + def.recovery) {
          this.state = this.grounded ? "idle" : "jump";
          this.stateTimer = 0;
        }
        break;
      }
      case "special": {
        const mv = this.activeMove;
        this.stateTimer += dt;
        if (mv.kind === "dash" && this.stateTimer >= mv.startup && this.stateTimer < mv.startup + mv.active) {
          this.vx = this.facing * mv.dashSpeed;
        } else {
          this.vx *= 1 - Math.min(1, dt * 10);
        }
        if (mv.kind === "riser" && !this._riserLaunched && this.stateTimer >= mv.startup) {
          this.vy = 520;
          this._riserLaunched = true;
        }
        if ((mv.kind === "projectile" || mv.kind === "multi") && this.stateTimer >= mv.startup && !this.attackHasHit) {
          this.attackHasHit = true;
          projectiles.push(new Projectile(this, mv));
        }
        if (mv.kind === "multi" && this.multiRemaining > 0) {
          this.multiTimer -= dt;
          if (this.multiTimer <= 0) {
            projectiles.push(new Projectile(this, mv, (Math.random() - 0.5) * 20));
            this.multiRemaining--;
            this.multiTimer = 0.09;
          }
        }
        if (this.stateTimer >= mv.startup + mv.active + mv.recovery) {
          this.state = this.grounded ? "idle" : "jump";
          this.stateTimer = 0;
          this.activeMove = null;
          this._riserLaunched = false;
        }
        break;
      }
      case "throw": {
        this.vx *= 1 - Math.min(1, dt * 12);
        this.stateTimer += dt;
        if (this.stateTimer >= 0.32) {
          this.state = "idle";
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
        this.stateTimer += dt;
        break;
      }
    }

    if (this.state === "block") {
      this.stateTimer += dt;
      if (this.stateTimer > 0.22 && !this.blocking) {
        this.state = "idle";
        this.stateTimer = 0;
      }
    }

    if (!this.grounded || this.vy > 0) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        const wasAirborne = this.y <= 0 && this.vy <= 0;
        this.y = 0;
        this.vy = 0;
        if (this.state === "jump") {
          this.state = "idle";
          this.stateTimer = 0;
          spawnDust(this.x, GROUND_Y + 2);
        }
      }
    }

    this.x += this.vx * dt;
    this.x = Math.max(STAGE_LEFT + this.width / 2, Math.min(STAGE_RIGHT - this.width / 2, this.x));

    this.displayHealth += (this.health - this.displayHealth) * Math.min(1, dt * 4);

    const activeBox = this.attackHitbox() || this.specialHitbox();
    if (activeBox) {
      this.trail.push({ x: activeBox.x + (this.facing === 1 ? activeBox.w : 0), y: activeBox.y + activeBox.h / 2 });
      if (this.trail.length > 5) this.trail.shift();
    } else if (this.trail.length) {
      this.trail = [];
    }
  }

  draw() {
    const h = this.currentHeight();
    const top = GROUND_Y - this.y - h;
    const cx = this.x;
    const facing = this.facing;
    const c = this.def;

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(cx, GROUND_Y + 6, this.width * 0.62, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // motion trail for active limb
    this.trail.forEach((p, i) => {
      ctx.globalAlpha = ((i + 1) / this.trail.length) * 0.35;
      ctx.fillStyle = c.accent;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    const flashing = this.hitFlash > 0;
    const bodyColor = flashing ? "#fff" : c.color;
    const darkColor = flashing ? "#eee" : c.dark;

    ctx.save();
    if (this.state === "ko") {
      const t = Math.min(1, this.stateTimer / 0.4);
      ctx.translate(cx, GROUND_Y);
      ctx.rotate((facing * Math.PI) / 2 * t * 0.85);
      ctx.translate(-cx, -GROUND_Y + (h * 0.5) * t);
      ctx.globalAlpha = 1 - t * 0.15;
    }

    const legLen = h * 0.42;
    const torsoLen = h * 0.4;
    const hip = { x: cx, y: top + h - legLen };
    let shoulder = { x: cx, y: hip.y - torsoLen };
    let lean = 0;

    if (this.state === "idle") {
      const bob = Math.sin(gameTime * 3) * 2;
      shoulder.y += bob;
    } else if (this.state === "hitstun" || this.state === "block") {
      lean = -facing * 10;
    } else if (this.state === "punch" || (this.state === "special" && this.activeMove && this.activeMove.kind !== "riser")) {
      lean = facing * 8;
    } else if (this.state === "kick") {
      lean = -facing * 6;
    } else if (this.state === "special" && this.activeMove && this.activeMove.kind === "riser") {
      lean = facing * 4;
    }
    shoulder.x += lean;

    const legSwing = this.state === "walk" ? Math.sin(this.walkPhase) * 15 : 0;
    let footF, footB;
    if (this.state === "jump") {
      footF = { x: hip.x + facing * 10, y: hip.y + legLen * 0.55 };
      footB = { x: hip.x - facing * 6, y: hip.y + legLen * 0.6 };
    } else if (this.state === "crouch") {
      footF = { x: hip.x + facing * 16, y: hip.y + legLen * 0.7 };
      footB = { x: hip.x - facing * 16, y: hip.y + legLen * 0.7 };
    } else {
      footF = { x: hip.x + facing * 10 + legSwing, y: GROUND_Y };
      footB = { x: hip.x - facing * 10 - legSwing, y: GROUND_Y };
    }

    // back leg
    ctx.strokeStyle = darkColor;
    ctx.lineWidth = this.width * 0.26;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y);
    ctx.lineTo(footB.x, footB.y);
    ctx.stroke();

    // back arm
    let handB = { x: shoulder.x - facing * 10, y: shoulder.y + torsoLen * 0.55 };
    ctx.lineWidth = this.width * 0.18;
    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.lineTo(handB.x, handB.y);
    ctx.stroke();

    // torso
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = this.width * 0.5;
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y);
    ctx.lineTo(shoulder.x, shoulder.y);
    ctx.stroke();

    // front leg
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = this.width * 0.28;
    let footFTarget = footF;
    const spBox = this.specialHitbox();
    const nBox = this.attackHitbox();
    const activeBox = nBox || spBox;
    if (this.state === "kick" && activeBox) {
      footFTarget = { x: activeBox.x + (facing === 1 ? activeBox.w : 0), y: activeBox.y + activeBox.h / 2 };
    }
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y);
    ctx.lineTo(footFTarget.x, footFTarget.y);
    ctx.stroke();

    // head
    const headPos = { x: shoulder.x + facing * 2, y: shoulder.y - h * 0.1 };
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(headPos.x, headPos.y, h * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0b0f14";
    ctx.beginPath();
    ctx.arc(headPos.x + facing * h * 0.05, headPos.y - h * 0.01, h * 0.018, 0, Math.PI * 2);
    ctx.fill();

    // front arm / guard / attack
    let handF = { x: shoulder.x + facing * 14, y: shoulder.y + torsoLen * 0.3 };
    if (this.state === "block") {
      handF = { x: shoulder.x + facing * 16, y: shoulder.y - torsoLen * 0.1 };
      handB = { x: shoulder.x + facing * 12, y: shoulder.y + torsoLen * 0.15 };
    } else if (this.state === "punch" && activeBox) {
      handF = { x: activeBox.x + (facing === 1 ? activeBox.w : 0), y: activeBox.y + activeBox.h / 2 };
    } else if (this.state === "special" && activeBox && spBox && this.activeMove.kind !== "riser") {
      handF = { x: activeBox.x + (facing === 1 ? activeBox.w : 0), y: activeBox.y + activeBox.h / 2 };
    } else if (this.state === "special" && this.activeMove && this.activeMove.kind === "riser") {
      handF = { x: shoulder.x + facing * 6, y: shoulder.y - h * 0.35 };
    } else if (this.state === "special" && (this.activeMove.kind === "projectile" || this.activeMove.kind === "multi")) {
      handF = { x: shoulder.x + facing * 22, y: shoulder.y + torsoLen * 0.2 };
    } else if (this.state === "throw") {
      handF = { x: shoulder.x + facing * 26, y: shoulder.y + torsoLen * 0.15 };
    }

    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = this.width * 0.19;
    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.lineTo(handF.x, handF.y);
    ctx.stroke();

    // fist / foot glow on active hit frame
    if (activeBox) {
      ctx.fillStyle = c.accent;
      ctx.beginPath();
      const tip = this.state === "kick" ? footFTarget : handF;
      ctx.arc(tip.x, tip.y, this.width * 0.16, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.arc(handF.x, handF.y, this.width * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.invulnerable) {
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, top + h * 0.5, this.width * 0.85, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();

    ctx.fillStyle = "#fff";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(c.name, cx, GROUND_Y + 20);

    if (this.comboPopupTimer > 0 && this.comboCount > 1) {
      ctx.globalAlpha = Math.min(1, this.comboPopupTimer * 2);
      ctx.fillStyle = "#ffd60a";
      ctx.font = "bold 16px monospace";
      ctx.fillText(`${this.comboCount} HITS`, cx, top - 14);
      ctx.globalAlpha = 1;
    }
  }
}

// ---------- combat resolution ----------
function checkAttack(attacker, defender) {
  const box = attacker.attackHitbox() || attacker.specialHitbox();
  if (!box || attacker.attackHasHit) return;
  if (defender.state === "ko" || defender.invulnerable) return;
  const hb = defender.hurtBox();
  if (rectsOverlap(box, hb)) {
    attacker.attackHasHit = true;
    const blocked = defender.blocking && !box.launch;
    defender.takeHit(box.dmg, box.kb, box.hitstun, blocked, box.launch);
    const spark = { x: defender.x - defender.facing * defender.width * 0.3, y: hb.y + hb.h * 0.4 };
    spawnHitSpark(spark.x, spark.y, attacker.def.accent, !!(attacker.activeMove && attacker.activeMove.big));
    triggerShake(attacker.state === "special" ? 6 : 3, attacker.state === "special" ? 0.14 : 0.08);
    hitstop.timer = Math.max(hitstop.timer, attacker.activeMove && attacker.activeMove.big ? 0.12 : attacker.state === "special" ? 0.08 : 0.05);
    attacker.meter = Math.min(100, attacker.meter + (blocked ? 4 : 8));
    defender.meter = Math.min(100, defender.meter + (blocked ? 2 : 4));
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

const hitstop = { timer: 0 };

// ---------- AI ----------
function updateAI(dt) {
  if (!p2.isCPU) return;
  const ai = p2._ai;
  ai.left = ai.right = ai.up = ai.down = ai.punch = ai.kick = false;
  if (p1.state === "ko" || p2.state === "ko") return;
  const dist = Math.abs(p1.x - p2.x);
  const towards = p1.x < p2.x ? "left" : "right";
  const away = towards === "left" ? "right" : "left";
  const moves = p2.def.moves;

  if (p1.state === "jump" && dist < 140 && moves.dp_p && Math.random() < 0.05) {
    ai.punch = true;
    p2.motionProgress.dp.ready = true;
    p2.motionProgress.dp.readyTimer = 0.3;
    return;
  }

  if (p2.meter >= 100 && dist < 260 && moves.super_p && Math.random() < 0.02) {
    ai.punch = true;
    p2.motionProgress.super.ready = true;
    p2.motionProgress.super.readyTimer = 0.3;
    return;
  }

  if (dist > 260) {
    ai[towards] = true;
    if (moves.qcf_p && Math.random() < 0.02) {
      ai.punch = true;
      p2.motionProgress.qcf.ready = true;
      p2.motionProgress.qcf.readyTimer = 0.3;
    }
  } else if (dist > 90) {
    ai[towards] = true;
    if (moves.chargebf_k && Math.random() < 0.012) {
      ai.kick = true;
      p2.chargeReady = true;
      p2.chargeReadyTimer = 0.3;
    } else if (moves.qcf_p && Math.random() < 0.012) {
      ai.punch = true;
      p2.motionProgress.qcf.ready = true;
      p2.motionProgress.qcf.readyTimer = 0.3;
    }
    if (Math.random() < 0.004) ai.up = true;
  } else {
    if (Math.random() < 0.16) ai[away] = true;
    if (Math.random() < 0.05) ai.punch = true;
    else if (Math.random() < 0.035) ai.kick = true;
    if (Math.random() < 0.012) {
      ai.down = true;
      if (Math.random() < 0.4) {
        ai.punch = true;
      }
    }
    if (Math.random() < 0.01 && dist < 50) {
      ai.punch = true;
      ai.kick = true;
    }
  }
}

// ---------- game state ----------
let projectiles = [];
let p1, p2;
let phase = "title";
let phaseTimer = 0;
let roundTimeLeft = ROUND_TIME;
let mode = "cpu";
let message = "";
let roundNumber = 1;

const select = { p1Index: 0, p2Index: 1, p1Confirmed: false, p2Confirmed: false, cpuTimer: 0 };

function newFighters(p1Key, p2Key) {
  p1 = new Fighter(p1Key, 260, 1, KEYS_P1, false);
  p2 = new Fighter(p2Key, W - 260, -1, KEYS_P2, mode === "cpu");
  projectiles = [];
  particles = [];
  roundTimeLeft = ROUND_TIME;
}

function startMatch() {
  roundNumber = 1;
  newFighters(ROSTER_ORDER[select.p1Index], ROSTER_ORDER[select.p2Index]);
  phase = "ready";
  phaseTimer = 0;
}

function resetSelect() {
  select.p1Index = 0;
  select.p2Index = 1;
  select.p1Confirmed = false;
  select.p2Confirmed = false;
  select.cpuTimer = 0;
}

function resolveThrows() {
  if (p1.throwAttempt && p2.throwAttempt) {
    p1.throwAttempt = false;
    p2.throwAttempt = false;
    p1.vx = -p1.facing * 60;
    p2.vx = -p2.facing * 60;
    return;
  }
  if (p1.throwAttempt) {
    p1.throwAttempt = false;
    p1.performThrow(p2);
  } else if (p2.throwAttempt) {
    p2.throwAttempt = false;
    p2.performThrow(p1);
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
  gameTime += dt;
  updateParticles(dt);
  if (shake.timer > 0) {
    shake.timer -= dt;
    shake.mag *= 0.88;
  } else {
    shake.mag = 0;
  }

  if (phase === "title") {
    if (wasPressed("1")) {
      mode = "cpu";
      resetSelect();
      phase = "select";
    } else if (wasPressed("2")) {
      mode = "2p";
      resetSelect();
      phase = "select";
    }
    return;
  }

  if (phase === "select") {
    if (!select.p1Confirmed) {
      if (wasPressed(KEYS_P1.left)) select.p1Index = (select.p1Index + ROSTER_ORDER.length - 1) % ROSTER_ORDER.length;
      if (wasPressed(KEYS_P1.right)) select.p1Index = (select.p1Index + 1) % ROSTER_ORDER.length;
      if (wasPressed(KEYS_P1.punch)) select.p1Confirmed = true;
    }
    if (mode === "2p" && !select.p2Confirmed) {
      if (wasPressed(KEYS_P2.left)) select.p2Index = (select.p2Index + ROSTER_ORDER.length - 1) % ROSTER_ORDER.length;
      if (wasPressed(KEYS_P2.right)) select.p2Index = (select.p2Index + 1) % ROSTER_ORDER.length;
      if (wasPressed(KEYS_P2.punch)) select.p2Confirmed = true;
    }
    if (mode === "cpu" && select.p1Confirmed && !select.p2Confirmed) {
      select.cpuTimer += dt;
      if (select.cpuTimer > 0.5) {
        select.p2Index = Math.floor(Math.random() * ROSTER_ORDER.length);
        select.p2Confirmed = true;
      }
    }
    if (select.p1Confirmed && select.p2Confirmed) {
      phaseTimer += dt;
      if (phaseTimer > 0.5) {
        phaseTimer = 0;
        startMatch();
      }
    } else {
      phaseTimer = 0;
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
    if (hitstop.timer > 0) {
      hitstop.timer -= dt;
      return;
    }
    updateAI(dt);
    p1.update(dt, p2);
    p2.update(dt, p1);
    separate(p1, p2);
    resolveThrows();

    checkAttack(p1, p2);
    checkAttack(p2, p1);

    projectiles.forEach((pr) => pr.update(dt));
    projectiles.forEach((pr) => {
      if (pr.dead) return;
      const target = pr.owner === p1 ? p2 : p1;
      if (target.state === "ko" || target.invulnerable) return;
      if (rectsOverlap(pr.hitbox(), target.hurtBox())) {
        const blocked = target.blocking;
        target.takeHit(pr.mv.dmg, pr.mv.kb, pr.mv.hitstun, blocked, false);
        spawnHitSpark(pr.x, pr.y, pr.owner.def.accent, !!pr.mv.big);
        triggerShake(pr.mv.big ? 6 : 3, pr.mv.big ? 0.14 : 0.08);
        hitstop.timer = Math.max(hitstop.timer, pr.mv.big ? 0.12 : 0.06);
        pr.owner.meter = Math.min(100, pr.owner.meter + (blocked ? 4 : 8));
        target.meter = Math.min(100, target.meter + (blocked ? 2 : 4));
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
        message = `${p2.def.name} WINS!`;
        p2.wins++;
      } else {
        message = `${p1.def.name} WINS!`;
        p1.wins++;
      }
    } else if (roundTimeLeft <= 0) {
      roundTimeLeft = 0;
      ended = true;
      if (p1.health > p2.health) {
        message = `${p1.def.name} WINS! (TIME OVER)`;
        p1.wins++;
      } else if (p2.health > p1.health) {
        message = `${p2.def.name} WINS! (TIME OVER)`;
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
        newFighters(p1.def.key, p2.def.key);
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

// ---------- rendering ----------
function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#182233");
  grad.addColorStop(0.6, "#101a28");
  grad.addColorStop(1, "#0a1119");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(255,240,200,0.12)";
  ctx.beginPath();
  ctx.arc(W - 130, 90, 46, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#22314a";
  for (let i = 0; i < 6; i++) {
    const bw = 60 + (i % 3) * 20;
    const bh = 90 + ((i * 37) % 80);
    ctx.fillRect(i * 160 - 20, GROUND_Y - bh - 40, bw, bh);
  }
  ctx.fillStyle = "#1a2538";
  for (let i = 0; i < 8; i++) {
    const bw = 40 + (i % 4) * 16;
    const bh = 60 + ((i * 53) % 60);
    ctx.fillRect(i * 120 + 10, GROUND_Y - bh - 20, bw, bh);
  }

  ctx.fillStyle = "#0d141e";
  for (let i = 0; i < 24; i++) {
    ctx.beginPath();
    ctx.arc(i * 40 + 10, GROUND_Y - 8, 6, Math.PI, 0);
    ctx.fill();
  }

  ctx.fillStyle = "#2b3a4a";
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  ctx.fillStyle = "#3a4d63";
  ctx.fillRect(0, GROUND_Y, W, 6);
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 100, GROUND_Y + 6);
    ctx.lineTo(i * 100 - 30, H);
    ctx.stroke();
  }
}

function drawHealthBar(x, y, w, fighter, flip) {
  const pct = Math.max(0, fighter.health / fighter.maxHealth);
  const dpct = Math.max(0, fighter.displayHealth / fighter.maxHealth);
  ctx.fillStyle = "#222";
  ctx.fillRect(x, y, w, 18);
  ctx.fillStyle = "#ffcf4d";
  if (flip) ctx.fillRect(x + w * (1 - dpct), y, w * dpct, 18);
  else ctx.fillRect(x, y, w * dpct, 18);
  ctx.fillStyle = pct > 0.35 ? "#3ddc84" : "#ff3b3b";
  if (flip) ctx.fillRect(x + w * (1 - pct), y, w * pct, 18);
  else ctx.fillRect(x, y, w * pct, 18);
  ctx.strokeStyle = "#fff";
  ctx.strokeRect(x, y, w, 18);

  const meterW = w;
  const meterPct = fighter.meter / 100;
  ctx.fillStyle = "#223";
  ctx.fillRect(x, y + 22, meterW, 6);
  ctx.fillStyle = fighter.meter >= 100 ? "#ffd60a" : "#4d9fff";
  if (flip) ctx.fillRect(x + meterW * (1 - meterPct), y + 22, meterW * meterPct, 6);
  else ctx.fillRect(x, y + 22, meterW * meterPct, 6);
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.strokeRect(x, y + 22, meterW, 6);

  for (let i = 0; i < ROUNDS_TO_WIN; i++) {
    const wx = flip ? x + w - 14 - i * 16 : x + i * 16;
    ctx.fillStyle = fighter.wins > i ? "#ffd60a" : "#555";
    ctx.beginPath();
    ctx.arc(wx, y - 10, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = fighter.def.color;
  ctx.font = "bold 13px monospace";
  ctx.textAlign = flip ? "right" : "left";
  ctx.fillText(fighter.def.name, flip ? x + w : x, y - 22);
}

function drawTitle() {
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = "bold 44px monospace";
  ctx.fillText("HADOU FIGHTERS", W / 2, 130);
  ctx.font = "16px monospace";
  ctx.fillText("対戦型格闘ゲーム プロトタイプ", W / 2, 162);

  ctx.font = "20px monospace";
  ctx.fillText("[1] 1人プレイ (CPU対戦)", W / 2, 240);
  ctx.fillText("[2] 2人対戦 (ローカル)", W / 2, 275);

  ctx.font = "13px monospace";
  ctx.fillText("P1: A/D 移動  W ジャンプ  S しゃがみ  F パンチ  G キック", W / 2, 340);
  ctx.fillText("P2: ←/→ 移動  ↑ ジャンプ  ↓ しゃがみ  K パンチ  L キック", W / 2, 360);
  ctx.fillText("必殺技: ↓→+P 波動 / →↓→+P 昇龍 / 後溜め→前+K 突進 / ↓→↓→+P 超必殺(気力満タン時)", W / 2, 385);
  ctx.fillText("パンチとキック同時押しで投げ / 相手と逆方向入力でガード", W / 2, 405);
}

function drawSelect() {
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = "bold 30px monospace";
  ctx.fillText("CHARACTER SELECT", W / 2, 60);

  const cardW = 170,
    cardH = 220,
    gap = 20;
  const totalW = ROSTER_ORDER.length * cardW + (ROSTER_ORDER.length - 1) * gap;
  const startX = (W - totalW) / 2;

  ROSTER_ORDER.forEach((key, i) => {
    const c = CHARACTERS[key];
    const x = startX + i * (cardW + gap);
    const y = 100;
    ctx.fillStyle = "#1c2636";
    ctx.fillRect(x, y, cardW, cardH);
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.strokeRect(x, y, cardW, cardH);

    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(x + cardW / 2, y + 60, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0b0f14";
    ctx.font = "bold 26px monospace";
    ctx.fillText(c.name[0], x + cardW / 2, y + 70);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 15px monospace";
    ctx.fillText(c.name, x + cardW / 2, y + 116);
    ctx.font = "11px monospace";
    ctx.fillStyle = "#9fb3c8";
    ctx.fillText(c.title, x + cardW / 2, y + 134);

    const stats = [
      ["HP", c.health / 120],
      ["SPD", c.speed / 320],
      ["PWR", c.power / 1.3],
    ];
    stats.forEach(([label, pct], si) => {
      const sy = y + 152 + si * 16;
      ctx.textAlign = "left";
      ctx.fillStyle = "#cdd8e3";
      ctx.font = "10px monospace";
      ctx.fillText(label, x + 14, sy + 8);
      ctx.fillStyle = "#333";
      ctx.fillRect(x + 44, sy, cardW - 60, 7);
      ctx.fillStyle = c.color;
      ctx.fillRect(x + 44, sy, (cardW - 60) * Math.max(0.1, Math.min(1, pct)), 7);
      ctx.textAlign = "center";
    });

    if (select.p1Index === i) {
      ctx.strokeStyle = "#ffd60a";
      ctx.lineWidth = 4;
      ctx.strokeRect(x - 4, y - 4, cardW + 8, cardH + 8);
      ctx.fillStyle = "#ffd60a";
      ctx.font = "bold 12px monospace";
      ctx.fillText(select.p1Confirmed ? "P1 OK" : "P1", x + cardW / 2, y - 10);
    }
    if (mode === "2p" && select.p2Index === i) {
      ctx.strokeStyle = "#4dd2ff";
      ctx.lineWidth = select.p1Index === i ? 2 : 4;
      ctx.strokeRect(x - (select.p1Index === i ? -2 : 4), y - (select.p1Index === i ? -2 : 4), cardW + (select.p1Index === i ? -4 : 8), cardH + (select.p1Index === i ? -4 : 8));
      ctx.fillStyle = "#4dd2ff";
      ctx.font = "bold 12px monospace";
      ctx.fillText(select.p2Confirmed ? "P2 OK" : "P2", x + cardW / 2, y + cardH + 20);
    }
    ctx.lineWidth = 1;
  });

  ctx.fillStyle = "#cdd8e3";
  ctx.font = "13px monospace";
  ctx.fillText("P1: A/D で選択  F で決定" + (mode === "2p" ? " ／ P2: ←/→ で選択  K で決定" : " ／ P2はCPUがランダム選択"), W / 2, 380);
}

function drawFightScreen() {
  drawHealthBar(30, 30, 320, p1, false);
  drawHealthBar(W - 350, 30, 320, p2, true);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 28px monospace";
  ctx.textAlign = "center";
  ctx.fillText(String(Math.ceil(roundTimeLeft)), W / 2, 50);
  ctx.font = "12px monospace";
  ctx.fillText(`ROUND ${roundNumber}`, W / 2, 68);

  ctx.save();
  const sx = (Math.random() - 0.5) * shake.mag;
  const sy = (Math.random() - 0.5) * shake.mag;
  ctx.translate(sx, sy);

  projectiles.forEach((pr) => pr.draw());
  drawParticles();
  const [back, front] = p1.x < p2.x ? [p1, p2] : [p2, p1];
  back.draw();
  front.draw();

  ctx.restore();

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
    const winner = p1.wins > p2.wins ? p1.def.name : p2.def.name;
    ctx.fillStyle = "#ffd60a";
    ctx.font = "bold 44px monospace";
    ctx.fillText(`${winner} WINS THE MATCH!`, W / 2, H / 2 - 10);
    ctx.font = "18px monospace";
    ctx.fillStyle = "#fff";
    ctx.fillText("Press ENTER to return to title", W / 2, H / 2 + 40);
  }
}

function render() {
  drawBackground();

  if (phase === "title") {
    drawTitle();
  } else if (phase === "select") {
    drawSelect();
  } else {
    drawFightScreen();
  }

  window.__debug = {
    phase,
    roundNumber,
    p1: p1 && { health: p1.health, x: p1.x, state: p1.state, wins: p1.wins, meter: p1.meter, combo: p1.comboCount, char: p1.def.key },
    p2: p2 && { health: p2.health, x: p2.x, state: p2.state, wins: p2.wins, meter: p2.meter, combo: p2.comboCount, char: p2.def.key },
    select: { ...select },
  };
}

requestAnimationFrame(loop);
