const Web3 = require("web3");
const $ = require("jquery");
const truffleContract = require("truffle-contract");
const rockPaperScissorsJson = require("../../build/contracts/RockPaperScissors.json");
const lib = require("./validation");

const App = {
  web3: null,
  activeAccount: null,
  wallets: [],
  rockPaperScissors: truffleContract(rockPaperScissorsJson),
  GAME_MIN_STAKE: null,
  GAME_MIN_LIFETIME: null,
  GAME_MAX_LIFETIME: null,

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

  create: async function () {
    const isValid = await lib.createIsValidated(GAME_MIN_STAKE, GAME_MIN_LIFETIME, GAME_MAX_LIFETIME);
    console.log("isValid", isValid);
    if (!isValid) {
      $("#btnCreate").prop("disabled", true);
      console.log("create has validation error");
      return;
    }
    $("#btnCreate").prop("disabled", false);
  },

  enrol: async function () {
    const gameId = $("#enrol_gameId").val();
    console.log("inside enrol fn - game id", gameId);
  },

  reveal: async function () {
    const gameId = $("#reveal_gameId").val();
    console.log("inside reveal fn - game id", gameId);
  },

  settle: async function () {
    const gameId = $("#settle_gameId").val();
    console.log("inside settle fn - game id", gameId);
  },

  payout: async function () {
    console.log("inside payout function");
  },

  showContractBalance: async function () {
    const deployed = await this.rockPaperScissors.deployed();
    const balanceInWei = await this.web3.eth.getBalance(deployed.address);
    const balanceInEther = this.web3.utils.fromWei(balanceInWei, "ether");
    $("#contractBalance").html(`${parseFloat(balanceInEther).toFixed(4)} ETH`);
  },

  choiceSelected: function (id) {
    console.log(id);
    console.log("grp ", $("#create_choices button"));
    $("#create_choices button").removeClass("btn-success").addClass("btn-secondary");
    const chosenElem = $(`#${id}`);
    chosenElem.addClass("btn-success");

    console.log("chosenElem.name", chosenElem.val());
    $("#create_chosen").val(chosenElem);
    $("#btnCreate").prop("disabled", false);
  },

  stakeSourceSelected: function (id) {
    console.log(id);
    console.log("grp ", $("#create_stake button"));

    $("#create_stake button").not(`#${id}`).removeClass("btn-primary").addClass("btn-secondary");

    //$("#create_stake button").find(`#${id}`).addClass("btn-danger");

    const chosenElem = $(`#${id}`);
    chosenElem.removeClass("btn-secondary").addClass("btn-primary");

    console.log("chosenElem", chosenElem);
    console.log("chosenElem.val", chosenElem.val());
    $("#create_stakeSource").value = chosenElem.val();
  },

  setActiveWallet: function () {
    const active = $("#addressSelector option:selected");
    const activeAddress = active.attr("value");
    document.getElementById("activeWallet").innerHTML = active.attr("label").split(" - ")[0];

    console.log("this.wallets", this.wallets);
    const activeWallet = this.wallets.find((x) => x.address === activeAddress.toString());
    this.activeAccount = activeWallet;
  },

  getGameRow: function (data) {
    return `<tr>
      <th scope="row">${data.id}</th>
      <td>${data.status}</td>
      <td>${data.player1}</td>
      <td>${data.player2}</td>
      <td>${data.stake}</td>
      <td>${data.deadline}</td>      
    </tr>`;
  },

  gameListRefresh: async function () {
    let sampleGames = [];
    let tableHtml = "";
    sampleGames.push({
      id: 1,
      player1: "Bob",
      player2: "Dennis",
      stake: 3.0023,
      deadline: "01/01/2021 19:35:00",
      status: "active",
    });
    sampleGames.push({
      id: "2",
      player1: "Eric",
      player2: "Alice",
      stake: 0.00986,
      deadline: "03/01/2021 00:35:00",
      status: "pending",
    });
    sampleGames.push({
      id: "3",
      player1: "Fred",
      player2: "Homer",
      stake: 0.006,
      deadline: "02/01/2021 15:58:00",
      status: "active",
    });
    sampleGames.map((data) => {
      tableHtml += this.getGameRow(data);
    });

    document.getElementById("gamesTableData").innerHTML = tableHtml;
  },

  setUpApp: async function () {
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
    GAME_MIN_LIFETIME = (await deployed.MIN_GAME_LIFETIME()).toNumber();
    GAME_MAX_LIFETIME = (await deployed.MAX_GAME_LIFETIME()).toNumber();

    await this.showContractBalance();
    await this.gameListRefresh();
    this.setActiveWallet();
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
