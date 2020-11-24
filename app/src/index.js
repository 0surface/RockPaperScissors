const Web3 = require("web3");
const $ = require("jquery");
const truffleContract = require("truffle-contract");
const rockPaperScissorsJson = require("../../build/contracts/RockPaperScissors.json");

const App = {
  web3: null,
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

  showContractBalance: async function () {
    const deployed = await this.rockPaperScissors.deployed();
    const balanceInWei = await this.web3.eth.getBalance(deployed.address);
    const balanceInEther = this.web3.utils.fromWei(balanceInWei, "ether");
    $("#contractBalance").html(`${parseFloat(balanceInEther).toFixed(4)} ETH`);
  },

  setUpApp: async function () {
    const { web3 } = this;

    const labels = ["Deployer", "Alice", "Bob", "", ""];

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
        }
      })
      .catch(console.error);

    await this.showContractBalance();
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
