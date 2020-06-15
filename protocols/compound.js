"use strict";
// TODO: Remove @ts-ignore
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const erc20Abi = require('./abi/ERC20.json');
const cErc20DelegatorAbi = require('./compound/CErc20Delegator.json');
const interestRateModelAbi = require('./compound/InterestRateModel.json');
class CompoundProtocol {
    constructor(web3) {
        this.cErc20Contracts = {
            "DAI": "0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643"
        };
        this.web3 = web3;
    }
    getCashPriorBN(currencyCode, underlyingTokenAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            var erc20Contract = new this.web3.eth.Contract(erc20Abi, underlyingTokenAddress);
            try {
                return yield erc20Contract.methods.balanceOf(this.cErc20Contracts[currencyCode]).call();
            }
            catch (error) {
                throw "Failed to get prior cash of cToken for " + currencyCode + ": " + error;
            }
        });
    }
    // DAI & USDT
    getSupplyRatePerBlockBN(currencyCode, underlyingTokenAddress, supplyDifferenceBN) {
        return __awaiter(this, void 0, void 0, function* () {
            if (["DAI", "USDT"].indexOf(currencyCode) < 0)
                throw "Invalid currency code";
            var totalCashBN = (yield this.getCashPriorBN(currencyCode, underlyingTokenAddress)).add(supplyDifferenceBN);
            var cErc20Contract = new this.web3.eth.Contract(cErc20DelegatorAbi, this.cErc20Contracts[currencyCode]);
            try {
                var totalBorrows = yield cErc20Contract.methods.totalBorrows().call();
            }
            catch (error) {
                throw "Failed to get total borrows of cToken for " + currencyCode + ": " + error;
            }
            try {
                var totalReserves = yield cErc20Contract.methods.totalReserves().call();
            }
            catch (error) {
                throw "Failed to get total reserves of cToken for " + currencyCode + ": " + error;
            }
            var reserveFactorMantissa = currencyCode == "DAI" ? 50000000000000000 : 0;
            var interestRateModelContract = new this.web3.eth.Contract(interestRateModelAbi, currencyCode == "DAI" ? "0x000000007675b5e1da008f037a0800b309e0c493" : "0x6bc8fe27d0c7207733656595e73c0d5cf7afae36");
            try {
                var totalReserves = yield interestRateModelContract.methods.getSupplyRate(totalCashBN, totalBorrows, totalReserves, reserveFactorMantissa).call();
            }
            catch (error) {
                throw "Failed to get supply rate of cToken for " + currencyCode + ": " + error;
            }
        });
    }
    // Exchange rate (scaled by 1e18)
    getUsdcExchangeRateBN(totalSupplyBN, totalCashBN, totalBorrowsBN, totalReservesBN) {
        if (totalSupplyBN.eq(this.web3.utils.toBN(0)))
            return 200000000000000;
        else
            return totalCashBN.add(totalBorrowsBN).sub(totalReservesBN).sub(totalSupplyBN);
    }
    getUsdcSupplyRatePerBlockBN(underlyingTokenAddress, supplyDifferenceBN) {
        return __awaiter(this, void 0, void 0, function* () {
            var cErc20Contract = new this.web3.eth.Contract(cErc20DelegatorAbi, this.cErc20Contracts["USDC"]);
            try {
                var totalBorrowsBN = yield cErc20Contract.methods.totalBorrows().call();
            }
            catch (error) {
                throw "Failed to get total borrows of cToken for USDC: " + error;
            }
            try {
                var totalReservesBN = yield cErc20Contract.methods.totalReserves().call();
            }
            catch (error) {
                throw "Failed to get total reserves of cToken for USDC: " + error;
            }
            try {
                var totalSupplyBN = (yield cErc20Contract.methods.totalSupply().call()).add(supplyDifferenceBN);
            }
            catch (error) {
                throw "Failed to get total supply of cToken for USDC: " + error;
            }
            var totalCashBN = (yield this.getCashPriorBN("USDC", underlyingTokenAddress)).add(supplyDifferenceBN);
            var exchangeRateBN = yield this.getUsdcExchangeRateBN(totalSupplyBN, totalCashBN, totalBorrowsBN, totalReservesBN);
            var reserveFactorBN = this.web3.utils.toBN(50000000000000000);
            /* We calculate the supply rate:
            *  underlying = totalSupply × exchangeRate
            *  borrowsPer = totalBorrows ÷ underlying
            *  supplyRate = borrowRate × (1-reserveFactor) × borrowsPer
            */
            var interestRateModelContract = new this.web3.eth.Contract(interestRateModelAbi, "0x0c3f8df27e1a00b47653fde878d68d35f00714c0");
            try {
                var borrowRateBN = yield interestRateModelContract.methods.getBorrowRate(totalCashBN, totalBorrowsBN, 0).call(); // Total reserves = 0 because not used by WhitePaperInterestRateModel
            }
            catch (error) {
                throw "Failed to get borrow rate of InterestRateModel for cToken for USDC: " + error;
            }
            var underlyingBN = exchangeRateBN.mul(totalSupplyBN);
            var borrowsPerBN = totalBorrowsBN.div(underlyingBN);
            var oneMinusReserveFactorBN = this.web3.utils.toBN(1e18).sub(reserveFactorBN);
            var supplyRateBN = borrowRateBN.mul(oneMinusReserveFactorBN).mul(borrowsPerBN);
            return supplyRateBN;
        });
    }
    predictApr(currencyCode, underlyingTokenAddress, supplyWeiDifferenceBN) {
        return __awaiter(this, void 0, void 0, function* () {
            if (["DAI", "USDT"].indexOf(currencyCode) >= 0)
                return yield this.getSupplyRatePerBlockBN(currencyCode, underlyingTokenAddress, supplyWeiDifferenceBN);
            if (["DAI", "USDT"].indexOf(currencyCode) >= 0)
                return yield this.getUsdcSupplyRatePerBlockBN(underlyingTokenAddress, supplyWeiDifferenceBN);
            else
                throw "Currency code not supported by Compound implementation";
        });
    }
    supplyRatePerBlockToApr(supplyRatePerBlock) {
        // TODO: Use big numbers for Compound APR calculations
        // TODO: Get blocksPerYear dynamically from interestRateModel.blocksPerYear
        var blocksPerYear = 2102400; // See https://github.com/compound-finance/compound-protocol/blob/v2.6-rc2/contracts/JumpRateModel.sol#L23 and https://github.com/compound-finance/compound-protocol/blob/v2.6-rc2/contracts/WhitePaperInterestRateModel.sol#L24
        var apr = (supplyRatePerBlock / 1e18) * blocksPerYear;
        return apr;
    }
    getApr(currencyCode) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.cErc20Contracts[currencyCode])
                throw "No cToken known for currency code " + currencyCode;
            // @ts-ignore: Argument of type [...] is not assignable to parameter of type 'AbiItem | AbiItem[]'.
            var cErc20Contract = new this.web3.eth.Contract(cErc20DelegatorAbi, this.cErc20Contracts[currencyCode]);
            try {
                var supplyRatePerBlock = yield cErc20Contract.methods.supplyRatePerBlock().call();
            }
            catch (error) {
                throw "Failed to get Compound " + currencyCode + " supplyRatePerBlock: " + error;
            }
            return this.supplyRatePerBlockToApr(supplyRatePerBlock);
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
    getUnderlyingBalance(currencyCode) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.cErc20Contracts[currencyCode])
                throw "Invalid currency code supplied to CompoundProtocol.getUnderlyingBalance";
            // @ts-ignore: Argument of type [...] is not assignable to parameter of type 'AbiItem | AbiItem[]'.
            var cErc20Contract = new this.web3.eth.Contract(cErc20DelegatorAbi, this.cErc20Contracts[currencyCodes[i]]);
            try {
                var balanceOfUnderlying = yield cErc20Contract.methods.balanceOfUnderlying(process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS).call();
            }
            catch (error) {
                throw "Error when checking underlying Compound balance of " + currencyCode + ":" + error;
            }
            if (process.env.NODE_ENV !== "production")
                console.log("CompoundProtocol.getUnderlyingBalance got", balanceOfUnderlying, currencyCode);
            return this.web3.utils.toBN(balanceOfUnderlying);
        });
    }
    getUnderlyingBalances(currencyCodes) {
        return __awaiter(this, void 0, void 0, function* () {
            var balances = {};
            // For each currency
            for (var i = 0; i < currencyCodes.length; i++) {
                try {
                    balances[currencyCodes[i]] = this.getUnderlyingBalance(currencyCodes[i]);
                }
                catch (error) {
                    console.log(error);
                }
            }
            return balances;
        });
    }
}
exports.default = CompoundProtocol;
//# sourceMappingURL=compound.js.map