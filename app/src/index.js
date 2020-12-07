const Web3 = require("web3");
const $ = require("jquery");
const truffleContract = require("truffle-contract");
const rockPaperScissorsJson = require("../../build/contracts/RockPaperScissors.json");

const App = {
  web3: null,
  activeAccount: null,
  wallets: [],
  rockPaperScissors: truffleContract(rockPaperScissorsJson),

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
    if (!this.validateCreate()) return;
    $("#btnCreate").prop("disabled", false);
  },

  validateCreate: async function () {
    const _opponent = $("#create_opponent").val();
    const _stake = $("#create_stake").val();
    const _stakeFrom = $("#create_stakeSource").val();
    const _chosenMove = $("#create_chosen").val();
    const _days = $("#gameDays").val();
    const _hours = $("#gameHours").val();
    const _minutes = $("#gameMinutes").val();
    const hasError = false;

    return hasError;
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
    $("#create_chosen").value = chosenElem.val();
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

    await this.showContractBalance();
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
