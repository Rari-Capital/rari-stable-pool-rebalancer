module.exports = {
  apps : [{
    name: 'rari-fund-rebalancer',
    script: 'index.js',

    // Options reference: https://pm2.keymetrics.io/docs/usage/application-declaration/
    // args: 'one two',
    // instances: 1,
    // autorestart: true,
    // watch: false,
    // max_memory_restart: '1G',
    time: true,
    env: {
      NODE_ENV: 'development',
      ETHEREUM_ADMIN_ACCOUNT: '0x637F5E3A1E40bc5aaa8eADf7CC5e1C6D9120B49a',
      ETHEREUM_ADMIN_PRIVATE_KEY: '',
      ETHEREUM_FUND_CONTROLLER_CONTRACT_ADDRESS: '0x2440929628eB33f29656Ed386805C2353b43EaB6',
      ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS: '0x66507090dECA9332502AE09071DB1a0fF7adEddf',
      WEB3_HTTP_PROVIDER_URL: "http://localhost:8546",
      REBALANCER_CYCLE_DELAY_SECONDS: 60,
      AUTOMATIC_SUPPLY_BALANCING_ENABLED: 1,
      AUTOMATIC_SUPPLY_BALANCING_MIN_ADDITIONAL_YEARLY_INTEREST_USD_TIMES_YEARS_SINCE_LAST_REBALANCING_PER_GAS_USD: 0.001, // The minimum algorithmic net value of an automatic supply rebalancing required to actually execute it (algorithmic net value of a rebalancing = additional yearly interest in USD expected from the rebalancing (including COMP) * seconds since last rebalancing of this currency / maximum possible Ethereum gas fees in USD required for the rebalancing); in theory, set is 1 to break even (right?)
      PROPORTIONAL_SUPPLY_BALANCING_ENABLED: 0,
      AUTOMATIC_TOKEN_EXCHANGE_ENABLED: 1,
      AUTOMATIC_TOKEN_EXCHANGE_MAX_SLIPPAGE_PER_APR_INCREASE_PER_YEAR_SINCE_LAST_EXCHANGE: 1000, // The maximum amount of slippage including taker fees (from 0 to 1) per addition of APR (from 0 to 1) including COMP (at current trade price) per the number of years since the last exchange from this input currency to this output currency; in theory, max slippage per APR increase per year since last rebalancing is 1 to break even; formula: maximum slippage including taker fees (from 0 to 1) = X * (addition of APR (from 0 to 1) including COMP (at current trade price)) * (years since the last exchange from this input currency to this output currency) // TODO: Include 0x protocol fees and miner fees in slippage
      UPDATE_CURRENCY_USD_RATES_INTERVAL_SECONDS: 30 * 60,
      CLAIM_INTEREST_FEES_REGULARLY: 1,
      CLAIM_INTEREST_FEES_INTERVAL_SECONDS: 86400,
      CLAIM_AND_EXCHANGE_COMP_REGULARLY: 1,
      CLAIM_AND_EXCHANGE_COMP_INTERVAL_SECONDS: 3 * 86400,
      GAS_LIMIT_MULTIPLIER: 1.3,
      ALWAYS_ACCEPTED_CURRENCIES: "DAI,USDC,USDT",
      NEVER_ACCEPTED_CURRENCIES: ""
    },
    env_production: {
      NODE_ENV: 'production',
      ETHEREUM_ADMIN_ACCOUNT: '0x637F5E3A1E40bc5aaa8eADf7CC5e1C6D9120B49a',
      ETHEREUM_ADMIN_PRIVATE_KEY: '',
      WEB3_HTTP_PROVIDER_URL: "https://mainnet.infura.io/v3/c52a3970da0a47978bee0fe7988b67b6",
      REBALANCER_CYCLE_DELAY_SECONDS: 60,
      ETHEREUM_FUND_CONTROLLER_CONTRACT_ADDRESS: '0x2440929628eB33f29656Ed386805C2353b43EaB6',
      ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS: '0x66507090dECA9332502AE09071DB1a0fF7adEddf',
      AUTOMATIC_SUPPLY_BALANCING_ENABLED: 1,
      AUTOMATIC_SUPPLY_BALANCING_MIN_ADDITIONAL_YEARLY_INTEREST_USD_TIMES_YEARS_SINCE_LAST_REBALANCING_PER_GAS_USD: 1.0, // The minimum algorithmic net value of an automatic supply rebalancing required to actually execute it (algorithmic net value of a rebalancing = additional yearly interest in USD expected from the rebalancing (including COMP) * seconds since last rebalancing of this currency / maximum possible Ethereum gas fees in USD required for the rebalancing); in theory, set is 1 to break even (right?)
      PROPORTIONAL_SUPPLY_BALANCING_ENABLED: 0,
      AUTOMATIC_TOKEN_EXCHANGE_ENABLED: 0,
      AUTOMATIC_TOKEN_EXCHANGE_MAX_SLIPPAGE_PER_APR_INCREASE_PER_YEAR_SINCE_LAST_EXCHANGE: 1.0, // The maximum amount of slippage including taker fees (from 0 to 1) per addition of APR (from 0 to 1) including COMP (at current trade price) per the number of years since the last exchange from this input currency to this output currency; in theory, max slippage per APR increase per year since last rebalancing is 1 to break even; formula: maximum slippage including taker fees (from 0 to 1) = X * (addition of APR (from 0 to 1) including COMP (at current trade price)) * (years since the last exchange from this input currency to this output currency) // TODO: Include 0x protocol fees and miner fees in slippage
      UPDATE_CURRENCY_USD_RATES_INTERVAL_SECONDS: 30 * 60,
      CLAIM_INTEREST_FEES_REGULARLY: 0,
      CLAIM_INTEREST_FEES_INTERVAL_SECONDS: 86400,
      CLAIM_AND_EXCHANGE_COMP_REGULARLY: 0,
      CLAIM_AND_EXCHANGE_COMP_INTERVAL_SECONDS: 7 * 86400,
      GAS_LIMIT_MULTIPLIER: 1.3,
      ALWAYS_ACCEPTED_CURRENCIES: "DAI,USDC,USDT",
      NEVER_ACCEPTED_CURRENCIES: ""
    }
  }]
};
