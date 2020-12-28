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
        address playersKey;
        uint stake;
        uint deadline;
    }

    mapping (uint => Game) public games;
    mapping (address => uint) public winnings;

    uint constant public POST_COMMIT_WAIT_WINDOW = 12 hours;
    uint constant public MAX_GAME_LIFETIME = 10 days;
    uint constant public MIN_GAME_LIFETIME = 1 hours;
    uint constant public MIN_STAKE = 0;
    bytes32 constant public NULL_BYTES = bytes32(0);

    event LogGameCreated(uint indexed gameId, address indexed playerOne, address indexed playerTwo, bytes32 maskedChoice, uint deadline, bool stakedFromWinnings, uint staked);
    event LogGameEnrolled(uint indexed gameId, address indexed commiter, bytes32 maskedChoice, bool stakedFromWinnings, uint staked);    
    event LogChoiceCommited(uint indexed gameId, address indexed commiter, bytes32 maskedChoice);    
    event LogChoiceRevealed(uint indexed gameId, address indexed revealer, Choice choice);    
    event LogGameFinished(uint indexed gameId, address indexed winner, address indexed loser, Choice winnerChoice, address resolver, uint pay, uint finishTimeStamp);
    event LogGameTied(uint indexed gameId, address indexed resolver, Choice choice, uint timeStamp);
    event LogWinningsBalanceChanged(address indexed player, uint oldBalance, uint newBalance);
    event LogPayout(address indexed payee, uint pay);

    constructor (){}

    function generateMaskedChoice (Choice choice, bytes32 mask, address masker, uint blockTimestamp) public view returns (bytes32 maskedChoice) {
        require(choice != Choice.None, "RockPaperScissors::generateMaskedChoice:Invalid Choice");
        require(mask != NULL_BYTES, "RockPaperScissors::generateMaskedChoice:mask can not be empty");
        require(blockTimestamp > block.timestamp.sub(MAX_GAME_LIFETIME.mul(2)), "RockPaperScissors::generateMaskedChoice:Invalid blockTimestamp");
        
        return keccak256(abi.encodePacked(choice, mask, masker, blockTimestamp, address(this)));
    }

    function createAndCommit(address otherPlayer, bytes32 maskedChoice, uint256 gameLifetime, uint amountToStake) payable public {               
        require(msg.sender != otherPlayer, "RockPaperScissors::createAndCommit:Player addresses must be different");
        require(maskedChoice != NULL_BYTES, "RockPaperScissors::createAndCommit:Invalid maskedChoice value");
        require(gameLifetime >= MIN_GAME_LIFETIME,"RockPaperScissors::createAndCommit:Invalid minimum game deadline");
        require(gameLifetime <= MAX_GAME_LIFETIME,"RockPaperScissors::createAndCommit:Invalid maximum game deadline");       
        
        uint winningsBalance = winnings[msg.sender]; //SLOAD

        uint _newWinningsBalance = winningsBalance.add(msg.value).sub(amountToStake, "RockPaperScissors::createAndCommit:Insuffcient balance to stake");
        require(amountToStake >= MIN_STAKE, "RockPaperScissors::createAndCommit:Insuffcient balance to stake, below minimum threshold");    
        
        if(winningsBalance != _newWinningsBalance) { 
            winnings[msg.sender] = _newWinningsBalance; //SSTORE
            emit LogWinningsBalanceChanged(msg.sender, winningsBalance, _newWinningsBalance);
        } 
        
        nextGameId += 1; //SSTORE
        uint id = nextGameId; //SLOAD        
        Game storage game = games[id];

        game.stake = amountToStake; //SSTORE
        game.playerOne = msg.sender; //SSTORE        
        game.playersKey = address(uint(msg.sender) ^ uint(otherPlayer)); //SSTORE
        game.gameMoves[msg.sender].commit =  maskedChoice; //SSTORE

        uint _gameDeadline =  gameLifetime.add(block.timestamp);        
        game.deadline = _gameDeadline; //SSTORE               
        
        emit LogGameCreated(id, msg.sender, otherPlayer, maskedChoice, _gameDeadline, winningsBalance != _newWinningsBalance, amountToStake);
    }
    
    function enrolAndCommit(uint gameId, bytes32 maskedChoice, uint amountToStake) public payable {        
         uint _deadline = games[gameId].deadline; //SLOAD
        require(block.timestamp <= _deadline, "RockPaperScissors::enrolAndCommit:game has expired (or does not exist)"); //SLOAD
        require(maskedChoice != NULL_BYTES, "RockPaperScissors::enrolAndCommit:Invalid maskedChoice value");
        require(games[gameId].playersKey == address(uint(games[gameId].playerOne) ^ uint(msg.sender)), "RockPaperScissors::enrolAndCommit:sender is not player"); //SLOAD, SLOAD
        require(games[gameId].gameMoves[msg.sender].commit == NULL_BYTES , "RockPaperScissors::enrolAndCommit:player is already enrolled"); //SLOAD        
        
        uint winningsBalance = winnings[msg.sender]; //SLOAD
        uint stakedInGame = games[gameId].stake; //SLOAD

        uint _newWinningsBalance = winningsBalance.add(msg.value).sub(amountToStake, "RockPaperScissors::enrolAndCommit:Insuffcient balance to stake");
        require(amountToStake >= stakedInGame, "RockPaperScissors::enrolAndCommit:Insuffcient balance to stake, below minimum threshold");    
        
        if(winningsBalance != _newWinningsBalance) { 
            winnings[msg.sender] = _newWinningsBalance; //SSTORE
            emit LogWinningsBalanceChanged(msg.sender, winningsBalance, _newWinningsBalance);
        } 
                
        games[gameId].gameMoves[msg.sender].commit = maskedChoice; //SSTORE

        if(block.timestamp.add(POST_COMMIT_WAIT_WINDOW) > _deadline) {
            games[gameId].deadline += POST_COMMIT_WAIT_WINDOW; //SSTORE
        }

        emit LogGameEnrolled(gameId, msg.sender, maskedChoice, winningsBalance != _newWinningsBalance, amountToStake);
    }

    function reveal(uint gameId, Choice choice, bytes32 mask,  uint maskingTimestamp) public { 
        require(block.timestamp <= games[gameId].deadline, "RockPaperScissors::reveal:game has expired");   //SSLOAD
        require(games[gameId].gameMoves[msg.sender].commit == generateMaskedChoice(choice, mask, msg.sender, maskingTimestamp), "RockPaperScissors::reveal:Invalid mask and choice");  //SLOAD        
        address _counterParty = address(uint(msg.sender) ^ uint(games[gameId].playersKey)); //SLOAD
        bytes32 counterPartyCommit = games[gameId].gameMoves[_counterParty].commit; //SLOAD        
        
        require(counterPartyCommit != NULL_BYTES, "RockPaperScissors::reveal:Other Player has not commited yet");
        Choice counterPartyChoice = games[gameId].gameMoves[_counterParty].choice; //SSLOAD
        
        if(counterPartyChoice == Choice.None){                
            games[gameId].gameMoves[msg.sender].choice = choice; //SSTORE
            emit LogChoiceRevealed(gameId, msg.sender, choice);
        }
        else {
            uint pay = games[gameId].stake; //SLOAD
            (bool _gameOver, bool _senderIsWinner) = solve(choice, counterPartyChoice);
            
            _gameOver ? _senderIsWinner ? finish(gameId, msg.sender, _counterParty, choice, pay.add(pay)) 
                                        : finish(gameId, _counterParty, msg.sender, counterPartyChoice, pay.add(pay)) 
                        :finishTiedGame(gameId, msg.sender, _counterParty, choice, pay);
        }        
    }

    function finishTiedGame(uint gameId, address sender, address counterParty, Choice choice, uint pay) internal {
        if(pay != 0){
            uint balanceOne = winnings[sender]; //SLOAD
            winnings[sender] = balanceOne.add(pay); //SSTORE
            emit LogWinningsBalanceChanged(sender, balanceOne, balanceOne.add(pay));

            uint balanceTwo = winnings[counterParty]; //SLOAD
            winnings[counterParty] = balanceTwo.add(pay); //SSTORE
            emit LogWinningsBalanceChanged(counterParty, balanceTwo, balanceTwo.add(pay));        
        }

        eraseGame(gameId, sender, counterParty);
        emit LogGameTied(gameId, msg.sender, choice, block.timestamp);        
    }

    function finish(uint gameId, address winner, address loser, Choice winningChoice, uint pay) internal {
        uint pay = games[gameId].stake; //SLOAD
        if(pay != 0) {
            uint balance = winnings[winner]; //SLOAD        
            emit LogWinningsBalanceChanged(winner, balance, balance.add(pay));
            winnings[winner] = balance.add(pay); //SSTORE
        }
        
        eraseGame(gameId, winner, loser);
        emit LogGameFinished(gameId, winner, loser, winningChoice, msg.sender, pay, block.timestamp);
    }

    /* @dev Determines winner or tie payments, retires game.
        4 (+ 1) scenarios - 2 choice states (None, Revealed) x 2 players
        * playerTwo != address(0) => playerTwoIsEnrolled
        (None, None) + !playerTwoIsEnrolled => pay playerOne its stake only
        (None, None) + playerTwoIsEnrolled => pay both, 
        (Revaled, None) => pay playerOne
        (None, Revaled) => pay playerTwo        
        (Revaled, Revaled) not possible on an expired game
        @params gameId uint
     */
    function settle(uint gameId) external {
        require(block.timestamp > games[gameId].deadline, "RockPaperScissors::settle:Game has not yet expired"); //SSLOAD
       
        address playerOne = games[gameId].playerOne; //SSLOAD        
        address playerTwo = address(uint(playerOne) ^ uint(games[gameId].playersKey)); //SLOAD
        Choice choiceOne = games[gameId].gameMoves[playerOne].choice; //SLOAD
        Choice choiceTwo = games[gameId].gameMoves[playerTwo].choice; //SLOAD
        uint staked = games[gameId].stake; //SLOAD
        
        if(choiceOne != Choice.None && choiceTwo == Choice.None) 
        {
            finish(gameId, playerOne, playerTwo, choiceOne, staked.add(staked));
        } 
        else if(choiceOne == Choice.None && choiceTwo != Choice.None) 
        {  
            finish(gameId, playerTwo, playerOne, choiceTwo, staked.add(staked));     
        }
        else if(choiceOne == Choice.None && choiceTwo == Choice.None)
        {
            if(games[gameId].gameMoves[playerTwo].commit == NULL_BYTES)  //SSLOAD
            {                 
                finish(gameId, playerOne, playerTwo, choiceOne, staked);
            }
            else { 
                finishTiedGame(gameId, playerOne, playerTwo, Choice.None, staked);
            }
        }
        else {         
            assert(false);
        }

        eraseGame(gameId, playerOne, playerTwo);
    }
    
    /* @dev deletes the game (game struct  and nested inner gameMoves structs)
     */
    function eraseGame(uint gameId, address address1, address address2) private {
        delete games[gameId].gameMoves[address1];
        delete games[gameId].gameMoves[address2];
        delete games[gameId];
    }

    function getGameMove(uint gameId, address player) public view returns (bytes32 _commit, Choice choice) {
        return (games[gameId].gameMoves[player].commit, games[gameId].gameMoves[player].choice);
    }

    /* @dev resolves outocome of game move from the given pair of choices
        Rock = 1, Paper = 2, Siccsors = 3
        result = (senderChoice + 3 - counterPartyChoice) % 3
        result = 0 => game tied
        result = 1 => player one wins, 
        result = 2 => player two wins  */
    function solve(Choice senderChoice, Choice counterPartyChoice) internal pure returns (bool gameOver, bool senderIsWinner) {        
        uint _result =  SafeMath.mod(uint(senderChoice).add(3).sub(uint(counterPartyChoice)), 3) ;
        return (_result != 0, _result == 1);
    }

    function payout() public {
        uint balance = winnings[msg.sender]; //SLOAD
        require(balance > 0, "RockPaperScissors::payout:There are no funds to payout");
        
        emit LogWinningsBalanceChanged(msg.sender, balance, 0);
        winnings[msg.sender] = 0; //SSTORE 
        
        LogPayout(msg.sender, balance);
        (bool success, ) = (msg.sender).call{value: balance}("");        
        require(success, "payout failed");
    }
}