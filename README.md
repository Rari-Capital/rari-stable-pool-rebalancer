# Rari Stable Pool: Rebalancer

Welcome to `rari-stable-pool-rebalancer`, our repository for the JavaScript source code behind the centralized rebalancer powering the Rari Stable Pool smart contracts and dApp in our `rari-contracts` repo.

## Installation

You'll want to run the script on the latest Node.js LTS (tested with v12.18.2) with the latest version of NPM.

Install PM2 (process manager) globally: `npm i -g pm2`

`npm i` or `npm install`

## Usage

Configure your environment in `ecosystem.config.js`.

Start the rebalancer with PM2: `pm2 start ecosystem.config.js` (for production usage, add `--env production`)

Stop with PM2: `pm2 stop ecosystem.config.js`

Check process status with PM2: `pm2 list`

Find PM2 logs in `~/.pm2/logs`.

## Development

To compile the TypeScript files: `npm run build`

## Credits

Rari Capital's smart contracts are developed by [David Lucid](https://github.com/davidlucid) of David Lucid LLC.
