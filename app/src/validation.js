revealIsValidated = async (deadline) => {
  $("#reveal_deadline_Error").html("");
  let isValid = true;
  console.log("reveal d", deadline);
  const _now = Math.floor(Date.now() / 1000);
  console.log("_now", _now);
  if (_now > deadline) {
    $("#reveal_deadline_Error").html("Game has expired").css("color", "red");
    isValid = false;
  }
  return isValid;
};

enrolIsValidated = async (mask, choice, deadline) => {
  $("#enrol_mask_Error").html("");
  $("#enrol_chosen_Error").html("");
  $("#enrol_deadline_Error").html("");
  let isValid = true;
  if (!mask) {
    $("#enrol_mask_Error").html("Choice mask is required").css("color", "red");
    isValid = false;
  }
  if (!choice) {
    $("#enrol_chosen_Error").html("Game choice is required").css("color", "red");
    isValid = false;
  }
  if (deadline < Math.floor(Date.now() / 1000)) {
    $("#enrol_deadline_Error").html("Game has expired").css("color", "red");
  }
  return isValid;
};

createIsValidated = async (GAME_MIN_STAKE, gameLifeTime, gameMinLifeTime, gameMaxLifeTime) => {
  $("#create_counterparty_Error").html("");
  $("#create_stake_Error").html("");
  $("#create_mask_Error").html("");
  $("#create_chosen_Error").html("");
  $("#create_gameLength_Error").html("");
  let isValid = true;

  if (!$("#create_counterparty").val()) {
    $("#create_counterparty_Error").html("Opponent address is required").css("color", "red");
    isValid = false;
  }

  if ($("#create_stake").val() < GAME_MIN_STAKE) {
    $("#create_stake_Error").html("Stake is required").css("color", "red");
    isValid = false;
  }

  if (!$("#create_mask").val()) {
    $("#create_mask_Error").html("Choice mask is required").css("color", "red");

    isValid = false;
  }

  if (!$("#create_chosen").val()) {
    $("#create_chosen_Error").html("Game choice is required").css("color", "red");
    isValid = false;
  }

  let lifeTimeError = validateGameLifeTime(gameLifeTime, gameMinLifeTime, gameMaxLifeTime);

  if (lifeTimeError) {
    $("#create_gameLength_Error").html(lifeTimeError).css("color", "red");
    isValid = false;
  }

  return isValid;
};

validateGameLifeTime = (totalSeconds, gameMinLifeTime, gameMaxLifeTime) => {
  if (totalSeconds < gameMinLifeTime) {
    return "Game Length below required minimum.";
  } else if (totalSeconds > gameMaxLifeTime) {
    return "Game Length above maximum value.";
  }
  return "";
};

module.exports = {
  createIsValidated,
  enrolIsValidated,
  revealIsValidated,
};
