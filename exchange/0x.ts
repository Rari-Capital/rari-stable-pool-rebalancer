import Web3 from 'web3';
const https = require('https');

class ZeroExExchange {
    web3: Web3;

    constructor(web3: Web3) {
        this.web3 = web3;
    }

    async getPrice(inputTokenSymbol, outputTokenSymbol) {
        return new Promise((resolve, reject) => {
            https.get('https://api.0x.org/swap/v0/prices?sellToken=' + inputTokenSymbol, (resp) => {
                let data = '';

                // A chunk of data has been recieved
                resp.on('data', (chunk) => {
                    data += chunk;
                });

                // The whole response has been received
                resp.on('end', () => {
                    var decoded = JSON.parse(data);
                    if (!decoded) reject("Failed to decode prices from 0x swap API");
                    if (!decoded.records) reject("No prices found on 0x swap API");

                    // TODO: Make sure orders from API are sorted in ascending order of price
                    for (var i = 0; i < decoded.records.length; i++)
                        if (decoded.records[i].symbol === outputTokenSymbol)
                            resolve(decoded.records[i].price);
                    
                    reject("Price not found on 0x swap API");
                });
            }).on("error", (err) => {
                reject("Error requesting prices from 0x swap API: " + err.message);
            });
        });
    }

    async getSwapOrders(inputTokenAddress, outputTokenAddress, maxInputAmountBN, minMarginalOutputAmountBN) {
        return new Promise((resolve, reject) => {
            https.get('https://api.0x.org/swap/v0/quote?sellToken=' + inputTokenAddress + '&buyToken=' + outputTokenAddress + '&sellAmount=' + maxInputAmountBN.toString(), (resp) => {
                let data = '';

                // A chunk of data has been recieved
                resp.on('data', (chunk) => {
                    data += chunk;
                });

                // The whole response has been received
                resp.on('end', () => {
                    var decoded = JSON.parse(data);
                    if (!decoded) reject("Failed to decode quote from 0x swap API");
                    if (!decoded.orders) reject("No orders found on 0x swap API");

                    var orders = [];
                    var filledInputAmountBN = this.web3.utils.toBN(0);
            
                    // TODO: Make sure orders from API are sorted in ascending order of price
                    for (var i = 0; i < decoded.orders.length; i++) {
                        var takerAssetAmountBN = this.web3.utils.toBN(orders[i].takerAssetAmount);
                        if (this.web3.utils.toBN(orders[i].makerAssetAmount).lt(takerAssetAmountBN.mul(minMarginalOutputAmountBN).div(this.web3.utils.toBN(10).pow(this.web3.utils.toBN(18))))) break;
                        var takerAssetFilledAmountBN = maxInputAmountBN.sub(filledInputAmountBN).lte(takerAssetAmountBN) ? maxInputAmountBN.sub(filledInputAmountBN) : takerAssetAmountBN;
                        filledInputAmountBN.iadd(takerAssetFilledAmountBN);
                        if (filledInputAmountBN.eq(maxInputAmountBN)) break;
                    }

                    if (filledInputAmountBN.isZero()) reject("No orders satisfying minMarginalOutputAmountBN found on 0x swap API");
                    // TODO: Make sure returned orders are sorted in ascending order of price
                    resolve([orders, filledInputAmountBN]);
                });
            }).on("error", (err) => {
                reject("Error requesting quote from 0x swap API: " + err.message);
            });
        });
    }
}

module.exports = ZeroExExchange;
