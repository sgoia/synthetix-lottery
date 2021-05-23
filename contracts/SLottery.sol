// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@chainlink/contracts/src/v0.8/dev/VRFConsumerBase.sol";

contract SLottery is ERC721, VRFConsumerBase, Ownable {
    using Counters for Counters.Counter;
    using SafeMath for uint256;

    //sUSD token
    IERC20 sUSD;

    // Track ticket/token id ranges for current and previous lottery
    uint256 public tokenIdFloor;
    uint256 public prevTokenIdFloor;

    // keep track of latest ticket/token id purchased
    uint256 public lastTokenId;

    // Counter for token ids as ticket NFTs
    Counters.Counter private tokenIds;

    // Counter for lottery ids - used for the winners
    Counters.Counter private lotteryIds;

    // lottery ticket price in sUSD
    uint256 public tokenPrice = (1 * 10**18);

    // Lottery running time duration before expire and prize announced
    uint256 public duration = 6 hours;

    // Used to identify the oracle
    bytes32 internal keyHash;

    // Used for requesting the random number from the oracle
    uint256 internal oracleFee;

    // keep track of each lottery total funds
    mapping(uint256 => uint256) public lotteryIdFunds;

    // keep track of a certain lottery's expiry date
    mapping(uint256 => uint256) public lotteryIdExpiry;

    // check if for a given lottery a token id has won a prize
    mapping(uint256 => mapping(uint256 => bool)) public lotteryId1stPlaceAward;
    mapping(uint256 => mapping(uint256 => bool)) public lotteryId2ndPlaceAward;
    mapping(uint256 => mapping(uint256 => bool)) public lotteryId3rdPlaceAward;

    // keep track of each lottery and token id prizes
    mapping(uint256 => uint256) public tokenId1stPlaceAward;
    mapping(uint256 => uint256) public tokenId2ndPlaceAward;
    mapping(uint256 => uint256) public tokenId3rdPlaceAward;

    // keep a reference for total tickets count for each lottery draw
    mapping(uint256 => uint256) public lotteryIdTokensCount;

    mapping(bytes32 => uint256) public requestIdLottery;

    // prizes percentages distribution as x%, no decimals
    uint8[3] public prizePercentArr = [50, 35, 15];

    /**
     * @dev Event emitted when a `requestId` was created by the `sender`
     */
    event VRFRequested(
        uint256 lotteryId,
        bytes32 indexed requestId,
        address indexed sender
    );

    /**
     * @dev Event emitted when `firstPlaceTokenId`, `secondPlaceTokenId`, `thirdPlaceTokenId` are awarded for a `lotteryId`.
     */
    event WinnersAnnounced(
        uint256 lotteryId,
        uint256 firstPlaceTokenId,
        uint256 secondPlaceTokenId,
        uint256 thirdPlaceTokenId
    );

    // enum defining the three PrizeClaimed event types
    enum EventType {First, Second, Third}

    /**
     * @dev Event emitted when `tokenId` has claimed its reward for a `lotteryId`.
     */
    event PrizeClaimed(uint256 lotteryId, EventType eventType, uint256 tokenId);

    /**
     * @dev Initialize contract by setting a `_sUSDAddress` for sUSD, a `_VRFCoordinator`
     * as a Chainlink's smart contract to get a true random number, a `_LinkToken` that is used
     * to pay the oracle and a `_keyHash` to identify the proper oracle. A `name` and a `symbol`d for the
     * contract are needed as we inherit from the ERC721 contract. We also set the `oracleFee` to 0.1 LINK and we
     * initialize the first lottery as soon as the contract is deployed
     */
    constructor(
        address _sUSDAddress,
        address _vrfCoordinator,
        address _linkToken,
        bytes32 _keyHash
    )
        VRFConsumerBase(_vrfCoordinator, _linkToken)
        ERC721("dSynthLottery", "SLX")
    {
        sUSD = IERC20(_sUSDAddress);
        keyHash = _keyHash;
        oracleFee = 0.1 * 10**18;
        lotteryIdExpiry[lotteryIds.current()] = block.timestamp.add(duration);
    }

    /**
     * @dev buy tokens/tickets for a `recipient` and transfers final cost `sUSDAmount` from sender's balance to the smart contract
     *
     * Emits a {Transfer} event from the ERC721 smart contract.
     */
    function buyTickets(address recipient, uint256 tokens)
        external
        returns (uint256 tokenIdStart, uint256 tokenIdEnd)
    {
        require(tokens >= 1, "Minimum 1 ticket to buy required");
        uint256 sUSDAmount = tokenPrice * tokens;
        require(
            sUSD.allowance(msg.sender, address(this)) >= sUSDAmount,
            "Approve contract to spend funds for ticket cost"
        );
        require(
            sUSD.balanceOf(msg.sender) >= sUSDAmount,
            "Not enough funds for ticket cost"
        );

        //the sUSDAmount will go to specific lottery pool
        lotteryIdFunds[lotteryIds.current()] = lotteryIdFunds[
            lotteryIds.current()
        ]
            .add(sUSDAmount);

        tokenIdStart = tokenIds.current().add(1);

        // we start ticketId from 1, leaving ticketId zero with no use
        // Mint tickets
        uint256 i;
        for (i = 0; i < tokens; i++) {
            tokenIds.increment();
            _safeMint(recipient, tokenIds.current());
        }
        // save latest ticket id purchsed
        lastTokenId = tokenIds.current();
        tokenIdEnd = tokenIds.current();

        //transfer sUSDAmount to the lottery smart contract
        sUSD.transferFrom(msg.sender, address(this), sUSDAmount);
    }

    /**
     * @dev anounce the winners by requesting a random number from Chainlink oracle using a seed
     *
     * Requirements:
     *
     * - current lottery should have expired
     * - the smart contract should have enough balance to cover the fee
     *
     */
    function announceWinners(uint256 userProvidedSeed)
        external
        returns (bytes32)
    {
        // make sure there are at least 3 participants
        uint256 tokensCount = getCurrentLotteryTokensCount();
        require(tokensCount >= 3, "minimum tokens sold required");

        require(
            lotteryIdExpiry[lotteryIds.current()] < block.timestamp,
            "Lottery is still running!"
        );

        bytes32 requestId = getRandomNumber(userProvidedSeed);
        requestIdLottery[requestId] = lotteryIds.current();

        emit VRFRequested(requestIdLottery[requestId], requestId, msg.sender);

        return requestId;
    }

    /**
     * Requests randomness from a user-provided seed
     */
    function getRandomNumber(uint256 userProvidedSeed)
        internal
        returns (bytes32 requestId)
    {
        require(
            LINK.balanceOf(address(this)) >= oracleFee,
            "Not enough LINK balance"
        );
        return requestRandomness(keyHash, oracleFee, userProvidedSeed);
    }

    /**
     * @dev Callback function used by the VRFCoordinator. Determines the winners by taking the random value from the VRF response
     * and expanding it to 3 random values for the top 3 places. Afterwards a new lottery starts automatically.
     *
     * Emits a {WinnersAnnounced} event
     */
    function fulfillRandomness(bytes32 requestId, uint256 randomness)
        internal
        override
    {
        uint256 currentLotteryId = requestIdLottery[requestId];
        uint256 randWinner0 = uint256(keccak256(abi.encode(randomness, 0)));
        uint256 randWinner1 = uint256(keccak256(abi.encode(randomness, 1)));
        uint256 randWinner2 = uint256(keccak256(abi.encode(randomness, 2)));

        uint256 currentLotteryTokens = getCurrentLotteryTokensCount();
        require(currentLotteryTokens >= 3, "minimum tickets sold required");

        // save number of tokens/tickets for current lottery
        lotteryIdTokensCount[currentLotteryId] = currentLotteryTokens;

        // select range of tickets for current lottery
        uint256 tokenStart = tokenIdFloor.add(1);

        // award prizes to winners
        // exclude tickets already announced in other prizes
        // a ticket can not be awarded more than one prize
        uint256 firstPlaceTokenId =
            randWinner0.mod(currentLotteryTokens).add(tokenStart);
        // exclude 1st place ticket from draw, decrement number of tokens
        uint256 secondPlaceTokenId =
            randWinner1.mod(currentLotteryTokens.sub(1)).add(tokenStart);
        if (secondPlaceTokenId >= firstPlaceTokenId)
            secondPlaceTokenId = secondPlaceTokenId.add(1);
        // exclude 1st and 2nd places ticket from draw, decrement number of tokens
        uint256 thirdPlaceTokenId =
            randWinner2.mod(currentLotteryTokens.sub(2)).add(tokenStart);
        if (thirdPlaceTokenId >= firstPlaceTokenId)
            thirdPlaceTokenId = thirdPlaceTokenId.add(1);
        if (thirdPlaceTokenId >= secondPlaceTokenId)
            thirdPlaceTokenId = thirdPlaceTokenId.add(1);

        // store if token prize was claimed
        lotteryId1stPlaceAward[currentLotteryId][firstPlaceTokenId] = true;
        lotteryId2ndPlaceAward[currentLotteryId][secondPlaceTokenId] = true;
        lotteryId3rdPlaceAward[currentLotteryId][thirdPlaceTokenId] = true;

        // store all prizes token ids for each lottery id
        tokenId1stPlaceAward[currentLotteryId] = firstPlaceTokenId;
        tokenId2ndPlaceAward[currentLotteryId] = secondPlaceTokenId;
        tokenId3rdPlaceAward[currentLotteryId] = thirdPlaceTokenId;

        emit WinnersAnnounced(
            currentLotteryId,
            firstPlaceTokenId,
            secondPlaceTokenId,
            thirdPlaceTokenId
        );

        // once the event is emitted, start the next lottery
        lotteryIds.increment();
        lotteryIdExpiry[lotteryIds.current()] = block.timestamp.add(duration);

        // keep track of each lottery tickets/token ids range
        prevTokenIdFloor = tokenIdFloor;
        tokenIdFloor = lastTokenId;
    }

    /**
     * @dev claim the first place prize reward if the token is winner
     *
     * Requirements:
     *
     * - `tokenId` must be the 1st place winner for `lotteryId`
     * - only the owner of the `tokenId` can claim the prize
     *
     * Emits a {PrizeClaimed} event
     */
    function claim1stPlacePrize(uint256 tokenId, uint256 lotteryId)
        public
        returns (bool)
    {
        // tokenId has not won the first place or was already claimed
        require(
            lotteryId1stPlaceAward[lotteryId][tokenId],
            "ticket not awarded or prize already claimed"
        );
        require(
            msg.sender == ownerOf(tokenId),
            "ticket owner required to claim prize"
        );

        uint256 prizePercent = prizePercentArr[0];
        uint256 lotteryBalance = lotteryIdFunds[lotteryId];
        uint256 amountToBeClaimed = lotteryBalance.mul(prizePercent).div(100);
        lotteryId1stPlaceAward[lotteryId][tokenId] = false;

        sUSD.transfer(msg.sender, amountToBeClaimed);

        emit PrizeClaimed(lotteryId, EventType.First, tokenId);
        return true;
    }

    /**
     * @dev claim the second place prize reward if the token is winner
     *
     * Requirements:
     *
     * - `tokenId` must be the 2nd place winner for `lotteryId`
     * - only the owner of the `tokenId` can claim the prize
     *
     * Emits a {PrizeClaimed} event
     */
    function claim2ndPlacePrize(uint256 tokenId, uint256 lotteryId)
        public
        returns (bool)
    {
        // tokenId has not won the second place or was already claimed
        require(
            lotteryId2ndPlaceAward[lotteryId][tokenId],
            "ticket not awarded or prize already claimed"
        );
        require(
            msg.sender == ownerOf(tokenId),
            "ticket owner required to claim prize"
        );

        uint256 prizePercent = prizePercentArr[1];
        uint256 lotteryBalance = lotteryIdFunds[lotteryId];
        uint256 amountToBeClaimed = lotteryBalance.mul(prizePercent).div(100);
        lotteryId2ndPlaceAward[lotteryId][tokenId] = false;

        sUSD.transfer(msg.sender, amountToBeClaimed);

        emit PrizeClaimed(lotteryId, EventType.Second, tokenId);
        return true;
    }

    /**
     * @dev claim the third place prize reward if the token is winner
     *
     * Requirements:
     *
     * - `tokenId` must be the 3rd place winner for `lotteryId`
     * - only the owner of the `tokenId` can claim the prize
     *
     * Emits a {PrizeClaimed} event
     */
    function claim3rdPlacePrize(uint256 tokenId, uint256 lotteryId)
        public
        returns (bool)
    {
        // tokenId has not won the third place or was already claimed
        require(
            lotteryId3rdPlaceAward[lotteryId][tokenId],
            "ticket not awarded or prize already claimed"
        );
        require(
            msg.sender == ownerOf(tokenId),
            "ticket owner required to claim prize"
        );

        uint256 prizePercent = prizePercentArr[2];
        uint256 lotteryBalance = lotteryIdFunds[lotteryId];
        uint256 amountToBeClaimed = lotteryBalance.mul(prizePercent).div(100);
        lotteryId3rdPlaceAward[lotteryId][tokenId] = false;

        sUSD.transfer(msg.sender, amountToBeClaimed);

        emit PrizeClaimed(lotteryId, EventType.Third, tokenId);
        return true;
    }

    /**
     * @dev Return the current lottery tickets/tokens count
     *
     */
    function getCurrentLotteryTokensCount() public view returns (uint256) {
        return lastTokenId - tokenIdFloor;
    }

    /**
     * @dev Return the current token/ticket id
     *
     */
    function getTicketId() public view returns (uint256) {
        return tokenIds.current();
    }

    /**
     * @dev Return the current lottery id
     *
     */
    function getLotteryId() public view returns (uint256) {
        return lotteryIds.current();
    }
}
