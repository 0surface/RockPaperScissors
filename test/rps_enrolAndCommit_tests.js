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
  const deployer = accounts[0];
  const playerOne = accounts[1];
  const playerOneChoice = CHOICE.SCISSORS;
  const playerTwo = accounts[2];
  const playerTwoChoice = CHOICE.PAPER;
  const someoneElse = accounts[3];
  const playerOne_choiceMaskString = web3.utils.fromAscii("1c04ddc043e");
  const playerTwo_choiceMaskString = web3.utils.fromAscii("01c43e4ddc0");
  const gas = 3000000;
  let maskedChoice;
  let gameId;
  let maskingTimestampOne;
  let maskedChoiceOne;
  let gameLifeTime;
  let gameStaked;
  const NULL_BYTES = "0x0000000000000000000000000000000000000000000000000000000000000000";

  async function getMaskedChoice(player, choice, maskString) {
    const _maskingTimestamp_ = (await web3.eth.getBlock("latest")).timestamp;
    return await rockPaperScissors.contract.methods
      .generateMaskedChoice(choice, maskString, player, _maskingTimestamp_)
      .call({ from: player });
  }

  describe("enrolAndCommit function tests", () => {
    beforeEach("deploy a fresh contract, create game by playerOne", async () => {
      //Deploy contract
      rockPaperScissors = await RockPaperScissors.new({ from: deployer });

      //create masked choice for playerOne
      maskingTimestampOne = (await web3.eth.getBlock("latest")).timestamp;
      maskedChoiceOne = await rockPaperScissors.contract.methods
        .generateMaskedChoice(playerOneChoice, playerOne_choiceMaskString, playerOne, maskingTimestampOne)
        .call({ from: playerOne });

      MIN_GAME_LIFETIME = await rockPaperScissors.MIN_GAME_LIFETIME.call();
      MAX_GAME_LIFETIME = await rockPaperScissors.MAX_GAME_LIFETIME.call();
      MIN_STAKE = await rockPaperScissors.MIN_STAKE.call();
      POST_COMMIT_WAIT_WINDOW = await rockPaperScissors.POST_COMMIT_WAIT_WINDOW.call(); //1 day

      //create game and commit
      gameLifeTime = MIN_GAME_LIFETIME;
      gameStaked = MIN_STAKE;
      await rockPaperScissors.contract.methods
        .createAndCommit(playerTwo, maskedChoiceOne, gameLifeTime, gameStaked)
        .send({ from: playerOne, value: MIN_STAKE, gas: gas });

      //set gameId variable
      gameId = (await rockPaperScissors.nextGameId.call()).toNumber();
    });

    it("should revert if game has expired", async () => {
      //Act - advance time  beyond deadline (add 1 second in ganace evm environment)
      const latestBlock = await timeHelper.advanceTimeAndBlock(gameLifeTime.toNumber() + 1);

      //Assert
      const _maskedChoice = await getMaskedChoice(playerTwo, playerTwoChoice, playerTwo_choiceMaskString);
      await truffleAssert.reverts(
        rockPaperScissors.contract.methods
          .enrolAndCommit(gameId, _maskedChoice, gameStaked)
          .send({ from: playerTwo, value: gameStaked, gas: gas }),
        "RockPaperScissors::enrolAndCommit:game has expired (or does not exist)"
      );
    });
    it("should revert when given null maskedChoice value", async () => {
      await truffleAssert.reverts(
        rockPaperScissors.contract.methods
          .enrolAndCommit(gameId, NULL_BYTES, gameStaked)
          .send({ from: playerTwo, value: gameStaked, gas: gas }),
        "RockPaperScissors::enrolAndCommit:Invalid maskedChoice value"
      );
    });
    it("should revert if sender is not playerTwo", async () => {
      const _maskedChoice = await getMaskedChoice(someoneElse, playerTwoChoice, playerTwo_choiceMaskString);
      await truffleAssert.reverts(
        rockPaperScissors.contract.methods
          .enrolAndCommit(gameId, _maskedChoice, gameStaked)
          .send({ from: someoneElse, value: gameStaked, gas: gas }),
        "RockPaperScissors::enrolAndCommit:Invalid player"
      );
    });
    it("should revert if playerTwo has a non null commit value", async () => {
      //Arrange
      const _maskedChoice_A = await getMaskedChoice(someoneElse, playerTwoChoice, playerTwo_choiceMaskString);

      await rockPaperScissors.contract.methods
        .enrolAndCommit(gameId, _maskedChoice_A, gameStaked)
        .send({ from: playerTwo, value: gameStaked, gas: gas });

      //Act

      //Assert
      const _maskedChoice = await getMaskedChoice(someoneElse, playerTwoChoice, playerTwo_choiceMaskString);
      await truffleAssert.reverts(
        rockPaperScissors.contract.methods
          .enrolAndCommit(gameId, _maskedChoice, gameStaked)
          .send({ from: playerTwo, value: gameStaked, gas: gas }),
        "RockPaperScissors::enrolAndCommit:player is already enrolled"
      );
    });
    it("should revert if msg.value is insufficient", async () => {
      const _maskedChoice = await getMaskedChoice(someoneElse, playerTwoChoice, playerTwo_choiceMaskString);
      await truffleAssert.reverts(
        rockPaperScissors.contract.methods
          .enrolAndCommit(gameId, _maskedChoice, gameStaked)
          .send({ from: playerTwo, value: 0, gas: gas }),
        "RockPaperScissors::enrolAndCommit:Insuffcient balance to stake"
      );
    });

    it("should revert if amountTostake is insufficient", async () => {
      const _maskedChoice = await getMaskedChoice(someoneElse, playerTwoChoice, playerTwo_choiceMaskString);
      await truffleAssert.reverts(
        rockPaperScissors.contract.methods
          .enrolAndCommit(gameId, _maskedChoice, gameStaked.toNumber() - 1000)
          .send({ from: playerTwo, value: gameStaked.toNumber() - 1000, gas: gas }),
        "RockPaperScissors::enrolAndCommit:Insuffcient balance, amountToStake is below required stake in Game"
      );
    });

    it("should emit LogGameEnrolled event on successful enrolment", async () => {
      //Arrange
      const amountToStake = MIN_STAKE;
      const _maskingTimestamp_ = (await web3.eth.getBlock()).timestamp;
      const _maskedChoice = await rockPaperScissors.contract.methods
        .generateMaskedChoice(playerTwoChoice, playerTwo_choiceMaskString, playerTwo, _maskingTimestamp_)
        .call({ from: playerTwo });
      //Act
      const enrolTxObj = await rockPaperScissors.contract.methods
        .enrolAndCommit(gameId, _maskedChoice, amountToStake)
        .send({ from: playerTwo, value: amountToStake, gas: gas });

      const eventValues = enrolTxObj.events.LogGameEnrolled.returnValues;

      //Assert
      assert.isDefined(enrolTxObj.events.LogGameEnrolled, "LogGameEnrolled is not emitted");
      assert.strictEqual(eventValues.gameId, gameId.toString(), "LogGameEnrolled event gameId value is incorrect");
      assert.strictEqual(eventValues.commiter, playerTwo, "LogGameEnrolled event commiter value is incorrect");
      assert.isFalse(eventValues.stakedFromWinnings, "LogGameEnrolled event stakedFromWinnings value is incorrect");
      expect(new BN(eventValues.staked)).to.be.a.bignumber.that.equals(MIN_STAKE);
    });

    it("should set to STORAGE maskedChoice value on successful enrolment", async () => {
      //Arrange
      const _maskedChoice = await getMaskedChoice(playerTwo, playerTwoChoice, playerTwo_choiceMaskString);

      //Act
      const enrolTxObj = await rockPaperScissors.contract.methods
        .enrolAndCommit(gameId, _maskedChoice, gameStaked)
        .send({ from: playerTwo, value: gameStaked, gas: gas });

      const playerTwo_Move = await rockPaperScissors.contract.methods.getGameMove(gameId, playerTwo).call({ from: deployer });

      //Assert
      assert.strictEqual(playerTwo_Move._commit, _maskedChoice, "Incorrect maskedChoice value");
      assert.strictEqual(playerTwo_Move.choice, CHOICE.NONE.toString(), `choice value should be None`);
    });

    it("should extend deadline by POST_COMMIT_WAIT_WINDOW value if due", async () => {
      //Arrange
      const _maskedChoice = await getMaskedChoice(playerTwo, playerTwoChoice, playerTwo_choiceMaskString);
      // - enrol player two,
      const gameObj = await rockPaperScissors.games.call(gameId);
      const deadlineBefore = gameObj.deadline;
      const expectedNewDeadline = deadlineBefore.add(POST_COMMIT_WAIT_WINDOW);

      //Act
      /* No need to advance time as min_game_lifetime(1hours) < POST_COMMIT_WAIT_WINDOW (12 hours)*/
      enrolTxObj = await rockPaperScissors.contract.methods
        .enrolAndCommit(gameId, _maskedChoice, gameStaked)
        .send({ from: playerTwo, value: gameStaked, gas: gas });

      const deadlineAfter = (await rockPaperScissors.games.call(gameId)).deadline;

      //Assert
      expect(deadlineAfter).to.be.a.bignumber.that.equals(expectedNewDeadline);
    });
  });
});
