const Web3 = require('web3');
const assert = require('assert');

import DydxProtocol from './protocols/dydx';
import CompoundProtocol from './protocols/compound';

const rariFundControllerAbi = require('./abi/RariFundController.json');

// Init Web3
var web3 = new Web3(new Web3.providers.HttpProvider(process.env.INFURA_ENDPOINT_URL));

// Init DydxProtocol and CompoundProtocol
var dydxProtocol = new DydxProtocol(web3);
var compoundProtocol = new CompoundProtocol(web3);

var currencyCodesByPool = {
    "dYdX": ["DAI", "USDC"],
    "Compound": ["DAI", "USDC", "USDT"]
};

var zeroExCurrencyCodes = ["DAI", "USDC", "USDT", "COMP"];

if (process.argv[2] === "0x") {
    for (var i = 0; i < zeroExCurrencyCodes.length; i++) unsetTokenAllowanceTo0x(zeroExCurrencyCodes[i]);
} else {
    assert(currencyCodesByPool[process.argv[2]]);
    for (var i = 0; i < currencyCodesByPool[process.argv[2]].length; i++) unsetTokenAllowanceToPool(process.argv[2], currencyCodesByPool[process.argv[2]][i]);
}

async function unsetTokenAllowanceToPool(poolName, currencyCode) {
    console.log("Setting zero token allowance for", currencyCode, "on", poolName);

    try {
        var txid = await approveFundsToPool(poolName, currencyCode, web3.utils.toBN(0));
    } catch (error) {
        console.log("Failed to set zero token allowance for", currencyCode, "on", poolName);
    }
    
    console.log("Zero token allowance set successfully for", currencyCode, "on", poolName, ":", txid);
}

async function unsetTokenAllowanceTo0x(currencyCode) {
    console.log("Setting zero token allowance for", currencyCode, "on 0x");

    try {
        var txid = await approveFundsTo0x(currencyCode, web3.utils.toBN(0));
    } catch (error) {
        console.log("Failed to set zero token allowance for", currencyCode, "on 0x");
    }
    
    console.log("Zero token allowance set successfully for", currencyCode, "on 0x:", txid);
}

async function approveFundsToPool(poolName, currencyCode, amountBN) {
    var fundControllerContract = new web3.eth.Contract(rariFundControllerAbi, process.env.ETHEREUM_FUND_CONTROLLER_CONTRACT_ADDRESS);

    // Create depositToPool transaction
    var data = fundControllerContract.methods.approveToPool(poolName == "Compound" ? 1 : 0, currencyCode, amountBN).encodeABI();

    // Build transaction
    var tx = {
        from: process.env.ETHEREUM_ADMIN_ACCOUNT,
        to: process.env.ETHEREUM_FUND_CONTROLLER_CONTRACT_ADDRESS,
        value: 0,
        data: data,
        nonce: await web3.eth.getTransactionCount(process.env.ETHEREUM_ADMIN_ACCOUNT)
    };

    if (process.env.NODE_ENV !== "production") console.log("Approving", amountBN.toString(), currencyCode, "funds to", poolName, ":", tx);

    // Estimate gas for transaction
    try {
        tx["gas"] = await web3.eth.estimateGas(tx);
    } catch (error) {
        throw "Failed to estimate gas before signing and sending transaction for approveToPool of " + currencyCode + " to " + poolName + ": " + error;
    }
    
    // Sign transaction
    try {
        var signedTx = await web3.eth.accounts.signTransaction(tx, process.env.ETHEREUM_ADMIN_PRIVATE_KEY);
    } catch (error) {
        throw "Error signing transaction for approveToPool of " + currencyCode + " to " + poolName + ": " + error;
    }

    // Send transaction
    try {
        var sentTx = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    } catch (error) {
        throw "Error sending transaction for approveToPool of " + currencyCode + " to " + poolName + ": " + error;
    }
    
    console.log("Successfully approved", currencyCode, "funds to", poolName, ":", sentTx);
    return sentTx;
}

async function approveFundsTo0x(currencyCode, amountBN) {
    var fundControllerContract = new web3.eth.Contract(rariFundControllerAbi, process.env.ETHEREUM_FUND_CONTROLLER_CONTRACT_ADDRESS);

    // Create depositToPool transaction
    var data = fundControllerContract.methods.approveTo0x(currencyCode, amountBN).encodeABI();

    // Build transaction
    var tx = {
        from: process.env.ETHEREUM_ADMIN_ACCOUNT,
        to: process.env.ETHEREUM_FUND_CONTROLLER_CONTRACT_ADDRESS,
        value: 0,
        data: data,
        nonce: await web3.eth.getTransactionCount(process.env.ETHEREUM_ADMIN_ACCOUNT)
    };

    if (process.env.NODE_ENV !== "production") console.log("Approving", amountBN.toString(), currencyCode, "funds to 0x:", tx);

    // Estimate gas for transaction
    try {
        tx["gas"] = await web3.eth.estimateGas(tx);
    } catch (error) {
        throw "Failed to estimate gas before signing and sending transaction for approveTo0x of " + currencyCode + ": " + error;
    }
    
    // Sign transaction
    try {
        var signedTx = await web3.eth.accounts.signTransaction(tx, process.env.ETHEREUM_ADMIN_PRIVATE_KEY);
    } catch (error) {
        throw "Error signing transaction for approveTo0x of " + currencyCode + ": " + error;
    }

    // Send transaction
    try {
        var sentTx = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    } catch (error) {
        throw "Error sending transaction for approveTo0x of " + currencyCode + ": " + error;
    }
    
    console.log("Successfully approved", currencyCode, "funds to 0x:", sentTx);
    return sentTx;
}
