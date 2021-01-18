getEvent = (minedTxRecepit, eventIndex) => minedTxRecepit.logs[eventIndex].topics;

getGameLifeTimeSeconds = () => {
  return 3600 * 24 * $("#create_gameDays").val() + 3600 * $("#create_gameHours").val() + 60 * $("#create_gameMinutes").val();
};

setTxProgress = async (progress, delay) => {
  const percentVal = `${progress}%`;
  setTimeout(
    () => {
      $(".progress-bar").css("width", percentVal);
      $(".progress-bar").html(percentVal);
    },
    delay ? delay : 500
  );

  if (progress == "0") {
    $(".progress").css("display", "none");
  }
};

updateUI = async (txObj, txName, $txStatus) => {
  if (!txObj.receipt.status) {
    console.error("Wrong status");
    console.error(txObj.receipt);
    await $txStatus.html(`There was an error in the ${txName} transaction execution, status not 1`, `error`);
  } else if (txObj.receipt.logs.length == 0) {
    console.log("Empty logs");
    console.log(txObj.receipt);
    await $txStatus.html(`There was an error in the ${txName} transaction, missing expected event`, `error`);
  } else {
    await $txStatus.html(`${txName} transaction executed`, ``);
  }
};

secondsToDisplayString = (seconds) => {
  let days = Math.floor(seconds / (24 * 60 * 60));
  seconds -= days * (24 * 60 * 60);
  let hours = Math.floor(seconds / (60 * 60));
  seconds -= hours * (60 * 60);
  let minutes = Math.floor(seconds / 60);
  seconds -= minutes * 60;

  let dayStr = days === 0 ? `` : days === 1 ? `1 day` : `${days} days`;
  let hourStr = hours === 0 ? `` : hours === 1 ? `1 hour` : `${hours} hours`;
  let minStr = minutes === 0 ? `` : minutes === 1 ? `1 minute` : `${minutes} minutes`;
  return `${dayStr} ${hourStr} ${minStr}`;
};

const gameStatusEnum = { created: 1, enrolled: 2, revealed: 3, expired: 4, finished: 5 };

createHtmlGameRow = (game, activeAddress, blockTimeStamp) => {
  return `<th scope="row">${game._id}</th>
    <td><strong>${game.status}</strong></td>
    <td>${game.playerOneLabel}</td>
    <td>${game.playerTwoLabel}</td>
    <td>${game.stakeInEther}</td>
    <td>${makeExpiryButton(game.deadline, game.status, blockTimeStamp)}</td>
    <td>${makeActionButton(game, activeAddress, blockTimeStamp)}</td>    
  </tr>`;
};

makeExpiryButton = (deadline, status, blockTimeStamp) => {
  const expiredStateElem = `<button class="btn btn-sm btn-warning" disabled><i class="fas fa-hourglass-end"></i>&nbsp Expired</button>`;
  return status === gameStatusEnum.finished || deadline < blockTimeStamp
    ? expiredStateElem
    : `${secondsToDisplayString(deadline - blockTimeStamp)}`;
};

makeActionButton = (game, activeAddress, blockTimeStamp) => {
  const isPlayerOne = activeAddress === game.playerOne;
  const settleActionButton = `<button class="btn btn-sm btn-warning" data-toggle="modal" data-target="#settleModal" 
  data-gameid="${game._id}" data-settler="${activeAddress}"> 
  <i class="fas fa-1x fa-gavel"></i>&nbsp Settle</a></button>`;

  if (game.deadline < blockTimeStamp && game.status != gameStatusEnum.finished) {
    return settleActionButton;
  }
  switch (game.status) {
    case gameStatusEnum.created:
      const hasCommited = isPlayerOne ? game.maskOne !== "" : game.maskTwo !== "";
      return hasCommited
        ? `<button class="btn btn-sm btn-secondary" disabled>Wait</a></button>`
        : `<button class="btn btn-sm btn-primary"  data-toggle="modal" data-target="#enrolModal" 
            data-deadline="${game.deadline}" data-stake="${game.stake}" data-gameid="${game._id}">
            <i class="fas fa-1x fa-door-open"></i>&nbsp &nbsp Enrol</a></button>`;
    case gameStatusEnum.enrolled:
      return `<button class="btn btn-sm btn-success" data-toggle="modal" data-target="#revealModal" 
              data-gameid="${game._id}" data-address="${activeAddress}">
              <i class="fas fa-1x fa-eye"></i>&nbsp Reveal</a></button>`;
    case gameStatusEnum.revealed:
      const hasRevealed = isPlayerOne ? game.choiceOneShown : game.choiceTwoShown;
      return hasRevealed
        ? `<button class="btn btn-sm btn-secondary" disabled>Wait</a></button>`
        : `<button class="btn btn-sm btn-info" data-toggle="modal" data-target="#revealModal" 
              data-gameid="${game._id}" data-revealer="${activeAddress}">
              <i class="fas fa-hourglass-end"></i>&nbsp &nbsp Finish</a></button>`;
    case gameStatusEnum.finished:
      return `<button class="btn btn-sm btn-danger" disabled><i class="fas fa-1x fa-dizzy"></i>&nbsp Deleted</a></button>`;
    case gameStatusEnum.expired:
      return settleActionButton;

    default:
      return "";
  }
};

module.exports = {
  getEvent,
  getGameLifeTimeSeconds,
  setTxProgress,
  updateUI,
  secondsToDisplayString,
  createHtmlGameRow,
  makeActionButton,
  gameStatusEnum,
};
