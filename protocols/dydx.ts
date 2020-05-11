import Web3 from 'web3';
// TODO: Fix error associated with import statement
// import { Solo, Networks, MarketId, BigNumber } from '@dydxprotocol/solo';
var _solo = require('@dydxprotocol/solo');
var Solo = _solo.Solo,
    Networks = _solo.Networks,
    MarketId = _solo.MarketId,
    BigNumber = _solo.BigNumber;

class DydxProtocol {
    web3: Web3;
    solo: any; // TODO: Change type to Solo when import issue above is fixed

    constructor(web3: Web3) {
        this.web3 = web3;

        // Initialize dYdX
        this.solo = new Solo(
            process.env.INFURA_ENDPOINT_URL,
            Networks.MAINNET,
            {
                defaultAccount: process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS, // Optional
            }, // Optional
        );
    }

    async getAprs(currencyCodes) {
        var aprs = {};

        // TODO: May have to use getMarketSupplyInterestRate from https://github.com/dydxprotocol/solo/blob/master/src/modules/Getters.ts
        // TODO: Why use totalSupplyAPR over totalSupplyAPY? Simply because totalSupplyAPR is the one used by https://trade.dydx.exchange/balances
        const { markets } = await this.solo.api.getMarkets();
        
        for (var i = 0; i < markets.length; i++) {
            if (currencyCodes.indexOf(markets[i].symbol) >= 0) aprs[markets[i].symbol] = parseFloat(markets[i].totalSupplyAPR);
        }

        return aprs;
    }

    async getUnderlyingBalances(currencyCodesByTokenAddress) {
        // Get balances from dYdX
        const balances = await this.solo.getters.getAccountBalances(
            process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS, // Account Owner
            new BigNumber(0), // Account Number
        );

        var balancesByCurrencyCode = {};

        for (var i = 0; i < balances.length; i++) {
            var currencyCode = currencyCodesByTokenAddress[balances[i].tokenAddress];
            if (!currencyCode) continue;
            var balanceBN = this.web3.utils.toBN(balances[i].wei);
            if (process.env.NODE_ENV !== "production") console.log("DydxProtocol.getUnderlyingBalances got", balanceBN.toString(), currencyCode);
            balancesByCurrencyCode[currencyCode] = balanceBN;
        }

        return balancesByCurrencyCode;
    }
}

module.exports = DydxProtocol;
