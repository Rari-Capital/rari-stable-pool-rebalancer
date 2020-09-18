import fs from 'fs';
import https from 'https';
import Web3 from 'web3';

const mAssetAbi = JSON.parse(fs.readFileSync(__dirname + '/mstable/Masset.json', 'utf8'));
const savingsContractAbi = JSON.parse(fs.readFileSync(__dirname + '/mstable/SavingsContract.json', 'utf8'));
const mAssetValidationHelperAbi = JSON.parse(fs.readFileSync(__dirname + '/mstable/MassetValidationHelper.json', 'utf8'));

export default class MStableProtocol {
    web3: Web3;

    mUsdTokenContract = "0xe2f2a5c287993345a840db3b0845fbc70f5935a5";
    savingsContract = "0xcf3f73290803fc04425bee135a4caeb2bab2c2a1";
    mAssetValidationHelperContract = "0xabcc93c3be238884cc3309c19afd128fafc16911";

    constructor(web3: Web3) {
        this.web3 = web3;
    }

    async getSwapFee() {
        // TODO: Remove @ts-ignore below
        // @ts-ignore: Argument of type [...] is not assignable to parameter of type 'AbiItem | AbiItem[]'.
        var mUsdTokenContract = new this.web3.eth.Contract(mAssetAbi, this.mUsdTokenContract);
        
        try {
            var swapFee = await mUsdTokenContract.methods.swapFee().call();
        } catch (error) {
            throw "Error when checking mUSD swap fee: " + error;
        }

        if (process.env.NODE_ENV !== "production") console.log("MStableProtocol.getSwapFee got", swapFee / 1e18, "%");
        return this.web3.utils.toBN(swapFee);
    }

    async getMaxSwap(inputTokenAddress, outputTokenAddress) {
        // TODO: Remove @ts-ignore below
        // @ts-ignore: Argument of type [...] is not assignable to parameter of type 'AbiItem | AbiItem[]'.
        var mAssetValidationHelperContract = new this.web3.eth.Contract(mAssetValidationHelperAbi, this.mAssetValidationHelperContract);
        
        try {
            var data = await mAssetValidationHelperContract.methods.getMaxSwap(this.mUsdTokenContract, inputTokenAddress, outputTokenAddress).call();
        } catch (error) {
            throw "Error when checking mUSD max swap: " + error;
        }

        if (process.env.NODE_ENV !== "production") console.log("MStableProtocol.getMaxSwap got", data);
        return data;
    }

    async getRedeemValidity(inputAmountBN, outputTokenAddress) {
        // TODO: Remove @ts-ignore below
        // @ts-ignore: Argument of type [...] is not assignable to parameter of type 'AbiItem | AbiItem[]'.
        var mAssetValidationHelperContract = new this.web3.eth.Contract(mAssetValidationHelperAbi, this.mAssetValidationHelperContract);
        
        try {
            var data = await mAssetValidationHelperContract.methods.getRedeemValidity(this.mUsdTokenContract, inputAmountBN, outputTokenAddress).call();
        } catch (error) {
            throw "Error when checking mUSD redeem validity: " + error;
        }

        if (process.env.NODE_ENV !== "production") console.log("MStableProtocol.getRedeemValidity got", data);
        return data;
    }

    async predictApr(supplyWeiDifferenceBN) {
        // TODO: MStableProtocol.predictApr
        return this.getApr();
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
            const diff = rateDecimals ** portionsInYear;
            const parsed = diff * SCALE;
            return Web3.utils.toBN((parsed - SCALE).toFixed(0)) || Web3.utils.toBN(0);
        }
    
        return Web3.utils.toBN(0);
    }

    async getApr() {
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
            var req = https.request('https://api.thegraph.com/subgraphs/name/mstable/mstable-protocol', {
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
                    if (!decoded || !decoded.data) return reject("Failed to decode exchange rates from The Graph when calculating mStable 24-hour APY");
                    resolve(parseFloat(this.calculateApy(epoch24HrsAgo, decoded.data.day0[0].exchangeRate, epochNow, decoded.data.day1[0].exchangeRate).toString()) / 1e18);
                });
            });

            req.on("error", (err) => {
                reject("Error requesting exchange rates from The Graph when calculating mStable 24-hour APY: " + err.message);
            });

            req.write(body);
            req.end();
        });
    }

    async getMUsdSavingsBalance() {
        // TODO: Remove @ts-ignore below
        // @ts-ignore: Argument of type [...] is not assignable to parameter of type 'AbiItem | AbiItem[]'.
        var savingsContract = new this.web3.eth.Contract(savingsContractAbi, this.savingsContract);
        
        try {
            var creditBalance = await savingsContract.methods.creditBalances(process.env.ETHEREUM_FUND_CONTROLLER_CONTRACT_ADDRESS).call();
        } catch (error) {
            throw "Error when checking mStable savings credit balance to calculate mUSD savings balance: " + error;
        }
        
        try {
            var exchangeRate = await savingsContract.methods.exchangeRate().call();
        } catch (error) {
            throw "Error when checking mStable savings exchange rate to calculate mUSD savings balance: " + error;
        }

        var balanceBN = this.web3.utils.toBN(creditBalance).mul(this.web3.utils.toBN(exchangeRate)).div(this.web3.utils.toBN(1e18));
        if (process.env.NODE_ENV !== "production") console.log("MStableProtocol.getMUsdSavingsBalance got", balanceBN.toString(), "mUSD");
        return balanceBN;
    }

    async getMUsdBalance() {
        // TODO: Remove @ts-ignore below
        // @ts-ignore: Argument of type [...] is not assignable to parameter of type 'AbiItem | AbiItem[]'.
        var mUsdTokenContract = new this.web3.eth.Contract(mAssetAbi, this.mUsdTokenContract);
        
        try {
            var balance = await mUsdTokenContract.methods.balanceOf(process.env.ETHEREUM_FUND_CONTROLLER_CONTRACT_ADDRESS).call();
        } catch (error) {
            throw "Error when checking mUSD balance: " + error;
        }

        if (process.env.NODE_ENV !== "production") console.log("MStableProtocol.getMUsdBalance got", balance, "mUSD");
        return this.web3.utils.toBN(balance);
    }
}
