"use strict";

// numpad notation: 1=down-back 2=down 3=down-forward 4=back 5=neutral
// 6=forward 7=up-back 8=up 9=up-forward (all relative to the fighter's facing)
const MOTION = {
  qcf: [2, 6], // hadou-style: down, forward
  qcb: [2, 4], // down, back
  dp: [6, 2, 6], // shoryu-style: forward, down, forward
  super: [2, 6, 2, 6], // double quarter-circle forward
};

const CHARACTERS = {
  kaze: {
    key: "kaze",
    name: "KAZE",
    title: "疾風の拳士",
    color: "#3a86ff",
    dark: "#1c4fa8",
    accent: "#bfe3ff",
    health: 100,
    speed: 260,
    power: 1.0,
    width: 46,
    moves: {
      qcf_p: { name: "風弾", dmg: 13, kb: 70, hitstun: 0.42, kind: "projectile", speed: 480, startup: 0.22, recovery: 0.28 },
      dp_p: { name: "昇天拳", dmg: 17, kb: 160, hitstun: 0.5, kind: "riser", startup: 0.1, active: 0.14, recovery: 0.42, invuln: true },
      chargebf_k: { name: "疾風脚", dmg: 14, kb: 120, hitstun: 0.4, kind: "dash", dashSpeed: 620, startup: 0.08, active: 0.22, recovery: 0.3 },
      super_p: { name: "爆裂風弾", dmg: 28, kb: 160, hitstun: 0.65, kind: "projectile", speed: 560, startup: 0.2, recovery: 0.35, big: true },
    },
  },
  homura: {
    key: "homura",
    name: "HOMURA",
    title: "業火の豪腕",
    color: "#ff4d4d",
    dark: "#a01f1f",
    accent: "#ffc2b0",
    health: 108,
    speed: 232,
    power: 1.18,
    width: 50,
    moves: {
      qcf_p: { name: "炎陣", dmg: 15, kb: 90, hitstun: 0.45, kind: "burst", reach: 70, startup: 0.18, active: 0.1, recovery: 0.34 },
      dp_p: { name: "爆炎拳", dmg: 19, kb: 180, hitstun: 0.55, kind: "riser", startup: 0.13, active: 0.15, recovery: 0.48, invuln: true },
      chargebf_k: { name: "火炎突進", dmg: 17, kb: 150, hitstun: 0.46, kind: "dash", dashSpeed: 560, startup: 0.1, active: 0.24, recovery: 0.36 },
      super_p: { name: "大業火陣", dmg: 31, kb: 170, hitstun: 0.7, kind: "burst", reach: 120, startup: 0.24, active: 0.14, recovery: 0.4, big: true },
    },
  },
  ryusei: {
    key: "ryusei",
    name: "RYUSEI",
    title: "流星の刃",
    color: "#2ee6a8",
    dark: "#149468",
    accent: "#c8ffee",
    health: 90,
    speed: 302,
    power: 0.86,
    width: 42,
    moves: {
      qcf_p: { name: "流星弾", dmg: 10, kb: 55, hitstun: 0.34, kind: "projectile", speed: 640, startup: 0.14, recovery: 0.2 },
      dp_p: { name: "旋風蹴", dmg: 13, kb: 140, hitstun: 0.42, kind: "riser", startup: 0.08, active: 0.12, recovery: 0.32, invuln: true },
      chargebf_k: { name: "瞬影脚", dmg: 11, kb: 110, hitstun: 0.34, kind: "dash", dashSpeed: 720, startup: 0.06, active: 0.18, recovery: 0.22 },
      super_p: { name: "流星群", dmg: 24, kb: 130, hitstun: 0.6, kind: "multi", speed: 640, startup: 0.16, recovery: 0.3, big: true, bolts: 3 },
    },
  },
  ganma: {
    key: "ganma",
    name: "GANMA",
    title: "岩魔の巨腕",
    color: "#a06bff",
    dark: "#5e3aa0",
    accent: "#e6d9ff",
    health: 118,
    speed: 204,
    power: 1.28,
    width: 54,
    moves: {
      qcf_p: { name: "地震撃", dmg: 14, kb: 80, hitstun: 0.4, kind: "burst", reach: 55, startup: 0.24, active: 0.12, recovery: 0.4 },
      dp_p: { name: "岩砕き", dmg: 21, kb: 190, hitstun: 0.58, kind: "riser", startup: 0.16, active: 0.16, recovery: 0.54, invuln: true },
      chargebf_k: { name: "爆進", dmg: 19, kb: 170, hitstun: 0.5, kind: "dash", dashSpeed: 500, startup: 0.14, active: 0.26, recovery: 0.42 },
      super_p: { name: "大地震撃", dmg: 33, kb: 190, hitstun: 0.75, kind: "burst", reach: 110, startup: 0.28, active: 0.16, recovery: 0.46, big: true },
    },
  },
};

const ROSTER_ORDER = ["kaze", "homura", "ryusei", "ganma"];
