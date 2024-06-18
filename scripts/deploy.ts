import { Address, Cell, address, toNano } from '@ton/core';
import { FortuneCookieNftCollection } from '../wrappers/FortuneCookieNftCollection';
import { compile, NetworkProvider } from '@ton/blueprint';
import dotenv from "dotenv";
import { FortuneCookieNftCollectionData } from '../wrappers/FortuneCookieNftCollection.data';
import { FortuneCookieMintConfig, FortuneCookieMinter } from '../wrappers/FortuneCookieMinter';
dotenv.config();

export async function run(provider: NetworkProvider) {
    
    const isTestnet = process.env.TESTNET;

    console.log(`---- Deploying on ${isTestnet ? 'testnet' : 'mainnet'}`);

    const deployConfig = isTestnet ? testnetConfig : mainnetConfig;

    console.log(`---- Compiling contracts`);
    
    const collectionCode = await compile('FortuneCookieNftCollection');
    const itemCode = await compile('FortuneCookieNftItem');
    const minterCode = await compile('FortuneCookieMinter');
    
    const config = deployConfig.fortuneCookieConfig(itemCode);
    
    const fortuneCookieNftCollection = provider.open(
        FortuneCookieNftCollection.createFromConfig(config, collectionCode)
    );

    console.log(`---- Deploying collection contract`);

    const collectionDeployed = await provider.isContractDeployed(fortuneCookieNftCollection.address);
    if(!collectionDeployed) {
        await fortuneCookieNftCollection.sendDeploy(provider.sender(), toNano(0.05));    
    } else {
        console.log(`---- Collection contract already deployed`);
    }
    
    await provider.waitForDeploy(fortuneCookieNftCollection.address, 20, 2000);

    const minterConfig = deployConfig.minterConfig;

    const minterContract = provider.open(
        FortuneCookieMinter.createFromConfig({
          ownerAddress: config.ownerAddress,
          collectionAddress: fortuneCookieNftCollection.address,
          passValue: minterConfig.passValue,
          mintConfigA: minterConfig.mintConfigs.a,
          mintConfigB: minterConfig.mintConfigs.b,
          mintConfigC: minterConfig.mintConfigs.c,
          mintConfigD: minterConfig.mintConfigs.d
        }, minterCode)
    );

    console.log(`---- Deploying minter contract`);

    const minterDeployed = await provider.isContractDeployed(minterContract.address);
    if(!minterDeployed) {
        await minterContract.sendDeploy(provider.sender(), toNano(0.05));
    } else {
        console.log(`---- Minter contract already deployed`);
    }

    await provider.waitForDeploy(minterContract.address, 20, 2000);

    // setup collection to accept minter

    console.log(`---- Setting minter address in collection contract`);

    const currentMinter = await fortuneCookieNftCollection.getMinterAddress();

    if (!currentMinter.equals(minterContract.address)) {
        await fortuneCookieNftCollection.sendChangeMinter(provider.sender(), minterContract.address);
    } else {
        console.log(`---- Minter address already set in collection contract`);
    }

    console.log(`---- Deployment script finished`);
}

type DeployConfig = {
    ownerAddress: Address;
    minterConfig: {
        passValue: bigint;
        mintConfigs: {
            a: FortuneCookieMintConfig;
            b: FortuneCookieMintConfig;
            c: FortuneCookieMintConfig;
            d: FortuneCookieMintConfig;
        };
    }
    fortuneCookieConfig: (itemCode: Cell) => FortuneCookieNftCollectionData;
}

const testnetConfig: DeployConfig = {
    ownerAddress: address("kQAomCdjy5XAE7u1HP294s6rL3suN4B_sPu3Hbx06OgNWqzH"),
    fortuneCookieConfig: (itemCode: Cell) => {
        return {
            ownerAddress: address("kQAomCdjy5XAE7u1HP294s6rL3suN4B_sPu3Hbx06OgNWqzH"),
            nextItemIndex: 0,
            collectionContent: 'https://4ch7ung.github.io/fortune-cookie-nft/collectionCover.json',
            commonContent: 'https://4ch7ung.github.io/fortune-cookie-nft/',
            nftItemCode: itemCode,
            royaltyParams: {
                royaltyFactor: 0,
                royaltyBase: 0,
                royaltyAddress: address("kQAomCdjy5XAE7u1HP294s6rL3suN4B_sPu3Hbx06OgNWqzH"),
            },
            minterAddress: address("kQAomCdjy5XAE7u1HP294s6rL3suN4B_sPu3Hbx06OgNWqzH"),
        }
    },
    minterConfig: {
        passValue: toNano(0.05),
        mintConfigs: {
            a: {
                price: toNano(0.1),
                lowerBound: 1,
                upperBound: 100,
                content: 'A.json'
              },
              b: {
                price: toNano(0.2),
                lowerBound: 1,
                upperBound: 200,
                content: 'B.json'
              },
              c: {
                price: toNano(0.5),
                lowerBound: 201,
                upperBound: 300,
                content: 'C.json'
              },
              d: {
                price: toNano(1),
                lowerBound: 301,
                upperBound: 400,
                content: 'D.json'
              }
        }
    }
}

const mainnetConfig: DeployConfig = {
    ownerAddress: address("UQC_XWPfH4SgkIj3E59IdcPYIm8bVzWnhmgVEDVpzkFt3GhT"),
    fortuneCookieConfig: (itemCode: Cell) => {
        return {
            ownerAddress: address("UQC_XWPfH4SgkIj3E59IdcPYIm8bVzWnhmgVEDVpzkFt3GhT"),
            nextItemIndex: 0,
            collectionContent: 'https://4ch7ung.github.io/fortune-cookie-nft/collectionCover.json',
            commonContent: 'https://4ch7ung.github.io/fortune-cookie-nft/',
            nftItemCode: itemCode,
            royaltyParams: {
                royaltyFactor: 5,
                royaltyBase: 10,
                royaltyAddress: address("UQC_XWPfH4SgkIj3E59IdcPYIm8bVzWnhmgVEDVpzkFt3GhT"),
            },
            minterAddress: address("UQC_XWPfH4SgkIj3E59IdcPYIm8bVzWnhmgVEDVpzkFt3GhT"),
        }
    },
    minterConfig: {
        passValue: toNano(0.05),
        mintConfigs: {
            a: {
                price: toNano(1),
                lowerBound: 1,
                upperBound: 100,
                content: 'A.json'
              },
              b: {
                price: toNano(2),
                lowerBound: 1,
                upperBound: 200,
                content: 'B.json'
              },
              c: {
                price: toNano(5),
                lowerBound: 201,
                upperBound: 300,
                content: 'C.json'
              },
              d: {
                price: toNano(10),
                lowerBound: 301,
                upperBound: 400,
                content: 'D.json'
              }
        }
    }
}