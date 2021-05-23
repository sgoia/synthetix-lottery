const tokensToWei = (n) => {
  return web3.utils.toWei(n, "ether");
};

module.exports = { tokensToWei };
