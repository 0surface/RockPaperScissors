const RockPaperScissors = artifacts.require("RockPaperScissors");
const truffleAssert = require("truffle-assertions");
const chai = require("chai");
const { BN } = web3.utils.BN;
const { assert, expect } = chai;
chai.use(require("chai-bn")(BN));

contract("RockPaperScissors", (accounts) => {
  before(async () => {
    it("TestRPC  must have adequate number of addresses", () => {
      assert.isAtLeast(accounts.length, 3, "Test has enough addresses");
    });
  });

  let rockPaperScissors;
  let deployedInstanceAddress;
  let hashedChoice_1;
  const CHOICE = {
    NONE: 0,
    ROCK: 1,
    PAPER: 2,
    SCISSORS: 3,
  };
  const deployer = accounts[0];
  const playerOne = accounts[1];
  const playerTwo = accounts[2];
  const gas = 2000000;
  const choiceMaskString = web3.utils.fromAscii("1c04ddc043e");
  const _nullMaskValue = "0x0000000000000000000000000000000000000000000000000000000000000000";

  describe("createandcommit tests", () => {
    beforeEach("deploy a fresh contract, generate a choice", async () => {
      rockPaperScissors = await RockPaperScissors.new({ from: deployer });
      deployedInstanceAddress = rockPaperScissors.address;
      hashedChoice_1 = await rockPaperScissors.contract.methods
        .generateChoice(CHOICE.SCISSORS, choiceMaskString)
        .call({ from: playerOne });
    });

    it("should increment nextGameId on successful game creation", async () => {
      const gameLifeTime = await rockPaperScissors.DEFAULT_GAME_LIFETIME.call(); //1 day
      const gameIdCountBefore = await rockPaperScissors.nextGameId.call();

      const txObj = await rockPaperScissors.contract.methods
        .createandcommit(playerTwo, hashedChoice_1, gameLifeTime, false, 0)
        .send({ from: playerOne, value: 10000, gas: gas });
      const gameIdCountAfter = await rockPaperScissors.nextGameId.call();

      const createdGame = await rockPaperScissors.games.call(gameIdCountBefore);
      const gamePlayerOne = createdGame.playerOne;
      const gamePlayerTwo = createdGame.playerTwo;
      const playerTwoIsEnrolled = createdGame.playerTwoIsEnrolled;
      const stake = createdGame.stake;
      const deadline = createdGame.deadline;
      const lastCommitDeadline = createdGame.lastCommitDeadline;
      const playerOne_Move = await rockPaperScissors.contract.methods
        .getGameMove(gameIdCountBefore, playerOne)
        .call({ from: deployer });
      const playerOneCommit = playerOne_Move.commit;
      const playerOneChoice = playerOne_Move.choice;

      console.log("createdGame", createdGame);
      console.log("gamePlayerOne, gamePlayerTwo", gamePlayerOne, gamePlayerTwo);
      console.log("playerOne_Move", playerOne_Move);
      console.log("playerOneCommit", playerOneCommit);
      console.log("playerOneChoice", playerOneChoice);
      console.log("playerTwoIsEnrolled ", playerTwoIsEnrolled);
      console.log("stake", stake);
      console.log("deadline, lastCommitDeadline ", deadline, lastCommitDeadline);
      console.log("");

      expect(gameIdCountAfter).to.be.a.bignumber.that.equals(gameIdCountBefore + new BN(1));
    });

    it("should emit correct event on successful game creation", async () => {});

    it("should set expected game variables on successful game creation", async () => {});
    it("should set expected lastCommitDeadline value", async () => {});
    it("should set default gameLifeTime when given contract minimum", async () => {});

    it("should revert when both players have same address", async () => {});
    it("should revert when given null hashed choice value", async () => {});
    it("should revert when gameLifeTime is below contract minimum", async () => {});
    it("should revert when gameLifeTime is above contract maximum", async () => {});
    it("should revert when amountToStake is below contract minimum", async () => {});

    it("{stakeFromWinnings} should revert when amountToStake is below contract minimum", async () => {});
    it("{stakeFromWinnings} should revert when winnings and sent value is below contract minimum", async () => {});

    it("should revert when given", async () => {});
  });
});
