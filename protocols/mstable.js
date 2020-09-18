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
const https_1 = __importDefault(require("https"));
const web3_1 = __importDefault(require("web3"));
const mAssetAbi = JSON.parse(fs_1.default.readFileSync(__dirname + '/mstable/Masset.json', 'utf8'));
const savingsContractAbi = JSON.parse(fs_1.default.readFileSync(__dirname + '/mstable/SavingsContract.json', 'utf8'));
const mAssetValidationHelperAbi = JSON.parse(fs_1.default.readFileSync(__dirname + '/mstable/MassetValidationHelper.json', 'utf8'));
class MStableProtocol {
    constructor(web3) {
        this.mUsdTokenContract = "0xe2f2a5c287993345a840db3b0845fbc70f5935a5";
        this.savingsContract = "0xcf3f73290803fc04425bee135a4caeb2bab2c2a1";
        this.mAssetValidationHelperContract = "0xabcc93c3be238884cc3309c19afd128fafc16911";
        this.web3 = web3;
    }
    getSwapFee() {
        return __awaiter(this, void 0, void 0, function* () {
            // TODO: Remove @ts-ignore below
            // @ts-ignore: Argument of type [...] is not assignable to parameter of type 'AbiItem | AbiItem[]'.
            var mUsdTokenContract = new this.web3.eth.Contract(mAssetAbi, this.mUsdTokenContract);
            try {
                var swapFee = yield mUsdTokenContract.methods.swapFee().call();
            }
            catch (error) {
                throw "Error when checking mUSD swap fee: " + error;
            }
            if (process.env.NODE_ENV !== "production")
                console.log("MStableProtocol.getSwapFee got", swapFee / 1e18, "%");
            return this.web3.utils.toBN(swapFee);
        });
    }
    getMaxSwap(inputTokenAddress, outputTokenAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            // TODO: Remove @ts-ignore below
            // @ts-ignore: Argument of type [...] is not assignable to parameter of type 'AbiItem | AbiItem[]'.
            var mAssetValidationHelperContract = new this.web3.eth.Contract(mAssetValidationHelperAbi, this.mAssetValidationHelperContract);
            try {
                var data = yield mAssetValidationHelperContract.methods.getMaxSwap(this.mUsdTokenContract, inputTokenAddress, outputTokenAddress).call();
            }
            catch (error) {
                throw "Error when checking mUSD max swap: " + error;
            }
            if (process.env.NODE_ENV !== "production")
                console.log("MStableProtocol.getMaxSwap got", data);
            return data;
        });
    }
    getRedeemValidity(inputAmountBN, outputTokenAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            // TODO: Remove @ts-ignore below
            // @ts-ignore: Argument of type [...] is not assignable to parameter of type 'AbiItem | AbiItem[]'.
            var mAssetValidationHelperContract = new this.web3.eth.Contract(mAssetValidationHelperAbi, this.mAssetValidationHelperContract);
            try {
                var data = yield mAssetValidationHelperContract.methods.getRedeemValidity(this.mUsdTokenContract, inputAmountBN, outputTokenAddress).call();
            }
            catch (error) {
                throw "Error when checking mUSD redeem validity: " + error;
            }
            if (process.env.NODE_ENV !== "production")
                console.log("MStableProtocol.getRedeemValidity got", data);
            return data;
        });
    }
    predictApr(supplyWeiDifferenceBN) {
        return __awaiter(this, void 0, void 0, function* () {
            // TODO: MStableProtocol.predictApr
            return this.getApr();
        });
    }
    // Based on calculateApy at https://github.com/mstable/mStable-app/blob/v1.8.1/src/web3/hooks.ts#L84
    calculateApy(startTimestamp, startExchangeRate, endTimestamp, endExchangeRate) {
        const SCALE = 1e18;
        const YEAR_BN = 365 * 24 * 60 * 60;
        const rateDiff = endExchangeRate * SCALE / startExchangeRate - SCALE;
        const timeDiff = endTimestamp - startTimestamp;
        const portionOfYear = timeDiff * SCALE / YEAR_BN;
        const portionsInYear = SCALE / portionOfYear;
        const rateDecimals = (SCALE + rateDiff) / SCALE;
        if (rateDecimals > 0) {
            const diff = Math.pow(rateDecimals, portionsInYear);
            const parsed = diff * SCALE;
            return web3_1.default.utils.toBN((parsed - SCALE).toFixed(0)) || web3_1.default.utils.toBN(0);
        }
        return web3_1.default.utils.toBN(0);
    }
    getApr() {
        return __awaiter(this, void 0, void 0, function* () {
            // TODO: Get exchange rates from contracts instead of The Graph
            // TODO: Use instantaneous APY instead of 24-hour APY?
            // Calculate APY with calculateApy using exchange rates from The Graph
            var epochNow = Math.floor((new Date()).getTime() / 1000);
            var epoch24HrsAgo = epochNow - 86400;
            var body = JSON.stringify({
                "operationName": "ExchangeRates",
                "variables": { "day0": epoch24HrsAgo, "day1": epochNow },
                "query": "query ExchangeRates($day0: Int!, $day1: Int!) {\n  day0: exchangeRates(where: {timestamp_lt: $day0}, orderDirection: desc, orderBy: timestamp, first: 1) {\n    ...ER\n    __typename\n  }\n  day1: exchangeRates(where: {timestamp_lt: $day1}, orderDirection: desc, orderBy: timestamp, first: 1) {\n    ...ER\n    __typename\n  }\n}\n\nfragment ER on ExchangeRate {\n  exchangeRate\n  timestamp\n  __typename\n}\n"
            });
            return new Promise((resolve, reject) => {
                var req = https_1.default.request('https://api.thegraph.com/subgraphs/name/mstable/mstable-protocol', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': body.length
                    }
                }, (resp) => {
                    let data = '';
                    // A chunk of data has been recieved
                    resp.on('data', (chunk) => {
                        data += chunk;
                    });
                    // The whole response has been received
                    resp.on('end', () => {
                        var decoded = JSON.parse(data);
                        if (!decoded || !decoded.data)
                            return reject("Failed to decode exchange rates from The Graph when calculating mStable 24-hour APY");
                        resolve(parseFloat(this.calculateApy(epoch24HrsAgo, decoded.data.day0[0].exchangeRate, epochNow, decoded.data.day1[0].exchangeRate).toString()) / 1e18);
                    });
                });
                req.on("error", (err) => {
                    reject("Error requesting exchange rates from The Graph when calculating mStable 24-hour APY: " + err.message);
                });
                req.write(body);
                req.end();
            });
        });
    }
    getMUsdSavingsBalance() {
        return __awaiter(this, void 0, void 0, function* () {
            // TODO: Remove @ts-ignore below
            // @ts-ignore: Argument of type [...] is not assignable to parameter of type 'AbiItem | AbiItem[]'.
            var savingsContract = new this.web3.eth.Contract(savingsContractAbi, this.savingsContract);
            try {
                var creditBalance = yield savingsContract.methods.creditBalances(process.env.ETHEREUM_FUND_CONTROLLER_CONTRACT_ADDRESS).call();
            }
            catch (error) {
                throw "Error when checking mStable savings credit balance to calculate mUSD savings balance: " + error;
            }
            try {
                var exchangeRate = yield savingsContract.methods.exchangeRate().call();
            }
            catch (error) {
                throw "Error when checking mStable savings exchange rate to calculate mUSD savings balance: " + error;
            }
            var balanceBN = this.web3.utils.toBN(creditBalance).mul(this.web3.utils.toBN(exchangeRate)).div(this.web3.utils.toBN(1e18));
            if (process.env.NODE_ENV !== "production")
                console.log("MStableProtocol.getMUsdSavingsBalance got", balanceBN.toString(), "mUSD");
            return balanceBN;
        });
    }
    getMUsdBalance() {
        return __awaiter(this, void 0, void 0, function* () {
            // TODO: Remove @ts-ignore below
            // @ts-ignore: Argument of type [...] is not assignable to parameter of type 'AbiItem | AbiItem[]'.
            var mUsdTokenContract = new this.web3.eth.Contract(mAssetAbi, this.mUsdTokenContract);
            try {
                var balance = yield mUsdTokenContract.methods.balanceOf(process.env.ETHEREUM_FUND_CONTROLLER_CONTRACT_ADDRESS).call();
            }
            catch (error) {
                throw "Error when checking mUSD balance: " + error;
            }
            if (process.env.NODE_ENV !== "production")
                console.log("MStableProtocol.getMUsdBalance got", balance, "mUSD");
            return this.web3.utils.toBN(balance);
        });
    }
}
exports.default = MStableProtocol;
//# sourceMappingURL=mstable.js.map