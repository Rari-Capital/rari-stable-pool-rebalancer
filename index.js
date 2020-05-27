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
const web3_1 = __importDefault(require("web3"));
const https = require('https');
const dydx_1 = __importDefault(require("./protocols/dydx"));
const compound_1 = __importDefault(require("./protocols/compound"));
const _0x_1 = __importDefault(require("./exchanges/0x"));
const erc20Abi = require('./abi/ERC20.json');
const rariFundManagerAbi = require('./abi/RariFundManager.json');
// Init Web3
var web3 = new web3_1.default(new web3_1.default.providers.HttpProvider(process.env.INFURA_ENDPOINT_URL));
// Init DydxProtocol, CompoundProtocol, and ZeroExExchange
var dydxProtocol = new dydx_1.default(web3);
var compoundProtocol = new compound_1.default(web3);
var zeroExExchange = new _0x_1.default(web3);
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
        },
        "Compound": {
            currencies: {
                "DAI": {
                    poolBalanceBN: web3.utils.toBN(0),
                    supplyApr: 0
                }
            }
        }
    },
    isBalancingSupply: false,
    lastTimeBalanced: 0
};
function doCycle() {
    return __awaiter(this, void 0, void 0, function* () {
        yield checkAllBalances();
        yield getAllAprs();
        if (parseInt(process.env.AUTOMATIC_SUPPLY_BALANCING_ENABLED))
            yield tryBalanceSupply();
        setTimeout(doCycle, 60 * 1000);
    });
}
function onLoad() {
    return __awaiter(this, void 0, void 0, function* () {
        // Start updating USD rates regularly
        yield updateCurrencyUsdRates();
        setInterval(function () { updateCurrencyUsdRates(); }, (process.env.UPDATE_CURRENCY_USD_RATES_INTERVAL_SECONDS ? parseFloat(process.env.UPDATE_CURRENCY_USD_RATES_INTERVAL_SECONDS) : 60) * 1000);
        // Set max token allowances to pools
        yield setMaxTokenAllowances();
        // Start cycle of checking wallet balances and pool APRs and trying to balance supply of all currencies
        doCycle();
    });
}
onLoad();
/* POOL APR CHECKING */
function getAllAprs() {
    return __awaiter(this, void 0, void 0, function* () {
        // Get APRs for all pools
        for (const key of Object.keys(db.pools)) {
            try {
                if (key === "dYdX")
                    var aprs = yield dydxProtocol.getAprs(Object.keys(db.pools[key].currencies));
                else if (key == "Compound")
                    var aprs = yield compoundProtocol.getAprs(Object.keys(db.pools[key].currencies));
                else
                    return console.error("Failed to get APRs for unrecognized pool:", key);
            }
            catch (error) {
                console.error("Failed to get APRs for", key, "pool:", error);
                return;
            }
            for (const key2 of Object.keys(aprs)) {
                db.pools[key].currencies[key2].supplyApr = aprs[key2];
            }
        }
    });
}
/* TOKEN ALLOWANCES */
function setMaxTokenAllowances(unset = false) {
    return __awaiter(this, void 0, void 0, function* () {
        for (const poolName of Object.keys(db.pools))
            for (const currencyCode of Object.keys(db.pools[poolName].currencies))
                setMaxTokenAllowance(poolName, currencyCode, unset);
    });
}
function setMaxTokenAllowance(poolName, currencyCode, unset = false) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Setting " + (unset ? "zero" : "max") + " token allowance for", currencyCode, "on", poolName);
        try {
            var txid = yield approveFunds(poolName, currencyCode, unset ? web3.utils.toBN(0) : web3.utils.toBN(2).pow(web3.utils.toBN(256)).sub(web3.utils.toBN(1)));
        }
        catch (error) {
            console.log("Failed to set " + (unset ? "zero" : "max") + " token allowance for", currencyCode, "on", poolName);
        }
        console.log((unset ? "Zero" : "Max") + " token allowance set successfully for", currencyCode, "on", poolName, ":", txid);
    });
}
/* CURRENCY USD RATE UPDATING */
function updateCurrencyUsdRates() {
    return __awaiter(this, void 0, void 0, function* () {
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
                if (!decoded || !decoded.data)
                    return console.error("Failed to decode USD exchange rates from CoinMarketCap");
                for (const key of Object.keys(decoded.data)) {
                    db.currencies[key].usdRate = decoded.data[key].quote.USD.price;
                }
            });
        }).on("error", (err) => {
            console.error("Error requesting currency rates from CoinMarketCap:", err.message);
        });
    });
}
/* POOL BALANCING */
function getBestCurrencyAndPool() {
    return __awaiter(this, void 0, void 0, function* () {
        // Find best currency and pool (to put entire balance in)
        var bestCurrencyCode = null;
        var bestPoolName = null;
        var bestApr = 0;
        for (const poolName of Object.keys(db.pools)) {
            for (const currencyCode of Object.keys(db.pools[poolName].currencies)) {
                if (db.pools[poolName].currencies[currencyCode] && db.pools[poolName].currencies[currencyCode].supplyApr > bestApr) {
                    bestCurrencyCode = currencyCode;
                    bestPoolName = poolName;
                    bestApr = db.pools[poolName].currencies[currencyCode].supplyApr;
                }
            }
        }
        if (bestPoolName === null)
            throw "Failed to get best currency and pool";
        return [bestCurrencyCode, bestPoolName, bestApr];
    });
}
function getBestPoolByCurrency(currencyCode) {
    // Find best pool for this currency (to put entire balance in)
    var bestPoolName = null;
    var bestPoolApr = 0;
    for (const poolName of Object.keys(db.pools)) {
        if (db.pools[poolName].currencies[currencyCode] && db.pools[poolName].currencies[currencyCode].supplyApr > bestPoolApr) {
            bestPoolName = poolName;
            bestPoolApr = db.pools[poolName].currencies[currencyCode].supplyApr;
        }
    }
    if (bestPoolName === null)
        throw "Failed to get best pool for " + currencyCode;
    return [bestPoolName, bestPoolApr];
}
function getRawTotalBalanceBN(currencyCode) {
    // Calculate totalBalance: start with fundManagerContractBalanceBN
    var totalBalanceBN = db.currencies[currencyCode].fundManagerContractBalanceBN;
    // Add pool balances to totalBalance
    for (const poolName of Object.keys(db.pools))
        if (db.pools[poolName].currencies[currencyCode])
            totalBalanceBN.iadd(db.pools[poolName].currencies[currencyCode].poolBalanceBN);
    return totalBalanceBN;
}
function getIdealBalances(currencyCode, totalBalanceDifferenceBN = null) {
    return __awaiter(this, void 0, void 0, function* () {
        // TODO: As of now, we simply put all funds in the pool with the highest interest rate and assume that we aren't supplying enough funds to push that rate below another one.
        // TODO: Ideally, we calculate ideal balances based on current interest rate parameters so that we balance our funds across the pools with the highest rates so that we still receive as much interest as possible even when we have enough total funds to push the best interest rate below the next best.
        // TODO: Add balance to fund with most APR until that APR hits the second highest, then add balance to both of them, decreasing them both equally, until they hit the third highest
        // Calculate totalBalance
        var totalBalanceBN = getRawTotalBalanceBN(currencyCode);
        // Add difference to totalBalance if supplied to this function
        if (totalBalanceDifferenceBN !== null)
            totalBalanceBN.iadd(totalBalanceDifferenceBN);
        if (totalBalanceBN.isNeg())
            throw "Total balance would be negative";
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
        if (bestPoolName === null)
            throw "Failed to get best pool";
        var poolBalances = [
            { pool: bestPoolName, apr: bestPoolApr, balanceBN: totalBalanceBN, balanceDifferenceBN: totalBalanceBN.sub(bestPoolCurrentBalanceBN) }
        ];
        // Set balances to 0 for other pools
        for (const poolName of Object.keys(db.pools)) {
            if (poolName !== bestPoolName && db.pools[poolName].currencies[currencyCode])
                poolBalances.push({ pool: poolName, apr: db.pools[poolName].currencies[currencyCode].supplyApr, balanceBN: web3.utils.toBN(0), balanceDifferenceBN: web3.utils.toBN(0).sub(db.pools[poolName].currencies[currencyCode].poolBalanceBN) });
        }
        return poolBalances;
    });
}
function tryBalanceSupply() {
    return __awaiter(this, void 0, void 0, function* () {
        if (db.isBalancingSupply)
            return console.warn("Cannot balance supply: supply balancing already in progress");
        db.isBalancingSupply = true;
        console.log("Trying to balance supply");
        // Get best currency and pool for potential currency exchange
        try {
            var [bestCurrencyCode, bestPoolName, bestApr] = yield getBestCurrencyAndPool();
        }
        catch (error) {
            db.isBalancingSupply = false;
            return console.error("Failed to get best currency and pool when trying to balance supply:", error);
        }
        // Get seconds since last supply balancing (if we don't know the last time, assume it's been one year)
        // TODO: Get db.lastTimeBalanced from database instead of storing in a variable
        var epoch = (new Date()).getTime() / 1000;
        var secondsSinceLastSupplyBalancing = db.lastTimeBalanced > 0 ? epoch - db.lastTimeBalanced : 86400 * 7;
        // Array of sumPendingWithdrawalsBN for each currency
        var sumPendingWithdrawalsBN = {};
        // Loop through tokens for exchanges
        for (const currencyCode of Object.keys(db.currencies))
            if (currencyCode !== "ETH") {
                // Check withdrawals queue
                sumPendingWithdrawalsBN[currencyCode] = process.env.WITHDRAWAL_QUEUE_ENABLED ? yield getSumPendingWithdrawals(currencyCode) : web3.utils.toBN(0);
                // Convert a maximum of the currency's raw total balance - sumPendingWithdrawalsBN at a maximum marginal output according to AUTOMATIC_TOKEN_EXCHANGE_MAX_SLIPPAGE_PER_APR_INCREASE_PER_YEAR_SINCE_LAST_REBALANCING
                var maxInputAmountBN = getRawTotalBalanceBN(currencyCode).sub(sumPendingWithdrawalsBN[currencyCode]);
                try {
                    var [bestPoolNameForThisCurrency, bestAprForThisCurrency] = yield getBestPoolByCurrency(currencyCode);
                }
                catch (error) {
                    db.isBalancingSupply = false;
                    return console.error("Failed to get best currency and pool when trying to balance supply:", error);
                }
                if (maxInputAmountBN.gt(web3.utils.toBN(0))) {
                    // Calculate min marginal output amount to exchange funds
                    try {
                        var price = yield zeroExExchange.getPrice(currencyCode, bestCurrencyCode);
                    }
                    catch (error) {
                        db.isBalancingSupply = false;
                        return console.error("Failed to get price from 0x API when trying to balance supply:", error);
                    }
                    var maxMarginalOutputAmount = 1 / parseFloat(price);
                    var minMarginalOutputAmountBN = web3.utils.toBN(maxMarginalOutputAmount * (1 - (parseFloat(process.env.AUTOMATIC_TOKEN_EXCHANGE_MAX_SLIPPAGE_PER_APR_INCREASE_PER_YEAR_SINCE_LAST_REBALANCING) * (bestApr - bestAprForThisCurrency) * (secondsSinceLastSupplyBalancing / 86400 / 365))) * (Math.pow(10, db.currencies[bestCurrencyCode].decimals)));
                    // Get estimated filled input amount from 0x swap API
                    try {
                        var [orders, estimatedInputAmountBN] = yield zeroExExchange.getSwapOrders(db.currencies[currencyCode].tokenAddress, db.currencies[bestCurrencyCode].tokenAddress, maxInputAmountBN, minMarginalOutputAmountBN);
                    }
                    catch (error) {
                        db.isBalancingSupply = false;
                        return console.error("Failed to get swap orders from 0x API when trying to balance supply:", error);
                    }
                    // Withdraw estimatedInputAmountBN tokens from pools in order of lowest to highest supply rate
                    var pools = db.currencies[currencyCode].pools.slice();
                    pools.sort((a, b) => (a.supplyApr > b.supplyApr) ? 1 : -1);
                    for (const poolName of Object.keys(pools)) {
                        var leftBN = estimatedInputAmountBN.sub(db.currencies[currencyCode].fundManagerContractBalanceBN);
                        var withdrawalAmountBN = leftBN.lte(db.pools[poolName].currencies[currencyCode].poolBalanceBN) ? leftBN : db.pools[poolName].currencies[currencyCode].poolBalanceBN;
                        // TODO: Don't execute a supply removal if not above a threshold
                        try {
                            var txid = yield removeFunds(poolName, currencyCode, withdrawalAmountBN, withdrawalAmountBN.eq(db.pools[poolName].currencies[currencyCode].poolBalanceBN));
                        }
                        catch (error) {
                            console.error("Failed to remove funds from pool " + poolName + " when balancing supply of " + currencyCode + " before token exchange: " + error);
                            continue;
                        }
                        // Update balances
                        db.pools[poolName].currencies[currencyCode].poolBalanceBN.isub(withdrawalAmountBN);
                        db.currencies[currencyCode].fundManagerContractBalanceBN.iadd(withdrawalAmountBN);
                        if (db.currencies[currencyCode].fundManagerContractBalanceBN.eq(estimatedInputAmountBN))
                            break;
                    }
                    // Exchange tokens!
                    try {
                        var txid = yield exchangeFunds(currencyCode, bestCurrencyCode, db.currencies[currencyCode].fundManagerContractBalanceBN, minMarginalOutputAmountBN);
                    }
                    catch (error) {
                        throw "Failed to exchange " + currencyCode + " to " + bestCurrencyCode + " when balancing supply: " + error;
                    }
                }
            }
        // Loop through tokens again for rebalancing across pools
        for (const currencyCode of Object.keys(db.currencies))
            if (currencyCode !== "ETH") {
                // Get ideal balances
                try {
                    var idealBalances = yield getIdealBalances(currencyCode, web3.utils.toBN(0).sub(sumPendingWithdrawalsBN[currencyCode]));
                }
                catch (error) {
                    db.isBalancingSupply = false;
                    return console.error("Failed to get ideal balances when trying to balance supply of", currencyCode, ":", error);
                }
                // Check for any changes in ideal balances
                var anyChanges = false;
                for (var i = 0; i < idealBalances.length; i++)
                    if (!idealBalances[i].balanceDifferenceBN.isZero())
                        anyChanges = true;
                if (anyChanges) {
                    // Check AUTOMATIC_SUPPLY_BALANCING_MIN_ALGORITHMIC_NET_VALUE if sumPendingWithdrawalsBN is zero
                    if (sumPendingWithdrawalsBN[currencyCode].isZero()) {
                        // Get expected additional yearly interest
                        var expectedAdditionalYearlyInterest = 0;
                        for (var i = 0; i < idealBalances.length; i++) {
                            var balanceDifference = parseInt(idealBalances[i].balanceDifferenceBN.toString()); // TODO: BN.prototype.toNumber replacement
                            expectedAdditionalYearlyInterest += balanceDifference * idealBalances[i].apr;
                        }
                        var expectedAdditionalYearlyInterestUsd = expectedAdditionalYearlyInterest / Math.pow(10, db.currencies[currencyCode].decimals) * db.currencies[currencyCode].usdRate;
                        // Get max miner fees
                        try {
                            var maxEthereumMinerFeesBN = yield getMaxEthereumMinerFeesForSupplyBalancing(currencyCode, idealBalances);
                        }
                        catch (error) {
                            return console.error("Failed to check max Ethereum miner fees before balancing supply:", error);
                        }
                        var maxEthereumMinerFees = parseInt(maxEthereumMinerFeesBN.toString()); // TODO: BN.prototype.toNumber replacement
                        var maxMinerFeesUsd = maxEthereumMinerFees / Math.pow(10, 18) * db.currencies["ETH"].usdRate;
                        // Check AUTOMATIC_SUPPLY_BALANCING_MIN_ALGORITHMIC_NET_VALUE
                        if (expectedAdditionalYearlyInterestUsd * secondsSinceLastSupplyBalancing / maxMinerFeesUsd < parseFloat(process.env.AUTOMATIC_SUPPLY_BALANCING_MIN_ALGORITHMIC_NET_VALUE)) {
                            db.isBalancingSupply = false;
                            return console.log("Not balancing supply of", currencyCode, "because", expectedAdditionalYearlyInterestUsd, "*", secondsSinceLastSupplyBalancing, "/", maxMinerFeesUsd, "is less than", process.env.AUTOMATIC_SUPPLY_BALANCING_MIN_ALGORITHMIC_NET_VALUE);
                        }
                        console.log("Balancing supply of", currencyCode, "because", expectedAdditionalYearlyInterestUsd, "*", secondsSinceLastSupplyBalancing, "/", maxMinerFeesUsd, "is at least", process.env.AUTOMATIC_SUPPLY_BALANCING_MIN_ALGORITHMIC_NET_VALUE);
                    }
                    else
                        console.log("Balancing supply of", currencyCode, "because we have pending withdrawals");
                    // Balance supply!
                    try {
                        yield doBalanceSupply(db, currencyCode, idealBalances, maxEthereumMinerFeesBN);
                    }
                    catch (error) {
                        db.isBalancingSupply = false;
                        return console.error("Failed to balance supply of", currencyCode, ":", error);
                    }
                    db.lastTimeBalanced = epoch;
                }
                else
                    console.log("Not balancing supply of", currencyCode, "because no change in balances");
                // Process pending withdrawals if we have any
                if (sumPendingWithdrawalsBN[currencyCode].gt(web3.utils.toBN(0)))
                    yield processPendingWithdrawals(currencyCode);
            }
        db.isBalancingSupply = false;
    });
}
function getSumPendingWithdrawals(currencyCode) {
    return __awaiter(this, void 0, void 0, function* () {
        // Get sum of pending withdrawals
        if (process.env.NODE_ENV !== "production")
            console.log("Checking for pending withdrawals for", currencyCode);
        var fundManagerContract = new web3.eth.Contract(rariFundManagerAbi, process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS);
        var countPendingWithdrawals = yield fundManagerContract.methods.countPendingWithdrawals(currencyCode).call();
        var sumPendingWithdrawalsBN = web3.utils.toBN(0);
        if (countPendingWithdrawals > 0) {
            for (var i = 0; i < countPendingWithdrawals; i++) {
                var withdrawalAmount = yield fundManagerContract.methods.getPendingWithdrawalAmount(currencyCode, i).call();
                sumPendingWithdrawalsBN.iadd(web3.utils.toBN(withdrawalAmount));
                console.log("Leaving", withdrawalAmount, currencyCode, "in FundManager for withdrawal");
            }
            console.log("Leaving a total of", sumPendingWithdrawalsBN.toString(), currencyCode, "in FundManager for withdrawals");
        }
        return sumPendingWithdrawalsBN;
    });
}
function processPendingWithdrawals(currencyCode) {
    return __awaiter(this, void 0, void 0, function* () {
        var fundManagerContract = new web3.eth.Contract(rariFundManagerAbi, process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS);
        // Create processPendingWithdrawals transaction
        var data = fundManagerContract.methods.processPendingWithdrawals(currencyCode).encodeABI();
        // Build transaction
        var tx = {
            from: process.env.ETHEREUM_ADMIN_ACCOUNT,
            to: process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS,
            value: 0,
            data: data,
            nonce: yield web3.eth.getTransactionCount(process.env.ETHEREUM_ADMIN_ACCOUNT)
        };
        if (process.env.NODE_ENV !== "production")
            console.log("Processing pending withdrawals for", currencyCode, ":", tx);
        // Estimate gas for transaction
        try {
            tx["gas"] = yield web3.eth.estimateGas(tx);
        }
        catch (error) {
            throw "Failed to estimate gas before signing and sending transaction for processPendingWithdrawals for " + currencyCode + ": " + error;
        }
        // Sign transaction
        try {
            var signedTx = yield web3.eth.accounts.signTransaction(tx, process.env.ETHEREUM_ADMIN_PRIVATE_KEY);
        }
        catch (error) {
            throw "Error signing transaction for processPendingWithdrawals for " + currencyCode + ": " + error;
        }
        // Send transaction
        try {
            var sentTx = yield web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        }
        catch (error) {
            throw "Error sending transaction for processPendingWithdrawals for " + currencyCode + ": " + error;
        }
        console.log("Successfully processed pending withdrawals for", currencyCode, ":", sentTx);
        return sentTx;
    });
}
function getMaxEthereumMinerFeesForSupplyBalancing(currencyCode, poolBalances) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            var gasPrice = yield web3.eth.getGasPrice();
        }
        catch (error) {
            throw "Failed to check ETH gas price to calculate max Ethereum miner fees before balancing supply: " + error;
        }
        var gasNecessary = 0;
        for (var i = 0; i < poolBalances.length; i++) {
            if (poolBalances[i].balanceDifferenceBN.gt(web3.utils.toBN(0))) {
                if (poolBalances[i].pool === "dYdX")
                    gasNecessary += 300000; // TODO: Correct dYdX gas prices
                else if (poolBalances[i].pool === "Compound")
                    gasNecessary += currencyCode === "DAI" ? 300000 : 150000;
                else
                    gasNecessary += 300000; // TODO: Correct default gas price assumption
            }
            else if (poolBalances[i].balanceDifferenceBN.isNeg()) {
                if (poolBalances[i].pool === "dYdX")
                    gasNecessary += 300000; // TODO: Correct dYdX gas prices
                else if (poolBalances[i].pool === "Compound")
                    gasNecessary += 90000;
                else
                    gasNecessary += 300000; // TODO: Correct default gas price assumption
            }
        }
        return web3.utils.toBN(gasNecessary).mul(web3.utils.toBN(gasPrice));
    });
}
function doBalanceSupply(db, currencyCode, poolBalances, maxEthereumMinerFeesBN = null) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('\x1b[32m%s\x1b[0m', "Starting to balance supply of", currencyCode); // Green color
        // Check that we have enough balance for gas fees
        try {
            var ethereumBalance = yield getFundManagerContractEthBalance();
        }
        catch (error) {
            throw "Failed to check ETH wallet balance to make sure we have enough funds for fees before balancing supply: " + error;
        }
        if (maxEthereumMinerFeesBN === null) {
            try {
                maxEthereumMinerFeesBN = yield getMaxEthereumMinerFeesForSupplyBalancing(currencyCode, poolBalances);
            }
            catch (error) {
                throw "Failed to check max Ethereum miner fees before balancing supply: " + error;
            }
        }
        if (web3.utils.toBN(ethereumBalance).lt(maxEthereumMinerFeesBN))
            throw "Not enough balance in ETH wallet to cover gas fees to balance supply!"; // TODO: Notify admin well before we run out of ETH for gas
        // Keep track of total balance difference 
        var totalBalanceDifferenceBN = web3.utils.toBN(0);
        // Execute all supply removals
        for (var i = 0; i < poolBalances.length; i++)
            if (poolBalances[i].balanceDifferenceBN.isNeg()) {
                // TODO: Don't execute a supply removal if not above a threshold
                try {
                    var txid = yield removeFunds(poolBalances[i].pool, currencyCode, poolBalances[i].balanceDifferenceBN.abs(), poolBalances[i].balanceBN.isZero());
                }
                catch (error) {
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
        for (var i = 0; i < poolBalances.length; i++)
            if (poolBalances[i].balanceDifferenceBN.gt(web3.utils.toBN(0))) {
                // TODO: Don't execute a supply addition if not above a threshold
                try {
                    var txid = yield addFunds(poolBalances[i].pool, currencyCode, poolBalances[i].balanceDifferenceBN);
                }
                catch (error) {
                    throw "Failed to add funds to pool when balancing supply of " + currencyCode + ": " + error;
                }
                // Update pool's currency balance
                db.pools[poolBalances[i].pool].currencies[currencyCode].poolBalanceBN = poolBalances[i].balanceBN.toString();
                totalBalanceDifferenceBN.iadd(poolBalances[i].balanceDifferenceBN);
            }
        // Update wallet balance in mock database
        db.currencies[currencyCode].fundManagerContractBalanceBN = db.currencies[currencyCode].fundManagerContractBalanceBN.sub(totalBalanceDifferenceBN);
    });
}
function approveFunds(poolName, currencyCode, amountBN) {
    return __awaiter(this, void 0, void 0, function* () {
        var fundManagerContract = new web3.eth.Contract(rariFundManagerAbi, process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS);
        // Create depositToPool transaction
        var data = fundManagerContract.methods.approveToPool(poolName == "Compound" ? 1 : 0, currencyCode, amountBN).encodeABI();
        // Build transaction
        var tx = {
            from: process.env.ETHEREUM_ADMIN_ACCOUNT,
            to: process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS,
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
function addFunds(poolName, currencyCode, amountBN) {
    return __awaiter(this, void 0, void 0, function* () {
        var fundManagerContract = new web3.eth.Contract(rariFundManagerAbi, process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS);
        // Create depositToPool transaction
        var data = fundManagerContract.methods.depositToPool(poolName == "Compound" ? 1 : 0, currencyCode, amountBN).encodeABI();
        // Build transaction
        var tx = {
            from: process.env.ETHEREUM_ADMIN_ACCOUNT,
            to: process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS,
            value: 0,
            data: data,
            nonce: yield web3.eth.getTransactionCount(process.env.ETHEREUM_ADMIN_ACCOUNT)
        };
        if (process.env.NODE_ENV !== "production")
            console.log("Adding", amountBN.toString(), currencyCode, "funds to", poolName, ":", tx);
        // Estimate gas for transaction
        try {
            tx["gas"] = yield web3.eth.estimateGas(tx);
        }
        catch (error) {
            throw "Failed to estimate gas before signing and sending transaction for depositToPool of " + currencyCode + " to " + poolName + ": " + error;
        }
        // Sign transaction
        try {
            var signedTx = yield web3.eth.accounts.signTransaction(tx, process.env.ETHEREUM_ADMIN_PRIVATE_KEY);
        }
        catch (error) {
            throw "Error signing transaction for depositToPool of " + currencyCode + " to " + poolName + ": " + error;
        }
        // Send transaction
        try {
            var sentTx = yield web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        }
        catch (error) {
            throw "Error sending transaction for depositToPool of " + currencyCode + " to " + poolName + ": " + error;
        }
        console.log("Successfully added", currencyCode, "funds to", poolName, ":", sentTx);
        return sentTx;
    });
}
function removeFunds(poolName, currencyCode, amountBN, removeAll = false) {
    return __awaiter(this, void 0, void 0, function* () {
        var fundManagerContract = new web3.eth.Contract(rariFundManagerAbi, process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS);
        // Create withdrawFromPool transaction
        var data = fundManagerContract.methods.withdrawFromPool(poolName == "Compound" ? 1 : 0, currencyCode, amountBN).encodeABI();
        // Build transaction
        var tx = {
            from: process.env.ETHEREUM_ADMIN_ACCOUNT,
            to: process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS,
            value: 0,
            data: data,
            nonce: yield web3.eth.getTransactionCount(process.env.ETHEREUM_ADMIN_ACCOUNT)
        };
        if (process.env.NODE_ENV !== "production")
            console.log("Removing", amountBN.toString(), currencyCode, "funds from", poolName, ":", tx);
        // Estimate gas for transaction
        try {
            tx["gas"] = yield web3.eth.estimateGas(tx);
        }
        catch (error) {
            throw "Failed to estimate gas before signing and sending transaction for withdrawFromPool of " + currencyCode + " from " + poolName + ": " + error;
        }
        // Sign transaction
        try {
            var signedTx = yield web3.eth.accounts.signTransaction(tx, process.env.ETHEREUM_ADMIN_PRIVATE_KEY);
        }
        catch (error) {
            throw "Error signing transaction for withdrawFromPool of " + currencyCode + " from " + poolName + ": " + error;
        }
        // Send transaction
        try {
            var sentTx = yield web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        }
        catch (error) {
            throw "Error sending transaction for withdrawFromPool of " + currencyCode + " from " + poolName + ": " + error;
        }
        console.log("Successfully removed", currencyCode, "funds from", poolName, ":", sentTx);
        return sentTx;
    });
}
function exchangeFunds(inputCurrencyCode, outputCurrencyCode, maxInputAmountBN, minMarginalOutputAmountBN) {
    return __awaiter(this, void 0, void 0, function* () {
        // Get orders from 0x swap API
        try {
            var [orders, filledInputAmountBN] = yield zeroExExchange.getSwapOrders(db.currencies[inputCurrencyCode].tokenAddress, db.currencies[outputCurrencyCode].tokenAddress, maxInputAmountBN, minMarginalOutputAmountBN);
        }
        catch (error) {
            throw "Failed to get orders from 0x swap API for fill0xOrdersUpTo to exchange " + inputCurrencyCode + " to " + outputCurrencyCode + ": " + error;
        }
        var signatures = [];
        for (var i = 0; i < orders.length; i++)
            signatures.push(orders[i].signature);
        // Instansiate FundManagerContract
        var fundManagerContract = new web3.eth.Contract(rariFundManagerAbi, process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS);
        // Create fill0xOrdersUpTo transaction
        var data = fundManagerContract.methods.fill0xOrdersUpTo(orders, signatures, maxInputAmountBN, minMarginalOutputAmountBN).encodeABI();
        // Build transaction
        var tx = {
            from: process.env.ETHEREUM_ADMIN_ACCOUNT,
            to: process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS,
            value: 0,
            data: data,
            nonce: yield web3.eth.getTransactionCount(process.env.ETHEREUM_ADMIN_ACCOUNT)
        };
        if (process.env.NODE_ENV !== "production")
            console.log("Exchanging up to", maxInputAmountBN.toString(), inputCurrencyCode, "to", outputCurrencyCode, "at a minimum marginal output amount of", minMarginalOutputAmountBN.toString(), ":", tx);
        // Estimate gas for transaction
        try {
            tx["gas"] = yield web3.eth.estimateGas(tx);
        }
        catch (error) {
            throw "Failed to estimate gas before signing and sending transaction for fill0xOrdersUpTo to exchange " + inputCurrencyCode + " to " + outputCurrencyCode + ": " + error;
        }
        // Sign transaction
        try {
            var signedTx = yield web3.eth.accounts.signTransaction(tx, process.env.ETHEREUM_ADMIN_PRIVATE_KEY);
        }
        catch (error) {
            throw "Error signing transaction for fill0xOrdersUpTo to exchange " + inputCurrencyCode + " to " + outputCurrencyCode + ": " + error;
        }
        // Send transaction
        try {
            var sentTx = yield web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        }
        catch (error) {
            throw "Error sending transaction for fill0xOrdersUpTo to exchange " + inputCurrencyCode + " to " + outputCurrencyCode + ": " + error;
        }
        console.log("Successfully exchanged", inputCurrencyCode, "to", outputCurrencyCode, ":", sentTx);
        return sentTx;
    });
}
/* WALLET BALANCE CHECKING */
function checkAllBalances() {
    return __awaiter(this, void 0, void 0, function* () {
        yield checkFundManagerContractBalances();
        yield checkPoolBalances();
    });
}
function checkFundManagerContractBalances() {
    return __awaiter(this, void 0, void 0, function* () {
        for (const currencyCode of Object.keys(db.currencies)) {
            // Check wallet balance for this currency
            try {
                var balance = yield (currencyCode === "ETH" ? getFundManagerContractEthBalance() : getFundManagerContractErc20Balance(db.currencies[currencyCode].tokenAddress));
            }
            catch (error) {
                console.error("Error getting", currencyCode, "wallet balance:", error);
                return;
            }
            // Update mock database
            db.currencies[currencyCode].fundManagerContractBalanceBN = web3.utils.toBN(balance);
        }
    });
}
function getFundManagerContractEthBalance() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return yield web3.eth.getBalance(process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS);
        }
        catch (error) {
            throw "Error when retreiving ETH balance of FundManager: " + error;
        }
    });
}
function getFundManagerContractErc20Balance(erc20ContractAddress) {
    return __awaiter(this, void 0, void 0, function* () {
        var erc20Contract = new web3.eth.Contract(erc20Abi, erc20ContractAddress);
        try {
            return yield erc20Contract.methods.balanceOf(process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS).call();
        }
        catch (error) {
            throw "Error when retreiving ERC20 balance of FundManager: " + error;
        }
    });
}
function checkPoolBalances() {
    return __awaiter(this, void 0, void 0, function* () {
        // Get balances for all pools
        for (const poolName of Object.keys(db.pools)) {
            try {
                if (poolName === "dYdX") {
                    var currencyCodesByTokenAddress = {};
                    for (const currencyCode of Object.keys(db.pools[poolName].currencies))
                        currencyCodesByTokenAddress[db.currencies[currencyCode].tokenAddress] = currencyCode;
                    var balances = yield dydxProtocol.getUnderlyingBalances(currencyCodesByTokenAddress);
                }
                else if (poolName == "Compound")
                    var balances = yield compoundProtocol.getUnderlyingBalances(Object.keys(db.pools[poolName].currencies));
                else
                    return console.error("Failed to get balances for unrecognized pool:", poolName);
            }
            catch (error) {
                console.error("Failed to get balances for", poolName, "pool:", error);
                return;
            }
            for (const currencyCode of Object.keys(balances))
                db.pools[poolName].currencies[currencyCode].poolBalanceBN = balances[currencyCode];
        }
    });
}
//# sourceMappingURL=index.js.map