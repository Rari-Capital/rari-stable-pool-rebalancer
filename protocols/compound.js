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
const cErc20DelegatorAbi = require('./compound/cerc20-delegator-abi');
class CompoundProtocol {
    constructor(web3) {
        this.cErc20Contracts = {
            "DAI": "0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643"
        };
        this.web3 = web3;
    }
    getAprs(currencyCodes) {
        return __awaiter(this, void 0, void 0, function* () {
            var aprs = {};
            // For each currency
            for (var i = 0; i < currencyCodes.length; i++) {
                if (!this.cErc20Contracts[currencyCodes[i]])
                    continue;
                // @ts-ignore: Argument of type [...] is not assignable to parameter of type 'AbiItem | AbiItem[]'.
                var cErc20Contract = new this.web3.eth.Contract(cErc20DelegatorAbi, this.cErc20Contracts[currencyCodes[i]]);
                try {
                    var supplyRatePerBlock = yield cErc20Contract.methods.supplyRatePerBlock().call();
                }
                catch (error) {
                    throw "Failed to get Compound " + currencyCodes[i] + " supplyRatePerBlock: " + error;
                }
                // TODO: Difference in average block time (assumed here to be 14 seconds) is likely the answer to the question of why we get here different from the answer we get at https://compound.finance/markets and https://api.compound.finance/api/v2/ctoken
                // TODO: Use big integers for Compound APR calculations
                var apr = ((60 * 60 * 24 * 365) / 14) * (supplyRatePerBlock / 1e18);
                aprs[currencyCodes[i]] = apr;
            }
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
                balances[currencyCodes[i]] = web3.utils.toBN(balanceOfUnderlying);
            }
            return balances;
        });
    }
}
module.exports = CompoundProtocol;
//# sourceMappingURL=compound.js.map