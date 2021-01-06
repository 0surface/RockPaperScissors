const RockPaperScissors = artifacts.require("RockPaperScissors");
const truffleAssert = require("truffle-assertions");
const chai = require("chai");
const truffleAssertions = require("truffle-assertions");
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
  let maskedChoice;
  let MIN_GAME_LIFETIME;
  let MAX_GAME_LIFETIME;
  let MIN_STAKE;
  const CHOICE = {
    NONE: 0,
    ROCK: 1,
    PAPER: 2,
    SCISSORS: 3,
  };
  const deployer = accounts[0];
  const playerOne = accounts[1];
  const playerOneChoice = CHOICE.SCISSORS;
  const playerTwo = accounts[2];
  const gas = 2000000;
  const choiceMaskString = web3.utils.fromAscii("1c04ddc043e");
  const _nullBytes = "0x0000000000000000000000000000000000000000000000000000000000000000";

  describe("createandcommit tests", () => {
    beforeEach("deploy a fresh contract, generate a choice", async () => {
      rockPaperScissors = await RockPaperScissors.new({ from: deployer });
      const maskingTimestamp = (await web3.eth.getBlock()).timestamp;

      deployedInstanceAddress = rockPaperScissors.address;

      maskedChoice = await rockPaperScissors.contract.methods
        .generateMaskedChoice(playerOneChoice, choiceMaskString, playerOne, maskingTimestamp)
        .call({ from: playerOne });

      MIN_GAME_LIFETIME = await rockPaperScissors.MIN_GAME_LIFETIME.call();

      MAX_GAME_LIFETIME = await rockPaperScissors.MAX_GAME_LIFETIME.call();

      MIN_STAKE = await rockPaperScissors.MIN_STAKE.call();

      POST_COMMIT_WAIT_WINDOW = await rockPaperScissors.POST_COMMIT_WAIT_WINDOW.call(); //1 day
    });

    it("should revert when both players have same address", async () => {
      await truffleAssert.reverts(
        rockPaperScissors.contract.methods
          .createAndCommit(playerOne, maskedChoice, MIN_GAME_LIFETIME, MIN_STAKE)
          .send({ from: playerOne, value: MIN_STAKE, gas: gas })
      );
    });
    it("should revert when given null maskedChoice value", async () => {
      await truffleAssertions.reverts(
        rockPaperScissors.contract.methods
          .createAndCommit(playerOne, _nullBytes, MIN_GAME_LIFETIME, MIN_STAKE)
          .send({ from: playerOne, value: MIN_STAKE, gas: gas })
      );
    });
    it("should revert when gameLifeTime is below contract minimum", async () => {
      await truffleAssert.reverts(
        rockPaperScissors.contract.methods
          .createAndCommit(playerOne, _nullBytes, MIN_GAME_LIFETIME.toNumber() - 1, MIN_STAKE)
          .send({ from: playerOne, value: MIN_STAKE, gas: gas })
      );
    });
    it("should revert when gameLifeTime is above contract maximum", async () => {
      await truffleAssert.reverts(
        rockPaperScissors.contract.methods
          .createAndCommit(playerOne, _nullBytes, MAX_GAME_LIFETIME.toNumber() + 1, MIN_STAKE)
          .send({ from: playerOne, value: MIN_STAKE, gas: gas })
      );
    });
    it("should revert when amountToStake is below contract minimum", async () => {
      if (MIN_STAKE > 0) {
        await truffleAssert.reverts(
          rockPaperScissors.contract.methods
            .createAndCommit(playerOne, _nullBytes, MAX_GAME_LIFETIME.toNumber() + 1, 0)
            .send({ from: playerOne, value: MIN_STAKE, gas: gas })
        );
      }
    });
    it("should emit LogGameCreated event on successful game creation", async () => {
      //Arrange
      const gameIdCountBefore = await rockPaperScissors.nextGameId.call();
      const _expectedGameId = gameIdCountBefore.add(new BN(1));
      const gameLifeTime = MIN_GAME_LIFETIME;

      //Act
      const txObj = await rockPaperScissors.contract.methods
        .createAndCommit(playerTwo, maskedChoice, gameLifeTime, MIN_STAKE)
        .send({ from: playerOne, value: MIN_STAKE, gas: gas });

      const creationBlock = await web3.eth.getBlock(txObj.blockNumber);
      const _expectedDeadline_BN = new BN(creationBlock.timestamp).add(new BN(gameLifeTime));
      const eventValues = txObj.events.LogGameCreated.returnValues;

      //Assert
      assert.isDefined(txObj.events.LogGameCreated, "LogGameCreated event not emitted");
      assert.strictEqual(eventValues.playerOne, playerOne, "LogGameCreated event playerOne value is incorrect");
      assert.strictEqual(eventValues.playerTwo, playerTwo, "LogGameCreated event playerTwo value is incorrect");
      assert.strictEqual(eventValues.maskedChoice, maskedChoice, "LogGameCreated event maskedChoice value is incorrect");
      assert.isFalse(eventValues.stakedFromWinnings, "LogGameCreated event stakedFromWinnings value should be false");
      expect(eventValues.staked).to.be.a.bignumber.that.equals(new BN(MIN_STAKE));
      expect(new BN(eventValues.deadline)).to.be.a.bignumber.that.equals(_expectedDeadline_BN);
      expect(new BN(eventValues.gameId)).to.be.a.bignumber.that.equals(_expectedGameId);
    });
    it("should increment nextGameId on successful game creation", async () => {
      //Arrange
      const gameIdCountBefore = await rockPaperScissors.nextGameId.call();

      //Act
      const txObj = await rockPaperScissors.contract.methods
        .createAndCommit(playerTwo, maskedChoice, MIN_GAME_LIFETIME, MIN_STAKE)
        .send({ from: playerOne, value: MIN_STAKE, gas: gas });

      //Assert
      const gameIdCountAfter = await rockPaperScissors.nextGameId.call();
      expect(gameIdCountAfter).to.be.a.bignumber.that.equals(gameIdCountBefore + new BN(1));
    });
    it("should set STORAGE values on successful game creation", async () => {
      //Arrange
      const gameLifeTime = MIN_GAME_LIFETIME;
      const expectedPlayersKey = await rockPaperScissors.contract.methods
        .addressXor(playerOne, playerTwo)
        .call({ fom: deployer });

      //Act
      const txObj = await rockPaperScissors.contract.methods
        .createAndCommit(playerTwo, maskedChoice, gameLifeTime, MIN_STAKE)
        .send({ from: playerOne, value: MIN_STAKE, gas: gas });

      const _gameId = await rockPaperScissors.nextGameId.call();
      const creationBlock = await web3.eth.getBlock(txObj.blockNumber);
      const gameObj = await rockPaperScissors.games.call(_gameId);
      const playerOne_Move = await rockPaperScissors.contract.methods
        .getGameMove(Number(_gameId), playerOne)
        .call({ from: deployer });

      //Assert
      expect(gameObj.stake).to.be.a.bignumber.that.equals(new BN(MIN_STAKE));
      expect(gameObj.deadline).to.be.a.bignumber.that.equals(new BN(creationBlock.timestamp).add(new BN(gameLifeTime)));
      assert.strictEqual(gameObj.playerOne, playerOne, "Incorrect playerOne value");
      assert.strictEqual(playerOne_Move._commit, maskedChoice, "incorrect commited value");
      assert.strictEqual(playerOne_Move.choice, CHOICE.NONE.toString(), "choice value should be None");
      assert.strictEqual(gameObj.playersKey, expectedPlayersKey, "incorrect xor of addresses");
    });
    it("should add to winnings balance when msg.value > amountToStake", async () => {
      //Arrange
      const playerOneWinningsBefore = await rockPaperScissors.winnings.call(playerOne);
      const amountToStake = MIN_STAKE;
      const excessValue = MIN_STAKE;
      const sentValue = MIN_STAKE.add(MIN_STAKE);

      //Act
      await rockPaperScissors.contract.methods
        .createAndCommit(playerTwo, maskedChoice, MIN_GAME_LIFETIME, amountToStake)
        .send({ from: playerOne, value: sentValue, gas: gas });
      const playerOneWinningsAfter = await rockPaperScissors.winnings.call(playerOne);
      const expectedWinnings = playerOneWinningsAfter.sub(playerOneWinningsBefore);

      //Assert
      expect(expectedWinnings).to.be.a.bignumber.that.equals(new BN(excessValue));
    });
    it("should emit LogWinningsBalanceChanged event when msg.value != amountToStake", async () => {
      //Arrange
      const playerOneWinningsBefore = await rockPaperScissors.winnings.call(playerOne);

      //Act
      const txObj = await rockPaperScissors.contract.methods
        .createAndCommit(playerTwo, maskedChoice, MIN_GAME_LIFETIME, MIN_STAKE)
        .send({ from: playerOne, value: MIN_STAKE.add(MIN_STAKE), gas: gas });
      const playerOneWinningsAfter = await rockPaperScissors.winnings.call(playerOne);
      const eventObjValues = txObj.events.LogWinningsBalanceChanged.returnValues;

      //Act
      assert.isDefined(txObj.events.LogWinningsBalanceChanged, "LogWinningsBalanceChanged not emitted");
      assert.strictEqual(eventObjValues.player, playerOne, "LogWinningsBalanceChanged event playerOne value is incorrect");
      assert.strictEqual(
        Number(eventObjValues.oldBalance),
        playerOneWinningsBefore.toNumber(),
        "LogWinningsBalanceChanged event oldBalance value is incorrect"
      );
      assert.strictEqual(
        Number(eventObjValues.newBalance),
        playerOneWinningsAfter.toNumber(),
        "LogWinningsBalanceChanged event newBalance value is incorrect"
      );
    });
  });
});
