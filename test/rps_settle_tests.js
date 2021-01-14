const RockPaperScissors = artifacts.require("RockPaperScissors");
const timeHelper = require("./util/timeHelper");
const truffleAssert = require("truffle-assertions");
const eventAssert = require("./util/eventAssertionHelper");
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
  const playerTwo = accounts[2];
  const someoneElse = accounts[3];
  const playerOne_choiceMaskString = web3.utils.fromAscii("1c04ddc043e");
  const playerTwo_choiceMaskString = web3.utils.fromAscii("01c43e4ddc0");
  const gas = 4000000;
  const timestampSkipSeconds = 15;

  async function getMaskedChoice(player, choice, maskString, maskTimestamp) {
    return await rockPaperScissors.contract.methods
      .generateMaskedChoice(choice, maskString, player, maskTimestamp)
      .call({ from: player });
  }

  async function expireGame() {
    const gameDeadline = (await rockPaperScissors.games.call(gameId)).deadline.toNumber();
    const currentTimestamp = (await web3.eth.getBlock("latest")).timestamp;
    return await timeHelper.advanceTimeAndBlock(1 + gameDeadline - currentTimestamp);
  }

  async function setUpTest(playerOneChoice, playerTwoChoice) {
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

    //Advance block & timestamp forward to aboid posible out of gas exception
    await timeHelper.advanceTimeAndBlock(timestampSkipSeconds);

    //reveal by player one
    await timeHelper.advanceTimeAndBlock(timestampSkipSeconds);
    await rockPaperScissors.contract.methods
      .reveal(gameId, playerOneChoice, playerOne_choiceMaskString, maskTimestampOne)
      .send({ from: playerOne, gas: gas });
  }

  describe("pre-deadline settle function test", () => {
    beforeEach("create game, commit choices", async () => {
      await setUpTest(CHOICE.SCISSORS, CHOICE.PAPER);
    });
    it("should revert when invoked before game has expired", async () => {
      //Assert
      await truffleAssert.reverts(
        rockPaperScissors.contract.methods.settle(gameId).send({ from: playerOne, gas: gas }),
        "RockPaperScissors::settle:Game has not yet expired"
      );
    });
  });

  describe("post-deadline settle function tests", () => {
    const p1_choice = CHOICE.SCISSORS;
    beforeEach("", async () => {
      await setUpTest(p1_choice, CHOICE.PAPER);
      await expireGame();
    });

    it("should settle and erase game", async () => {
      //Act
      await rockPaperScissors.contract.methods.settle(gameId).send({ from: playerOne, gas: gas });

      //Assert
      const winnerBalance = await rockPaperScissors.winnings.call(playerOne);
      expect(winnerBalance).to.be.a.bignumber.that.equal(totalStaked);

      const gameObj = await rockPaperScissors.games.call(gameId);
      expect(gameObj.deadline).to.be.a.bignumber.that.equals(new BN(0), "game has not finished after winner revealed");
      expect(gameObj.stake).to.be.a.bignumber.that.equals(new BN(0), "game has not finished after winner revealed");
    });

    it("should emit events expected when a player wins", async () => {
      //Act
      const txReceipt = await rockPaperScissors.contract.methods.settle(gameId).send({ from: playerOne, gas: gas });

      //Assert
      eventAssert.eventIsEmitted(txReceipt, "LogWinningsBalanceChanged");
      eventAssert.eventIsEmitted(txReceipt, "LogGameFinished");
      eventAssert.parameterIsValid(txReceipt, "LogGameFinished", "gameId", gameId, "LogGameFinished  gameId  incorrect");
      eventAssert.parameterIsValid(txReceipt, "LogGameFinished", "winner", playerOne, "LogGameFinished  playerOne  incorrect");
      eventAssert.parameterIsValid(txReceipt, "LogGameFinished", "loser", playerTwo, "LogGameFinished  playerTwo  incorrect");
      eventAssert.parameterIsValid(
        txReceipt,
        "LogGameFinished",
        "winnerChoice",
        p1_choice,
        "LogGameFinished winnerChoice is incorrect"
      );
      eventAssert.parameterIsValid(txReceipt, "LogGameFinished", "resolver", playerOne, "LogGameFinished  resolver  incorrect");
      eventAssert.parameterIsValid(txReceipt, "LogGameFinished", "pay", totalStaked, "LogGameFinished  pay  incorrect");
    });

    it("should allow any address to settle a game", async () => {
      //Act
      const txReceipt = await rockPaperScissors.contract.methods.settle(gameId).send({ from: someoneElse, gas: gas });

      //Assert
      eventAssert.eventIsEmitted(txReceipt, "LogWinningsBalanceChanged");
      eventAssert.eventIsEmitted(txReceipt, "LogGameFinished");
    });
  });

  describe("post-deadline choice dependant settle function tests", () => {
    it("should settle with playerOne as Winner and pay game total stake", async () => {
      //Arrange
      await setUpTest(CHOICE.SCISSORS, CHOICE.PAPER);
      await expireGame();

      //Act
      await rockPaperScissors.contract.methods.settle(gameId).send({ from: playerOne, gas: gas });

      //Assert
      const winnerBalance = await rockPaperScissors.winnings.call(playerOne);
      expect(winnerBalance).to.be.a.bignumber.that.equal(totalStaked, "playerOne not set as winner/payed on settle");
    });

    it("should settle with playerTwo as Winner and pay game total stake", async () => {
      //Arrange
      await setUpTest(CHOICE.PAPER, CHOICE.SCISSORS);
      await expireGame();

      //Act
      await rockPaperScissors.contract.methods.settle(gameId).send({ from: playerOne, gas: gas });

      //Assert
      const winnerBalance = await rockPaperScissors.winnings.call(playerOne);
      expect(winnerBalance).to.be.a.bignumber.that.equal(totalStaked, "playerTwo not set as winner/payed on settle");
    });

    it("should settle with playerOne as Winner and pay back playerOne's stake", async () => {
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
      maskedChoiceOne = await getMaskedChoice(playerOne, CHOICE.PAPER, playerOne_choiceMaskString, maskTimestampOne);

      //create game and commit
      await rockPaperScissors.contract.methods
        .createAndCommit(playerTwo, maskedChoiceOne, gameLifeTime, playerOneStaked)
        .send({ from: playerOne, value: playerOneStaked, gas: gas });
      totalStaked = playerOneStaked.add(playerOneStaked);
      await timeHelper.advanceTimeAndBlock(timestampSkipSeconds);

      //set gameId variable
      gameId = (await rockPaperScissors.nextGameId.call()).toNumber();
      await expireGame();

      //Act
      await rockPaperScissors.contract.methods.settle(gameId).send({ from: playerOne, gas: gas });

      //Assert
      const winnerBalance = await rockPaperScissors.winnings.call(playerOne);
      expect(winnerBalance).to.be.a.bignumber.that.equal(playerOneStaked, "playerOne not set as winner/payed on settle");
    });
  });

  describe("when both players have commited, but not revealed and game expires", () => {
    it("should settle game as tied and pay each player set with own stake", async () => {
      //Arrange
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
      maskedChoiceOne = await getMaskedChoice(playerOne, CHOICE.PAPER, playerOne_choiceMaskString, maskTimestampOne);

      //create game and commit
      await rockPaperScissors.contract.methods
        .createAndCommit(playerTwo, maskedChoiceOne, gameLifeTime, playerOneStaked)
        .send({ from: playerOne, value: playerOneStaked, gas: gas });
      totalStaked = playerOneStaked.add(playerOneStaked);
      await timeHelper.advanceTimeAndBlock(timestampSkipSeconds);

      //set gameId variable
      gameId = (await rockPaperScissors.nextGameId.call()).toNumber();

      //Advance block & timestamp forward to aboid posible out of gas exception
      await timeHelper.advanceTimeAndBlock(timestampSkipSeconds);

      //Enrol and commit
      playerTwoStaked = playerOneStaked;
      await rockPaperScissors.contract.methods
        .enrolAndCommit(gameId, maskedChoiceTwo)
        .send({ from: playerTwo, value: playerTwoStaked, gas: gas });

      await expireGame();

      //Advance block & timestamp forward to aboid posible out of gas exception
      await timeHelper.advanceTimeAndBlock(timestampSkipSeconds);

      //Act
      await rockPaperScissors.contract.methods.settle(gameId).send({ from: deployer, gas: gas });

      //Assert
      const playerOneBalance = await rockPaperScissors.winnings.call(playerOne);
      const playerTwoBalance = await rockPaperScissors.winnings.call(playerTwo);

      expect(playerOneBalance).to.be.a.bignumber.that.equal(
        playerOneStaked,
        "playerOne not set owed stake when game is settled as tied"
      );
      expect(playerTwoBalance).to.be.a.bignumber.that.equal(
        playerTwoStaked,
        "playerTwo not set owed stake when game is settled as tied"
      );
    });
  });
});
