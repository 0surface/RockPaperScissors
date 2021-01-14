const RockPaperScissors = artifacts.require("RockPaperScissors");
const timeHelper = require("./util/timeHelper");
const truffleAssert = require("truffle-assertions");
const chai = require("chai");
const { BN } = web3.utils.BN;
const { assert, expect } = chai;
chai.use(require("chai-bn")(BN));

contract("RockPaperScissors", (accounts) => {
  before(async () => {
    it("TestRPC  must have adequate number of addresses", () => {
      assert.isAtLeast(accounts.length, 4, "Test has enough addresses");
    });
  });

  let rockPaperScissors;
  const CHOICE = {
    NONE: 0,
    ROCK: 1,
    PAPER: 2,
    SCISSORS: 3,
  };
  let MIN_GAME_LIFETIME;
  let MAX_GAME_LIFETIME;
  let MIN_STAKE;
  let POST_COMMIT_WAIT_WINDOW;
  let gameId;
  let gameLifeTime;
  let deployedInstanceAddress;
  let maskTimestampOne;
  let maskedChoiceOne;
  let maskTimestampTwo;
  let maskedChoiceTwo;
  let playerOneStaked;
  let playerTwoStaked;
  let totalStaked = new BN(0);
  const deployer = accounts[0];
  const playerOne = accounts[1];
  const playerOneChoice = CHOICE.SCISSORS;
  const playerTwo = accounts[2];
  const playerTwoChoice = CHOICE.PAPER;
  const someoneElse = accounts[3];
  const playerOne_choiceMaskString = web3.utils.fromAscii("1c04ddc043e");
  const playerTwo_choiceMaskString = web3.utils.fromAscii("01c43e4ddc0");
  const wrongMaskString = web3.utils.fromAscii("35c4ed3dc0");
  const gas = 4000000;
  const timestampSkipSeconds = 15;

  async function getMaskedChoice(player, choice, maskString, maskTimestamp) {
    return await rockPaperScissors.contract.methods
      .generateMaskedChoice(choice, maskString, player, maskTimestamp)
      .call({ from: player });
  }

  async function setUpTest() {
    rockPaperScissors = await RockPaperScissors.new({ from: deployer });
    deployedInstanceAddress = rockPaperScissors.address;
    MIN_GAME_LIFETIME = await rockPaperScissors.MIN_GAME_LIFETIME.call();
    MAX_GAME_LIFETIME = await rockPaperScissors.MAX_GAME_LIFETIME.call();
    MIN_STAKE = await rockPaperScissors.MIN_STAKE.call();
    POST_COMMIT_WAIT_WINDOW = await rockPaperScissors.POST_COMMIT_WAIT_WINDOW.call(); //1 day
    gameLifeTime = MIN_GAME_LIFETIME;
    playerOneStaked = MIN_STAKE;

    //create masked choice for playerOne
    maskTimestampOne = (await web3.eth.getBlock("latest")).timestamp;
    maskedChoiceOne = await getMaskedChoice(playerOne, playerOneChoice, playerOne_choiceMaskString, maskTimestampOne);

    //create game and commit
    await rockPaperScissors.contract.methods
      .createAndCommit(playerTwo, maskedChoiceOne, gameLifeTime, playerOneStaked)
      .send({ from: playerOne, value: playerOneStaked, gas: gas });
    totalStaked = playerOneStaked.add(playerOneStaked);
    await timeHelper.advanceTimeAndBlock(timestampSkipSeconds);

    //set gameId variable
    gameId = (await rockPaperScissors.nextGameId.call()).toNumber();
  }

  describe("Pre-enrol reveal test", () => {
    beforeEach("create and set game state variables", async () => {
      await setUpTest();
    });
    it("should revert if caller second player has not yet commited/enrolled", async () => {
      await timeHelper.advanceTimeAndBlock(timestampSkipSeconds);
      await truffleAssert.reverts(
        rockPaperScissors.contract.methods
          .reveal(gameId, playerOneChoice, playerOne_choiceMaskString, maskTimestampOne)
          .send({ from: playerOne, gas: gas })
      );
    });
    it("should execute finishTiedGame function if game is a tie", async () => {
      //create masked choice for playerTwo
      maskTimestampTwo = (await web3.eth.getBlock("latest")).timestamp;
      maskedChoiceTwo = await getMaskedChoice(playerTwo, playerOneChoice, playerTwo_choiceMaskString, maskTimestampTwo);

      //Enrol with same choice as playerOne
      await timeHelper.advanceTimeAndBlock(timestampSkipSeconds);
      playerTwoStaked = playerOneStaked;
      await rockPaperScissors.contract.methods
        .enrolAndCommit(gameId, maskedChoiceTwo)
        .send({ from: playerTwo, value: playerTwoStaked, gas: gas });

      //reveal by player one
      await timeHelper.advanceTimeAndBlock(timestampSkipSeconds);
      await rockPaperScissors.contract.methods
        .reveal(gameId, playerOneChoice, playerOne_choiceMaskString, maskTimestampOne)
        .send({ from: playerOne, gas: gas });

      //reveal by player two
      await timeHelper.advanceTimeAndBlock(timestampSkipSeconds);
      const secondRevealTxObj = await rockPaperScissors.contract.methods
        .reveal(gameId, playerOneChoice, playerTwo_choiceMaskString, maskTimestampTwo)
        .send({ from: playerTwo, gas: gas });

      let txResult = await truffleAssert.createTransactionResult(rockPaperScissors, secondRevealTxObj.transactionHash);

      //Assert
      truffleAssert.eventEmitted(txResult, "LogWinningsBalanceChanged");
      truffleAssert.eventEmitted(txResult, "LogWinningsBalanceChanged");
      truffleAssert.eventEmitted(txResult, "LogGameTied");

      const gameObj = await rockPaperScissors.games.call(gameId);
      expect(gameObj.deadline).to.be.a.bignumber.that.equals(new BN(0), "game has not finished after winner revealed");
      expect(gameObj.stake).to.be.a.bignumber.that.equals(new BN(0), "game has not finished after winner revealed");
    });
  });

  describe("Post-enrol reveal tests", () => {
    beforeEach("deploy a fresh contract, get game variables, create & enrol", async () => {
      await setUpTest();

      //create masked choice for playerTwo
      maskTimestampTwo = (await web3.eth.getBlock("latest")).timestamp;
      maskedChoiceTwo = await getMaskedChoice(playerTwo, playerTwoChoice, playerTwo_choiceMaskString, maskTimestampTwo);

      //Advance block & timestamp forward to aboid posible out of gas exception
      await timeHelper.advanceTimeAndBlock(timestampSkipSeconds);

      //Enrol and commit
      playerTwoStaked = playerOneStaked;
      await rockPaperScissors.contract.methods
        .enrolAndCommit(gameId, maskedChoiceTwo)
        .send({ from: playerTwo, value: playerTwoStaked, gas: gas });
    });

    it("should revert if game has expired", async () => {
      //Expire game
      const gameDeadline = (await rockPaperScissors.games.call(gameId)).deadline.toNumber();
      const currentTimestamp = (await web3.eth.getBlock("latest")).timestamp;
      await timeHelper.advanceTimeAndBlock(1 + gameDeadline - currentTimestamp);

      //Assert
      await truffleAssert.reverts(
        rockPaperScissors.contract.methods
          .reveal(gameId, playerOneChoice, playerOne_choiceMaskString, maskTimestampOne)
          .send({ from: playerOne, gas: gas })
      );
    });

    it("should revert if input choice is not correct", async () => {
      const wrongChoice = playerOneChoice === CHOICE.SCISSORS ? CHOICE.ROCK : CHOICE.PAPER;
      await truffleAssert.reverts(
        rockPaperScissors.contract.methods
          .reveal(gameId, wrongChoice, playerOne_choiceMaskString, maskTimestampOne)
          .send({ from: playerOne, gas: gas })
      );
    });

    it("should revert if input mask is not correct", async () => {
      await truffleAssert.reverts(
        rockPaperScissors.contract.methods
          .reveal(gameId, playerOneChoice, wrongMaskString, maskTimestampOne)
          .send({ from: playerOne, gas: gas })
      );
    });
    it("should revert if input maskingTimestamp is not correct", async () => {
      await truffleAssert.reverts(
        rockPaperScissors.contract.methods
          .reveal(gameId, playerOneChoice, playerOne_choiceMaskString, 42)
          .send({ from: playerOne, gas: gas })
      );
    });
    it("should revert if caller address is not a player", async () => {
      await truffleAssert.reverts(
        rockPaperScissors.contract.methods
          .reveal(gameId, playerOneChoice, playerOne_choiceMaskString, maskTimestampOne)
          .send({ from: someoneElse, gas: gas })
      );
    });

    it("should store revealed choice in storage", async () => {
      //reveal by player one
      await timeHelper.advanceTimeAndBlock(timestampSkipSeconds);
      await rockPaperScissors.contract.methods
        .reveal(gameId, playerOneChoice, playerOne_choiceMaskString, maskTimestampOne)
        .send({ from: playerOne, gas: gas });

      const playerOneGameMove = await rockPaperScissors.contract.methods.getGameMove(gameId, playerOne).call({ from: deployer });
      assert.strictEqual(Number(playerOneGameMove.choice), playerOneChoice, "revealed choice does not match choice in storaged");
    });

    it("should emit LogChoiceRevealed event if revealing first ", async () => {
      //reveal by player one
      await timeHelper.advanceTimeAndBlock(timestampSkipSeconds);
      const txReceipt = await rockPaperScissors.contract.methods
        .reveal(gameId, playerOneChoice, playerOne_choiceMaskString, maskTimestampOne)
        .send({ from: playerOne, gas: gas });

      const eventVars = txReceipt.events.LogChoiceRevealed.returnValues;
      assert.isDefined(txReceipt.events.LogChoiceRevealed, "LogChoiceRevealed is not emitted");
      assert.strictEqual(Number(eventVars.gameId), gameId, "LogChoiceRevealed event gameId is incorrect");
      assert.strictEqual(Number(eventVars.choice), playerOneChoice, "LogChoiceRevealed event choice is incorrect");
    });

    it("should execute finish function if revealer has won", async () => {
      //reveal by player one
      await timeHelper.advanceTimeAndBlock(timestampSkipSeconds);
      await rockPaperScissors.contract.methods
        .reveal(gameId, playerOneChoice, playerOne_choiceMaskString, maskTimestampOne)
        .send({ from: playerOne, gas: gas });

      //reveal by player two
      await timeHelper.advanceTimeAndBlock(timestampSkipSeconds);
      const secondRevealTxObj = await rockPaperScissors.contract.methods
        .reveal(gameId, playerTwoChoice, playerTwo_choiceMaskString, maskTimestampTwo)
        .send({ from: playerTwo, gas: gas });

      let txResult = await truffleAssert.createTransactionResult(rockPaperScissors, secondRevealTxObj.transactionHash);

      truffleAssert.eventEmitted(
        txResult,
        "LogWinningsBalanceChanged",
        (ev) => ev.player === playerOne,
        "LogWinningsBalanceChanged should be emitted with correct parameters"
      );
      truffleAssert.eventEmitted(
        txResult,
        "LogGameFinished",
        (ev) => ev.winner === playerOne && ev.loser === playerTwo,
        "LogGameFinished should be emitted with correct parameters"
      );
      const gameObj = await rockPaperScissors.games.call(gameId);
      expect(gameObj.deadline).to.be.a.bignumber.that.equals(new BN(0), "game has not finished after winner revealed");
      expect(gameObj.stake).to.be.a.bignumber.that.equals(new BN(0), "game has not finished after winner revealed");
    });
  });
});
