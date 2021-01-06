createIsValidated = async (GAME_MIN_STAKE, GAME_MIN_LIFETIME, GAME_MAX_LIFETIME) => {
  $("#create_opponent_Error").html("");
  $("#create_stake_Error").html("");
  $("#create_mask_Error").html("");
  $("#create_chosen_Error").html("");
  $("#create_gameLength_Error").html("");
  let isValid = true;

  if (!$("#create_opponent").val()) {
    $("#create_opponent_Error").html("Opponent address is required").css("color", "red");
    isValid = false;
  }

  if ($("#create_stake").val() < GAME_MIN_STAKE) {
    $("#create_stake_Error").html("Opponent address is required").css("color", "red");
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

  let lifeTimeError = validateGameLifeTime($("#gameDays").val(), $("#gameHours").val(), $("#gameMinutes").val());

  if (lifeTimeError) {
    $("#create_gameLength_Error").html(lifeTimeError).css("color", "red");
    isValid = false;
  }

  return isValid;
};

validateGameLifeTime = (days, hours, minutes) => {
  let totalSeconds = 3600 * 24 * days + 3600 * hours + 60 * minutes;
  if (totalSeconds < GAME_MIN_LIFETIME) {
    return "Game Length below required minimum.";
  } else if (totalSeconds > GAME_MAX_LIFETIME) {
    return "Game Length above maximum value.";
  }
  return "";
};

module.exports = {
  createIsValidated,
};
