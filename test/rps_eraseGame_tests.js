const RockPaperScissors = artifacts.require("RockPaperScissors");
const timeHelper = require("./util/timeHelper");
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
  let playerOneStaked;
  let totalStaked = new BN(0);
  const deployer = accounts[0];
  const playerOne = accounts[1];
  const playerTwo = accounts[2];
  const playerOne_choiceMaskString = web3.utils.fromAscii("1c04ddc043e");
  const gas = 4000000;
  const timestampSkipSeconds = 15;
  const NULL_BYTES = "0x0000000000000000000000000000000000000000000000000000000000000000";
  const nullAddress = "0x0000000000000000000000000000000000000000";

  async function getMaskedChoice(player, choice, maskString, maskTimestamp) {
    return await rockPaperScissors.contract.methods
      .generateMaskedChoice(choice, maskString, player, maskTimestamp)
      .call({ from: player });
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

    await expireGame();

    //settle
    await rockPaperScissors.contract.methods.settle(gameId).send({ from: playerOne, gas: gas });
  }

  async function expireGame() {
    const gameDeadline = (await rockPaperScissors.games.call(gameId)).deadline.toNumber();
    const currentTimestamp = (await web3.eth.getBlock("latest")).timestamp;
    return await timeHelper.advanceTimeAndBlock(1 + gameDeadline - currentTimestamp);
  }

  describe("eraseGame tests", () => {
    beforeEach("deploy a fresh contract, create a game", async () => {
      await setUpTest(CHOICE.SCISSORS, CHOICE.PAPER);
    });

    it("should erase game struct to default values", async () => {
      //Act
      const gameObj = await rockPaperScissors.games.call(gameId);

      //Assert
      expect(gameObj.deadline).to.be.a.bignumber.that.equals(new BN(0), "deadline  not erased after setltement");
      expect(gameObj.stake).to.be.a.bignumber.that.equals(new BN(0), "stake   not erased after setltement");
      assert.equal(gameObj.playerOne, nullAddress, "playerOne not erased after setltement");
      assert.equal(gameObj.playersKey, nullAddress, "playersKey not erased after setltement");
    });

    it("should erase nested mapping struct", async () => {
      //Act
      const playerOneMoves = await rockPaperScissors.contract.methods.getGameMove(gameId, playerOne).call({ from: deployer });
      const playerTwoMoves = await rockPaperScissors.contract.methods.getGameMove(gameId, playerTwo).call({ from: deployer });

      //Assert
      assert.equal(playerOneMoves._commit, NULL_BYTES, "playerOne commit sub struct not erased");
      assert.equal(playerOneMoves.choice, CHOICE.NONE, "playerOne choice sub struct not erased");
      assert.equal(playerTwoMoves._commit, NULL_BYTES, "playerTwo commit sub struct not erased");
      assert.equal(playerTwoMoves.choice, CHOICE.NONE, "playerTwo choice sub struct not erased");
    });
  });
});
