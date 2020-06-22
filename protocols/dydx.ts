import fs from 'fs';
import Web3 from 'web3';

const soloMarginAbi = JSON.parse(fs.readFileSync(__dirname + '/dydx/SoloMargin.json', 'utf8'));
const polynomialInterestSetterAbi = JSON.parse(fs.readFileSync(__dirname + '/dydx/PolynomialInterestSetter.json', 'utf8'));

export default class DydxProtocol {
    web3: Web3;
    soloMarginContract: any;
    marketIds = { "WETH": 0, "SAI": 1, "USDC": 2, "DAI": 3 };

    constructor(web3: Web3) {
        this.web3 = web3;
        this.soloMarginContract = new this.web3.eth.Contract(soloMarginAbi, "0x1e0447b19bb6ecfdae1e4ae1694b0c3659614e4e");
    }

    parToWei(parBN, indexBN) {
        return parBN.mul(indexBN);
    }
    
    weiToPar(weiBN, indexBN) {
        return weiBN.div(indexBN);
    }
    
    async predictApr(currencyCode, tokenAddress, supplyWeiDifferenceBN) {
        var marketId = this.marketIds[currencyCode];
        if (marketId === undefined) throw "Currency code not supported by dYdX implementation";
        
        try {
            var res = await this.soloMarginContract.methods.getMarketTotalPar(marketId).call();
            var borrowParBN = this.web3.utils.toBN(res[0]);
            var supplyParBN = this.web3.utils.toBN(res[1]);
        } catch (error) {
            throw "Error when calling SoloMargin.getMarketTotalPar for " + currencyCode + ": " + error;
        }
        
        try {
            var res = await this.soloMarginContract.methods.getMarketCurrentIndex(marketId).call();
            var borrowIndexBN = this.web3.utils.toBN(res[0]);
            var supplyIndexBN = this.web3.utils.toBN(res[1]);
        } catch (error) {
            throw "Error when calling SoloMargin.getMarketCurrentIndex for " + currencyCode + ": " + error;
        }
                
        var borrowWeiBN = this.parToWei(borrowParBN, borrowIndexBN);
        var supplyWeiBN = this.parToWei(supplyParBN, supplyIndexBN);
        var newSupplyWeiBN = supplyWeiBN.add(supplyWeiDifferenceBN);
        var polynomialInterestSetterContract = new this.web3.eth.Contract(polynomialInterestSetterAbi, "0xaEE83ca85Ad63DFA04993adcd76CB2B3589eCa49");
        
        try {
            var borrowInterestRatePerSecondBN = this.web3.utils.toBN((await polynomialInterestSetterContract.methods.getInterestRate(tokenAddress, borrowWeiBN, newSupplyWeiBN).call())[0]);
        } catch (error) {
            throw "Error when calling PolynomialInterestSetter.getInterestRate for " + currencyCode + ": " + error;
        }
        
        var secondsPerYearBN = this.web3.utils.toBN(60 * 60 * 24 * 365);
        var borrowInterestRatePerYearBN = borrowInterestRatePerSecondBN.mul(secondsPerYearBN);
        var earningsRateBN = this.web3.utils.toBN("950000000000000000");
        return parseFloat(borrowInterestRatePerYearBN.mul(earningsRateBN).mul(borrowWeiBN).div(supplyWeiBN).divn(1e18).toString()) / 1e18; // borrowWeiBN.div(supplyWeiBN) = utilization/usage
    }    

    async getApr(currencyCode) {
        var marketId = this.marketIds[currencyCode];
        if (marketId === undefined) throw "Currency code not supported by dYdX implementation";

        try {
            var borrowInterestRatePerSecondBN = this.web3.utils.toBN((await this.soloMarginContract.methods.getMarketInterestRate(marketId).call())[0]);
        } catch (error) {
            throw "Error when calling SoloMargin.getMarketInterestRate for " + currencyCode + ": " + error;
        }
        
        try {
            var res = await this.soloMarginContract.methods.getMarketTotalPar(marketId).call();
            var borrowParBN = this.web3.utils.toBN(res[0]);
            var supplyParBN = this.web3.utils.toBN(res[1]);
        } catch (error) {
            throw "Error when calling SoloMargin.getMarketTotalPar for " + currencyCode + ": " + error;
        }
        
        try {
            var res = await this.soloMarginContract.methods.getMarketCurrentIndex(marketId).call();
            var borrowIndexBN = this.web3.utils.toBN(res[0]);
            var supplyIndexBN = this.web3.utils.toBN(res[1]);
        } catch (error) {
            throw "Error when calling SoloMargin.getMarketCurrentIndex for " + currencyCode + ": " + error;
        }

        var secondsPerYearBN = this.web3.utils.toBN(60 * 60 * 24 * 365);
        var borrowInterestRatePerYearBN = borrowInterestRatePerSecondBN.mul(secondsPerYearBN);
        var borrowWeiBN = this.parToWei(borrowParBN, borrowIndexBN);
        var supplyWeiBN = this.parToWei(supplyParBN, supplyIndexBN);
        var earningsRateBN = this.web3.utils.toBN("950000000000000000");
        return parseFloat(borrowInterestRatePerYearBN.mul(earningsRateBN).mul(borrowWeiBN).div(supplyWeiBN).divn(1e18).toString()) / 1e18; // borrowWeiBN.div(supplyWeiBN) = utilization/usage
    }

    async getAprs(currencyCodes) {
        var aprs = {};
        for (var i = 0; i < currencyCodes.length; i++) aprs[currencyCodes[i]] = await this.getApr(currencyCodes[i]);
        return aprs;
    }

    async getUnderlyingBalances(currencyCodesByTokenAddress) {
        try {
            var [tokens, pars, weis] = Object.values(await this.soloMarginContract.methods.getAccountBalances({
                owner: process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS,
                number: this.web3.utils.toBN(0)
            }).call());
        } catch (error) {
            throw "Error when calling SoloMargin.getAccountBalances: " + error;
        }

        var balancesByCurrencyCode = {};

        for (var i = 0; i < tokens.length; i++) {
            var currencyCode = currencyCodesByTokenAddress[tokens[i]];
            if (!currencyCode) continue;
            balancesByCurrencyCode[currencyCode] = this.valueToBN(weis[i]);
        }

        if (process.env.NODE_ENV !== "production") console.log("DydxProtocol.getUnderlyingBalances got", balancesByCurrencyCode);
        return balancesByCurrencyCode;
    }
    
    valueToBN({ value, sign }: { value: string, sign: boolean }) {
        let result = this.web3.utils.toBN(value);
        if (!result.isZero() && !sign) result.imul(this.web3.utils.toBN(-1));
        return result;
    }
}
