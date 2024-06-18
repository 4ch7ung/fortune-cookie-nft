import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, Cell, CommonMessageInfoInternal, beginCell, contractAddress, toNano } from '@ton/core';
import { FortuneCookieNftCollection } from '../wrappers/FortuneCookieNftCollection';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { FortuneCookieCollectionMintItemInput, FortuneCookieNftCollectionData, OperationCodes } from '../wrappers/FortuneCookieNftCollection.data';
import { pseudoRandomBytes } from 'crypto';

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

enum Errors {
    BatchLimit = 399,
    NotAuthorized = 400,
    NotOwner = 401,
    IndexOutOfRange = 402,
    BoundsMismatch = 554,
    UnknownOp = 0xffff
};

describe('FortuneCookieNftCollection', () => {
    let collectionCode: Cell;
    let itemCode: Cell;
    
    beforeAll(async () => {
        collectionCode = await compile('FortuneCookieNftCollection');
        itemCode = await compile('FortuneCookieNftItem');
    });
    
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let owner: SandboxContract<TreasuryContract>;
    let collection: SandboxContract<FortuneCookieNftCollection>;
    
    let config: FortuneCookieNftCollectionData;
    
    beforeEach(async () => {
        blockchain = await Blockchain.create();
        
        deployer = await blockchain.treasury('deployer');
        owner = await blockchain.treasury('owner');
        
        config = defaultConfig(owner.address, owner.address, itemCode);
        
        collection = blockchain.openContract(
            FortuneCookieNftCollection.createFromConfig(config, collectionCode)
        );
        
        const deployResult = await collection.sendDeploy(deployer.getSender(), toNano(0.06));
        
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: collection.address,
            deploy: true,
            success: true,
        });
    });
    
    describe('public getters', () => {
        it('should return collection data', async () => {
            
            // when
            
            const res = await collection.getCollectionData();
            
            // then
            
            expect(res.nextItemId).toEqual(config.nextItemIndex);
            expect(res.collectionContent).toEqual(config.collectionContent);
            expect(res.ownerAddress).toEqualAddress(config.ownerAddress);
        })
        
        it('should return nft content', async () => {
            
            // given
            
            const nftContent = beginCell()
                .storeBuffer(Buffer.from('1'))
                .endCell();
            
            // when
            
            const res = await collection.getNftContent(0, nftContent);
            
            // then
            
            expect(res).toEqual(config.commonContent + '1');
        })
        
        it('should return nft address by index', async () => {
            
            // given
            
            const index = 77;
            const res = await collection.getNftAddressByIndex(index);
            // Basic nft item data
            const nftItemData = beginCell()
                .storeUint(index, 64)
                .storeAddress(collection.address)
                .endCell();
            
            // when
            
            const expectedAddress = contractAddress(0, { code: config.nftItemCode, data: nftItemData });
            
            // then
            
            expect(res).toEqualAddress(expectedAddress);
        })
        
        it('should return royalty params', async () => {
            
            // when
            
            const res = await collection.getRoyaltyParams();
            
            // then
            
            expect(res.royaltyBase).toEqual(config.royaltyParams.royaltyBase);
            expect(res.royaltyFactor).toEqual(config.royaltyParams.royaltyFactor);
            expect(res.royaltyAddress).toEqualAddress(config.royaltyParams.royaltyAddress);
        });
    });
    
    describe('deployment', () => {
        it('should deploy nft with MintNext method called by minter', async () => {
            
            // given
            
            const passAmount = toNano(0.5);
            const { nextItemId } = await collection.getCollectionData();
            const minterWallet = await blockchain.treasury('minter');

            // Basic nft item data
            const nftItemData = beginCell()
                .storeUint(nextItemId, 64)
                .storeAddress(collection.address)
                .endCell();
            const nftItemAddress = contractAddress(0, { code: config.nftItemCode, data: nftItemData });
            
            // when

            await collection.sendChangeMinter(owner.getSender(), minterWallet.address);
            
            const res = await collection.sendMintNext(
                minterWallet.getSender(),
                {
                    queryId: 0,
                    itemInput: {
                        passAmount: passAmount,
                        ownerAddress: owner.address,
                        lowerBound: 0,
                        upperBound: 100,
                        content: 'test_content'
                    }
                }
            );

            const { nextItemId: newNextItemId } = await collection.getCollectionData();
            
            // then
            
            expect(res.transactions).toHaveTransaction({
                from: minterWallet.address,
                to: collection.address,
                deploy: false,
                success: true,
            });
            
            expect(res.transactions).toHaveTransaction({
                from: collection.address,
                to: nftItemAddress,
                deploy: true,
                value: passAmount,
                success: true,
            });
            
            // As a result of mint query, collection contract should send stateInit message to NFT item contract
            const initTransaction = res.transactions.find((v, i, a) => {
                return v.inMessage?.info.type == 'internal' && (v.inMessage?.info.dest as Address).equals(nftItemAddress);
            });
            
            expect(initTransaction).toBeDefined();
            
            expect(initTransaction?.inMessage?.init?.code ?? Cell.EMPTY).toEqualCell(config.nftItemCode);
            expect(initTransaction?.inMessage?.init?.data ?? Cell.EMPTY).toEqualCell(nftItemData);

            expect(newNextItemId).toEqual(nextItemId + 1);
        });

        it('should deploy new nft', async () => {
            
            // given
            
            const itemIndex = 1;
            const passAmount = toNano(0.5);
            // Basic nft item data
            const nftItemData = beginCell()
                .storeUint(itemIndex, 64)
                .storeAddress(collection.address)
                .endCell();
            const nftItemAddress = contractAddress(0, { code: config.nftItemCode, data: nftItemData });
            
            // when
            
            const res = await collection.sendDeployNewNft(
                owner.getSender(),
                {
                    queryId: 0,
                    itemInput: {
                        passAmount: passAmount,
                        index: itemIndex,
                        ownerAddress: owner.address,
                        lowerBound: 0,
                        upperBound: 100,
                        content: 'test_content'
                    }
                }
            );
            
            // then
            
            expect(res.transactions).toHaveTransaction({
                from: owner.address,
                to: collection.address,
                deploy: false,
                success: true,
            });
            
            expect(res.transactions).toHaveTransaction({
                from: collection.address,
                to: nftItemAddress,
                deploy: true,
                value: passAmount,
                success: true,
            });
            
            // As a result of mint query, collection contract should send stateInit message to NFT item contract
            const initTransaction = res.transactions.find((v, i, a) => {
                return v.inMessage?.info.type == 'internal' && (v.inMessage?.info.dest as Address).equals(nftItemAddress);
            });
            
            expect(initTransaction).toBeDefined();
            
            expect(initTransaction?.inMessage?.init?.code ?? Cell.EMPTY).toEqualCell(config.nftItemCode);
            expect(initTransaction?.inMessage?.init?.data ?? Cell.EMPTY).toEqualCell(nftItemData);  
        });
        
        it('should batch deploy nfts', async () => {
            
            // given 
            
            const items: FortuneCookieCollectionMintItemInput[] = [
                {
                    passAmount: toNano(0.5),
                    index: 0,
                    ownerAddress: new Address(0, pseudoRandomBytes(32)),
                    lowerBound: 0,
                    upperBound: 100,
                    content: '1'
                },
                {
                    passAmount: toNano(0.5),
                    index: 1,
                    ownerAddress: new Address(0, pseudoRandomBytes(32)),
                    lowerBound: 0,
                    upperBound: 100,
                    content: '2'
                },
            ]
            const nftItemData1 = beginCell()
            .storeUint(0, 64)
            .storeAddress(collection.address)
            .endCell();
            const nftItemData2 = beginCell()
            .storeUint(1, 64)
            .storeAddress(collection.address)
            .endCell();
            const nftItemAddress1 = contractAddress(0, { code: config.nftItemCode, data: nftItemData1 });
            const nftItemAddress2 = contractAddress(0, { code: config.nftItemCode, data: nftItemData2 });
            
            // when
            
            const res = await collection.sendBatchDeployNft(
                owner.getSender(),
                { items }
            )
            
            // then
            
            expect(res.transactions).toHaveTransaction({
                from: owner.address,
                to: collection.address,
                deploy: false,
                success: true,
            });
            
            expect(res.transactions).toHaveTransaction({
                from: collection.address,
                to: nftItemAddress1,
                deploy: true,
                success: true,
            });
            
            expect(res.transactions).toHaveTransaction({
                from: collection.address,
                to: nftItemAddress2,
                deploy: true,
                success: true,
            });
            
            const initTransaction1 = res.transactions.find((v, i, a) => {
                return v.inMessage?.info.type == 'internal' && (v.inMessage?.info.dest as Address).equals(nftItemAddress1);
            });
            const initTransaction2 = res.transactions.find((v, i, a) => {
                return v.inMessage?.info.type == 'internal' && (v.inMessage?.info.dest as Address).equals(nftItemAddress2);
            });
            
            expect(initTransaction1).toBeDefined();
            expect(initTransaction2).toBeDefined();
            
            expect(initTransaction1?.inMessage?.init?.code ?? Cell.EMPTY).toEqualCell(config.nftItemCode);
            expect(initTransaction1?.inMessage?.init?.data ?? Cell.EMPTY).toEqualCell(nftItemData1);
            expect(initTransaction2?.inMessage?.init?.code ?? Cell.EMPTY).toEqualCell(config.nftItemCode);
            expect(initTransaction2?.inMessage?.init?.data ?? Cell.EMPTY).toEqualCell(nftItemData2);
        })
        
        it('should deploy nft only if owner or minter calls', async () => {
            
            // given
            
            const itemIndex = 1;
            const randomAddress = await blockchain.treasury('random');
            
            // when
            
            const res = await collection.sendDeployNewNft(
                randomAddress.getSender(),
                {
                    queryId: 0,
                    itemInput: {
                        passAmount: toNano(0.5),
                        index: itemIndex,
                        ownerAddress: owner.address,
                        lowerBound: 0,
                        upperBound: 100,
                        content: 'test_content'
                    }
                }
            );
            
            // then
            
            expect(res.transactions).toHaveTransaction({
                from: randomAddress.address,
                to: collection.address,
                deploy: false,
                success: false,
                exitCode: Errors.NotAuthorized
            });
        })
    });
    
    it('should change owner and only owner can do so', async () => {
        
        // given
        
        const newOwner = await blockchain.treasury('newOwner');
        const randomWallet = await blockchain.treasury('randomWallet');
        
        // when
        
        const res = await collection.sendChangeOwner(randomWallet.getSender(), newOwner.address);
        const res2 = await collection.sendChangeOwner(owner.getSender(), newOwner.address);
        
        // then

        expect(res.transactions).toHaveTransaction({
            from: randomWallet.address,
            to: collection.address,
            deploy: false,
            success: false,
            exitCode: Errors.NotOwner
        });
        
        expect(res2.transactions).toHaveTransaction({
            from: owner.address,
            to: collection.address,
            deploy: false,
            success: true,
        });
                
        const data = await collection.getCollectionData();
        expect(data.ownerAddress).toEqualAddress(newOwner.address);
    });

    it('should change minter and only owner can do so', async () => {
        
        // given
        
        const newMinter = await blockchain.treasury('newMinter');
        const randomWallet = await blockchain.treasury('randomWallet');
        
        // when
        
        const res = await collection.sendChangeMinter(randomWallet.getSender(), newMinter.address);
        const res2 = await collection.sendChangeMinter(owner.getSender(), newMinter.address);
        const res3 = await collection.sendChangeMinter(newMinter.getSender(), randomWallet.address);
        
        // then
        
        expect(res.transactions).toHaveTransaction({
            from: randomWallet.address,
            to: collection.address,
            success: false,
            exitCode: Errors.NotOwner
        });
        
        expect(res2.transactions).toHaveTransaction({
            from: owner.address,
            to: collection.address,
            success: true,
        });

        expect(res3.transactions).toHaveTransaction({
            from: newMinter.address,
            to: collection.address,
            success: false,
            exitCode: Errors.NotOwner
        });
    });

    it('should send royalty params', async () => {
        
        // given
        
        const senderWallet = await blockchain.treasury('sender');
        
        // when
        
        const res = await collection.sendGetRoyaltyParams(senderWallet.getSender());
        
        // then
        
        expect(res.transactions).toHaveTransaction({
            from: senderWallet.address,
            to: collection.address,
            deploy: false,
            success: true,
        });
        
        expect(res.transactions).toHaveTransaction({
            from: collection.address,
            to: senderWallet.address,
            deploy: false,
            success: true,
        });
        
        let responseMessage = res.transactions.find((v, i, a) => { 
            return v.inMessage?.info.type == 'internal' && v.inMessage?.info.src.equals(collection.address);
        });
        
        responseMessage = responseMessage!;
        
        expect((responseMessage.inMessage?.info as CommonMessageInfoInternal).dest).toEqualAddress(senderWallet.address);
        const response = responseMessage.inMessage?.body.beginParse();
        
        const op = response?.loadUint(32);
        const queryId = response?.loadUint(64);
        const royaltyFactor = response?.loadUint(16);
        const royaltyBase = response?.loadUint(16);
        const royaltyAddress = response?.loadAddress();
        
        expect(op).toEqual(OperationCodes.GetRoyaltyParamsResponse);
        expect(queryId).toEqual(0);
        expect(royaltyFactor).toEqual(config.royaltyParams.royaltyFactor);
        expect(royaltyBase).toEqual(config.royaltyParams.royaltyBase);
        expect(royaltyAddress).toEqualAddress(config.royaltyParams.royaltyAddress);
    });
});
