// SPDX-License-Identifier: MIT
pragma solidity 0.7.0;

import "./SafeMath.sol";
import "./Ownable.sol";

contract RockPaperScissors is Ownable {
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
    uint constant public MIN_STAKE = 1000000000000000; //10e15 or 0.001 ETH
    bytes32 constant public NULL_BYTES = bytes32(0);

    event LogGameCreated(uint indexed gameId, address indexed playerOne, address indexed playerTwo, bytes32 maskedChoice, uint deadline, bool stakedFromWinnings, uint staked);
    event LogGameEnrolled(uint indexed gameId, address indexed commiter, bytes32 maskedChoice, bool stakedFromWinnings, uint sent);    
    event LogChoiceCommited(uint indexed gameId, address indexed commiter, bytes32 maskedChoice);    
    event LogChoiceRevealed(uint indexed gameId, address indexed revealer, Choice choice);    
    event LogGameFinished(uint indexed gameId, address indexed winner, address indexed loser, Choice winnerChoice, address resolver, uint pay, uint finishTimeStamp);
    event LogGameTied(uint indexed gameId, address indexed resolver, Choice choice, uint timeStamp);
    event LogWinningsBalanceChanged(address indexed player, uint oldBalance, uint newBalance);
    event LogPayout(address indexed payee, uint pay);

    constructor (){}

    function generateMaskedChoice (Choice choice, bytes32 mask, address masker, uint maskTimestamp) public view returns (bytes32 maskedChoice) {
        require(choice != Choice.None, "RockPaperScissors::generateMaskedChoice:Invalid Choice");
        require(mask != NULL_BYTES, "RockPaperScissors::generateMaskedChoice:mask can not be empty");
        require((block.timestamp).sub(MAX_GAME_LIFETIME.mul(2)) < maskTimestamp, "RockPaperScissors::generateMaskedChoice:Invalid blockTimestamp");
        
        return keccak256(abi.encodePacked(choice, mask, masker, maskTimestamp, address(this)));
    }

    function addressXor(address first, address second) public pure returns(address){
        return address(uint(first) ^ uint(second));
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
                
        Game storage game = games[nextGameId += 1];//SSTORE, SLOAD

        game.stake = amountToStake; //SSTORE
        game.playerOne = msg.sender; //SSTORE        
        game.playersKey = addressXor(msg.sender, otherPlayer); //SSTORE
        game.gameMoves[msg.sender].commit =  maskedChoice; //SSTORE

        uint _gameDeadline =  gameLifetime.add(block.timestamp);        
        game.deadline = _gameDeadline; //SSTORE               
        
        emit LogGameCreated(nextGameId, msg.sender, otherPlayer, maskedChoice, _gameDeadline, winningsBalance != _newWinningsBalance, amountToStake);
    }
    
    function enrolAndCommit(uint gameId, bytes32 maskedChoice) public payable {        
        uint _deadline = games[gameId].deadline; //SLOAD
        require(block.timestamp <= _deadline, "RockPaperScissors::enrolAndCommit:game has expired (or does not exist)"); //SLOAD
        require(maskedChoice != NULL_BYTES, "RockPaperScissors::enrolAndCommit:Invalid maskedChoice value");        
        require(games[gameId].playersKey == addressXor(games[gameId].playerOne, msg.sender), "RockPaperScissors::enrolAndCommit:Invalid player"); //SLOAD, SLOAD
        require(games[gameId].gameMoves[msg.sender].commit == NULL_BYTES , "RockPaperScissors::enrolAndCommit:player is already enrolled"); //SLOAD
        
        uint winningsBalance = winnings[msg.sender]; //SLOAD
        uint _newWinningsBalance = winningsBalance.add(msg.value).sub(games[gameId].stake, "RockPaperScissors::enrolAndCommit:Insuffcient balance to stake"); //SLOAD         
        
        if(winningsBalance != _newWinningsBalance) { 
            winnings[msg.sender] = _newWinningsBalance; //SSTORE
            emit LogWinningsBalanceChanged(msg.sender, winningsBalance, _newWinningsBalance);
        } 
                
        games[gameId].gameMoves[msg.sender].commit = maskedChoice; //SSTORE

        if(_deadline < block.timestamp.add(POST_COMMIT_WAIT_WINDOW)) {
            games[gameId].deadline += POST_COMMIT_WAIT_WINDOW; //SSTORE
        }

        emit LogGameEnrolled(gameId, msg.sender, maskedChoice, winningsBalance != _newWinningsBalance, msg.value);
    }

    function reveal(uint gameId, Choice choice, bytes32 mask,  uint maskingTimestamp) public { 
        require(block.timestamp <= games[gameId].deadline, "RockPaperScissors::reveal:game has expired");   //SSLOAD
        require(games[gameId].gameMoves[msg.sender].commit == generateMaskedChoice(choice, mask, msg.sender, maskingTimestamp), "RockPaperScissors::reveal:Invalid mask and choice");  //SLOAD        
        address _counterParty = addressXor(msg.sender, games[gameId].playersKey); //SLOAD
        bytes32 counterPartyCommit = games[gameId].gameMoves[_counterParty].commit; //SLOAD        
        
        require(counterPartyCommit != NULL_BYTES, "RockPaperScissors::reveal:Other Player has not commited yet");
        Choice counterPartyChoice = games[gameId].gameMoves[_counterParty].choice; //SSLOAD
        
        if(counterPartyChoice == Choice.None){                
            games[gameId].gameMoves[msg.sender].choice = choice; //SSTORE
            emit LogChoiceRevealed(gameId, msg.sender, choice);
        }
        else {
            uint owed = games[gameId].stake; //SLOAD
            
            uint result = solve(choice, counterPartyChoice);

            if(result == 1){
                finish(gameId, msg.sender, _counterParty, choice, owed.add(owed));
            }else if (result == 2){
                finish(gameId, _counterParty, msg.sender, counterPartyChoice, owed.add(owed));
            }else{
                finishTiedGame(gameId, msg.sender, _counterParty, choice, owed);
            }
        }        
    }

    function finishTiedGame(uint gameId, address sender, address counterParty, Choice choice, uint pay) internal {
        if(pay != 0){
            uint senderBalance = winnings[sender]; //SLOAD
            winnings[sender] = senderBalance.add(pay); //SSTORE
            emit LogWinningsBalanceChanged(sender, senderBalance, senderBalance.add(pay));

            uint counterPartyBalance = winnings[counterParty]; //SLOAD
            winnings[counterParty] = counterPartyBalance.add(pay); //SSTORE
            emit LogWinningsBalanceChanged(counterParty, counterPartyBalance, counterPartyBalance.add(pay));        
        }

        eraseGame(gameId, sender, counterParty);
        emit LogGameTied(gameId, msg.sender, choice, block.timestamp);        
    }

    function finish(uint gameId, address winner, address loser, Choice winningChoice, uint pay) internal {        
        if(pay != 0) {
            uint balance = winnings[winner]; //SLOAD            
            winnings[winner] = balance.add(pay); //SSTORE
            emit LogWinningsBalanceChanged(winner, balance, balance.add(pay));
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
        address playerTwo = addressXor(playerOne, games[gameId].playersKey ); //SLOAD
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
        result = 1 => sender wins, 
        result = 2 => counterParty wins  */
    function solve(Choice senderChoice, Choice counterPartyChoice) internal pure returns (uint) {        
       return SafeMath.mod(uint(senderChoice).add(3).sub(uint(counterPartyChoice)), 3) ;
    }

    function payout() public {
        uint balance = winnings[msg.sender]; //SLOAD
        require(balance > 0, "RockPaperScissors::payout:There are no funds to payout");
                
        winnings[msg.sender] = 0; //SSTORE 
        emit LogWinningsBalanceChanged(msg.sender, balance, 0);
                
        (bool success, ) = (msg.sender).call{value: balance}("");        
        require(success, "payout failed");
        LogPayout(msg.sender, balance);
    }
}