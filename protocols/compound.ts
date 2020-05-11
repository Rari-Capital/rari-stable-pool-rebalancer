// TODO: Remove @ts-ignore

import Web3 from 'web3';

const cErc20DelegatorAbi = require('./abi/CErc20Delegator.json');

class CompoundProtocol {
    web3: Web3;
    
    cErc20Contracts = {
        "DAI": "0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643"
    };

    constructor(web3: Web3) {
        this.web3 = web3;
    }

    async getAprs(currencyCodes) {
        var aprs = {};

        // For each currency
        for (var i = 0; i < currencyCodes.length; i++) {
            if (!this.cErc20Contracts[currencyCodes[i]]) continue;
            // @ts-ignore: Argument of type [...] is not assignable to parameter of type 'AbiItem | AbiItem[]'.
            var cErc20Contract = new this.web3.eth.Contract(cErc20DelegatorAbi, this.cErc20Contracts[currencyCodes[i]]);

            try {
                var supplyRatePerBlock = await cErc20Contract.methods.supplyRatePerBlock().call();
            } catch (error) {
                throw "Failed to get Compound " + currencyCodes[i] + " supplyRatePerBlock: " + error;
            }

            // TODO: Use big numbers for Compound APR calculations
            // TODO: Get blocksPerYear dynamically from interestRateModel.blocksPerYear
            var blocksPerYear = 2102400; // See https://github.com/compound-finance/compound-protocol/blob/v2.6-rc2/contracts/JumpRateModel.sol#L23 and https://github.com/compound-finance/compound-protocol/blob/v2.6-rc2/contracts/WhitePaperInterestRateModel.sol#L24
            var apr = (supplyRatePerBlock / 1e18) * blocksPerYear;
            aprs[currencyCodes[i]] = apr;
        }

        return aprs;
    }

    async getUnderlyingBalances(currencyCodes) {
        var balances = {};

        // For each currency
        for (var i = 0; i < currencyCodes.length; i++) {
            if (!this.cErc20Contracts[currencyCodes[i]]) continue;
            // @ts-ignore: Argument of type [...] is not assignable to parameter of type 'AbiItem | AbiItem[]'.
            var cErc20Contract = new this.web3.eth.Contract(cErc20DelegatorAbi, this.cErc20Contracts[currencyCodes[i]]);
            
            try {
                var balanceOfUnderlying = await cErc20Contract.methods.balanceOfUnderlying(process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS).call();
            } catch (error) {
                console.error("Error when checking underlying Compound balance of", currencyCodes[i], ":", error);
                continue;
            }

            if (process.env.NODE_ENV !== "production") console.log("CompoundProtocol.getUnderlyingBalances got", balanceOfUnderlying, currencyCodes[i]);
            balances[currencyCodes[i]] = web3.utils.toBN(balanceOfUnderlying);
        }

        return balances;
    }
}

module.exports = CompoundProtocol;
