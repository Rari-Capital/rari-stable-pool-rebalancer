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
        },
        "USDC": {
            fundManagerContractBalanceBN: web3.utils.toBN(0),
            decimals: 6,
            tokenAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            usdRate: 0
        },
        "USDT": {
            fundManagerContractBalanceBN: web3.utils.toBN(0),
            decimals: 6,
            tokenAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
            usdRate: 0
        }
    },
    pools: {
        "dYdX": {
            currencies: {
                "DAI": {
                    poolBalanceBN: web3.utils.toBN(0),
                    supplyApr: 0
                },
                "USDC": {
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
                },
                "USDC": {
                    poolBalanceBN: web3.utils.toBN(0),
                    supplyApr: 0
                },
                "USDT": {
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
        yield setAcceptedCurrencies();
        if (parseInt(process.env.AUTOMATIC_SUPPLY_BALANCING_ENABLED))
            yield tryBalanceSupply();
        setTimeout(doCycle, (process.env.REBALANCER_CYCLE_DELAY_SECONDS ? parseFloat(process.env.REBALANCER_CYCLE_DELAY_SECONDS) : 60) * 1000);
    });
}
function onLoad() {
    return __awaiter(this, void 0, void 0, function* () {
        // Start updating USD rates regularly
        yield updateCurrencyUsdRates();
        setInterval(function () { updateCurrencyUsdRates(); }, (process.env.UPDATE_CURRENCY_USD_RATES_INTERVAL_SECONDS ? parseFloat(process.env.UPDATE_CURRENCY_USD_RATES_INTERVAL_SECONDS) : 60) * 1000);
        // Start claiming interest fees regularly
        yield depositInterestFees();
        setInterval(function () { depositInterestFees(); }, (process.env.CLAIM_INTEREST_FEES_INTERVAL_SECONDS ? parseFloat(process.env.CLAIM_INTEREST_FEES_INTERVAL_SECONDS) : 86400) * 1000);
        // Start withdrawing ETH and COMP regularly
        yield ownerWithdrawAllCurrencies();
        setInterval(function () { ownerWithdrawAllCurrencies(); }, (process.env.OWNER_WITHDRAW_INTERVAL_SECONDS ? parseFloat(process.env.OWNER_WITHDRAW_INTERVAL_SECONDS) : 86400) * 1000);
        // Set max token allowances to pools and 0x
        yield setMaxTokenAllowances();
        // Start cycle of checking wallet balances and pool APRs and trying to balance supply of all currencies
        doCycle();
    });
}
onLoad();
/* CLAIMING INTEREST FEES */
function depositInterestFees() {
    return __awaiter(this, void 0, void 0, function* () {
        var fundManagerContract = new web3.eth.Contract(rariFundManagerAbi, process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS);
        // Create depositFees transaction
        var data = fundManagerContract.methods.depositFees().encodeABI();
        // Build transaction
        var tx = {
            from: process.env.ETHEREUM_ADMIN_ACCOUNT,
            to: process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS,
            value: 0,
            data: data,
            nonce: yield web3.eth.getTransactionCount(process.env.ETHEREUM_ADMIN_ACCOUNT)
        };
        if (process.env.NODE_ENV !== "production")
            console.log("Depositing fees back into fund manager:", tx);
        // Estimate gas for transaction
        try {
            tx["gas"] = yield web3.eth.estimateGas(tx);
        }
        catch (error) {
            throw "Failed to estimate gas before signing and sending transaction for depositFees: " + error;
        }
        // Sign transaction
        try {
            var signedTx = yield web3.eth.accounts.signTransaction(tx, process.env.ETHEREUM_ADMIN_PRIVATE_KEY);
        }
        catch (error) {
            throw "Error signing transaction for depositFees: " + error;
        }
        // Send transaction
        try {
            var sentTx = yield web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        }
        catch (error) {
            throw "Error sending transaction for depositFees: " + error;
        }
        console.log("Successfully deposited fees back into fund manager:", sentTx);
        return sentTx;
    });
}
/* OWNER WITHDRAWALS */
function ownerWithdrawAllCurrencies() {
    return __awaiter(this, void 0, void 0, function* () {
        // TODO: Put currencies withdrawable by the owner in an array
        yield ownerWithdrawCurrency("ETH");
        yield ownerWithdrawCurrency("COMP");
    });
}
function ownerWithdrawCurrency(currencyCode) {
    return __awaiter(this, void 0, void 0, function* () {
        var fundManagerContract = new web3.eth.Contract(rariFundManagerAbi, process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS);
        // Create depositFees transaction
        var data = fundManagerContract.methods.ownerWithdraw(currencyCode).encodeABI();
        // Build transaction
        var tx = {
            from: process.env.ETHEREUM_ADMIN_ACCOUNT,
            to: process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS,
            value: 0,
            data: data,
            nonce: yield web3.eth.getTransactionCount(process.env.ETHEREUM_ADMIN_ACCOUNT)
        };
        if (process.env.NODE_ENV !== "production")
            console.log("Withdrawing", currencyCode, "from fund manager to owner:", tx);
        // Estimate gas for transaction
        try {
            tx["gas"] = yield web3.eth.estimateGas(tx);
        }
        catch (error) {
            throw "Failed to estimate gas before signing and sending transaction for ownerWithdraw: " + error;
        }
        // Sign transaction
        try {
            var signedTx = yield web3.eth.accounts.signTransaction(tx, process.env.ETHEREUM_ADMIN_PRIVATE_KEY);
        }
        catch (error) {
            throw "Error signing transaction for ownerWithdraw: " + error;
        }
        // Send transaction
        try {
            var sentTx = yield web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        }
        catch (error) {
            throw "Error sending transaction for ownerWithdraw: " + error;
        }
        console.log("Successfully withdrew", currencyCode, "from fund manager to owner:", sentTx);
        return sentTx;
    });
}
/* SETTING ACCEPTED CURRENCIES */
function setAcceptedCurrencies() {
    return __awaiter(this, void 0, void 0, function* () {
        // Get best currency and pool for potential currency exchange
        try {
            var [bestCurrencyCode, bestPoolName, bestApr] = yield getBestCurrencyAndPool();
        }
        catch (error) {
            return console.error("Failed to get best currency and pool when trying to set accepted currencies:", error);
        }
        var fundManagerContract = new web3.eth.Contract(rariFundManagerAbi, process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS);
        for (const currencyCode of Object.keys(db.currencies))
            if (currencyCode !== "ETH") {
                var accepted = yield fundManagerContract.methods.isAcceptedCurrency(currencyCode).call();
                try {
                    if (!accepted && currencyCode === bestCurrencyCode)
                        yield setAcceptedCurrency(currencyCode, true);
                    else if (accepted && currencyCode !== bestCurrencyCode)
                        yield setAcceptedCurrency(currencyCode, false);
                }
                catch (error) {
                    return console.error(error);
                }
            }
    });
}
function setAcceptedCurrency(currencyCode, accepted) {
    return __awaiter(this, void 0, void 0, function* () {
        var fundManagerContract = new web3.eth.Contract(rariFundManagerAbi, process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS);
        // Create processPendingWithdrawals transaction
        var data = fundManagerContract.methods.setAcceptedCurrency(currencyCode, accepted).encodeABI();
        // Build transaction
        var tx = {
            from: process.env.ETHEREUM_ADMIN_ACCOUNT,
            to: process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS,
            value: 0,
            data: data,
            nonce: yield web3.eth.getTransactionCount(process.env.ETHEREUM_ADMIN_ACCOUNT)
        };
        if (process.env.NODE_ENV !== "production")
            console.log("Setting", currencyCode, "as", accepted ? "accepted" : "not accepted", ":", tx);
        // Estimate gas for transaction
        try {
            tx["gas"] = yield web3.eth.estimateGas(tx);
        }
        catch (error) {
            throw "Failed to estimate gas before signing and sending transaction for setAcceptedCurrency: " + error;
        }
        // Sign transaction
        try {
            var signedTx = yield web3.eth.accounts.signTransaction(tx, process.env.ETHEREUM_ADMIN_PRIVATE_KEY);
        }
        catch (error) {
            throw "Error signing transaction for setAcceptedCurrency: " + error;
        }
        // Send transaction
        try {
            var sentTx = yield web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        }
        catch (error) {
            throw "Error sending transaction for setAcceptedCurrency: " + error;
        }
        console.log("Successfully set", currencyCode, "as", accepted ? "accepted" : "not accepted", ":", sentTx);
        return sentTx;
    });
}
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
                setMaxTokenAllowanceToPool(poolName, currencyCode, unset);
        for (const currencyCode of Object.keys(db.currencies))
            setMaxTokenAllowanceTo0x(currencyCode, unset);
    });
}
function setMaxTokenAllowanceToPool(poolName, currencyCode, unset = false) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Setting " + (unset ? "zero" : "max") + " token allowance for", currencyCode, "on", poolName);
        try {
            var txid = yield approveFundsToPool(poolName, currencyCode, unset ? web3.utils.toBN(0) : web3.utils.toBN(2).pow(web3.utils.toBN(256)).sub(web3.utils.toBN(1)));
        }
        catch (error) {
            console.log("Failed to set " + (unset ? "zero" : "max") + " token allowance for", currencyCode, "on", poolName);
        }
        console.log((unset ? "Zero" : "Max") + " token allowance set successfully for", currencyCode, "on", poolName, ":", txid);
    });
}
function setMaxTokenAllowanceTo0x(currencyCode, unset = false) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Setting " + (unset ? "zero" : "max") + " token allowance for", currencyCode, "on 0x");
        try {
            var txid = yield approveFundsTo0x(currencyCode, unset ? web3.utils.toBN(0) : web3.utils.toBN(2).pow(web3.utils.toBN(256)).sub(web3.utils.toBN(1)));
        }
        catch (error) {
            console.log("Failed to set " + (unset ? "zero" : "max") + " token allowance for", currencyCode, "on 0x");
        }
        console.log((unset ? "Zero" : "Max") + " token allowance set successfully for", currencyCode, "on 0x:", txid);
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
function predictApr(currencyCode, poolName, balanceDifferenceBN) {
    return __awaiter(this, void 0, void 0, function* () {
        if (poolName === "dYdX")
            return yield dydxProtocol.predictApr(currencyCode, db.currencies[currencyCode].tokenAddress, balanceDifferenceBN);
        else if (poolName == "Compound")
            return yield compoundProtocol.predictApr(currencyCode, db.currencies[currencyCode].tokenAddress, balanceDifferenceBN);
        else
            throw "Failed to predict APR for unrecognized pool: " + poolName;
    });
}
function predictBalanceDifferenceBN(currencyCode, poolName, targetApr, aprAtEstimatedBalanceDifference, estimatedBalanceDifferenceBN) {
    return __awaiter(this, void 0, void 0, function* () {
        // Keep guessing: estimatedBalanceDifference = estimatedBalanceDifference / (currentApr - aprAtEstimatedBalanceDifference) * (currentApr - targetApr)
        // Return estimatedBalanceDifference once aprAtEstimatedBalanceDifference is within 1% of targetApr or if we get stuck in a loop
        // TODO: Come up with a better way to avoid getting stuck in a loop than limiting the number of estimates to 10
        var currentApr = db.pools[poolName].currencies[currencyCode].supplyApr;
        for (var i = 0; i < 10; i++) {
            if (Math.abs(targetApr - aprAtEstimatedBalanceDifference) <= targetApr / 100)
                break;
            estimatedBalanceDifferenceBN = estimatedBalanceDifferenceBN.div(currentApr - aprAtEstimatedBalanceDifference).mul(currentApr - targetApr);
            aprAtEstimatedBalanceDifference = yield predictApr(currencyCode, poolName, estimatedBalanceDifferenceBN);
        }
        return estimatedBalanceDifferenceBN;
    });
}
// TODO: Implement proportional currency rebalancing using APR predictions
/* async function getIdealBalancesAllCurrencies(totalBalanceDifferenceUsdBN = web3.utils.toBN(0)) {
    // Get total USD balance
    var totalUsdBN = getRawCombinedUsdBalanceBN();
    
    // Add difference to totalBalance if supplied to this function
    totalUsdBN.iadd(totalBalanceDifferenceUsdBN);
    if (totalUsdBN.isNeg()) throw "Total balance would be negative";

    // Sort all currency-pool combinations by highest to lowest supply rate
    var currencyPoolCombinations = [];
    for (const poolName of Object.keys(db.pools))
        for (const currencyCode of Object.keys(db.pools[poolName].currencies))
            currencyPoolCombinations.push({ currencyCode, poolName, supplyApr: db.pools[poolName].currencies[currencyCode].supplyApr });
    if (currencyPoolCombinations.length <= 1) return currencyPoolCombinations;
    currencyPoolCombinations.sort((a, b) => (a.supplyApr < b.supplyApr) ? 1 : -1);

    // Calculate balance differences and balances
    for (var i = 0; i < currencyPoolCombinations.length; i++) {
        var minApr = currencyPoolCombinations[i + 1] ? currencyPoolCombinations[i + 1].supplyApr : 0;
        var maxBalanceDifference = parseInt(totalUsdBN.toString()) / db.currencies[currencyPoolCombinations[i].currencyCode].usdRate;

        // Predict APR at maxBalanceDifference
        try {
            var predictedApr = await predictApr(currencyPoolCombinations[i].currencyCode, currencyPoolCombinations[i].poolName, web3.utils.toBN(maxBalanceDifference));
        } catch {
            throw "Failed to predict APR";
        }

        if (predictedApr >= minApr) {
            // Set balance difference to maximum since predicted APR is not below the minimum
            currencyPoolCombinations[i].balanceDifferenceBN = web3.utils.toBN(maxBalanceDifference);
            currencyPoolCombinations[i].balanceBN = db.pools[currencyPoolCombinations[i].poolName].currencies[currencyPoolCombinations[i].currencyCode].poolBalanceBN.add(currencyPoolCombinations[i].balanceDifferenceBN);

            // Set other pools' balances to 0 and return
            for (var j = i + 1; j < currencyPoolCombinations.length; j++) {
                currencyPoolCombinations[j].balanceDifferenceBN = web3.utils.toBN(0).sub(db.pools[currencyPoolCombinations[j].poolName].currencies[currencyPoolCombinations[j].currencyCode].poolBalanceBN);
                currencyPoolCombinations[j].balanceBN = 0;
            }

            return currencyPoolCombinations;
        } else {
            // Predict balance difference necessary to equalize APR with the next highest
            try {
                currencyPoolCombinations[i].balanceDifferenceBN = await predictBalanceDifferenceBN(currencyPoolCombinations[i].currencyCode, currencyPoolCombinations[i].poolName, minApr, predictedApr, web3.utils.toBN(maxBalanceDifference));
            } catch {
                throw "Failed to predict balance difference";
            }

            currencyPoolCombinations[i].balanceBN = db.pools[currencyPoolCombinations[i].poolName].currencies[currencyPoolCombinations[i].currencyCode].poolBalanceBN.add(currencyPoolCombinations[i].balanceDifferenceBN);
            totalUsdBN.isubn(currencyPoolCombinations[i].balanceDifferenceBN.toString() * db.currencies[currencyPoolCombinations[i].currencyCode].usdRate);
        }
    }

    return currencyPoolCombinations;
} */
function getIdealBalancesByCurrency(currencyCode, totalBalanceDifferenceBN = web3.utils.toBN(0)) {
    return __awaiter(this, void 0, void 0, function* () {
        // Get total balance of this currency
        var totalBN = getRawTotalBalanceBN(currencyCode);
        // Add difference to totalBalance if supplied to this function
        totalBN.iadd(totalBalanceDifferenceBN);
        if (totalBN.isNeg())
            throw "Total balance would be negative";
        // Sort all pools for this currency by highest to lowest supply rate
        var pools = [];
        for (const poolName of Object.keys(db.pools))
            if (db.pools[poolName].currencies[currencyCode])
                pools.push({ poolName, supplyApr: db.pools[poolName].currencies[currencyCode].supplyApr });
        if (pools.length <= 1)
            return pools;
        pools.sort((a, b) => (a.supplyApr < b.supplyApr) ? 1 : -1);
        // Calculate balance differences and balances
        for (var i = 0; i < pools.length; i++) {
            var minApr = pools[i + 1] ? pools[i + 1].supplyApr : 0;
            var maxBalanceDifferenceBN = totalBN.sub(db.pools[pools[i].poolName].currencies[currencyCode].poolBalanceBN);
            // Predict APR at maxBalanceDifferenceBN
            try {
                var predictedApr = yield predictApr(currencyCode, pools[i].poolName, maxBalanceDifferenceBN);
            }
            catch (_a) {
                throw "Failed to predict APR";
            }
            if (predictedApr >= minApr) {
                // Set balance difference to maximum since predicted APR is not below the minimum
                pools[i].balanceDifferenceBN = maxBalanceDifferenceBN;
                pools[i].balanceBN = db.pools[pools[i].poolName].currencies[currencyCode].poolBalanceBN.add(pools[i].balanceDifferenceBN);
                // Set other pools' balances to 0 and return
                for (var j = i + 1; j < pools.length; j++) {
                    pools[j].balanceBN = web3.utils.toBN(0);
                    pools[j].balanceDifferenceBN = web3.utils.toBN(0).sub(db.pools[pools[j].poolName].currencies[currencyCode].poolBalanceBN);
                }
                return pools;
            }
            else {
                // Predict balance difference necessary to equalize APR with the next highest
                try {
                    pools[i].balanceDifferenceBN = yield predictBalanceDifferenceBN(currencyCode, pools[i].poolName, minApr, predictedApr, maxBalanceDifferenceBN);
                }
                catch (_b) {
                    throw "Failed to predict balance difference";
                }
                pools[i].balanceBN = db.pools[pools[i].poolName].currencies[currencyCode].poolBalanceBN.add(pools[i].balanceDifferenceBN);
                totalBN.isubn(pools[i].balanceBN.toString());
            }
        }
        return pools;
    });
}
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
    // Calculate raw total balance of this currency: start with fundManagerContractBalanceBN
    var totalBalanceBN = db.currencies[currencyCode].fundManagerContractBalanceBN;
    // Add pool balances to totalBalanceBN
    for (const poolName of Object.keys(db.pools))
        if (db.pools[poolName].currencies[currencyCode])
            totalBalanceBN.iadd(db.pools[poolName].currencies[currencyCode].poolBalanceBN);
    return totalBalanceBN;
}
/* function getRawCombinedUsdBalanceBN() {
    // Calculate raw combined USD balance
    var usdBalanceBN = web3.utils.toBN(0);

    // Add currency balances to usdBalanceBN
    for (const currencyCode of Object.keys(db.currencies))
        if (currencyCode !== "ETH")
            usdBalanceBN.iadd(getRawTotalBalanceBN(currencyCode));

    return usdBalanceBN;
} */
function tryBalanceSupply() {
    return __awaiter(this, void 0, void 0, function* () {
        if (db.isBalancingSupply)
            return console.warn("Cannot balance supply: supply balancing already in progress");
        db.isBalancingSupply = true;
        console.log("Trying to balance supply");
        // Get best currency and pool for potential currency exchange
        // TODO: Implement proportional currency rebalancing using APR predictions
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
        // Loop through tokens for exchanges to best currency code
        for (const currencyCode of Object.keys(db.currencies))
            if (currencyCode !== "ETH" && currencyCode !== bestCurrencyCode) {
                // Convert a maximum of the currency's raw total balance at a maximum marginal output according to AUTOMATIC_TOKEN_EXCHANGE_MAX_SLIPPAGE_PER_APR_INCREASE_PER_YEAR_SINCE_LAST_REBALANCING
                var maxInputAmountBN = getRawTotalBalanceBN(currencyCode);
                if (maxInputAmountBN.gt(web3.utils.toBN(0))) {
                    // Calculate min marginal output amount to exchange funds
                    try {
                        var price = yield zeroExExchange.getPrice(currencyCode, bestCurrencyCode);
                    }
                    catch (error) {
                        db.isBalancingSupply = false;
                        return console.error("Failed to get price from 0x API when trying to balance supply:", error);
                    }
                    try {
                        var [bestPoolNameForThisCurrency, bestAprForThisCurrency] = yield getBestPoolByCurrency(currencyCode);
                    }
                    catch (error) {
                        db.isBalancingSupply = false;
                        return console.error("Failed to get best currency and pool when trying to balance supply:", error);
                    }
                    // TODO: Include miner fee and 0x protocol fee in calculation of min marginal output amount
                    var maxMarginalOutputAmount = 1 / parseFloat(price);
                    var minMarginalOutputAmountBN = web3.utils.toBN(maxMarginalOutputAmount * (1 - (parseFloat(process.env.AUTOMATIC_TOKEN_EXCHANGE_MAX_SLIPPAGE_PER_APR_INCREASE_PER_YEAR_SINCE_LAST_REBALANCING) * (bestApr - bestAprForThisCurrency) * (secondsSinceLastSupplyBalancing / 86400 / 365))) * (Math.pow(10, db.currencies[bestCurrencyCode].decimals)));
                    // Get estimated filled input amount from 0x swap API
                    try {
                        var [orders, estimatedInputAmountBN, protocolFee, takerAssetFilledAmountBN] = yield zeroExExchange.getSwapOrders(db.currencies[currencyCode].tokenAddress, db.currencies[currencyCode].decimals, db.currencies[bestCurrencyCode].tokenAddress, maxInputAmountBN, minMarginalOutputAmountBN);
                    }
                    catch (error) {
                        db.isBalancingSupply = false;
                        return console.error("Failed to get swap orders from 0x API when trying to balance supply:", error);
                    }
                    // Withdraw estimatedInputAmountBN tokens from pools in order of lowest to highest supply rate
                    var pools = db.currencies[currencyCode].pools.slice();
                    pools.sort((a, b) => (a.supplyApr > b.supplyApr) ? 1 : -1);
                    for (const poolName of Object.keys(pools)) {
                        if (db.currencies[currencyCode].fundManagerContractBalanceBN.gte(estimatedInputAmountBN))
                            break;
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
                    }
                    // Exchange tokens!
                    try {
                        var txid = yield exchangeFunds(currencyCode, bestCurrencyCode, takerAssetFilledAmountBN, orders, web3.utils.toBN(protocolFee));
                    }
                    catch (error) {
                        // Retry up to 2 more times
                        for (var i = 0; i < 3; i++) {
                            try {
                                var [orders, newEstimatedInputAmountBN, protocolFee, takerAssetFilledAmountBN] = yield zeroExExchange.getSwapOrders(db.currencies[currencyCode].tokenAddress, db.currencies[currencyCode].decimals, db.currencies[bestCurrencyCode].tokenAddress, estimatedInputAmountBN, minMarginalOutputAmountBN);
                            }
                            catch (error) {
                                db.isBalancingSupply = false;
                                return console.error("Failed to get swap orders from 0x API when trying to balance supply:", error);
                            }
                            try {
                                var txid = yield exchangeFunds(currencyCode, bestCurrencyCode, takerAssetFilledAmountBN, orders, web3.utils.toBN(protocolFee));
                                break;
                            }
                            catch (error) {
                                // Stop trying on 3rd error
                                if (i == 3) {
                                    db.isBalancingSupply = false;
                                    return console.error("Failed 3 times to exchange", currencyCode, "to", bestCurrencyCode, "when balancing supply:", error);
                                }
                            }
                        }
                    }
                    yield checkCurrencyBalances(currencyCode);
                    yield checkCurrencyBalances(bestCurrencyCode);
                }
            }
        // Loop through tokens again for rebalancing across pools
        for (const currencyCode of Object.keys(db.currencies))
            if (currencyCode !== "ETH") {
                // Get ideal balances
                try {
                    var idealBalances = yield getIdealBalancesByCurrency(currencyCode);
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
                    // Get expected additional yearly interest
                    var expectedAdditionalYearlyInterest = 0;
                    for (var i = 0; i < idealBalances.length; i++) {
                        var balanceDifference = parseInt(idealBalances[i].balanceDifferenceBN.toString()); // TODO: BN.prototype.toNumber replacement
                        expectedAdditionalYearlyInterest += balanceDifference * idealBalances[i].supplyApr;
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
            }
        db.isBalancingSupply = false;
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
                if (poolBalances[i].poolName === "dYdX")
                    gasNecessary += 300000; // TODO: Correct dYdX gas prices
                else if (poolBalances[i].poolName === "Compound")
                    gasNecessary += currencyCode === "DAI" ? 300000 : 150000;
                else
                    gasNecessary += 300000; // TODO: Correct default gas price assumption
            }
            else if (poolBalances[i].balanceDifferenceBN.isNeg()) {
                if (poolBalances[i].poolName === "dYdX")
                    gasNecessary += 300000; // TODO: Correct dYdX gas prices
                else if (poolBalances[i].poolName === "Compound")
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
                    var txid = yield removeFunds(poolBalances[i].poolName, currencyCode, poolBalances[i].balanceDifferenceBN.abs(), poolBalances[i].balanceBN.isZero());
                }
                catch (error) {
                    throw "Failed to remove funds from pool " + poolBalances[i].poolName + " when balancing supply of " + currencyCode + ": " + error;
                }
                // Update pool's currency balance
                db.pools[poolBalances[i].poolName].currencies[currencyCode].poolBalanceBN = poolBalances[i].balanceBN.toString();
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
                    var txid = yield addFunds(poolBalances[i].poolName, currencyCode, poolBalances[i].balanceDifferenceBN);
                }
                catch (error) {
                    throw "Failed to add funds to pool when balancing supply of " + currencyCode + ": " + error;
                }
                // Update pool's currency balance
                db.pools[poolBalances[i].poolName].currencies[currencyCode].poolBalanceBN = poolBalances[i].balanceBN.toString();
                totalBalanceDifferenceBN.iadd(poolBalances[i].balanceDifferenceBN);
            }
        // Update wallet balance in mock database
        db.currencies[currencyCode].fundManagerContractBalanceBN = db.currencies[currencyCode].fundManagerContractBalanceBN.sub(totalBalanceDifferenceBN);
    });
}
function approveFundsToPool(poolName, currencyCode, amountBN) {
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
function approveFundsTo0x(currencyCode, amountBN) {
    return __awaiter(this, void 0, void 0, function* () {
        var fundManagerContract = new web3.eth.Contract(rariFundManagerAbi, process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS);
        // Create depositToPool transaction
        var data = fundManagerContract.methods.approveTo0x(currencyCode, amountBN).encodeABI();
        // Build transaction
        var tx = {
            from: process.env.ETHEREUM_ADMIN_ACCOUNT,
            to: process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS,
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
function exchangeFunds(inputCurrencyCode, outputCurrencyCode, takerAssetFillAmountBN, orders, protocolFeeBN) {
    return __awaiter(this, void 0, void 0, function* () {
        // Build array of orders and signatures
        var signatures = [];
        for (var i = 0; i < orders.length; i++) {
            signatures[i] = orders[i].signature;
            orders[i] = {
                makerAddress: orders[i].makerAddress,
                takerAddress: orders[i].takerAddress,
                feeRecipientAddress: orders[i].feeRecipientAddress,
                senderAddress: orders[i].senderAddress,
                makerAssetAmount: orders[i].makerAssetAmount,
                takerAssetAmount: orders[i].takerAssetAmount,
                makerFee: orders[i].makerFee,
                takerFee: orders[i].takerFee,
                expirationTimeSeconds: orders[i].expirationTimeSeconds,
                salt: orders[i].salt,
                makerAssetData: orders[i].makerAssetData,
                takerAssetData: orders[i].takerAssetData,
                makerFeeAssetData: orders[i].makerFeeAssetData,
                takerFeeAssetData: orders[i].takerFeeAssetData
            };
        }
        // Instansiate FundManagerContract
        var fundManagerContract = new web3.eth.Contract(rariFundManagerAbi, process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS);
        // Create marketSell0xOrdersFillOrKill transaction
        var data = fundManagerContract.methods.marketSell0xOrdersFillOrKill(orders, signatures, takerAssetFillAmountBN).encodeABI();
        // Build transaction
        var tx = {
            from: process.env.ETHEREUM_ADMIN_ACCOUNT,
            to: process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS,
            value: protocolFeeBN,
            data: data,
            nonce: yield web3.eth.getTransactionCount(process.env.ETHEREUM_ADMIN_ACCOUNT)
        };
        if (process.env.NODE_ENV !== "production")
            console.log("Exchanging up to", takerAssetFillAmountBN.toString(), inputCurrencyCode, "to", outputCurrencyCode, ":", tx);
        // Estimate gas for transaction
        try {
            tx["gas"] = yield web3.eth.estimateGas(tx);
        }
        catch (error) {
            throw "Failed to estimate gas before signing and sending transaction for marketSell0xOrdersFillOrKill to exchange " + inputCurrencyCode + " to " + outputCurrencyCode + ": " + error;
        }
        // Sign transaction
        try {
            var signedTx = yield web3.eth.accounts.signTransaction(tx, process.env.ETHEREUM_ADMIN_PRIVATE_KEY);
        }
        catch (error) {
            throw "Error signing transaction for marketSell0xOrdersFillOrKill to exchange " + inputCurrencyCode + " to " + outputCurrencyCode + ": " + error;
        }
        // Send transaction
        try {
            var sentTx = yield web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        }
        catch (error) {
            throw "Error sending transaction for marketSell0xOrdersFillOrKill to exchange " + inputCurrencyCode + " to " + outputCurrencyCode + ": " + error;
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
function checkCurrencyBalances(currencyCode) {
    return __awaiter(this, void 0, void 0, function* () {
        yield checkFundManagerContractBalance(currencyCode);
        yield checkCurrencyPoolBalances(currencyCode);
    });
}
function checkFundManagerContractBalances() {
    return __awaiter(this, void 0, void 0, function* () {
        for (const currencyCode of Object.keys(db.currencies))
            yield checkFundManagerContractBalance(currencyCode);
    });
}
function checkFundManagerContractBalance(currencyCode) {
    return __awaiter(this, void 0, void 0, function* () {
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
function checkCurrencyPoolBalances(currencyCode) {
    return __awaiter(this, void 0, void 0, function* () {
        // Get balances for all pools
        for (const poolName of Object.keys(db.pools)) {
            try {
                if (poolName === "dYdX") {
                    // Might as well get all dYdX balances since it doesn't cost us anything
                    // Yes, I know I am overwriting currencyCode; doesn't matter
                    var currencyCodesByTokenAddress = {};
                    for (const currencyCode of Object.keys(db.pools[poolName].currencies))
                        currencyCodesByTokenAddress[db.currencies[currencyCode].tokenAddress] = currencyCode;
                    var balances = yield dydxProtocol.getUnderlyingBalances(currencyCodesByTokenAddress);
                    for (const currencyCode of Object.keys(balances))
                        db.pools[poolName].currencies[currencyCode].poolBalanceBN = balances[currencyCode];
                }
                else if (poolName == "Compound") {
                    try {
                        db.pools[poolName].currencies[currencyCode].poolBalanceBN = yield compoundProtocol.getUnderlyingBalance(currencyCode);
                    }
                    catch (error) {
                        return console.error("Failed to get", currencyCode, "balance on Compound:", error);
                    }
                }
                else
                    return console.error("Failed to get balances for unrecognized pool:", poolName);
            }
            catch (error) {
                console.error("Failed to get balance of", currencyCode, "for", poolName, "pool:", error);
            }
        }
    });
}
//# sourceMappingURL=index.js.map