const RockPaperScissors = artifacts.require("RockPaperScissors");
const truffleAssert = require("truffle-assertions");
const chai = require("chai");
const { forEach } = require("lodash");
const truffleAssertions = require("truffle-assertions");
const { BN } = web3.utils.BN;
const { assert } = chai;
chai.use(require("chai-bn")(BN));

contract("RockPaperScissors", (accounts) => {
  before(async () => {
    it("TestRPC must have adequate number of addresses", () => {
      assert.isAtLeast(accounts.length, 1, "Test has enough addresses");
    });
  });

  let rockPaperScissors;
  const deployer = accounts[0];
  const minute = 60;
  const hour = 60 * minute;
  const day = 24 * hour;

  const optimal_no_commit_window = 15 * minute;
  const max_no_commit_window = 21 * minute;

  describe("calculateLastCommitTimestamp tests", () => {
    beforeEach("deploy a fresh contract", async () => {
      rockPaperScissors = await RockPaperScissors.new({ from: deployer });
    });

    it("should have a non-commit window of at least 21 minutes given MAX_GAME_LIFETIME", async () => {
      const max_game_lifetime = await rockPaperScissors.MAX_GAME_LIFETIME.call();
      const blocktimestamp = (await web3.eth.getBlock()).timestamp;
      const gameDeadline = blocktimestamp + max_game_lifetime;

      const result = await rockPaperScissors.contract.methods
        .calculateLastCommitTimestamp(max_game_lifetime, gameDeadline)
        .call({ from: deployer });

      assert.isTrue(gameDeadline - result >= max_no_commit_window, "result is less than expected noncommit window");
    });

    it("should have a non-commit window of at least 15 minutes given MIN_GAME_LIFETIME", async () => {
      const min_game_lifetime = await rockPaperScissors.MIN_GAME_LIFETIME.call();
      const blocktimestamp = (await web3.eth.getBlock()).timestamp;
      const gameDeadline = blocktimestamp + min_game_lifetime.toNumber();

      const result = await rockPaperScissors.contract.methods
        .calculateLastCommitTimestamp(min_game_lifetime.toNumber(), gameDeadline)
        .call({ from: deployer });

      assert.isTrue(gameDeadline - result >= optimal_no_commit_window, "result is less than expected noncommit window");
    });

    it("should have a non-commit window of 6 minutes given 0 gamelifetime", async () => {
      const blocktimestamp = (await web3.eth.getBlock()).timestamp;
      const gameDeadline = blocktimestamp;

      const result = await rockPaperScissors.contract.methods
        .calculateLastCommitTimestamp(0, gameDeadline)
        .call({ from: deployer });

      assert.isTrue(gameDeadline - result == 300, "result is less than expected noncommit window");
    });

    it("should have an optimal non-commit window ranges given a range of game lifetime values", async () => {
      const blocktimestamp = (await web3.eth.getBlock()).timestamp;
      const gameLifetimes = [day * 9, day * 7, day * 3, day * 1, hour * 18, hour * 10, hour * 5, hour * 2];

      for (let i = 0; i < gameLifetimes.length; i++) {
        const gameDeadline = blocktimestamp + gameLifetimes[i];

        let result = await rockPaperScissors.contract.methods
          .calculateLastCommitTimestamp(gameLifetimes[i], gameDeadline)
          .call({ from: deployer });

        assert.isTrue(gameDeadline - result >= optimal_no_commit_window, "result is less than expected noncommit window");
      }
    });

    it("should revert given 0 as input values", async () => {
      await truffleAssertions.reverts(
        rockPaperScissors.contract.methods.calculateLastCommitTimestamp(0, 0).call({ from: deployer }),
        "SafeMath: subtraction overflow"
      );
    });
  });
});
