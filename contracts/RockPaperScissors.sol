// SPDX-License-Identifier: MIT
pragma solidity 0.7.0;

import "./SafeMath.sol";

contract RockPaperScissors {

    using SafeMath for uint;
    
    enum Choice  { None, Rock, Paper, Scissors }

    struct Game {
        address playerOne;
        bytes32 commitOne;
        Choice choiceOne;        
        address playerTwo;
        bytes32 commitTwo;
        Choice choiceTwo;
        uint stake;
        uint deadline;
        bool playerTwoIsEnrolled;  
    }

    mapping (bytes32 => Game) public games;
    mapping (address => uint) public winnings;

    uint constant public DEFAULT_GAME_LIFETIME = 1 days;
    uint constant public MAX_GAME_LIFETIME = 52 weeks;
    uint constant public MIN_GAME_LIFETIME = 1 minutes;
    uint constant public MIN_STAKE = 0; //TODO: Set to dev/Game fee
    bytes32 constant public NULL_BYTES = bytes32(0);

    event LogGameCreated(bytes32 indexed gameId, address indexed playerOne, address indexed playerTwo, uint staked, uint deadline, bytes32 gameIdEntropy);    
    event LogGameRetired(bytes32 indexed gameId, address indexed winner, address indexed loser, uint pay, uint retireTimeStamp);
    event LogChoiceRevealed(bytes32 indexed gameId, address indexed revealer, Choice choice);
    event LogChoiceCommited(bytes32 indexed gameId, address indexed commiter, bytes32 hashedChoice);
    event LogGameMovesTied(address indexed playerOne, address indexed playerTwo,Choice choiceOne, Choice choiceTwo);
    event LogPayout(address indexed payee, uint pay) ;

    constructor (){}
    
    function generateChoice (Choice choice, bytes32 mask) view public returns (bytes32 hashedChoice) {
        require(choice != Choice.None, "RockPaperScissors::generateChoice:Choice can not be none");
        require(mask != NULL_BYTES, "RockPaperScissors::generateChoice:mask can not be empty");
        return keccak256(abi.encodePacked(choice, mask, msg.sender, address(this)));
    }

    function createGame(address otherPlayer, bytes32 hashedChoice, uint256 gameLifetime, bytes32 gameIdEntropy) payable public {
        require(msg.value >= MIN_STAKE, "RockPaperScissors::createGame:Insufficient stake funds");        
        require(msg.sender != otherPlayer, "RockPaperScissors::createGame:Player addresses must be different");
        require(hashedChoice != NULL_BYTES, "RockPaperScissors::play:Invalid hashedChoice value");
        require(gameLifetime >= MIN_GAME_LIFETIME,"RockPaperScissors::createGame:Invalid minimum game deadline");
        require(gameLifetime <= MAX_GAME_LIFETIME,"RockPaperScissors::createGame:Invalid minimum game deadline");        

        bytes32 gameId = keccak256(abi.encodePacked(msg.sender, otherPlayer, block.number, gameIdEntropy));
        require(games[gameId].deadline == 0, "RockPaperScissors::createGame:An active game exists with given inputs");
        
        Game storage game = games[gameId];
        game.playerOne = msg.sender; //SSTORE
        game.playerTwo = otherPlayer; //SSTORE
        game.stake = msg.value; //SSTORE
                
        uint _gameDeadline = gameLifetime > MIN_GAME_LIFETIME ? gameLifetime.add(block.timestamp): DEFAULT_GAME_LIFETIME.add(block.timestamp);
        game.deadline = _gameDeadline; //SSTORE
        
        emit LogGameCreated(gameId, msg.sender, otherPlayer, msg.value, _gameDeadline, gameIdEntropy);
    }
    
    function createGameFromWinnings(address otherPlayer, bytes32 hashedChoice, uint256 gameLifetime, uint stakeAmount, bytes32 gameIdEntropy) public {        
        require(stakeAmount >= MIN_STAKE, "RockPaperScissors::createGameFromWinnings:Invalid minumum stake amount");
        require(winnings[msg.sender] >= stakeAmount, "RockPaperScissors::createGameFromWinnings:Insufficient stake funds in winnings");

        require(msg.sender != otherPlayer, "RockPaperScissors::createGameFromWinnings:Player addresses must be different");
        require(hashedChoice != NULL_BYTES, "RockPaperScissors::createGameFromWinnings:Invalid hashedChoice value");
        require(gameLifetime >= MIN_GAME_LIFETIME,"RockPaperScissors::createGameFromWinnings:Invalid minimum game deadline");
        require(gameLifetime <= MAX_GAME_LIFETIME,"RockPaperScissors::crecreateGameFromWinningsateGame:Invalid minimum game deadline");        
        
        bytes32 gameId = keccak256(abi.encodePacked(msg.sender, otherPlayer, block.number, gameIdEntropy));
        require(games[gameId].deadline == 0, "RockPaperScissors::createGameFromWinnings:An active game exists with given inputs");

        Game storage game = games[gameId];
        game.playerOne = msg.sender; //SSTORE
        game.playerTwo = otherPlayer; //SSTORE

        winnings[msg.sender].sub(stakeAmount); //SSTORE
        game.stake = stakeAmount; //SSTORE
                
        uint _gameDeadline = gameLifetime > MIN_GAME_LIFETIME ? gameLifetime.add(block.timestamp): DEFAULT_GAME_LIFETIME.add(block.timestamp);
        game.deadline = _gameDeadline; //SSTORE
        
        emit LogGameCreated(gameId, msg.sender, otherPlayer, stakeAmount, _gameDeadline, gameIdEntropy);
    }

    function enrol(bytes32 gameId, bytes32 hashedChoice, bool stakeFromWinnings) public payable {
        uint _deadline = games[gameId].deadline; //SSLOAD
        require(_deadline != 0, "RockPaperScissors::enrol:game does not exist");
        require(block.timestamp <= _deadline, "RockPaperScissors::enrol:game has expired");
        require(games[gameId].playerTwo == msg.sender, "RockPaperScissors::enrol:sender is not player"); //SSLOAD
        require(games[gameId].commitOne != NULL_BYTES, "RockPaperScissors::enrol:Invalid game state, can't enroll"); //SSLOAD

        uint stakeAmount = games[gameId].stake; //SSLOAD
        require(hashedChoice != NULL_BYTES, "RockPaperScissors::play:Invalid hashedChoice value");

        if(stakeFromWinnings){
            require(msg.value == 0, "RockPaperScissors::enrol:You should not desposit when staking from winnings");
            require(stakeAmount >= MIN_STAKE, "RockPaperScissors::enrol:Invalid minumum stake amount");
            require(winnings[msg.sender] >= stakeAmount, "RockPaperScissors::enrol:Insufficient stake funds in winnings");             
            winnings[msg.sender].sub(stakeAmount);//SSTORE
            games[gameId].stake.add(stakeAmount); //SSTORE
        }else{
            require(msg.value >= stakeAmount, "RockPaperScissors::enrol:Insufficient stake funds");
            games[gameId].stake.add(stakeAmount); //SSTORE
        }
        
        games[gameId].commitTwo = hashedChoice; //SSTORE        
        games[gameId].playerTwoIsEnrolled = true; //SSTORE

        emit LogChoiceCommited(gameId, msg.sender, hashedChoice);
    }

    function play(bytes32 hashedChoice, bytes32 gameId) public {        
        require(hashedChoice != NULL_BYTES, "RockPaperScissors::play:Invalid hashedChoice value");
        
        uint _deadline = games[gameId].deadline; //SSLOAD
        require(_deadline != 0, "RockPaperScissors::play:game does not exist");
        require(block.timestamp <=_deadline, "RockPaperScissors::play:game has expired");
        require( games[gameId].playerTwoIsEnrolled, "RockPaperScissors::play:Player Two has not yet enrolled");

        if(games[gameId].playerOne == msg.sender){ //SSLOAD
            //SSLOAD            
            require(games[gameId].commitOne == NULL_BYTES, "RockPaperScissors::play: You have already commited a choice");
            games[gameId].commitOne = hashedChoice;  //SSTORE         
        } 
        else if(games[gameId].playerTwo == msg.sender){//SSLOAD
            //SSLOAD            
            require(games[gameId].commitTwo == NULL_BYTES, "RockPaperScissors::play:You have already commited a choice");
            games[gameId].commitTwo = hashedChoice;  //SSTORE
        }
        else{
            revert("RockPaperScissors::play:Sender is not a player");
        }

        emit LogChoiceCommited(gameId, msg.sender, hashedChoice);
    }

    function reveal(Choice choice, bytes32 mask, bytes32 gameId) public returns (Choice) {
        require(games[gameId].deadline != 0, "RockPaperScissors::reveal:game does not exist"); //SSLOAD
        
        address _playerOne = games[gameId].playerOne; //SSLOAD        
        address _playerTwo = games[gameId].playerTwo; //SSLOAD                

        bytes32 _commitTwo = games[gameId].commitTwo; //SSLOAD
        bytes32 _commitOne = games[gameId].commitOne; //SSLOAD
        require(_commitOne != NULL_BYTES &&  _commitTwo != NULL_BYTES, "RockPaperScissors::reveal:Commits have not been set yet");
        
        if(generateChoice(choice, mask) == _commitOne){
            
            Choice _choiceTwo = games[gameId].choiceTwo; //SSLOAD
           
            if(_choiceTwo == Choice.None){                
                games[gameId].choiceOne = choice; //SSTORE
                emit LogChoiceRevealed(gameId, msg.sender, choice);
            }
            else{
                resolve(gameId, _playerOne, choice, _playerTwo, _choiceTwo);              
            }
        }else if(generateChoice(choice, mask) == _commitTwo){
            Choice _choiceOne = games[gameId].choiceOne; //SSLOAD

            if(_choiceOne == Choice.None){                
                games[gameId].choiceTwo = choice; //SSTORE
                emit LogChoiceRevealed(gameId, msg.sender, choice);
            }
            else {
                resolve(gameId, _playerOne, _choiceOne, _playerTwo, choice);              
            }
        }
        else{
            revert("RockPaperScissors::reveal:Invalid mask and choice");
        }
    }

    function retire(bytes32 gameId, address winner, address loser) internal {
        uint pay = games[gameId].stake; //SSLOAD

        if(winner != address(this) && pay > 0){
            winnings[winner].add(pay); //SSTORE
        }else{

        }

        delete games[gameId];

        emit LogGameRetired(gameId, winner, loser, pay, block.timestamp);
    }

    function resolve(bytes32 gameId, address playerOne, Choice choiceOne, address playerTwo, Choice choiceTwo) internal {
        if(choiceOne == choiceTwo) {
            games[gameId].commitOne = NULL_BYTES; //SSTORE ? delete
            games[gameId].choiceOne = Choice.None; //SSTORE
            games[gameId].commitTwo = NULL_BYTES; //SSTORE
            games[gameId].choiceTwo = Choice.None; //SSTORE
            emit LogGameMovesTied(  playerOne, playerTwo, choiceOne, choiceTwo);
            return;
        }else {
            /* Rock = 1, Paper = 2, Siccsors = 3
            _value = (first*10 + second) only in {12,13,21,23,31,32}
            {13,21,31} playerOne wins, 
            {12,23,31} playerTwo wins
             */
            uint _value = (uint)(choiceOne).mul(10).add((uint)(choiceTwo));
            
            if(_value == 13 || _value == 21 || _value == 32){
                retire(gameId, playerOne, playerTwo);
            }else if(_value == 12 || _value == 23 || _value == 31){
                retire(gameId, playerTwo, playerOne);
            }else{
                assert(false);
            }
        }
    }

    function payout() public {
        uint pay = winnings[msg.sender];
        require(pay > 0, "RockPaperScissors::payout:There are no funds to payout");
        winnings[msg.sender] = 0; //SSTORE 
        LogPayout(msg.sender, pay);
        //msg.sender.transfer(pay);
        (bool success, ) = (msg.sender).call{value: pay}("");        
        require(success, "payout failed");
    }
}