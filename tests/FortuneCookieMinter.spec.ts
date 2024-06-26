import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { MintCollection, FortuneCookieMinter } from '../wrappers/FortuneCookieMinter';
import { decodeOffChainContent } from '../utils/nftContentUtils';
import { OperationCodes } from '../wrappers/FortuneCookieNftCollection.data';

type MintConfig = {
  price: bigint,
  lowerBound: number,
  upperBound: number,
  content: string
}

describe('FortuneCookieMinter', () => {
  let minterCode: Cell;
  
  const passValue = toNano(0.1);
  const mintConfigs = {
    a: {
      price: toNano(0.1),
      lowerBound: 1,
      upperBound: 100,
      content: 'contentA'
    },
    b: {
      price: toNano(0.2),
      lowerBound: 101,
      upperBound: 200,
      content: 'contentB'
    },
    c: {
      price: toNano(0.3),
      lowerBound: 201,
      upperBound: 300,
      content: 'contentC'
    },
    d: {
      price: toNano(0.4),
      lowerBound: 301,
      upperBound: 400,
      content: 'contentD'
    }
  }
  
  beforeAll(async () => {
    minterCode = await compile('FortuneCookieMinter');
  });
  
  let blockchain: Blockchain;
  let minter: SandboxContract<FortuneCookieMinter>;
  let mockCollectionContract: SandboxContract<TreasuryContract>;
  let ownerWallet: SandboxContract<TreasuryContract>;
  let senderWallet: SandboxContract<TreasuryContract>;
  
  beforeEach(async () => {
    blockchain = await Blockchain.create();
    
    mockCollectionContract = await blockchain.treasury("mockCollectionContract");
    ownerWallet = await blockchain.treasury("ownerWallet");
    senderWallet = await blockchain.treasury("senderWallet");
    
    minter = blockchain.openContract(
      FortuneCookieMinter.createFromConfig({
        ownerAddress: ownerWallet.address,
        collectionAddress: mockCollectionContract.address,
        passValue: passValue,
        mintConfigA: mintConfigs.a,
        mintConfigB: mintConfigs.b,
        mintConfigC: mintConfigs.c,
        mintConfigD: mintConfigs.d
      }, minterCode)
    );
    
    await minter.sendDeploy(ownerWallet.getSender(), toNano(0.05));
  });

  it('should return owner address', async () => {
    
    // when 
    
    const ownerAddress = await minter.getOwnerAddress();
    
    // then
    
    expect(ownerAddress).toEqualAddress(ownerWallet.address);
  });
  
  it('should return price values', async () => {
    
    // when 
    
    const { 
      mintCollectionA, 
      mintCollectionB, 
      mintCollectionC, 
      mintCollectionD 
    } = await minter.getPrices();
    
    // then
    
    expect(mintCollectionA).toEqual(mintConfigs.a.price);
    expect(mintCollectionB).toEqual(mintConfigs.b.price);
    expect(mintCollectionC).toEqual(mintConfigs.c.price);
    expect(mintCollectionD).toEqual(mintConfigs.d.price);
  });

  it('should not accept fake op messages', async () => {
    // given
    const fakeOp = 0x12345678;
    
    // when 
    
    const fakeOpResult = await minter.sendFakeOpMessage(ownerWallet.getSender(), fakeOp);
    
    // then
    
    expect(fakeOpResult.transactions).toHaveTransaction({
      from: ownerWallet.address,
      to: minter.address,
      success: false,
      exitCode: 0xffff
    });
  });
  
  describe('profits', () => {
    it('should claim profits', async () => {
      
      // given
      
      const balanceBefore = await ownerWallet.getBalance();
      
      // when 
      
      await minter.sendDeploy(senderWallet.getSender(), toNano(1));
      
      const claimResult = await minter.sendCollectProfits(ownerWallet.getSender());
      
      // then
      
      expect(claimResult.transactions).toHaveTransaction({
        from: minter.address,
        to: ownerWallet.address,
        success: true
      });
      
      const balanceAfter = await ownerWallet.getBalance();
      
      expect(balanceAfter).toBeGreaterThanOrEqual(balanceBefore + toNano(0.95));
    });

    it('should not claim profits if no profits', async () => {
        // given

        minter = await blockchain.openContract(
          FortuneCookieMinter.createFromConfig({
            ownerAddress: ownerWallet.address,
            collectionAddress: mockCollectionContract.address,
            passValue: passValue,
            mintConfigA: mintConfigs.a,
            mintConfigB: mintConfigs.b,
            mintConfigC: mintConfigs.c,
            mintConfigD: mintConfigs.d
          }, minterCode)
        );
        
        // not enough to reclaim
        await minter.sendDeploy(ownerWallet.getSender(), toNano(0.01));
        await minter.sendCollectProfits(ownerWallet.getSender());

        const balanceBefore = await ownerWallet.getBalance();
        
        // when 
        
        const claimResult = await minter.sendCollectProfits(ownerWallet.getSender());
        
        // then
        
        expect(claimResult.transactions).toHaveTransaction({
          from: ownerWallet.address,
          to: minter.address,
          success: false,
          exitCode: 402
        });
        
        const balanceAfter = await ownerWallet.getBalance();
        
        expect(balanceAfter).toBeLessThanOrEqual(balanceBefore);
      });
  });
  
  describe('minting collections', () => {
    const mintAndCheck = async function (mintConfig: MintConfig, mintCollection: MintCollection) {
      // given
      
      const queryId = 100500;
      
      // when 
      
      const mintResult = await minter.sendMintCollection(
        senderWallet.getSender(), 
        mintConfig.price + passValue,
        mintCollection,
        queryId
      )
      
      // then
      
      expect(mintResult.transactions).toHaveTransaction({
        from: minter.address,
        to: mockCollectionContract.address,
        value: passValue + toNano(0.015),
      });
      
      let mintMessage = mintResult.transactions.find((v, i, a) => { 
        return v.inMessage?.info.type == 'internal' && v.inMessage?.info.src.equals(minter.address);
      });
      
      expect(mintMessage).toBeDefined();
      expect(mintMessage!.inMessage).toBeDefined();
      
      const data = mintMessage!.inMessage!.body.beginParse();
      
      // ;; deploy new nft with autoincremented index
      // ;; mint_next#50932698 query_id:uint64 value:Grams nft_init_message:^NftInitMessage = MintNextPayload;
      // ;; nft_init_message#_ owner_addr:MsgAddress lower_bound:uint32 upper_bound:uint32 content:^Cell = NftInitMessage;
      const op = data.loadUint(32);
      const resQueryId = data.loadUint(64);
      const resValue = data.loadCoins();
      const nftInitMessage = data.loadRef().beginParse();
      
      const ownerAddress = nftInitMessage.loadAddress();
      const lowerBound = nftInitMessage.loadUint(32);
      const upperBound = nftInitMessage.loadUint(32);
      const contentCell = nftInitMessage.loadRef();
      const content = decodeOffChainContent(contentCell);
      
      expect(op).toEqual(OperationCodes.MintNext);
      expect(resQueryId).toEqual(queryId);
      expect(resValue).toEqual(passValue);
      expect(ownerAddress).toEqualAddress(senderWallet.address);
      expect(lowerBound).toEqual(mintConfig.lowerBound);
      expect(upperBound).toEqual(mintConfig.upperBound);
      expect(content).toEqual(mintConfig.content);
    };
    
    it('should mint collection A', async () => {
      await mintAndCheck(mintConfigs.a, MintCollection.A);
    });
    
    it('should mint collection B', async () => {
      await mintAndCheck(mintConfigs.b, MintCollection.B);
    });
    
    it('should mint collection C', async () => {
      await mintAndCheck(mintConfigs.c, MintCollection.C);
    });
    
    it('should mint collection D', async () => {
      await mintAndCheck(mintConfigs.d, MintCollection.D);
    });
  });
});