// SPDX-License-Identifier: MIT
pragma solidity 0.7.0;

contract RockPaperScissors {
    
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

    uint constant public DEFAULT_GAME_LIFETIME = 86400 seconds; // 24 hours
    uint constant public MAX_GAME_LIFETIME = 31536000 seconds; // 1 year
    uint constant public MIN_GAME_LIFETIME = 60 seconds; //1 minute
    uint constant public MIN_STAKE = 0; //TODO: Set to dev/Game fee
    bytes32 constant public NULL_BYTES = bytes32(0);

    event LogGameCreated(bytes32 indexed gameId, address indexed playerOne, address indexed playerTwo, uint staked, uint deadline);
    event LogGameRetired(bytes32 indexed gameId, address indexed winner, address indexed loser, uint pay, uint retireTimeStamp);
    event LogChoiceRevealed(bytes32 indexed gameId, address indexed revealer, Choice choice);
    event LogChoiceCommited(bytes32 indexed gameId, address indexed commiter, bytes32 hashedChoice);
    event LogGameMovesTied(address indexed playerOne, address indexed playerTwo,Choice choiceOne, Choice choiceTwo);
    event LogPayout(address indexed payee, uint pay) ;

    constructor (){}
    
     function generateChoice (Choice choice, bytes32 mask) view public returns (bytes32 hashedChoice) {
        require(choice != Choice.None, "RockPaperScissors::generateChoice:Choice can not be none");
        require(mask != NULL_BYTES, "RockPaperScissors::generateChoice:mask can not be empty");
        return keccak256(abi.encodePacked(choice, mask, address(this)));
    }

    function createGame(address otherPlayer, bytes32 hashedChoice, uint gameLifetime, bool stakeFromWinnings) payable public {
        require(msg.sender != otherPlayer, "RockPaperScissors::createGame:Player addresses must be different");
        bytes32 gameId = keccak256(abi.encodePacked(msg.sender, otherPlayer, block.number));

        require(games[gameId].deadline == 0, "RockPaperScissors::createGame:An active game exists");
        require(hashedChoice != NULL_BYTES, "RockPaperScissors::play:Invalid hashedChoice value");
        require(gameLifetime >= MIN_GAME_LIFETIME,"RockPaperScissors::createGame:Invalid minimum game deadline");
        require(gameLifetime <= MAX_GAME_LIFETIME,"RockPaperScissors::createGame:Invalid minimum game deadline");
        
        if(stakeFromWinnings){
            require(winnings[msg.sender] >= MIN_STAKE, "RockPaperScissors::createGame:Insufficient stake funds in winnings");
        }else{
            require(msg.value >= MIN_STAKE, "RockPaperScissors::createGame:Insufficient stake funds");
        }

        Game storage game = games[gameId];
        game.playerOne = msg.sender; //SSTORE
        game.playerTwo = otherPlayer; //SSTORE
        game.stake = msg.value; //SSTORE

        //TODO: use safeMath
        uint _gameDeadline = gameLifetime == 0 ? (block.timestamp + DEFAULT_GAME_LIFETIME) : (block.timestamp + gameLifetime);
        game.deadline = _gameDeadline; //SSTORE
        
        emit LogGameCreated(gameId, msg.sender, otherPlayer, msg.value, _gameDeadline);
    }

    function enrol(bytes32 gameId, bytes32 hashedChoice, bool stakeFromWinnings) public payable {
        require(gameId != NULL_BYTES, "RockPaperScissors::enrol:Invalid game id");
        uint _deadline = games[gameId].deadline;
        require(_deadline != 0, "RockPaperScissors::enrol:game does not exist");
        require(block.timestamp <=_deadline, "RockPaperScissors::enrol:game has expired");
        require(games[gameId].playerTwo == msg.sender, "RockPaperScissors::enrol:sender is not player");
        require(games[gameId].commitOne != NULL_BYTES, "RockPaperScissors::enrol:Invalid game state, can't enroll");

        uint stakeAmount = games[gameId].stake; 
        require(hashedChoice != NULL_BYTES, "RockPaperScissors::play:Invalid hashedChoice value");

        if(stakeFromWinnings){
            require(winnings[msg.sender] >= stakeAmount, "RockPaperScissors::enrol:Insufficient stake funds in winnings");
        }else{
            require(msg.value >= stakeAmount, "RockPaperScissors::enrol:Insufficient stake funds");
        }
        
        games[gameId].commitTwo = hashedChoice; //SSTORE
        games[gameId].stake += stakeAmount; //SSTORE
        games[gameId].playerTwoIsEnrolled = true; //SSTORE
        emit LogChoiceCommited(gameId, msg.sender, hashedChoice);
    }

    function play(bytes32 hashedChoice, bytes32 gameId) public {
        require(gameId != NULL_BYTES, "RockPaperScissors::play:Invalid game id");
        require(hashedChoice != NULL_BYTES, "RockPaperScissors::play:Invalid hashedChoice value");
        
        uint _deadline = games[gameId].deadline; //SSLOAD
        require(_deadline != 0, "RockPaperScissors::play:game does not exist");
        require(block.timestamp <=_deadline, "RockPaperScissors::play:game has expired");

        address _playerOne = games[gameId].playerOne; //SSLOAD        
        address _playerTwo = games[gameId].playerTwo; //SSLOAD        
        require(_playerOne == msg.sender || _playerTwo == msg.sender, "RockPaperScissors::play:Invalid player");         

        if(_playerOne == msg.sender){
            //SSLOAD            
            require(games[gameId].commitOne == NULL_BYTES, "RockPaperScissors::play: You have already commited a choice");
            games[gameId].commitOne = hashedChoice;  //SSTORE         
        }else {
            //SSLOAD
            require( games[gameId].playerTwoIsEnrolled, "RockPaperScissors::play:You have to enrol to play");
            require(games[gameId].commitTwo == NULL_BYTES, "RockPaperScissors::play:You have already commited a choice");
            games[gameId].commitTwo= hashedChoice;  //SSTORE
        }

        emit LogChoiceCommited(gameId, msg.sender, hashedChoice);
    }

    function reveal(Choice choice, bytes32 mask, bytes32 gameId) public returns (Choice) {  
        require(choice != Choice.None, "RockPaperScissors::reveal:Invalid Choice");
        require(mask != NULL_BYTES, "RockPaperScissors::reveal:Invalid mask");              
        require(gameId != NULL_BYTES, "RockPaperScissors::reveal:Invalid game id");
        require(games[gameId].deadline != 0, "RockPaperScissors::reveal:game does not exist"); //SSLOAD
        
        address _playerOne = games[gameId].playerOne; //SSLOAD        
        address _playerTwo = games[gameId].playerTwo; //SSLOAD        
        require(_playerOne == msg.sender || _playerTwo == msg.sender, "RockPaperScissors::reveal:Invalid player");

        bytes32 _commitTwo = games[gameId].commitTwo; //SSLOAD
        bytes32 _commitOne = games[gameId].commitOne; //SSLOAD
        require(_commitOne != NULL_BYTES &&  _commitTwo != NULL_BYTES, "RockPaperScissors::reveal:Commits have not been yet set");
        
        if(_playerOne == msg.sender){
            require(generateChoice(choice, mask) != _commitOne, "RockPaperScissors::reveal:Revealed choice does not match commited choice");
            Choice _choiceTwo = games[gameId].choiceTwo; //SSLOAD
            require(_choiceTwo != Choice.None, "RockPaperScissors::reveal:Other player has not revealed their choice");
            
            if(_choiceTwo == Choice.None){                
                games[gameId].choiceOne = choice; //SSTORE
                emit LogChoiceRevealed(gameId, msg.sender, choice);
            }
            else{
                resolve(gameId, _playerOne, choice, _playerTwo, _choiceTwo);              
            }
        }else{
            require(generateChoice(choice, mask) != _commitTwo, "RockPaperScissors::reveal:Revealed choice does not match commited choice");
            Choice _choiceOne = games[gameId].choiceOne; //SSLOAD
            require(_choiceOne != Choice.None, "RockPaperScissors::reveal:Other player has not revealed their choice");
            
            if(_choiceOne == Choice.None){                
                games[gameId].choiceTwo = choice; //SSTORE
                emit LogChoiceRevealed(gameId, msg.sender, choice);
            }
            else {
                resolve(gameId, _playerOne, _choiceOne, _playerTwo, choice);              
            }
        }
    }

    function retire(bytes32 gameId, address winner, address loser) internal {
        uint pay = games[gameId].stake; //SSLOAD

        if(winner != address(this) && pay > 0){
            winnings[winner] += pay; //SSTORE
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
            if (choiceOne == Choice.Rock) {
                if (choiceTwo == Choice.Paper) retire(gameId, playerTwo, playerOne);
                if (choiceTwo == Choice.Scissors) retire(gameId, playerOne, playerTwo);
            } 
            else if (choiceOne == Choice.Paper){
                if (choiceTwo == Choice.Rock) retire(gameId,playerOne,playerTwo);
                if (choiceTwo == Choice.Scissors) retire(gameId, playerTwo, playerOne);
            } 
            else if (choiceOne == Choice.Scissors){
                if (choiceTwo == Choice.Rock) retire(gameId, playerTwo, playerOne);
                if (choiceTwo == Choice.Paper) retire(gameId, playerOne, playerTwo);
            } else{
                //Should never come here.
            }
        }
    }

    function payout() public {
        uint pay = winnings[msg.sender];
        require(pay > 0, "RockPaperScissors::payout:There are no funds to payout");
        winnings[msg.sender] = 0; //SSTORE 
        LogPayout(msg.sender, pay);
        msg.sender.transfer(pay);
    }
}