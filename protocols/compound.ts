import fs from 'fs';
import Web3 from 'web3';

const erc20Abi = JSON.parse(fs.readFileSync(__dirname + '/../abi/ERC20.json', 'utf8'));
const cErc20DelegatorAbi = JSON.parse(fs.readFileSync(__dirname + '/compound/CErc20Delegator.json', 'utf8'));
const interestRateModelAbi = JSON.parse(fs.readFileSync(__dirname + '/compound/InterestRateModel.json', 'utf8'));

export default class CompoundProtocol {
    web3: Web3;
    
    cErc20Contracts = {
        "DAI": "0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643",
        "USDC": "0x39AA39c021dfbaE8faC545936693aC917d5E7563",
        "USDT": "0xf650C3d88D12dB855b8bf7D11Be6C55A4e07dCC9"
    };

    constructor(web3: Web3) {
        this.web3 = web3;
    }

    async getCashPriorBN(currencyCode, underlyingTokenAddress) {
        var erc20Contract = new this.web3.eth.Contract(erc20Abi, underlyingTokenAddress);

        try {
            return this.web3.utils.toBN(await erc20Contract.methods.balanceOf(this.cErc20Contracts[currencyCode]).call());
        } catch (error) {
            throw "Failed to get prior cash of cToken for " + currencyCode + ": " + error;
        }
    }

    // DAI & USDT
    async getSupplyRatePerBlockBN(currencyCode, underlyingTokenAddress, supplyDifferenceBN) {
        if (["DAI", "USDT"].indexOf(currencyCode) < 0) throw "Invalid currency code";
        var totalCashBN = (await this.getCashPriorBN(currencyCode, underlyingTokenAddress)).add(supplyDifferenceBN);
        var cErc20Contract = new this.web3.eth.Contract(cErc20DelegatorAbi, this.cErc20Contracts[currencyCode]);

        try {
            var totalBorrows = await cErc20Contract.methods.totalBorrows().call();
        } catch (error) {
            throw "Failed to get total borrows of cToken for " + currencyCode + ": " + error;
        }

        try {
            var totalReserves = await cErc20Contract.methods.totalReserves().call();
        } catch (error) {
            throw "Failed to get total reserves of cToken for " + currencyCode + ": " + error;
        }

        var reserveFactorBN = this.web3.utils.toBN(currencyCode == "DAI" ? "50000000000000000" : 0);
        var interestRateModelContract = new this.web3.eth.Contract(interestRateModelAbi, currencyCode == "DAI" ? "0x000000007675b5e1da008f037a0800b309e0c493" : "0x6bc8fe27d0c7207733656595e73c0d5cf7afae36");
        
        try {
            return this.web3.utils.toBN(await interestRateModelContract.methods.getSupplyRate(totalCashBN, totalBorrows, totalReserves, reserveFactorBN).call());
        } catch (error) {
            throw "Failed to get supply rate of cToken for " + currencyCode + ": " + error;
        }
    }

    // Exchange rate (scaled by 1e18)
    getUsdcExchangeRateBN(totalSupplyBN, totalCashBN, totalBorrowsBN, totalReservesBN) {
        if (totalSupplyBN.isZero()) return this.web3.utils.toBN(200000000000000);
        else return totalCashBN.add(totalBorrowsBN).sub(totalReservesBN).sub(totalSupplyBN);
    }

    async getUsdcSupplyRatePerBlockBN(underlyingTokenAddress, supplyDifferenceBN) {
        var cErc20Contract = new this.web3.eth.Contract(cErc20DelegatorAbi, this.cErc20Contracts["USDC"]);

        try {
            var totalBorrowsBN = this.web3.utils.toBN(await cErc20Contract.methods.totalBorrows().call());
        } catch (error) {
            throw "Failed to get total borrows of cToken for USDC: " + error;
        }

        try {
            var totalReservesBN = this.web3.utils.toBN(await cErc20Contract.methods.totalReserves().call());
        } catch (error) {
            throw "Failed to get total reserves of cToken for USDC: " + error;
        }

        try {
            var totalSupplyBN = this.web3.utils.toBN(await cErc20Contract.methods.totalSupply().call()).add(supplyDifferenceBN);
        } catch (error) {
            throw "Failed to get total supply of cToken for USDC: " + error;
        }
        
        var totalCashBN = (await this.getCashPriorBN("USDC", underlyingTokenAddress)).add(supplyDifferenceBN);
        var exchangeRateBN = await this.getUsdcExchangeRateBN(totalSupplyBN, totalCashBN, totalBorrowsBN, totalReservesBN);
        var reserveFactorBN = this.web3.utils.toBN("50000000000000000");
        
        /* We calculate the supply rate:
        *  underlying = totalSupply × exchangeRate
        *  borrowsPer = totalBorrows ÷ underlying
        *  supplyRate = borrowRate × (1-reserveFactor) × borrowsPer
        */
        var interestRateModelContract = new this.web3.eth.Contract(interestRateModelAbi, "0x0c3f8df27e1a00b47653fde878d68d35f00714c0");

        try {
            var borrowRateBN = this.web3.utils.toBN(await interestRateModelContract.methods.getBorrowRate(totalCashBN, totalBorrowsBN, 0).call()); // Total reserves = 0 because not used by WhitePaperInterestRateModel
        } catch (error) {
            throw "Failed to get borrow rate of InterestRateModel for cToken for USDC: " + error;
        }
        
        var underlyingBN = exchangeRateBN.mul(totalSupplyBN);
        var borrowsPerBN = totalBorrowsBN.div(underlyingBN);
        var oneMinusReserveFactorBN = this.web3.utils.toBN(1e18).sub(reserveFactorBN);
        var supplyRateBN = borrowRateBN.mul(oneMinusReserveFactorBN).mul(borrowsPerBN);
        return supplyRateBN;
    }

    async predictApr(currencyCode, underlyingTokenAddress, supplyWeiDifferenceBN) {
        if (["DAI", "USDT"].indexOf(currencyCode) >= 0) return await this.getSupplyRatePerBlockBN(currencyCode, underlyingTokenAddress, supplyWeiDifferenceBN);
        else if (["USDC"].indexOf(currencyCode) >= 0) return await this.getUsdcSupplyRatePerBlockBN(underlyingTokenAddress, supplyWeiDifferenceBN);
        else throw "Currency code not supported by Compound implementation";
    }

    supplyRatePerBlockToApr(supplyRatePerBlock) {
        // TODO: Use big numbers for Compound APR calculations
        // TODO: Get blocksPerYear dynamically from interestRateModel.blocksPerYear
        var blocksPerYear = 2102400; // See https://github.com/compound-finance/compound-protocol/blob/v2.6-rc2/contracts/JumpRateModel.sol#L23 and https://github.com/compound-finance/compound-protocol/blob/v2.6-rc2/contracts/WhitePaperInterestRateModel.sol#L24
        var apr = (supplyRatePerBlock / 1e18) * blocksPerYear;
        return apr;
    }

    async getApr(currencyCode) {
        if (!this.cErc20Contracts[currencyCode]) throw "No cToken known for currency code " + currencyCode;
        // TODO: Remove @ts-ignore below
        // @ts-ignore: Argument of type [...] is not assignable to parameter of type 'AbiItem | AbiItem[]'.
        var cErc20Contract = new this.web3.eth.Contract(cErc20DelegatorAbi, this.cErc20Contracts[currencyCode]);

        try {
            var supplyRatePerBlock = await cErc20Contract.methods.supplyRatePerBlock().call();
        } catch (error) {
            throw "Failed to get Compound " + currencyCode + " supplyRatePerBlock: " + error;
        }

        return this.supplyRatePerBlockToApr(supplyRatePerBlock);
    }

    async getAprs(currencyCodes) {
        var aprs = {};
        for (var i = 0; i < currencyCodes.length; i++) aprs[currencyCodes[i]] = await this.getApr(currencyCodes[i]);
        return aprs;
    }

    async getUnderlyingBalance(currencyCode) {
        if (!this.cErc20Contracts[currencyCode]) throw "Invalid currency code supplied to CompoundProtocol.getUnderlyingBalance";
        // TODO: Remove @ts-ignore below
        // @ts-ignore: Argument of type [...] is not assignable to parameter of type 'AbiItem | AbiItem[]'.
        var cErc20Contract = new this.web3.eth.Contract(cErc20DelegatorAbi, this.cErc20Contracts[currencyCode]);
        
        try {
            var balanceOfUnderlying = await cErc20Contract.methods.balanceOfUnderlying(process.env.ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS).call();
        } catch (error) {
            throw "Error when checking underlying Compound balance of " + currencyCode + ":" + error;
        }

        if (process.env.NODE_ENV !== "production") console.log("CompoundProtocol.getUnderlyingBalance got", balanceOfUnderlying, currencyCode);
        return this.web3.utils.toBN(balanceOfUnderlying);
    }

    async getUnderlyingBalances(currencyCodes) {
        var balances = {};

        // For each currency
        for (var i = 0; i < currencyCodes.length; i++) {
            try {
                balances[currencyCodes[i]] = await this.getUnderlyingBalance(currencyCodes[i]);
            } catch (error) {
                console.log(error);
            }
        }

        return balances;
    }
}
