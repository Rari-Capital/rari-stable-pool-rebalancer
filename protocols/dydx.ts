import Web3 from 'web3';
// TODO: Fix error associated with import statement
// import { Solo, Networks, MarketId, BigNumber } from '@dydxprotocol/solo';
var _solo = require('@dydxprotocol/solo');
var Solo = _solo.Solo,
    Networks = _solo.Networks,
    MarketId = _solo.MarketId,
    BigNumber = _solo.BigNumber;

const soloMarginAbi = require('./dydx/SoloMargin.json');
const polynomialInterestSetterAbi = require('./dydx/PolynomialInterestSetter.json');

export default class DydxProtocol {
    web3: Web3;
    solo: any; // TODO: Change type to Solo when import issue above is fixed
    marketIds = { "WETH": 0, "SAI": 1, "USDC": 2, "DAI": 3 };

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

    parToWei(parBN, indexBN) {
        return parBN.mul(indexBN);
    }
    
    weiToPar(weiBN, indexBN) {
        return weiBN.div(indexBN);
    }
    
    async predictApr(currencyCode, tokenAddress, supplyWeiDifferenceBN) {
        var marketId = this.marketIds[currencyCode];
        if (marketId === undefined) throw "Currency code not supported by dYdX implementation"
        var soloMarginContract = new this.web3.eth.Contract(soloMarginAbi, "0x1e0447b19bb6ecfdae1e4ae1694b0c3659614e4e");
        
        try {
            var [borrowParBN, supplyParBN] = await soloMarginContract.methods.getMarketTotalPar(marketId).call();
        } catch (error) {
            throw "Error when calling SoloMargin.getMarketTotalPar for " + currencyCode + ": " + error;
        }
        
        try {
            var [borrowIndexBN, supplyIndexBN] = await soloMarginContract.methods.getMarketCurrentIndex(marketId).call();
        } catch (error) {
            throw "Error when calling SoloMargin.getMarketCurrentIndex for " + currencyCode + ": " + error;
        }
        
        var secondsPerYearBN = this.web3.utils.toBN(60 * 60 * 24 * 365);
        
        var polynomialInterestSetterContract = new this.web3.eth.Contract(polynomialInterestSetterAbi, "0xaEE83ca85Ad63DFA04993adcd76CB2B3589eCa49");
        
        try {
            var borrowBN = (await polynomialInterestSetterContract.methods.getInterestRate(tokenAddress, this.parToWei(borrowParBN, borrowIndexBN), this.parToWei(supplyParBN, supplyIndexBN).add(supplyWeiDifferenceBN)).call()).mul(secondsPerYearBN);
        } catch (error) {
            throw "Error when calling PolynomialInterestSetter.getInterestRate for " + currencyCode + ": " + error;
        }
        
        var usageBN = borrowParBN.div(supplyParBN.add(this.weiToPar(supplyWeiDifferenceBN, supplyIndexBN)));
        var earningsRateBN = this.web3.utils.toBN(950000000000000000);
        var apr = borrowBN.mul(usageBN).mul(earningsRateBN);
        return apr;
    }    

    async getApr(currencyCode) {
        // TODO: May have to use getMarketSupplyInterestRate from https://github.com/dydxprotocol/solo/blob/master/src/modules/Getters.ts
        // TODO: Why use totalSupplyAPR over totalSupplyAPY? Simply because totalSupplyAPR is the one used by https://trade.dydx.exchange/balances
        const { markets } = await this.solo.api.getMarkets();
        
        for (var i = 0; i < markets.length; i++)
            if (currencyCode === markets[i].symbol) return parseFloat(markets[i].totalSupplyAPR);

        throw "Unknown dYdX market";
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
