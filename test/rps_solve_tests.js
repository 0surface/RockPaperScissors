const RockPaperScissors = artifacts.require("RockPaperScissors");
const timeHelper = require("./util/timeHelper");
const eventAssert = require("./util/eventAssertionHelper");
const chai = require("chai");
const { BN } = web3.utils.BN;
const { assert, expect } = chai;
chai.use(require("chai-bn")(BN));

contract("RockPaperScissors", (accounts) => {
  before(async () => {
    it("TestRPC must have adequate number of addresses", () => {
      assert.isAtLeast(accounts.length, 1, "Test has enough addresses");
    });
  });

  let rockPaperScissors;
  let gameId;
  let playerOneStaked;
  let playerTwoStaked;
  const deployer = accounts[0];
  const CHOICE = {
    NONE: 0,
    ROCK: 1,
    PAPER: 2,
    SCISSORS: 3,
  };
  const playerOne = accounts[1];
  const playerTwo = accounts[2];
  const playerOne_choiceMaskString = web3.utils.fromAscii("1c04ddc043e");
  const playerTwo_choiceMaskString = web3.utils.fromAscii("01c43e4ddc0");
  const timestampSkipSeconds = 15;
  const gas = 4000000;

  async function getMaskedChoice(player, choice, maskString, maskTimestamp) {
    return await rockPaperScissors.contract.methods
      .generateMaskedChoice(choice, maskString, player, maskTimestamp)
      .call({ from: player });
  }

  async function SetUpTest(playerOneChoice, playerTwoChoice) {
    rockPaperScissors = await RockPaperScissors.new({ from: deployer });
    deployedInstanceAddress = rockPaperScissors.address;
    const gameLifeTime = await rockPaperScissors.MIN_GAME_LIFETIME.call();
    playerOneStaked = await rockPaperScissors.MIN_STAKE.call();

    //create masked choice for playerOne
    const maskTimestampOne = (await web3.eth.getBlock("latest")).timestamp;
    const maskedChoiceOne = await getMaskedChoice(playerOne, playerOneChoice, playerOne_choiceMaskString, maskTimestampOne);

    //create game and commit
    await rockPaperScissors.contract.methods
      .createAndCommit(playerTwo, maskedChoiceOne, gameLifeTime, playerOneStaked)
      .send({ from: playerOne, value: playerOneStaked, gas: gas });
    totalStaked = playerOneStaked.add(playerOneStaked);
    await timeHelper.advanceTimeAndBlock(timestampSkipSeconds);

    //set gameId variable
    gameId = (await rockPaperScissors.nextGameId.call()).toNumber();

    //create masked choice for playerTwo
    const maskTimestampTwo = (await web3.eth.getBlock("latest")).timestamp;
    const maskedChoiceTwo = await getMaskedChoice(playerTwo, playerTwoChoice, playerTwo_choiceMaskString, maskTimestampTwo);

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

    await timeHelper.advanceTimeAndBlock(timestampSkipSeconds);

    //reveal by player Two
    await timeHelper.advanceTimeAndBlock(timestampSkipSeconds);
    return await rockPaperScissors.contract.methods
      .reveal(gameId, playerTwoChoice, playerTwo_choiceMaskString, maskTimestampTwo)
      .send({ from: playerTwo, gas: gas });
  }

  async function setWinLoseGamesTests(playerOneChoice, playerTwoChoice) {
    const txObj = await SetUpTest(playerOneChoice, playerTwoChoice);
    eventAssert.eventIsEmitted(txObj, "LogWinningsBalanceChanged");
    eventAssert.eventIsEmitted(txObj, "LogGameFinished");
  }

  async function setTiedGamesTests(playerOneChoice, playerTwoChoice) {
    const txObj = await SetUpTest(playerOneChoice, playerTwoChoice);

    //Assert
    eventAssert.eventIsEmitted(txObj, "LogWinningsBalanceChanged");
    eventAssert.eventIsEmitted(txObj, "LogGameTied");

    const eventTiedParams = eventAssert.getEventParams(txObj, "LogGameTied");
    eventAssert.prameterIsValid(txObj, "LogGameTied", "gameId", gameId, "LogGameTied gameId incorrect");
    eventAssert.prameterIsValid(txObj, "LogGameTied", "resolver", playerTwo, "LogGameTied resolver incorrect");
    eventAssert.prameterIsValid(txObj, "LogGameTied", "choice", playerOneChoice, "LogGameTied choice incorrect");

    const playerOneBalance = await rockPaperScissors.winnings.call(playerOne);
    const playerTwoBalance = await rockPaperScissors.winnings.call(playerTwo);
    expect(playerOneBalance).to.be.a.bignumber.that.equal(playerOneStaked);
    expect(playerTwoBalance).to.be.a.bignumber.that.equal(playerTwoStaked);
  }

  describe("solve tests", () => {
    it("(ROCK, ROCK) should set game as tied", async () => {
      await setTiedGamesTests(CHOICE.ROCK, CHOICE.ROCK);
    });
    it("(PAPER, PAPER) should set game as tied", async () => {
      await setTiedGamesTests(CHOICE.PAPER, CHOICE.PAPER);
    });
    it("(SCISSORS, SCISSORS) should set game as tied", async () => {
      await setTiedGamesTests(CHOICE.SCISSORS, CHOICE.SCISSORS);
    });

    it("(ROCK, SCISSORS) should finish game with playerOne as winner", async () => {
      await setWinLoseGamesTests(CHOICE.ROCK, CHOICE.SCISSORS);
    });
    it("(PAPER, ROCK) should finish game with playerOne as winner", async () => {
      await setWinLoseGamesTests(CHOICE.PAPER, CHOICE.ROCK);
    });
    it("(SCISSORS, PAPER) should finish game with playerOne as winner", async () => {
      await setWinLoseGamesTests(CHOICE.SCISSORS, CHOICE.PAPER);
    });

    it("(SCISSORS, ROCK) should finish game with playerTwo as winner", async () => {
      await setWinLoseGamesTests(CHOICE.SCISSORS, CHOICE.ROCK);
    });
    it("(PAPER, SCISSORS) should finish game with playerTwo as winner", async () => {
      await setWinLoseGamesTests(CHOICE.PAPER, CHOICE.SCISSORS);
    });
    it("(ROCK, PAPER) should finish game with playerTwo as winner", async () => {
      await setWinLoseGamesTests(CHOICE.ROCK, CHOICE.PAPER);
    });
  });
});
