const Web3 = require("web3");
const $ = require("jquery");
const truffleContract = require("truffle-contract");
const rockPaperScissorsJson = require("../../build/contracts/RockPaperScissors.json");
const lib = require("./validation");
const gameUtil = require("./gameUtil");
const gameData = require("./gameData");
const gameState = require("./gameState");

const App = {
  web3: null,
  activeAccount: null,
  wallets: [],
  rockPaperScissors: truffleContract(rockPaperScissorsJson),
  dbInit: null,
  GAME_MIN_STAKE: null,
  GAME_MIN_STAKE_ETH: null,
  GAME_MIN_LIFETIME: null,
  GAME_MAX_LIFETIME: null,

  setUpApp: async function () {
    console.log("in setupApp");
    const { web3 } = this;

    const labels = ["Deployer", "Alice", "Bob", "Carol", "Dennis", "Erin", "Fred", "Gina", "Homer", "Jillian"];
    const addressSelector = document.getElementById("addressSelector");

    web3.eth
      .getAccounts()
      .then((accounts) => {
        if (accounts.length == 0) {
          throw new Error("No accounts with which to transact");
        }
        return accounts;
      })
      .then((accountList) => {
        for (i = 0; i < 10; i++) {
          let address = accountList[i];
          let label = labels[i];
          this.wallets.push({ i, address, label });

          if (i !== 0) {
            var option = document.createElement("option");
            option.value = address;
            option.label = `${label} - ${address}`;
            addressSelector.add(option);
          }
        }
      })
      .catch(console.error);
    const deployed = await this.rockPaperScissors.deployed();
    GAME_MIN_STAKE = (await deployed.MIN_STAKE()).toNumber();
    GAME_MIN_STAKE_ETH = this.web3.utils.fromWei(GAME_MIN_STAKE.toString(), "ether");
    GAME_MIN_LIFETIME = (await deployed.MIN_GAME_LIFETIME()).toNumber();
    GAME_MAX_LIFETIME = (await deployed.MAX_GAME_LIFETIME()).toNumber();

    await this.showContractBalance();
    await this.showGameVariables();
    await gameData.init();
    this.setActiveWallet();

    await this.refreshGames();
  },

  start: async function () {
    const { web3, $ } = this;
    try {
      this.rockPaperScissors.setProvider(web3.currentProvider);
      await this.setUpApp();
    } catch (error) {
      console.log(error);
      console.error("Could not connect to contract or chain.");
    }
  },

  generateMaskedChoice: async function (choice, mask, masker, maskTimestamp) {
    const { generateMaskedChoice } = await this.rockPaperScissors.deployed();
    try {
      return await generateMaskedChoice.call(choice, mask, masker, maskTimestamp);
    } catch (error) {
      console.error("generateMaskedChoice: ", error);
    }
  },

  refreshGames: async function () {
    await gameState.gameListRefresh($("#addressSelector option:selected").attr("value"));
  },

  create: async function () {
    const creator = this.activeAccount.address;
    const counterParty = $("#create_counterparty").val();
    const choice = $("#create_chosen").val();
    const mask = $("#create_mask").val();
    const bytes32Mask = this.web3.utils.fromAscii(mask);
    const stake = $("#create_stake").val();
    const stakeInWei = this.web3.utils.toWei(stake);
    const gameLifetime = gameUtil.getGameLifeTimeSeconds();
    console.log("game creator", creator, "| choice ", gameLifetime, "| lifetime = ", gameLifetime, "| stakeInWei", stakeInWei);
    console.log("counterparty = ", create_counterparty, "| mask = ", mask, "| bytes32Mask", bytes32Mask);

    const isValid = await lib.createIsValidated(GAME_MIN_STAKE_ETH, gameLifetime, GAME_MIN_LIFETIME, GAME_MAX_LIFETIME);
    await gameUtil.setTxProgress("25");
    setTimeout(console.log("wait"), 3000);
    console.log("isValid", isValid);

    console.log("| ");
    if (!isValid) {
      $("#btnCreate").prop("disabled", true);
      console.log("create has validation error");
      return;
    }
    $("#btnCreate").prop("disabled", false);
    const maskTimestamp = Math.floor(Date.now() / 1000);
    const maskedChoice = await this.generateMaskedChoice(choice, bytes32Mask, creator, maskTimestamp);
    await gameUtil.setTxProgress("50", 1000);

    const { createAndCommit } = await this.rockPaperScissors.deployed();
    const createTxParmsObj = { from: creator, value: stakeInWei };

    //simulate send tx
    try {
      await createAndCommit.call(counterParty, maskedChoice, gameLifetime, stakeInWei, createTxParmsObj);
      await gameUtil.setTxProgress("75", 1000);
    } catch (error) {
      console.error("create call: ", error);
    }

    //send tx
    const txObj = await createAndCommit(
      counterParty,
      maskedChoice,
      gameLifetime,
      stakeInWei,
      createTxParmsObj
    ).on("transactionHash", (txHash) => $("#txStatus").html(`CreateAndCommit Tx pending : [ ${txHash} ]`));

    //Post-mining
    await gameUtil.updateUI(txObj, "Create", $("#txStatus"));
    await gameUtil.setTxProgress("0");
    const minedTxRecepit = await this.web3.eth.getTransactionReceipt(txObj.receipt.transactionHash);
    const event = gameUtil.getEvent(minedTxRecepit, 0);
    const gameId = this.web3.utils.hexToNumber(event[1]);
    const deadline = this.web3.utils.hexToNumber(event[3]);
    console.log("gameId:", gameId, "| deadline:", deadline);

    //save game to 'database'
    const label1 = this.getAddressLabel(creator);
    const label2 = this.getAddressLabel(counterParty);

    const game = {
      _id: gameId.toString(),
      playerOne: creator,
      playerOneLabel: label1,
      choiceOne: choice,
      choiceOneShown: false,
      maskOne: bytes32Mask,
      maskTimestampOne: maskTimestamp,
      playerTwo: counterParty,
      playerTwoLabel: label2,
      choiceTwo: 0,
      choiceTwoShown: false,
      maskTwo: "",
      maskTimestampTwo: 0,
      stake: stakeInWei,
      stakeInEther: stake,
      deadline: deadline,
      stakedFromWinnings: false,
      status: gameUtil.gameStatusEnum.created,
    };
    console.log("save response: ", await gameData.saveGame(game));
    // const d = await gameData.getGame(gameId);
    // console.log("data ", d);
  },

  enrol: async function () {
    const enrolee = this.activeAccount.address;
    const gameId = $("#enrol_gameId").val();
    const mask = $("#enrol_mask").val();
    const choice = $("#enrol_chosen").val();
    const game = await gameData.getGame(gameId);

    console.log("inside enrol fn -id,mask, choice, deadline -", gameId, mask, choice, game.deadline);
    const isValid = await lib.enrolIsValidated(mask, choice, game.deadline);

    if (!isValid) {
      $("#btnEnrol").prop("disabled", true);
      console.log("enrol has validation error");
      return;
    }

    //generate masked choice
    const maskTimestamp = Math.floor(Date.now() / 1000);
    const bytes32Mask = this.web3.utils.fromAscii(mask);
    const maskedChoice = await this.generateMaskedChoice(choice, bytes32Mask, enrolee, maskTimestamp);
    await gameUtil.setTxProgress("50", 1000);

    const stakeBN = this.web3.utils.toBN(game.stake);
    console.log("enrol game.stake", stakeBN.toString());

    //sim enrol
    const { enrolAndCommit } = await this.rockPaperScissors.deployed();
    const enrolTxParmsObj = { from: enrolee, value: stakeBN };

    //simulate send tx
    try {
      await enrolAndCommit.call(gameId, maskedChoice, enrolTxParmsObj);
      await gameUtil.setTxProgress("75", 1000);
    } catch (error) {
      console.error("enrol call: ", error);
    }

    //send enrol tx
    const txObj = await enrolAndCommit(gameId, maskedChoice, enrolTxParmsObj).on("transactionHash", (txHash) =>
      $("#txStatus").html(`enrolAndCommit Tx pending : [ ${txHash} ]`)
    );

    //Post-mining
    await gameUtil.updateUI(txObj, "Enrol", $("#txStatus"));
    await gameUtil.setTxProgress("100");
    const minedTxRecepit = await this.web3.eth.getTransactionReceipt(txObj.receipt.transactionHash);
    console.log("minedTxRecepit", minedTxRecepit);
    const event = gameUtil.getEvent(minedTxRecepit, 0);
    console.log("event:", event);
    const commiter = this.web3.utils.toHex(event[2]);
    console.log("commiter:", commiter);

    //update game 'database' values - status, ?deadline
    const rcpt1 = await gameData.updateGame(gameId, "status", gameUtil.gameStatusEnum.enrolled);
    const rcpt2 = await gameData.updateGame(gameId, "stake", stakeBN.add(stakeBN));
    const rcpt3 = await gameData.updateGame(gameId, "choiceTwo", choice);
    const rcpt4 = await gameData.updateGame(gameId, "maskTwo", bytes32Mask);
    const rcpt5 = await gameData.updateGame(gameId, "maskTimestampTwo", maskTimestamp);
    await gameUtil.setTxProgress("0");
    console.log("enrol update db", rcpt1, rcpt2, rcpt3, rcpt4, rcpt5);
  },

  reveal: async function () {
    const gameId = $("#reveal_gameId").val();
    const revealer = this.activeAccount.address;
    console.log("gameId, revealer: ", gameId, revealer);
    const game = await gameData.getGame(gameId);

    const revealerIsPlayerOne = revealer == game.playerOne;
    const choiceIsRevealed = revealerIsPlayerOne ? game.choiceOneShown : game.choiceTwoShown;
    if (choiceIsRevealed) return;
    const choice = revealerIsPlayerOne ? game.choiceOne : game.choiceTwo;
    const mask = revealerIsPlayerOne ? game.maskOne : game.maskTwo;
    const maskingTimestamp = revealerIsPlayerOne ? game.maskTimestampOne : game.maskTimestampTwo;

    //validate
    if (!(await lib.revealIsValidated(game.deadline, choiceIsRevealed))) return;
    await gameUtil.setTxProgress("25");

    //sim tx
    const { reveal } = await this.rockPaperScissors.deployed();
    const revealTxParmsObj = { from: revealer };

    console.log("gameId, choice, mask, maskTimestamp:- ", gameId, choice, mask, maskingTimestamp);

    try {
      //uint gameId, Choice choice, bytes32 mask,  uint maskingTimestamp
      await reveal.call(gameId, choice, mask, maskingTimestamp, revealTxParmsObj);
      await gameUtil.setTxProgress("5");
    } catch (error) {
      console.error("reveal call: ", error);
    }

    //send tx
    const txObj = await reveal(gameId, choice, mask, maskingTimestamp, revealTxParmsObj).on("transactionHash", (txHash) =>
      $("#txStatus").html(`reveal Tx pending : [ ${txHash} ]`)
    );

    //post-mined
    console.log("txObj:- ", txObj);
    await gameUtil.updateUI(txObj, "Reveal", $("#txStatus"));
    await gameUtil.setTxProgress("0");
    const minedTxRecepit = await this.web3.eth.getTransactionReceipt(txObj.receipt.transactionHash);
    console.log("minedTxRecepit", minedTxRecepit);
    const event1 = gameUtil.getEvent(minedTxRecepit, 0);
    // const event2 = gameUtil.getEvent(minedTxRecepit, 1);
    console.log("event1:", event1);
    // console.log("event2:", event2);
    const _revealer = this.web3.utils.toHex(event1[2]);
    console.log("revealer:", _revealer);

    //update game db
    if (game.status === 2) {
      const statusRevealed = await gameData.updateGame(gameId, "status", gameUtil.gameStatusEnum.revealed);
      console.log("status = revealed", statusRevealed);
    } else if (game.status === 3) {
      const statusFinished = await gameData.updateGame(gameId, "status", gameUtil.gameStatusEnum.finished);
      console.log("status = Finished", statusFinished);
    }

    const rcpt2 = revealerIsPlayerOne
      ? await gameData.updateGame(gameId, "choiceOneShown", true)
      : await gameData.updateGame(gameId, "choiceTwoShown", true);
    console.log("reveal update db", rcpt2);
  },

  showState: async function () {},

  settle: async function () {
    const gameId = $("#settle_gameId").val();
    console.log("inside settle fn - game id", gameId);
  },

  payout: async function () {
    console.log("inside payout function");
    const payee = this.activeAccount.address;
    console.log("payee", payee);
    const { payout, winnings } = await this.rockPaperScissors.deployed();

    const toPay = await winnings.call(payee);
    console.log("ether toPay", this.web3.utils.fromWei(toPay, "ether"));

    try {
      await payout.call({ from: payee });
    } catch (ex) {
      console.error("payout call error: ", ex);
    }

    const txRcpt = await payout({ from: payee }).on("transactionHash", (txHash) =>
      $("#txStatus").html(`payout Tx pending : [ ${txHash} ]`)
    );

    await gameUtil.updateUI(txRcpt, "Payout", $("#txStatus"));
    await gameUtil.setTxProgress("0");
    const minedTxRecepit = await this.web3.eth.getTransactionReceipt(txRcpt.receipt.transactionHash);
    console.log("minedTxRecepit", minedTxRecepit);
  },

  showContractBalance: async function () {
    const deployed = await this.rockPaperScissors.deployed();
    const balanceInWei = await this.web3.eth.getBalance(deployed.address);
    const balanceInEther = this.web3.utils.fromWei(balanceInWei, "ether");
    $("#contractBalance").html(`${parseFloat(balanceInEther).toFixed(4)} ETH`);
  },

  showWinnings: async function () {
    const { winnings } = await this.rockPaperScissors.deployed();
    const winningsInEther = this.web3.utils.fromWei(await winnings.call(this.activeAccount.address), "ether");
    $("#winningsAmount").html(`${winningsInEther} ETH`);
  },

  choiceSelected: function (id) {
    console.log(id);
    //console.log("grp ", $("#create_choices button"));
    $("#create_choices button").removeClass("btn-success").addClass("btn-secondary");
    const chosenElem = $(`#${id}`);
    chosenElem.addClass("btn-success");

    console.log("chosenElem.name", chosenElem.val());
    $("#create_chosen").val(chosenElem.val());
    $("#btnCreate").prop("disabled", false);
  },

  enrolChoiceSelected: function (id) {
    console.log(id);
    //console.log("grp ", $("#enrol_choices button"));
    $("#enrol_choices button").removeClass("btn-success").addClass("btn-secondary");
    const chosenElem = $(`#${id}`);
    chosenElem.addClass("btn-success");

    console.log("Enrol chosen Elem.name", chosenElem.val());
    $("#enrol_chosen").val(chosenElem.val());
    $("#btnEnrol").prop("disabled", false);
  },

  setActiveWallet: function () {
    const active = $("#addressSelector option:selected");
    const activeAddress = active.attr("value");
    document.getElementById("activeWallet").innerHTML = active.attr("label").split(" - ")[0];

    const activeWalletObj = this.wallets.find((x) => x.address === activeAddress.toString());
    this.activeAccount = activeWalletObj;
    this.showWinnings();
  },

  getAddressLabel: function (address) {
    const active = $("#addressSelector option:selected");
    document.getElementById("activeWallet").innerHTML = active.attr("label").split(" - ")[0];
    const activeWalletObj = this.wallets.find((x) => x.address === address.toString());
    return activeWalletObj.label;
  },

  showGameVariables: async function () {
    $("#create_min_stake_message").html(`Minimum Stake  ${GAME_MIN_STAKE_ETH} ETH`);
    $("#create_gameLength_limits").html(
      `Minimum ${gameUtil.secondsToDisplayString(GAME_MIN_LIFETIME)},  Maximum ${gameUtil.secondsToDisplayString(
        GAME_MAX_LIFETIME
      )}`
    );
  },
};

window.App = App;

window.addEventListener("load", function () {
  if (window.ethereum) {
    App.web3 = new Web3(window.ethereum);
    window.ethereum.enable(); // get permission to access accounts
  } else {
    //Fall back local provider
    App.web3 = new Web3(new Web3.providers.HttpProvider("http://127.0.0.1:8545"));
  }

  App.start();
});
