var Web3 = require('web3');
const https = require('https');

const erc20Abi = require('./erc20-abi');
const farmerFundManagerAbi = require('./farmer-fund-manager-abi');
const DyDxProtocol = require('./protocols/dydx');
const CompoundProtocol = require('./protocols/compound');

// Init Web3
var web3 = new Web3(new Web3.providers.HttpProvider(process.env.INFURA_ENDPOINT_URL));

// Init DyDxProtocol and CompoundProtocol
var dydxProtocol = dydxProtocol = new DyDxProtocol(web3);
var compoundProtocol = compoundProtocol = new CompoundProtocol(web3);

// Mock currency and pool database
var db = {
    currencies: {
        "ETH": {
            fundManagerContractBalanceBN: web3.utils.toBN(0),
            decimals: 18,
            usdRate: 0
        },
        "DAI": {
            fundManagerContractBalanceBN: web3.utils.toBN(0),
            decimals: 18,
            tokenAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
            usdRate: 0
        }
    },
    pools: {
        "dYdX": {
            currencies: {
                "DAI": {
                    poolBalanceBN: web3.utils.toBN(0),
                    supplyApr: 0
                }
            }
        }
    }
};

async function startCycle() {
    await checkAllBalances();
    await getAllAprs();
    if (parseInt(process.env.AUTOMATIC_SUPPLY_BALANCING_ENABLED)) await tryBalanceSupplyAllCurrencies();
    setTimeout(startCycle, 60 * 1000);
}

async function onLoad() {
    // Start updating USD rates regularly
    await updateCurrencyUsdRates();
    setInterval(function() { updateCurrencyUsdRates(); }, (process.env.UPDATE_CURRENCY_USD_RATES_INTERVAL_SECONDS ? parseFloat(process.env.UPDATE_CURRENCY_USD_RATES_INTERVAL_SECONDS) : 60) * 1000);

    // Start cycle of checking wallet balances and pool APRs and trying to balance supply of all currencies
    startCycle();
}

onLoad();

/* POOL APR CHECKING */

async function getAllAprs() {
    // Get APRs for all pools
    for (const key of Object.keys(db.pools)) {
        try {
            if (key === "dYdX") var aprs = await dydxProtocol.getAprs(Object.keys(db.pools[key].currencies));
            else if (key == "Compound") var aprs = await compoundProtocol.getAprs(Object.keys(db.pools[key].currencies));
            else return console.error("Failed to get APRs for unrecognized pool:", key);
        } catch (error) {
            console.error("Failed to get APRs for", key, "pool:", error);
            return;
        }
        
        for (const key2 of Object.keys(aprs)) {
            db.pools[key].currencies[key2].supplyApr = aprs[key2];
        }
    }
}

/* CURRENCY USD RATE UPDATING */

async function updateCurrencyUsdRates() {
    var currencyCodes = Object.keys(db.currencies);
    
    https.get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=' + currencyCodes.join(','), {
        headers: {
            'X-CMC_PRO_API_KEY': process.env.CMC_PRO_API_KEY
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
            if (!decoded || !decoded.data) return console.error("Failed to decode USD exchange rates from CoinMarketCap");

            for (const key of Object.keys(decoded.data)) {
                db.currencies[key].usdRate = decoded.data[key].quote.USD.price;
            }
        });
    }).on("error", (err) => {
        console.error("Error requesting currency rates from CoinMarketCap:", err.message);
    });
}

/* POOL BALANCING */

async function getIdealBalances(currencyCode, totalBalanceDifferenceBN = null) {
    // TODO: As of now, we simply put all funds in the pool with the highest interest rate and assume that we aren't supplying enough funds to push that rate below another one.
    // TODO: Ideally, we calculate ideal balances based on current interest rate parameters so that we balance our funds across the pools with the highest rates so that we still receive as much interest as possible even when we have enough total funds to push the best interest rate below the next best.
    // TODO: Add balance to fund with most APR until that APR hits the second highest, then add balance to both of them, decreasing them both equally, until they hit the third highest
    
    // Calculate totalBalance: start with fundManagerContractBalance
    var totalBalanceBN = db.currencies[currencyCode].fundManagerContractBalanceBN;
    
    // Add pool balances to totalBalance
    for (const poolName of Object.keys(db.pools)) {
        if (db.pools[poolName].currencies[currencyCode]) totalBalanceBN.iadd(db.pools[poolName].currencies[currencyCode].poolBalanceBN);
    }
    
    // Add difference to totalBalance if supplied to this function
    if (totalBalanceDifferenceBN !== null) totalBalanceBN.iadd(totalBalanceDifferenceBN);
    if (totalBalanceBN.isNeg()) throw "Total balance would be negative";
    
    // Get current currency's APRs for all pools that support it
    var bestPoolName = null;
    var bestPoolApr = 0;
    var bestPoolCurrentBalanceBN = web3.utils.toBN(0);
    
    // Find best pool (to put entire balance in)
    for (const poolName of Object.keys(db.pools)) {
        if (db.pools[poolName].currencies[currencyCode] && db.pools[poolName].currencies[currencyCode].supplyApr > bestPoolApr) {
            bestPoolName = poolName;
            bestPoolApr = db.pools[poolName].currencies[currencyCode].supplyApr;
            bestPoolCurrentBalanceBN = db.pools[poolName].currencies[currencyCode].poolBalanceBN;
        }
    }
    
    if (bestPoolName === null) throw "Failed to get best pool";

    var poolBalances = [
        { pool: bestPoolName, apr: bestPoolApr, balanceBN: totalBalanceBN, balanceDifferenceBN: totalBalanceBN.sub(bestPoolCurrentBalanceBN) }
    ];
    
    // Set balances to 0 for other pools
    for (const poolName of Object.keys(db.pools)) {
        if (poolName !== bestPoolName && db.pools[poolName].currencies[currencyCode])
            poolBalances.push({ pool: poolName, apr: db.pools[poolName].currencies[currencyCode].supplyApr, balanceBN: web3.utils.toBN(0), balanceDifferenceBN: web3.utils.toBN(0).sub(db.pools[poolName].currencies[currencyCode].poolBalanceBN) });
    }
    
    return poolBalances;
}

// TODO: Don't rebalance funds right after a withdrawal before balances have updated (and confirmed?)
var currenciesBalancingSupply = {};
var currenciesLastTimeBalanced = {};

async function tryBalanceSupplyAllCurrencies() {
    for (const key of Object.keys(db.currencies)) if (key !== "ETH") await tryBalanceSupplyByCurrency(key);
}

async function getSumPendingWithdrawals(currencyCode) {
    // Get sum of pending withdrawals
    if (process.env.NODE_ENV !== "production") console.log("Checking for pending withdrawals for", currencyCode);
    var fundManagerContract = new web3.eth.Contract(farmerFundManagerAbi, process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS);
    var countPendingWithdrawals = await fundManagerContract.methods.countPendingWithdrawals(currencyCode).call();
    var sumPendingWithdrawalsBN = web3.utils.toBN(0);

    if (countPendingWithdrawals > 0) {
        for (var i = 0; i < countPendingWithdrawals; i++) {
            var withdrawalAmount = await fundManagerContract.methods.getPendingWithdrawalAmount(currencyCode, i).call();
            sumPendingWithdrawalsBN.iadd(web3.utils.toBN(withdrawalAmount));
            console.log("Leaving", withdrawalAmount, currencyCode, "in FundManager for withdrawal");
        }

        console.log("Leaving a total of", sumPendingWithdrawalsBN.toString(), currencyCode, "in FundManager for withdrawals");
    }
    
    return sumPendingWithdrawalsBN;
}

async function processPendingWithdrawals(currencyCode) {
    var fundManagerContract = new web3.eth.Contract(farmerFundManagerAbi, process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS);

    // Create processPendingWithdrawals transaction
    var data = fundManagerContract.methods.processPendingWithdrawals(currencyCode).encodeABI();

    // Build transaction
    var tx = {
        from: process.env.ETHEREUM_ADMIN_ACCOUNT,
        to: process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS,
        value: 0,
        data: data,
        nonce: await web3.eth.getTransactionCount(process.env.ETHEREUM_ADMIN_ACCOUNT)
    };

    if (process.env.NODE_ENV !== "production") console.log("Processing pending withdrawals for", currencyCode, ":", tx);

    // Estimate gas for transaction
    try {
        tx["gas"] = await web3.eth.estimateGas(tx);
    } catch (error) {
        throw "Failed to estimate gas before signing and sending transaction for processPendingWithdrawals for " + currencyCode + ": " + error;
    }
    
    // Sign transaction
    try {
        var signedTx = await web3.eth.accounts.signTransaction(tx, process.env.ETHEREUM_ADMIN_PRIVATE_KEY);
    } catch (error) {
        throw "Error signing transaction for processPendingWithdrawals for " + currencyCode + ": " + error;
    }

    // Send transaction
    try {
        var sentTx = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    } catch (error) {
        throw "Error sending transaction for processPendingWithdrawals for " + currencyCode + ": " + error;
    }
    
    console.log("Successfully processed pending withdrawals for", currencyCode, ":", sentTx);
    return sentTx;
}

async function tryBalanceSupplyByCurrency(currencyCode) {
    if (currenciesBalancingSupply[currencyCode]) return console.warn("Cannot balance supply for", currencyCode, ": supply balancing already in progress");
    
    currenciesBalancingSupply[currencyCode] = true;
    console.log("Trying to balance supply of", currencyCode);

    // Check withdrawals queue
    var sumPendingWithdrawalsBN = process.env.WITHDRAWAL_QUEUE_ENABLED ? await getSumPendingWithdrawals(currencyCode) : web3.utils.toBN(0);
        
    // Get ideal balances
    try {
        var idealBalances = await getIdealBalances(currencyCode, web3.utils.toBN(0).sub(sumPendingWithdrawalsBN));
    } catch (error) {
        currenciesBalancingSupply[currencyCode] = false;
        return console.error("Failed to get ideal balances when trying to balance supply of", currencyCode, ":", error);
    }
    
    // Check for any changes in ideal balances
    var anyChanges = false;
    for (var i = 0; i < idealBalances.length; i++) if (!idealBalances[i].balanceDifferenceBN.isZero()) anyChanges = true;
    
    if (anyChanges) {
        // Check AUTOMATIC_SUPPLY_BALANCING_MIN_ALGORITHMIC_NET_VALUE if sumPendingWithdrawalsBN is zero
        if (sumPendingWithdrawalsBN.isZero()) {
            // Get expected additional yearly interest
            var expectedAdditionalYearlyInterest = 0;
        
            for (var i = 0; i < idealBalances.length; i++) {
                var balanceDifference = parseInt(idealBalances[i].balanceDifferenceBN.toString()); // TODO: BN.prototype.toNumber replacement
                expectedAdditionalYearlyInterest += balanceDifference * idealBalances[i].apr;
            }
        
            var expectedAdditionalYearlyInterestUsd = expectedAdditionalYearlyInterest / Math.pow(10, db.currencies[currencyCode].decimals) * db.currencies[currencyCode].usdRate;
        
            // Get seconds since last supply balancing (if we don't know the last time, assume it's been one year)
            // TODO: Get currenciesLastTimeBalanced[currencyCode] from supplies collection in database instead of storing in a variable
            var epoch = (new Date()).getTime() / 1000;
            var secondsSinceLastSupplyBalancing = currenciesLastTimeBalanced[currencyCode] ? epoch - currenciesLastTimeBalanced[currencyCode] : 86400 * 365;
        
            // Get max miner fees
            try {
                var maxEthereumMinerFeesBN = await getMaxEthereumMinerFeesForSupplyBalancing(currencyCode, idealBalances);
            } catch (error) {
                return console.error("Failed to check max Ethereum miner fees before balancing supply:", error)
            }
        
            var maxEthereumMinerFees = parseInt(maxEthereumMinerFeesBN.toString()); // TODO: BN.prototype.toNumber replacement
            var maxMinerFeesUsd = maxEthereumMinerFees / Math.pow(10, 18) * db.currencies["ETH"].usdRate;
        
            // Check AUTOMATIC_SUPPLY_BALANCING_MIN_ALGORITHMIC_NET_VALUE
            if (expectedAdditionalYearlyInterestUsd * secondsSinceLastSupplyBalancing / maxMinerFeesUsd < parseFloat(process.env.AUTOMATIC_SUPPLY_BALANCING_MIN_ALGORITHMIC_NET_VALUE)) {
                currenciesBalancingSupply[currencyCode] = false;
                return console.log("Not balancing supply of", currencyCode, "because", expectedAdditionalYearlyInterestUsd, "*", secondsSinceLastSupplyBalancing, "/", maxMinerFeesUsd, "is less than", process.env.AUTOMATIC_SUPPLY_BALANCING_MIN_ALGORITHMIC_NET_VALUE);
            }
    
            console.log("Balancing supply of", currencyCode, "because", expectedAdditionalYearlyInterestUsd, "*", secondsSinceLastSupplyBalancing, "/", maxMinerFeesUsd, "is at least", process.env.AUTOMATIC_SUPPLY_BALANCING_MIN_ALGORITHMIC_NET_VALUE);
        } else console.log("Balancing supply of", currencyCode, "because we have pending withdrawals");

        // Balance supply!
        try {
            await doBalanceSupply(db, currencyCode, idealBalances, maxEthereumMinerFeesBN);
        } catch (error) {
            currenciesBalancingSupply[currencyCode] = false;
            return console.error("Failed to balance supply of", currencyCode, ":", error);
        }

        currenciesLastTimeBalanced[currencyCode] = epoch;
    } else console.log("Not balancing supply of", currencyCode, "because no change in balances");

    // Process pending withdrawals if we have any
    if (sumPendingWithdrawalsBN.gt(web3.utils.toBN(0))) await processPendingWithdrawals(currencyCode);

    currenciesBalancingSupply[currencyCode] = false;
}

async function getMaxEthereumMinerFeesForSupplyBalancing(currencyCode, poolBalances) {
    try {
        var gasPrice = await web3.eth.getGasPrice();
    } catch (error) {
        throw "Failed to check ETH gas price to calculate max Ethereum miner fees before balancing supply: " + error;
    }
    
    var gasNecessary = 0;

    for (var i = 0; i < poolBalances.length; i++) {
        if (poolBalances[i].balanceDifferenceBN.gt(web3.utils.toBN(0))) {
            if (poolBalances[i].pool === "dYdX") gasNecessary += 300000; // TODO: Correct dYdX gas prices
            else if (poolBalances[i].pool === "Compound") gasNecessary += currencyCode === "DAI" ? 300000 : 150000;
            else gasNecessary += 300000; // TODO: Correct default gas price assumption
        } else if (poolBalances[i].balanceDifferenceBN.isNeg()) {
            if (poolBalances[i].pool === "dYdX") gasNecessary += 300000; // TODO: Correct dYdX gas prices
            else if (poolBalances[i].pool === "Compound") gasNecessary += 90000;
            else gasNecessary += 300000; // TODO: Correct default gas price assumption
        }
    }

    return web3.utils.toBN(gasNecessary).mul(web3.utils.toBN(gasPrice));
}

async function doBalanceSupply(db, currencyCode, poolBalances, maxEthereumMinerFeesBN = null) {
    console.log('\x1b[32m%s\x1b[0m', "Starting to balance supply of", currencyCode); // Green color

    // Check that we have enough balance for gas fees
    try {
        var ethereumBalance = await getFundManagerContractEthBalance();
    } catch (error) {
        throw "Failed to check ETH wallet balance to make sure we have enough funds for fees before balancing supply: " + error;
    }
    
    if (maxEthereumMinerFeesBN === null) {
        try {
            maxEthereumMinerFeesBN = await getMaxEthereumMinerFeesForSupplyBalancing(currencyCode, poolBalances);
        } catch (error) {
            throw "Failed to check max Ethereum miner fees before balancing supply: " + error;
        }
    }

    if (web3.utils.toBN(ethereumBalance).lt(maxEthereumMinerFeesBN)) throw "Not enough balance in ETH wallet to cover gas fees to balance supply!"; // TODO: Notify admin well before we run out of ETH for gas

    // Keep track of total balance difference 
    var totalBalanceDifferenceBN = web3.utils.toBN(0);
    
    // Execute all supply removals
    for (var i = 0; i < poolBalances.length; i++) if (poolBalances[i].balanceDifferenceBN.isNeg()) {
        // TODO: Don't execute a supply removal if not above a threshold
        try {
            var txid = await removeFunds(poolBalances[i].pool, currencyCode, poolBalances[i].balanceDifferenceBN.abs(), poolBalances[i].balanceBN.isZero());
        } catch (error) {
            throw "Failed to remove funds from pool " + poolBalances[i].pool + " when balancing supply of " + currencyCode + ": " + error;
        }

        // Update pool's currency balance
        db.pools[poolBalances[i].pool].currencies[currencyCode].poolBalanceBN = poolBalances[i].balanceBN.toString();

        totalBalanceDifferenceBN.iadd(poolBalances[i].balanceDifferenceBN);
    }
    
    // Execute all supply additions
    // TODO: Make sure supply removals have updated (and confirmed?) before adding funds
    // TODO: Don't fail to execute the last addition due to rounding inaccuracies
    // TODO: Don't fail to execute the last addition due to transaction fees on our tokens
    for (var i = 0; i < poolBalances.length; i++) if (poolBalances[i].balanceDifferenceBN.gt(web3.utils.toBN(0))) {
        // TODO: Don't execute a supply addition if not above a threshold
        try {
            var txid = await addFunds(poolBalances[i].pool, currencyCode, poolBalances[i].balanceDifferenceBN);
        } catch (error) {
            throw "Failed to add funds to pool when balancing supply of " + currencyCode + ": " + error;
        }

        // Update pool's currency balance
        db.pools[poolBalances[i].pool].currencies[currencyCode].poolBalanceBN = poolBalances[i].balanceBN.toString();

        totalBalanceDifferenceBN.iadd(poolBalances[i].balanceDifferenceBN);
    }

    // Update wallet balance in mock database
    db.currencies[currencyCode].fundManagerContractBalanceBN = db.currencies[currencyCode].fundManagerContractBalanceBN.sub(totalBalanceDifferenceBN);

    // TODO: Refresh all balances
    // checkAllBalances();
}

async function removeFunds(poolName, currencyCode, amountBN, removeAll = false) {
    var fundManagerContract = new web3.eth.Contract(farmerFundManagerAbi, process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS);

    // Create withdrawFromPool transaction
    var data = fundManagerContract.methods.withdrawFromPool(poolName == "Compound" ? 1 : 0, currencyCode, amountBN).encodeABI();

    // Build transaction
    var tx = {
        from: process.env.ETHEREUM_ADMIN_ACCOUNT,
        to: process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS,
        value: 0,
        data: data,
        nonce: await web3.eth.getTransactionCount(process.env.ETHEREUM_ADMIN_ACCOUNT)
    };

    if (process.env.NODE_ENV !== "production") console.log("Removing", amountBN.toString(), currencyCode, "funds from", poolName, ":", tx);

    // Estimate gas for transaction
    try {
        tx["gas"] = await web3.eth.estimateGas(tx);
    } catch (error) {
        throw "Failed to estimate gas before signing and sending transaction for withdrawFromPool of " + currencyCode + " from " + poolName + ": " + error;
    }
    
    // Sign transaction
    try {
        var signedTx = await web3.eth.accounts.signTransaction(tx, process.env.ETHEREUM_ADMIN_PRIVATE_KEY);
    } catch (error) {
        throw "Error signing transaction for withdrawFromPool of " + currencyCode + " from " + poolName + ": " + error;
    }

    // Send transaction
    try {
        var sentTx = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    } catch (error) {
        throw "Error sending transaction for withdrawFromPool of " + currencyCode + " from " + poolName + ": " + error;
    }
    
    console.log("Successfully removed", currencyCode, "funds from", poolName, ":", sentTx);
    return sentTx;
}

async function addFunds(poolName, currencyCode, amountBN) {
    var fundManagerContract = new web3.eth.Contract(farmerFundManagerAbi, process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS);

    // Create depositToPool transaction
    var data = fundManagerContract.methods.depositToPool(poolName == "Compound" ? 1 : 0, currencyCode, amountBN).encodeABI();

    // Build transaction
    var tx = {
        from: process.env.ETHEREUM_ADMIN_ACCOUNT,
        to: process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS,
        value: 0,
        data: data,
        nonce: await web3.eth.getTransactionCount(process.env.ETHEREUM_ADMIN_ACCOUNT)
    };

    if (process.env.NODE_ENV !== "production") console.log("Adding", amountBN.toString(), currencyCode, "funds to", poolName, ":", tx);

    // Estimate gas for transaction
    try {
        tx["gas"] = await web3.eth.estimateGas(tx);
    } catch (error) {
        throw "Failed to estimate gas before signing and sending transaction for depositToPool of " + currencyCode + " to " + poolName + ": " + error;
    }
    
    // Sign transaction
    try {
        var signedTx = await web3.eth.accounts.signTransaction(tx, process.env.ETHEREUM_ADMIN_PRIVATE_KEY);
    } catch (error) {
        throw "Error signing transaction for depositToPool of " + currencyCode + " to " + poolName + ": " + error;
    }

    // Send transaction
    try {
        var sentTx = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    } catch (error) {
        throw "Error sending transaction for depositToPool of " + currencyCode + " to " + poolName + ": " + error;
    }
    
    console.log("Successfully added", currencyCode, "funds to", poolName, ":", sentTx);
    return sentTx;
}

/* WALLET BALANCE CHECKING */

async function checkAllBalances() {
    await checkFundManagerContractBalances();
    await checkPoolBalances();
}

async function checkFundManagerContractBalances() {
    for (const currencyCode of Object.keys(db.currencies)) {
        // Check wallet balance for this currency
        try {
            var balance = await (currencyCode === "ETH" ? getFundManagerContractEthBalance() : getFundManagerContractErc20Balance(db.currencies[currencyCode].tokenAddress));
        } catch (error) {
            console.error("Error getting", currencyCode, "wallet balance:", error);
            return;
        }
        
        // Update mock database
        db.currencies[currencyCode].fundManagerContractBalanceBN = web3.utils.toBN(balance);
    }
}

async function getFundManagerContractEthBalance() {
    try {
        return await web3.eth.getBalance(process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS);
    } catch (error) {
        throw "Error when retreiving ETH balance of FundManager: " + error;
    }
}

async function getFundManagerContractErc20Balance(erc20ContractAddress) {
    var erc20Contract = new web3.eth.Contract(erc20Abi, erc20ContractAddress);

    try {
        return await erc20Contract.methods.balanceOf(process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS).call();
    } catch (error) {
        throw "Error when retreiving ERC20 balance of FundManager: " + error;
    }
}

async function checkPoolBalances() {
    // Get balances for all pools
    for (const poolName of Object.keys(db.pools)) {
        try {
            if (poolName === "dYdX") {
                var currencyCodesByTokenAddress = {};
                for (const currencyCode of Object.keys(db.pools[poolName].currencies)) currencyCodesByTokenAddress[db.currencies[currencyCode].tokenAddress] = currencyCode;
                var balances = await dydxProtocol.getUnderlyingBalances(currencyCodesByTokenAddress);
            } else if (poolName == "Compound") var balances = await compoundProtocol.getUnderlyingBalances(Object.keys(db.pools[poolName].currencies));
            else return console.error("Failed to get balances for unrecognized pool:", poolName);
        } catch (error) {
            console.error("Failed to get balances for", poolName, "pool:", error);
            return;
        }
        
        for (const currencyCode of Object.keys(balances)) db.pools[poolName].currencies[currencyCode].poolBalanceBN = balances[currencyCode];
    }
}
