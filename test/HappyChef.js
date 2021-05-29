const { BN, ether, expectRevert } = require("@openzeppelin/test-helpers");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const { expect } = require("chai");

const Happy = artifacts.require("./Happy.sol");
const HappyChef = artifacts.require("./HappyChef.sol");
const TokenStub = artifacts.require("./TokenStub.sol");
const ChainLinkStub = artifacts.require("./ChainLinkStub.sol");
const HappyChainLinkStub = artifacts.require("./HappyChainLinkStub.sol");

contract("HappyChef", accounts => {
  
  const admin = accounts[0];
  const user1 = accounts[1];
  const user2 = accounts[2];


  // Function to update Ganache timestamp
  this.increaseTime = (seconds) => {
    return new Promise((resolve, reject) => {
      web3.currentProvider.send({
        jsonrpc: '2.0',
        method: 'evm_increaseTime',
        params: [ seconds ],
        id: new Date().getSeconds()
      }, (err) => {
        if (err) return reject(err);

        web3.currentProvider.send({
          jsonrpc: '2.0',
          method: 'evm_mine',
          id: new Date().getSeconds()
        }, (err, res) => {
          if (err) return reject(err);

          return resolve(res);
        });
      })
    });
  }


  beforeEach(async () => {
    this.HappyChainLink = await HappyChainLinkStub.new(1000);
    this.Happy = await Happy.new();
    this.HappyChef = await HappyChef.new(this.Happy.address, this.HappyChainLink.address);

    await this.Happy.transferOwnership(this.HappyChef.address, { from: admin });

    this.Dai = await TokenStub.new("DAI Token", "DAI");
    this.Usdc = await TokenStub.new("USDC Token", "USDC");

    const amount = 1000000;
    this.Dai.transfer(user1, amount, { from: admin });
    this.Dai.transfer(user2, amount, { from: admin });
    this.Usdc.transfer(user1, amount, { from: admin });
    this.Usdc.transfer(user2, amount, { from: admin });

    this.ChainLink = await ChainLinkStub.new(1);

    this.HappyChef.addPool(this.Dai.address, this.ChainLink.address, 1500);
    this.HappyChef.addPool(this.Usdc.address, this.ChainLink.address, 1200);
  });


  it("...should have 2 initialized pools.", async () => {
    const pool0 = await this.HappyChef.pools.call(0);

    expect(pool0.token).to.be.equal(this.Dai.address);
    expect(pool0.yield).to.be.bignumber.equal(new BN(1500));
    expect(pool0.priceFeed).to.be.equal(this.ChainLink.address);

    const pool1 = await this.HappyChef.pools.call(1);

    expect(pool1.token).to.be.equal(this.Usdc.address);
    expect(pool1.yield).to.be.bignumber.equal(new BN(1200));
    expect(pool1.priceFeed).to.be.equal(this.ChainLink.address);
  });


  it("...should allow user to stake & unstake.", async () => {
    const amount = 500000;

    // Approve
    await this.Dai.approve(this.HappyChef.address, amount, { from: user1 });

    // Stake
    await this.HappyChef.stake(0, amount, { from: user1 });
    let balance = await this.HappyChef.getUserBalance(0, user1);
    expect(balance).to.be.bignumber.equal(new BN(amount));

    // Mine blocks
    await this.increaseTime(600);

    // Unstake more than staked
    await expectRevert(this.HappyChef.unstake(0, amount + 100, { from: user1 }), 'Insufficient staked amount');

    // Partial Unstake
    await this.HappyChef.unstake(0, amount / 2, { from: user1 });
    balance = await this.HappyChef.getUserBalance(0, user1);
    expect(balance).to.be.bignumber.equal(new BN(amount / 2));
    let reward = await this.Happy.balanceOf(user1);
    expect(reward).to.be.bignumber.above(new BN(0));

    // Total Unstake
    await this.HappyChef.unstake(0, amount / 2, { from: user1 });
    balance = await this.HappyChef.getUserBalance(0, user1);
    expect(balance).to.be.bignumber.equal(new BN(0));
    reward = await this.Happy.balanceOf(user1);
    expect(reward).to.be.bignumber.above(new BN(0));
  });


  it('...should allow user to get correct reward', async () => {
    const amount = 1000000;

    // Approve
    await this.Dai.approve(this.HappyChef.address, amount, { from: user1 });

    // Stake
    await this.HappyChef.stake(0, amount, { from: user1 });
    let balance = await this.HappyChef.getUserBalance(0, user1);
    expect(balance).to.be.bignumber.equal(new BN(amount));

    // Mine blocks
    await this.increaseTime(60 * 60 * 24);

    // Get user reward
    const userReward = await this.HappyChef.pendingReward(0, user1);
    console.log(userReward);

    // Calculate reward
    const blockNumber = await web3.eth.getBlockNumber();
    console.log(blockNumber);
    const happyPrice = blockNumber / 1000;
    const reward = amount * 0.15 / 365 * 1 / happyPrice;
    console.log(reward);

    expect(new BN(reward)).to.be.bignumber.equal(userReward);
  });

});
