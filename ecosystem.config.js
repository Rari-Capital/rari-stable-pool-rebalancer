module.exports = {
  apps : [{
    name: 'farmer-fund-rebalancer',
    script: 'index.js',

    // Options reference: https://pm2.keymetrics.io/docs/usage/application-declaration/
    // args: 'one two',
    // instances: 1,
    // autorestart: true,
    // watch: false,
    // max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS: '0xCa3187F301920877795EfD16B5f920aABC7a9cC2',
      ETHEREUM_ADMIN_ACCOUNT: '0x637F5E3A1E40bc5aaa8eADf7CC5e1C6D9120B49a',
      ETHEREUM_ADMIN_PRIVATE_KEY: 'C721ABE244F3C55B3CA8F7395F3D1EFE97ED8BED200C235DC2F3FCD9873ACCE3',
      INFURA_ENDPOINT_URL: "https://mainnet.infura.io/v3/c52a3970da0a47978bee0fe7988b67b6",
      CMC_PRO_API_KEY: "553ca912-5740-4550-88f1-ad68fdbb1592",
      AUTOMATIC_SUPPLY_BALANCING_ENABLED: 1,
      AUTOMATIC_SUPPLY_BALANCING_MIN_ALGORITHMIC_NET_VALUE: 1000000, // The minimum algorithmic net value of an automatic supply rebalancing required to actually execute it (algorithmic net value of a rebalancing = additional yearly interest in USD expected from the rebalancing * seconds since last rebalancing / maximum possible Ethereum gas fees in USD required for the rebalancing)
      WITHDRAWAL_QUEUE_ENABLED: 1,
      UPDATE_CURRENCY_USD_RATES_INTERVAL_SECONDS: 30 * 60
    },
    env_production: {
      NODE_ENV: 'production',
      ETHEREUM_FUND_MANAGER_CONTRACT_ADDRESS: '0xCa3187F301920877795EfD16B5f920aABC7a9cC2',
      ETHEREUM_ADMIN_ACCOUNT: '0x637F5E3A1E40bc5aaa8eADf7CC5e1C6D9120B49a',
      ETHEREUM_ADMIN_PRIVATE_KEY: 'C721ABE244F3C55B3CA8F7395F3D1EFE97ED8BED200C235DC2F3FCD9873ACCE3',
      INFURA_ENDPOINT_URL: "https://mainnet.infura.io/v3/c52a3970da0a47978bee0fe7988b67b6",
      CMC_PRO_API_KEY: "553ca912-5740-4550-88f1-ad68fdbb1592",
      AUTOMATIC_SUPPLY_BALANCING_ENABLED: 1,
      AUTOMATIC_SUPPLY_BALANCING_MIN_ALGORITHMIC_NET_VALUE: 1000000, // The minimum algorithmic net value of an automatic supply rebalancing required to actually execute it (algorithmic net value of a rebalancing = additional yearly interest in USD expected from the rebalancing * seconds since last rebalancing / maximum possible Ethereum gas fees in USD required for the rebalancing)
      WITHDRAWAL_QUEUE_ENABLED: 1,
      UPDATE_CURRENCY_USD_RATES_INTERVAL_SECONDS: 30 * 60
    }
  }],

  deploy : {
    production : {
      user : 'node',
      host : '212.83.163.1',
      ref  : 'origin/master',
      repo : 'git@github.com:repo.git',
      path : '/var/www/production',
      'post-deploy' : 'npm install && pm2 reload ecosystem.config.js --env production'
    }
  }
};
