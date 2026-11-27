// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./AgentFootball.sol";

/// @title AgentFootballTestHarness — LOCAL TESTS ONLY
/// @notice AgentFootball with test-only setters for base stats and surplus
/// points, so tests can exercise the all-99 Immortal reward, the coach
/// cap/surplus path, and exact-total position reallocations without
/// playing hundreds of on-chain days. Never deploy this to a live network.
contract AgentFootballTestHarness is AgentFootball {
    constructor(address registry, address creator_) AgentFootball(registry, creator_) {}

    /// @notice Test-only: overwrite a player's 5 base stats.
    function setBaseStatsForTest(uint256 tokenId, uint8[5] calldata stats) external {
        _players[tokenId].stats = stats;
    }

    /// @notice Test-only: add surplus points to a player.
    function addSurplusForTest(uint256 tokenId, uint256 amount) external {
        _players[tokenId].surplusPoints += amount;
    }

    /// @notice Test-only: overwrite a player's position (and the token's
    /// stored position) without paying or consuming the season change.
    function setPositionForTest(uint256 tokenId, uint8 position) external {
        _players[tokenId].position = position;
        _tokens[tokenId].item = position;
    }
}
