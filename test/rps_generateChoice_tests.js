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
  const CHOICE_NONE = 0;
  const CHOICE_ROCK = 1;
  const CHOICE_PAPER = 2;
  const CHOICE_SICSSORS = 3;
  const deployer = accounts[0];
  const playerOne = accounts[1];
  const playerTwo = accounts[2];
  const choiceMaskString = web3.utils.fromAscii("1c04ddc043e");
  const _nullMaskValue = "0x0000000000000000000000000000000000000000000000000000000000000000";

  describe("generateChoice tests", () => {
    beforeEach("deploy a fresh contract", async () => {
      rockPaperScissors = await RockPaperScissors.new({ from: deployer });
      deployedInstanceAddress = rockPaperScissors.address;
    });

    it("should generate a valid maskedChoice", () => {
      return rockPaperScissors.contract.methods
        .generateChoice(CHOICE_ROCK, choiceMaskString)
        .call({ from: playerOne })
        .then((result) => {
          assert.isDefined(result, "did not generate result");
          assert.notEqual(result, _nullMaskValue, "generated invalid result");
        });
    });

    it("should be able to generate result from web3 soliditySha3", async () => {
      const web3SoliditySha3Value = web3.utils.soliditySha3(
        { type: "uint8", value: CHOICE_ROCK },
        { type: "bytes32", value: choiceMaskString },
        { type: "address", value: playerOne },
        { type: "address", value: deployedInstanceAddress }
      );
      const soliditykeccak256Value = await rockPaperScissors.contract.methods
        .generateChoice(CHOICE_ROCK, choiceMaskString)
        .call({ from: playerOne });
      assert.strictEqual(web3SoliditySha3Value, soliditykeccak256Value, "web3 and keccak256 generated value don't match");
    });

    it("should not generate same hashedChoice from two different callers", async () => {
      const playerOneResult = await rockPaperScissors.contract.methods
        .generateChoice(CHOICE_PAPER, choiceMaskString)
        .call({ from: playerOne });

      const playerTwoResult = await rockPaperScissors.contract.methods
        .generateChoice(CHOICE_PAPER, choiceMaskString)
        .call({ from: playerTwo });
      assert.notEqual(playerOneResult, playerTwoResult, "same value generated for different addresses");
    });

    it("should generate different values for different choices", async () => {
      const hashedRock = await rockPaperScissors.contract.methods
        .generateChoice(CHOICE_ROCK, choiceMaskString)
        .call({ from: playerOne });
      const hashedPaper = await rockPaperScissors.contract.methods
        .generateChoice(CHOICE_PAPER, choiceMaskString)
        .call({ from: playerOne });
      const hashedScissors = await rockPaperScissors.contract.methods
        .generateChoice(CHOICE_SICSSORS, choiceMaskString)
        .call({ from: playerOne });

      assert.isFalse(
        hashedRock === hashedPaper || hashedPaper === hashedScissors || hashedRock === hashedScissors,
        "same hashedChoice generated for different choices"
      );
    });

    it("should revert when given invalid choice", async () => {
      await truffleAssert.reverts(
        rockPaperScissors.contract.methods.generateChoice(CHOICE_NONE, choiceMaskString).call({ from: playerOne }),
        "RockPaperScissors::generateChoice:Invalid Choice"
      );
    });

    it("should revert when given invalid mask", async () => {
      await truffleAssert.reverts(
        rockPaperScissors.contract.methods.generateChoice(CHOICE_PAPER, _nullMaskValue).call({ from: playerOne }),
        "RockPaperScissors::generateChoice:mask can not be empty"
      );
    });
  });
});
