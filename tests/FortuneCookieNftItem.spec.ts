import { Address, Cell, toNano } from "@ton/core";
import { Queries as CollectionQueries, FortuneCookieCollectionMintItemInput, FortuneCookieNftCollectionData } from "../wrappers/FortuneCookieNftCollection.data";
import { OperationCodes, Queries as ItemQueries } from "../wrappers/FortuneCookieNftItem.data";
import { FortuneCookieNftItem } from "../wrappers/FortuneCookieNftItem";
import { decodeOffChainContent } from "../utils/nftContentUtils";
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { FortuneCookieNftCollection } from '../wrappers/FortuneCookieNftCollection';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';


const defaultItemConfig = (ownerAddress: Address, collectionAddress: Address) => {
    return {
        index: 777,
        passAmount: toNano(0.05),
        collectionAddress,
        ownerAddress,
        lowerBound: 145,
        upperBound: 1024,
        unsealedValue: null,
        content: 'testA.json',
    };
};

enum Errors {
    NOT_OWNER = 401,
    INSUFFICIENT_BALANCE = 402,
    NOT_COLLECTION_ADDRESS = 405,
    ALREADY_UNSEALED = 406,
    UNKNOWN_OP = 0xffff
}

describe('FortuneCookieNftItem', () => {

    let itemCode: Cell;
    
    beforeAll(async () => {
        itemCode = await compile('FortuneCookieNftItem');
    });
    
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let owner: SandboxContract<TreasuryContract>;
    let fakeCollection: SandboxContract<TreasuryContract>;
    let nftItem: SandboxContract<FortuneCookieNftItem>;
    
    let nftItemConfig: FortuneCookieCollectionMintItemInput & { collectionAddress: Address, unsealedValue: number | null };
    
    beforeEach(async () => {
        blockchain = await Blockchain.create();
        
        deployer = await blockchain.treasury('deployer');
        owner = await blockchain.treasury('owner');
        fakeCollection = await blockchain.treasury('collection');
        
        nftItemConfig = defaultItemConfig(owner.address, fakeCollection.address);
        
        nftItem = blockchain.openContract(
            FortuneCookieNftItem.createFromConfig(nftItemConfig.index, nftItemConfig.collectionAddress, itemCode)
        );
        
        const deployResult = await nftItem.sendDeploy(
            fakeCollection.getSender(), 
            toNano(0.06),
            nftItemConfig
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: fakeCollection.address,
            to: nftItem.address,
            deploy: true,
            success: true,
        });
    });

    it('should return item data (initialized)', async () => {
        // when

        const result = await nftItem.getNftData();

        // then

        if (!result.initialized) {
            throw new Error();
        }
        expect(result.initialized).toBe(true);
        expect(result.index).toEqual(nftItemConfig.index);
        expect(result.collectionAddress).toEqualAddress(nftItemConfig.collectionAddress);
        expect(result.ownerAddress).toEqualAddress(nftItemConfig.ownerAddress);
        expect(result.content).toEqual(nftItemConfig.content);
    });

    it('should return item data (not initialized)', async () => {
        
        // given

        nftItem = blockchain.openContract(
            FortuneCookieNftItem.createFromConfig(nftItemConfig.index, deployer.address, itemCode)
        );

        const deployResult = await nftItem.sendTopUp(
            deployer.getSender(), 
            toNano(0.06)
        );

        // when

        const result = await nftItem.getNftData();

        // then

        expect(result.initialized).toBe(false);
        expect(result.index).toEqual(nftItemConfig.index);
        expect(result.collectionAddress).toEqualAddress(deployer.address);
        expect(result.ownerAddress).toBeUndefined();
        expect(result.content).toBeUndefined();
    });

    it('should fail to do anything if not initialized', async () => {
        
        // given

        nftItem = blockchain.openContract(
            FortuneCookieNftItem.createFromConfig(nftItemConfig.index, deployer.address, itemCode)
        );

        const deployResult = await nftItem.sendTopUp(
            deployer.getSender(), 
            toNano(0.06)
        );

        // when

        const sendResult = await nftItem.sendTransfer(
            owner.getSender(), 
            owner.address
        );

        const unsealResult = await nftItem.sendUnseal(
            owner.getSender()
        );

        const sendResult2 = await nftItem.sendTransfer(
            deployer.getSender(),
            owner.address
        );

        // then

        expect(sendResult.transactions).toHaveTransaction({
            from: owner.address,
            to: nftItem.address,
            success: false,
            exitCode: Errors.NOT_COLLECTION_ADDRESS,
        });

        expect(unsealResult.transactions).toHaveTransaction({
            from: owner.address,
            to: nftItem.address,
            success: false,
            exitCode: Errors.NOT_COLLECTION_ADDRESS,
        });

        // probably will fail to decode the message, maybe will have rubbish in data
        // but anyway, it should not happen in real life
        expect(sendResult2.transactions).toHaveTransaction({
            from: deployer.address,
            to: nftItem.address,
            success: false,
            exitCode: 9, 
        });
    });

    it('should transfer', async () => {
        
        // given

        const newOwner = await blockchain.treasury('newOwner');

        // when

        const sendResult = await nftItem.sendTransfer(
            owner.getSender(), 
            newOwner.address
        );

        // then

        expect(sendResult.transactions).toHaveTransaction({
            from: owner.address,
            to: nftItem.address,
            success: true,
        });

        const data = await nftItem.getNftData();
        if (!data.initialized) {
            throw new Error();
        }

        expect(data.ownerAddress).toEqualAddress(newOwner.address);
    });

    it('should not transfer when called from non-owner', async () => {
        
        // given

        const newOwner = await blockchain.treasury('newOwner');

        // when

        const sendResult = await nftItem.sendTransfer(
            newOwner.getSender(), 
            newOwner.address
        );

        // then

        expect(sendResult.transactions).toHaveTransaction({
            from: newOwner.address,
            to: nftItem.address,
            success: false,
            exitCode: Errors.NOT_OWNER,
        });
    });

    it('should unseal', async () => {
        
        // given

        const oldNumber = await nftItem.getLuckyValue();
        
        // when

        const sendResult = await nftItem.sendUnseal(
            owner.getSender()
        );

        // then

        expect(sendResult.transactions).toHaveTransaction({
            from: owner.address,
            to: nftItem.address,
            success: true,
        });

        const newNumber = await nftItem.getLuckyValue();
        
        expect(oldNumber).toEqual(0);
        expect(oldNumber).not.toEqual(newNumber);
        expect(newNumber).toBeGreaterThanOrEqual(nftItemConfig.lowerBound);
        expect(newNumber).toBeLessThanOrEqual(nftItemConfig.upperBound);
        
        const newExpectedContent = nftItemConfig.content.replace('A.json', newNumber.toString(10) + '.json')
        
        const data = await nftItem.getNftData();
        if (!data.initialized) {
            throw new Error();
        }

        expect(data.content).toEqual(newExpectedContent);
    })

    it('should not unseal if already unsealed', async () => {
        
        // given

        await nftItem.sendUnseal(owner.getSender());
        
        // when

        const sendResult = await nftItem.sendUnseal(
            owner.getSender()
        );

        // then

        expect(sendResult.transactions).toHaveTransaction({
            from: owner.address,
            to: nftItem.address,
            success: false,
            exitCode: Errors.ALREADY_UNSEALED,
        });
    });

    it('should not unseal from non-owner', async () => {
        
        // given

        const newOwner = await blockchain.treasury('newOwner');
        
        // when

        const sendResult = await nftItem.sendUnseal(
            newOwner.getSender()
        );

        // then

        expect(sendResult.transactions).toHaveTransaction({
            from: newOwner.address,
            to: nftItem.address,
            success: false,
            exitCode: Errors.NOT_OWNER,
        });
    });

    it('should return static data to anyone', async () => {

        // given

        const sender = await blockchain.treasury('sender');
        const queryId = 123;
        
        // when

        const sendResult = await nftItem.sendGetStaticData(
            sender.getSender(),
            queryId
        );

        // then

        expect(sendResult.transactions).toHaveTransaction({
            from: sender.address,
            to: nftItem.address,
            success: true,
        });

        expect(sendResult.transactions).toHaveTransaction({
            from: nftItem.address,
            to: sender.address,
            success: true,
        });

        let responseMessage = sendResult.transactions.find((v, i, a) => { 
            return v.inMessage?.info.type == 'internal' && v.inMessage?.info.src.equals(nftItem.address);
        });

        expect(responseMessage).toBeDefined();
        expect(responseMessage!.inMessage).toBeDefined();

        responseMessage = responseMessage!;

        const data = responseMessage.inMessage!.body.beginParse();

        const op = data.loadUint(32);
        const resQueryId = data.loadUint(64);
        const index = data.loadUint(256);
        const collectionAddress = data.loadAddress();

        expect(op).toEqual(OperationCodes.getStaticDataResponse);
        expect(resQueryId).toEqual(queryId);
        expect(index).toEqual(nftItemConfig.index);
        expect(collectionAddress).toEqualAddress(nftItemConfig.collectionAddress);
    });
});