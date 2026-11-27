// Sources flattened with hardhat v2.30.0 https://hardhat.org

// SPDX-License-Identifier: MIT

// File contracts/AgentFootball.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity 0.8.24;

/// @title AgentFootball — Agent ID football career on BNB Chain
/// @notice One soulbound Player per Agent ID holder. Mint (gas only) also
/// draws the Day-1 free item in the SAME tx. Daily free item draw, 1-on-1
/// Coach Session (0.001 BNB, +4 to one stat), $KICK top-ups (100 KICK per
/// 0.001 BNB, max 500/day), surplus-point unlocks of new stats, and the
/// Immortal XI reward when all 5 base stats reach 99.
///
/// CREATOR: the creator wallet W is an EXPLICIT constructor argument —
/// NEVER msg.sender (Fateborn v1 broke because creator became the CREATE2
/// proxy, making setBaseURI uncallable). Creator is identity/metadata only:
/// its ONLY privileges are setBaseURI (before any mint) and settleWeekly
/// (distribute ONLY from the reward pool, NEVER to itself). It cannot
/// change odds, caps, stats, fees, or withdraw the pool for itself.
/// There is no owner/admin power over game rules of any kind.
///
/// $KICK: Season 1 $KICK is OFF-CHAIN points (Workers ledger). This
/// contract holds NO $KICK token and mints none. topUpKick() only proves
/// the BNB payment on-chain (TopUp event); the Workers backend credits
/// $KICK by indexing that event. Supermarket items in S1 are issued as
/// off-chain inventory by Workers and only become on-chain NFTs when a
/// player withdraws/trades them — there is deliberately NO creator mint
/// function for them (see contracts/README.md).
///
/// RANDOMNESS (honest limits, as in RamenForge / Fateborn Mutant): draws
/// and stat rolls are keccak256 of the previous block hash,
/// block.prevrandao, the sender, the UTC day and an internal nonce,
/// revealed at call time. It cannot be re-rolled by simply waiting
/// (1 draw/day, 1 player per Agent ID) and the sender-bound seed means
/// nobody can draw "for" another wallet; but it is derived from public
/// chain data, so a sophisticated caller who can land a transaction in
/// an exact chosen block (or a contract wallet that reverts unless the
/// roll is favourable) could bias their own single daily draw / stat
/// roll. Impact is bounded (1 draw/day, stats capped at 99, surplus
/// accrues past the cap instead of vanishing). A VRF oracle would remove
/// this; it was deliberately not used to keep the contract
/// dependency-free and fully self-contained.
///
/// FEES (locked design): every BNB payment (Coach Session, $KICK top-up)
/// splits on receipt — 90% weekly reward pool, 8% buyback $KICK treasury
/// (accrues in BNB in S1, unspent, for the Season 2 buyback), 2% to the
/// creator immediately. The pool can only ever leave this contract via
/// settleWeekly(), called by the creator, to non-creator recipients.
///
/// SOULBOUND: Player NFTs (kind 0) and Immortal XI Badges (kind 2) cannot
/// be transferred or approved. Item NFTs (kind 1) and Legend NFTs
/// (kind 3) are tradeable. useItem() burns an Item NFT; its effect
/// (fatigue / injury) is applied OFF-CHAIN by Workers.
///
/// ROYALTIES: ERC-2981, 5% on every token, receiver = this contract — so
/// marketplace royalties flow into the reward pool (see receive()).

interface IAgentID {
    function balanceOf(address owner) external view returns (uint256);
}

contract AgentFootball {
    string public constant name = "AgentFootball";
    string public constant symbol = "AFB";

    uint256 public constant SECONDS_PER_DAY = 86400;
    uint256 public constant seasonId = 1;

    // Token kinds.
    uint8 public constant KIND_PLAYER = 0;
    uint8 public constant KIND_ITEM = 1;
    uint8 public constant KIND_BADGE = 2; // Immortal XI Badge, soulbound
    uint8 public constant KIND_LEGEND = 3; // position Legend NFT, tradeable

    // Daily free-draw item ids (kind 1).
    uint8 public constant DAILY_ITEM_TYPES = 5;
    // Supermarket item ids (kind 1) — S1 off-chain inventory only, see header.
    // 10 Recovery Shake Pro, 11 Energy Gel, 12 Sleep Mask Pro, 13 Knee Brace,
    // 14 Ankle Tape, 15 Muscle Rub, 16 Physio Session, 17 Medical Kit,
    // 18 Cryotherapy.
    // Legend NFT item ids (kind 3), by position.
    uint8 public constant LEGEND_GOLDEN_BOOT = 30; // Forward
    uint8 public constant LEGEND_GOLDEN_GLOVE = 31; // Goalkeeper
    uint8 public constant LEGEND_GOLDEN_SHIELD = 32; // Defender
    uint8 public constant LEGEND_GOLDEN_PLAYMAKER = 33; // Midfielder

    // Economy constants (locked design, 2026-11-27).
    uint256 public constant COACH_PRICE = 0.001 ether;
    uint256 public constant COACH_GAIN = 4;
    uint256 public constant COACH_INJURY_CHANCE_BPS = 300; // 3%, off-chain; recorded in the event only
    uint256 public constant POSITION_CHANGE_PRICE = 0.001 ether;
    uint256 public constant POSITION_CHANGES_PER_SEASON = 1;
    uint256 public constant STAT_CAP = 99;
    uint256 public constant STAT_START_MIN = 40;
    uint256 public constant STAT_START_MAX = 60;
    uint256 public constant STAT_REALLOC_MIN = 20;
    uint256 public constant UNLOCK_COST = 20;
    uint256 public constant UNLOCK_START_VALUE = 40;
    uint256 public constant TOPUP_KICK_PER_STEP = 100; // 100 KICK per 0.001 BNB
    uint256 public constant TOPUP_STEP_PRICE = 0.001 ether;
    uint256 public constant TOPUP_MIN = 100;
    uint256 public constant TOPUP_MAX_PER_CALL = 500;
    uint256 public constant TOPUP_MAX_PER_DAY = 500;
    uint256 public constant MAX_NAME_BYTES = 32;
    // Fee split on every BNB payment: 90% pool / 8% buyback treasury / 2% creator.
    uint256 public constant POOL_SHARE_BPS = 9000;
    uint256 public constant TREASURY_SHARE_BPS = 800;
    uint256 public constant CREATOR_SHARE_BPS = 200;
    uint256 public constant ROYALTY_BPS = 500; // 5% ERC-2981

    /// @notice SPACE ID Agent ID registry on BNB Chain (immutable).
    IAgentID public immutable agentIdRegistry;
    /// @notice Creator wallet W. Set ONLY from the explicit constructor
    /// argument — never msg.sender (CREATE2 proxy is msg.sender at deploy
    /// time; Fateborn v1 defect). Identity/metadata only, except the
    /// narrow settleWeekly() below.
    address payable public immutable creator;

    string private _baseURI;

    struct TokenMeta {
        uint8 kind;
        uint8 item; // player: position 0..3; item: item id; badge: 0; legend: 30..33
        uint32 serial;
        uint256 mintDay;
    }

    struct Player {
        string name;
        uint8 position;
        uint8[5] stats;
        uint256 surplusPoints;
        uint256 positionChanges;
        uint256 lastCoachDay;
        uint256 lastTopUpDay;
        uint256 topUpToday; // $KICK bought today (on-chain daily tracking)
        uint256 lastDrawDay;
        bool immortalClaimed;
    }

    TokenMeta[] internal _tokens;
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => bool) private _burned;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    mapping(uint256 => Player) internal _players; // by player tokenId
    mapping(address => uint256) private _playerToken;
    mapping(address => bool) private _hasPlayer;
    mapping(bytes32 => bool) private _nameTaken;
    mapping(uint256 => mapping(uint8 => bool)) private _unlocked; // player tokenId => newStatId
    mapping(uint256 => mapping(uint8 => uint8)) private _extraStats; // player tokenId => newStatId => value
    mapping(uint256 => uint8[]) private _unlockedIds; // player tokenId => unlocked ids in order
    mapping(address => uint256) private _drawCount; // lifetime draws (draw seed)
    address[] private _playerList;

    uint256 public rewardPool; // BNB (wei) earmarked for weekly rewards
    uint256 public buybackTreasury; // BNB (wei) accrued for the Season 2 $KICK buyback
    uint256 public totalBurned;
    uint256 private _nonce;
    bool private _locked;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event PlayerMinted(
        address indexed user,
        uint256 indexed playerTokenId,
        uint8 position,
        string playerName,
        uint256 day,
        uint256 itemTokenId,
        uint8 item
    );
    event ItemDrawn(address indexed user, uint256 indexed day, uint8 item, uint256 tokenId);
    event PositionChanged(
        address indexed user, uint256 indexed playerTokenId, uint8 oldPosition, uint8 newPosition, uint256 totalPreserved
    );
    event CoachSession(
        address indexed user,
        uint256 indexed playerTokenId,
        uint8 statIndex,
        uint8 newValue,
        uint256 surplusGained,
        uint16 injuryChanceBps,
        uint256 poolShare,
        uint256 treasuryShare,
        uint256 creatorShare
    );
    event TopUp(
        address indexed user,
        uint256 kickAmount,
        uint256 value,
        uint256 day,
        uint256 poolShare,
        uint256 treasuryShare,
        uint256 creatorShare
    );
    event StatUnlocked(address indexed user, uint256 indexed playerTokenId, uint8 newStatId, uint8 startValue);
    event ImmortalRewarded(
        address indexed user, uint256 indexed playerTokenId, uint256 badgeTokenId, uint256 legendTokenId, uint8 legendItem
    );
    event ItemUsed(address indexed user, uint256 indexed tokenId, uint8 item);
    event WeeklySettled(address indexed creator, uint256 totalPaid, uint256 recipientCount);
    event PoolFunded(address indexed from, uint256 amount);

    /// @param registry Agent ID registry (SPACE ID).
    /// @param creator_ Creator wallet W — set from this argument ONLY.
    /// Must be an EOA the creator controls: setBaseURI is creator-only,
    /// settleWeekly pays out in BNB, and the 2% creator fee share is a
    /// plain BNB call to this address. NEVER msg.sender: deployed via
    /// the CREATE2 proxy, msg.sender is the proxy (Fateborn v1 defect).
    constructor(address registry, address creator_) {
        require(registry != address(0), "registry is zero address");
        require(creator_ != address(0), "creator is zero address");
        agentIdRegistry = IAgentID(registry);
        creator = payable(creator_);
    }

    /// @notice The creator's identity alias (cf. FatebornMutant.owner()).
    function owner() public view returns (address) {
        return creator;
    }

    /// @notice The creator's ONLY metadata privilege: set the metadata base
    /// URI. Callable ONLY by the creator, and ONLY before any mint — once
    /// tokens exist the URI is frozen, so no token's metadata can ever be
    /// re-pointed. No withdraw, no rescue, no game power.
    function setBaseURI(string calldata uri) external {
        require(msg.sender == creator, "not creator");
        require(_tokens.length == 0, "base URI frozen after first mint");
        _baseURI = uri;
    }

    function baseURI() external view returns (string memory) {
        return _baseURI;
    }

    /// @dev Any BNB that reaches this contract (including ERC-2981
    /// royalties paid to it by marketplaces) joins the reward pool.
    receive() external payable {
        rewardPool += msg.value;
        emit PoolFunded(msg.sender, msg.value);
    }

    modifier nonReentrant() {
        require(!_locked, "reentrant");
        _locked = true;
        _;
        _locked = false;
    }

    // ----- Agent ID gate -----

    /// @notice True if `account` holds at least one Agent ID.
    function hasAgentId(address account) public view returns (bool) {
        return agentIdRegistry.balanceOf(account) > 0;
    }

    function hasPlayer(address account) public view returns (bool) {
        return _hasPlayer[account];
    }

    /// @notice Player token id for `user`. Reverts if they have no player.
    function playerOf(address user) public view returns (uint256) {
        require(_hasPlayer[user], "no player");
        return _playerToken[user];
    }

    // ----- Name tables -----

    function positionName(uint8 position) public pure returns (string memory) {
        if (position == 0) return "Goalkeeper";
        if (position == 1) return "Defender";
        if (position == 2) return "Midfielder";
        if (position == 3) return "Forward";
        revert("invalid position");
    }

    /// @notice The 5 stat names for a position, in stat-index order.
    function statNames(uint8 position) public pure returns (string[5] memory names) {
        if (position == 0) {
            names = ["Reflexes", "Diving", "Handling", "Distribution", "Positioning"];
        } else if (position == 1) {
            names = ["Tackling", "Marking", "Heading", "Strength", "Pace"];
        } else if (position == 2) {
            names = ["Passing", "Vision", "Dribbling", "Stamina", "Long Shots"];
        } else if (position == 3) {
            names = ["Finishing", "Pace", "Dribbling", "Heading", "Off the Ball"];
        } else {
            revert("invalid position");
        }
    }

    function statName(uint8 position, uint8 statIndex) public pure returns (string memory) {
        require(statIndex < 5, "invalid stat index");
        return statNames(position)[statIndex];
    }

    function dailyItemName(uint8 item) public pure returns (string memory) {
        require(item < DAILY_ITEM_TYPES, "invalid daily item");
        if (item == 0) return "Protein Shake";
        if (item == 1) return "Vitamin";
        if (item == 2) return "Electrolyte Drink";
        if (item == 3) return "Banana";
        return "Ice Bath";
    }

    /// @notice Supermarket item names, ids 10..18 (S1: off-chain inventory
    /// only — these ids exist here so frontend/backend agree on the table).
    function supermarketItemName(uint8 item) public pure returns (string memory) {
        require(item >= 10 && item <= 18, "invalid supermarket item");
        if (item == 10) return "Recovery Shake Pro";
        if (item == 11) return "Energy Gel";
        if (item == 12) return "Sleep Mask Pro";
        if (item == 13) return "Knee Brace";
        if (item == 14) return "Ankle Tape";
        if (item == 15) return "Muscle Rub";
        if (item == 16) return "Physio Session";
        if (item == 17) return "Medical Kit";
        return "Cryotherapy";
    }

    /// @notice Legend NFT names, ids 30..33 (by position).
    function legendName(uint8 item) public pure returns (string memory) {
        if (item == LEGEND_GOLDEN_BOOT) return "Golden Boot Legend";
        if (item == LEGEND_GOLDEN_GLOVE) return "Golden Glove Legend";
        if (item == LEGEND_GOLDEN_SHIELD) return "Golden Shield Legend";
        if (item == LEGEND_GOLDEN_PLAYMAKER) return "Golden Playmaker Legend";
        revert("invalid legend");
    }

    /// @notice New-stat names for unlock ids (specialist 10-12/20-22/
    /// 30-32/40-42, universal 50-54).
    function newStatName(uint8 newStatId) public pure returns (string memory) {
        if (newStatId == 10) return "Penalty Saving";
        if (newStatId == 11) return "Command of Area";
        if (newStatId == 12) return "Sweeper Keeper";
        if (newStatId == 20) return "Anticipation";
        if (newStatId == 21) return "Ball Playing";
        if (newStatId == 22) return "Leadership";
        if (newStatId == 30) return "Set Pieces";
        if (newStatId == 31) return "Creativity / Flair";
        if (newStatId == 32) return "Work Rate";
        if (newStatId == 40) return "Weak Foot";
        if (newStatId == 41) return "Composure / Clutch";
        if (newStatId == 42) return "Skill Moves";
        if (newStatId == 50) return "Leadership";
        if (newStatId == 51) return "Clutch";
        if (newStatId == 52) return "Durability";
        if (newStatId == 53) return "Consistency";
        if (newStatId == 54) return "Versatility";
        revert("invalid new stat");
    }

    /// @notice True if `newStatId` can be unlocked by a player of
    /// `position` (own specialists + universals 50..54).
    function isValidNewStat(uint8 position, uint8 newStatId) public pure returns (bool) {
        if (newStatId >= 50 && newStatId <= 54) return true;
        if (position == 0) return newStatId >= 10 && newStatId <= 12;
        if (position == 1) return newStatId >= 20 && newStatId <= 22;
        if (position == 2) return newStatId >= 30 && newStatId <= 32;
        if (position == 3) return newStatId >= 40 && newStatId <= 42;
        return false;
    }

    /// @notice Legend NFT item id for a position (FW 30, GK 31, DF 32, MF 33).
    function legendItemForPosition(uint8 position) public pure returns (uint8) {
        if (position == 0) return LEGEND_GOLDEN_GLOVE;
        if (position == 1) return LEGEND_GOLDEN_SHIELD;
        if (position == 2) return LEGEND_GOLDEN_PLAYMAKER;
        if (position == 3) return LEGEND_GOLDEN_BOOT;
        revert("invalid position");
    }

    // ----- Randomness -----

    function _today() internal view returns (uint256) {
        return block.timestamp / SECONDS_PER_DAY;
    }

    function _rand(uint256 salt) internal returns (uint256) {
        _nonce++;
        return uint256(
            keccak256(
                abi.encodePacked(blockhash(block.number - 1), block.prevrandao, msg.sender, salt, _nonce)
            )
        );
    }

    /// @dev Uniform daily-item roll: 0..4 across the 5 daily items.
    function _drawItem(address user, uint256 day, uint256 salt) internal returns (uint8) {
        uint256 seed = uint256(
            keccak256(
                abi.encodePacked(
                    blockhash(block.number - 1), block.prevrandao, user, day, salt, _drawCount[user]
                )
            )
        );
        _drawCount[user] += 1;
        return uint8(seed % DAILY_ITEM_TYPES);
    }

    /// @dev Re-allocate `total` across 5 stats for a new position, each
    /// stat in [STAT_REALLOC_MIN, STAT_CAP], sum exactly preserved.
    /// Sequential bounded draw: at each slot the pick is clamped so the
    /// remaining slots can still reach the remaining total.
    function _reallocate(uint256 total, uint256 saltBase) internal returns (uint8[5] memory out) {
        require(total >= 5 * STAT_REALLOC_MIN && total <= 5 * STAT_CAP, "total out of range");
        uint256 remaining = total;
        for (uint8 i = 0; i < 4; i++) {
            uint256 rest = 4 - i; // slots after this one
            uint256 lo = remaining > STAT_CAP * rest ? remaining - STAT_CAP * rest : STAT_REALLOC_MIN;
            uint256 hi = remaining - STAT_REALLOC_MIN * rest;
            if (hi > STAT_CAP) hi = STAT_CAP;
            uint256 span = hi - lo + 1;
            uint256 pick = lo + (_rand(saltBase + i) % span);
            out[i] = uint8(pick);
            remaining -= pick;
        }
        out[4] = uint8(remaining);
    }

    // ----- Internal token bookkeeping -----

    function _isSoulbound(uint8 kind) internal pure returns (bool) {
        return kind == KIND_PLAYER || kind == KIND_BADGE;
    }

    function _mint(address user, TokenMeta memory t) internal returns (uint256 tokenId) {
        tokenId = _tokens.length;
        _tokens.push(t);
        _owners[tokenId] = user;
        _balances[user] += 1;
        emit Transfer(address(0), user, tokenId);
    }

    function _burn(address user, uint256 tokenId) internal {
        _burned[tokenId] = true;
        _owners[tokenId] = address(0);
        _balances[user] -= 1;
        _tokenApprovals[tokenId] = address(0);
        totalBurned += 1;
        emit Transfer(user, address(0), tokenId);
    }

    function _requireToken(uint256 tokenId) internal view returns (TokenMeta storage t) {
        require(tokenId < _tokens.length && !_burned[tokenId], "token does not exist");
        t = _tokens[tokenId];
    }

    function _requireOwned(uint256 tokenId, uint8 kind) internal view returns (TokenMeta storage t) {
        t = _requireToken(tokenId);
        require(_owners[tokenId] == msg.sender, "not your token");
        require(t.kind == kind, "wrong token kind");
    }

    function _requirePlayer() internal view returns (uint256 playerTokenId, Player storage p) {
        require(_hasPlayer[msg.sender], "no player");
        playerTokenId = _playerToken[msg.sender];
        p = _players[playerTokenId];
    }

    /// @dev Split a BNB payment 90/8/2 (pool / buyback treasury / creator).
    /// The creator share is paid immediately; the other two accrue as
    /// tracked balances. Returns (poolShare, treasuryShare, creatorShare).
    function _splitFee(uint256 value)
        internal
        returns (uint256 poolShare, uint256 treasuryShare, uint256 creatorShare)
    {
        creatorShare = (value * CREATOR_SHARE_BPS) / 10000;
        treasuryShare = (value * TREASURY_SHARE_BPS) / 10000;
        poolShare = value - creatorShare - treasuryShare;
        rewardPool += poolShare;
        buybackTreasury += treasuryShare;
        (bool ok, ) = creator.call{value: creatorShare}("");
        require(ok, "creator payout failed");
    }

    // ----- Mint player + Day-1 draw (one tx) -----

    /// @notice Mint your Player NFT (gas only) and draw the Day-1 free
    /// item in the SAME tx. That draw counts as today’s daily draw —
    /// dailyDraw() cannot be called again that day. One player per
    /// Agent ID holder, names unique first-come, position 0 GK / 1 DF /
    /// 2 MF / 3 FW. Each base stat starts 40..60 random, cap 99.
    function mintPlayer(string calldata playerName, uint8 position)
        external
        returns (uint256 playerTokenId, uint256 itemTokenId)
    {
        require(hasAgentId(msg.sender), "sender holds no Agent ID");
        require(!_hasPlayer[msg.sender], "already has a player");
        bytes memory nameBytes = bytes(playerName);
        require(nameBytes.length > 0 && nameBytes.length <= MAX_NAME_BYTES, "name must be 1-32 bytes");
        require(position <= 3, "invalid position");
        bytes32 nameHash = keccak256(nameBytes);
        require(!_nameTaken[nameHash], "name already taken");

        _nameTaken[nameHash] = true;
        uint256 today = _today();

        uint8[5] memory stats;
        for (uint8 i = 0; i < 5; i++) {
            stats[i] = uint8(STAT_START_MIN + (_rand(0xB001 + i) % (STAT_START_MAX - STAT_START_MIN + 1)));
        }

        playerTokenId = _mint(
            msg.sender, TokenMeta({kind: KIND_PLAYER, item: position, serial: 0, mintDay: today})
        );
        Player storage p = _players[playerTokenId];
        p.name = playerName;
        p.position = position;
        p.stats = stats;
        p.lastDrawDay = today;
        _playerToken[msg.sender] = playerTokenId;
        _hasPlayer[msg.sender] = true;
        _playerList.push(msg.sender);

        uint8 item = _drawItem(msg.sender, today, 0);
        itemTokenId = _mint(
            msg.sender, TokenMeta({kind: KIND_ITEM, item: item, serial: 0, mintDay: today})
        );
        emit PlayerMinted(msg.sender, playerTokenId, position, playerName, today, itemTokenId, item);
        emit ItemDrawn(msg.sender, today, item, itemTokenId);
    }

    // ----- Daily draw -----

    /// @notice Draw today’s free item (gas only). One per UTC day per
    /// player, Agent ID holders only. Random across the 5 daily items.
    function dailyDraw() external returns (uint256 tokenId) {
        require(hasAgentId(msg.sender), "sender holds no Agent ID");
        (, Player storage p) = _requirePlayer();
        uint256 today = _today();
        require(p.lastDrawDay != today, "already drawn today");
        p.lastDrawDay = today;
        uint8 item = _drawItem(msg.sender, today, 1);
        tokenId = _mint(msg.sender, TokenMeta({kind: KIND_ITEM, item: item, serial: 0, mintDay: today}));
        emit ItemDrawn(msg.sender, today, item, tokenId);
    }

    // ----- Position change -----

    /// @notice Change position for exactly 0.001 BNB, max 1 per season
    /// (Season 1 = seasonId 1). The 5 base stats are re-allocated for
    /// the new position PRESERVING THE TOTAL SUM (each stat 20..99, sum
    /// exactly preserved). $KICK, items, history and unlocked stats are
    /// untouched. The player name never changes (no rename exists).
    function changePosition(uint8 newPosition) external payable nonReentrant {
        require(hasAgentId(msg.sender), "sender holds no Agent ID");
        require(newPosition <= 3, "invalid position");
        require(msg.value == POSITION_CHANGE_PRICE, "position change costs exactly 0.001 BNB");
        (uint256 playerTokenId, Player storage p) = _requirePlayer();
        require(p.position != newPosition, "already that position");
        require(p.positionChanges < POSITION_CHANGES_PER_SEASON, "position change already used this season");

        uint256 total;
        for (uint8 i = 0; i < 5; i++) total += p.stats[i];
        uint8 oldPosition = p.position;
        uint8[5] memory newStats = _reallocate(total, 0x9A11);
        p.stats = newStats;
        p.position = newPosition;
        p.positionChanges += 1;
        _tokens[playerTokenId].item = newPosition;
        _splitFee(msg.value);
        emit PositionChanged(msg.sender, playerTokenId, oldPosition, newPosition, total);
    }

    // ----- Coach session -----

    /// @notice 1-on-1 Coach Session: exactly 0.001 BNB, max 1 per UTC day
    /// per player, +4 to the chosen base stat (cap 99; every +1 that
    /// would have exceeded 99 goes to surplusPoints instead, 1 per +1).
    /// Injury is OFF-CHAIN (Workers enforce it); the 3% figure is
    /// recorded in the event only (injuryChanceBps = 300).
    /// Payment splits 90% reward pool / 8% buyback treasury / 2% creator.
    function coachSession(uint8 statIndex) external payable nonReentrant returns (uint8 newValue) {
        require(hasAgentId(msg.sender), "sender holds no Agent ID");
        require(statIndex < 5, "invalid stat index");
        require(msg.value == COACH_PRICE, "coach session costs exactly 0.001 BNB");
        (uint256 playerTokenId, Player storage p) = _requirePlayer();
        uint256 today = _today();
        require(p.lastCoachDay != today, "coach session already used today");
        p.lastCoachDay = today;

        uint256 surplusGained;
        uint256 raised = uint256(p.stats[statIndex]) + COACH_GAIN;
        if (raised > STAT_CAP) {
            surplusGained = raised - STAT_CAP;
            p.stats[statIndex] = uint8(STAT_CAP);
            p.surplusPoints += surplusGained;
        } else {
            p.stats[statIndex] = uint8(raised);
        }
        newValue = p.stats[statIndex];
        (uint256 poolShare, uint256 treasuryShare, uint256 creatorShare) = _splitFee(msg.value);
        emit CoachSession(
            msg.sender,
            playerTokenId,
            statIndex,
            newValue,
            surplusGained,
            uint16(COACH_INJURY_CHANCE_BPS),
            poolShare,
            treasuryShare,
            creatorShare
        );
    }

    // ----- $KICK top-up (BNB -> off-chain $KICK) -----

    /// @notice Buy $KICK with BNB for the OFF-CHAIN ledger: 100 $KICK per
    /// 0.001 BNB. kickAmount must be a multiple of 100, 100..500 per call,
    /// max 500 per UTC day per player (on-chain daily tracking).
    /// msg.value must equal kickAmount/100 * 0.001 ether exactly.
    /// The Workers backend credits $KICK by indexing the TopUp event;
    /// this contract holds NO $KICK token. Same 90/8/2 split as coach.
    function topUpKick(uint256 kickAmount) external payable nonReentrant {
        require(hasAgentId(msg.sender), "sender holds no Agent ID");
        require(kickAmount >= TOPUP_MIN && kickAmount <= TOPUP_MAX_PER_CALL, "top-up is 100-500 KICK per call");
        require(kickAmount % TOPUP_KICK_PER_STEP == 0, "kick amount must be a multiple of 100");
        (, Player storage p) = _requirePlayer();
        uint256 today = _today();
        if (p.lastTopUpDay != today) {
            p.lastTopUpDay = today;
            p.topUpToday = 0;
        }
        require(p.topUpToday + kickAmount <= TOPUP_MAX_PER_DAY, "daily top-up cap is 500 KICK");
        uint256 expectedValue = (kickAmount / TOPUP_KICK_PER_STEP) * TOPUP_STEP_PRICE;
        require(msg.value == expectedValue, "wrong value for kick amount");
        p.topUpToday += kickAmount;
        (uint256 poolShare, uint256 treasuryShare, uint256 creatorShare) = _splitFee(msg.value);
        emit TopUp(msg.sender, kickAmount, msg.value, today, poolShare, treasuryShare, creatorShare);
    }

    // ----- Surplus unlocks -----

    /// @notice Spend 20 surplusPoints to unlock a new stat, starting at
    /// 40 (cap 99, trainable like a normal stat off-chain thereafter).
    /// Valid ids: own position's 3 specialists + universals 50..54.
    /// Each new stat can be unlocked once.
    function unlockNewStat(uint8 newStatId) external {
        require(hasAgentId(msg.sender), "sender holds no Agent ID");
        (uint256 playerTokenId, Player storage p) = _requirePlayer();
        require(isValidNewStat(p.position, newStatId), "stat not available for this position");
        require(!_unlocked[playerTokenId][newStatId], "stat already unlocked");
        require(p.surplusPoints >= UNLOCK_COST, "need 20 surplus points");
        p.surplusPoints -= UNLOCK_COST;
        _unlocked[playerTokenId][newStatId] = true;
        _extraStats[playerTokenId][newStatId] = uint8(UNLOCK_START_VALUE);
        _unlockedIds[playerTokenId].push(newStatId);
        emit StatUnlocked(msg.sender, playerTokenId, newStatId, uint8(UNLOCK_START_VALUE));
    }

    // ----- Immortal XI reward -----

    /// @notice Claim the all-99 reward: ONLY when ALL 5 base stats are
    /// exactly 99 (total 495). Mints the soulbound Immortal XI Badge
    /// (kind 2) AND the position Legend NFT (kind 3, tradeable:
    /// FW Golden Boot 30, GK Golden Glove 31, DF Golden Shield 32,
    /// MF Golden Playmaker 33). Once per player only.
    function claimImmortalReward() external returns (uint256 badgeTokenId, uint256 legendTokenId) {
        require(hasAgentId(msg.sender), "sender holds no Agent ID");
        (uint256 playerTokenId, Player storage p) = _requirePlayer();
        require(!p.immortalClaimed, "immortal reward already claimed");
        uint256 total;
        for (uint8 i = 0; i < 5; i++) {
            require(p.stats[i] == STAT_CAP, "all 5 base stats must be 99");
            total += p.stats[i];
        }
        require(total == 5 * STAT_CAP, "all 5 base stats must be 99");
        p.immortalClaimed = true;
        uint256 today = _today();
        uint8 legendItem = legendItemForPosition(p.position);
        badgeTokenId = _mint(msg.sender, TokenMeta({kind: KIND_BADGE, item: 0, serial: 0, mintDay: today}));
        legendTokenId = _mint(
            msg.sender, TokenMeta({kind: KIND_LEGEND, item: legendItem, serial: 0, mintDay: today})
        );
        emit ImmortalRewarded(msg.sender, playerTokenId, badgeTokenId, legendTokenId, legendItem);
    }

    // ----- Use (burn) an item -----

    /// @notice Burn a tradeable Item NFT you own. The item's EFFECT
    /// (fatigue / injury) is applied OFF-CHAIN by Workers — the contract
    /// only proves ownership + burn. Emits ItemUsed for the backend.
    function useItem(uint256 tokenId) external {
        TokenMeta storage t = _requireOwned(tokenId, KIND_ITEM);
        uint8 item = t.item;
        _burn(msg.sender, tokenId);
        emit ItemUsed(msg.sender, tokenId, item);
    }

    // ----- Weekly settle (the ONLY creator power over funds) -----

    /// @notice Distribute weekly rewards. Callable ONLY by the creator,
    /// pays ONLY from the rewardPool balance, sum(amounts) <= rewardPool,
    /// NO recipient may be the creator address, recipients/amounts
    /// lengths must match and be non-empty. This is the ONLY creator
    /// power over funds: the creator cannot withdraw the pool for
    /// itself and cannot change odds, caps, stats or fees.
    function settleWeekly(address[] calldata recipients, uint256[] calldata amounts)
        external
        nonReentrant
    {
        require(msg.sender == creator, "not creator");
        require(recipients.length > 0, "no recipients");
        require(recipients.length == amounts.length, "length mismatch");
        uint256 total;
        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "recipient is zero address");
            require(recipients[i] != creator, "creator cannot be a recipient");
            total += amounts[i];
        }
        require(total <= rewardPool, "amount exceeds reward pool");
        rewardPool -= total;
        for (uint256 i = 0; i < recipients.length; i++) {
            if (amounts[i] == 0) continue;
            (bool ok, ) = recipients[i].call{value: amounts[i]}("");
            require(ok, "settle payout failed");
        }
        emit WeeklySettled(msg.sender, total, recipients.length);
    }

    // ----- Views -----

    function totalMinted() external view returns (uint256) {
        return _tokens.length;
    }

    function playersCount() external view returns (uint256) {
        return _playerList.length;
    }

    function getPlayers(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        if (limit > 100) limit = 100;
        if (offset >= _playerList.length || limit == 0) return new address[](0);
        uint256 end = offset + limit;
        if (end > _playerList.length) end = _playerList.length;
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = _playerList[i];
        }
    }

    /// @notice Full player card: 5 base stats, position, name, total, overall.
    function playerStats(uint256 tokenId)
        external
        view
        returns (
            uint8[5] memory stats,
            uint8 position,
            string memory playerName,
            uint256 total,
            uint256 overall
        )
    {
        TokenMeta storage t = _requireToken(tokenId);
        require(t.kind == KIND_PLAYER, "not a player token");
        Player storage p = _players[tokenId];
        stats = p.stats;
        position = p.position;
        playerName = p.name;
        for (uint8 i = 0; i < 5; i++) total += stats[i];
        overall = total / 5;
    }

    /// @notice Surplus points for a player (0 for wallets with no player).
    function surplusPointsOf(address user) external view returns (uint256) {
        if (!_hasPlayer[user]) return 0;
        return _players[_playerToken[user]].surplusPoints;
    }

    /// @notice Unlocked extra stats for a player: parallel id/value arrays.
    function unlockedStatsOf(address user)
        external
        view
        returns (uint8[] memory ids, uint8[] memory values)
    {
        if (!_hasPlayer[user]) return (new uint8[](0), new uint8[](0));
        uint256 tokenId = _playerToken[user];
        ids = _unlockedIds[tokenId];
        values = new uint8[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            values[i] = _extraStats[tokenId][ids[i]];
        }
    }

    /// @notice One unlocked stat: (unlocked, current value). Value is 0
    /// when locked.
    function extraStatOf(uint256 tokenId, uint8 newStatId) external view returns (bool unlocked, uint8 value) {
        _requireToken(tokenId);
        unlocked = _unlocked[tokenId][newStatId];
        value = _extraStats[tokenId][newStatId];
    }

    function isStatUnlocked(uint256 tokenId, uint8 newStatId) external view returns (bool) {
        _requireToken(tokenId);
        return _unlocked[tokenId][newStatId];
    }

    function positionChangesOf(address user) external view returns (uint256) {
        if (!_hasPlayer[user]) return 0;
        return _players[_playerToken[user]].positionChanges;
    }

    /// @notice True if `user` could dailyDraw() right now (holder +
    /// player + not yet today).
    function canDrawToday(address user) external view returns (bool) {
        if (!hasAgentId(user) || !_hasPlayer[user]) return false;
        return _players[_playerToken[user]].lastDrawDay != _today();
    }

    /// @notice True if `user` could coachSession() right now (holder +
    /// player + not yet today).
    function canCoachToday(address user) external view returns (bool) {
        if (!hasAgentId(user) || !_hasPlayer[user]) return false;
        return _players[_playerToken[user]].lastCoachDay != _today();
    }

    /// @notice $KICK the player may still top up today (500 cap minus
    /// today's bought amount; 0 when the day rolls over it resets).
    function topUpLeftToday(address user) external view returns (uint256) {
        if (!_hasPlayer[user]) return 0;
        Player storage p = _players[_playerToken[user]];
        if (p.lastTopUpDay != _today()) return TOPUP_MAX_PER_DAY;
        return p.topUpToday >= TOPUP_MAX_PER_DAY ? 0 : TOPUP_MAX_PER_DAY - p.topUpToday;
    }

    function lastDrawDayOf(address user) external view returns (uint256) {
        if (!_hasPlayer[user]) return 0;
        return _players[_playerToken[user]].lastDrawDay;
    }

    function tokenKind(uint256 tokenId) external view returns (uint8) {
        return _requireToken(tokenId).kind;
    }

    function tokenItem(uint256 tokenId) external view returns (uint8) {
        return _requireToken(tokenId).item;
    }

    function isBurned(uint256 tokenId) external view returns (bool) {
        require(tokenId < _tokens.length, "token does not exist");
        return _burned[tokenId];
    }

    // ----- ERC-721 -----

    function balanceOf(address owner_) external view returns (uint256) {
        require(owner_ != address(0), "zero address");
        return _balances[owner_];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        require(tokenId < _tokens.length && !_burned[tokenId], "token does not exist");
        address tokenOwner = _owners[tokenId];
        require(tokenOwner != address(0), "token does not exist");
        return tokenOwner;
    }

    function _transfer(address from, address to, uint256 tokenId) internal {
        _tokenApprovals[tokenId] = address(0);
        _owners[tokenId] = to;
        _balances[from] -= 1;
        _balances[to] += 1;
        emit Transfer(from, to, tokenId);
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        require(tokenId < _tokens.length && !_burned[tokenId], "token does not exist");
        require(!_isSoulbound(_tokens[tokenId].kind), "AgentFootball: this token is soulbound");
        require(_owners[tokenId] == from, "from is not the owner");
        require(to != address(0), "transfer to zero address");
        require(
            msg.sender == from || msg.sender == _tokenApprovals[tokenId] || _operatorApprovals[from][msg.sender],
            "not owner or approved"
        );
        _transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        require(_checkOnERC721Received(from, to, tokenId, data), "transfer to non-ERC721 receiver");
    }

    function _checkOnERC721Received(address from, address to, uint256 tokenId, bytes memory data)
        internal
        returns (bool)
    {
        if (to.code.length == 0) return true;
        (bool ok, bytes memory ret) = to.call(
            abi.encodeWithSelector(0x150b7a5e, msg.sender, from, tokenId, data)
        );
        if (!ok || ret.length < 32) return false;
        return abi.decode(ret, (bytes4)) == bytes4(0x150b7a5e);
    }

    function approve(address approved, uint256 tokenId) external {
        require(tokenId < _tokens.length && !_burned[tokenId], "token does not exist");
        require(!_isSoulbound(_tokens[tokenId].kind), "AgentFootball: this token is soulbound");
        address tokenOwner = _owners[tokenId];
        require(msg.sender == tokenOwner || _operatorApprovals[tokenOwner][msg.sender], "not owner or operator");
        _tokenApprovals[tokenId] = approved;
        emit Approval(tokenOwner, approved, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        require(tokenId < _tokens.length && !_burned[tokenId], "token does not exist");
        return _tokenApprovals[tokenId];
    }

    function isApprovedForAll(address owner_, address operator) external view returns (bool) {
        return _operatorApprovals[owner_][operator];
    }

    // ----- ERC-2981 royalties -----

    /// @notice 5% royalty on every token, paid to this contract — royalties
    /// flow into the reward pool (see receive()).
    function royaltyInfo(uint256 tokenId, uint256 salePrice)
        external
        view
        returns (address receiver, uint256 royaltyAmount)
    {
        require(tokenId < _tokens.length && !_burned[tokenId], "token does not exist");
        return (address(this), (salePrice * ROYALTY_BPS) / 10000);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == 0x01ffc9a7 || // ERC165
            interfaceId == 0x80ac58cd || // ERC721
            interfaceId == 0x5b5e139f || // ERC721Metadata
            interfaceId == 0x2a55205a; // ERC2981
    }

    // ----- Metadata -----

    /// @notice Dynamic metadata (Fateborn/AXR pattern): baseURI + tokenId
    /// points at the Cloudflare Pages Functions endpoint /metadata/<id>,
    /// which reads playerStats()/tokenKind() and returns JSON. NOT IPFS —
    /// IPFS metadata cannot change, and a training player must change.
    function tokenURI(uint256 tokenId) external view returns (string memory) {
        require(tokenId < _tokens.length && !_burned[tokenId], "token does not exist");
        if (bytes(_baseURI).length == 0) return "";
        return string(abi.encodePacked(_baseURI, _toString(tokenId)));
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
