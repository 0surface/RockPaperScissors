const RockPaperScissors = artifacts.require("RockPaperScissors");
const timeHelper = require("./util/timeHelper");
const truffleAssert = require("truffle-assertions");
const chai = require("chai");
const { BN } = web3.utils.BN;
const { assert, expect } = chai;
chai.use(require("chai-bn")(BN));

function advanceTime(time) {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "evm_increaseTime",
        params: [time],
        id: new Date().getTime(),
      },
      (err, result) => (err ? reject(err) : resolve(result))
    );
  });
}

contract("RockPaperScissors", (accounts) => {
  before(async () => {
    it("TestRPC  must have adequate number of addresses", () => {
      assert.isAtLeast(accounts.length, 3, "Test has enough addresses");
    });
  });

  let rockPaperScissors;
  let gameId;
  let gameDeadline;
  let gameLifeTime;
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

  describe("eraseGame tests", () => {
    beforeEach("deploy a fresh contract, create a game", async () => {
      rockPaperScissors = await RockPaperScissors.new({ from: deployer });

      //generate choice
      const currentBlock = await web3.eth.getBlock();
      const hashedChoice_1 = await rockPaperScissors.contract.methods
        .generateMaskedChoice(CHOICE.SCISSORS, choiceMaskString, playerOne, currentBlock.timestamp)
        .call({ from: playerOne });

      //create game
      gameLifeTime = await rockPaperScissors.MIN_GAME_LIFETIME.call();
      const txObj = await rockPaperScissors.contract.methods
        .createAndCommit(playerTwo, hashedChoice_1, gameLifeTime, 0)
        .send({ from: playerOne, value: 10000, gas: gas });
      gameId = await rockPaperScissors.nextGameId.call();
      console.log("gameId", gameId.toString());

      const createdGame = await rockPaperScissors.games.call(gameId);
      gameDeadline = createdGame.deadline;
      console.log("gameDeadline: ", gameDeadline.toNumber());
    });

    it("should advance time", async () => {
      const blockBefore = await web3.eth.getBlock();
      const blockBeforeTimestamp = blockBefore.timestamp;
      console.log("blockBeforeTimestamp", blockBeforeTimestamp);

      advanceTime(3700);

      const settleTxObj = await rockPaperScissors.contract.methods.settle(gameId).call({ from: deployer });
      console.log("settleTxObj", settleTxObj);

      //timeHelper.advanceTimeAndBlock(advancement);
      // await web3.currentProvider.send(
      //   {
      //     jsonrpc: "2.0",
      //     method: "evm_increaseTime",
      //     params: [advancement],
      //     id: new Date().getTime(),
      //   },
      //   (err, result) => {
      //     console.log("err, result", err, result);
      //   }
      // );
      const blockAfter = await web3.eth.getBlock();
      console.log("timestamp after advance", blockAfter.timestamp);
    });

    // it("should show after  time", async () => {
    //   const blockAfter = await web3.eth.getBlock();
    //   console.log("timestamp after advance", blockAfter.timestamp);
    // });

    // it("should erase nested mapping struct", async () => {
    //   //Arrange
    //   //advance Time to game expiry
    //   const block = await web3.eth.getBlock();
    //   console.log("timestamp before advance", block.timestamp);
    //   advanceTime(86410);
    //   const playerOneMove_Before = await rockPaperScissors.contract.methods
    //     .getGameMove(gameId, playerOne)
    //     .call({ from: deployer });
    //   const commit_Before = playerOneMove_Before._commit;
    //   //console.log("gameDeadline", gameDeadline);
    //   //const pastExpiryTimeStamp = gameDeadline + 10; // gameDeadline.add(new BN(1));
    //   //console.log("pastExpiryTimeStamp: ", pastExpiryTimeStamp);
    //   //console.log("block", block);
    //   const blockAfter = await web3.eth.getBlock();
    //   //console.log("blockAfter", blockAfter);
    //   console.log("timestamp after advance", blockAfter.timestamp);
    //   //call settle() => implicitly calls eraseGame
    //   const settleTxObj = await rockPaperScissors.contract.methods.settle(gameId).call({ from: deployer });
    //   assert.isDefined(settleTxObj, "settle function did not get executed/mined");
    //   //Act
    //   //   const eraseTxObj = await rockPaperScissors.contract.methods
    //   //     .eraseGame(gameId, playerOne, playerTwo)
    //   //     .send({ from: deployer });
    //   //   assert.isDefined(eraseTxObj, "eraseGame function did not get executed/mined");
    //   //   console.log("eraseTxObj ", eraseTxObj);
    //   const playerOneMove_After = await rockPaperScissors.contract.methods
    //     .getGameMove(gameId, playerOne)
    //     .call({ from: deployer });
    //   const commit_After = playerOneMove_After._commit;
    //   //Assert
    //   console.log("playerOneMove_Before,", playerOneMove_Before);
    //   console.log("commit_Before,", commit_Before);
    //   console.log("playerOneMove_After,", playerOneMove_After);
    //   console.log("commit_After, ", commit_After);
    //   assert.notEqual(commit_Before, commit_After);
    //   assert.strictEqual(commit_After, _nullMaskValue);
    // });

    //it("should revert when given", async () => {});
  });
});
