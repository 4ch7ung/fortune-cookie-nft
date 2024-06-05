import { Address, Cell, address, toNano } from '@ton/core';
import { FortuneCookieNftCollection } from '../wrappers/FortuneCookieNftCollection';
import { compile, NetworkProvider } from '@ton/blueprint';
import dotenv from "dotenv";
import { FortuneCookieNftCollectionData } from '../wrappers/FortuneCookieNftCollection.data';
dotenv.config();

export async function run(provider: NetworkProvider) {
    
    const isTestnet = process.env.TESTNET;
    const deployConfig = isTestnet ? testnetConfig : mainnetConfig;
    
    const collectionCode = await compile('FortuneCookieNftCollection');
    const itemCode = await compile('FortuneCookieNftItem');
    
    const config = deployConfig.fortuneCookieConfig(itemCode);
    
    const randomTicketNftCollection = provider.open(
        FortuneCookieNftCollection.createFromConfig(config, collectionCode)
    );
    
    await randomTicketNftCollection.sendDeploy(provider.sender(), toNano(0.06));
    
    await provider.waitForDeploy(randomTicketNftCollection.address, 20, 2000);
    
    // run methods on `randomTicketNftCollection`
}

type DeployConfig = {
    ownerAddress: Address;
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
            }
        }
    }
}