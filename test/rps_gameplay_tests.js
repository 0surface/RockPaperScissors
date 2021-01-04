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
  let gameLifeTime;
  let gameStaked;
  let deployedInstanceAddress;
  let maskTimestampOne;
  let maskedChoiceOne;
  let maskTimestampTwo;
  let maskedChoiceTwo;
  let gameId;
  const deployer = accounts[0];
  const playerOne = accounts[1];
  const playerOneChoice = CHOICE.SCISSORS;
  const playerTwo = accounts[2];
  const playerTwoChoice = CHOICE.PAPER;
  const someoneElse = accounts[3];
  const playerOne_choiceMaskString = web3.utils.fromAscii("1c04ddc043e");
  const playerTwo_choiceMaskString = web3.utils.fromAscii("01c43e4ddc0");
  const gas = 4000000;

  async function getMaskedChoice(player, choice, maskString, maskTimestamp) {
    return await rockPaperScissors.contract.methods
      .generateMaskedChoice(choice, maskString, player, maskTimestamp)
      .call({ from: player });
  }

  describe("Game Play Integration tests", () => {
    before("deploy a fresh contract, get game variables", async () => {
      rockPaperScissors = await RockPaperScissors.new({ from: deployer });
      deployedInstanceAddress = rockPaperScissors.address;
      MIN_GAME_LIFETIME = await rockPaperScissors.MIN_GAME_LIFETIME.call();
      MAX_GAME_LIFETIME = await rockPaperScissors.MAX_GAME_LIFETIME.call();
      MIN_STAKE = await rockPaperScissors.MIN_STAKE.call();
      POST_COMMIT_WAIT_WINDOW = await rockPaperScissors.POST_COMMIT_WAIT_WINDOW.call(); //1 day
      gameLifeTime = MIN_GAME_LIFETIME;
      gameStaked = MIN_STAKE;
    });

    it("should let playerOne win and set stake to its winnings", async () => {
      let totalStaked = new BN(0);
      //create masked choice for playerOne
      maskTimestampOne = (await web3.eth.getBlock("latest")).timestamp;
      maskedChoiceOne = await getMaskedChoice(playerOne, playerOneChoice, playerOne_choiceMaskString, maskTimestampOne);
      console.log("maskedChoiceOne", maskedChoiceOne);

      //create game and commit
      await rockPaperScissors.contract.methods
        .createAndCommit(playerTwo, maskedChoiceOne, gameLifeTime, gameStaked)
        .send({ from: playerOne, value: gameStaked, gas: gas });
      totalStaked = totalStaked.add(gameStaked);
      await timeHelper.advanceTimeAndBlock(15);

      //set gameId variable
      gameId = (await rockPaperScissors.nextGameId.call()).toNumber();
      const gameObj = await rockPaperScissors.games.call(gameId);
      console.log("gameObj", gameObj);

      //create masked choice for playerTwo
      maskTimestampTwo = (await web3.eth.getBlock("latest")).timestamp;
      maskedChoiceTwo = await getMaskedChoice(playerTwo, playerTwoChoice, playerTwo_choiceMaskString, maskTimestampTwo);
      console.log("maskedChoiceTwo", maskedChoiceTwo);

      //Enrol and commit
      await timeHelper.advanceTimeAndBlock(15);
      await rockPaperScissors.contract.methods
        .enrolAndCommit(gameId, maskedChoiceTwo, gameStaked)
        .send({ from: playerTwo, value: gameStaked, gas: gas });
      totalStaked = totalStaked.add(gameStaked);

      //get game moves
      const playerOneGameMove = await rockPaperScissors.contract.methods.getGameMove(gameId, playerOne).call({ from: deployer });
      const playerTwoGameMove = await rockPaperScissors.contract.methods.getGameMove(gameId, playerTwo).call({ from: deployer });
      console.log("playerOneGameMove", playerOneGameMove);
      console.log("playerTwoGameMove", playerTwoGameMove);

      //reveal by player one
      await timeHelper.advanceTimeAndBlock(15);
      await rockPaperScissors.contract.methods
        .reveal(gameId, playerOneChoice, playerOne_choiceMaskString, maskTimestampOne)
        .send({ from: playerOne, gas: gas });

      //reveal by player two
      await timeHelper.advanceTimeAndBlock(15);
      await rockPaperScissors.contract.methods
        .reveal(gameId, playerTwoChoice, playerTwo_choiceMaskString, maskTimestampTwo)
        .send({ from: playerTwo, gas: gas });

      //assert

      const playerOneWinnings = await rockPaperScissors.winnings.call(playerOne);
      const playerTwoWinnings = await rockPaperScissors.winnings.call(playerTwo);
      const contractBalance = await web3.eth.getBalance(deployedInstanceAddress);
      console.log("playerOneWinnings", playerOneWinnings.toNumber());
      console.log("playerTwoWinnings", playerTwoWinnings.toNumber());
      console.log("contractBalance", contractBalance);
      console.log("totalStaked", totalStaked.toNumber());

      assert.strictEqual(playerOneWinnings.toNumber(), totalStaked.toNumber(), "playerOne winnings value is incorrect");
      assert.strictEqual(playerTwoWinnings.toNumber(), 0, "playerTwo winnings value is incorrect");
      assert.strictEqual(Number(contractBalance), totalStaked.toNumber(), "Contract balance value is incorrect");
    });
  });
});
