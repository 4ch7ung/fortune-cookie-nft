import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, Cell, beginCell, contractAddress, toNano } from '@ton/core';
import { FortuneCookieNftCollection } from '../wrappers/FortuneCookieNftCollection';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { FortuneCookieNftCollectionData } from '../wrappers/FortuneCookieNftCollection.data';
import { FortuneCookieMinter, MintCollection } from '../wrappers/FortuneCookieMinter';
import { FortuneCookieNftItem } from '../wrappers/FortuneCookieNftItem';

type CollectionConfigFactory = (ownerAddress: Address, royaltyAddress: Address, nftItemCode: Cell) => FortuneCookieNftCollectionData
const defaultConfig: CollectionConfigFactory = (ownerAddress, royaltyAddress, nftItemCode) => {
  return {
    ownerAddress,
    nextItemIndex: 777,
    collectionContent: 'collection_content',
    commonContent: 'common_content',
    nftItemCode,
    royaltyParams: {
      royaltyFactor: 100,
      royaltyBase: 200,
      royaltyAddress
    },
    minterAddress: ownerAddress
  };
};

const passValue = toNano(0.1);
const mintConfigs = {
  a: {
    price: toNano(1),
    lowerBound: 1,
    upperBound: 100,
    content: 'contentA.json'
  },
  b: {
    price: toNano(2),
    lowerBound: 1,
    upperBound: 200,
    content: 'contentB.json'
  },
  c: {
    price: toNano(5),
    lowerBound: 201,
    upperBound: 300,
    content: 'contentC.json'
  },
  d: {
    price: toNano(10),
    lowerBound: 301,
    upperBound: 400,
    content: 'contentD.json'
  }
}

describe('FortuneCookieNftCollection', () => {
  let collectionCode: Cell;
  let itemCode: Cell;
  let minterCode: Cell;
  
  beforeAll(async () => {
      collectionCode = await compile('FortuneCookieNftCollection');
      itemCode = await compile('FortuneCookieNftItem');
      minterCode = await compile('FortuneCookieMinter');
  });
  
  let blockchain: Blockchain;
  let deployerWallet: SandboxContract<TreasuryContract>;
  let ownerWallet: SandboxContract<TreasuryContract>;
  let minter: SandboxContract<FortuneCookieMinter>;
  let collection: SandboxContract<FortuneCookieNftCollection>;
  
  let config: FortuneCookieNftCollectionData;
  
  beforeEach(async () => {
      blockchain = await Blockchain.create();
      
      deployerWallet = await blockchain.treasury('deployer');
      ownerWallet = await blockchain.treasury('owner');
      
      // deploy collection

      config = defaultConfig(ownerWallet.address, ownerWallet.address, itemCode);
      
      collection = blockchain.openContract(
          FortuneCookieNftCollection.createFromConfig(config, collectionCode)
      );
      
      const deployResult = await collection.sendDeploy(deployerWallet.getSender(), toNano(0.06));
      
      expect(deployResult.transactions).toHaveTransaction({
          from: deployerWallet.address,
          to: collection.address,
          deploy: true,
          success: true,
      });

      // deploy minter

      minter = blockchain.openContract(
          FortuneCookieMinter.createFromConfig({
            ownerAddress: ownerWallet.address,
            collectionAddress: collection.address,
            passValue: passValue,
            mintConfigA: mintConfigs.a,
            mintConfigB: mintConfigs.b,
            mintConfigC: mintConfigs.c,
            mintConfigD: mintConfigs.d
          }, minterCode)
      );

      const minterDeployResult = await minter.sendDeploy(ownerWallet.getSender(), toNano(0.05));

      expect(minterDeployResult.transactions).toHaveTransaction({
          from: ownerWallet.address,
          to: minter.address,
          deploy: true,
          success: true,
      });

      // setup collection to accept minter

      const setMinterResult = await collection.sendChangeMinter(ownerWallet.getSender(), minter.address);

      expect(setMinterResult.transactions).toHaveTransaction({
          from: ownerWallet.address,
          to: collection.address,
          success: true,
      });
  });

  it('should mint collection A item using minter', async () => {

    // given

    const queryId = 124;
    const { nextItemId } = await collection.getCollectionData();
    const randomWallet = await blockchain.treasury('random');
    // Basic nft item data
    const nftItemData = beginCell()
      .storeUint(nextItemId, 64)
      .storeAddress(collection.address)
      .endCell();
    const nftItemAddress = contractAddress(0, { code: config.nftItemCode, data: nftItemData });
    const { totalMintCollectionA } = await minter.getPrices();

    // when

    const mintResult = await minter.sendMintCollection(
      randomWallet.getSender(), 
      totalMintCollectionA,
      MintCollection.A,
      queryId
    );

    const { nextItemId: newNextItemId } = await collection.getCollectionData();

    const newNftContract = blockchain.openContract(new FortuneCookieNftItem(nftItemAddress));

    const nftData = await newNftContract.getNftData();
    
    // then

    expect(mintResult.transactions).toHaveTransaction({
        from: randomWallet.address,
        to: minter.address,
        success: true,
    });

    expect(mintResult.transactions).toHaveTransaction({
        from: minter.address,
        to: collection.address,
        success: true,
    });

    expect(mintResult.transactions).toHaveTransaction({
        from: collection.address,
        to: nftItemAddress,
        deploy: true,
        value: passValue,
        success: true,
    });

    expect(newNextItemId).toEqual(nextItemId + 1);

    expect(nftData.collectionAddress).toEqualAddress(collection.address);
    expect(nftData.index).toEqual(nextItemId);
    expect(nftData.initialized).toBeTruthy();
    expect(nftData.ownerAddress).toEqualAddress(randomWallet.address);
    expect(nftData.content).toEqual(mintConfigs.a.content);
  });
});