var Web3 = require('web3');
const assert = require('assert');

const DyDxProtocol = require('./protocols/dydx');
const CompoundProtocol = require('./protocols/compound');

// Init Web3
var web3 = new Web3(new Web3.providers.HttpProvider(process.env.INFURA_ENDPOINT_URL));

// Init DyDxProtocol and CompoundProtocol
var dydxProtocol = dydxProtocol = new DyDxProtocol(web3);
var compoundProtocol = compoundProtocol = new CompoundProtocol(web3);

var currencyCodesByPool = {
    "dYdX": ["DAI"],
    "Compound": ["DAI"]
};

assert(currencyCodesByPool[process.argv[2]]);
for (var i = 0; i < currencyCodesByPool[process.argv[2]].length; i++) unsetTokenAllowance(process.argv[2], currencyCodesByPool[process.argv[2]][i]);

async function unsetTokenAllowance(poolName, currencyCode) {
    console.log("Setting zero token allowance for", currencyCode, "on", poolName);

    try {
        var txid = await approveFunds(poolName, currencyCode, web3.utils.toBN(0));
    } catch (error) {
        console.log("Failed to set zero token allowance for", currencyCode, "on", poolName);
    }
    
    console.log("Zero token allowance set successfully for", currencyCode, "on", poolName, ":", txid);
}

async function approveFunds(poolName, currencyCode, amountBN) {
    var fundManagerContract = new web3.eth.Contract(rariFundManagerAbi, process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS);

    // Create depositToPool transaction
    var data = fundManagerContract.methods.approveToPool(poolName == "Compound" ? 1 : 0, currencyCode, amountBN).encodeABI();

    // Build transaction
    var tx = {
        from: process.env.ETHEREUM_ADMIN_ACCOUNT,
        to: process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS,
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
