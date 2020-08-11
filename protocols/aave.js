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
const web3_1 = __importDefault(require("web3"));
const aTokenAbi = JSON.parse(fs_1.default.readFileSync(__dirname + '/aave/AToken.json', 'utf8'));
const lendingPoolAbi = JSON.parse(fs_1.default.readFileSync(__dirname + '/aave/LendingPool.json', 'utf8'));
const lendingPoolCoreAbi = JSON.parse(fs_1.default.readFileSync(__dirname + '/aave/LendingPoolCore.json', 'utf8'));
const iReserveInterestRateStrategyAbi = JSON.parse(fs_1.default.readFileSync(__dirname + '/aave/IReserveInterestRateStrategy.json', 'utf8'));
class AaveProtocol {
    constructor(web3) {
        this.erc20Contracts = {
            "DAI": "0x6B175474E89094C44Da98b954EedeAC495271d0F",
            "USDC": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            "USDT": "0xdac17f958d2ee523a2206206994597c13d831ec7",
            "TUSD": "0x0000000000085d4780B73119b644AE5ecd22b376",
            "BUSD": "0x4Fabb145d64652a948d72533023f6E7A623C7C53",
            "sUSD": "0x57Ab1ec28D129707052df4dF418D58a2D46d5f51"
        };
        this.aTokenContracts = {
            "DAI": "0xfC1E690f61EFd961294b3e1Ce3313fBD8aa4f85d",
            "USDC": "0x9bA00D6856a4eDF4665BcA2C2309936572473B7E",
            "USDT": "0x71fc860F7D3A592A4a98740e39dB31d25db65ae8",
            "TUSD": "0x4da9b813057d04baef4e5800e36083717b4a0341",
            "BUSD": "0x6Ee0f7BB50a54AB5253dA0667B0Dc2ee526C30a8",
            "sUSD": "0x625ae63000f46200499120b906716420bd059240"
        };
        this.lendingPoolContract = "0x398ec7346dcd622edc5ae82352f02be94c62d119";
        this.lendingPoolCoreContract = "0x3dfd23a6c5e8bbcfc9581d2e864a68feb6a076d3";
        this.web3 = web3;
    }
    predictApr(currencyCode, supplyWeiDifferenceBN) {
        return __awaiter(this, void 0, void 0, function* () {
            var underlyingTokenAddress = this.erc20Contracts[currencyCode];
            // TODO: Remove @ts-ignore below
            // @ts-ignore: Argument of type [...] is not assignable to parameter of type 'AbiItem | AbiItem[]'.
            var lendingPoolContract = new this.web3.eth.Contract(lendingPoolAbi, this.lendingPoolContract);
            try {
                var reserveData = yield lendingPoolContract.methods.getReserveData(underlyingTokenAddress).call();
            }
            catch (error) {
                throw "Error when getting Aave reserve data of " + underlyingTokenAddress + ": " + error;
            }
            // TODO: Remove @ts-ignore below
            // @ts-ignore: Argument of type [...] is not assignable to parameter of type 'AbiItem | AbiItem[]'.
            var lendingPoolCoreContract = new this.web3.eth.Contract(lendingPoolCoreAbi, this.lendingPoolCoreContract);
            try {
                var reserveInterestRateStrategyAddress = yield lendingPoolCoreContract.methods.getReserveInterestRateStrategyAddress(underlyingTokenAddress).call();
            }
            catch (error) {
                throw "Error when getting Aave ReserveInterestRateStrategyAddress of " + underlyingTokenAddress + ": " + error;
            }
            // TODO: Remove @ts-ignore below
            // @ts-ignore: Argument of type [...] is not assignable to parameter of type 'AbiItem | AbiItem[]'.
            var iReserveInterestRateStrategyContract = new this.web3.eth.Contract(iReserveInterestRateStrategyAbi, reserveInterestRateStrategyAddress);
            try {
                var interestRates = yield iReserveInterestRateStrategyContract.methods.calculateInterestRates(underlyingTokenAddress, web3_1.default.utils.toBN(reserveData.availableLiquidity).add(supplyWeiDifferenceBN.gt(web3_1.default.utils.toBN(0)) ? supplyWeiDifferenceBN : web3_1.default.utils.toBN(0)).sub(supplyWeiDifferenceBN.isNeg() ? supplyWeiDifferenceBN.abs() : web3_1.default.utils.toBN(0)), reserveData.totalBorrowsStable, reserveData.totalBorrowsVariable, reserveData.currentAverageStableBorrowRate).call();
            }
            catch (error) {
                throw "Error when getting Aave ReserveInterestRateStrategy.calculateInterestRates on " + underlyingTokenAddress + ": " + error;
            }
            return parseFloat(this.web3.utils.toBN(interestRates.liquidityRate).div(this.web3.utils.toBN(1e9)).toString()) / 1e18;
        });
    }
    getApr(currencyCode) {
        return __awaiter(this, void 0, void 0, function* () {
            var erc20Contract = this.erc20Contracts[currencyCode];
            // TODO: Remove @ts-ignore below
            // @ts-ignore: Argument of type [...] is not assignable to parameter of type 'AbiItem | AbiItem[]'.
            var lendingPoolCoreContract = new this.web3.eth.Contract(lendingPoolCoreAbi, this.lendingPoolCoreContract);
            try {
                var apyRay = yield lendingPoolCoreContract.methods.getReserveCurrentLiquidityRate(erc20Contract).call();
            }
            catch (error) {
                throw "Error when checking Aave APY of " + erc20Contract + ": " + error;
            }
            return parseFloat(this.web3.utils.toBN(apyRay).div(this.web3.utils.toBN(1e9)).toString()) / 1e18;
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
            if (!this.aTokenContracts[currencyCode])
                throw "Invalid currency code supplied to AaveProtocol.getUnderlyingBalance";
            // TODO: Remove @ts-ignore below
            // @ts-ignore: Argument of type [...] is not assignable to parameter of type 'AbiItem | AbiItem[]'.
            var aTokenContract = new this.web3.eth.Contract(aTokenAbi, this.aTokenContracts[currencyCode]);
            try {
                var balanceOfUnderlying = yield aTokenContract.methods.balanceOf(process.env.ETHEREUM_FUND_CONTROLLER_CONTRACT_ADDRESS).call();
            }
            catch (error) {
                throw "Error when checking underlying Aave balance of " + currencyCode + ": " + error;
            }
            if (process.env.NODE_ENV !== "production")
                console.log("AaveProtocol.getUnderlyingBalance got", balanceOfUnderlying, currencyCode);
            return this.web3.utils.toBN(balanceOfUnderlying);
        });
    }
    getUnderlyingBalances(currencyCodes) {
        return __awaiter(this, void 0, void 0, function* () {
            var balances = {};
            // For each currency
            for (var i = 0; i < currencyCodes.length; i++) {
                try {
                    balances[currencyCodes[i]] = yield this.getUnderlyingBalance(currencyCodes[i]);
                }
                catch (error) {
                    console.log(error);
                }
            }
            return balances;
        });
    }
}
exports.default = AaveProtocol;
//# sourceMappingURL=aave.js.map