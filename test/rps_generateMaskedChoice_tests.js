const RockPaperScissors = artifacts.require("RockPaperScissors");
const truffleAssert = require("truffle-assertions");
const chai = require("chai");
const { assert } = chai;

contract("RockPaperScissors", (accounts) => {
  before(async () => {
    it("TestRPC  must have adequate number of addresses", () => {
      assert.isAtLeast(accounts.length, 3, "Test has enough addresses");
    });
  });

  let rockPaperScissors;
  let deployedInstanceAddress;
  const CHOICE = {
    NONE: 0,
    ROCK: 1,
    PAPER: 2,
    SCISSORS: 3,
  };
  const deployer = accounts[0];
  const playerOne = accounts[1];
  const playerTwo = accounts[2];
  const choiceMaskString = web3.utils.fromAscii("1c04ddc043e");
  const NULL_BYTES = "0x0000000000000000000000000000000000000000000000000000000000000000";

  describe("generateChoice tests", () => {
    beforeEach("deploy a fresh contract", async () => {
      rockPaperScissors = await RockPaperScissors.new({ from: deployer });
      deployedInstanceAddress = rockPaperScissors.address;
    });

    it("should generate a valid maskedChoice", async () => {
      const maskingTimestamp = (await web3.eth.getBlock()).timestamp;
      return rockPaperScissors.contract.methods
        .generateMaskedChoice(CHOICE.ROCK, choiceMaskString, playerOne, maskingTimestamp)
        .call({ from: playerOne })
        .then((result) => {
          assert.isDefined(result, "did not generate result");
          assert.notEqual(result, NULL_BYTES, "generated invalid result");
        });
    });

    it("should be able to generate result from web3 soliditySha3", async () => {
      const maskingTimestamp = (await web3.eth.getBlock()).timestamp;
      const web3SoliditySha3Value = web3.utils.soliditySha3(
        { type: "uint8", value: CHOICE.ROCK },
        { type: "bytes32", value: choiceMaskString },
        { type: "address", value: playerOne },
        { type: "uint", value: maskingTimestamp },
        { type: "address", value: deployedInstanceAddress }
      );
      const soliditykeccak256Value = await rockPaperScissors.contract.methods
        .generateMaskedChoice(CHOICE.ROCK, choiceMaskString, playerOne, maskingTimestamp)
        .call({ from: playerOne });
      assert.strictEqual(web3SoliditySha3Value, soliditykeccak256Value, "web3 and keccak256 generated value don't match");
    });

    it("should not generate same maskedChoice from two different callers", async () => {
      const maskingTimestamp = (await web3.eth.getBlock()).timestamp;
      const playerOneResult = await rockPaperScissors.contract.methods
        .generateMaskedChoice(CHOICE.PAPER, choiceMaskString, playerOne, maskingTimestamp)
        .call({ from: playerOne });

      const playerTwoResult = await rockPaperScissors.contract.methods
        .generateMaskedChoice(CHOICE.PAPER, choiceMaskString, playerTwo, maskingTimestamp)
        .call({ from: playerTwo });
      assert.notEqual(playerOneResult, playerTwoResult, "same value generated for different addresses");
    });

    it("should generate different values for different choices", async () => {
      const maskingTimestamp = (await web3.eth.getBlock()).timestamp;
      const hashedRock = await rockPaperScissors.contract.methods
        .generateMaskedChoice(CHOICE.ROCK, choiceMaskString, playerOne, maskingTimestamp)
        .call({ from: playerOne });
      const hashedPaper = await rockPaperScissors.contract.methods
        .generateMaskedChoice(CHOICE.PAPER, choiceMaskString, playerOne, maskingTimestamp)
        .call({ from: playerOne });
      const hashedScissors = await rockPaperScissors.contract.methods
        .generateMaskedChoice(CHOICE.SCISSORS, choiceMaskString, playerOne, maskingTimestamp)
        .call({ from: playerOne });

      assert.notEqual(hashedRock, hashedPaper, "same maskedChoice generated for different addresses");
      assert.notEqual(hashedPaper, hashedScissors, "same maskedChoice generated for different addresses");
    });

    it("should revert when given invalid choice", async () => {
      const maskingTimestamp = (await web3.eth.getBlock()).timestamp;
      await truffleAssert.reverts(
        rockPaperScissors.contract.methods
          .generateMaskedChoice(CHOICE.NONE, choiceMaskString, playerOne, maskingTimestamp)
          .call({ from: playerOne }),
        "RockPaperScissors::generateMaskedChoice:Invalid Choice"
      );
    });

    it("should revert when given empty mask", async () => {
      const maskingTimestamp = (await web3.eth.getBlock()).timestamp;
      await truffleAssert.reverts(
        rockPaperScissors.contract.methods
          .generateMaskedChoice(CHOICE.PAPER, NULL_BYTES, playerOne, maskingTimestamp)
          .call({ from: playerOne }),
        "RockPaperScissors::generateMaskedChoice:mask can not be empty"
      );
    });

    it("should revert when given 0 future maskingTimestamp", async () => {
      const maskingTimestamp = (await web3.eth.getBlock()).timestamp;
      await truffleAssert.reverts(
        rockPaperScissors.contract.methods
          .generateMaskedChoice(CHOICE.ROCK, choiceMaskString, playerOne, maskingTimestamp + 86400)
          .call({ from: playerOne }),
        "RockPaperScissors::generateMaskedChoice:Invalid blockTimestamp"
      );
    });

    it("should revert when given 0 as maskingTimestamp", async () => {
      await truffleAssert.reverts(
        rockPaperScissors.contract.methods
          .generateMaskedChoice(CHOICE.ROCK, choiceMaskString, playerOne, 0)
          .call({ from: playerOne }),
        "RockPaperScissors::generateMaskedChoice:Invalid blockTimestamp"
      );
    });
  });
});
