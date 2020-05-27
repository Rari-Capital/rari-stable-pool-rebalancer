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
const cErc20DelegatorAbi = require('./compound/CErc20Delegator.json');
class CompoundProtocol {
    constructor(web3) {
        this.cErc20Contracts = {
            "DAI": "0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643"
        };
        this.web3 = web3;
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
    getUnderlyingBalances(currencyCodes) {
        return __awaiter(this, void 0, void 0, function* () {
            var balances = {};
            // For each currency
            for (var i = 0; i < currencyCodes.length; i++) {
                if (!this.cErc20Contracts[currencyCodes[i]])
                    continue;
                // @ts-ignore: Argument of type [...] is not assignable to parameter of type 'AbiItem | AbiItem[]'.
                var cErc20Contract = new this.web3.eth.Contract(cErc20DelegatorAbi, this.cErc20Contracts[currencyCodes[i]]);
                try {
                    var balanceOfUnderlying = yield cErc20Contract.methods.balanceOfUnderlying(process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS).call();
                }
                catch (error) {
                    console.error("Error when checking underlying Compound balance of", currencyCodes[i], ":", error);
                    continue;
                }
                if (process.env.NODE_ENV !== "production")
                    console.log("CompoundProtocol.getUnderlyingBalances got", balanceOfUnderlying, currencyCodes[i]);
                balances[currencyCodes[i]] = this.web3.utils.toBN(balanceOfUnderlying);
            }
            return balances;
        });
    }
}
exports.default = CompoundProtocol;
//# sourceMappingURL=compound.js.map