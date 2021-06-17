const { expect } = require("chai");
const { expectRevert } = require("@openzeppelin/test-helpers");
const { tokensToWei } = require("../utils/token");
const SLottery = artifacts.require("SLottery");
const sUSDMock = artifacts.require("sUSDMock");
const VRFCoordinatorMock = artifacts.require("VRFCoordinatorMock");
const { LinkToken } = require("@chainlink/contracts/truffle/v0.4/LinkToken");
const helper = require("ganache-time-traveler");
const SECONDS_IN_DAY = 86400;

contract("SLottery", ([owner, user1, user2, user3, user4, user5]) => {
  let lottery, vrfCoordinatorMock, seed, link, keyhash, fee, sUSD;
  let ticketId1stPrize = 0;
  let ticketId2ndPrize = 0;
  let ticketId3rdPrize = 0;
  let ticketId1stPrizeOwner;
  let ticketId2ndPrizeOwner;
  let ticketId3rdPrizeOwner;
  let t1stPrizeOwnerBalanceBeforeClaim;
  let t1stPrizeOwnerBalanceAfterClaim;
  let t2ndPrizeOwnerBalanceBeforeClaim;
  let t2ndPrizeOwnerBalanceAfterClaim;
  let t3rdPrizeOwnerBalanceBeforeClaim;
  let t3rdPrizeOwnerBalanceAfterClaim;
  console.log("---Owner: ", owner);

  before(async () => {
    keyhash =
      "0x6c3699283bda56ad74f6b855546325b68d482e983852a7a82979cc4807b641f4";
    fee = "1000000000000000000"; //10**18
    seed = 1234;
    sUSD = await sUSDMock.new({ from: owner });
    link = await LinkToken.new({ from: owner });
    console.log("---link address: ", link.address);
    vrfCoordinatorMock = await VRFCoordinatorMock.new(link.address, {
      from: owner,
    });
    lottery = await SLottery.new(
      sUSD.address,
      vrfCoordinatorMock.address,
      link.address,
      keyhash,
      { from: owner }
    );

    //transfer some sUSD to the users/participants
    console.log("---transfer some sUSD to lottery users...");
    sUSD.transfer(user1, tokensToWei("100"), { from: owner });
    sUSD.transfer(user2, tokensToWei("100"), { from: owner });
    sUSD.transfer(user3, tokensToWei("100"), { from: owner });
    sUSD.transfer(user4, tokensToWei("100"), { from: owner });
    sUSD.transfer(user5, tokensToWei("100"), { from: owner });
  });

  describe("Deployment success", () => {
    it("Deploys lottery contract successfully", async () => {
      expect(lottery.address).to.not.equal(null);
      expect(lottery.address).to.not.equal(undefined);
      expect(lottery.address).to.not.equal("");
      expect(lottery.address).to.not.equal(0x0);
    });

    it("The lottery contract should have correct name and symbol", async () => {
      const name = await lottery.name();
      expect(name).to.equal("dSynthLottery");
      const symbol = await lottery.symbol();
      expect(symbol).to.equal("SLX");
    });

    it("The lottery contract should have correct lotteryIds", async () => {
      const lotteryId = await lottery.getLotteryId();
      expect(lotteryId.toString()).to.equal("0");
    });
  });

  describe("Buy a ticket", () => {
    it("Reverts if we try to buy less than 1 ticket", async () => {
      await expectRevert.unspecified(
        lottery.buyTickets(user1, 0, { from: user1 })
      );
    });

    it("Lottery contract should have no sUSD balance", async () => {
      const lotteryBalance = await sUSD.balanceOf(lottery.address);
      assert.equal(lotteryBalance, 0, "Lottery balance should be 0");
    });

    it("Lottery pool for the first lottery has no sUSD balance", async () => {
      const lotteryId = await lottery.getLotteryId();
      const lotteryPoolBalance = await lottery.lotteryIdFunds(lotteryId);
      assert.equal(lotteryPoolBalance, 0, "Lottery pool balance should be 0");
    });

    it("The first participant should have a balance of 100 sUSD", async () => {
      const user1Balance = await sUSD.balanceOf(user1);
      assert.equal(
        user1Balance.toString(),
        tokensToWei("100"),
        "participant one balance should be 100"
      );
    });

    it("Call buyTickets for buy test 1 ticket without actually buying any tickets", async () => {
      await sUSD.approve(lottery.address, tokensToWei("1"), {
        from: user1,
      });
      let retArr = await lottery.buyTickets.call(user1, 1, {
        from: user1,
      });
      let newTokenIdFrom = retArr[0];
      let newTokenIdTo = retArr[1];
      assert.equal(newTokenIdFrom, 1, "Should be the tokenId start index");
      assert.equal(newTokenIdTo, 1, "Should be the tokenId end index");
    });

    it("Call buyTickets for buy test 3 tickets without actually buying any tickets", async () => {
      await sUSD.approve(lottery.address, tokensToWei("3"), {
        from: user1,
      });
      let retArr = await lottery.buyTickets.call(user1, 3, {
        from: user1,
      });
      let newTokenIdFrom = retArr[0];
      let newTokenIdTo = retArr[1];
      assert.equal(newTokenIdFrom, 1, "Should be the tokenId start index");
      assert.equal(newTokenIdTo, 3, "Should be the tokenId end index");
    });

    it("Buy a lottery ticket", async () => {
      await sUSD.approve(lottery.address, tokensToWei("1"), {
        from: user1,
      });
      const result = await lottery.buyTickets(user1, 1, {
        from: user1,
      });
      assert.equal(result.logs.length, 1, "Should trigger one event");
      assert.equal(
        result.logs[0].event,
        "Transfer",
        "Should be the 'Transfer' event"
      );
      assert.equal(result.logs[0].args.from, 0x0, "Should be the 0x0 address.");
      assert.equal(
        result.logs[0].args.to,
        user1,
        "should log user1 as token owner"
      );
      assert.equal(
        result.logs[0].args.tokenId,
        1,
        "should log token id in this case is 1"
      );
    });

    it("Lottery should have 1 sUSD balance", async () => {
      const lotteryBalance = await sUSD.balanceOf(lottery.address);
      assert.equal(
        lotteryBalance,
        tokensToWei("1"),
        "lottery balance should be 1 sUSD"
      );
    });

    it("Lottery pool for the first lottery has 1 sUSD", async () => {
      const lotteryId = await lottery.getLotteryId();
      const lotteryPoolBalance = await lottery.lotteryIdFunds(lotteryId);
      assert.equal(
        lotteryPoolBalance.toString(),
        tokensToWei("1"),
        "Lottery pool balance should be 1 sUSD"
      );
    });

    it("The first participant should have 99 sUSD remaining balance", async () => {
      const user1Balance = await sUSD.balanceOf(user1);
      assert.equal(
        user1Balance.toString(),
        tokensToWei("99"),
        "user1 balance should be 99 sUSD"
      );
    });
  });

  describe("Announce Winners", () => {
    before(async () => {});

    it("reverts on announce winners if number of tickets sold are below minimum", async () => {
      try {
        await lottery.announceWinners(seed, { from: user1 });
        assert.fail();
      } catch (err) {
        console.log("lottery.announceWinners: " + err.message);
        assert(
          err.message.indexOf("minimum tokens sold required") >= 0,
          "lottery.announceWinners should fail with expected error"
        );
      }
    });

    it("several users buy tickets for current lottery", async () => {
      //buy tickets
      await sUSD.approve(lottery.address, tokensToWei("1"), {
        //4
        from: user2,
      });
      await sUSD.approve(lottery.address, tokensToWei("3"), {
        from: user3,
      });
      await sUSD.approve(lottery.address, tokensToWei("4"), {
        //5
        from: user4,
      });
      await sUSD.approve(lottery.address, tokensToWei("1"), {
        //6
        from: user5,
      });

      await lottery.buyTickets(user2, 1, { from: user2 });
      await lottery.buyTickets(user3, 3, { from: user3 });
      await lottery.buyTickets(user4, 4, { from: user4 });
      await lottery.buyTickets(user5, 1, { from: user5 });
    });

    it("Current lottery should have correct number of tickets sold", async () => {
      let tickets = await lottery.getCurrentLotteryTokensCount();
      assert.equal(tickets, 10, "Should have correct number of tickets sold");
    });

    // anyone can announce winners
    //it("Reverts if user is not owner", async () => {
    //  await expectRevert.unspecified(
    //    lottery.announceWinners(seed, { from: user4 })
    //  );
    //});

    it("Reverts without LINK", async () => {
      await expectRevert.unspecified(
        //lottery.announceWinners(seed, { from: owner })
        lottery.announceWinners(seed, { from: user1 })
      );
    });

    it("Reverts if lottery is still running", async () => {
      await link.transfer(lottery.address, tokensToWei("1"), {
        from: owner,
      });
      await expectRevert.unspecified(
        //lottery.announceWinners(seed, { from: owner })
        lottery.announceWinners(seed, { from: user1 })
      );
    });

    it("---> should fast forward EVM time to reach announcement date", async () => {
      try {
        await helper.advanceTimeAndBlock(SECONDS_IN_DAY * 3); //advance 3 days
      } catch (err) {
        console.log("***helper.advanceTimeAndBlock: " + err.message);
      }
    });

    it("announce winners success: Requests and returns a random number using link", async () => {
      const lotteryId = await lottery.getLotteryId();

      await link.transfer(lottery.address, tokensToWei("1"), {
        from: owner,
      });
      console.log("---helper.advanceTimeAndBlock.bp0");

      const requestId = await lottery.announceWinners.call(seed, {
        from: user1,
      });

      const tx = await lottery.announceWinners(seed, { from: user1 });
      assert.equal(tx.logs.length, 1, "Should trigger one event");
      assert.equal(
        tx.logs[0].event,
        "VRFRequested",
        "Should be the 'VRFRequested' event"
      );
      assert.equal(
        tx.logs[0].args.lotteryId,
        lotteryId.toString(),
        "Should be the lottery id 0"
      );
      assert.equal(
        tx.logs[0].args.requestId,
        requestId,
        `Should be the request id: ${requestId}`
      );
      assert.equal(
        tx.logs[0].args.sender,
        user1,
        "Should be the function sender"
      );

      await vrfCoordinatorMock.callBackWithRandomness(
        requestId,
        "7", //"2",
        lottery.address,
        { from: user1 }
      );

      const random1stPlace = await lottery.lotteryId1stPlaceAward(
        lotteryId.toString(),
        "2",
        { from: user1 }
      );
      assert.equal(random1stPlace, true);

      const random2ndPlace = await lottery.lotteryId2ndPlaceAward(
        lotteryId.toString(),
        "10",
        { from: user1 }
      );
      assert.equal(random2ndPlace, true);

      const random3rdPlace = await lottery.lotteryId3rdPlaceAward(
        lotteryId.toString(),
        "7",
        { from: user1 }
      );
      assert.equal(random3rdPlace, true);
    });

    it("announce winners success: all 3 prizes must be awarded to participants", async () => {
      const lotteryId = 0; // prev closed lottery

      ticketId1stPrize = await lottery.tokenId1stPlaceAward.call(lotteryId);
      console.log("---ticketId1stPrize: ", ticketId1stPrize.toString());

      ticketId2ndPrize = await lottery.tokenId2ndPlaceAward.call(lotteryId);
      console.log("---ticketId2ndPrize: ", ticketId2ndPrize.toString());

      ticketId3rdPrize = await lottery.tokenId3rdPlaceAward.call(lotteryId);
      console.log("---ticketId3rdPrize: ", ticketId3rdPrize.toString());

      ticketId1stPrizeOwner = await lottery.ownerOf(ticketId1stPrize);
      console.log("---ticketId1stPrize owner: ", ticketId1stPrizeOwner);
      assert.equal(
        ticketId1stPrize >= 1,
        true,
        "One of the tickets must have been awarded 1st prize"
      );

      ticketId2ndPrizeOwner = await lottery.ownerOf(ticketId2ndPrize);
      console.log("---ticketId2ndPrize owner: ", ticketId2ndPrizeOwner);
      assert.equal(
        ticketId2ndPrize >= 1,
        true,
        "One of the tickets must have been awarded 2nd prize"
      );

      ticketId3rdPrizeOwner = await lottery.ownerOf(ticketId3rdPrize);
      console.log("---ticketId3rdPrize owner: ", ticketId3rdPrizeOwner);
      assert.equal(
        ticketId3rdPrize >= 1,
        true,
        "One of the tickets must have been awarded 3rd prize"
      );

      // we know we have 15 tickets from Ids 1 to 15
      /*let t1 = await lottery.lotteryId1stPlaceAward(lotteryId, 1);
      let t2 = await lottery.lotteryId1stPlaceAward(lotteryId, 2);
      let t3 = await lottery.lotteryId1stPlaceAward(lotteryId, 3);
      let t4 = await lottery.lotteryId1stPlaceAward(lotteryId, 4);
      let t5 = await lottery.lotteryId1stPlaceAward(lotteryId, 5);
      let t6 = await lottery.lotteryId1stPlaceAward(lotteryId, 6);
      let t7 = await lottery.lotteryId1stPlaceAward(lotteryId, 7);
      let t8 = await lottery.lotteryId1stPlaceAward(lotteryId, 8);
      let t9 = await lottery.lotteryId1stPlaceAward(lotteryId, 9);
      let t10 = await lottery.lotteryId1stPlaceAward(lotteryId, 10);
      let oneHasWon1stPrize =
        t1 || t2 || t3 || t4 || t5 || t6 || t7 || t8 || t9 || t10;
      assert.equal(
        oneHasWon1stPrize,
        true,
        "One of the tickets must have been awarded 1st prize"
      );
      
      t1 = await lottery.lotteryId2ndPlaceAward(lotteryId, 1);
      t2 = await lottery.lotteryId2ndPlaceAward(lotteryId, 2);
      t3 = await lottery.lotteryId2ndPlaceAward(lotteryId, 3);
      t4 = await lottery.lotteryId2ndPlaceAward(lotteryId, 4);
      t5 = await lottery.lotteryId2ndPlaceAward(lotteryId, 5);
      t6 = await lottery.lotteryId2ndPlaceAward(lotteryId, 6);
      t7 = await lottery.lotteryId2ndPlaceAward(lotteryId, 7);
      t8 = await lottery.lotteryId2ndPlaceAward(lotteryId, 8);
      t9 = await lottery.lotteryId2ndPlaceAward(lotteryId, 9);
      t10 = await lottery.lotteryId2ndPlaceAward(lotteryId, 10);
      oneHasWon2ndPrize =
        t1 || t2 || t3 || t4 || t5 || t6 || t7 || t8 || t9 || t10;
      assert.equal(
        oneHasWon2ndPrize,
        true,
        "One of the tickets must have been awarded 2nd prize"
      );

      t1 = await lottery.lotteryId3rdPlaceAward(lotteryId, 1);
      t2 = await lottery.lotteryId3rdPlaceAward(lotteryId, 2);
      t3 = await lottery.lotteryId3rdPlaceAward(lotteryId, 3);
      t4 = await lottery.lotteryId3rdPlaceAward(lotteryId, 4);
      t5 = await lottery.lotteryId3rdPlaceAward(lotteryId, 5);
      t6 = await lottery.lotteryId3rdPlaceAward(lotteryId, 6);
      t7 = await lottery.lotteryId3rdPlaceAward(lotteryId, 7);
      t8 = await lottery.lotteryId3rdPlaceAward(lotteryId, 8);
      t9 = await lottery.lotteryId3rdPlaceAward(lotteryId, 9);
      t10 = await lottery.lotteryId3rdPlaceAward(lotteryId, 10);
      oneHasWon3rdPrize =
        t1 || t2 || t3 || t4 || t5 || t6 || t7 || t8 || t9 || t10;
      assert.equal(
        oneHasWon3rdPrize,
        true,
        "One of the tickets must have been awarded 3rd prize"
      );*/
    });

    it("There should be a new lottery after current one expired and winner announced", async () => {
      const lotteryId = await lottery.getLotteryId();
      assert.equal(lotteryId.toString(), "1", "The new lottery id should be 1");
    });
  });

  describe("Claim 1st place prize", () => {
    it("should revert if token id was not awarded 1st place", async () => {
      console.log(
        "---lottery.claim1stPlacePrize.from: ",
        ticketId1stPrizeOwner
      );
      try {
        let wrongPrizeTicketId = ticketId2ndPrize;
        await lottery.claim1stPlacePrize(wrongPrizeTicketId, 0, {
          from: user2,
        });
        assert.fail();
      } catch (err) {
        console.log("lottery.claim1stPlacePrize: " + err.message);
        assert(
          err.message.indexOf("ticket not awarded or prize already claimed") >=
            0,
          "lottery.claim1stPlacePrize should fail with expected error"
        );
      }
    });

    it("should revert if sender is not the owner of the token id", async () => {
      //await expectRevert.unspecified(
      //  lottery.claim1stPlacePrize(ticketId1stPrize, 0, { from: owner })
      //);
      try {
        await lottery.claim1stPlacePrize(ticketId1stPrize, 0, { from: owner });
        assert.fail();
      } catch (err) {
        console.log("lottery.claim1stPlacePrize: " + err.message);
        assert(
          err.message.indexOf("ticket owner required to claim prize") >= 0,
          "lottery.claim1stPlacePrize should fail with expected error"
        );
      }
    });

    it("should revert if token id has won in lottery 0 but claims prize for lottery 1", async () => {
      //await expectRevert.unspecified(
      //  lottery.claim1stPlacePrize(ticketId1stPrize, 1, {
      //    from: ticketId1stPrizeOwner,
      //  })
      //);
      try {
        await lottery.claim1stPlacePrize(ticketId1stPrize, 1, {
          from: ticketId1stPrizeOwner,
        });
        assert.fail();
      } catch (err) {
        console.log("lottery.claim1stPlacePrize: " + err.message);
        assert(
          err.message.indexOf("ticket not awarded or prize already claimed") >=
            0,
          "lottery.claim1stPlacePrize should fail with expected error"
        );
      }
    });

    //it("1st prize winner should have a balance of 95 sUSD", async () => {
    it("1st prize winner sUSD balance snapshot", async () => {
      t1stPrizeOwnerBalanceBeforeClaim = web3.utils.toBN(
        await sUSD.balanceOf(ticketId1stPrizeOwner)
      );
      console.log(
        "---sUSD.balanceOf.t1stPrizeOwnerBalanceBeforeClaim: ",
        ticketId1stPrizeOwner,
        "\n",
        t1stPrizeOwnerBalanceBeforeClaim.toString(),
        " sUSD"
      );
    });

    it("claim 1st place prize", async () => {
      // ticketId1stPrizeOwner is user2
      // ticketId1stPrize is 2
      const tx = await lottery.claim1stPlacePrize(ticketId1stPrize, 0, {
        from: ticketId1stPrizeOwner,
      });
      assert.equal(tx.logs.length, 1, "Should trigger one event");
      assert.equal(
        tx.logs[0].event,
        "PrizeClaimed",
        "Should be the 'PrizeClaimed' event."
      );
      assert.equal(tx.logs[0].args.lotteryId, 0, "Should be the 0 lottery id");
      assert.equal(
        tx.logs[0].args.eventType,
        SLottery.EventType.First.toString(),
        `Should be the First event type`
      );
      assert.equal(
        tx.logs[0].args.tokenId.toString(),
        ticketId1stPrize.toString(), //2,
        `Should be the token id ${ticketId1stPrize}`
      );
      assert.equal(ticketId1stPrize, 2, "Should be the token id 2");
    });

    it("1st prize winner should have correct balance after prize claim", async () => {
      // 1st place prize is 50% of 10 tickets at 1 sUSD each = 5 USD
      // 1st prize winner is user2
      // he bought 1 ticket for 1 sUSD, won 5 sUSD, should have 104 sUSD
      t1stPrizeOwnerBalanceAfterClaim = web3.utils.toBN(
        await sUSD.balanceOf(ticketId1stPrizeOwner)
      );

      let prize = web3.utils.toBN(tokensToWei("5"));
      let expectedNewBalance1 = t1stPrizeOwnerBalanceBeforeClaim.add(prize);
      console.log(
        "---sUSD.balanceOf.t1stPrizeOwnerBalanceAfterClaim: ",
        ticketId1stPrizeOwner,
        "\n",
        t1stPrizeOwnerBalanceAfterClaim.toString(),
        " sUSD"
      );
      assert.equal(
        t1stPrizeOwnerBalanceAfterClaim.toString(),
        expectedNewBalance1.toString(),
        "The balance of 1st prize ticket id owner should match expected value"
      );

      let expectedBalanceAfterClaim = web3.utils.toBN(tokensToWei("104"));
      assert.equal(
        t1stPrizeOwnerBalanceAfterClaim.toString(),
        expectedBalanceAfterClaim.toString(),
        "The balance of 1st prize ticket id owner should match expected value"
      );
    });

    it("should revert if 1st prize winner attempts to claim prize again", async () => {
      //await expectRevert.unspecified(
      //  lottery.claim1stPlacePrize(ticketId1stPrize, 0, {
      //    from: ticketId1stPrizeOwner,
      //  })
      //);
      try {
        await lottery.claim1stPlacePrize(ticketId1stPrize, 0, {
          from: ticketId1stPrizeOwner,
        });
        assert.fail();
      } catch (err) {
        console.log("lottery.claim1stPlacePrize: " + err.message);
        assert(
          err.message.indexOf("ticket not awarded or prize already claimed") >=
            0,
          "lottery.claim1stPlacePrize should fail with expected error"
        );
      }
    });
  });

  describe("Claim 2nd place prize", () => {
    it("should revert if token id was not awarded 2nd place", async () => {
      console.log(
        "---lottery.claim2ndPlacePrize.from: ",
        ticketId2ndPrizeOwner
      );
      try {
        let wrongPrizeTicketId = ticketId3rdPrize;
        await lottery.claim2ndPlacePrize(wrongPrizeTicketId, 0, {
          from: ticketId2ndPrizeOwner,
        });
        assert.fail();
      } catch (err) {
        console.log("lottery.claim2ndPlacePrize: " + err.message);
        assert(
          err.message.indexOf("ticket not awarded or prize already claimed") >=
            0,
          "lottery.claim2ndPlacePrize should fail with expected error"
        );
      }
    });

    it("should revert if sender is not the owner of the token id", async () => {
      //await expectRevert.unspecified(
      //  lottery.claim2ndPlacePrize(ticketId2ndPrize, 0, { from: owner })
      //);
      try {
        await lottery.claim2ndPlacePrize(ticketId2ndPrize, 0, { from: owner });
        assert.fail();
      } catch (err) {
        console.log("lottery.claim2ndPlacePrize: " + err.message);
        assert(
          err.message.indexOf("ticket owner required to claim prize") >= 0,
          "lottery.claim2ndPlacePrize should fail with expected error"
        );
      }
    });

    it("should revert if token id has won in lottery 0 but claims prize for lottery 1", async () => {
      //await expectRevert.unspecified(
      //  lottery.claim2ndPlacePrize(ticketId2ndPrize, 1, {
      //    from: ticketId2ndPrizeOwner,
      //  })
      //);
      try {
        await lottery.claim2ndPlacePrize(ticketId2ndPrize, 1, {
          from: ticketId2ndPrizeOwner,
        });
        assert.fail();
      } catch (err) {
        console.log("lottery.claim2ndPlacePrize: " + err.message);
        assert(
          err.message.indexOf("ticket not awarded or prize already claimed") >=
            0,
          "lottery.claim2ndPlacePrize should fail with expected error"
        );
      }
    });

    it("2nd prize winner sUSD balance snapshot", async () => {
      t2ndPrizeOwnerBalanceBeforeClaim = web3.utils.toBN(
        await sUSD.balanceOf(ticketId2ndPrizeOwner)
      );
      console.log(
        "---sUSD.balanceOf.t2ndPrizeOwnerBalanceBeforeClaim: ",
        ticketId2ndPrizeOwner,
        "\n",
        t2ndPrizeOwnerBalanceBeforeClaim.toString(),
        " sUSD"
      );
    });

    it("claim 2nd place prize", async () => {
      // ticketId2ndPrizeOwner is user5
      // ticketId2ndPrize is 10
      const tx = await lottery.claim2ndPlacePrize(ticketId2ndPrize, 0, {
        from: ticketId2ndPrizeOwner,
      });
      assert.equal(tx.logs.length, 1, "Should trigger one event");
      assert.equal(
        tx.logs[0].event,
        "PrizeClaimed",
        "Should be the 'PrizeClaimed' event."
      );
      assert.equal(tx.logs[0].args.lotteryId, 0, "Should be the 0 lottery id");
      assert.equal(
        tx.logs[0].args.eventType,
        SLottery.EventType.Second.toString(),
        `Should be the Second event type`
      );
      assert.equal(
        tx.logs[0].args.tokenId.toString(),
        ticketId2ndPrize.toString(), //10,
        `Should be the token id ${ticketId2ndPrize}`
      );
      assert.equal(ticketId2ndPrize, 10, "Should be the token id 10");
    });

    it("2nd prize winner should have correct balance after prize claim", async () => {
      // 2nd place prize is 35% of 10 tickets at 1 sUSD each = 3.5 USD
      // 2nd place winner is user5
      // he bought 1 ticket for 1 sUSD, won 3.5 sUSD, should have 102.5 sUSD
      t2ndPrizeOwnerBalanceAfterClaim = web3.utils.toBN(
        await sUSD.balanceOf(ticketId2ndPrizeOwner)
      );

      let prize = web3.utils.toBN(tokensToWei("3.5"));
      let expectedNewBalance = t2ndPrizeOwnerBalanceBeforeClaim.add(prize);
      console.log(
        "---sUSD.balanceOf.t2ndPrizeOwnerBalanceAfterClaim: ",
        ticketId2ndPrizeOwner,
        "\n",
        t2ndPrizeOwnerBalanceAfterClaim.toString(),
        " sUSD"
      );
      assert.equal(
        t2ndPrizeOwnerBalanceAfterClaim.toString(),
        expectedNewBalance.toString(),
        "The balance of 2nd prize ticket id owner should match expected value"
      );

      let expectedBalanceAfterClaim = web3.utils.toBN(tokensToWei("102.5"));
      assert.equal(
        t2ndPrizeOwnerBalanceAfterClaim.toString(),
        expectedBalanceAfterClaim.toString(),
        "The balance of 2nd prize ticket id owner should match expected value"
      );
    });

    it("should revert if 2nd prize winner attempts to claim prize again", async () => {
      //await expectRevert.unspecified(
      //  lottery.claim2ndPlacePrize(ticketId2ndPrize, 0, {
      //    from: ticketId2ndPrizeOwner,
      //  })
      //);
      try {
        await lottery.claim2ndPlacePrize(ticketId2ndPrize, 0, {
          from: ticketId2ndPrizeOwner,
        });
        assert.fail();
      } catch (err) {
        console.log("lottery.claim2ndPlacePrize: " + err.message);
        assert(
          err.message.indexOf("ticket not awarded or prize already claimed") >=
            0,
          "lottery.claim2ndPlacePrize should fail with expected error"
        );
      }
    });
  });

  describe("Claim 3rd place prize", () => {
    it("should revert if token id was not awarded 2nd place", async () => {
      console.log(
        "---lottery.claim3rdPlacePrize.from: ",
        ticketId3rdPrizeOwner
      );
      try {
        let wrongPrizeTicketId = ticketId1stPrize;
        await lottery.claim3rdPlacePrize(wrongPrizeTicketId, 0, {
          from: ticketId3rdPrizeOwner,
        });
        assert.fail();
      } catch (err) {
        console.log("lottery.claim3rdPlacePrize: " + err.message);
        assert(
          err.message.indexOf("ticket not awarded or prize already claimed") >=
            0,
          "lottery.claim3rdPlacePrize should fail with expected error"
        );
      }
    });

    it("should revert if sender is not the owner of the token id", async () => {
      //await expectRevert.unspecified(
      //  lottery.claim3rdPlacePrize(ticketId3rdPrize, 0, { from: owner })
      //);
      try {
        await lottery.claim3rdPlacePrize(ticketId3rdPrize, 0, { from: owner });
        assert.fail();
      } catch (err) {
        console.log("lottery.claim3rdPlacePrize: " + err.message);
        assert(
          err.message.indexOf("ticket owner required to claim prize") >= 0,
          "lottery.claim3rdPlacePrize should fail with expected error"
        );
      }
    });

    it("should revert if token id has won in lottery 0 but claims prize for lottery 1", async () => {
      //await expectRevert.unspecified(
      //  lottery.claim3rdPlacePrize(ticketId3rdPrize, 1, {
      //    from: ticketId3rdPrizeOwner,
      //  })
      //);
      try {
        await lottery.claim3rdPlacePrize(ticketId3rdPrize, 1, {
          from: ticketId3rdPrizeOwner,
        });
        assert.fail();
      } catch (err) {
        console.log("lottery.claim3rdPlacePrize: " + err.message);
        assert(
          err.message.indexOf("ticket not awarded or prize already claimed") >=
            0,
          "lottery.claim3rdPlacePrize should fail with expected error"
        );
      }
    });

    it("3rd prize winner sUSD balance snapshot", async () => {
      t3rdPrizeOwnerBalanceBeforeClaim = web3.utils.toBN(
        await sUSD.balanceOf(ticketId3rdPrizeOwner)
      );
      console.log(
        "---sUSD.balanceOf.t3rdPrizeOwnerBalanceBeforeClaim: ",
        ticketId3rdPrizeOwner,
        "\n",
        t3rdPrizeOwnerBalanceBeforeClaim.toString(),
        " sUSD"
      );
    });

    it("claim 3rd place prize", async () => {
      // ticketId2ndPrizeOwner is user4
      // ticketId2ndPrize is 7
      const tx = await lottery.claim3rdPlacePrize(ticketId3rdPrize, 0, {
        from: ticketId3rdPrizeOwner,
      });
      assert.equal(tx.logs.length, 1, "Should trigger one event");
      assert.equal(
        tx.logs[0].event,
        "PrizeClaimed",
        "Should be the 'PrizeClaimed' event."
      );
      assert.equal(tx.logs[0].args.lotteryId, 0, "Should be the 0 lottery id");
      assert.equal(
        tx.logs[0].args.eventType,
        SLottery.EventType.Third.toString(),
        `Should be the Third event type`
      );
      assert.equal(
        tx.logs[0].args.tokenId.toString(),
        ticketId3rdPrize.toString(),
        `Should be the token id ${ticketId3rdPrize}`
      );
      assert.equal(ticketId3rdPrize, 7, "Should be the token id 7");
    });

    it("3rd prize winner should have correct balance after prize claim", async () => {
      // 3rd place prize is 15% of 10 tickets at 1 sUSD each = 1.5 USD
      // 3rd prize winner is user4
      // he bought 4 tickets for 4 sUSD, won 1.5 sUSD, should have 97.5 sUSD
      t3rdPrizeOwnerBalanceAfterClaim = web3.utils.toBN(
        await sUSD.balanceOf(ticketId3rdPrizeOwner)
      );

      let prize = web3.utils.toBN(tokensToWei("1.5"));
      let expectedNewBalance = t3rdPrizeOwnerBalanceBeforeClaim.add(prize);
      console.log(
        "---sUSD.balanceOf.t3rdPrizeOwnerBalanceAfterClaim: ",
        ticketId3rdPrizeOwner,
        "\n",
        t3rdPrizeOwnerBalanceAfterClaim.toString(),
        " sUSD"
      );
      assert.equal(
        t3rdPrizeOwnerBalanceAfterClaim.toString(),
        expectedNewBalance.toString(),
        "The balance of 3rd prize ticket id owner should match expected value"
      );

      let expectedBalanceAfterClaim = web3.utils.toBN(tokensToWei("97.5"));
      assert.equal(
        t3rdPrizeOwnerBalanceAfterClaim.toString(),
        expectedBalanceAfterClaim.toString(),
        "The balance of 3rd prize ticket id owner should match expected value"
      );
    });

    it("should revert if 3rd prize winner attempts to claim prize again", async () => {
      //await expectRevert.unspecified(
      //  lottery.claim3rdPlacePrize(ticketId3rdPrize, 0, {
      //    from: ticketId3rdPrizeOwner,
      //  })
      //);
      try {
        await lottery.claim3rdPlacePrize(ticketId3rdPrize, 0, {
          from: ticketId3rdPrizeOwner,
        });
        assert.fail();
      } catch (err) {
        console.log("lottery.claim3rdPlacePrize: " + err.message);
        assert(
          err.message.indexOf("ticket not awarded or prize already claimed") >=
            0,
          "lottery.claim3rdPlacePrize should fail with expected error"
        );
      }
    });
  });
});
