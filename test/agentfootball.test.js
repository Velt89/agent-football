const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const DAY = 86400;
const COACH = ethers.parseEther("0.001");
const K_PLAYER = 0, K_ITEM = 1, K_BADGE = 2, K_LEGEND = 3;
// Positions: 0 GK, 1 DF, 2 MF, 3 FW
// Daily items: 0 Protein Shake, 1 Vitamin, 2 Electrolyte Drink, 3 Banana, 4 Ice Bath
// Legends: 30 Golden Boot (FW), 31 Golden Glove (GK), 32 Golden Shield (DF), 33 Golden Playmaker (MF)

async function deploy() {
  // Pin chain time to 01:00 UTC of the next day boundary so tests never
  // straddle a UTC midnight (which would legitimately change "today").
  const latest = await time.latest();
  await time.setNextBlockTimestamp((Math.floor(latest / DAY) + 1) * DAY + 3600);
  const [deployer, creator, alice, bob, carol, dave] = await ethers.getSigners();
  const Mock = await ethers.getContractFactory("MockAgentID");
  const mock = await Mock.deploy();
  // Harness (test-only setters) for the base contract's exact behaviour.
  const AF = await ethers.getContractFactory("AgentFootballTestHarness");
  const af = await AF.deploy(await mock.getAddress(), creator.address);
  for (const u of [alice, bob, carol]) await mock.setHolder(u.address, true);
  // dave: no Agent ID. deployer: not a holder either.
  return { af, mock, deployer, creator, alice, bob, carol, dave };
}

async function mintPlayer(af, user, name = "Velt Striker", position = 3) {
  const tx = await af.connect(user).mintPlayer(name, position);
  const rc = await tx.wait();
  let playerTokenId, itemTokenId;
  for (const log of rc.logs) {
    try {
      const p = af.interface.parseLog(log);
      if (p && p.name === "PlayerMinted") {
        playerTokenId = p.args.playerTokenId;
        itemTokenId = p.args.itemTokenId;
      }
    } catch { /* not ours */ }
  }
  if (playerTokenId === undefined) throw new Error("no PlayerMinted event");
  return { playerTokenId, itemTokenId, receipt: rc };
}

async function statsOf(af, tokenId) {
  const s = await af.playerStats(tokenId);
  return {
    stats: [...s[0]].map(Number),
    position: Number(s[1]),
    name: s[2],
    total: Number(s[3]),
    overall: Number(s[4]),
  };
}

function sum(a) { return a.reduce((x, y) => x + y, 0); }

describe("AgentFootball — constructor / identity", function () {
  it("creator() is the explicit constructor arg, NOT the deployer (msg.sender)", async function () {
    const { af, deployer, creator } = await deploy();
    expect(await af.creator()).to.equal(creator.address);
    expect(await af.owner()).to.equal(creator.address);
    expect(await af.creator()).to.not.equal(deployer.address);
  });

  it("name/symbol/seasonId/registry", async function () {
    const { af, mock } = await deploy();
    expect(await af.name()).to.equal("AgentFootball");
    expect(await af.symbol()).to.equal("AFB");
    expect(await af.seasonId()).to.equal(1);
    expect(await af.agentIdRegistry()).to.equal(await mock.getAddress());
    expect(await af.rewardPool()).to.equal(0);
    expect(await af.buybackTreasury()).to.equal(0);
    expect(await af.totalMinted()).to.equal(0);
  });

  it("setBaseURI: creator only, frozen after first mint", async function () {
    const { af, creator, alice, deployer } = await deploy();
    await expect(af.connect(alice).setBaseURI("https://x/"))
      .to.be.revertedWith("not creator");
    await expect(af.connect(deployer).setBaseURI("https://x/"))
      .to.be.revertedWith("not creator");
    await af.connect(creator).setBaseURI("https://agent-football.pages.dev/metadata/");
    expect(await af.baseURI()).to.equal("https://agent-football.pages.dev/metadata/");
    await mintPlayer(af, alice);
    await expect(af.connect(creator).setBaseURI("https://evil/"))
      .to.be.revertedWith("base URI frozen after first mint");
  });

  it("tokenURI is baseURI + tokenId, empty before base is set", async function () {
    const { af, creator, alice } = await deploy();
    const { playerTokenId } = await mintPlayer(af, alice);
    expect(await af.tokenURI(playerTokenId)).to.equal("");
    await expect(af.connect(creator).setBaseURI("https://m/"))
      .to.be.revertedWith("base URI frozen after first mint");
    // fresh contract with base set first
    const { af: af2, mock } = await deploy();
    await af2.connect(creator).setBaseURI("https://m/");
    const { playerTokenId: p2 } = await mintPlayer(af2, alice);
    expect(await af2.tokenURI(p2)).to.equal("https://m/" + p2.toString());
    expect(mock).to.not.equal(null);
  });
});

describe("AgentFootball — mintPlayer", function () {
  it("mints Player + Day-1 item in ONE tx, stats 40-60, overall = average", async function () {
    const { af, alice } = await deploy();
    const { playerTokenId, itemTokenId } = await mintPlayer(af, alice, "Velt Striker", 3);
    expect(await af.totalMinted()).to.equal(2);
    expect(await af.playerOf(alice.address)).to.equal(playerTokenId);
    expect(await af.hasPlayer(alice.address)).to.equal(true);
    expect(await af.tokenKind(playerTokenId)).to.equal(K_PLAYER);
    expect(await af.tokenItem(playerTokenId)).to.equal(3); // FW
    expect(await af.tokenKind(itemTokenId)).to.equal(K_ITEM);
    expect(Number(await af.tokenItem(itemTokenId))).to.be.within(0, 4);
    expect(await af.ownerOf(playerTokenId)).to.equal(alice.address);
    const s = await statsOf(af, playerTokenId);
    expect(s.position).to.equal(3);
    expect(s.name).to.equal("Velt Striker");
    for (const v of s.stats) expect(v).to.be.within(40, 60);
    expect(s.total).to.equal(sum(s.stats));
    expect(s.overall).to.equal(Math.floor(s.total / 5));
    // Day-1 draw counts as today's draw
    expect(await af.canDrawToday(alice.address)).to.equal(false);
    await expect(af.connect(alice).dailyDraw()).to.be.revertedWith("already drawn today");
  });

  it("emits PlayerMinted + ItemDrawn with the right player/item ids", async function () {
    const { af, alice } = await deploy();
    const tx = await af.connect(alice).mintPlayer("Velt", 1);
    const rc = await tx.wait();
    let minted, drawn;
    for (const log of rc.logs) {
      try {
        const p = af.interface.parseLog(log);
        if (p && p.name === "PlayerMinted") minted = p.args;
        if (p && p.name === "ItemDrawn") drawn = p.args;
      } catch { /* not ours */ }
    }
    expect(minted).to.not.equal(undefined);
    expect(drawn).to.not.equal(undefined);
    expect(minted.user).to.equal(alice.address);
    expect(minted.playerTokenId).to.equal(0);
    expect(minted.position).to.equal(1);
    expect(minted.playerName).to.equal("Velt");
    expect(minted.itemTokenId).to.equal(1);
    expect(Number(minted.item)).to.be.within(0, 4);
    expect(drawn.user).to.equal(alice.address);
    expect(drawn.tokenId).to.equal(1);
    expect(Number(drawn.item)).to.equal(Number(minted.item));
    expect(Number(drawn.day)).to.equal(Math.floor((await time.latest()) / DAY));
  });

  it("reverts: non-Agent-ID, second mint, empty/long/duplicate name, bad position, value sent", async function () {
    const { af, alice, bob, dave } = await deploy();
    await expect(af.connect(dave).mintPlayer("NoId", 3))
      .to.be.revertedWith("sender holds no Agent ID");
    await mintPlayer(af, alice, "Velt Striker", 3);
    await expect(af.connect(alice).mintPlayer("Second", 3))
      .to.be.revertedWith("already has a player");
    await expect(af.connect(bob).mintPlayer("Velt Striker", 3))
      .to.be.revertedWith("name already taken");
    await expect(af.connect(bob).mintPlayer("", 3))
      .to.be.revertedWith("name must be 1-32 bytes");
    await expect(af.connect(bob).mintPlayer("A".repeat(33), 3))
      .to.be.revertedWith("name must be 1-32 bytes");
    await expect(af.connect(bob).mintPlayer("Bob", 4))
      .to.be.revertedWith("invalid position");
    await expect(af.connect(bob).mintPlayer("Bob", 3, { value: 1 }))
      .to.be.reverted; // non-payable: any value reverts
    // 32-byte name is fine
    const { playerTokenId } = await mintPlayer(af, bob, "B".repeat(32), 0);
    expect(await af.tokenKind(playerTokenId)).to.equal(K_PLAYER);
  });

  it("Player is soulbound, Item is tradeable", async function () {
    const { af, alice, bob } = await deploy();
    const { playerTokenId, itemTokenId } = await mintPlayer(af, alice);
    await expect(af.connect(alice).transferFrom(alice.address, bob.address, playerTokenId))
      .to.be.revertedWith("AgentFootball: this token is soulbound");
    await expect(af.connect(alice).approve(bob.address, playerTokenId))
      .to.be.revertedWith("AgentFootball: this token is soulbound");
    await af.connect(alice).transferFrom(alice.address, bob.address, itemTokenId);
    expect(await af.ownerOf(itemTokenId)).to.equal(bob.address);
  });
});

describe("AgentFootball — dailyDraw", function () {
  it("once per UTC day, then again next day; item id 0-4", async function () {
    const { af, alice } = await deploy();
    await mintPlayer(af, alice);
    await time.increase(DAY);
    const tx = await af.connect(alice).dailyDraw();
    const rc = await tx.wait();
    let item;
    for (const log of rc.logs) {
      try {
        const p = af.interface.parseLog(log);
        if (p && p.name === "ItemDrawn") item = Number(p.args.item);
      } catch { /* not ours */ }
    }
    expect(item).to.be.within(0, 4);
    expect(await af.totalMinted()).to.equal(3);
    await expect(af.connect(alice).dailyDraw()).to.be.revertedWith("already drawn today");
    await time.increase(DAY);
    await expect(af.connect(alice).dailyDraw()).to.emit(af, "ItemDrawn");
  });

  it("reverts for non-players and non-Agent-ID holders", async function () {
    const { af, bob, dave } = await deploy();
    await expect(af.connect(bob).dailyDraw()).to.be.revertedWith("no player");
    await expect(af.connect(dave).dailyDraw())
      .to.be.revertedWith("sender holds no Agent ID");
  });
});

describe("AgentFootball — changePosition", function () {
  it("preserves total exactly (total 300), each stat 20-99, fee 0.001, split 90/8/2", async function () {
    const { af, alice, creator } = await deploy();
    const { playerTokenId } = await mintPlayer(af, alice, "Velt", 3);
    await af.setBaseStatsForTest(playerTokenId, [75, 65, 60, 55, 45]); // total 300
    const creatorBefore = await ethers.provider.getBalance(creator.address);
    await expect(af.connect(alice).changePosition(0, { value: COACH }))
      .to.emit(af, "PositionChanged")
      .withArgs(alice.address, playerTokenId, 3, 0, 300);
    const s = await statsOf(af, playerTokenId);
    expect(s.position).to.equal(0);
    expect(s.total).to.equal(300);
    for (const v of s.stats) expect(v).to.be.within(20, 99);
    expect(await af.rewardPool()).to.equal(ethers.parseEther("0.0009"));
    expect(await af.buybackTreasury()).to.equal(ethers.parseEther("0.00008"));
    expect(await ethers.provider.getBalance(creator.address) - creatorBefore)
      .to.equal(ethers.parseEther("0.00002"));
    expect(await af.positionChangesOf(alice.address)).to.equal(1);
  });

  it("total 495 stays all-99 (only feasible allocation)", async function () {
    const { af, alice } = await deploy();
    const { playerTokenId } = await mintPlayer(af, alice, "Max", 3);
    await af.setBaseStatsForTest(playerTokenId, [99, 99, 99, 99, 99]);
    await af.connect(alice).changePosition(1, { value: COACH });
    const s = await statsOf(af, playerTokenId);
    expect(s.stats).to.deep.equal([99, 99, 99, 99, 99]);
    expect(s.total).to.equal(495);
  });

  it("reverts: wrong fee, same position, second change in season 1, no player", async function () {
    const { af, alice, bob } = await deploy();
    const { playerTokenId } = await mintPlayer(af, alice, "Velt", 3);
    await expect(af.connect(alice).changePosition(0, { value: ethers.parseEther("0.0005") }))
      .to.be.revertedWith("position change costs exactly 0.001 BNB");
    await expect(af.connect(alice).changePosition(0))
      .to.be.revertedWith("position change costs exactly 0.001 BNB");
    await expect(af.connect(alice).changePosition(3, { value: COACH }))
      .to.be.revertedWith("already that position");
    await expect(af.connect(alice).changePosition(4, { value: COACH }))
      .to.be.revertedWith("invalid position");
    await expect(af.connect(bob).changePosition(0, { value: COACH }))
      .to.be.revertedWith("no player");
    await af.connect(alice).changePosition(0, { value: COACH });
    expect((await statsOf(af, playerTokenId)).total).to.be.greaterThan(0);
    await expect(af.connect(alice).changePosition(1, { value: COACH }))
      .to.be.revertedWith("position change already used this season");
  });
});

describe("AgentFootball — coachSession", function () {
  it("+4 to chosen stat, once/day, fee split 90/8/2", async function () {
    const { af, alice, creator } = await deploy();
    const { playerTokenId } = await mintPlayer(af, alice, "Velt", 3);
    await af.setBaseStatsForTest(playerTokenId, [50, 50, 50, 50, 50]);
    const before = await statsOf(af, playerTokenId);
    const creatorBefore = await ethers.provider.getBalance(creator.address);
    await expect(af.connect(alice).coachSession(0, { value: COACH }))
      .to.emit(af, "CoachSession");
    const after = await statsOf(af, playerTokenId);
    expect(after.stats[0]).to.equal(before.stats[0] + 4);
    expect(after.stats.slice(1)).to.deep.equal(before.stats.slice(1));
    expect(await af.rewardPool()).to.equal(ethers.parseEther("0.0009"));
    expect(await af.buybackTreasury()).to.equal(ethers.parseEther("0.00008"));
    expect(await ethers.provider.getBalance(creator.address) - creatorBefore)
      .to.equal(ethers.parseEther("0.00002"));
    expect(await af.canCoachToday(alice.address)).to.equal(false);
    await expect(af.connect(alice).coachSession(1, { value: COACH }))
      .to.be.revertedWith("coach session already used today");
    await time.increase(DAY);
    await af.connect(alice).coachSession(1, { value: COACH });
    expect((await statsOf(af, playerTokenId)).stats[1]).to.equal(54);
  });

  it("cap 99: excess goes to surplus (97 -> 99 +2 surplus; 99 -> +4 surplus)", async function () {
    const { af, alice } = await deploy();
    const { playerTokenId } = await mintPlayer(af, alice, "Velt", 3);
    await af.setBaseStatsForTest(playerTokenId, [97, 99, 50, 50, 50]);
    await af.connect(alice).coachSession(0, { value: COACH });
    let s = await statsOf(af, playerTokenId);
    expect(s.stats[0]).to.equal(99);
    expect(await af.surplusPointsOf(alice.address)).to.equal(2);
    await time.increase(DAY);
    await af.connect(alice).coachSession(1, { value: COACH });
    s = await statsOf(af, playerTokenId);
    expect(s.stats[1]).to.equal(99);
    expect(await af.surplusPointsOf(alice.address)).to.equal(6); // 2 + 4
  });

  it("reverts: wrong fee, bad stat index, no player", async function () {
    const { af, alice, bob } = await deploy();
    await mintPlayer(af, alice, "Velt", 3);
    await expect(af.connect(alice).coachSession(0, { value: ethers.parseEther("0.002") }))
      .to.be.revertedWith("coach session costs exactly 0.001 BNB");
    await expect(af.connect(alice).coachSession(0))
      .to.be.revertedWith("coach session costs exactly 0.001 BNB");
    await expect(af.connect(alice).coachSession(5, { value: COACH }))
      .to.be.revertedWith("invalid stat index");
    await expect(af.connect(bob).coachSession(0, { value: COACH }))
      .to.be.revertedWith("no player");
  });
});

describe("AgentFootball — topUpKick", function () {
  it("100 KICK = 0.001 BNB, 500 = 0.005, split 90/8/2, TopUp event", async function () {
    const { af, alice, creator } = await deploy();
    await mintPlayer(af, alice, "Velt", 3);
    const creatorBefore = await ethers.provider.getBalance(creator.address);
    await expect(af.connect(alice).topUpKick(100, { value: COACH }))
      .to.emit(af, "TopUp")
      .withArgs(
        alice.address, 100, COACH,
        await time.latest().then((t) => Math.floor(t / DAY)),
        ethers.parseEther("0.0009"), ethers.parseEther("0.00008"), ethers.parseEther("0.00002")
      );
    expect(await af.topUpLeftToday(alice.address)).to.equal(400);
    await af.connect(alice).topUpKick(400, { value: ethers.parseEther("0.004") });
    expect(await af.topUpLeftToday(alice.address)).to.equal(0);
    expect(await af.rewardPool()).to.equal(ethers.parseEther("0.0045"));
    expect(await af.buybackTreasury()).to.equal(ethers.parseEther("0.0004"));
    expect(await ethers.provider.getBalance(creator.address) - creatorBefore)
      .to.equal(ethers.parseEther("0.0001"));
  });

  it("reverts: non-multiple of 100, <100, >500/call, wrong value, daily cap 500", async function () {
    const { af, alice } = await deploy();
    await mintPlayer(af, alice, "Velt", 3);
    await expect(af.connect(alice).topUpKick(150, { value: ethers.parseEther("0.0015") }))
      .to.be.revertedWith("kick amount must be a multiple of 100");
    await expect(af.connect(alice).topUpKick(0, { value: 0 }))
      .to.be.revertedWith("top-up is 100-500 KICK per call");
    await expect(af.connect(alice).topUpKick(600, { value: ethers.parseEther("0.006") }))
      .to.be.revertedWith("top-up is 100-500 KICK per call");
    await expect(af.connect(alice).topUpKick(100, { value: ethers.parseEther("0.002") }))
      .to.be.revertedWith("wrong value for kick amount");
    await expect(af.connect(alice).topUpKick(200, { value: COACH }))
      .to.be.revertedWith("wrong value for kick amount");
    await af.connect(alice).topUpKick(500, { value: ethers.parseEther("0.005") });
    await expect(af.connect(alice).topUpKick(100, { value: COACH }))
      .to.be.revertedWith("daily top-up cap is 500 KICK");
    // next day the cap resets
    await time.increase(DAY);
    await af.connect(alice).topUpKick(100, { value: COACH });
    expect(await af.topUpLeftToday(alice.address)).to.equal(400);
  });
});

describe("AgentFootball — unlockNewStat (surplus)", function () {
  it("costs 20 surplus, starts at 40, once-only, visible in unlockedStatsOf", async function () {
    const { af, alice } = await deploy();
    const { playerTokenId } = await mintPlayer(af, alice, "Velt", 0); // GK
    await af.addSurplusForTest(playerTokenId, 40);
    await expect(af.connect(alice).unlockNewStat(10))
      .to.emit(af, "StatUnlocked")
      .withArgs(alice.address, playerTokenId, 10, 40);
    expect(await af.surplusPointsOf(alice.address)).to.equal(20);
    let [ids, values] = await af.unlockedStatsOf(alice.address);
    expect([...ids].map(Number)).to.deep.equal([10]);
    expect([...values].map(Number)).to.deep.equal([40]);
    expect(await af.extraStatOf(playerTokenId, 10)).to.deep.equal([true, 40]);
    await expect(af.connect(alice).unlockNewStat(10))
      .to.be.revertedWith("stat already unlocked");
    // universal works for any position
    await af.connect(alice).unlockNewStat(50);
    expect(await af.surplusPointsOf(alice.address)).to.equal(0);
    [ids, values] = await af.unlockedStatsOf(alice.address);
    expect([...ids].map(Number)).to.deep.equal([10, 50]);
  });

  it("reverts: wrong-position specialist, invalid id, insufficient surplus", async function () {
    const { af, alice } = await deploy();
    const { playerTokenId } = await mintPlayer(af, alice, "Velt", 0); // GK
    await af.addSurplusForTest(playerTokenId, 10);
    await expect(af.connect(alice).unlockNewStat(40)) // FW specialist
      .to.be.revertedWith("stat not available for this position");
    await expect(af.connect(alice).unlockNewStat(20)) // DF specialist
      .to.be.revertedWith("stat not available for this position");
    await expect(af.connect(alice).unlockNewStat(99))
      .to.be.revertedWith("stat not available for this position");
    await expect(af.connect(alice).unlockNewStat(11))
      .to.be.revertedWith("need 20 surplus points");
    await af.addSurplusForTest(playerTokenId, 10); // now exactly 20
    await af.connect(alice).unlockNewStat(11);
    expect(await af.surplusPointsOf(alice.address)).to.equal(0);
  });

  it("specialist tables differ per position (DF 20-22, MF 30-32, FW 40-42)", async function () {
    const { af, alice, bob, carol } = await deploy();
    const a = await mintPlayer(af, alice, "A", 1); // DF
    const b = await mintPlayer(af, bob, "B", 2); // MF
    const c = await mintPlayer(af, carol, "C", 3); // FW
    for (const [p, id] of [[a, 21], [b, 31], [c, 42]]) {
      await af.addSurplusForTest(p.playerTokenId, 20);
    }
    await af.connect(alice).unlockNewStat(21);
    await af.connect(bob).unlockNewStat(31);
    await af.connect(carol).unlockNewStat(42);
    expect((await af.unlockedStatsOf(alice.address))[0].map(Number)).to.deep.equal([21]);
    expect((await af.unlockedStatsOf(bob.address))[0].map(Number)).to.deep.equal([31]);
    expect((await af.unlockedStatsOf(carol.address))[0].map(Number)).to.deep.equal([42]);
    expect(await af.newStatName(21)).to.equal("Ball Playing");
    expect(await af.newStatName(52)).to.equal("Durability");
  });
});

describe("AgentFootball — claimImmortalReward", function () {
  it("reverts unless ALL 5 base stats are 99", async function () {
    const { af, alice } = await deploy();
    const { playerTokenId } = await mintPlayer(af, alice, "Velt", 3);
    await af.setBaseStatsForTest(playerTokenId, [99, 99, 99, 99, 98]);
    await expect(af.connect(alice).claimImmortalReward())
      .to.be.revertedWith("all 5 base stats must be 99");
    await af.setBaseStatsForTest(playerTokenId, [99, 99, 99, 99, 99]);
    await expect(af.connect(alice).claimImmortalReward())
      .to.emit(af, "ImmortalRewarded");
  });

  it("FW gets soulbound Immortal XI Badge + tradeable Golden Boot Legend (30)", async function () {
    const { af, alice, bob } = await deploy();
    const { playerTokenId } = await mintPlayer(af, alice, "Velt", 3);
    await af.setBaseStatsForTest(playerTokenId, [99, 99, 99, 99, 99]);
    const tx = await af.connect(alice).claimImmortalReward();
    const rc = await tx.wait();
    let badgeId, legendId, legendItem;
    for (const log of rc.logs) {
      try {
        const p = af.interface.parseLog(log);
        if (p && p.name === "ImmortalRewarded") {
          badgeId = p.args.badgeTokenId; legendId = p.args.legendTokenId; legendItem = Number(p.args.legendItem);
        }
      } catch { /* not ours */ }
    }
    expect(legendItem).to.equal(30);
    expect(await af.tokenKind(badgeId)).to.equal(K_BADGE);
    expect(await af.tokenKind(legendId)).to.equal(K_LEGEND);
    expect(await af.tokenItem(legendId)).to.equal(30);
    expect(await af.legendName(30)).to.equal("Golden Boot Legend");
    // badge soulbound, legend tradeable
    await expect(af.connect(alice).transferFrom(alice.address, bob.address, badgeId))
      .to.be.revertedWith("AgentFootball: this token is soulbound");
    await af.connect(alice).transferFrom(alice.address, bob.address, legendId);
    expect(await af.ownerOf(legendId)).to.equal(bob.address);
    // once only
    await expect(af.connect(alice).claimImmortalReward())
      .to.be.revertedWith("immortal reward already claimed");
  });

  it("position Legends: GK 31 Golden Glove, DF 32 Golden Shield, MF 33 Golden Playmaker", async function () {
    const { af, alice, bob, carol } = await deploy();
    const cases = [
      [alice, "GK", 0, 31, "Golden Glove Legend"],
      [bob, "DF", 1, 32, "Golden Shield Legend"],
      [carol, "MF", 2, 33, "Golden Playmaker Legend"],
    ];
    for (const [user, name, pos, item, legend] of cases) {
      const { playerTokenId } = await mintPlayer(af, user, name, pos);
      await af.setBaseStatsForTest(playerTokenId, [99, 99, 99, 99, 99]);
      const tx = await af.connect(user).claimImmortalReward();
      const rc = await tx.wait();
      let legendItem;
      for (const log of rc.logs) {
        try {
          const p = af.interface.parseLog(log);
          if (p && p.name === "ImmortalRewarded") legendItem = Number(p.args.legendItem);
        } catch { /* not ours */ }
      }
      expect(legendItem).to.equal(item);
      expect(await af.legendName(item)).to.equal(legend);
    }
  });
});

describe("AgentFootball — useItem", function () {
  it("burns the owned Item NFT, emits ItemUsed; second use / non-owner revert", async function () {
    const { af, alice, bob } = await deploy();
    const { itemTokenId } = await mintPlayer(af, alice, "Velt", 3);
    const item0 = Number(await af.tokenItem(itemTokenId));
    await expect(af.connect(alice).useItem(itemTokenId))
      .to.emit(af, "ItemUsed")
      .withArgs(alice.address, itemTokenId, item0);
    expect(await af.isBurned(itemTokenId)).to.equal(true);
    expect(await af.balanceOf(alice.address)).to.equal(1); // only the player left
    await time.increase(DAY);
    const tx = await af.connect(alice).dailyDraw();
    const rc = await tx.wait();
    let item2, itemId2;
    for (const log of rc.logs) {
      try {
        const p = af.interface.parseLog(log);
        if (p && p.name === "ItemDrawn") { item2 = Number(p.args.item); itemId2 = p.args.tokenId; }
      } catch { /* not ours */ }
    }
    await expect(af.connect(alice).useItem(itemId2))
      .to.emit(af, "ItemUsed")
      .withArgs(alice.address, itemId2, item2);
    expect(await af.isBurned(itemId2)).to.equal(true);
    expect(await af.balanceOf(alice.address)).to.equal(1); // +1 draw, -1 burn: still just the player
    await expect(af.connect(alice).useItem(itemId2))
      .to.be.revertedWith("token does not exist");
    await expect(af.connect(bob).useItem(itemTokenId))
      .to.be.revertedWith("token does not exist"); // already burned above
  });

  it("cannot useItem a Player token (wrong kind)", async function () {
    const { af, alice } = await deploy();
    const { playerTokenId } = await mintPlayer(af, alice, "Velt", 3);
    await expect(af.connect(alice).useItem(playerTokenId))
      .to.be.revertedWith("wrong token kind");
  });
});

describe("AgentFootball — settleWeekly", function () {
  async function funded(af, alice) {
    await mintPlayer(af, alice, "Velt", 3);
    await af.connect(alice).coachSession(0, { value: COACH }); // pool +0.0009
    await af.connect(alice).topUpKick(100, { value: COACH }); // pool +0.0009
    expect(await af.rewardPool()).to.equal(ethers.parseEther("0.0018"));
  }

  it("creator distributes from the pool; pool decreases; recipients paid", async function () {
    const { af, alice, bob, carol, creator } = await deploy();
    await funded(af, alice);
    const bobBefore = await ethers.provider.getBalance(bob.address);
    const carolBefore = await ethers.provider.getBalance(carol.address);
    await expect(
      af.connect(creator).settleWeekly(
        [bob.address, carol.address],
        [ethers.parseEther("0.001"), ethers.parseEther("0.0008")]
      )
    ).to.emit(af, "WeeklySettled").withArgs(creator.address, ethers.parseEther("0.0018"), 2);
    expect(await af.rewardPool()).to.equal(0);
    expect(await ethers.provider.getBalance(bob.address) - bobBefore)
      .to.equal(ethers.parseEther("0.001"));
    expect(await ethers.provider.getBalance(carol.address) - carolBefore)
      .to.equal(ethers.parseEther("0.0008"));
    // buyback treasury untouched by settle
    expect(await af.buybackTreasury()).to.equal(ethers.parseEther("0.00016"));
  });

  it("reverts: non-creator, creator as recipient, sum > pool, empty, length mismatch", async function () {
    const { af, alice, bob, creator, deployer } = await deploy();
    await funded(af, alice);
    await expect(af.connect(alice).settleWeekly([bob.address], [100]))
      .to.be.revertedWith("not creator");
    await expect(af.connect(deployer).settleWeekly([bob.address], [100]))
      .to.be.revertedWith("not creator");
    await expect(af.connect(creator).settleWeekly([creator.address], [100]))
      .to.be.revertedWith("creator cannot be a recipient");
    await expect(af.connect(creator).settleWeekly([bob.address], [ethers.parseEther("0.0019")]))
      .to.be.revertedWith("amount exceeds reward pool");
    await expect(af.connect(creator).settleWeekly([], []))
      .to.be.revertedWith("no recipients");
    await expect(af.connect(creator).settleWeekly([bob.address], [100, 200]))
      .to.be.revertedWith("length mismatch");
    await expect(af.connect(creator).settleWeekly([ethers.ZeroAddress], [100]))
      .to.be.revertedWith("recipient is zero address");
  });
});

describe("AgentFootball — royalties / interfaces / misc views", function () {
  it("ERC-2981: 5% to the contract; supportsInterface ERC165/721/Metadata/2981", async function () {
    const { af, alice } = await deploy();
    const { playerTokenId } = await mintPlayer(af, alice, "Velt", 3);
    const [receiver, amount] = await af.royaltyInfo(playerTokenId, ethers.parseEther("1"));
    expect(receiver).to.equal(await af.getAddress());
    expect(amount).to.equal(ethers.parseEther("0.05"));
    expect(await af.supportsInterface("0x01ffc9a7")).to.equal(true);
    expect(await af.supportsInterface("0x80ac58cd")).to.equal(true);
    expect(await af.supportsInterface("0x5b5e139f")).to.equal(true);
    expect(await af.supportsInterface("0x2a55205a")).to.equal(true);
    expect(await af.supportsInterface("0xffffffff")).to.equal(false);
  });

  it("no creator mint function exists for supermarket items (S1 off-chain)", async function () {
    const { af } = await deploy();
    // The contract ABI must not expose any mintItemFor / mintSupermarketItem.
    const names = af.interface.fragments.map((f) => f.name);
    expect(names).to.not.include("mintItemFor");
    expect(names).to.not.include("mintSupermarketItem");
    expect(names).to.not.include("mintItem");
    // ...but the supermarket name table exists for frontend/backend agreement.
    expect(await af.supermarketItemName(10)).to.equal("Recovery Shake Pro");
    expect(await af.supermarketItemName(18)).to.equal("Cryotherapy");
    await expect(af.supermarketItemName(9)).to.be.revertedWith("invalid supermarket item");
    await expect(af.supermarketItemName(19)).to.be.revertedWith("invalid supermarket item");
  });

  it("name tables: positions, stats, daily items, legends", async function () {
    const { af } = await deploy();
    expect(await af.positionName(0)).to.equal("Goalkeeper");
    expect(await af.positionName(3)).to.equal("Forward");
    await expect(af.positionName(4)).to.be.revertedWith("invalid position");
    expect(await af.statName(3, 0)).to.equal("Finishing");
    expect(await af.statName(0, 0)).to.equal("Reflexes");
    expect(await af.statName(1, 4)).to.equal("Pace");
    expect(await af.statName(2, 4)).to.equal("Long Shots");
    expect(await af.dailyItemName(0)).to.equal("Protein Shake");
    expect(await af.dailyItemName(4)).to.equal("Ice Bath");
    expect(await af.legendItemForPosition(3)).to.equal(30);
    expect(await af.legendItemForPosition(0)).to.equal(31);
  });

  it("playersCount / getPlayers pagination", async function () {
    const { af, alice, bob } = await deploy();
    await mintPlayer(af, alice, "A", 3);
    await mintPlayer(af, bob, "B", 0);
    expect(await af.playersCount()).to.equal(2);
    expect(await af.getPlayers(0, 10)).to.deep.equal([alice.address, bob.address]);
    expect(await af.getPlayers(1, 10)).to.deep.equal([bob.address]);
    expect(await af.getPlayers(5, 10)).to.deep.equal([]);
  });

  it("receive() credits the reward pool (royalties landing on the contract)", async function () {
    const { af, alice } = await deploy();
    await alice.sendTransaction({ to: await af.getAddress(), value: ethers.parseEther("0.01") });
    expect(await af.rewardPool()).to.equal(ethers.parseEther("0.01"));
  });
});
