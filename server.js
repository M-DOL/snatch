import { CATEGORIES, CAT_NAMES } from './public/categories.js';

export default class SnatchRoom {
  constructor(room) {
    this.room = room;
    this.state = null;
    this.timerInterval = null;
  }

  setCategory(cat) {
    this.state.category = cat;
    this.state.categoryItems = (CATEGORIES[cat] || []).map(i => i.split('|')[0]);
  }

  pickCategory() {
    const s = this.state;
    // Play drafted-but-unplayed categories first
    const unplayed = (s.draftedCategories||[]).filter(c => !s.usedCategories.includes(c));
    if (unplayed.length > 0) return unplayed[~~(Math.random() * unplayed.length)];
    // Then random, excluding all categories that were offered during the draft
    const excl = new Set([...s.usedCategories, ...(s.excludedCategories||[])]);
    const avail = CAT_NAMES.filter(c => !excl.has(c));
    const pool = avail.length > 0 ? avail : CAT_NAMES.filter(c => !s.usedCategories.includes(c));
    return pool[~~(Math.random() * pool.length)];
  }

  onConnect(conn) {
    if (this.state) conn.send(JSON.stringify({ type: "state", state: this.state }));
  }

  onMessage(message, conn) {
    const msg = JSON.parse(message);
    switch (msg.type) {
      case "create":      this.handleCreate(msg, conn); break;
      case "join":        this.handleJoin(msg, conn); break;
      case "start":       this.handleStart(msg, conn); break;
      case "draft_pick":  this.handleDraftPick(msg, conn); break;
      case "submit":      this.handleSubmit(msg, conn); break;
      case "reveal_next": this.handleRevealNext(msg, conn); break;
      case "next_round":  this.handleNextRound(msg, conn); break;
      case "rematch":     this.handleRematch(msg, conn); break;
    }
  }

  handleCreate(msg, conn) {
    if (this.state) { conn.send(JSON.stringify({ type: "error", message: "Room already exists" })); return; }
    this.state = {
      hostId: msg.playerId,
      coinGoal: msg.coinGoal || 1000,
      currentRound: 1,
      category: null,
      usedCategories: [],
      totalHoarded: 0,
      phase: "lobby",
      players: {
        [msg.playerId]: { name: msg.playerName, score: 0, dragonUsed: false, heistUsed: false }
      },
      submissions: {},
      roundPoints: {},
      revealData: {},
      revealStep: 0,
      timerStart: null,
      timerDuration: 45,
      draftOptions: {},
      draftPicks: {},
      draftedCategories: [],
      excludedCategories: [],
    };
    this.broadcast({ type: "state", state: this.state });
  }

  handleJoin(msg, conn) {
    if (!this.state) { conn.send(JSON.stringify({ type: "error", message: "Room not found" })); return; }
    if (this.state.phase !== "lobby") { conn.send(JSON.stringify({ type: "error", message: "Game already in progress" })); return; }
    this.state.players[msg.playerId] = { name: msg.playerName, score: 0, dragonUsed: false, heistUsed: false };
    this.broadcast({ type: "state", state: this.state });
  }

  handleStart(msg, conn) {
    if (!this.state || msg.playerId !== this.state.hostId) return;
    const playerIds = Object.keys(this.state.players);
    if (playerIds.length < 2) {
      conn.send(JSON.stringify({ type: "error", message: "Need at least 2 players" })); return;
    }
    // Assign 3 unique categories to each player (wraps around if >5 players)
    const shuffled = [...CAT_NAMES].sort(() => Math.random() - 0.5);
    const draftOptions = {};
    playerIds.forEach((pid, i) => {
      const opts = [];
      for (let j = 0; j < 3; j++) opts.push(shuffled[(i * 3 + j) % CAT_NAMES.length]);
      draftOptions[pid] = opts;
    });
    this.state.draftOptions = draftOptions;
    this.state.draftPicks = {};
    this.state.draftedCategories = [];
    this.state.excludedCategories = [...new Set(Object.values(draftOptions).flat())];
    this.state.phase = "drafting";
    this.broadcast({ type: "state", state: this.state });
  }

  handleDraftPick(msg, conn) {
    if (!this.state || this.state.phase !== "drafting") return;
    if (this.state.draftPicks[msg.playerId]) return;
    const opts = this.state.draftOptions[msg.playerId] || [];
    if (!opts.includes(msg.category)) return;
    this.state.draftPicks[msg.playerId] = msg.category;
    this.state.draftedCategories.push(msg.category);
    const allPicked = Object.keys(this.state.players).every(pid => this.state.draftPicks[pid]);
    if (allPicked) {
      this.setCategory(this.pickCategory());
      this.state.usedCategories.push(this.state.category);
      this.state.phase = "submitting";
      this.state.submissions[this.state.currentRound] = {};
      this.state.timerStart = Date.now();
      this.broadcast({ type: "state", state: this.state });
      this.startTimer();
    } else {
      this.broadcast({ type: "state", state: this.state });
    }
  }

  handleSubmit(msg, conn) {
    if (!this.state || this.state.phase !== "submitting") return;
    const round = this.state.currentRound;
    if (!this.state.submissions[round]) this.state.submissions[round] = {};
    if (this.state.submissions[round][msg.playerId]) return;
    this.state.submissions[round][msg.playerId] = {
      hoards: msg.hoards || [], snatches: msg.snatches || [],
      dragon: msg.dragon || false, heist: msg.heist || false
    };
    if (msg.dragon) this.state.players[msg.playerId].dragonUsed = true;
    if (msg.heist)  this.state.players[msg.playerId].heistUsed = true;
    const playerIds = Object.keys(this.state.players);
    if (playerIds.every(id => this.state.submissions[round][id])) {
      if (this.timerInterval) clearInterval(this.timerInterval);
      this.broadcast({ type: "state", state: this.state });
      setTimeout(() => {
        if (!this.state || this.state.phase !== "submitting") return;
        this.state = this.computeScores(this.state);
        this.state.phase = "revealing";
        this.state.revealStep = 0;
        this.broadcast({ type: "state", state: this.state });
      }, 2000);
    } else {
      this.broadcast({ type: "state", state: this.state });
    }
  }

  handleRevealNext(msg, conn) {
    if (!this.state || msg.playerId !== this.state.hostId || this.state.phase !== "revealing") return;
    const groups = this.state.revealData[this.state.currentRound]?.revealGroups || [];
    if (this.state.revealStep <= groups.length) this.state.revealStep++;
    this.broadcast({ type: "state", state: this.state });
  }

  handleNextRound(msg, conn) {
    if (!this.state || msg.playerId !== this.state.hostId || this.state.phase !== "revealing") return;
    const maxScore = Math.max(...Object.values(this.state.players).map(p => p.score));
    if (maxScore >= this.state.coinGoal) {
      this.state.phase = "final";
    } else {
      this.state.currentRound++;
      this.setCategory(this.pickCategory());
      this.state.usedCategories.push(this.state.category);
      this.state.phase = "submitting";
      this.state.submissions[this.state.currentRound] = {};
      this.state.timerStart = Date.now();
      this.startTimer();
    }
    this.broadcast({ type: "state", state: this.state });
  }

  handleRematch(msg, conn) {
    if (!this.state || msg.playerId !== this.state.hostId || this.state.phase !== "final") return;
    const players = {};
    Object.entries(this.state.players).forEach(([id, p]) => {
      players[id] = { name: p.name, score: 0, dragonUsed: false, heistUsed: false };
    });
    this.state = {
      hostId: this.state.hostId,
      coinGoal: this.state.coinGoal,
      currentRound: 1,
      category: null,
      usedCategories: [],
      totalHoarded: 0,
      phase: "lobby",
      players,
      submissions: {},
      roundPoints: {},
      revealData: {},
      revealStep: 0,
      timerStart: null,
      timerDuration: this.state.timerDuration,
      draftOptions: {},
      draftPicks: {},
      draftedCategories: [],
      excludedCategories: [],
    };
    this.broadcast({ type: "state", state: this.state });
  }

  startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (!this.state || this.state.phase !== "submitting") { clearInterval(this.timerInterval); return; }
      const elapsed = (Date.now() - this.state.timerStart) / 1000;
      if (elapsed >= this.state.timerDuration) {
        clearInterval(this.timerInterval);
        this.autoSubmitBlanks();
      }
    }, 500);
  }

  autoSubmitBlanks() {
    const round = this.state.currentRound;
    const subs = this.state.submissions[round] || {};
    Object.keys(this.state.players).forEach(pid => {
      if (!subs[pid]) subs[pid] = { hoards: [], snatches: [], dragon: false, heist: false, autoSubmitted: true };
    });
    this.state.submissions[round] = subs;
    this.state = this.computeScores(this.state);
    this.state.phase = "revealing";
    this.state.revealStep = 0;
    this.broadcast({ type: "state", state: this.state });
  }

  computeScores(state) {
    const round = state.currentRound;
    const subs = state.submissions[round] || {};
    const players = Object.keys(subs);
    const COIN = 100;
    const allHoards = {}, allSnatches = {};
    players.forEach(pid => {
      (subs[pid].hoards || []).forEach(h => {
        const k = h.trim().toLowerCase();
        if (!allHoards[k]) allHoards[k] = [];
        allHoards[k].push(pid);
      });
      (subs[pid].snatches || []).forEach(s => {
        const k = s.trim().toLowerCase();
        if (!allSnatches[k]) allSnatches[k] = [];
        allSnatches[k].push(pid);
      });
    });
    const pts = {};
    players.forEach(pid => { pts[pid] = 0; });
    let roundHoardedCoins = 0;
    players.forEach(pid => {
      (subs[pid].hoards || []).forEach(h => {
        const k = h.trim().toLowerCase();
        const thieves = (allSnatches[k] || []).filter(id => id !== pid);
        if (thieves.length === 0) { pts[pid] += COIN; roundHoardedCoins += COIN; }
      });
    });
    players.forEach(pid => {
      (subs[pid].snatches || []).forEach(s => {
        const k = s.trim().toLowerCase();
        const hoarders = (allHoards[k] || []).filter(id => id !== pid);
        if (hoarders.length > 0) pts[pid] += COIN * hoarders.length;
      });
    });
    players.forEach(pid => {
      if (state.players[pid]) state.players[pid].score += pts[pid];
    });
    state.totalHoarded += roundHoardedCoins;
    state.roundPoints[round] = pts;
    const groupMap = {};
    Object.entries(allHoards).forEach(([treasure, pids]) => {
      const size = pids.length;
      if (!groupMap[size]) groupMap[size] = [];
      groupMap[size].push({ treasure, pids, snatchers: allSnatches[treasure] || [] });
    });
    const revealGroups = Object.keys(groupMap).map(Number).sort((a, b) => a - b)
      .flatMap(size => groupMap[size]);
    state.revealData[round] = { allHoards, allSnatches, revealGroups };
    return state;
  }

  broadcast(msg) {
    const str = JSON.stringify(msg);
    for (const conn of this.room.getConnections()) conn.send(str);
  }
}
