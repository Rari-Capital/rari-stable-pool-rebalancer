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
const Web3 = require('web3');
const assert = require('assert');
const dydx_1 = __importDefault(require("./protocols/dydx"));
const compound_1 = __importDefault(require("./protocols/compound"));
const rariFundControllerAbi = require('./abi/RariFundController.json');
// Init Web3
var web3 = new Web3(new Web3.providers.HttpProvider(process.env.INFURA_ENDPOINT_URL));
// Init DydxProtocol and CompoundProtocol
var dydxProtocol = new dydx_1.default(web3);
var compoundProtocol = new compound_1.default(web3);
var currencyCodesByPool = {
    "dYdX": ["DAI", "USDC"],
    "Compound": ["DAI", "USDC", "USDT"]
};
var zeroExCurrencyCodes = ["DAI", "USDC", "USDT", "COMP"];
if (process.argv[2] === "0x") {
    for (var i = 0; i < zeroExCurrencyCodes.length; i++)
        unsetTokenAllowanceTo0x(zeroExCurrencyCodes[i]);
}
else {
    assert(currencyCodesByPool[process.argv[2]]);
    for (var i = 0; i < currencyCodesByPool[process.argv[2]].length; i++)
        unsetTokenAllowanceToPool(process.argv[2], currencyCodesByPool[process.argv[2]][i]);
}
function unsetTokenAllowanceToPool(poolName, currencyCode) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Setting zero token allowance for", currencyCode, "on", poolName);
        try {
            var txid = yield approveFundsToPool(poolName, currencyCode, web3.utils.toBN(0));
        }
        catch (error) {
            console.log("Failed to set zero token allowance for", currencyCode, "on", poolName);
        }
        console.log("Zero token allowance set successfully for", currencyCode, "on", poolName, ":", txid);
    });
}
function unsetTokenAllowanceTo0x(currencyCode) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Setting zero token allowance for", currencyCode, "on 0x");
        try {
            var txid = yield approveFundsTo0x(currencyCode, web3.utils.toBN(0));
        }
        catch (error) {
            console.log("Failed to set zero token allowance for", currencyCode, "on 0x");
        }
        console.log("Zero token allowance set successfully for", currencyCode, "on 0x:", txid);
    });
}
function approveFundsToPool(poolName, currencyCode, amountBN) {
    return __awaiter(this, void 0, void 0, function* () {
        var fundControllerContract = new web3.eth.Contract(rariFundControllerAbi, process.env.ETHEREUM_FUND_CONTROLLER_CONTRACT_ADDRESS);
        // Create depositToPool transaction
        var data = fundControllerContract.methods.approveToPool(poolName == "Compound" ? 1 : 0, currencyCode, amountBN).encodeABI();
        // Build transaction
        var tx = {
            from: process.env.ETHEREUM_ADMIN_ACCOUNT,
            to: process.env.ETHEREUM_FUND_CONTROLLER_CONTRACT_ADDRESS,
            value: 0,
            data: data,
            nonce: yield web3.eth.getTransactionCount(process.env.ETHEREUM_ADMIN_ACCOUNT)
        };
        if (process.env.NODE_ENV !== "production")
            console.log("Approving", amountBN.toString(), currencyCode, "funds to", poolName, ":", tx);
        // Estimate gas for transaction
        try {
            tx["gas"] = yield web3.eth.estimateGas(tx);
        }
        catch (error) {
            throw "Failed to estimate gas before signing and sending transaction for approveToPool of " + currencyCode + " to " + poolName + ": " + error;
        }
        // Sign transaction
        try {
            var signedTx = yield web3.eth.accounts.signTransaction(tx, process.env.ETHEREUM_ADMIN_PRIVATE_KEY);
        }
        catch (error) {
            throw "Error signing transaction for approveToPool of " + currencyCode + " to " + poolName + ": " + error;
        }
        // Send transaction
        try {
            var sentTx = yield web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        }
        catch (error) {
            throw "Error sending transaction for approveToPool of " + currencyCode + " to " + poolName + ": " + error;
        }
        console.log("Successfully approved", currencyCode, "funds to", poolName, ":", sentTx);
        return sentTx;
    });
}
function approveFundsTo0x(currencyCode, amountBN) {
    return __awaiter(this, void 0, void 0, function* () {
        var fundControllerContract = new web3.eth.Contract(rariFundControllerAbi, process.env.ETHEREUM_FUND_CONTROLLER_CONTRACT_ADDRESS);
        // Create depositToPool transaction
        var data = fundControllerContract.methods.approveTo0x(currencyCode, amountBN).encodeABI();
        // Build transaction
        var tx = {
            from: process.env.ETHEREUM_ADMIN_ACCOUNT,
            to: process.env.ETHEREUM_FUND_CONTROLLER_CONTRACT_ADDRESS,
            value: 0,
            data: data,
            nonce: yield web3.eth.getTransactionCount(process.env.ETHEREUM_ADMIN_ACCOUNT)
        };
        if (process.env.NODE_ENV !== "production")
            console.log("Approving", amountBN.toString(), currencyCode, "funds to 0x:", tx);
        // Estimate gas for transaction
        try {
            tx["gas"] = yield web3.eth.estimateGas(tx);
        }
        catch (error) {
            throw "Failed to estimate gas before signing and sending transaction for approveTo0x of " + currencyCode + ": " + error;
        }
        // Sign transaction
        try {
            var signedTx = yield web3.eth.accounts.signTransaction(tx, process.env.ETHEREUM_ADMIN_PRIVATE_KEY);
        }
        catch (error) {
            throw "Error signing transaction for approveTo0x of " + currencyCode + ": " + error;
        }
        // Send transaction
        try {
            var sentTx = yield web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        }
        catch (error) {
            throw "Error sending transaction for approveTo0x of " + currencyCode + ": " + error;
        }
        console.log("Successfully approved", currencyCode, "funds to 0x:", sentTx);
        return sentTx;
    });
}
//# sourceMappingURL=emergencyUnsetAllowances.js.map