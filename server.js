const CATEGORIES = {
  "Fruits":["Apple","Banana","Mango","Strawberry","Grape","Pineapple","Watermelon","Peach","Cherry","Kiwi","Lemon","Lime","Coconut","Blueberry","Raspberry","Papaya","Plum","Pomegranate","Fig","Apricot","Lychee","Guava","Passion Fruit","Dragon Fruit","Cantaloupe"],
  "Seasons of Survivor":["Borneo","Australian Outback","Africa","Marquesas","Thailand","The Amazon","Pearl Islands","Vanuatu","Palau","Guatemala","Panama","Cook Islands","Fiji","China","Micronesia","Gabon","Tocantins","Samoa","Nicaragua","Redemption Island","South Pacific","Philippines","Caramoan","Blood vs Water","Cagayan","San Juan del Sur","Worlds Apart","Cambodia","Kaoh Rong","Millennials vs Gen X","Game Changers","HHH","Ghost Island","David vs Goliath","Edge of Extinction","Island of the Idols","Winners at War"],
  "Countries in North America":["United States","Canada","Mexico","Guatemala","Belize","Honduras","El Salvador","Nicaragua","Costa Rica","Panama","Cuba","Jamaica","Haiti","Dominican Republic","Bahamas","Barbados","Trinidad and Tobago","Grenada","Saint Lucia","Antigua and Barbuda","Dominica","Saint Vincent","Saint Kitts and Nevis"],
  "Disney Animated Characters 90s":["Ariel","Simba","Aladdin","Jasmine","Belle","Beast","Pocahontas","Mulan","Tarzan","Hercules","Hades","Jafar","Scar","Timon","Pumbaa","Genie","Nala","Mufasa","Ursula","Gaston","Lumiere","Cogsworth","Mrs Potts","Flounder","Sebastian","Iago","Zazu","Rafiki","Mushu","Phil"],
  "US States":["Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming"],
  "Olympic Sports":["Swimming","Athletics","Gymnastics","Cycling","Rowing","Sailing","Boxing","Wrestling","Judo","Fencing","Shooting","Archery","Equestrian","Triathlon","Weightlifting","Volleyball","Basketball","Soccer","Tennis","Badminton","Table Tennis","Handball","Hockey","Rugby Sevens","Skateboarding","Surfing","Sport Climbing","Baseball"],
  "Famous Scientists":["Einstein","Newton","Darwin","Curie","Tesla","Hawking","Galileo","Feynman","Turing","Edison","Faraday","Maxwell","Bohr","Pasteur","Mendel","Lavoisier","Kepler","Copernicus","Archimedes","Oppenheimer","Planck","Heisenberg","Schrodinger","Lovelace","Noether"],
  "Dog Breeds":["Labrador","Golden Retriever","German Shepherd","Bulldog","Poodle","Beagle","Rottweiler","Yorkshire Terrier","Boxer","Dachshund","Siberian Husky","Great Dane","Doberman","Shih Tzu","Chihuahua","Border Collie","Pomeranian","Maltese","Cocker Spaniel","Dalmatian","Greyhound","Pug","Samoyed","Akita","Weimaraner"],
  "World Capitals":["Paris","Tokyo","London","Berlin","Rome","Madrid","Beijing","Moscow","Ottawa","Canberra","Brasilia","Cairo","New Delhi","Buenos Aires","Seoul","Mexico City","Jakarta","Ankara","Nairobi","Bangkok","Lisbon","Vienna","Warsaw","Stockholm","Oslo","Copenhagen","Helsinki","Athens","Prague","Budapest"],
  "Movies from the 2000s":["The Dark Knight","Inception","Avatar","The Lord of the Rings","Finding Nemo","Gladiator","Shrek","Pirates of the Caribbean","Harry Potter","Spider-Man","Ratatouille","Wall-E","Up","No Country for Old Men","There Will Be Blood","Eternal Sunshine","Brokeback Mountain","Crash","Million Dollar Baby","Chicago","A Beautiful Mind","Memento","Cast Away"],
  "Card Games":["Poker","Blackjack","Rummy","Bridge","Solitaire","Go Fish","War","Uno","Crazy Eights","Snap","Hearts","Spades","Cribbage","Canasta","Pinochle","Baccarat","Old Maid","Concentration","Speed","Slapjack"],
  "Taylor Swift Albums":["Taylor Swift","Fearless","Speak Now","Red","1989","Reputation","Lover","Folklore","Evermore","Midnights"],
  "NBA Teams":["Lakers","Celtics","Bulls","Warriors","Heat","Knicks","Spurs","Nets","Bucks","Suns","Mavericks","Clippers","76ers","Raptors","Nuggets","Cavaliers","Pistons","Trail Blazers","Thunder","Jazz"],
  "Things in a Kitchen":["Refrigerator","Oven","Microwave","Sink","Dishwasher","Toaster","Blender","Cutting board","Knife","Pan","Pot","Colander","Spatula","Whisk","Measuring cup","Rolling pin","Grater","Peeler","Ladle","Tongs"]
};

const CAT_NAMES = Object.keys(CATEGORIES);

export default class SnatchRoom {
  constructor(room) {
    this.room = room;
    this.state = null;
    this.timerInterval = null;
  }

  pickCategory(usedCategories = []) {
    const available = CAT_NAMES.filter(c => !usedCategories.includes(c));
    const pool = available.length > 0 ? available : CAT_NAMES;
    return pool[Math.floor(Math.random() * pool.length)];
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
      case "submit":      this.handleSubmit(msg, conn); break;
      case "reveal_next": this.handleRevealNext(msg, conn); break;
      case "next_round":  this.handleNextRound(msg, conn); break;
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
      timerDuration: 30
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
    if (Object.keys(this.state.players).length < 2) {
      conn.send(JSON.stringify({ type: "error", message: "Need at least 2 players" })); return;
    }
    this.state.category = this.pickCategory(this.state.usedCategories);
    this.state.usedCategories.push(this.state.category);
    this.state.phase = "submitting";
    this.state.submissions[this.state.currentRound] = {};
    this.state.timerStart = Date.now();
    this.broadcast({ type: "state", state: this.state });
    this.startTimer();
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
      this.state = this.computeScores(this.state);
      this.state.phase = "revealing";
      this.state.revealStep = 0;
    }
    this.broadcast({ type: "state", state: this.state });
  }

  handleRevealNext(msg, conn) {
    if (!this.state || msg.playerId !== this.state.hostId || this.state.phase !== "revealing") return;
    const groups = this.state.revealData[this.state.currentRound]?.revealGroups || [];
    if (this.state.revealStep < groups.length) this.state.revealStep++;
    this.broadcast({ type: "state", state: this.state });
  }

  handleNextRound(msg, conn) {
    if (!this.state || msg.playerId !== this.state.hostId || this.state.phase !== "revealing") return;
    if (this.state.totalHoarded >= this.state.coinGoal) {
      this.state.phase = "final";
    } else {
      this.state.currentRound++;
      this.state.category = this.pickCategory(this.state.usedCategories);
      this.state.usedCategories.push(this.state.category);
      this.state.phase = "submitting";
      this.state.submissions[this.state.currentRound] = {};
      this.state.timerStart = Date.now();
      this.startTimer();
    }
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
