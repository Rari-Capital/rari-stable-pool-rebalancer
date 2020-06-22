"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const soloMarginAbi = JSON.parse(fs_1.default.readFileSync(__dirname + '/dydx/SoloMargin.json', 'utf8'));
const polynomialInterestSetterAbi = JSON.parse(fs_1.default.readFileSync(__dirname + '/dydx/PolynomialInterestSetter.json', 'utf8'));
class DydxProtocol {
    constructor(web3) {
        this.marketIds = { "WETH": 0, "SAI": 1, "USDC": 2, "DAI": 3 };
        this.web3 = web3;
        this.soloMarginContract = new this.web3.eth.Contract(soloMarginAbi, "0x1e0447b19bb6ecfdae1e4ae1694b0c3659614e4e");
    }
    parToWei(parBN, indexBN) {
        return parBN.mul(indexBN);
    }
    weiToPar(weiBN, indexBN) {
        return weiBN.div(indexBN);
    }
    predictApr(currencyCode, tokenAddress, supplyWeiDifferenceBN) {
        return __awaiter(this, void 0, void 0, function* () {
            var marketId = this.marketIds[currencyCode];
            if (marketId === undefined)
                throw "Currency code not supported by dYdX implementation";
            try {
                var res = yield this.soloMarginContract.methods.getMarketTotalPar(marketId).call();
                var borrowParBN = this.web3.utils.toBN(res[0]);
                var supplyParBN = this.web3.utils.toBN(res[1]);
            }
            catch (error) {
                throw "Error when calling SoloMargin.getMarketTotalPar for " + currencyCode + ": " + error;
            }
            try {
                var res = yield this.soloMarginContract.methods.getMarketCurrentIndex(marketId).call();
                var borrowIndexBN = this.web3.utils.toBN(res[0]);
                var supplyIndexBN = this.web3.utils.toBN(res[1]);
            }
            catch (error) {
                throw "Error when calling SoloMargin.getMarketCurrentIndex for " + currencyCode + ": " + error;
            }
            var polynomialInterestSetterContract = new this.web3.eth.Contract(polynomialInterestSetterAbi, "0xaEE83ca85Ad63DFA04993adcd76CB2B3589eCa49");
            var secondsPerYearBN = this.web3.utils.toBN(60 * 60 * 24 * 365);
            try {
                var borrowBN = (yield polynomialInterestSetterContract.methods.getInterestRate(tokenAddress, this.parToWei(borrowParBN, borrowIndexBN), this.parToWei(supplyParBN, supplyIndexBN).add(supplyWeiDifferenceBN)).call()).mul(secondsPerYearBN);
            }
            catch (error) {
                throw "Error when calling PolynomialInterestSetter.getInterestRate for " + currencyCode + ": " + error;
            }
            var usageBN = borrowParBN.div(supplyParBN.add(this.weiToPar(supplyWeiDifferenceBN, supplyIndexBN)));
            var earningsRateBN = this.web3.utils.toBN("950000000000000000");
            var apr = borrowBN.mul(usageBN).mul(earningsRateBN);
            return apr;
        });
    }
    getApr(currencyCode) {
        return __awaiter(this, void 0, void 0, function* () {
            var marketId = this.marketIds[currencyCode];
            if (marketId === undefined)
                throw "Currency code not supported by dYdX implementation";
            try {
                var borrowInterestRateBN = this.web3.utils.toBN((yield this.soloMarginContract.methods.getMarketInterestRate(marketId).call())[0]);
            }
            catch (error) {
                throw "Error when calling SoloMargin.getMarketInterestRate for " + currencyCode + ": " + error;
            }
            try {
                var res = yield this.soloMarginContract.methods.getMarketTotalPar(marketId).call();
                var borrowParBN = this.web3.utils.toBN(res[0]);
                var supplyParBN = this.web3.utils.toBN(res[1]);
            }
            catch (error) {
                throw "Error when calling SoloMargin.getMarketTotalPar for " + currencyCode + ": " + error;
            }
            var utilizationBN = borrowParBN.div(supplyParBN);
            var earningsRateBN = this.web3.utils.toBN("950000000000000000");
            return borrowInterestRateBN.mul(earningsRateBN).mul(utilizationBN);
        });
    }
    getAprs(currencyCodes) {
        return __awaiter(this, void 0, void 0, function* () {
            var aprs = {};
            for (var i = 0; i < currencyCodes.length; i++)
                aprs[currencyCodes[i]] = yield this.getApr(currencyCodes[i]);
            return aprs;
        });
    }
    getUnderlyingBalances(currencyCodesByTokenAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                var [tokens, pars, weis] = Object.values(yield this.soloMarginContract.methods.getAccountBalances({
                    owner: process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS,
                    number: this.web3.utils.toBN(0)
                }).call());
            }
            catch (error) {
                throw "Error when calling SoloMargin.getAccountBalances: " + error;
            }
            var balancesByCurrencyCode = {};
            for (var i = 0; i < tokens.length; i++) {
                var currencyCode = currencyCodesByTokenAddress[tokens[i]];
                if (!currencyCode)
                    continue;
                balancesByCurrencyCode[currencyCode] = this.valueToBN(weis[i]);
            }
            if (process.env.NODE_ENV !== "production")
                console.log("DydxProtocol.getUnderlyingBalances got", balancesByCurrencyCode);
            return balancesByCurrencyCode;
        });
    }
    valueToBN({ value, sign }) {
        let result = this.web3.utils.toBN(value);
        if (!result.isZero() && !sign)
            result.imul(this.web3.utils.toBN(-1));
        return result;
    }
}
exports.default = DydxProtocol;
//# sourceMappingURL=dydx.js.map