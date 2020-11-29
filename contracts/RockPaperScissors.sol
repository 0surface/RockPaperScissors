// SPDX-License-Identifier: MIT
pragma solidity 0.7.0;

import "./SafeMath.sol";

contract RockPaperScissors {

    using SafeMath for uint;
    
    enum Choice  { None, Rock, Paper, Scissors }
    uint nextGameId;

    struct GameMove {
        bytes32 commit;
        Choice choice;
    }

    struct Game {
        mapping(address => GameMove) gameMoves;
        address playerOne;
        address playerTwo;
        bool playerTwoIsNotEnrolled;
        uint stake;
        uint deadline;
    }

    mapping (uint => Game) public games;
    mapping (address => uint) public winnings;

    uint constant public DEFAULT_GAME_LIFETIME = 1 days;
    uint constant public MAX_GAME_LIFETIME = 10 days;
    uint constant public MIN_GAME_LIFETIME = 1 minutes;
    uint constant public MIN_STAKE = 0;
    bytes32 constant public NULL_BYTES = bytes32(0);

    event LogGameCreated(uint indexed gameId, address indexed playerOne, address indexed playerTwo, uint staked, uint deadline, bool stakedFromWinnings);
    event LogGameEnrolled(uint indexed gameId, address indexed commiter, bytes32 hashedChoice, bool stakedFromWinnings);    
    event LogChoiceRevealed(uint indexed gameId, address indexed revealer, Choice choice);
    event LogChoiceCommited(uint indexed gameId, address indexed commiter, bytes32 hashedChoice);    
    event LogGameMovesTied(uint indexed gameId, Choice choice, uint timeStamp);
    event LogGameFinished(uint indexed gameId, address indexed winner, address indexed loser, uint pay, uint retireTimeStamp);
    event LogGameSettled(uint indexed gameId, address indexed settler, bool playerOnePayed, bool playerTwoPayed, uint pay, uint settlementTimeStamp);
    event LogGameErased(uint indexed gameId, address eraser);
    event LogPayout(address indexed payee, uint pay);

    constructor (){}
    
    function generateChoice (Choice choice, bytes32 mask) view public returns (bytes32 hashedChoice) {
        require(choice != Choice.None, "RockPaperScissors::generateChoice:Invalid Choice");
        require(mask != NULL_BYTES, "RockPaperScissors::generateChoice:mask can not be empty");
        return keccak256(abi.encodePacked(choice, mask, msg.sender, address(this)));
    }

    function createGame(address otherPlayer, bytes32 hashedChoice, uint256 gameLifetime, bool stakeFromWinnings, uint amountFromStake) payable public {               
        require(msg.sender != otherPlayer, "RockPaperScissors::createGame:Player addresses must be different");
        require(hashedChoice != NULL_BYTES, "RockPaperScissors::play:Invalid hashedChoice value");
        require(gameLifetime >= MIN_GAME_LIFETIME,"RockPaperScissors::createGame:Invalid minimum game deadline");
        require(gameLifetime <= MAX_GAME_LIFETIME,"RockPaperScissors::createGame:Invalid minimum game deadline");        

        uint gameId = nextGameId;
        require(games[gameId].deadline == 0, "RockPaperScissors::createGame:An active game exists with given inputs"); //SSLOAD
        
        Game storage game = games[gameId];

        if(stakeFromWinnings){
            require(msg.value == 0, "RockPaperScissors::createGame:Sent value should be 0 when staking from winnings");
            require(amountFromStake >= MIN_STAKE, "RockPaperScissors::createGameFromWinnings:Invalid minumum stake amount");
            require(winnings[msg.sender] >= amountFromStake, "RockPaperScissors::createGameFromWinnings:Insufficient stake funds in winnings");
            winnings[msg.sender].sub(amountFromStake); //SSTORE
            game.stake = amountFromStake; //SSTORE
        }else{  
            require(msg.value >= MIN_STAKE, "RockPaperScissors::createGame:Insufficient stake funds");
            game.stake = msg.value; //SSTORE
        }

        uint _gameDeadline = gameLifetime > MIN_GAME_LIFETIME ? gameLifetime.add(block.timestamp): DEFAULT_GAME_LIFETIME.add(block.timestamp);
        game.deadline = _gameDeadline; //SSTORE
        game.playerOne = msg.sender; //SSTORE
        game.playerTwo = otherPlayer; //SSTORE 
        game.playerTwoIsNotEnrolled = true; //SSTORE 
        game.gameMoves[msg.sender] = GameMove({commit: hashedChoice, choice: Choice.None}); //SSTORE x 2 slots               
        
        nextGameId = nextGameId.add(1);
        emit LogGameCreated(gameId, msg.sender, otherPlayer, msg.value, _gameDeadline, stakeFromWinnings);
    }

    function enrol(uint gameId, bytes32 hashedChoice, bool stakeFromWinnings) public payable {        
        require(block.timestamp < games[gameId].deadline, "RockPaperScissors::play:game has expired (or does not exist)"); //SSLOAD
        require(games[gameId].playerTwo == msg.sender , "RockPaperScissors::enrol:sender is not player"); //SSLOAD
        require(games[gameId].playerTwoIsNotEnrolled, "RockPaperScissors::enrol:Second Player is already enrolled"); //SSLOAD

        uint amountToStake = games[gameId].stake; //SSLOAD
        require(hashedChoice != NULL_BYTES, "RockPaperScissors::play:Invalid hashedChoice value");

        if(stakeFromWinnings){
            require(msg.value == 0, "RockPaperScissors::enrol:You should not desposit when staking from winnings");
            require(amountToStake >= MIN_STAKE, "RockPaperScissors::enrol:Invalid minumum stake amount");
            require(winnings[msg.sender] >= amountToStake, "RockPaperScissors::enrol:Insufficient stake funds in winnings");             
            winnings[msg.sender].sub(amountToStake);//SSTORE
            games[gameId].stake = games[gameId].stake.add(amountToStake); //SSTORE
        }else{
            require(msg.value >= amountToStake, "RockPaperScissors::enrol:Insufficient stake funds");
            games[gameId].stake.add(amountToStake); //SSTORE        
        }

        delete games[gameId].playerTwoIsNotEnrolled; //DELETE
        games[gameId].gameMoves[msg.sender] = GameMove({commit: hashedChoice, choice:Choice.None}); //SSTORE x 2 slots

        emit LogGameEnrolled(gameId, msg.sender, hashedChoice, stakeFromWinnings);
    }

    function commit(uint gameId, bytes32 hashedChoice) public {        
        require(games[gameId].deadline > block.timestamp, "RockPaperScissors::commit:game has expired (or does not exist)"); //SSLOAD
        require(games[gameId].gameMoves[msg.sender].choice == Choice.None, "RockPaperScissors::commit:sender is not a player"); //SSLOAD
        require(games[gameId].gameMoves[msg.sender].commit == NULL_BYTES, "RockPaperScissors::commit:choice already been commited"); //SSLOAD
        require(hashedChoice != NULL_BYTES, "RockPaperScissors::commit:Invalid commit value");

        games[gameId].gameMoves[msg.sender].commit = hashedChoice; //SSTORE

        emit LogChoiceCommited(gameId, msg.sender, hashedChoice);
    }

    function reveal(uint gameId, Choice choice, bytes32 mask) public { 
        require(block.timestamp < games[gameId].deadline, "RockPaperScissors::reveal:game has expired"); 

        if(games[gameId].gameMoves[msg.sender].commit == generateChoice(choice, mask))
        {
            address counterParty = msg.sender == games[gameId].playerOne ? games[gameId].playerTwo : games[gameId].playerOne ; //SSLOAD            
            bytes32 counterPartyCommit = games[gameId].gameMoves[counterParty].commit; //SSLOAD
            
            require(counterPartyCommit != NULL_BYTES, "RockPaperScissors::reveal:Other Player has not commited yet");
            Choice counterPartyChoice = games[gameId].gameMoves[counterParty].choice; //SSLOAD
            
            if(counterPartyChoice == Choice.None){                
                games[gameId].gameMoves[msg.sender].choice = choice; //SSTORE
                emit LogChoiceRevealed(gameId, msg.sender, choice);
            }
            else {
               (bool gameOver, bool senderIsWinner) = resolve(choice, counterPartyChoice);
               
               gameOver ? gameTied(gameId, msg.sender,counterParty, choice)
                        : senderIsWinner ? finish(gameId, msg.sender, counterParty) 
                                         : finish(gameId, counterParty, msg.sender);
            }
        } else{
            revert("RockPaperScissors::reveal:Invalid mask and choice");
        }
    }

    function finish(uint gameId, address winner, address loser) internal {
        uint pay = games[gameId].stake; //SSLOAD
        winnings[winner] = winnings[winner].add(pay > 0 ? pay : 0); //SSTORE
        erase(gameId);
        emit LogGameFinished(gameId, winner, loser, pay, block.timestamp);
    }

    /* @dev Determines winner or tie payments, retires game.
        4 (+ 1) scenarios - 2 choice states (None, Revealed) x 2 players
        (None, None) + playerTwoIsNotEnrolled => pay playerOne
        (None, None) + !playerTwoIsNotEnrolled => pay both, 
        (Revaled, None) => pay playerOne
        (None, Revaled) => pay playerTwo        
        (Revaled, Revaled) not possible on an expired game
        @params gameId uint
     */
    function settle(uint gameId) external {
        require(block.timestamp > games[gameId].deadline, "RockPaperScissors::settle:Game has not yet expired");
        uint pay = games[gameId].stake; //SSLOAD

        address playerOne = games[gameId].playerOne; //SSLOAD
        address playerTwo = games[gameId].playerTwo; //SSLOAD
        bool choiceOneRevealed = games[gameId].gameMoves[playerOne].choice == Choice.None; //SSLOAD
        bool choiceTwoRevealed = games[gameId].gameMoves[playerTwo].choice == Choice.None; //SSLOAD
        
        //1 has revealed, 2 has not OR 2 has not enrolled
        if(choiceOneRevealed && !choiceTwoRevealed) 
        {
            winnings[playerOne] = winnings[playerOne].add(pay); //SSTORE
            LogGameSettled(gameId, msg.sender, true, false, pay, block.timestamp);
        }
        // 2 has revealed, 1 has not OR 1 is invalid, 2 is enrolled
        else if(!choiceOneRevealed && choiceTwoRevealed) 
        {
            winnings[playerTwo] = winnings[playerTwo].add(pay); //SSTORE
            LogGameSettled(gameId, msg.sender, false, true, pay, block.timestamp);
        }
        else if(!choiceOneRevealed && !choiceTwoRevealed){
            if(games[gameId].playerTwoIsNotEnrolled) //SSLOAD
            {
                winnings[playerOne] = winnings[playerOne].add(pay); //SSTORE
                LogGameSettled(gameId, msg.sender, true, false, pay, block.timestamp);
            }
            else
            {
                uint owed = pay.div(2); // pay is always an even number (or 0)
                winnings[playerOne] = winnings[playerOne].add(owed); //SSTORE
                winnings[playerTwo] = winnings[playerTwo].add(owed); //SSTORE
                LogGameSettled(gameId, msg.sender, true, true, owed, block.timestamp);
            }
        }
        else {         
            assert(false);
        }

        erase(gameId);
    }
   
    function gameTied(uint gameId, address playerOne, address playerTwo, Choice choice) internal {
        delete games[gameId].gameMoves[playerOne].commit;
        delete games[gameId].gameMoves[playerTwo].commit;
        delete games[gameId].gameMoves[playerOne].choice;
        delete games[gameId].gameMoves[playerTwo].choice;
        emit LogGameMovesTied(gameId, choice, block.timestamp);
    }

    function erase(uint gameId) private {
        delete games[gameId];
        emit LogGameErased(gameId, msg.sender);
    }

    function resolve(Choice senderChoice, Choice counterPartyChoice) internal pure returns (bool gameOver, bool senderIsWinner) {
        if(senderChoice == counterPartyChoice) {
           return (false, false);
        }else {
            /* Rock = 1, Paper = 2, Siccsors = 3
            _value = (first*10 + second) only in {12,13,21,23,31,32}
            {13,21,31} playerOne wins, 
            {12,23,31} playerTwo wins
             */
            uint _value = (uint)(senderChoice).mul(10).add((uint)(counterPartyChoice));
            
            return (true,_value == 13 || _value == 21 || _value == 32);
        }
    }

    function payout() public {
        uint pay = winnings[msg.sender];
        require(pay > 0, "RockPaperScissors::payout:There are no funds to payout");
        winnings[msg.sender] = 0; //SSTORE 
        LogPayout(msg.sender, pay);
        (bool success, ) = (msg.sender).call{value: pay}("");        
        require(success, "payout failed");
    }
}