// SPDX-License-Identifier: MIT
pragma solidity 0.7.0;

import "./SafeMath.sol";

contract RockPaperScissors {

    using SafeMath for uint;
    
    enum Choice  { None, Rock, Paper, Scissors }
    uint public nextGameId;

    struct GameMove {
        bytes32 commit;
        Choice choice;
    }   

    struct Game {
        mapping(address => GameMove) gameMoves;
        address playerOne;
        address playerTwo;
        bool playerTwoIsEnrolled;
        uint stake;
        uint deadline;
        uint lastCommitDeadline;
    }

    mapping (uint => Game) public games;
    mapping (address => uint) public winnings;

    uint constant public DEFAULT_GAME_LIFETIME = 1 days;
    uint constant public MAX_GAME_LIFETIME = 10 days;
    uint constant public MIN_GAME_LIFETIME = 1 hours;
    uint constant public COMMIT_WINDOW_DIVIDER = 873;
    uint constant public MIN_STAKE = 0;
    bytes32 constant public NULL_BYTES = bytes32(0);

    event LogGameCreated(uint indexed gameId, address indexed playerOne, address indexed playerTwo, bytes32 maskedChoice, uint deadline, uint lastCommitDeadline, bool stakedFromWinnings, uint staked);
    event LogGameEnrolled(uint indexed gameId, address indexed commiter, bytes32 maskedChoice, bool stakedFromWinnings, uint staked);
    event LogChoiceCommited(uint indexed gameId, address indexed commiter, bytes32 maskedChoice);    
    event LogChoiceRevealed(uint indexed gameId, address indexed revealer, Choice choice);
    event LogGameTied(uint indexed gameId, Choice choice, uint timeStamp);
    event LogGameFinished(uint indexed gameId, address indexed winner, address indexed loser, uint pay, uint retireTimeStamp);
    event LogGameSettled(uint indexed gameId, address indexed settler, bool playerOnePayed, bool playerTwoPayed, uint pay, uint settlementTimeStamp);
    event LogGameErased(uint indexed gameId, address indexed eraser);
    event LogPayout(address indexed payee, uint pay);

    constructor (){}

    function generateMaskedChoice (Choice choice, bytes32 mask, address masker, uint blockTimestamp) public view returns (bytes32 maskedChoice) {
        require(choice != Choice.None, "RockPaperScissors::generateMaskedChoice:Invalid Choice");
        require(mask != NULL_BYTES, "RockPaperScissors::generateMaskedChoice:mask can not be empty");
        require(block.timestamp >= blockTimestamp && blockTimestamp > 0, "RockPaperScissors::generateMaskedChoice:Invalid blockTimestamp");
        
        return keccak256(abi.encodePacked(choice, mask, masker, blockTimestamp, address(this)));
    }

    function createAndCommit(address otherPlayer, bytes32 maskedChoice, uint256 gameLifetime/*, bool stakeFromWinnings, uint stake*/) payable public {               
        require(msg.sender != otherPlayer, "RockPaperScissors::createAndCommit:Player addresses must be different");
        require(maskedChoice != NULL_BYTES, "RockPaperScissors::createAndCommit:Invalid maskedChoice value");
        require(gameLifetime >= MIN_GAME_LIFETIME,"RockPaperScissors::createAndCommit:Invalid minimum game deadline");
        require(gameLifetime <= MAX_GAME_LIFETIME,"RockPaperScissors::createAndCommit:Invalid maximum game deadline");       
        
        uint winningsBalance = winnings[msg.sender]; //SLOAD
        (bool isEligible,  uint amountToStake, uint newWinningsBalance, bool stakeFromWinnings) = processStake(msg.value, winningsBalance, MIN_STAKE);  //SLOAD    
        require(isEligible, "RockPaperScissors::createAndCommit:Insuffcient balance to stake");
        if(stakeFromWinnings) { winnings[msg.sender] = newWinningsBalance; } //SSTORE
        
        uint id = nextGameId.add(1); //SLOAD
        Game storage game = games[id];

        game.stake = amountToStake; //SSTORE
        game.playerOne = msg.sender; //SSTORE
        game.playerTwo = otherPlayer; //SSTORE
        game.gameMoves[msg.sender].commit =  maskedChoice; //SSTORE

        uint _gameDeadline =  gameLifetime.add(block.timestamp);
        uint _lastCommitDeadline = calculateLastCommitTimestamp(gameLifetime, _gameDeadline);
        game.deadline = _gameDeadline; //SSTORE        
        game.lastCommitDeadline = _lastCommitDeadline; //SSTORE        
        
        emit LogGameCreated(id, msg.sender, otherPlayer, maskedChoice, _gameDeadline, _lastCommitDeadline, stakeFromWinnings, amountToStake);
    }

     function processStake(uint sentValue, uint winingsBalance, uint minimumStake) 
        internal pure 
        returns (bool isEligible,  uint amountToStake, uint newWinningsBalance, bool stakeFromWinnings)
    {
        uint diff = sentValue.sub(minimumStake);        
        newWinningsBalance = winingsBalance.add(diff); 
        isEligible = (newWinningsBalance >= 0  || sentValue >= minimumStake);        
        stakeFromWinnings = diff < 0;
        amountToStake = stakeFromWinnings ? sentValue :  sentValue.add(-diff);
    }  

    function enrolAndCommit(uint gameId, bytes32 maskedChoice/*, bool stakeFromWinnings, uint stake */) public payable {        
        require(block.timestamp < games[gameId].deadline, "RockPaperScissors::enrolAndCommit:game has expired (or does not exist)"); //SSLOAD
        require(games[gameId].playerTwo == msg.sender , "RockPaperScissors::enrolAndCommit:sender is not player"); //SSLOAD
        require(!games[gameId].playerTwoIsEnrolled, "RockPaperScissors::enrolAndCommit:Second Player is already enrolled"); //SSLOAD
        require(maskedChoice != NULL_BYTES, "RockPaperScissors::enrolAndCommit:Invalid maskedChoice value");
        
        uint winningsBalance = winnings[msg.sender]; //SLOAD
        uint stakedInGame = games[gameId].stake; //SSLOAD

        (bool isEligible, uint amountToStake, uint newWinningsBalance, bool stakeFromWinnings) = processStake(msg.value, winningsBalance, stakedInGame);  //SLOAD    
        require(isEligible, "RockPaperScissors::enrolAndCommit:Insuffcient balance to stake");
        if(stakeFromWinnings) { winnings[msg.sender] = newWinningsBalance; } //SSTORE 
        
        games[gameId].stake = amountToStake; //SSTORE
        games[gameId].playerTwoIsEnrolled = true; //SSTORE
        games[gameId].gameMoves[msg.sender].commit = maskedChoice; //SSTORE

        emit LogGameEnrolled(gameId, msg.sender, maskedChoice, stakeFromWinnings, amountToStake);
    }

    function commit(uint gameId, bytes32 maskedChoice) public {        
        require(games[gameId].lastCommitDeadline > block.timestamp, "RockPaperScissors::commit:last commit deadline has expired (or game does not exist)"); //SSLOAD
        require(games[gameId].gameMoves[msg.sender].commit == NULL_BYTES, "RockPaperScissors::commit:choice already been commited"); //SSLOAD
        require(games[gameId].gameMoves[msg.sender].choice == Choice.None, "RockPaperScissors::commit:sender is not a player"); //SSLOAD        
        require(maskedChoice != NULL_BYTES, "RockPaperScissors::commit:Invalid commit value");

        games[gameId].gameMoves[msg.sender].commit = maskedChoice; //SSTORE

        emit LogChoiceCommited(gameId, msg.sender, maskedChoice);
    }

    function reveal(uint gameId, Choice choice, bytes32 mask,  uint maskingTimestamp) public { 
        require(block.timestamp < games[gameId].deadline, "RockPaperScissors::reveal:game has expired");   //SSLOAD
        require(games[gameId].gameMoves[msg.sender].commit == generateMaskedChoice(choice, mask, msg.sender, maskingTimestamp), "RockPaperScissors::reveal:Invalid mask and choice");  //SSLOAD
        
        address _counterParty = msg.sender == games[gameId].playerOne ? games[gameId].playerTwo : games[gameId].playerOne ; //SSLOAD            
        bytes32 counterPartyCommit = games[gameId].gameMoves[_counterParty].commit; //SSLOAD
        
        require(counterPartyCommit != NULL_BYTES, "RockPaperScissors::reveal:Other Player has not commited yet");
        Choice counterPartyChoice = games[gameId].gameMoves[_counterParty].choice; //SSLOAD
        
        if(counterPartyChoice == Choice.None){                
            games[gameId].gameMoves[msg.sender].choice = choice; //SSTORE
            emit LogChoiceRevealed(gameId, msg.sender, choice);
        }
        else {
            (bool _gameOver, bool _senderIsWinner) = resolve(choice, counterPartyChoice);
            
            _gameOver ? _senderIsWinner ? finish(gameId, msg.sender, _counterParty) 
                                        : finish(gameId, _counterParty, msg.sender) 
                        :resolveTiedGame(gameId, msg.sender, _counterParty, choice);
        }        
    }

    function resolveTiedGame(uint gameId, address playerOne, address playerTwo, Choice choice) internal {
        delete games[gameId].gameMoves[playerOne];        
        delete games[gameId].gameMoves[playerTwo];
        emit LogGameTied(gameId, choice, block.timestamp);
    }

    function finish(uint gameId, address winner, address loser) internal {
        uint pay = games[gameId].stake; //SSLOAD
        winnings[winner] = winnings[winner].add(games[gameId].stake); //SSTORE
        eraseGame(gameId, winner, loser);
        emit LogGameFinished(gameId, winner, loser, pay, block.timestamp);
    }

    /* @dev Determines winner or tie payments, retires game.
        4 (+ 1) scenarios - 2 choice states (None, Revealed) x 2 players
        (None, None) + !playerTwoIsEnrolled => pay playerOne
        (None, None) + playerTwoIsEnrolled => pay both, 
        (Revaled, None) => pay playerOne
        (None, Revaled) => pay playerTwo        
        (Revaled, Revaled) not possible on an expired game
        @params gameId uint
     */
    function settle(uint gameId) external {
        require(block.timestamp > games[gameId].deadline, "RockPaperScissors::settle:Game has not yet expired"); //SSLOAD
        uint pay = games[gameId].stake; //SSLOAD

        address playerOne = games[gameId].playerOne; //SSLOAD
        address playerTwo = games[gameId].playerTwo; //SSLOAD
        bool choiceOneRevealed = games[gameId].gameMoves[playerOne].choice != Choice.None; //SSLOAD
        bool choiceTwoRevealed = games[gameId].gameMoves[playerTwo].choice != Choice.None; //SSLOAD
        
        if(choiceOneRevealed && !choiceTwoRevealed) 
        {
            winnings[playerOne] = winnings[playerOne].add(pay); //SSTORE
            LogGameSettled(gameId, msg.sender, true, false, pay, block.timestamp);
        } 
        else if(!choiceOneRevealed && choiceTwoRevealed) {
            winnings[playerTwo] = winnings[playerTwo].add(pay); //SSTORE
            LogGameSettled(gameId, msg.sender, false, true, pay, block.timestamp);
        }
        else if(!choiceOneRevealed && !choiceTwoRevealed){
            if(games[gameId].playerTwoIsEnrolled) { //SSLOAD
                uint owed = pay.div(2); // pay is always an even number (or 0)
                winnings[playerOne] = winnings[playerOne].add(owed); //SSTORE
                winnings[playerTwo] = winnings[playerTwo].add(owed); //SSTORE
                LogGameSettled(gameId, msg.sender, true, true, owed, block.timestamp);
            }
            else {   
                winnings[playerOne] = winnings[playerOne].add(pay); //SSTORE
                LogGameSettled(gameId, msg.sender, true, false, pay, block.timestamp);                
            }
        }
        else {         
            assert(false);
        }

        eraseGame(gameId, playerOne, playerTwo);
    }
    
    function eraseGame(uint gameId, address address1, address address2) private {
        delete games[gameId].gameMoves[address1];
        delete games[gameId].gameMoves[address2];
        delete games[gameId];
        emit LogGameErased(gameId, msg.sender);
    }

    function getGameMove(uint gameId, address player) public view returns (bytes32 _commit, Choice choice) {
        return (games[gameId].gameMoves[player].commit, games[gameId].gameMoves[player].choice);
    }

    /* @dev resolve
        Rock = 1, Paper = 2, Siccsors = 3
        result = (senderChoice + 3 - counterPartyChoice) % 3
        result = 0 => game tied
        result = 1 => player one wins, 
        result = 2 => player two wins  */
    function resolve(Choice senderChoice, Choice counterPartyChoice) internal pure returns (bool gameOver, bool senderIsWinner) {        
        uint _result =  SafeMath.mod(uint(senderChoice).add(3).sub(uint(counterPartyChoice)), 3) ;
        return (_result != 0, _result == 1);
    }

    function payout() public {
        uint pay = winnings[msg.sender];
        require(pay > 0, "RockPaperScissors::payout:There are no funds to payout");
        winnings[msg.sender] = 0; //SSTORE 
        LogPayout(msg.sender, pay);
        (bool success, ) = (msg.sender).call{value: pay}("");        
        require(success, "payout failed");
    }

    /*@dev computes commit deadline timestamp value
    994 provides a commit deadline of 
        COMMIT_WINDOW_DIVIDER = 873 ~ MAX_GAME_LIFETIME.div(994).add(4) for MAX_GAME_LIFETIME = 10 days
        *! The calculation and numbers will change as MAX_GAME_LIFETIME is changed !*
        ~ 15 min         @ gameLifetime = MAX_GAME_LIFETIME = 10 days
        ~ 15 min (25%)   @ gameLifetime = MIN_GAME_LIFETIME = 1 hours;
        Intermediate Commit deadline values are approximately 
        15 minutes (900 seconds) with a variance of 90 seconds
    */
    function calculateLastCommitTimestamp(uint256 gameLifetime, uint gameDeadline) pure public returns(uint lastCommitTimeStamp) {        
        return gameDeadline.sub(gameLifetime.div(COMMIT_WINDOW_DIVIDER));       
    }
}