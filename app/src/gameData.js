const PouchDB = require("pouchdb-browser");
const pouchDB = PouchDB.default.defaults();
let db;

init = () => {
  db = new pouchDB("rps");
  console.log("db init");
  console.log(db);
};

setGameData = (id, playerOne, playerTwo, choice, mask, maskTimestamp, stake, deadline, stakedFromWinnings) => {
  const game = {
    _id: id.toString(),
    playerOne,
    playerTwo,
    choice,
    mask,
    maskTimestamp,
    stake,
    deadline,
    stakedFromWinnings,
  };
  return game;
};

saveGame = async (game) => {
  console.log("insavegame", game);
  return await db.put(game);
};

getGame = async (gameId) => {
  return await db.get(gameId.toString());
};

updateGame = async (gameId, prop, val) => {
  const game = await db.get(`${gameId}`);
  game[`${prop}`] = val;
  return await db.put(game);
};

deleteGame = async (gameId) => {
  const game = await db.get(`${gameId}`);
  return await db.remove(game);
};

deleteAllGames = async () => {
  const rps = await fetchData();
  if (rps !== undefined) {
    rps.rows.map(async (x) => {
      await this.deleteGame(x.id.toString());
    });
  }
};

fetchData = async function () {
  try {
    return await db.allDocs({ include_docs: true });
  } catch (ex) {
    console.log("fetchData error: ", ex);
  }
};

module.exports = {
  init,
  setGameData,
  saveGame,
  deleteGame,
  updateGame,
  getGame,
  fetchData,
  deleteAllGames,
};
