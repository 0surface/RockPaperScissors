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

  async function getGasCostInWei(txReceipt) {
    const _gasAmount = txReceipt.gasUsed;
    const thisTx = await web3.eth.getTransaction(txReceipt.transactionHash);
    const _gasPrice = thisTx.gasPrice;
    const bn_gasPrice = new BN(_gasPrice);
    const bn_gasAmount = new BN(_gasAmount);
    return bn_gasPrice.mul(bn_gasAmount);
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

    await timeHelper.advanceTimeAndBlock(timestampSkipSeconds);
  }

  async function playerTwoRevealsChoice(playerTwoChoice) {
    await timeHelper.advanceTimeAndBlock(timestampSkipSeconds);
    return await rockPaperScissors.contract.methods
      .reveal(gameId, playerTwoChoice, playerTwo_choiceMaskString, maskTimestampTwo)
      .send({ from: playerTwo, gas: gas });
  }

  describe("payout function tests", () => {
    it("should revert if player has no winnings", async () => {
      //Arrange, Act
      await setUpTest(CHOICE.SCISSORS, CHOICE.PAPER);

      //Assert
      await truffleAssert.reverts(
        rockPaperScissors.contract.methods.payout().send({ from: someoneElse, gas: gas }),
        "RockPaperScissors::payout:There are no funds to payout"
      );
    });

    it("should emit events on successful payout", async () => {
      //Arrange
      await setUpTest(CHOICE.SCISSORS, CHOICE.PAPER);
      await playerTwoRevealsChoice(CHOICE.PAPER);
      const weiBefore = new BN(await web3.eth.getBalance(playerOne));
      const winningBefore = (await rockPaperScissors.winnings.call(playerOne)).toNumber();

      //Act
      const txReceipt = await rockPaperScissors.contract.methods.payout().send({ from: playerOne, gas: gas });

      const gasCost = await getGasCostInWei(txReceipt);
      const weiAfter = new BN(await web3.eth.getBalance(playerOne));
      const gasCostAdjusted = weiAfter.add(gasCost).sub(weiBefore);

      //Assert
      eventAssert.eventIsEmitted(txReceipt, "LogWinningsBalanceChanged");
      eventAssert.parameterIsValid(txReceipt, "LogWinningsBalanceChanged", "player", playerOne, "LogPayout player incorrect");
      eventAssert.parameterIsValid(txReceipt, "LogWinningsBalanceChanged", "oldBalance", winningBefore, "oldBalance incorrect");
      eventAssert.parameterIsValid(txReceipt, "LogWinningsBalanceChanged", "newBalance", 0, "LogPayout newBalance incorrect");

      eventAssert.eventIsEmitted(txReceipt, "LogPayout");
      eventAssert.parameterIsValid(txReceipt, "LogPayout", "payee", playerOne, "LogPayout  payee  incorrect");
      eventAssert.parameterIsValid(txReceipt, "LogPayout", "pay", gasCostAdjusted.toNumber(), "LogPayout  pay  incorrect");
    });

    it("should set winner's winnings ledger to zero", async () => {
      //Arrange
      await setUpTest(CHOICE.SCISSORS, CHOICE.PAPER);
      await playerTwoRevealsChoice(CHOICE.PAPER);
      const playerOneWinningsPriorPayout = await rockPaperScissors.winnings.call(playerOne);

      //Act
      await rockPaperScissors.contract.methods.payout().send({ from: playerOne, gas: gas });
      const playerOneWinningsAfterPayout = await rockPaperScissors.winnings.call(playerOne);

      //Assert
      expect(playerOneWinningsPriorPayout).to.be.a.bignumber.that.equal(new BN(totalStaked));
      expect(playerOneWinningsAfterPayout).to.be.a.bignumber.that.equal(new BN(0));
    });

    it("should send to winner's account the amount in winnings", async () => {
      //Arrange
      await setUpTest(CHOICE.SCISSORS, CHOICE.PAPER);
      await playerTwoRevealsChoice(CHOICE.PAPER);
      const playerOneWinningsPriorPayout = await rockPaperScissors.winnings.call(playerOne);
      const weiBefore = new BN(await web3.eth.getBalance(playerOne));

      //Act
      const txReceipt = await rockPaperScissors.contract.methods.payout().send({ from: playerOne, gas: gas });
      const gasCost = await getGasCostInWei(txReceipt);
      const weiAfter = new BN(await web3.eth.getBalance(playerOne));
      const gasCostAdjusted = weiAfter.sub(weiBefore).add(gasCost);

      //Assert
      expect(playerOneWinningsPriorPayout).to.be.a.bignumber.that.equals(gasCostAdjusted);
    });
  });
});
