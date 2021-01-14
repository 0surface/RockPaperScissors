const gameData = require("./gameData");
const gameUtil = require("./gameUtil");

gameListRefresh = async function (activeAddress) {
  try {
    const docs = await gameData.fetchData();

    if (docs !== undefined && docs.total_rows > 0) {
      document.getElementById("gamesTableData").innerHTML = "";
      $("#gamesTableContainer").show();
      $("#noGamesBanner").hide();

      docs.rows
        .filter((x) => x.doc.playerOne === activeAddress || x.doc.playerTwo === activeAddress)
        .map(async (y) => {
          document.getElementById("gamesTableData").innerHTML += gameUtil.createHtmlGameRow(y.doc, activeAddress);
        });
    }

    if (document.getElementById("gamesTableData").innerHTML === "") {
      $("#gamesTableContainer").hide();
      $("#noGamesBanner").show();
      $("#noGamesBanner").html(`<h4>You have no games</h4>`);
    }
  } catch (ex) {
    console.error("fetchData error: ", ex);
  }
};

$("#enrolModal").on("show.bs.modal", function (event) {
  let button = $(event.relatedTarget);
  const gameId = button.data("gameid");
  var modal = $(this);
  modal.find("#enrolModalLabel").innerHtml = "Enrol to game id  " + gameId.toString();
  modal.find("#enrol_gameId").val(gameId);
  modal.find("#enrol_stake").val(button.data("stake"));
  modal.find(".modal-title").text("Enrol - Game = " + gameId);
});

$("#revealModal").on("show.bs.modal", async function (event) {
  let button = $(event.relatedTarget);
  const gameId = button.data("gameid");
  const revealer = button.data("revealer");

  var modal = $(this);
  modal.find("#reveal_gameId").val(gameId);
  modal.find("#reveal_revealer").val(revealer);
  modal.find(".modal-title").text("REVEAL - Game " + gameId.toString());

  await displayRevealState(gameId, revealer);
});

$("#payoutModal").on("show.bs.modal", async function (event) {
  const winnings = $("#winningsAmount").html();
  console.log("winnings", winnings);
  let modal = $(this);

  // const payee = $(this).find("option:selected").attr("value");
  // constawait gameData.getGame(payee);
  modal.find("#payout_balance").html(`You get : <strong> ${winnings} </strpng>`);
});

$("#addressSelector").on("change", async function (event) {
  await gameListRefresh($(this).find("option:selected").attr("value"));
});

displayRevealState = async (gameId, revealer) => {
  const game = await gameData.getGame(gameId);
  const isPlayerOne = revealer === game.playerOne;
  const revealer_choice = isPlayerOne ? game.choiceOne : game.choiceTwo;
  const revealer_choiceShown = isPlayerOne ? game.choiceOneShown : game.choiceTwoShown;
  const opponent_choice = isPlayerOne ? game.choiceTwo : game.choiceOne;
  const opponent_ChoiceShown = isPlayerOne ? game.choiceTwoShown : game.choiceOneShown;

  document.getElementById(
    "reveal_yourchoice_html"
  ).innerHTML = `<button type="button" class="btn btn-lg btn-secondary rpsChoice"  value="${revealer_choice}"">
  ${getChoiceIcon(revealer_choice)} </button>`;

  document.getElementById(
    "reveal_theirchoice_html"
  ).innerHTML = `<button type="button" class="btn btn-lg btn-secondary rpsChoice"  value="${opponent_choice}"">
    ${getChoiceIcon(opponent_ChoiceShown ? opponent_choice : 0)} </button>`;

  document.getElementById("reveal_outcome_html").innerHTML = solveGame(revealer_choice, opponent_choice, opponent_ChoiceShown);
};

solveGame = (revealer_choice, opponent_choice, opponent_ChoiceShown) => {
  if (!opponent_ChoiceShown) {
    return `<button type="button" class="btn btn-lg btn-secondary rpsChoice"><i class="fas fa-question"></i></button>`;
  }

  switch ((revealer_choice + 3 - opponent_choice) % 3) {
    case 0:
      return `<button type="button" class="btn btn-lg btn-secondary rpsChoice"><i class="fas fa-3x fa-equals"></i>Tie</button>`;
    case 1:
      return `<button type="button" class="btn btn-lg btn-success rpsChoice"><i class="fas fa-3x fa-check"></i>Win</button>`;
    case 2:
      return `<button type="button" class="btn btn-lg btn-danger rpsChoice"><i class="fas fa-3x fa-times"></i>Lose</button>`;
    default:
      return `<button type="button" class="btn btn-lg btn-secondary rpsChoice"></button>`;
  }
};

getChoiceIcon = (choice) => {
  switch (choice) {
    case "0":
      return `<i class="fas fa-question"></i>`;
    case "1":
      return `<i class="fas fa-3x fa-hand-rock" ></i>`;
    case "2":
      return `<i class="fas fa-3x fa-hand-paper"></i>`;
    case "3":
      return `<i class="fas fa-3x fa-hand-scissors"></i>`;
    default:
      return `<i class="fas fa-question"></i>`;
  }
};

module.exports = {
  gameListRefresh,
};
